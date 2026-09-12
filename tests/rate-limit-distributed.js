#!/usr/bin/env node
/* tests/rate-limit-distributed.js — شمارندهٔ اتمیکِ Redis + هماهنگیِ چندنمونه‌ای.
   گروه‌ها: RL (واحد، همیشه) ،ATOMIC/EXPIRE (Redis واقعی یا پرش) ،DIST (دو نمونهٔ HTTP با یک Redis) ،FB (fallback بدونِ Redis).
   اجرا: node tests/rate-limit-distributed.js [--unit-only (بدونِ بوت/Redis؛ برای CI)] */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'server', 'index.js');
const SEED_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
const UNIT_ONLY = process.argv.indexOf('--unit-only') >= 0;

const rl = require('../server/rate-limit.js');
const redis = require('../server/redis.js');

let pass = 0, fail = 0;
const failures = [];
function grp(t) { console.log('\n▸ ' + t); }
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name); console.log('  ❌ ' + name + (extra ? '\n     ' + String(extra).slice(0, 250) : '')); }
}
function skips(names, why) { names.forEach((n) => console.log('  ⏭️  ' + n + ' — ' + why)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── RL: واحد (fallback — همیشه) ─────────────────────────── */
async function rlGroup() {
  grp('RL — ریاضیِ شمارنده (fallback، همیشه)');
  chk('RL-a شکلِ کلید', rl.getKey('otp:send:ip', '1.2.3.4') === 'rate:otp:send:ip:1.2.3.4');
  const tag = 'tu' + Date.now();
  const rs = [];
  for (let i = 0; i < 4; i++) rs.push(await rl.checkRateLimit({ prefix: tag, identifier: 'k', limit: 3, windowSeconds: 60 }));
  chk('RL-b مرزِ دقیق (۳ مجاز + چهارمی مردود)', rs[0].allowed && rs[1].allowed && rs[2].allowed && !rs[3].allowed,
    JSON.stringify(rs.map((r) => r.allowed)));
  chk('RL-c باقیمانده نزولی (۲،۱،۰،۰)', rs[0].remaining === 2 && rs[1].remaining === 1 && rs[2].remaining === 0 && rs[3].remaining === 0,
    JSON.stringify(rs.map((r) => r.remaining)));
  chk('RL-d سقف و ریست معتبر', rs[0].limit === 3 && rs[0].reset > 0 && rs[0].reset <= 60, 'reset=' + rs[0].reset);
  const other = await rl.checkRateLimit({ prefix: tag, identifier: 'other', limit: 3, windowSeconds: 60 });
  chk('RL-e ایزولاسیونِ شناسه‌ها', other.allowed && other.remaining === 2);
  /* انقضا روی fallback (پنجرهٔ ۲ثانیه‌ای) */
  const wtag = 'tw' + Date.now();
  for (let i = 0; i < 2; i++) await rl.checkRateLimit({ prefix: wtag, identifier: 'k', limit: 2, windowSeconds: 2 });
  const denied = await rl.checkRateLimit({ prefix: wtag, identifier: 'k', limit: 2, windowSeconds: 2 });
  await sleep(2300);
  const fresh = await rl.checkRateLimit({ prefix: wtag, identifier: 'k', limit: 2, windowSeconds: 2 });
  chk('RL-f انقضای پنجره (مردود → تازه)', !denied.allowed && fresh.allowed && fresh.remaining === 1);
  /* fail-open: خرابیِ کاملِ Redis — BH-mut یافته: استاب باید روی
     incrByWithTtl باشد (مسیرِ واقعیِ rate-limit از P0-TTL)، نه incr. */
  const realIncr = redis.incrByWithTtl;
  try {
    redis.incrByWithTtl = async () => { throw new Error('boom'); };
    const fo = await rl.checkRateLimit({ prefix: 'tfail', identifier: 'k', limit: 5, windowSeconds: 60 });
    chk('RL-g خرابی = fail-open', fo.allowed === true && fo.remaining === 5);
  } finally {
    redis.incrByWithTtl = realIncr;
  }
}

/* ── Redis واقعی ─────────────────────────────────────────── */
function findRedisServer() {
  const cands = ['/usr/bin/redis-server', '/usr/local/bin/redis-server', '/opt/redis/bin/redis-server'];
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  try {
    const w = cp.execSync('which redis-server', { stdio: 'pipe' }).toString().trim().split('\n')[0];
    if (w && fs.existsSync(w)) return w;
  } catch (e) {}
  return null;
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
async function startRedis() {
  const bin = findRedisServer();
  if (!bin) return null;
  const port = await pickPort(16379);
  const proc = cp.spawn(bin, ['--port', String(port), '--save', '', '--appendonly', 'no',
    '--daemonize', 'no', '--logfile', '', '--protected-mode', 'no'], { stdio: ['ignore', 'ignore', 'ignore'] });
  const url = 'redis://127.0.0.1:' + port;
  const RedisLib = require('ioredis');
  const probe = new RedisLib(url, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
  let ok = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    try { if ((await probe.ping()) === 'PONG') { ok = true; break; } } catch (e) {}
    await sleep(250);
  }
  try { probe.disconnect(); } catch (e) {}
  if (!ok) { try { proc.kill('SIGKILL'); } catch (e) {} return null; }
  return { proc, url, port };
}

/* ── ATOMIC/EXPIRE روی Redis واقعی ───────────────────────── */
async function atomicGroup(ctx) {
  grp('ATOMIC — اتمی‌بودن زیرِ burst (Redis واقعی یا پرش)');
  if (!ctx) { skips(['ATOMIC-a', 'ATOMIC-b'], 'redis-server نیست'); return; }
  process.env.REDIS_URL = ctx.url;
  await redis.init();
  const tag = 'ta' + Date.now();
  const N = 200;
  const rs = await Promise.all(Array.from({ length: N }, () =>
    rl.checkRateLimit({ prefix: tag, identifier: 'burst', limit: N, windowSeconds: 60 })));
  const raw = await redis.get(rl.getKey(tag, 'burst'));
  const allowed = rs.filter((r) => r.allowed).length;
  chk('ATOMIC-a شمارشِ دقیقِ ۲۰۰ همزمان (بدونِ lost-update)', raw === String(N) && allowed === N,
    'count=' + raw + ' allowed=' + allowed);
  const oneMore = await rl.checkRateLimit({ prefix: tag, identifier: 'burst', limit: N, windowSeconds: 60 });
  chk('ATOMIC-b دویست‌ویکمی مردود', !oneMore.allowed && oneMore.remaining === 0);
  const wtag = 'te' + Date.now();
  await rl.checkRateLimit({ prefix: wtag, identifier: 'k', limit: 1, windowSeconds: 2 });
  const d = await rl.checkRateLimit({ prefix: wtag, identifier: 'k', limit: 1, windowSeconds: 2 });
  await sleep(2300);
  const f = await rl.checkRateLimit({ prefix: wtag, identifier: 'k', limit: 1, windowSeconds: 2 });
  chk('ATOMIC-c انقضای واقعیِ Redis', !d.allowed && f.allowed);
}

/* ── DIST: دو نمونهٔ HTTP ────────────────────────────────── */
function apiRequest(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath,
      headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} },
      (res) => {
        let b = '';
        res.on('data', (c) => { b += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: b }));
      });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
    if (data) req.end(data); else req.end();
  });
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
async function flushRedis(url) {
  /* نمونهٔ Redis مالِ خودِ تست است (پورتِ خصوصی) — flush امن است. */
  const RedisLib = require('ioredis');
  const c = new RedisLib(url, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
  try { await c.connect(); await c.flushdb(); } finally { try { c.disconnect(); } catch (e) {} }
}
async function distGroup(ctx) {
  grp('DIST — دو نمونه با یک Redis (یا پرشِ بلند)');
  const names = ['DIST-a', 'DIST-b', 'DIST-c', 'DIST-d'];
  if (!ctx) { skips(names, 'redis-server نیست'); return; }
  if (!fs.existsSync(SEED_STORE)) { skips(names, 'سید نیست'); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-rl-'));
  const portA = await pickPort(18981);
  const portB = await pickPort(18991);
  const A = await bootApp(portA, tmp, { REDIS_URL: ctx.url });
  const B = await bootApp(portB, tmp, { REDIS_URL: ctx.url });
  const stop = () => { try { A && A.kill('SIGKILL'); } catch (e) {} try { B && B.kill('SIGKILL'); } catch (e) {} };
  if (!A || !B) { skips(names, 'بوت ناموفق'); stop(); return; }
  try {
    /* سقفِ phone مشترک: ۳ از A + ۲ از B ← ششمی (از هرکدام) ۴۲۹ */
    const ph = '0912000001';
    const seq = [];
    for (let i = 0; i < 3; i++) seq.push(await apiRequest(portA, 'POST', '/api/auth/send-code', { phone: ph }));
    for (let i = 0; i < 2; i++) seq.push(await apiRequest(portB, 'POST', '/api/auth/send-code', { phone: ph }));
    const sixthA = await apiRequest(portA, 'POST', '/api/auth/send-code', { phone: ph });
    const sixthB = await apiRequest(portB, 'POST', '/api/auth/send-code', { phone: ph });
    chk('DIST-a سقفِ phone در دو نمونه مشترک است', seq.every((r) => r.status === 200) &&
      sixthA.status === 429 && sixthB.status === 429,
      'seq=' + seq.map((r) => r.status).join(',') + ' A6=' + sixthA.status + ' B6=' + sixthB.status);
    /* DIST-a سهمیهٔ IPِ مشترک (۷ از ۱۰) را مصرف کرد — قبل از DIST-b پاک‌سازی. */
    await flushRedis(ctx.url);
    /* سقفِ IP مشترک: ۱۰ ارسال با phoneهای متمایز از A ← یازدهمی ۴۲۹ (از B هم) */
    const ipSeq = [];
    for (let i = 0; i < 10; i++) {
      ipSeq.push(await apiRequest(portA, 'POST', '/api/auth/send-code', { phone: '0912' + String(100002 + i) }));
    }
    const ip11 = await apiRequest(portB, 'POST', '/api/auth/send-code', { phone: '0912999999' });
    const okCount = ipSeq.filter((r) => r.status === 200).length;
    chk('DIST-b سقفِ IP در دو نمونه مشترک است', okCount === 10 && ip11.status === 429,
      'ok=' + okCount + ' B11=' + ip11.status);
    /* سقفِ login مشترک: ۱۰ ورودِ بد با phoneهای متمایز از A ← یازدهمی ۴۲۹.
       (تمایزِ phone لازم است: تأخیرِ تصاعدی (account_locked) هم ۴۲۹ می‌دهد و
       اندازه‌گیریِ سقفِ IP را آلوده می‌کند.) */
    const lg = [];
    for (let i = 0; i < 10; i++) {
      lg.push(await apiRequest(portA, 'POST', '/api/auth/login',
        { phone: '0912' + String(200000 + i), code: '000000', national_id: '0012345678' }));
    }
    const lg11 = await apiRequest(portB, 'POST', '/api/auth/login',
      { phone: '0912200010', code: '000000', national_id: '0012345678' });
    const non429 = lg.filter((r) => r.status !== 429).length;
    chk('DIST-c سقفِ login در دو نمونه مشترک است', non429 === 10 && lg11.status === 429,
      'non429=' + non429 + ' B11=' + lg11.status);
    /* سقفِ روزانه با پارامترهایِ واقعیِ تولید (۲۰/۸۶۴۰۰) روی همان Redis:
       مسیرِ HTTP در a/b/c اثبات شد؛ این‌جا فقط عددِ حدیِ روزانه.
       (اثباتِ HTTP سقفِ روزانه به time-travel نیاز دارد: سقفِ phone اول می‌رسد.) */
    const drs = [];
    for (let i = 0; i < 21; i++) {
      drs.push(await rl.checkRateLimit({ prefix: 'otp:send:phone:day', identifier: '0912000021',
        limit: 20, windowSeconds: 86400 }));
    }
    chk('DIST-d سقفِ روزانه مشترک است (۲۰ ← ۴۲۹)',
      drs.slice(0, 20).every((r) => r.allowed) && !drs[20].allowed, 'allowed21=' + drs[20].allowed);
  } finally {
    stop();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

/* ── FB: بدونِ Redis ─────────────────────────────────────── */
async function fbGroup() {
  grp('FB — fallback بدونِ Redis (همیشه)');
  if (!fs.existsSync(SEED_STORE)) { chk('FB-0 سید هست', false); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-rlfb-'));
  const port = await pickPort(18971);
  const env = Object.assign({}, process.env);
  delete env.REDIS_URL;
  const storeP = path.join(tmp, 's.json');
  fs.copyFileSync(SEED_STORE, storeP);
  const child = cp.spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: Object.assign(env, {
      PORT: String(port), HOST: '127.0.0.1', PAYESH_STORE: storeP,
      PAYESH_AUDIT: path.join(tmp, 'a.log'), PAYESH_KEY: path.join(tmp, 'k.key'),
      PAYESH_DEMO_CODE: '1', PAYESH_SMS_COOLDOWN_S: '0'
    }),
    stdio: ['ignore', 'ignore', 'ignore']
  });
  let ok = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    try {
      const r = await apiRequest(port, 'GET', '/api/health');
      if (r.status === 200) { ok = true; break; }
    } catch (e) {}
    await sleep(250);
  }
  chk('FB-0 بوتِ بدونِ Redis', ok);
  if (!ok) { try { child.kill('SIGKILL'); } catch (e) {} return; }
  try {
    const ph = '0912000099';
    const rs = [];
    for (let i = 0; i < 6; i++) rs.push(await apiRequest(port, 'POST', '/api/auth/send-code', { phone: ph }));
    chk('FB-a سقفِ phone بدونِ Redis هم اعمال می‌شود',
      rs.slice(0, 5).every((r) => r.status === 200) && rs[5].status === 429,
      rs.map((r) => r.status).join(','));
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

/* ── main ────────────────────────────────────────────────── */
(async function main() {
  let ctx = null;
  try {
    await rlGroup();
    if (UNIT_ONLY) {
      console.log('\n(ATOMIC/DIST/FB با --unit-only پرش شدند)');
    } else {
      ctx = await startRedis();
      if (ctx) console.log('  … Redis واقعی بالا است (' + ctx.url + ')');
      await atomicGroup(ctx);
      await distGroup(ctx);
      await fbGroup();
    }
  } catch (e) {
    fail++;
    failures.push('crash: ' + String((e && e.message) || e));
    console.log('  ❌ کرش: ' + String((e && e.stack) || e).slice(0, 400));
  }
  try { if (ctx) ctx.proc.kill('SIGKILL'); } catch (e) {}
  try { await redis.close(); } catch (e) {}
  try { delete process.env.REDIS_URL; } catch (e) {}
  console.log('\n' + '─'.repeat(52));
  console.log('جمع: ' + pass + ' موفق، ' + fail + ' ناموفق از ' + (pass + fail));
  if (failures.length) console.log('ناموفق‌ها: ' + failures.join(' | ').slice(0, 400));
  console.log('─'.repeat(52) + '\n');
  process.exit(fail ? 1 : 0);
})();
