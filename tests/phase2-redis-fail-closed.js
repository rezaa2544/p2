#!/usr/bin/env node
/* Phase-2 remediation directive — BLOCKER 5 acceptance:
   Redis configured but DOWN ⇒ auth rate-limiting FAILS CLOSED (503 redis_required),
   never `200 / allowed:true` via a RAM fallback.
   Modes:
   • own redis-server binary found  ⇒ full cycle: 200 → kill → 503 → restart → 200
   • external REDIS_URL (e.g. CI service) ⇒ 200 → SHUTDOWN via ioredis → 503
   Without any runnable Redis this test FAILS (exit 1) — never fake-green. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');

const NODE = process.execPath;
const ROOT = path.join(__dirname, '..');
const PORT = 3104;
const RPORT = 17000 + (process.pid % 2000);   /* per-run port — a stale redis from a crashed earlier run must not be reused */
const results = [];
function chk(name, ok, detail) { results.push(ok); console.log((ok ? '✅ ' : '❌ ') + name + (detail != null ? ' — ' + String(detail).slice(0, 160) : '')); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(method, p, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method,
      headers: Object.assign({ 'content-type': 'application/json' }, data ? { 'content-length': Buffer.byteLength(data) } : {}) },
      (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
    r.on('error', () => resolve({ status: 0, body: '' }));
    if (data) r.write(data); r.end();
  });
}

(async () => {
  /* find a runnable Redis */
  let redisProc = null;
  const ownBin = ['/usr/bin/redis-server', '/usr/local/bin/redis-server'].find((p) => { try { fs.accessSync(p); return true; } catch (e) { return false; } });
  const external = process.env.REDIS_URL && !ownBin;
  if (ownBin) {
    const rlog = fs.openSync(path.join(os.tmpdir(), 'p2-redis-test.log'), 'w');
    redisProc = spawn(ownBin, ['--port', String(RPORT), '--save', '', '--appendonly', 'no', '--dir', os.tmpdir()], { stdio: ['ignore', rlog, rlog] });
    await sleep(900);
    if (redisProc.exitCode != null) { console.log('── redis-server exited early code=' + redisProc.exitCode + ' — log: ' + fs.readFileSync(path.join(os.tmpdir(), 'p2-redis-test.log'), 'utf8').slice(0, 400)); }
  }
  const RURL = ownBin ? `redis://127.0.0.1:${RPORT}` : process.env.REDIS_URL;
  if (!RURL) { console.error('❌ no runnable Redis (no redis-server binary, no REDIS_URL) = FAIL (exit 1)'); process.exit(1); }

  const KEY = path.join(os.tmpdir(), 'rdx-jwt.key');
  const STORE = path.join(os.tmpdir(), 'rdx-store.json');
  try { fs.unlinkSync(STORE); } catch (e) {}
  execSync(`${NODE} server/seed.js`, { cwd: ROOT, env: Object.assign({}, process.env, { PAYESH_STORE: STORE }), stdio: 'pipe' });
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), STORE);   /* seed.js writes the default path only */

  const env = Object.assign({}, process.env, {
    PORT: String(PORT), HOST: '127.0.0.1', PAYESH_STORE: STORE,
    PAYESH_DEMO_CODE: '1', PAYESH_KEY: KEY, REDIS_URL: RURL,
    PAYESH_OTP_FILE: path.join(os.tmpdir(), 'rdx-otp-' + Date.now() + '.json')
  });
  delete env.NODE_ENV; delete env.DATABASE_URL;

  const proc = await new Promise((resolve) => {
    const p = spawn(NODE, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    p.stdout.on('data', (d) => (log += d)); p.stderr.on('data', (d) => (log += d));
    p.__log = () => log;
    (async () => {
      for (let i = 0; i < 120; i++) { const h = await req('GET', '/api/health'); if (h.status === 200) return resolve(p); await sleep(250); }
      console.error(log.slice(-600)); resolve(null);
    })();
  });
  chk('سرور با Redis واقعی بالا آمد', !!proc);
  if (!proc) process.exit(1);

  const st = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  const su = (st.users || []).find((u) => u.role === 'superadmin');
  /* per-phase phones: the 60s OTP COOLDOWN fires before the rate limiter and
     would mask the fail-closed behavior with 429 (reproduced live) */
  const phones = [su.phone,
    (st.users.find((u) => u.phone && u.phone !== su.phone) || {}).phone,
    (st.users.find((u) => u.phone && u.phone !== su.phone && u.phone !== (st.users.find((x) => x.phone && x.phone !== su.phone) || {}).phone) || {}).phone];
  if (phones.filter(Boolean).length < 3) { console.error('❌ need 3 distinct phones'); process.exit(1); }

  /* sanity: with Redis ALIVE the limiter answers through it */
  let h1 = await req('POST', '/api/auth/send-code', { phone: phones[0] });
  chk('Redis زنده ⇒ send-code موفق (200)', h1.status === 200, h1.status + ' ' + h1.body.slice(0, 80));

  /* kill Redis */
  if (redisProc) {
    redisProc.kill('SIGKILL');
  } else {
    const Redis = require('ioredis');
    const k = new Redis(RURL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, retryStrategy: () => null, connectTimeout: 1000 });
    try { await k.call('shutdown', 'nosave'); } catch (e) { /* connection dies with the server — expected */ }
    try { k.disconnect(); } catch (e) {}
  }
  await sleep(1500);
  try { const rc = new RC(RURL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, retryStrategy: () => null, connectTimeout: 800 }); const pr = await rc.ping(); console.log('── DEBUG ping after kill:', pr, '| killed=', redisProc.killed, 'exitCode=', redisProc.exitCode); rc.disconnect(); } catch (e) { console.log('── DEBUG ping after kill: DEAD (', e.message, ') | killed=', redisProc.killed, 'exitCode=', redisProc.exitCode); }

  /* FAIL CLOSED: the OTP limiter must 503, never fall back to RAM */
  let h2 = { status: 0, body: '' };
  for (let i = 0; i < 5; i++) {
    h2 = await req('POST', '/api/auth/send-code', { phone: phones[1] });
    if (h2.status === 503) break;
    await sleep(700);
  }
  chk('Redis قطع ⇒ send-code 503 redis_required (fail closed)', h2.status === 503, h2.status + ' ' + h2.body.slice(0, 100));
  let bodyOk = false;
  try { bodyOk = JSON.parse(h2.body).code === 'redis_required'; } catch (e) {}
  chk('بدنهٔ خطا code=redis_required', bodyOk, h2.body.slice(0, 80));

  /* login path must fail closed too */
  const h3 = await req('POST', '/api/auth/login', { phone: su.phone, code: '123456', national_id: su.national_id });
  chk('Redis قطع ⇒ login هم 503 (نه 200)', h3.status === 503, h3.status);

  /* restart redis ⇒ full recovery */
  if (redisProc) {
    redisProc = spawn(ownBin, ['--port', String(RPORT), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
    await sleep(1200);
    let recovered = false;
    for (let i = 0; i < 6; i++) {
      const h4 = await req('POST', '/api/auth/send-code', { phone: phones[2] });
      if (h4.status === 200) { recovered = true; break; }
      await sleep(800);
    }
    chk('Redis برگشت ⇒ send-code دوباره 200 (recovery)', recovered);
    try { redisProc.kill('SIGKILL'); } catch (e) {}
  }

  try { proc.kill('SIGTERM'); } catch (e) {}
  const pass = results.filter(Boolean).length;
  console.log('\n════ PHASE2 REDIS FAIL-CLOSED: ' + pass + '/' + results.length + ' ════');
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('FATAL', e && e.message); process.exit(1); });
