#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave10-pg-live.js — گیتِ زندهٔ PostgreSQL برای موج ۱۰ (Database Scale)
   ───────────────────────────────────────────────────────────────────
   قیدِ pending سندِ docs/WAVE10_DB_SCALE.md:
   «read-replica واقعی و DDL پارتیشن‌بندی هرگز رویِ PG زنده اجرا نشده»
   (§۳.۲ قیدِ قرمز + یادداشتِ صداقتِ L129).

   این سوئیت یک جفتِ PostgreSQL *واقعی* (primary + streaming replica —
   cold-copy پس از shutdown تمیز + standby.signal) بوت می‌کند و می‌سنجد:

   بخش P — خودِ رپلیکیشن:
     P1  نقش‌ها: primary در recovery نیست؛ replica هست (hot standby)
     P2  pg_stat_replication روی primary: state=streaming
     P3  writeِ primary → readِ replica (انتشارِ WAL واقعی)
     P4  replica نوشتن را رد می‌کند (SQLSTATE 25006)

   بخش D — server/db.js با URLهایِ زنده:
     D1  init با DATABASE_URL+READ_DATABASE_URL ⇒ driver=postgres،
         read_replica=true، isReplicaActive()=true
     D2  مسیریابی: queryRead ⇒ رپلیکا (pg_is_in_recovery=t)،
         query ⇒ پرماری (pg_is_in_recovery=f)
     D3  رپلیکایِ خاموش ⇒ queryRead بدونِ خطا به پرماری برمی‌گردد و
         مسیریابی می‌خوابد
     D4  S3-1: رپلیکا برگردد ⇒ reprobe خودکار مسیریابی را برمی‌گرداند

   بخش T — DDL پارتیشن‌بندیِ §۳.۲ رویِ PG زنده:
     T1  CREATE TABLE … PARTITION BY RANGE(created_at)، PK(id,created_at)،
         پارتیشن‌هایِ سالانه + DEFAULT، FK رویِ والد
     T2  مهاجرت از heap: INSERT…SELECT؛ شمارش برابر + مسیریابیِ سطرها
         به پارتیشنِ سالِ درست (tableoid)
     T3  سطرِ خارج از بازه‌ها به پارتیشنِ DEFAULT می‌رود
     T4  PK مرکب در کلِ جدولِ پارتیشن‌شده اعمال می‌شود (23505)
     T5  FK رویِ والدِ پارتیشن‌شده اعمال می‌شود (23503)
     T6  partition pruning: کوئریِ بازهٔ ۲۰۲۵ فقط y2025 را می‌خواند
     T7  تعویض (create-new + copy + rename + drop-old) + ایندکس رویِ والد
     T8  جدولِ پارتیشن‌شده و سطرهایش رویِ replica هم دیده می‌شوند

   بدونِ باینری‌هایِ PostgreSQL (initdb/postgres/pg_ctl در PATH یا
   PG_LIVE_BIN) یا بدونِ ماژولِ pg: fail-closed prerequisite gate — CI قرمز نمی‌شود.

   اجرا:
     PG_LIVE_BIN=/path/to/pg/bin node tests/wave10-pg-live.js
     یا با باینری‌ها در PATH: node tests/wave10-pg-live.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

let okc = 0, failc = 0, skipped = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 240) : '')); }
}
function skip(name, why) { skipped++; console.log('  ⏭️  ' + name + '  —  ' + why); }
function finish() {
  console.log('\n  جمع: ' + okc + ' موفق، ' + failc + ' ناموفق از ' + (okc + failc)
    + (skipped ? ' (' + skipped + ' skip)' : ''));
  if (fails.length) { console.log('  شکست‌ها:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('');
  process.exit(failc ? 1 : 0);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── کشفِ باینری‌ها و ماژول (شرطِ fail-closed prerequisite gate) ─────────────────────── */
function findPgBin() {
  const cand = [];
  if (process.env.PG_LIVE_BIN) cand.push(process.env.PG_LIVE_BIN);
  try {
    const w = cp.execSync('which initdb', { stdio: 'pipe' }).toString().trim().split('\n')[0];
    if (w) cand.push(path.dirname(w));
  } catch (e) {}
  for (const d of cand) {
    if (['initdb', 'postgres', 'pg_ctl'].every((b) => fs.existsSync(path.join(d, b)))) return d;
  }
  return null;
}
function hasPgModule() { try { require.resolve('pg'); return true; } catch (e) { return false; } }

const BIN = findPgBin();
if (!BIN || !hasPgModule()) {
  skip('wave10 pg live gate', !BIN ? 'باینری‌هایِ PostgreSQL (initdb/postgres/pg_ctl) در PATH/PG_LIVE_BIN نیستند'
    : 'ماژولِ pg نصب نیست');
  console.log('\nwave10-pg-live: 0/0 (NOT-RUN)؛ PASS only when runtime prerequisites are present; missing prerequisites are NOT-RUN and exit 2\n');
  process.exit(2);
}

const P_PORT = 55450, R_PORT = 55451;
const P_DATA = '/tmp/w10gate-primary-' + process.pid;
const R_DATA = '/tmp/w10gate-replica-' + process.pid;
const ROOT = path.join(__dirname, '..');

function pgctl(args, dir) {
  return cp.execSync(path.join(BIN, 'pg_ctl') + ' -D ' + dir + ' ' + args,
    { stdio: 'pipe', timeout: 60000 }).toString();
}
function cleanup() {
  for (const d of [R_DATA, P_DATA]) {
    try { pgctl('stop -m immediate -w', d); } catch (e) {}
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {}
  }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

async function bootPair(Client) {
  /* primary */
  cp.execSync(path.join(BIN, 'initdb') + ' -D ' + P_DATA + ' -U payesh --auth=trust -E UTF8',
    { stdio: 'pipe', timeout: 120000 });
  fs.appendFileSync(P_DATA + '/postgresql.conf',
    "\nport = " + P_PORT + "\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = '" + P_DATA + "'\n" +
    'wal_level = replica\nmax_wal_senders = 4\nmax_replication_slots = 4\nhot_standby = on\n');
  fs.appendFileSync(P_DATA + '/pg_hba.conf', '\nhost replication payesh 127.0.0.1/32 trust\n');
  pgctl('start -w -l ' + P_DATA + '/log.txt', P_DATA);

  const admin = new Client({ host: '127.0.0.1', port: P_PORT, user: 'payesh', database: 'postgres' });
  await admin.connect();
  await admin.query('CREATE DATABASE payesh');
  await admin.end();

  /* migrations رویِ primary */
  const mig = new Client({ host: '127.0.0.1', port: P_PORT, user: 'payesh', database: 'payesh' });
  await mig.connect();
  const files = fs.readdirSync(path.join(ROOT, 'migrations'))
    .filter((f) => /^\d+_.*\.sql$/.test(f) && !f.includes('.down.')).sort();
  /* 012 (پارتیشن‌بندی #82) عمداً اعمال نمی‌شود: بخشِ T این سوئیت خودش
     DDL پارتیشن‌بندیِ زنده را می‌سازد و می‌سنجد (قراردادِ WAVE10_DB_SCALE §۳.۲) —
     همان الگوی skipِ 009 در wave10-retention. اعمالِ 012 ⇒ تصادمِ
     «already exists» با DDL بخش T. */
  const applyFiles = files.filter((f) => !f.startsWith('012_'));
  const { execFileSync } = require('child_process');
  const migUrl = `postgres://payesh@127.0.0.1:${P_PORT}/payesh`;
  for (const f of applyFiles) {
    const sql = fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8');
    if (/^[^\n]*\\gset\s*$/m.test(sql) || /^\\[a-z]/m.test(sql)) {
      execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '--quiet', '-f', path.join(ROOT, 'migrations', f), migUrl], { stdio: 'pipe' });
    } else {
      await mig.query(sql);
    }
  }
  /* بذر: مدرسه + سطرهایِ heapِ attendance در سال‌هایِ مختلف */
  await mig.query("INSERT INTO schools (id, name) VALUES (1, 'مدرسه گیت موج ۱۰') ON CONFLICT (id) DO NOTHING");
  await mig.query(
    "INSERT INTO attendance (school_id, student_id, class_id, date, status, created_at, updated_at) VALUES " +
    "(1, 11, 101, '1403-01-15', 'present', '2024-04-03T08:00:00Z', '2024-04-03T08:00:00Z')," +
    "(1, 12, 101, '1403-01-16', 'absent',  '2024-04-04T08:00:00Z', '2024-04-04T08:00:00Z')," +
    "(1, 13, 102, '1403-02-01', 'late',    '2024-04-20T08:00:00Z', '2024-04-20T08:00:00Z')," +
    "(1, 11, 101, '1404-01-15', 'present', '2025-04-04T08:00:00Z', '2025-04-04T08:00:00Z')," +
    "(1, 12, 101, '1404-01-16', 'present', '2025-04-05T08:00:00Z', '2025-04-05T08:00:00Z')," +
    "(1, 13, 102, '1404-02-01', 'absent',  '2025-04-21T08:00:00Z', '2025-04-21T08:00:00Z')," +
    "(1, 14, 103, '1410-01-01', 'present', '2031-05-05T08:00:00Z', '2031-05-05T08:00:00Z')");
  await mig.end();

  /* replica: shutdown تمیز → cold copy → standby.signal (روشِ مستندِ PG) */
  pgctl('stop -m fast -w', P_DATA);
  cp.execSync('cp -a ' + P_DATA + ' ' + R_DATA);
  try { fs.rmSync(R_DATA + '/postmaster.pid'); } catch (e) {}
  fs.writeFileSync(R_DATA + '/standby.signal', '');
  fs.appendFileSync(R_DATA + '/postgresql.conf',
    "\nport = " + R_PORT + "\nunix_socket_directories = '" + R_DATA + "'\n" +
    "primary_conninfo = 'host=127.0.0.1 port=" + P_PORT + " user=payesh'\n");
  fs.chmodSync(R_DATA, 0o700);
  pgctl('start -w -l ' + P_DATA + '/log.txt', P_DATA);
  pgctl('start -w -l ' + R_DATA + '/log.txt', R_DATA);
}

async function main() {
  const { Client } = require('pg');
  console.log('\nwave10-pg-live — گیتِ زندهٔ PostgreSQL (primary+replica) برای موج ۱۰\n');

  try { await bootPair(Client); }
  catch (e) { chk('boot جفتِ primary+replica', false, e.message); return finish(); }

  const P_URL = 'postgres://payesh@127.0.0.1:' + P_PORT + '/payesh';
  const R_URL = 'postgres://payesh@127.0.0.1:' + R_PORT + '/payesh';
  const pc = new Client({ connectionString: P_URL }); await pc.connect();
  const rcConn = async () => { const c = new Client({ connectionString: R_URL }); await c.connect(); return c; };

  /* ── P: رپلیکیشن ─────────────────────────────────────────────── */
  console.log('— بخش P: streaming replication واقعی —');
  let rc = await rcConn();
  const pRec = (await pc.query('SELECT pg_is_in_recovery() AS r')).rows[0].r;
  const rRec = (await rc.query('SELECT pg_is_in_recovery() AS r')).rows[0].r;
  chk('P1 نقش‌ها: primary عادی، replica در hot-standby', pRec === false && rRec === true,
    'primary=' + pRec + ' replica=' + rRec);

  let streaming = false;
  for (let i = 0; i < 50 && !streaming; i++) {
    const s = await pc.query('SELECT state FROM pg_stat_replication');
    streaming = s.rows.some((x) => x.state === 'streaming');
    if (!streaming) await sleep(200);
  }
  chk('P2 pg_stat_replication: walsender در حالتِ streaming', streaming);

  await pc.query("INSERT INTO schools (id, name) VALUES (777001, 'انتشار WAL') ON CONFLICT (id) DO NOTHING");
  let seen = null;
  for (let i = 0; i < 50 && !seen; i++) {
    const r = await rc.query('SELECT name FROM schools WHERE id = 777001');
    if (r.rows.length) seen = r.rows[0].name;
    else await sleep(200);
  }
  chk('P3 writeِ primary → readِ replica (انتشارِ واقعیِ WAL)', seen === 'انتشار WAL', 'seen=' + seen);

  let wErr = null;
  try { await rc.query("INSERT INTO schools (id, name) VALUES (777002, 'x')"); }
  catch (e) { wErr = e; }
  chk('P4 replica نوشتن را رد می‌کند (25006 read-only)', !!wErr && wErr.code === '25006',
    wErr ? wErr.code : 'write پذیرفته شد!');

  /* ── D: server/db.js رویِ URLهایِ زنده ───────────────────────── */
  console.log('\n— بخش D: server/db.js با DATABASE_URL + READ_DATABASE_URL زنده —');
  process.env.DATABASE_URL = P_URL;
  process.env.READ_DATABASE_URL = R_URL;
  delete require.cache[require.resolve(path.join(ROOT, 'server', 'db.js'))];
  const db = require(path.join(ROOT, 'server', 'db.js'));
  const initRes = await db.init({});
  db.__setReprobeDelayForTests(300); /* S3-1 در تست تند بچرخد */
  chk('D1 init: driver=postgres و read_replica=true و isReplicaActive()',
    initRes && initRes.driver === 'postgres' && initRes.read_replica === true && db.isReplicaActive() === true,
    JSON.stringify({ driver: initRes && initRes.driver, rr: initRes && initRes.read_replica }));

  const viaRead = (await db.queryRead('SELECT pg_is_in_recovery() AS r')).rows[0].r;
  const viaWrite = (await db.query('SELECT pg_is_in_recovery() AS r')).rows[0].r;
  chk('D2a queryRead به رپلیکا می‌رود (pg_is_in_recovery=true)', viaRead === true, 'r=' + viaRead);
  chk('D2b query (مسیرِ نوشتن) رویِ پرماری می‌ماند (pg_is_in_recovery=false)', viaWrite === false, 'r=' + viaWrite);

  /* D3: رپلیکا را بخوابان — fallback بدونِ خطا */
  await rc.end(); rc = null;
  pgctl('stop -m fast -w', R_DATA);
  let fbRow = null, fbErr = null;
  try { fbRow = (await db.queryRead('SELECT pg_is_in_recovery() AS r')).rows[0].r; }
  catch (e) { fbErr = e; }
  chk('D3a رپلیکایِ خاموش: queryRead بدونِ خطا به پرماری fallback می‌کند',
    fbErr === null && fbRow === false, fbErr ? fbErr.message : 'r=' + fbRow);
  chk('D3b پس از شکست، مسیریابی به رپلیکا می‌خوابد (isReplicaActive=false)', db.isReplicaActive() === false);

  /* D4: رپلیکا برگردد — reprobeِ S3-1 مسیریابی را برمی‌گرداند */
  pgctl('start -w -l ' + R_DATA + '/log.txt', R_DATA);
  let recovered = false;
  for (let i = 0; i < 60 && !recovered; i++) { recovered = db.isReplicaActive(); if (!recovered) await sleep(250); }
  const backRow = recovered ? (await db.queryRead('SELECT pg_is_in_recovery() AS r')).rows[0].r : null;
  chk('D4 بازگشتِ رپلیکا: reprobe خودکار (S3-1) مسیریابی را برمی‌گرداند', recovered && backRow === true,
    'recovered=' + recovered + ' r=' + backRow);
  rc = await rcConn();

  /* ── T: DDL پارتیشن‌بندیِ §۳.۲ رویِ PG زنده ──────────────────── */
  console.log('\n— بخش T: پارتیشن‌بندیِ RANGE(created_at) — طرحِ §۳.۲ سند —');
  const heapCount = Number((await pc.query('SELECT count(*) AS c FROM attendance')).rows[0].c);

  let t1ok = false, t1err = '';
  try {
    await pc.query(
      'CREATE TABLE attendance_part (' +
      '  id BIGINT GENERATED BY DEFAULT AS IDENTITY,' +
      '  school_id INTEGER, student_id INTEGER, class_id INTEGER,' +
      '  date VARCHAR(50), status VARCHAR(255), source VARCHAR(255), note TEXT,' +
      '  late_at TIMESTAMPTZ, late_minutes VARCHAR(255), exit_at TIMESTAMPTZ, exit_minutes VARCHAR(255),' +
      '  taken_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ,' +
      '  PRIMARY KEY (id, created_at),' +
      '  CONSTRAINT fk_attendance_part_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE' +
      ') PARTITION BY RANGE (created_at)');
    await pc.query("CREATE TABLE attendance_y2024 PARTITION OF attendance_part FOR VALUES FROM ('2024-01-01') TO ('2025-01-01')");
    await pc.query("CREATE TABLE attendance_y2025 PARTITION OF attendance_part FOR VALUES FROM ('2025-01-01') TO ('2026-01-01')");
    await pc.query("CREATE TABLE attendance_y2026 PARTITION OF attendance_part FOR VALUES FROM ('2026-01-01') TO ('2027-01-01')");
    await pc.query('CREATE TABLE attendance_default PARTITION OF attendance_part DEFAULT');
    const parts = await pc.query(
      "SELECT count(*) AS c FROM pg_inherits WHERE inhparent = 'attendance_part'::regclass");
    t1ok = Number(parts.rows[0].c) === 4;
  } catch (e) { t1err = e.message; }
  chk('T1 DDL §۳.۲: والدِ RANGE(created_at) + PK(id,created_at) + FK + ۴ پارتیشن', t1ok, t1err);

  await pc.query(
    'INSERT INTO attendance_part (id, school_id, student_id, class_id, date, status, created_at, updated_at) ' +
    'SELECT id, school_id, student_id, class_id, date, status, created_at, updated_at FROM attendance');
  await pc.query("SELECT setval(pg_get_serial_sequence('attendance_part','id'), (SELECT max(id) FROM attendance_part))");
  const partCount = Number((await pc.query('SELECT count(*) AS c FROM attendance_part')).rows[0].c);
  chk('T2a مهاجرت از heap: شمارشِ سطرها برابر (' + heapCount + ')', partCount === heapCount && heapCount >= 7,
    'heap=' + heapCount + ' part=' + partCount);

  const routing = await pc.query(
    "SELECT tableoid::regclass::text AS part, count(*) AS c FROM attendance_part GROUP BY 1 ORDER BY 1");
  const rmap = {}; routing.rows.forEach((r) => { rmap[r.part] = Number(r.c); });
  chk('T2b مسیریابیِ سطرها به پارتیشنِ سالِ خود (tableoid)',
    rmap.attendance_y2024 === 3 && rmap.attendance_y2025 === 3, JSON.stringify(rmap));
  chk('T3 سطرِ خارج از بازه‌ها (۲۰۳۱) در پارتیشنِ DEFAULT', rmap.attendance_default === 1, JSON.stringify(rmap));

  let dupErr = null;
  try {
    await pc.query(
      "INSERT INTO attendance_part (id, school_id, student_id, date, status, created_at) " +
      "SELECT id, school_id, student_id, date, status, created_at FROM attendance_part LIMIT 1");
  } catch (e) { dupErr = e; }
  chk('T4 PK مرکب (id,created_at) در کلِ جدولِ پارتیشن‌شده اعمال می‌شود (23505)',
    !!dupErr && dupErr.code === '23505', dupErr ? dupErr.code : 'تکراری پذیرفته شد!');

  let fkErr = null;
  try {
    await pc.query(
      "INSERT INTO attendance_part (school_id, student_id, date, status, created_at) " +
      "VALUES (99999, 1, '1404-01-01', 'present', '2025-06-01T08:00:00Z')");
  } catch (e) { fkErr = e; }
  chk('T5 FK رویِ والدِ پارتیشن‌شده اعمال می‌شود (23503)', !!fkErr && fkErr.code === '23503',
    fkErr ? fkErr.code : 'FK نقض شد و پذیرفته شد!');

  const plan = (await pc.query(
    "EXPLAIN SELECT * FROM attendance_part WHERE created_at >= '2025-01-01' AND created_at < '2026-01-01'"))
    .rows.map((r) => r['QUERY PLAN']).join('\n');
  chk('T6 partition pruning: پلنِ بازهٔ ۲۰۲۵ فقط y2025 (نه y2024/DEFAULT)',
    plan.includes('attendance_y2025') && !plan.includes('attendance_y2024') && !plan.includes('attendance_default'),
    plan.slice(0, 200));

  let t7ok = false, t7err = '';
  try {
    await pc.query('BEGIN');
    await pc.query('ALTER TABLE attendance RENAME TO attendance_heap_old');
    await pc.query('ALTER TABLE attendance_part RENAME TO attendance');
    await pc.query('COMMIT');
    await pc.query('CREATE INDEX idx_attendance_part_school_date_id ON attendance (school_id, date DESC, id)');
    await pc.query('DROP TABLE attendance_heap_old');
    const c = Number((await pc.query('SELECT count(*) AS c FROM attendance')).rows[0].c);
    const isPart = (await pc.query(
      "SELECT count(*) AS c FROM pg_partitioned_table WHERE partrelid = 'attendance'::regclass")).rows[0].c;
    t7ok = c === heapCount && Number(isPart) === 1;
    if (!t7ok) t7err = 'count=' + c + ' partitioned=' + isPart;
  } catch (e) { await pc.query('ROLLBACK').catch(() => {}); t7err = e.message; }
  chk('T7 تعویض (rename swap + drop-old) + ایندکس رویِ والدِ پارتیشن‌شده', t7ok, t7err);

  let repOk = false;
  for (let i = 0; i < 50 && !repOk; i++) {
    try {
      const c = Number((await rc.query('SELECT count(*) AS c FROM attendance')).rows[0].c);
      const p = Number((await rc.query(
        "SELECT count(*) AS c FROM pg_partitioned_table WHERE partrelid = 'attendance'::regclass")).rows[0].c);
      repOk = c === heapCount && p === 1;
    } catch (e) {}
    if (!repOk) await sleep(200);
  }
  chk('T8 جدولِ پارتیشن‌شده + سطرها رویِ replica (DDL هم stream می‌شود)', repOk);

  await db.close().catch(() => {});
  if (rc) await rc.end().catch(() => {});
  await pc.end().catch(() => {});
  finish();
}

main().catch((e) => { chk('اجرایِ گیت بدونِ خطایِ پیش‌بینی‌نشده', false, e.stack || e.message); finish(); });
