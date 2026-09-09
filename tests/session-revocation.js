#!/usr/bin/env node
/* tests/session-revocation.js — ابطالِ فوریِ نشست (denylist توزیع‌شده).
   گروه‌ها: UNIT (ماژول، همیشه) ،MOD (createAuth درون‌پروسه‌ای، همیشه) ،HTTP (بوت، همیشه) ،DIST (دو نمونه+Redis واقعی یا پرش).
   اجرا: node tests/session-revocation.js [--quick (فقط UNIT+MOD؛ برای CI/میوتیشن)] */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'server', 'index.js');
const SEED_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
const QUICK = process.argv.indexOf('--quick') >= 0;

const revocation = require('../server/revocation.js');
const redis = require('../server/redis.js');
const { createAuth } = require('../server/auth.js');

let pass = 0, fail = 0;
const failures = [];
function grp(t) { console.log('\n▸ ' + t); }
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name); console.log('  ❌ ' + name + (extra ? '\n     ' + String(extra).slice(0, 250) : '')); }
}
function skips(names, why) { names.forEach((n) => console.log('  ⏭️  ' + n + ' — ' + why)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── UNIT ─────────────────────────────────────────────── */
async function unitGroup() {
  grp('UNIT — ماژولِ revocation (همیشه)');
  const tag = 'u' + Date.now();
  chk('U-a ناشناخته مردود نیست', (await revocation.isRevoked(tag + ':nope')) === false);
  chk('U-b ورودیِ بد امن است', (await revocation.isRevoked(null)) === false &&
    (await revocation.revokeSession('', 60)) === false &&
    (await revocation.revokeAllUserSessions(null)) === 0 &&
    (await revocation.getSessionVersion(undefined)) === 0);
  const ok = await revocation.revokeSession(tag + ':a', 60);
  chk('U-c ابطال → مردود', ok === true && (await revocation.isRevoked(tag + ':a')) === true);
  const other = await revocation.isRevoked(tag + ':b');
  chk('U-d ایزولاسیونِ jti', other === false);
  await revocation.revokeSession(tag + ':short', 2);
  const before = await revocation.isRevoked(tag + ':short');
  await sleep(2300);
  const after = await revocation.isRevoked(tag + ':short');
  chk('U-e انقضای denylist', before === true && after === false);
  const uid = 'uav' + Date.now();
  const v0 = await revocation.getSessionVersion(uid);
  const v1 = await revocation.revokeAllUserSessions(uid);
  const v1b = await revocation.revokeAllUserSessions(uid);
  const vget = await revocation.getSessionVersion(uid);
  const visol = await revocation.getSessionVersion(uid + ':other');
  chk('U-f نسخه صعودی (۰→۱→۲) و ایزوله', v0 === 0 && v1 === 1 && v1b === 2 && vget === 2 && visol === 0,
    'v0=' + v0 + ' v1=' + v1 + ' v2=' + v1b + ' get=' + vget);
}

/* ── MOD: createAuth درون‌پروسه‌ای ────────────────────── */
function fakeRes() {
  return { headers: {}, setHeader(n, v) { this.headers[n] = v; } };
}
function cookieReq(name, tok) {
  return { headers: { cookie: name + '=' + tok } };
}
function tokenFrom(res) {
  const sc = res.headers['Set-Cookie'] || '';
  const m = /=([^;]+)/.exec(sc);
  return m ? m[1] : null;
}
async function modGroup() {
  grp('MOD — نشستِ واقعی (createAuth، همیشه)');
  if (!fs.existsSync(SEED_STORE)) { chk('M-0 سید هست', false); return; }
  const seed = JSON.parse(fs.readFileSync(SEED_STORE, 'utf8'));
  const user = seed.users.find((u) => u.phone && u.national_id && u.active !== 0);
  if (!user) { chk('M-0 کاربرِ شناخته‌شده هست', false); return; }
  const store = { users: seed.users.slice(0, 50), __revoked_jti: {} };
  const NAME = 'payesh_session';
  const auth = createAuth({ store, JWT_SECRET: 'm'.repeat(40), SESSION_NAME: NAME,
    SESSION_TTL_S: 28800, CODE_TTL_MS: 120000, DEMO_CODE_ECHO: 0,
    audit: () => {}, isHttps: () => false, markDirty: () => {}, otp: null });
  /* ورود ← معتبر */
  const r1 = fakeRes();
  await auth.setSessionCookie({}, r1, user);
  const t1 = tokenFrom(r1);
  const s1 = await auth.sessionFrom(cookieReq(NAME, t1));
  chk('M-a نشستِ تازه معتبر است', !!s1 && s1.id === user.id);
  /* ابطالِ تکی ← همان نشست می‌میرد */
  const jti1 = auth.jwtVerify(t1).payload.jti;
  await revocation.revokeSession(jti1, 28800);
  const s1dead = await auth.sessionFrom(cookieReq(NAME, t1));
  chk('M-b ابطالِ تکی نشست را می‌کشد', s1dead === null);
  /* ورودِ دوم ← معتبر؛ revoke-all ← می‌میرد (کاربر زنده است!) */
  const r2 = fakeRes();
  await auth.setSessionCookie({}, r2, user);
  const t2 = tokenFrom(r2);
  const s2 = await auth.sessionFrom(cookieReq(NAME, t2));
  const ver = await revocation.revokeAllUserSessions(user.id);
  const s2dead = await auth.sessionFrom(cookieReq(NAME, t2));
  const alive = store.users.some((u) => u.id === user.id);
  chk('M-c revoke-all با کاربرِ زنده نشست را می‌کشد', !!s2 && ver >= 1 && s2dead === null && alive);
  /* ورودِ سوم (پس از revoke-all) ← معتبر (نسخهٔ تازه) */
  const r3 = fakeRes();
  await auth.setSessionCookie({}, r3, user);
  const t3 = tokenFrom(r3);
  const s3 = await auth.sessionFrom(cookieReq(NAME, t3));
  chk('M-d ورودِ پس از revoke-all معتبر است', !!s3 && s3.id === user.id);
  /* توکنِ قدیمیِ بدونِ sv تا اولین revoke-all معتبر است (سازگاری) */
  const legacy = auth.jwtSign({ sub: user.id, role: user.role, iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 28800, jti: 'jt_legacy' + Date.now() });
  const user2 = seed.users.find((u) => u.id !== user.id && u.active !== 0);
  const legacy2 = auth.jwtSign({ sub: user2.id, role: user2.role, iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 28800, jti: 'jt_legacy' + Date.now() + 'x' });
  const sleg = await auth.sessionFrom(cookieReq(NAME, legacy2));
  chk('M-e توکنِ بدونِ sv (کاربرِ بدونِ revoke) معتبر است', !!sleg && sleg.id === user2.id);
}

/* ── HTTP ─────────────────────────────────────────────── */
/* F-CSRF-01: نگهبانِ مرکزیِ CSRF سرور، جهش‌های احراز‌شده را بدونِ
   X-CSRF-Token رد می‌کند. تست هم مثلِ مرورگر عمل می‌کند: کوکیِ csrf_token
   را از شیشهٔ کوکی می‌خواند و در سرآیند بازمی‌گرداند (double-submit). */
const csrfHdr = (c) => { const m = /(?:^|;\s*)csrf_token=([^;]+)/.exec(String(c || '')); return m ? { 'X-CSRF-Token': m[1] } : {}; };
const jarOf = (h) => (Array.isArray(h) ? h.join(', ') : String(h || ''))
  .split(/,(?=\s*[A-Za-z0-9_!#$%&'*+\-.^`|~]+=)/)
  .map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
function apiRequest(port, method, urlPath, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {};
    if (data) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(data); }
    if (cookie) { headers.cookie = cookie; Object.assign(headers, csrfHdr(cookie)); }
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, json, setCookie: res.headers['set-cookie'] });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
    if (data) req.end(data); else req.end();
  });
}
function portFree(port) {
  return new Promise((resolve) => {
    const s = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1200 }, (res) => {
      res.resume(); s.destroy(); resolve(false);
    });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.on('error', () => resolve(true));
  });
}
async function pickPort(base) {
  for (let p = base; p < base + 40; p++) { if (await portFree(p)) return p; }
  throw new Error('پورتِ آزاد نیست');
}
async function bootApp(port, tmp, extraEnv) {
  const storeP = path.join(tmp, 's-' + port + '.json');
  fs.copyFileSync(SEED_STORE, storeP);
  const child = cp.spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: String(port), HOST: '127.0.0.1', PAYESH_STORE: storeP,
      PAYESH_AUDIT: path.join(tmp, 'a-' + port + '.log'),
      PAYESH_KEY: path.join(tmp, 'k-' + port + '.key'),
      PAYESH_DEMO_CODE: '1', PAYESH_SMS_COOLDOWN_S: '0'
    }, extraEnv || {}),
    stdio: ['ignore', 'ignore', 'ignore']
  });
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    try {
      const r = await apiRequest(port, 'GET', '/api/health');
      if (r.status === 200) return child;
    } catch (e) {}
    await sleep(250);
  }
  try { child.kill('SIGKILL'); } catch (e) {}
  return null;
}
async function loginAs(port, u) {
  const sc = await apiRequest(port, 'POST', '/api/auth/send-code', { phone: u.phone });
  const code = sc.json && sc.json.demo_code;
  if (!code) return null;
  const lg = await apiRequest(port, 'POST', '/api/auth/login',
    { phone: u.phone, code, national_id: u.national_id });
  if (lg.status !== 200 || !lg.setCookie) return null;
  return jarOf(lg.setCookie);
}
async function httpGroup() {
  grp('HTTP — چرخهٔ واقعی (همیشه)');
  if (!fs.existsSync(SEED_STORE)) { chk('H-0 سید هست', false); return; }
  const seed = JSON.parse(fs.readFileSync(SEED_STORE, 'utf8'));
  const users = seed.users.filter((u) => u.phone && u.national_id && u.active !== 0);
  if (users.length < 2) { chk('H-0 دو کاربر هست', false); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-rev-'));
  const port = await pickPort(18961);
  const child = await bootApp(port, tmp);
  chk('H-0 بوت', !!child);
  if (!child) return;
  try {
    const c1 = await loginAs(port, users[0]);
    chk('H-a ورود ← نشست', !!c1);
    if (!c1) return;
    const me1 = await apiRequest(port, 'GET', '/api/auth/me', null, c1);
    chk('H-b نشست معتبر (me ← ۲۰۰)', me1.status === 200);
    const lo = await apiRequest(port, 'POST', '/api/auth/logout', {}, c1);
    const meDead = await apiRequest(port, 'GET', '/api/auth/me', null, c1);
    chk('H-c خروج ← نشست می‌میرد', lo.status === 200 && meDead.status === 401,
      'logout=' + lo.status + ' me=' + meDead.status);
    /* حذفِ حساب ← نشست می‌میرد (کاربرِ دوم، چون اولی هنوز لازم است) */
    const c2 = await loginAs(port, users[1]);
    /* حذفِ حساب حالا احرازِ مجدّد می‌خواهد (F-CSRF-01): رمزِ یک‌بارمصرفِ تازه */
    let del = null;
    if (c2) {
      const sc2 = await apiRequest(port, 'POST', '/api/auth/send-code', { phone: users[1].phone });
      const code2 = sc2.json && sc2.json.demo_code;
      del = await apiRequest(port, 'POST', '/api/auth/delete-account', { code: code2 }, c2);
    }
    const meDel = c2 ? await apiRequest(port, 'GET', '/api/auth/me', null, c2) : null;
    chk('H-d حذفِ حساب ← نشست می‌میرد', !!c2 && del.status === 200 && meDel.status === 401,
      'del=' + (del && del.status) + ' me=' + (meDel && meDel.status));
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

/* ── DIST: دو نمونه + Redis واقعی ─────────────────────── */
function findRedisServer() {
  const cands = ['/usr/bin/redis-server', '/usr/local/bin/redis-server'];
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  try {
    const w = cp.execSync('which redis-server', { stdio: 'pipe' }).toString().trim().split('\n')[0];
    if (w && fs.existsSync(w)) return w;
  } catch (e) {}
  return null;
}
async function startRedis() {
  const bin = findRedisServer();
  if (!bin) return null;
  const port = await pickPort(16389);
  const proc = cp.spawn(bin, ['--port', String(port), '--save', '', '--appendonly', 'no',
    '--daemonize', 'no', '--logfile', '', '--protected-mode', 'no'], { stdio: ['ignore', 'ignore', 'ignore'] });
  const url = 'redis://127.0.0.1:' + port;
  const RedisLib = require('ioredis');
  const probe = new RedisLib(url, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
  probe.on('error', () => {});
  let ok = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    try { if ((await probe.ping()) === 'PONG') { ok = true; break; } } catch (e) {}
    await sleep(250);
  }
  try { probe.disconnect(); } catch (e) {}
  if (!ok) { try { proc.kill('SIGKILL'); } catch (e) {} return null; }
  return { proc, url };
}
async function distGroup() {
  grp('DIST — ابطالِ بین‌نمونه‌ای (Redis واقعی یا پرش)');
  const names = ['D-a', 'D-b'];
  if (!fs.existsSync(SEED_STORE)) { skips(names, 'سید نیست'); return; }
  const ctx = await startRedis();
  if (!ctx) { skips(names, 'redis-server نیست'); return; }
  const seed = JSON.parse(fs.readFileSync(SEED_STORE, 'utf8'));
  const users = seed.users.filter((u) => u.phone && u.national_id && u.active !== 0);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-revd-'));
  let A = null, B = null;
  try {
    const portA = await pickPort(18971);
    const portB = await pickPort(18981);
    /* کلیدِ JWT مشترک (مثلِ تولید)؛ وگرنه B امضای A را رد می‌کند و D-b خلا می‌شود. */
    const sharedKey = path.join(tmp, 'k-shared.key');
    A = await bootApp(portA, tmp, { REDIS_URL: ctx.url, PAYESH_KEY: sharedKey });
    B = await bootApp(portB, tmp, { REDIS_URL: ctx.url, PAYESH_KEY: sharedKey });
    if (!A || !B) { skips(names, 'بوت ناموفق'); return; }
    /* ورود در A ← معتبر در B (نشستِ توزیع‌شده) */
    const c = await loginAs(portA, users[0]);
    const meB = c ? await apiRequest(portB, 'GET', '/api/auth/me', null, c) : null;
    chk('D-a نشستِ A در B معتبر است', !!c && meB.status === 200);
    if (!c) return;
    /* خروج در A ← همان لحظه در B مرده است */
    await apiRequest(portA, 'POST', '/api/auth/logout', {}, c);
    const meBdead = await apiRequest(portB, 'GET', '/api/auth/me', null, c);
    chk('D-b خروج در A ← نشست در B می‌میرد (ابطالِ فوری)', meBdead.status === 401,
      'meB=' + meBdead.status);
  } finally {
    try { A && A.kill('SIGKILL'); } catch (e) {}
    try { B && B.kill('SIGKILL'); } catch (e) {}
    try { ctx.proc.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

/* ── main ─────────────────────────────────────────────── */
(async function main() {
  try {
    await unitGroup();
    await modGroup();
    if (QUICK) {
      console.log('\n(HTTP/DIST با --quick پرش شدند)');
    } else {
      await httpGroup();
      await distGroup();
    }
  } catch (e) {
    fail++;
    failures.push('crash: ' + String((e && e.message) || e));
    console.log('  ❌ کرش: ' + String((e && e.stack) || e).slice(0, 400));
  }
  try { await redis.close(); } catch (e) {}
  console.log('\n' + '─'.repeat(52));
  console.log('جمع: ' + pass + ' موفق، ' + fail + ' ناموفق از ' + (pass + fail));
  if (failures.length) console.log('ناموفق‌ها: ' + failures.join(' | ').slice(0, 400));
  console.log('─'.repeat(52) + '\n');
  process.exit(fail ? 1 : 0);
})();
