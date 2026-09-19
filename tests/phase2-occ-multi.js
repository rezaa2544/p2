#!/usr/bin/env node
/* Phase-2 remediation directive — BLOCKER 4 acceptance:
   OCC across TWO REAL server processes (ports 3101/3102).
   10 concurrent writers on the same versioned record ⇒ expect
   exactly 1 success, 9 conflicts, 0 lost updates, and 9 recorded
   sync_conflicts rows in PostgreSQL (SSoT).
   Without DATABASE_URL this test FAILS (exit 1) — never fake-green. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const { Client } = require('pg');

const NODE = process.execPath;
const ROOT = path.join(__dirname, '..');
const results = [];
function chk(name, ok, detail) { results.push(ok); console.log((ok ? '✅ ' : '❌ ') + name + (detail != null ? ' — ' + String(detail).slice(0, 200) : '')); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(port, method, p, body, cookie) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port, path: p, method,
      headers: Object.assign({ 'content-type': 'application/json' },
        data ? { 'content-length': Buffer.byteLength(data) } : {}, cookie ? { cookie } : {}) },
      (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ status: res.statusCode, json: j, body: b, headers: res.headers }); }); });
    r.on('error', () => resolve({ status: 0, json: null, body: '', headers: {} }));
    if (data) r.write(data); r.end();
  });
}
function boot(port, env) {
  return new Promise((resolve) => {
    const proc = spawn(NODE, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    proc.stdout.on('data', (d) => (log += d)); proc.stderr.on('data', (d) => (log += d));
    proc.__log = () => log;
    (async () => {
      for (let i = 0; i < 120; i++) { const h = await req(port, 'GET', '/api/health'); if (h.status === 200) return resolve(proc); await sleep(250); }
      console.error(log.slice(-800)); resolve(null);
    })();
  });
}
function stop(proc) { return new Promise((r) => { if (!proc) return r(); proc.on('exit', r); proc.kill('SIGTERM'); setTimeout(r, 5000); }); }
async function pgOne(url, sql, params) { const c = new Client({ connectionString: url }); await c.connect(); const r = await c.query(sql, params || []); await c.end(); return r.rows; }

(async () => {
  const BASE_URL = process.env.DATABASE_URL;
  if (!BASE_URL) { console.error('❌ DATABASE_URL required — dependency missing = FAIL (exit 1)'); process.exit(1); }
  const OCC_URL = process.env.P2_OCC_DATABASE_URL ||
    BASE_URL.replace(/\/[^/?]+(\?.*)?$/, (m, q) => ('/payesh_p2occ' + (q || '')));
  const KEY = path.join(os.tmpdir(), 'occ-jwt-' + Date.now() + '.key');
  const STORE = path.join(os.tmpdir(), 'occ-store-' + Date.now() + '.json');

  /* fresh dedicated database */
  const adm = new Client({ connectionString: BASE_URL });
  await adm.connect();
  await adm.query('DROP DATABASE IF EXISTS payesh_p2occ').catch(() => {});
  await adm.query('CREATE DATABASE payesh_p2occ');
  await adm.end();

  /* BLOCKER 2 acceptance: migrate-to-pg --execute builds the WHOLE schema
     (two-phase DDL) on an EMPTY database — this DB is exclusively its own. */
  /* fresh bootstrap store + one-time seed into PG (migrate-to-pg --execute) */
  execSync(`${NODE} server/seed.js`, { cwd: ROOT, env: Object.assign({}, process.env, { PAYESH_STORE: STORE }), stdio: 'pipe' });
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), STORE);   /* seed.js writes the default path only */
  execSync(`${NODE} tools/migrate-to-pg.js --execute`, { cwd: ROOT, env: Object.assign({}, process.env, { DATABASE_URL: OCC_URL, PAYESH_STORE: STORE }), stdio: 'pipe' });
  const nTables = await pgOne(OCC_URL, "SELECT COUNT(*)::int n FROM information_schema.tables WHERE table_schema='public'");
  chk('seed واقعی bootstrap→PG (migrate-to-pg)', nTables[0].n > 50, 'tables=' + nTables[0].n);

  const OTPF = path.join(os.tmpdir(), 'occ-otp-' + Date.now() + '.json');   /* isolation: cooldown state of previous runs */
  const envOf = (port) => Object.assign({}, process.env, {
    PORT: String(port), HOST: '127.0.0.1', DATABASE_URL: OCC_URL,
    PAYESH_STORE: STORE, PAYESH_DEMO_CODE: '1', PAYESH_KEY: KEY, PAYESH_OTP_FILE: OTPF
  });
  delete envOf(3101).NODE_ENV; delete envOf(3102).NODE_ENV;

  const A = await boot(3101, envOf(3101));
  const B = await boot(3102, envOf(3102));
  chk('دو instance واقعی بالا آمدند (3101/3102)', !!(A && B), `${!!A}/${!!B}`);
  if (!A || !B) process.exit(1);

  /* one login — same JWT secret ⇒ cookie valid on BOTH instances */
  const st = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  const su = (st.users || []).find((u) => u.role === 'superadmin');
  const sc = await req(3101, 'POST', '/api/auth/send-code', { phone: su.phone });
  const lg = await req(3101, 'POST', '/api/auth/login', { phone: su.phone, code: sc.json && sc.json.demo_code, national_id: su.national_id });
  const cookie = (lg.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  chk('ورود superadmin (instance A)', lg.status === 200, lg.status);
  const pingB = await req(3102, 'GET', '/api/v1/analytics/overview?school_id=' + (su.school_id || 1), null, cookie);
  chk('نشست روی instance B هم معتبر است (JWT مشترک)', pingB.status !== 401, pingB.status);

  /* the contested record + its AUTHORITATIVE version from PG */
  const g = (st.grades || [])[0];
  const vrows = await pgOne(OCC_URL, 'SELECT id, version, score FROM grades WHERE id = $1', [g.id]);
  const v0 = Number(vrows[0].version || 1);
  chk('رکورد هدف آماده است (grades id=' + g.id + ', version=' + v0 + ')', vrows.length === 1);

  /* 10 concurrent writers: 5 via A, 5 via B, same base_version */
  const writers = [];
  for (let i = 0; i < 10; i++) {
    const port = i % 2 === 0 ? 3101 : 3102;
    writers.push(req(port, 'PATCH', '/api/v1/grades/' + g.id, { score: 10 + i, base_version: v0 }, cookie).then((r) => ({ i, r })));
  }
  const settled = await Promise.all(writers);
  const okArr = settled.filter((x) => x.r.status >= 200 && x.r.status < 300);
  const cfArr = settled.filter((x) => x.r.status === 409);
  chk('دقیقاً ۱ موفق از ۱۰ writer همزمان', okArr.length === 1, 'ok=' + okArr.length);
  chk('دقیقاً ۹ تعارض 409', cfArr.length === 9, 'conflict=' + cfArr.length);

  /* 0 lost updates: PG truth has the winner's score and version v0+1 */
  const after = await pgOne(OCC_URL, 'SELECT version, score FROM grades WHERE id = $1', [g.id]);
  const winner = okArr[0];
  chk('نسخهٔ نهایی PG = v0+1 (بدون lost update)', Number(after[0].version) === v0 + 1, 'version=' + after[0].version);
  chk('score نهایی = scoreِ برنده (دقیقاً یکی اعمال شد)', Number(after[0].score) === 10 + winner.i, 'score=' + after[0].score + ' winner=' + (10 + winner.i));

  /* every rejected write is RECORDED in sync_conflicts (SSoT) */
  const cfRows = await pgOne(OCC_URL, "SELECT COUNT(*)::int n FROM sync_conflicts WHERE collection='grades' AND record_id=$1 AND status='open'", [g.id]);
  chk('۹ تعارضِ ردشده در sync_conflicts ثبت شد', cfRows[0].n >= 9, 'rows=' + cfRows[0].n);

  await stop(A); await stop(B);
  try { fs.unlinkSync(KEY); } catch (e) {}
  const pass = results.filter(Boolean).length;
  console.log('\n════ PHASE2 OCC MULTI-INSTANCE: ' + pass + '/' + results.length + ' ════');
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('FATAL', e && e.message); process.exit(1); });
