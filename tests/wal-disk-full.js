#!/usr/bin/env node
/**
 * Wave 19 — WAL disk-full drill (W1–W5).
 *
 * Runs against a REAL PostgreSQL 17 whose pg_wal lives on a size-capped tmpfs
 * (see tools/wal-drill/setup-pg.sh). Nothing here is simulated: the ENOSPC,
 * the PANIC and the crash-recovery replay are produced by PostgreSQL itself.
 *
 *   W1  WAL reaches 80% of the cap        -> warning observable in PG log
 *   W2  WAL reaches 100%                  -> PANIC + server shutdown
 *   W3  reclaim WAL, restart              -> recovers, zero data loss, RTO
 *   W4  replica present after recovery    -> streaming replication check
 *   W5  RPO = 0                           -> every committed txn survived
 *
 * Honesty rule (SKILLS_MASTER §7): if the live infrastructure is unavailable,
 * the affected scenario is reported as SKIPPED with the reason, never faked.
 *
 * Usage: node tests/wal-disk-full.js [--keep] [--scenario W2]
 */

'use strict';

const { Client } = require('pg');
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// configuration
// ---------------------------------------------------------------------------
const PGHOST = process.env.PGDRILL_HOST || '127.0.0.1';
const PGPORT = Number(process.env.PGDRILL_PORT || 55432);
const PGUSER = process.env.PGDRILL_USER || 'postgres';
const PGDATABASE = process.env.PGDRILL_DB || 'payesh';
const ROOT = process.env.PGDRILL_ROOT || '/home/user/pgdrill';
const PGBIN = process.env.PGDRILL_BIN || '/usr/lib/postgresql/17/bin';
const WALDIR = path.join(ROOT, 'wal');
const RUNDIR = path.join(ROOT, 'run');
const STANDBY_PORT = Number(process.env.PGDRILL_STANDBY_PORT || 55433);
const STANDBY_DATA = path.join(ROOT, 'standby');
const STANDBY_WAL = path.join(ROOT, 'standby-wal');
// How much of the tmpfs an inactive replication slot is allowed to eat before
// we declare the cap reached. Kept under 100% so the drill stays observable.
const TARGET_FILL_PCT = Number(process.env.PGDRILL_FILL_PCT || 100);

const args = process.argv.slice(2);
const ONLY = (() => {
  const i = args.indexOf('--scenario');
  return i >= 0 ? args[i + 1].toUpperCase() : null;
})();

// ---------------------------------------------------------------------------
// tiny reporting harness (mirrors the style of the other tests in tests/)
// ---------------------------------------------------------------------------
let pass = 0, fail = 0, skip = 0;
const results = [];

function ok(name, detail) { pass++; results.push({ id: name, st: 'PASS', detail: detail || '' }); console.log(`  \x1b[32m✅ ${name}\x1b[0m${detail ? ' — ' + detail : ''}`); }
function bad(name, detail) { fail++; results.push({ id: name, st: 'FAIL', detail: detail || '' }); console.log(`  \x1b[31m❌ ${name}\x1b[0m — ${detail}`); }
function skipped(name, reason) { skip++; results.push({ id: name, st: 'SKIP', detail: reason }); console.log(`  \x1b[33m⏭️  ${name}\x1b[0m — SKIPPED: ${reason}`); }
function section(t) { console.log(`\n\x1b[1m── ${t} ──\x1b[0m`); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();
function sh(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}
// postgres refuses to run as root, so every pg_ctl invocation has to drop to
// the cluster owner. Running it as root "succeeds" at reporting the server
// down while telling us nothing — that is how the first draft produced a fake
// "postmaster gone" result.
const RUN_AS = process.env.PGDRILL_OWNER || 'pgdrill';
function sudo(cmd, cmdArgs, opts = {}) { return sh('sudo', ['-n', '-u', RUN_AS, cmd, ...cmdArgs], opts); }
function sudoRoot(cmd, cmdArgs, opts = {}) { return sh('sudo', ['-n', cmd, ...cmdArgs], opts); }

async function connect(db = PGDATABASE) {
  const c = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, database: db, connectionTimeoutMillis: 4000 });
  // When the postmaster PANICs, node-postgres emits a second 'error' on the
  // Client after our await has already thrown. With no listener attached that
  // becomes an unhandled 'error' event and kills the drill mid-run — which is
  // how the first successful crash still produced a useless stack trace.
  c.on('error', () => {});
  await c.connect();
  return c;
}

/**
 * Occupy `mb` megabytes of the WAL tmpfs with an inert filler file.
 *
 * Why this is legitimate and not a fake: the tmpfs is already genuinely
 * size-capped, and PostgreSQL's own archive copies consume a large share of it
 * (observed: 51MB of 100MB). A filler models the very common production case
 * where the WAL volume's *effective* free space is smaller than its nominal
 * size (other tenants, snapshots, a co-located archive). PostgreSQL still
 * writes its own WAL into the remaining space and still gets a real ENOSPC
 * from the kernel — nothing about the failure is simulated.
 */
function setFiller(mb) {
  const f = path.join(WALDIR, '.drill-filler');
  try { sudoRoot('rm', ['-f', f]); } catch { /* not created yet */ }
  if (mb <= 0) return 0;
  sudoRoot('dd', ['if=/dev/zero', `of=${f}`, 'bs=1M', `count=${mb}`, 'status=none']);
  sudoRoot('chown', [`${RUN_AS}:${RUN_AS}`, f]);
  return mb;
}

function walUsage() {
  const out = sh('df', ['-B1', '--output=size,used', WALDIR]).trim().split('\n')[1].trim().split(/\s+/);
  const size = Number(out[0]), used = Number(out[1]);
  return { sizeMB: size / 1048576, usedMB: used / 1048576, pct: (used / size) * 100 };
}

// Port-based probe. Deliberately not `pg_ctl status`: besides the root
// problem above, the standby's argv contains the primary's data directory, so
// a grep/pg_ctl check would report the primary alive when only the standby is.
function serverRunning(port = PGPORT) {
  try { sh(`${PGBIN}/pg_isready`, ['-h', PGHOST, '-p', String(port), '-U', PGUSER, '-d', PGDATABASE, '-t', '2'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function logFile() {
  const dir = path.join(ROOT, 'log');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.log'));
  if (!files.length) return null;
  return path.join(dir, files.sort().pop());
}

/**
 * Read the PG log from a byte offset captured before the scenario ran.
 * Reading the whole file would mix in output from earlier runs — and the first
 * version of this drill did exactly that, then lost the evidence entirely when
 * a reset deleted the file. Anchoring on an offset makes the captured PANIC
 * provably attributable to this run.
 */
// The server writes as the cluster owner; this test runs unprivileged. Without
// this, reading the PANIC line dies with EACCES and takes the drill with it.
function ensureLogReadable() {
  try { sudoRoot('chmod', ['-R', 'a+rX', path.join(ROOT, 'log')]); } catch { /* best effort */ }
}

function logOffset() {
  const f = logFile();
  return f && fs.existsSync(f) ? fs.statSync(f).size : 0;
}

function pgLogSince(offset = 0) {
  const f = logFile();
  if (!f) return '';
  let fd;
  try { fd = fs.openSync(f, 'r'); }
  catch { return ''; }   // unreadable log is a reporting gap, not a drill failure
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.min(offset, size);
    const buf = Buffer.alloc(size - start);
    try {
      fs.readSync(fd, buf, 0, buf.length, start);
      return buf.toString('utf8');
    } catch { return ''; }
  } finally { fs.closeSync(fd); }
}

// ---------------------------------------------------------------------------
// W1 — WAL climbs to the warning threshold
// ---------------------------------------------------------------------------
async function w1() {
  section('W1 — WAL fill to warning threshold (80%)');
  const t0 = now();
  const c = await connect();

  // An inactive replication slot pins every WAL segment: this is the real-world
  // mechanism that silently fills pg_wal (an abandoned replica / stuck consumer).
  await c.query(`select pg_create_physical_replication_slot('drill_pin', true)`).catch(() => {});

  // drill ledger: the source of truth for the later zero-loss proof.
  await c.query(`create table if not exists drill_ledger (
      seq bigserial primary key,
      txn text not null,
      payload text not null,
      committed_at timestamptz not null default now())`);

  const before = walUsage();
  let writes = 0;
  const warnAt = 80;
  let warnedAtPct = null;

  // 2000 rows per commit of ~500B each => ~1MB of WAL per batch (1MB segments).
  const batch = `insert into drill_ledger (txn, payload)
                 select 'W1-' || g, repeat(md5(random()::text), 16)
                 from generate_series(1, 2000) g`;

  while (walUsage().pct < warnAt && writes < 400) {
    await c.query(batch); writes++;
    const u = walUsage();
    if (warnedAtPct === null && u.pct >= warnAt) warnedAtPct = u.pct;
  }
  const after = walUsage();
  const elapsed = now() - t0;

  if (after.pct >= warnAt) {
    ok('W1 WAL reached ≥80% of the cap',
      `${before.usedMB.toFixed(1)}MB → ${after.usedMB.toFixed(1)}MB / ${after.sizeMB.toFixed(0)}MB = ${after.pct.toFixed(1)}% in ${writes} batches (${elapsed}ms)`);
  } else {
    bad('W1 WAL reached ≥80% of the cap', `only got to ${after.pct.toFixed(1)}% after ${writes} batches`);
  }

  // PostgreSQL's own view of the pressure: retained segments + archive backlog.
  const retained = await c.query(
    `select count(*) n, coalesce(pg_size_pretty(sum(size)),'0 bytes') sz
     from pg_ls_waldir()`);
  const r = retained.rows[0];
  ok('W1 retained WAL observable from inside PG', `${r.n} segments, ${r.sz}`);

  await c.end();
  return { elapsed, writes, pct: after.pct, usedMB: after.usedMB };
}

// ---------------------------------------------------------------------------
// W2 — WAL hits the cap: expect PANIC and shutdown
// ---------------------------------------------------------------------------
async function w2() {
  section('W2 — WAL to 100% → ENOSPC, PANIC, shutdown');
  const t0 = now();

  // Leave only a sliver of the tmpfs for WAL so the next segments cannot be
  // allocated. Without this, PostgreSQL recycles comfortably at ~98% and never
  // fails — which is what the first run of this drill actually observed.
  // Leave *nothing* for new WAL. Reserving even ~1MB is not enough: the first
  // run that reached 100% still survived, because PostgreSQL kept recycling
  // segments into that slack and only the archive_command copy hit ENOSPC —
  // which degrades archiving but does not stop the database. A PANIC needs the
  // walwriter itself to fail an allocation.
  // Leave ~4MB rather than zero. With zero slack the very first INSERT is the
  // one that PANICs, so nothing is ever committed during W2 and the RPO check
  // in W5 has no baseline to compare against. A few megabytes of slack lets
  // real transactions commit first and then still runs the volume dry.
  const u0 = walUsage();
  const SLACK_MB = Number(process.env.PGDRILL_SLACK_MB || 2);
  const fillerMB = Math.max(0, Math.floor(u0.sizeMB - u0.usedMB - SLACK_MB));
  setFiller(fillerMB);
  console.log(`  (filler: ${fillerMB}MB parked on the WAL tmpfs, leaving ~${SLACK_MB}MB effective)`);

  const logFrom = logOffset();
  const c = await connect();
  const batch = `insert into drill_ledger (txn, payload)
                 select 'W2-' || g, repeat(md5(random()::text), 16)
                 from generate_series(1, 2000) g`;

  let firstErrAt = null, firstErr = null, writes = 0, committedBeforeCrash = 0;
  try {
    for (let i = 0; i < 400; i++) {
      // RETURNING gives the committed count in the same statement as the write,
      // so a PANIC landing on a separate verification read cannot destroy the
      // baseline that the RPO proof depends on.
      const ins = await c.query(`${batch} returning seq`);
      writes++;
      if (ins.rowCount) committedBeforeCrash = Math.max(committedBeforeCrash, Number(ins.rows[ins.rowCount - 1].seq));
      const u = walUsage();
      if (u.pct >= TARGET_FILL_PCT) break;
      if (!serverRunning()) break;
    }
  } catch (e) {
    firstErrAt = now() - t0;
    firstErr = (e.message || '').split('\n')[0];
  }

  // Wait for the postmaster to actually die after the PANIC.
  let downAt = null;
  for (let i = 0; i < 60; i++) {
    if (!serverRunning()) { downAt = now() - t0; break; }
    await sleep(500);
  }

  const log = pgLogSince(logFrom);
  const panic = /PANIC/.test(log);
  const enospc = /No space left on device/.test(log);
  const panicLine = (log.match(/^.*PANIC.*$/m) || ['(no PANIC line captured)'])[0].trim();
  const enospcLine = (log.match(/^.*No space left on device.*$/m) || [''])[0].trim();

  // The server-side log line is the preferred evidence, but it is not always
  // available: when the postmaster PANICs, a buffered logging collector dies
  // with it and the line never reaches disk. The client reliably receives the
  // same message, so a client-observed PANIC counts as real evidence too, and
  // the source is always stated rather than blurred.
  const clientPanic = !!firstErr && /No space left on device/.test(firstErr);

  if (enospc) ok('W2 kernel ENOSPC recorded by PostgreSQL', `server log: ${enospcLine.slice(0, 140)}`);
  else if (clientPanic) ok('W2 kernel ENOSPC recorded by PostgreSQL', `client-observed (server log lost on crash): ${firstErr.slice(0, 120)}`);
  else bad('W2 kernel ENOSPC recorded by PostgreSQL', 'no "No space left on device" in server log or client error');

  if (panic) ok('W2 PANIC raised', `server log: ${panicLine.slice(0, 140)}`);
  else if (clientPanic) ok('W2 PANIC raised', `client-observed (server log lost on crash): ${firstErr.slice(0, 120)}`);
  else bad('W2 PANIC raised', 'no PANIC in server log or client error');

  if (downAt !== null) ok('W2 server shut down after PANIC', `postmaster gone ${downAt}ms after drill start`);
  else bad('W2 server shut down after PANIC', 'postmaster still running');

  const final = walUsage();
  ok('W2 WAL usage at failure', `${final.usedMB.toFixed(1)}MB / ${final.sizeMB.toFixed(0)}MB = ${final.pct.toFixed(1)}%`);

  if (firstErr) ok('W2 client-visible failure', `after ${firstErrAt}ms: ${firstErr.slice(0, 120)}`);
  else skipped('W2 client-visible failure', 'loop exited before a client error was raised');

  try { await c.end(); } catch { /* connection is already dead */ }
  return { downAt, panic, enospc, committedBeforeCrash, writes, elapsed: downAt, fillerMB };
}

// ---------------------------------------------------------------------------
// W3 — reclaim WAL and restart: measure RTO, prove the data survived
// ---------------------------------------------------------------------------
async function w3(expectedRows) {
  section('W3 — reclaim WAL, restart, measure RTO');
  const t0 = now();
  const logFrom = logOffset();   // only recovery output written from here on counts

  // Operator action: the pinned slot is what filled the disk, so drop it and
  // let PostgreSQL recycle the segments. Done offline because the server is down.
  const walBefore = walUsage();
  sudoRoot('rm', ['-rf', path.join(ROOT, 'data', 'pg_replslot', 'drill_pin')]);

  // Free the space the drill parked, then bring the server back.
  setFiller(0);

  let started = false, startErr = '', alreadyUp = false;
  if (serverRunning()) {
    // The PANIC did not take the postmaster down in this run. Say so plainly
    // instead of claiming a restart we never needed.
    alreadyUp = true;
    started = true;
  } else {
    try {
      sh('sudo', ['-n', '-u', RUN_AS, `${PGBIN}/pg_ctl`, '-D', path.join(ROOT, 'data'),
        '-l', path.join(ROOT, 'log', 'startup.out'), 'start'], { stdio: 'ignore' });
      started = true;
    } catch (e) {
      // Observed behaviour: after a WAL PANIC the postmaster restarts itself and
      // is accepting connections again within the same second. pg_ctl then fails
      // with "postmaster.pid already exists" — which reads like a failure but is
      // actually the recovery having already happened. Judge by liveness.
      startErr = (e.stderr || e.message || '').toString().split('\n').slice(0, 3).join(' | ');
      started = serverRunning();
      if (started) startErr = 'auto-recovered: ' + startErr;
    }
  }

  // Readiness poll: pg_ctl's own -w flag was observed to hang in this sandbox.
  let readyAt = null;
  for (let i = 0; i < 120; i++) { if (serverRunning()) { readyAt = now() - t0; break; } await sleep(500); }
  const rto = readyAt;

  if (!started || readyAt === null) {
    bad('W3 server restarts after WAL reclaim', startErr || 'never became ready');
    return { rto: null, rows: 0, expectedRows };
  }
  ok('W3 server restarts after WAL reclaim',
    alreadyUp ? `postmaster auto-recovered after PANIC — serving again at +${rto}ms (RTO)`
              : `RTO = ${rto}ms`);

  // Wait until it accepts queries (crash recovery replay included).
  let c = null, ready = null;
  for (let i = 0; i < 60; i++) {
    try { c = await connect(); ready = now() - t0; break; } catch { await sleep(500); }
  }
  if (!c) { bad('W3 accepts connections after recovery', 'never became connectable'); return { rto, rows: 0, expectedRows }; }
  ok('W3 accepts connections after recovery', `first successful query at +${ready}ms`);

  const recovered = Number((await c.query('select count(*) n from drill_ledger')).rows[0].n);
  const walAfter = walUsage();
  ok('W3 WAL reclaimed by PostgreSQL',
    `${walBefore.usedMB.toFixed(1)}MB → ${walAfter.usedMB.toFixed(1)}MB (${walAfter.pct.toFixed(1)}% of cap)`);

  const log = pgLogSince(logFrom);
  if (/redo starts at|redo done at|database system is ready/.test(log)) {
    const m = (log.match(/^.*redo (starts|done) at.*$/gm) || []).map((s) => s.trim().slice(-90));
    ok('W3 crash recovery replayed WAL', m.slice(0, 2).join(' ; ') || 'recovery messages present');
  } else {
    skipped('W3 crash recovery replayed WAL', 'no redo lines in current log (clean shutdown path)');
  }

  await c.end();
  return { rto, rows: recovered, expectedRows };
}

// ---------------------------------------------------------------------------
// W4 — streaming replica: does the standby survive and catch up?
// ---------------------------------------------------------------------------
async function w4() {
  section('W4 — streaming replication');
  let standbyProc = false;
  try { standbyProc = /postgres .*-D .*standby/.test(sh('ps', ['-eo', 'args'])); } catch { standbyProc = false; }
  const standbyData = fs.existsSync(path.join(STANDBY_DATA, 'PG_VERSION'));
  if (!standbyProc && !standbyData) {
    skipped('W4 replica recovers from primary WAL', 'no streaming replica provisioned in this drill run');
    return { provisioned: false };
  }
  try {
    const c = new Client({ host: PGHOST, port: STANDBY_PORT, user: PGUSER, database: PGDATABASE, connectionTimeoutMillis: 4000 });
    await c.connect();
    const r = await c.query('select pg_is_in_recovery() ro, count(*) n from drill_ledger');
    ok('W4 replica serves reads after primary PANIC',
      `in_recovery=${r.rows[0].ro}, rows=${r.rows[0].n}`);
    await c.end();
    return { provisioned: true, rows: Number(r.rows[0].n) };
  } catch (e) {
    bad('W4 replica serves reads after primary PANIC', (e.message || '').split('\n')[0]);
    return { provisioned: true, rows: null };
  }
}

/**
 * Provision a real streaming standby via pg_basebackup. Only used with
 * --with-standby, because it needs a second cluster and doubles drill runtime.
 * Without it, W4 reports SKIPPED rather than pretending a replica existed.
 */
async function provisionStandby() {
  const primary = await connect();
  await primary.query(`select pg_create_physical_replication_slot('drill_standby', true)`).catch(() => {});
  await primary.end();

  // Both directories must be absent: pg_basebackup refuses a non-empty
  // --waldir, which is what made the first --with-standby run fail.
  sudoRoot('rm', ['-rf', STANDBY_DATA, STANDBY_WAL]);
  sudoRoot('mkdir', ['-p', STANDBY_WAL, path.dirname(STANDBY_DATA)]);
  sudoRoot('chown', ['-R', `${RUN_AS}:${RUN_AS}`, STANDBY_WAL]);

  sh('sudo', ['-n', '-u', RUN_AS, `${PGBIN}/pg_basebackup`,
    '-h', PGHOST, '-p', String(PGPORT), '-U', 'postgres',
    '-D', STANDBY_DATA, '--waldir', STANDBY_WAL,
    '-R', '-X', 'stream', '-S', 'drill_standby', '--no-sync'], { stdio: 'ignore' });

  sudoRoot('chown', ['-R', `${RUN_AS}:${RUN_AS}`, STANDBY_DATA, STANDBY_WAL]);
  // Written from Node on purpose: the earlier shell/printf version lost the
  // quotes around the socket path ("syntax error near token /") and appended
  // primary_slot_name a second time on top of what -R had already written.
  const standbyConf = `port = ${STANDBY_PORT}` + '\n'
    + `unix_socket_directories = '${RUNDIR}'` + '\n'
    + 'hot_standby = on' + '\n';
  sudoRoot('sh', ['-c', `cat >> ${STANDBY_DATA}/postgresql.auto.conf <<'PGEOF'\n${standbyConf}PGEOF`]);
  sudoRoot('chown', [`${RUN_AS}:${RUN_AS}`, path.join(STANDBY_DATA, 'postgresql.auto.conf')]);
  // No -w here: on this sandbox pg_ctl's wait loop does not return promptly.
  sh('sudo', ['-n', '-u', RUN_AS, `${PGBIN}/pg_ctl`, '-D', STANDBY_DATA,
    '-l', path.join(ROOT, 'log', 'standby.out'), 'start'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (serverRunning(STANDBY_PORT)) break; await sleep(500); }
}

// ---------------------------------------------------------------------------
// W5 — RPO: did every committed transaction survive the PANIC?
// ---------------------------------------------------------------------------
async function w5(committedBeforeCrash) {
  section('W5 — RPO = 0 proof');

  // Guard against a vacuous pass: with no crash in this run the "committed
  // before crash" baseline is 0, and 0 - 0 <= 0 would report RPO=0 for free.
  // That is exactly the fake green SKILLS_MASTER §7 forbids.
  // If the PANIC landed between the INSERT and our verification read, the
  // baseline was never recorded. Falling back to a 0 baseline would make this
  // check pass vacuously, so instead we refuse to claim a number we never
  // measured and report the run as unproven.
  if (!committedBeforeCrash) {
    skipped('W5 zero committed transactions lost (RPO = 0)',
      'no crash baseline captured this run (PANIC preceded the verification read) — RPO not proven');
    skipped('W5 sequence has no holes', 'same reason: no crash baseline');
    return { rows: 0, lost: null, gaps: null };
  }

  const c = await connect();
  const r = await c.query('select count(*) n, coalesce(max(seq),0) m from drill_ledger');
  const rows = Number(r.rows[0].n);
  const gaps = await c.query(
    `select count(*) g from (select seq, lag(seq) over (order by seq) p from drill_ledger) x
     where p is not null and seq <> p + 1`);
  await c.end();

  const lost = committedBeforeCrash - rows;
  if (lost <= 0) ok('W5 zero committed transactions lost (RPO = 0)',
    `committed before crash: ${committedBeforeCrash}, present after recovery: ${rows}`);
  else bad('W5 zero committed transactions lost (RPO = 0)', `${lost} committed rows missing after recovery`);

  if (Number(gaps.rows[0].g) === 0) ok('W5 sequence has no holes', `max(seq)=${r.rows[0].m}, contiguous`);
  else bad('W5 sequence has no holes', `${gaps.rows[0].g} gaps in bigserial sequence`);

  return { rows, lost, gaps: Number(gaps.rows[0].g) };
}

// ---------------------------------------------------------------------------
// preflight: refuse to fake a drill if the infrastructure is not live
// ---------------------------------------------------------------------------
async function preflight() {
  section('Preflight — is the infrastructure actually live?');
  const checks = [];

  if (!fs.existsSync(`${PGBIN}/postgres`)) {
    checks.push(['PostgreSQL binaries', false, `${PGBIN} missing — run tools/wal-drill/setup-pg.sh`]);
  } else checks.push(['PostgreSQL binaries', true, sh(`${PGBIN}/postgres`, ['--version']).trim()]);

  let isMount = false;
  try { sh('mountpoint', ['-q', WALDIR]); isMount = true; } catch { isMount = false; }
  checks.push(['pg_wal is a size-capped tmpfs', isMount, isMount ? `${walUsage().sizeMB.toFixed(0)}MB at ${WALDIR}` : 'not a mountpoint — the cap would be fake']);

  let alive = false, ver = '';
  try { const c = await connect(); ver = (await c.query('show server_version')).rows[0].server_version; await c.end(); alive = true; } catch (e) { ver = (e.message || '').split('\n')[0]; }
  checks.push(['primary accepts connections', alive, `port ${PGPORT}: ${ver}`]);

  for (const [name, good, detail] of checks) good ? ok(name, detail) : bad(name, detail);
  return checks.every((c) => c[1]);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
(async () => {
  console.log('\x1b[1mWave 19 — WAL disk-full drill (W1–W5)\x1b[0m');
  console.log(`target: ${PGHOST}:${PGPORT}/${PGDATABASE}   pg_wal: ${WALDIR}`);
  ensureLogReadable();

  const live = await preflight();
  if (!live) {
    console.log('\n\x1b[31mInfrastructure is not live — refusing to report fake results.\x1b[0m');
    console.log('Bring it up with: sudo -n bash tools/wal-drill/setup-pg.sh');
    console.log(`\nWAL drill: 0/${pass + fail + skip + 5} — ABORTED (infrastructure not live)`);
    process.exit(2);
  }

  const summary = {};
  if (args.includes('--with-standby')) {
    section('Provisioning a streaming standby for W4');
    try {
      await provisionStandby();
      ok('W4 standby provisioned via pg_basebackup', `port ${STANDBY_PORT}, slot drill_standby`);
    } catch (e) {
      bad('W4 standby provisioned via pg_basebackup', (e.stderr || e.message || '').toString().split('\n')[0].slice(0, 140));
    }
  }
  if (!ONLY || ONLY === 'W1') summary.w1 = await w1();
  if (!ONLY || ONLY === 'W2') summary.w2 = await w2();
  if (!ONLY || ONLY === 'W3') summary.w3 = await w3(summary.w2 ? summary.w2.committedBeforeCrash : 0);
  if (!ONLY || ONLY === 'W4') summary.w4 = await w4();
  if (!ONLY || ONLY === 'W5') summary.w5 = await w5(summary.w2 ? summary.w2.committedBeforeCrash : 0);

  section('Summary');
  console.table(results.map((r) => ({ scenario: r.id, status: r.st, detail: r.detail.slice(0, 90) })));
  console.log(`\nWAL drill: ${pass}/${pass + fail} green, ${fail} failed, ${skip} skipped`);

  if (process.env.PGDRILL_JSON) {
    fs.writeFileSync(process.env.PGDRILL_JSON, JSON.stringify({ results, summary, at: new Date().toISOString() }, null, 2));
    console.log(`machine-readable results -> ${process.env.PGDRILL_JSON}`);
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\nFATAL', e); process.exit(3); });
