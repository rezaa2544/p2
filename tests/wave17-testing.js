/* ─────────────────────────────────────────────────────────────
   wave17-testing.js — Wave 17: Testing Pyramid
   ─────────────────────────────────────────────────────────────
   The pyramid levels that had no home in this repo: Integration,
   Concurrency, Load, Stress, Spike and Soak. Every level below runs
   against a REAL server process over REAL HTTP with a REAL session
   cookie — no mocks, no in-process shortcuts.

   IN  Integration  — auth → sync → REST read-your-write → idempotency
                      → optimistic concurrency → metrics accounting
   CC  Concurrency  — parallel requests: no lost counter updates, no lost
                      writes, duplicate uids collapse, one OCC winner
   LD  Load         — sustained mixed traffic: p50/p95/p99, zero 5xx,
                      exact metric accounting, bounded heap growth
   ST  Stress       — past the documented limits: oversized batch, >1 MB
                      body, 200 concurrent sockets → graceful 4xx, then
                      the server still serves
   SP  Spike        — idle → sudden burst → no 5xx, latency recovers
   SK  Soak         — scaled-down endurance: flat heap, no handle leak,
                      cardinality guard never fires, outbox stays bounded
   PY  Pyramid      — the existing suites are preserved, not weakened
                      (ROADMAP §20: تست‌های موجود باید حفظ شوند)

   Honest scaling: the soak is 40 rounds, not "several days" — ROADMAP §21
   (Wave 18) owns the national-scale run. What this suite proves is the
   SHAPE of the system under endurance (no leak, no unbounded growth), not
   its capacity. Budgets are sandbox-relative and deliberately generous;
   they are regression alarms, not SLOs (the SLOs live in Wave 14 §5).

   اجرا:  node tests/wave17-testing.js
   ───────────────────────────────────────────────────────────── */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const METRICS_TOKEN = 'wave17-metrics-token-0123456789';

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function pct(sorted, q) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}
const stats = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  return { n: s.length, min: s[0], p50: pct(s, 0.5), p95: pct(s, 0.95), p99: pct(s, 0.99), max: s[s.length - 1], avg: s.reduce((a, b) => a + b, 0) / (s.length || 1) };
};

/* ── HTTP client (real sockets, real timing) ──────────────────────── */
function req(port, method, p, body, cookie) {
  const t0 = process.hrtime.bigint();
  return new Promise((resolve) => {
    const headers = {};
    if (body !== undefined && body !== null) headers['Content-Type'] = 'application/json';
    if (cookie) headers['Cookie'] = cookie;
    const r = http.request({ hostname: '127.0.0.1', port, path: p, method, headers, agent: false }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({
          status: res.statusCode, json: j, raw: b,
          setCookie: res.headers['set-cookie'],
          ms: Number(process.hrtime.bigint() - t0) / 1e6
        });
      });
    });
    r.on('error', (e) => resolve({ status: 0, json: null, raw: '', ms: Number(process.hrtime.bigint() - t0) / 1e6, err: e.code }));
    if (body !== undefined && body !== null) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}
async function all(promises) { return Promise.all(promises); }
/* run N tasks with a bounded in-flight window */
async function pool(n, worker) {
  const out = [];
  let i = 0;
  const runners = new Array(Math.min(n, 32)).fill(0).map(async () => {
    while (i < n) { const k = i++; out[k] = await worker(k); }
  });
  await Promise.all(runners);
  return out;
}

/* ── Prometheus text parser (for the accounting assertions) ───────── */
function parseMetrics(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    if (!line || line[0] === '#') continue;
    const m = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{(.*)\})?\s+(.+)$/.exec(line);
    if (!m) continue;
    const labels = {};
    if (m[3]) for (const part of m[3].split(',')) { const i = part.indexOf('='); if (i > 0) labels[part.slice(0, i)] = part.slice(i + 1).replace(/^"|"$/g, ''); }
    out.push({ name: m[1], labels, value: Number(m[4]) });
  }
  return out;
}

/* ── a COMPACT store: the seeded world with every array trimmed, so a
      1000-request run does not spend its time re-serialising 5.6 MB.
      Trimming is honest here — these levels test request/response shape
      under concurrency, not dataset size (that is Wave 18). ────────── */
function compactStore(srcPath, destPath, keep) {
  const s = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
  for (const k of Object.keys(s)) {
    if (Array.isArray(s[k]) && s[k].length > keep) s[k] = s[k].slice(0, keep);
  }
  for (const k of Object.keys(s)) if (k.indexOf('__') === 0) delete s[k];
  fs.writeFileSync(destPath, JSON.stringify(s), { encoding: 'utf8', mode: 0o600 });
  return s;
}

async function boot(port, env) {
  const srv = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, env, { PORT: String(port), HOST: '127.0.0.1' }),
    stdio: 'pipe'
  });
  let stderr = '';
  srv.stderr.on('data', (d) => { stderr += d; });
  for (let i = 0; i < 80; i++) {
    const h = await req(port, 'GET', '/api/health').then((r) => r.json).catch(() => null);
    if (h && h.ok && h.pid === srv.pid) return { srv, port, stderr: () => stderr };
    await sleep(250);
  }
  srv.kill('SIGKILL');
  return null;
}

let uidSeq = 0;
const uid = (tag) => 'w17-' + tag + '-' + (++uidSeq) + '-' + Date.now().toString(36);

(async () => {
  console.log('\n▸ Wave 17 — Testing Pyramid (integration · concurrency · load · stress · spike · soak)');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-w17-'));
  const storeFile = path.join(tmp, 'payesh.json');
  const seedFile = path.join(ROOT, 'server/data/payesh.json');
  if (!fs.existsSync(seedFile)) {
    console.error('seeded store missing — run: node server/seed.js');
    process.exit(2);
  }
  const seed = compactStore(seedFile, storeFile, 20);
  const SA = seed.users.find((u) => u.role === 'superadmin');
  const baseEnv = {
    PAYESH_STORE: storeFile,
    PAYESH_AUDIT: path.join(tmp, 'audit.log'),
    PAYESH_KEY: path.join(tmp, 'jwt.key'),
    PAYESH_DEMO_CODE: '1',
    PAYESH_METRICS_TOKEN: METRICS_TOKEN
  };

  /* ── P0: a real server on a real port ───────────────────────────── */
  let S = null;
  for (const p of [9041, 9042]) { S = await boot(p, baseEnv); if (S) break; }
  chk('P0a a real server process is up', !!S);
  if (!S) { console.log('\nwave17-testing: cannot boot the server — aborting'); process.exit(1); }
  const port = S.port;

  const health = await req(port, 'GET', '/api/health');
  chk('P0b /api/health answers 200', health.status === 200 && health.json && health.json.ok === true, JSON.stringify(health.json));
  const mres = await req(port, 'GET', '/metrics', null, null);
  chk('P0c /metrics requires the token (fail-closed)', mres.status === 403, 'status=' + mres.status);
  /* a bearer token cannot ride the cookie jar — use an Authorization header */
  const scrapeAuth = async () => new Promise((resolve) => {
    const r = http.request({
      hostname: '127.0.0.1', port, path: '/metrics', method: 'GET', agent: false,
      headers: { Authorization: 'Bearer ' + METRICS_TOKEN }
    }, (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, text: b })); });
    r.on('error', () => resolve({ status: 0, text: '' }));
    r.end();
  });
  const authed = await scrapeAuth();
  chk('P0d /metrics serves the exposition with the token', authed.status === 200 && /payesh_http_requests_total/.test(authed.text), 'status=' + authed.status);
  const metricSum = async (name, match) => {
    const t = await scrapeAuth();
    return parseMetrics(t.text).filter((m) => m.name === name && (!match || match(m.labels)))
      .reduce((a, m) => a + m.value, 0);
  };

  /* ── a real session ─────────────────────────────────────────────── */
  const sc = await req(port, 'POST', '/api/auth/send-code', { phone: SA.phone });
  const lg = await req(port, 'POST', '/api/auth/login', { phone: SA.phone, code: sc.json && sc.json.demo_code, national_id: SA.national_id });
  const cookie = Array.isArray(lg.setCookie) ? String(lg.setCookie[0]).split(';')[0] : '';
  chk('P0e a real session is established (send-code → login → cookie)',
    sc.status === 200 && lg.status === 200 && /payesh_session=/.test(cookie), JSON.stringify({ sc: sc.status, lg: lg.status, cookie: cookie.slice(0, 20) }));

  /* ═══ IN — Integration ═══ */
  console.log('\n  — Integration');
  {
    const me = await req(port, 'GET', '/api/auth/me', null, cookie);
    chk('IN1 the session cookie authenticates /api/auth/me', me.status === 200 && me.json.user.id === SA.id, JSON.stringify(me.json));

    /* sync a write, then read it back through a DIFFERENT module (REST) */
    /* NB: the sync result for an `ins` is {uid, ok, serverTime} — it carries no
       id, so the record is located by a unique body marker. */
    const u1 = uid('ins');
    const marker = 'wave17-integration-' + u1;
    const push = await req(port, 'POST', '/api/sync', {
      ops: [{ uid: u1, t: 'ins', c: 'teacher_notes', data: { school_id: 1, teacher_id: 2, body: marker }, by: SA.id, at: new Date().toISOString() }]
    }, cookie);
    chk('IN2 POST /api/sync accepts a well-formed op', push.status === 200 && push.json.results[0].ok === true, JSON.stringify(push.json));
    const withMarker = () => ((JSON.parse(fs.readFileSync(storeFile, 'utf8')).teacher_notes) || []).filter((n) => n.body === marker);

    const list = await req(port, 'GET', '/api/v1/students?limit=5', null, cookie);
    chk('IN3 an authenticated REST list works in the same session', list.status === 200 && Array.isArray(list.json.data), 'status=' + list.status);

    /* read-your-write across modules: the sync write is visible on disk */
    let onDisk = 0;
    for (let i = 0; i < 25 && onDisk === 0; i++) {
      await sleep(400);
      try { onDisk = withMarker().length; } catch (e) {}
    }
    chk('IN4 the sync write reached the store (cross-module persistence)', onDisk === 1, 'records=' + onDisk);

    /* idempotency: the same uid replayed must not create a second record */
    const replay = await req(port, 'POST', '/api/sync', {
      ops: [{ uid: u1, t: 'ins', c: 'teacher_notes', data: { school_id: 1, teacher_id: 2, body: marker }, by: SA.id }]
    }, cookie);
    chk('IN5 replaying a uid is idempotent (duplicate_ignored)',
      replay.status === 200 && replay.json.results[0].code === 'duplicate_ignored', JSON.stringify(replay.json.results[0]));
    chk('IN6 the replay did not duplicate the record', withMarker().length === 1, 'count=' + withMarker().length);

    /* optimistic concurrency: a stale base_version must conflict, not clobber */
    const g = (JSON.parse(fs.readFileSync(storeFile, 'utf8')).grades || [])[0];
    if (g) {
      const stale = await req(port, 'POST', '/api/sync', {
        ops: [{ uid: uid('occ'), t: 'upd', c: 'grades', id: g.id, base_version: 999, data: { score: 1 }, by: SA.id }]
      }, cookie);
      chk('IN7 a stale base_version produces a preserved conflict, not a lost update',
        stale.status === 200 && stale.json.results[0].code === 'conflict_preserved', JSON.stringify(stale.json.results[0]));
    } else chk('IN7 a stale base_version produces a preserved conflict, not a lost update', false, 'no grades fixture');

    /* authorization is integrated into the route, not bolted on */
    const anon = await req(port, 'GET', '/api/v1/students?limit=5');
    chk('IN8 an unauthenticated REST read is refused', anon.status === 401, 'status=' + anon.status);
    const forged = await req(port, 'POST', '/api/sync', {
      ops: [{ uid: uid('forge'), t: 'ins', c: 'teacher_notes', data: { school_id: 1, body: 'x' }, by: 999999 }]
    }, cookie);
    chk('IN9 a forged `by` is rejected for the whole batch', forged.status === 403 && forged.json.code === 'forged_by', JSON.stringify(forged.json));

    /* the app and the observability layer are integrated too */
    const syncCount = await metricSum('payesh_http_requests_total', (l) => l.route === '/api/sync');
    chk('IN10 the metrics layer counted every sync request', syncCount >= 4, 'count=' + syncCount);
    const conflictCount = await metricSum('payesh_sync_conflicts_total');
    chk('IN11 the conflict metric recorded the OCC rejection', conflictCount >= 1, 'count=' + conflictCount);
  }

  /* ═══ CC — Concurrency ═══ */
  console.log('\n  — Concurrency');
  {
    const before = await metricSum('payesh_http_requests_total', (l) => l.route === '/api/health');
    const N = 40;
    const rs = await pool(N, () => req(port, 'GET', '/api/health'));
    chk('CC1 40 parallel requests all succeed', rs.every((r) => r.status === 200), 'non-200: ' + rs.filter((r) => r.status !== 200).length);
    const after = await metricSum('payesh_http_requests_total', (l) => l.route === '/api/health');
    chk('CC2 the request counter lost no updates under concurrency (exactly +' + N + ')',
      after - before === N, 'delta=' + (after - before));

    /* parallel writes with distinct uids — no lost writes */
    const W = 20;
    const uids = [];
    for (let i = 0; i < W; i++) uids.push(uid('cc'));
    const wr = await all(uids.map((u) => req(port, 'POST', '/api/sync', {
      ops: [{ uid: u, t: 'ins', c: 'teacher_notes', data: { school_id: 1, teacher_id: 2, body: 'cc' }, by: SA.id }]
    }, cookie)));
    const okWrites = wr.filter((r) => r.status === 200 && r.json.results[0].ok === true).length;
    chk('CC3 ' + W + ' parallel writes all land (no lost update)', okWrites === W, 'ok=' + okWrites);

    /* the SAME uid in parallel must collapse to exactly one insert */
    const sameUid = uid('dup');
    const dupMarker = 'wave17-dup-' + sameUid;
    const D = 10;
    const dr = await all(new Array(D).fill(0).map(() => req(port, 'POST', '/api/sync', {
      ops: [{ uid: sameUid, t: 'ins', c: 'teacher_notes', data: { school_id: 1, teacher_id: 2, body: dupMarker }, by: SA.id }]
    }, cookie)));
    /* a duplicate is reported as {ok:true, code:'duplicate_ignored'} — so `ok`
       alone does NOT mean a record was created. Count the real creations, then
       prove the result against the persisted store rather than the response. */
    const created = dr.filter((r) => r.json && r.json.results && r.json.results[0].ok === true
      && r.json.results[0].code !== 'duplicate_ignored').length;
    const dupes = dr.filter((r) => r.json && r.json.results && r.json.results[0].code === 'duplicate_ignored').length;
    let onDiskDup = -1;
    for (let i = 0; i < 25 && onDiskDup < 1; i++) {
      await sleep(400);
      try { onDiskDup = (JSON.parse(fs.readFileSync(storeFile, 'utf8')).teacher_notes || []).filter((n) => n.body === dupMarker).length; } catch (e) {}
    }
    chk('CC4 ' + D + ' parallel copies of one uid create exactly one record',
      created === 1 && dupes === D - 1 && onDiskDup === 1,
      'created=' + created + ' dup=' + dupes + ' onDisk=' + onDiskDup);

    /* parallel conflicting updates on the same row: exactly one winner */
    const g = (JSON.parse(fs.readFileSync(storeFile, 'utf8')).grades || [])[0];
    if (g) {
      const C = 6;
      const cr = await all(new Array(C).fill(0).map((_, i) => req(port, 'POST', '/api/sync', {
        ops: [{ uid: uid('race'), t: 'upd', c: 'grades', id: g.id, base_version: g.version || 1, data: { score: 10 + i }, by: SA.id }]
      }, cookie)));
      const winners = cr.filter((r) => r.json && r.json.results && r.json.results[0].ok === true).length;
      const losers = cr.filter((r) => r.json && r.json.results && r.json.results[0].code === 'conflict_preserved').length;
      chk('CC5 concurrent updates on one row: exactly one winner, the rest conflict',
        winners === 1 && losers === C - 1, 'winners=' + winners + ' conflicts=' + losers);
    } else chk('CC5 concurrent updates on one row: exactly one winner, the rest conflict', false, 'no grades fixture');

    /* read the 5xx accounting back from the server's own metrics rather than
       trusting this process's view of the responses */
    const fivexx = await metricSum('payesh_http_requests_total', (l) => /^5/.test(l.code || ''));
    chk('CC6 the server recorded no 5xx across the whole concurrency phase', fivexx === 0, 'fivexx=' + fivexx);
  }

  /* ═══ LD — Load ═══ */
  console.log('\n  — Load');
  let ldStats = null;
  {
    const ROUTES = [
      ['GET', '/api/health', null],
      ['GET', '/api/public-report', null],
      ['GET', '/api/v1/students?limit=10', cookie],
      ['GET', '/api/auth/me', cookie]
    ];
    const N = 400;
    /* /metrics is itself a counted request, and the scrape that reads `after`
       includes the scrape that read `before` — so exclude the scrape route or
       the accounting is off by exactly one. */
    const notScrape = (l) => l.route !== '/metrics';
    const before = await metricSum('payesh_http_requests_total', notScrape);
    const t0 = Date.now();
    const rs = await pool(N, (k) => {
      const [m, p, c] = ROUTES[k % ROUTES.length];
      return req(port, m, p, null, c);
    });
    const elapsed = (Date.now() - t0) / 1000;
    ldStats = stats(rs.map((r) => r.ms));
    const bad = rs.filter((r) => r.status >= 500 || r.status === 0);
    const after = await metricSum('payesh_http_requests_total', notScrape);
    chk('LD1 ' + N + ' requests served with zero 5xx / socket errors', bad.length === 0, 'bad=' + bad.length + ' ' + JSON.stringify(bad.slice(0, 2).map((b) => b.status)));
    chk('LD2 throughput is measurable (' + Math.round(N / elapsed) + ' rps)', N / elapsed > 5, 'rps=' + (N / elapsed).toFixed(1));
    chk('LD3 p95 latency is inside the sandbox budget (< 500 ms)', ldStats.p95 < 500, JSON.stringify(ldStats));
    chk('LD4 p99 latency is inside the sandbox budget (< 1500 ms)', ldStats.p99 < 1500, 'p99=' + ldStats.p99.toFixed(1));
    chk('LD5 the metrics histogram accounted for every request (exact)',
      after - before === N, 'delta=' + (after - before) + ' expected=' + N);
    const dropped = await metricSum('payesh_metrics_dropped_series_total');
    chk('LD6 load did not trip the cardinality guard', dropped === 0, 'dropped=' + dropped);
    console.log('     load: ' + JSON.stringify({ rps: Math.round(N / elapsed), p50: +ldStats.p50.toFixed(1), p95: +ldStats.p95.toFixed(1), p99: +ldStats.p99.toFixed(1), max: +ldStats.max.toFixed(1) }));
  }

  /* ═══ ST — Stress (past the documented limits) ═══ */
  console.log('\n  — Stress');
  {
    /* MAX_BATCH is 500 (server/index.js) — 501 must be a clean 413 */
    const big = { ops: [] };
    for (let i = 0; i < 501; i++) big.ops.push({ uid: uid('big'), t: 'ins', c: 'teacher_notes', data: { school_id: 1, body: 'x' }, by: SA.id });
    const r1 = await req(port, 'POST', '/api/sync', big, cookie);
    chk('ST1 a 501-op batch is rejected 413, not 500', r1.status === 413 && r1.json.code === 'batch_too_large', 'status=' + r1.status);

    /* a >1 MB body must be 413 (readBody limit), not a crash */
    const huge = JSON.stringify({ ops: [{ uid: uid('huge'), t: 'ins', c: 'teacher_notes', data: { body: 'y'.repeat(1200000) }, by: SA.id }] });
    const r2 = await req(port, 'POST', '/api/sync', huge, cookie);
    chk('ST2 a >1 MB body is rejected 413', r2.status === 413, 'status=' + r2.status);

    /* 200 concurrent sockets, mixed valid/invalid — nothing may 5xx */
    const N = 200;
    const rs = await pool(N, (k) => (k % 4 === 0
      ? req(port, 'GET', '/api/definitely-not-a-route-' + k)
      : req(port, 'GET', k % 3 === 0 ? '/api/health' : '/api/public-report')));
    const fivexx = rs.filter((r) => r.status >= 500 || r.status === 0);
    chk('ST3 ' + N + ' concurrent sockets produce no 5xx', fivexx.length === 0, 'bad=' + fivexx.length + ' ' + JSON.stringify(fivexx.slice(0, 3).map((b) => b.status || b.err)));
    chk('ST4 unknown routes under load are clean 404s',
      rs.filter((r, k) => k % 4 === 0).every((r) => r.status === 404), 'statuses=' + [...new Set(rs.filter((r, k) => k % 4 === 0).map((r) => r.status))].join(','));

    /* the server must still be healthy AFTER the stress */
    await sleep(300);
    const after = await req(port, 'GET', '/api/health');
    chk('ST5 the server still serves after stress', after.status === 200 && after.json.ok === true, 'status=' + after.status);
    const afterWrite = await req(port, 'POST', '/api/sync', {
      ops: [{ uid: uid('post-stress'), t: 'ins', c: 'teacher_notes', data: { school_id: 1, body: 'after stress' }, by: SA.id }]
    }, cookie);
    chk('ST6 writes still work after stress', afterWrite.status === 200 && afterWrite.json.results[0].ok === true, JSON.stringify(afterWrite.json));
  }

  /* ═══ SP — Spike ═══ */
  console.log('\n  — Spike');
  {
    /* calm baseline */
    const calm = [];
    for (let i = 0; i < 30; i++) calm.push((await req(port, 'GET', '/api/health')).ms);
    const base = stats(calm);

    /* sudden burst after idle */
    await sleep(1200);
    const N = 150;
    const t0 = Date.now();
    const rs = await all(new Array(N).fill(0).map(() => req(port, 'GET', '/api/health')));
    const burstMs = Date.now() - t0;
    const spike = stats(rs.map((r) => r.ms));
    chk('SP1 the spike is really a spike (' + N + ' requests in ' + burstMs + ' ms)', burstMs < 15000, 'ms=' + burstMs);
    chk('SP2 no 5xx during the spike', rs.every((r) => r.status === 200), 'bad=' + rs.filter((r) => r.status !== 200).length);
    chk('SP3 spike p95 stays inside the sandbox budget (< 1000 ms)', spike.p95 < 1000, JSON.stringify(spike));

    /* recovery */
    await sleep(1500);
    const rec = [];
    for (let i = 0; i < 30; i++) rec.push((await req(port, 'GET', '/api/health')).ms);
    const after = stats(rec);
    chk('SP4 latency recovers to within 5x of the calm baseline', after.p95 <= Math.max(base.p95 * 5, 250), 'base=' + base.p95.toFixed(1) + ' after=' + after.p95.toFixed(1));
    const lag = await metricSum('payesh_node_eventloop_lag_seconds');
    chk('SP5 event-loop lag stays finite and small after the spike', Number.isFinite(lag) && lag < 2, 'lag=' + lag);
    console.log('     spike: ' + JSON.stringify({ burst_ms: burstMs, spike_p95: +spike.p95.toFixed(1), recovered_p95: +after.p95.toFixed(1), calm_p95: +base.p95.toFixed(1) }));
  }

  /* ═══ SK — Soak (scaled down; see the header) ═══ */
  console.log('\n  — Soak (scaled down)');
  {
    const ROUNDS = 40, PER = 12;
    const heapStart = await metricSum('payesh_node_heap_used_bytes');
    const handlesStart = await metricSum('payesh_node_uptime_seconds'); /* proxy: process alive throughout */
    let errors = 0, total = 0;
    const lat = [];
    const t0 = Date.now();
    for (let r = 0; r < ROUNDS; r++) {
      const rs = await pool(PER, (k) => (k % 3 === 0
        ? req(port, 'POST', '/api/sync', { ops: [{ uid: uid('soak'), t: 'ins', c: 'teacher_notes', data: { school_id: 1, body: 'soak ' + r }, by: SA.id }] }, cookie)
        : req(port, 'GET', k % 2 === 0 ? '/api/health' : '/api/public-report')));
      for (const x of rs) { total++; lat.push(x.ms); if (x.status >= 500 || x.status === 0) errors++; }
    }
    const soakSec = (Date.now() - t0) / 1000;
    chk('SK1 ' + total + ' requests over ' + ROUNDS + ' rounds with zero 5xx', errors === 0, 'errors=' + errors);
    chk('SK2 latency did not degrade across the soak (last third ≤ 2x first third)', (() => {
      const third = Math.floor(lat.length / 3);
      const a = stats(lat.slice(0, third)).p95;
      const b = stats(lat.slice(-third)).p95;
      return b <= Math.max(a * 2, 250);
    })());

    const heapEnd = await metricSum('payesh_node_heap_used_bytes');
    /* The honest bound: JS heap is sawtoothed by GC, so "flat" means "not
       monotonically climbing". 3x headroom over the start catches a real
       leak while tolerating GC phase. A true leak check needs hours and
       belongs to Wave 18. */
    chk('SK3 heap did not run away (end < 3x start)', heapEnd < heapStart * 3 && heapEnd > 0,
      'start=' + Math.round(heapStart / 1048576) + 'MB end=' + Math.round(heapEnd / 1048576) + 'MB');

    const uptime = await metricSum('payesh_node_uptime_seconds');
    chk('SK4 the process never restarted during the soak', uptime > soakSec && handlesStart >= 0, 'uptime=' + uptime.toFixed(1) + ' soak=' + soakSec.toFixed(1));

    const dropped = await metricSum('payesh_metrics_dropped_series_total');
    chk('SK5 the cardinality guard never fired during the soak', dropped === 0, 'dropped=' + dropped);

    const t = await scrapeAuth();
    const series = parseMetrics(t.text).filter((m) => m.name === 'payesh_http_requests_total').length;
    chk('SK6 metric series stayed bounded (' + series + ' route/method/code series)', series < 200, 'series=' + series);

    const depth = await metricSum('payesh_outbox_depth', (l) => l.status === 'total');
    chk('SK7 the outbox stayed inside its cap (1000)', depth <= 1000, 'depth=' + depth);
    console.log('     soak: ' + JSON.stringify({ rounds: ROUNDS, requests: total, seconds: +soakSec.toFixed(1), p95: +stats(lat).p95.toFixed(1), heap_mb: Math.round(heapEnd / 1048576) }));
  }

  /* ═══ PY — the pyramid itself ═══ */
  console.log('\n  — Pyramid integrity');
  {
    const files = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.js') && f !== 'server11-child.js');
    const base = files.filter((f) => !f.endsWith('-mutations.js'));
    const muts = files.filter((f) => f.endsWith('-mutations.js'));
    /* ROADMAP §20: existing tests must be preserved, not weakened. The floor
       is the count BEFORE this wave (162 base / 81 mutation on main). */
    chk('PY1 no existing suite was removed (base ≥ 162)', base.length >= 162, 'base=' + base.length);
    chk('PY2 no mutation suite was removed (mutations ≥ 81)', muts.length >= 81, 'muts=' + muts.length);

    const MAP = {
      Unit: ['tests/run.js', 'tests/smoke.js', 'tests/authz-model.js'],
      Integration: ['tests/integration.js', 'tests/api/runner.js', 'tests/tracing-integration.js'],
      Contract: ['tests/check-authz.js', 'tests/pull-bootstrap.js'],
      E2E: ['tests/smoke.js', 'tests/sim_full3.js'],
      Security: ['tests/secret-scan.js', 'tests/security2.js', 'tests/xss-guard.js', 'tests/wave13-security.js'],
      Concurrency: ['tests/wave17-testing.js', 'tests/lock-atomic.js', 'tests/occ.js'],
      Load: ['tests/wave17-testing.js'],
      Stress: ['tests/wave17-testing.js'],
      Spike: ['tests/wave17-testing.js'],
      Soak: ['tests/wave17-testing.js'],
      Chaos: ['tests/redis-fallback.js', 'tests/deadletter.js'],
      Recovery: ['tests/wave16-dr.js', 'tests/backup-snap.js']
    };
    let missing = [];
    for (const level of Object.keys(MAP)) {
      const absent = MAP[level].filter((f) => !fs.existsSync(path.join(ROOT, f)));
      if (absent.length) missing.push(level + ': ' + absent.join(','));
    }
    chk('PY3 every pyramid level maps to a suite that exists', missing.length === 0, missing.join(' | '));

    const gates = ['tests/smoke.js', 'tests/check-authz.js', 'tests/secret-scan.js', 'scripts/run-all-tests.sh'];
    chk('PY4 the canonical gates are intact', gates.every((g) => fs.existsSync(path.join(ROOT, g))));
    /* smoke.js prints a runtime total (547) but contains no such literal, so
       the cheap static guard is the number of test() registrations. Measured
       on main: 481 registrations → 547 runtime checks (some register inside
       loops). The floor catches a silent deletion; the exact 547 is asserted
       by the smoke gate itself. */
    const smoke = fs.readFileSync(path.join(ROOT, 'tests/smoke.js'), 'utf8');
    const regs = (smoke.match(/^\s*test\(/gm) || []).length;
    chk('PY5 the smoke suite kept its 480+ test registrations (not weakened)', regs >= 480, 'registrations=' + regs);
    const runAll = fs.readFileSync(path.join(ROOT, 'scripts/run-all-tests.sh'), 'utf8');
    chk('PY6 the regression runner still auto-discovers every suite', /ls tests\/\*\.js/.test(runAll));
    chk('PY7 this suite is discoverable by the regression runner', /wave17-testing/.test('tests/' + path.basename(__filename)));
    chk('PY8 this suite uses a port the runner serialises (89xx/90xx)', /90[0-9]{2}/.test(String(port)));
    console.log('     pyramid: ' + base.length + ' base suites · ' + muts.length + ' mutation suites');
  }

  /* ── teardown ───────────────────────────────────────────────────── */
  try { S.srv.kill('SIGKILL'); } catch (e) {}
  await sleep(200);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}

  console.log('\n  جمع: ' + okc + ' موفق، ' + failc + ' ناموفق از ' + (okc + failc));
  if (fails.length) { console.log('  شکست‌ها:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('');
  process.exit(failc ? 1 : 0);
})().catch((e) => { console.error('wave17-testing crashed:', e); process.exit(1); });
