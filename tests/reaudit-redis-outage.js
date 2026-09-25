#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   RE-AUDIT / A-22 — ممیزیِ مستقل از صفر: Redis عمداً غیرقابلِ دسترس
   ───────────────────────────────────────────────────────────────────
   سناریوها (همه رویِ سرورِ واقعی، HTTP زنده):
     S1  سوراخِ درگاهِ بوت: فقط REDIS_URL (بدونِ پرچمِ تولید) + ردیسِ مرده
         ⇒ سرور بالا می‌آید و سرو می‌دهد، ولی ابطال در هر درخواست fail-open
         می‌شود (شاهد: رخدادِ auditِ revocation_redis_error).
     S2  حالتِ سالمِ دو-نمونه‌ای: ابطالِ توزیع‌شده بین نمونه‌ها کار می‌کند.
     S3  قطعیِ وسطِ کار:logout رویِ A ⇒ A رد می‌کند (denylistِ محلی)،
         ولی B هنوز می‌پذیرد (fail-out بین‌نمونه‌ای). ← آسیب‌پذیری
     S4  نشستِ منقضی‌شده: مستقل از سلامتِ ردیس رد می‌شود (exp در jwtVerify).
     S5  ریاستارت: B دوباره بالا می‌آید، denylistِ ماندگارشده را می‌خواند ⇒ رد.
     S6  پارتیشن/بلک‌هول: اتصال زنده ولی بدونِ پاسخ ⇒ درخواستِ auth آویزان.

   اجرا:  node tests/reaudit-redis-outage.js
   ═════════════════════════════════════════════════════════════════ */
'use strict';
const os = require('os');
const fs = require('fs');
const net = require('net');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ISS = 'payesh', AUD = 'payesh-web';
function b64u(x) { return Buffer.from(x).toString('base64url'); }
function signToken(secret, payload) {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const b = b64u(JSON.stringify(Object.assign({ iss: ISS, aud: AUD }, payload)));
  const s = b64u(crypto.createHmac('sha256', secret).update(h + '.' + b).digest());
  return h + '.' + b + '.' + s;
}

/* ───────────────  fake Redis  (RESP مینیمال)  ─────────────── */
function makeRedis(port) {
  const kv = new Map();
  const exp = new Map(); /* key -> ms انقضا */
  const socks = new Set();
  let partitioned = false;
  function sweep(k) {
    const e = exp.get(k);
    if (e && Date.now() >= e) { kv.delete(k); exp.delete(k); }
  }
  const server = net.createServer((sock) => {
    socks.add(sock);
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        const parsed = tryParse(buf);
        if (!parsed) break;
        buf = parsed.rest;
        if (partitioned) continue; /* بلک‌هول: می‌خوانیم ولی جواب نمی‌دهیم */
        const out = handle(parsed.args);
        if (out !== null) { try { sock.write(out); } catch (e) {} }
      }
    });
    sock.on('error', () => {});
    sock.on('close', () => socks.delete(sock));
  });
  server.on('error', () => {});
  function tryParse(b) {
    if (b.length < 4 || b[0] !== 42) return null; /* '*' */
    const hdr = readLine(b, 0);
    if (!hdr) return null;
    const n = parseInt(hdr.str.slice(1), 10);
    if (!(n >= 0)) return null;
    let off = hdr.next; const args = [];
    for (let k = 0; k < n; k++) {
      if (off >= b.length) return null;
      if (b[off] !== 36) return null; /* '$' */
      const lenLine = readLine(b, off);
      if (!lenLine) return null;
      const len = parseInt(lenLine.str.slice(1), 10);
      if (len < 0) { args.push(null); off = lenLine.next; continue; }
      const end = lenLine.next + len + 2;
      if (b.length < end) return null;
      args.push(b.slice(lenLine.next, lenLine.next + len).toString('utf8'));
      off = end;
    }
    return { args, rest: b.slice(off) };
  }
  function readLine(b, from) {
    const i = b.indexOf(13, from);
    if (i === -1 || i + 1 >= b.length || b[i + 1] !== 10) return null;
    return { str: b.slice(from, i).toString('utf8'), next: i + 2 };
  }
  function handle(args) {
    const cmd = String(args[0] || '').toUpperCase();
    const s = (v) => { const x = Buffer.from(String(v), 'utf8'); return '$' + x.length + '\r\n' + String(v) + '\r\n'; };
    switch (cmd) {
      case 'PING': return '+PONG\r\n';
      case 'GET': { sweep(args[1]); const v = kv.get(args[1]); return v === undefined ? '$-1\r\n' : s(v); }
      case 'SET': kv.set(args[1], args[2]); return '+OK\r\n';
      case 'DEL': kv.delete(args[1]); return ':1\r\n';
      case 'INCR': { const v = (parseInt(kv.get(args[1]), 10) || 0) + 1; kv.set(args[1], String(v)); return ':' + v + '\r\n'; }
      case 'EXPIRE': exp.set(args[1], Date.now() + (parseInt(args[2], 10) || 60) * 1000); return ':1\r\n';
      case 'TTL': { sweep(args[1]); const e = exp.get(args[1]); if (!e) return ':-1\r\n'; return ':' + Math.max(0, Math.ceil((e - Date.now()) / 1000)) + '\r\n'; }
      case 'SETNX': if (!kv.has(args[1])) { kv.set(args[1], args[2]); return ':1\r\n'; } return ':0\r\n';
      case 'SADD': return ':1\r\n';
      case 'SMEMBERS': return '*0\r\n';
      case 'SREM': return ':0\r\n';
      case 'PUBLISH': return ':0\r\n';
      case 'UNSUBSCRIBE': return '+OK\r\n';
      case 'COMMAND': return '*0\r\n';
      /* ioredis ۶ با RESP3 با HELLO 3 دست می‌دهد؛ پاسخِ نگاشتِ معتبر نیاز است،
         وگرنه handshake می‌خکد و cache.init هیچ‌وقت حل نمی‌شود. */
      case 'HELLO': return '%7\r\n$6\r\nserver\r\n$5\r\nredis\r\n$7\r\nversion\r\n$5\r\n7.0.0\r\n$5\r\nproto\r\n:3\r\n$2\r\nid\r\n:1\r\n$4\r\nmode\r\n$10\r\nstandalone\r\n$4\r\nrole\r\n$6\r\nmaster\r\n$7\r\nmodules\r\n*0\r\n';
      /* rate-limit از یک اسکریپتِ Lua (INCRBY + EXPIRE) استفاده می‌کند.
         بدونِ این، فیک '+OK' برمی‌گرداند و limite‌ر آن را به‌عنوانِ شمارش
         می‌خواند (NaN ⇒ allowed:false ⇒ ۴۲۲۹ rate_limited). */
      case 'EVAL': {
        const script = String(args[1] || '');
        const numkeys = parseInt(args[2], 10) || 0;
        const key = args[3];
        const a1 = parseInt(args[3 + numkeys], 10);
        const a2 = parseInt(args[4 + numkeys], 10);
        if (script.indexOf('INCRBY') !== -1 && key !== undefined) {
          sweep(key);
          const v = (parseInt(kv.get(key), 10) || 0) + (Number.isFinite(a2) ? a2 : 1);
          kv.set(key, String(v));
          if (Number.isFinite(a1) && a1 > 0) exp.set(key, Date.now() + a1 * 1000);
          return ':' + v + '\r\n';
        }
        return ':1\r\n';
      }
      case 'EVALSHA': return '-NOSCRIPT ERR Please use EVAL instead of EVALSHA\r\n';
      case 'SUBSCRIBE': { const ch = args[1]; return '*3\r\n$9\r\nsubscribe\r\n' + s(ch) + ':1\r\n'; }
      default: return '+OK\r\n';
    }
  }
  return {
    listen: () => new Promise((r) => server.listen(port, '127.0.0.1', () => r())),
    kill: () => { for (const s of socks) { try { s.destroy(); } catch (e) {} } socks.clear(); try { server.close(); } catch (e) {} },
    partition: () => { partitioned = true; },
    unpartition: () => { partitioned = false; },
    has: (k) => kv.has(k)
  };
}

/* ───────────────  هِلپرِ سرور/HTTP  ─────────────── */
function bootInstance(port, redisUrl, storeFile, auditFile, keyFile, extra) {
  const env = Object.assign({}, process.env, {
    PORT: String(port), HOST: '127.0.0.1',
    PAYESH_STORE: storeFile,
    PAYESH_AUDIT: auditFile,
    PAYESH_KEY: keyFile,
    PAYESH_DEMO_CODE: '1'
  });
  if (redisUrl) env.REDIS_URL = redisUrl; else delete env.REDIS_URL;
  delete env.NODE_ENV; delete env.DATABASE_URL; delete env.REDIS_CLUSTER_NODES; delete env.REDIS_SENTINELS;
  Object.assign(env, extra || {});
  const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  /* log باید روی یک شیءِ قابل‌تغییر نگه داشته شود؛ برگرداندنِ string با مقدار
     کپی می‌شود و appendهای بعدی هرگز دیده نمی‌شوند. */
  const out = { child, log: '', closed: false };
  child.stdout.on('data', d => (out.log += d));
  child.stderr.on('data', d => (out.log += d));
  child.on('close', () => { out.closed = true; });
  return out;
}

function makeReq(port, timeoutMs) {
  return (method, p, body, cookie) => new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port, path: p, method,
      timeout: timeoutMs || 0,
      headers: Object.assign({ 'content-type': 'application/json' }, data ? { 'content-length': Buffer.byteLength(data) } : {}, cookie ? { cookie } : {}) },
      (res) => { let b = ''; res.on('data', d => (b += d)); res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, json: j, body: b, headers: res.headers });
      }); });
    r.on('error', (e) => resolve({ status: 0, json: null, body: 'ERR:' + e.message, headers: {} }));
    r.on('timeout', () => { r.destroy(); resolve({ status: -1, json: null, body: 'CLIENT_TIMEOUT', headers: {} }); });
    if (data) r.write(data); r.end();
  });
}

async function waitFor(port, req) {
  /* منتظر می‌ماند تا سرور سوکت باز کند؛ کدِ وضعیتِ health را برمی‌گرداند
     (ممکن است ۵۰۳ باشد یعنی «آماده نیست ولی سرو می‌دهد»). */
  for (let i = 0; i < 90; i++) {
    try { const h = await req('GET', '/api/health'); if (h.status !== 0) return h.status; } catch (e) {}
    await sleep(200);
  }
  return 0;
}

async function login(req, phone, nid) {
  const sc = await req('POST', '/api/auth/send-code', { phone: phone || '09999838444' });
  const code = sc.json && sc.json.demo_code;
  if (!code) return null;
  const lg = await req('POST', '/api/auth/login', { phone: phone || '09999838444', code, national_id: nid || '9993235245' });
  if (lg.status !== 200) return null;
  return (lg.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
}

/* یک endpoint محافظت‌شده برای سنجشِ اعتبارِ کوکی */
function authed(req, cookie) { return req('GET', '/api/v1/students?limit=1', null, cookie); }

function tmpSetup(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-a22-' + tag + '-'));
  const src = path.join(ROOT, 'server', 'data', 'payesh.json');
  if (!fs.existsSync(src)) require('child_process').execSync('node server/seed.js', { cwd: ROOT, stdio: 'ignore' });
  const store = path.join(dir, 's.json'); fs.copyFileSync(src, store);
  return { dir, store, audit: path.join(dir, 'a.log'), key: path.join(dir, 'k.key') };
}
function killInst(inst) { try { inst.child.kill('SIGTERM'); } catch (e) {} }
/* اگر فرزند از قبل تمام شده، منتظرِ رویداد نمان (گرنه هنگ می‌کند). */
function awaitExit(inst, ms) {
  if (inst.closed) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false; const fin = () => { if (!done) { done = true; resolve(); } };
    inst.child.on('close', fin);
    setTimeout(fin, ms || 4000);
  });
}
function rmDir(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }

async function main() {
  console.log('▸ RE-AUDIT A-22 — Redis در دسترس نیست (ممیزیِ مستقل از صفر)');

  /* ═══ S1: درگاهِ بوت برایِ شکلِ «فقط REDIS_URL» ═══ */
  {
    console.log('\n— S1: فقط REDIS_URL + ردیسِ مرده (درگاهِ بوت)');
    const t = tmpSetup('s1');
    const DEAD = 8981;
    const inst = bootInstance(8982, 'redis://127.0.0.1:' + DEAD, t.store, t.audit, t.key);
    /* post-fix: باید fail-fast کن و هرگز سرو ندهد.
       pre-fix: سوکت باز می‌کرد، health=۵۰۳ ولی همچنان ترافیک سرو می‌کرد و
       ابطال در هر درخواست fail-open می‌شد. */
    const result = await new Promise((resolve) => {
      let exited = null;
      let done = false;
      const finish = (o) => { if (!done) { done = true; resolve(o); } };
      /* 'close' (نه 'exit') — وگرنه هنوز داده‌هایِ pipe خوانده نشده‌اند. */
      inst.child.on('close', (c) => { exited = c; finish({ exited: c, log: inst.log }); });
      inst.child.on('exit', (c) => { exited = c; });
      setTimeout(() => finish({ exited: exited, log: inst.log }), 18000);
    });
    chk('S1a شکلِ «فقط REDIS_URL» + ردیسِ مرده ⇒ بوت fail-fast می‌کند (exit غیرصفر)',
      typeof result.exited === 'number' && result.exited !== 0,
      'exited=' + result.exited + ' :: ' + result.log.slice(-260));
    chk('S1b هرگز بنرِ listen چاپ نشد (سوکت باز نشد)',
      !/payesh-server \(phase 1/.test(result.log), 'log tail: ' + result.log.slice(-160));
    chk('S1c دلیلِ خروج همان gatingِ کش بود',
      result.log.indexOf('Cache readiness failed') !== -1 || result.log.indexOf('Cache init crashed') !== -1,
      result.log.slice(-200));
    killInst(inst);
    try { await awaitExit(inst); } catch (e) {}
    rmDir(t.dir);
  }

  /* ═══ S2 + S3 + S5: دو نمونه، ردیسِ سالم → قطعی → ریاستارت ═══ */
  {
    console.log('\n— S2/S3/S5: دو نمونهٔ مشترک در ردیس');
    const t = tmpSetup('s2');
    const RPORT = 8983;
    const fake = makeRedis(RPORT);
    await fake.listen();
    const A = bootInstance(8984, 'redis://127.0.0.1:' + RPORT, t.store, path.join(t.dir, 'aA.log'), t.key);
    /* هر دو نمونه باید کلیدِ JWTِ یکسان داشته باشند تا نشست بینشان مشترک شود */
    const B = bootInstance(8985, 'redis://127.0.0.1:' + RPORT, t.store, path.join(t.dir, 'aB.log'), t.key);
    const rA = makeReq(8984), rB = makeReq(8985);
    const upA = await waitFor(8984, rA), upB = await waitFor(8985, rB);
    chk('S2a هر دو نمونه با ردیسِ سالم بالا آمدند و آماده شدند',
      upA === 200 && upB === 200, 'A=' + upA + ' B=' + upB + ' | ' + (A.log + B.log).slice(-250));
    if (upA === 200 && upB === 200) {
      const cookie = await login(rA);
      chk('S2b نشست رویِ A گرفته شد', !!cookie);
      if (cookie) {
        const onA = await authed(rA, cookie), onB = await authed(rB, cookie);
        chk('S2c کوکی رویِ هر دو نمونه معتبر است (نشستِ توزیع‌شده)',
          onA.status === 200 && onB.status === 200, 'A=' + onA.status + ' B=' + onB.status);

        /* S3: قطعیِ ردیس */
        fake.kill();
        await sleep(1500); /* منتظرِ شناساییِ قطعی توسطِ ioredis */
        const lo = await rA('POST', '/api/auth/logout', {}, cookie);
        const afterA = await authed(rA, cookie);
        const afterB = await authed(rB, cookie);
        chk('S3a logout رویِ A در قطعی ۲۰۰ داد', lo.status === 200, 'lo=' + lo.status);
        chk('S3b A کوکی را رد می‌کند (denylistِ محلیِ همان پروسه)',
          afterA.status === 401, 'A=' + afterA.status);
        const bOk = afterB.status === 200;
        chk('S3c B هنوز کوکیِ ابطال‌شده را می‌پذیرد ← FAIL-OPEN بین‌نمونه‌ای',
          bOk, 'B=' + afterB.status + ' ' + String(afterB.body).slice(0, 100));
        if (bOk) console.log('     ⚠️  آسیب‌پذیریِ واقعی: ابطال رویِ A انجام شد ولی B آن را نمی‌بیند.');

        /* پایداریِ پنجرهٔ آسیب: حتی پس از بازیابیِ ردیس، denylist نوشته نشده */
        await fake.listen(); /* بازیابی رویِ همان پورت */
        await sleep(2500);
        const afterB2 = await authed(rB, cookie);
        chk('S3d پس از بازیابیِ ردیس هم B می‌پذیرد (پنجره خودبه‌خود بسته نمی‌شود)',
          afterB2.status === 200, 'B=' + afterB2.status);
        fake.kill();

        /* S5: ریاستارتِ B ⇒ بارگذاریِ denylistِ ماندگارشده */
        killInst(B); await awaitExit(B);
        await sleep(700); /* فرصت برای persist شدنِ فروشگاه توسطِ A */
        /* ردیس را دوباره زنده می‌کنیم — وگرنه (به‌درستی) بوت fail-fast می‌کند */
        await fake.listen();
        const B2 = bootInstance(8986, 'redis://127.0.0.1:' + RPORT, t.store, path.join(t.dir, 'aB2.log'), t.key);
        const rB2 = makeReq(8986);
        const upB2 = await waitFor(8986, rB2);
        if (upB2) {
          const afterB3 = await authed(rB2, cookie);
          chk('S5 پس از ریاستارت، B denylistِ ماندگارشده را می‌خواند و رد می‌کند',
            afterB3.status === 401, 'B2=' + afterB3.status);
        } else {
          chk('S5 ریاستارتِ B بالا آمد', false, B2.log.slice(-200));
        }
        killInst(B2); await awaitExit(B2);
      }
    }
    killInst(A); await awaitExit(A);
    try { fake.kill(); } catch (e) {}
    rmDir(t.dir);
  }

  /* ═══ S4: نشستِ منقضی‌شده ═══ */
  {
    console.log('\n— S4: نشستِ منقضی‌شده (مستقل از ردیس)');
    const t = tmpSetup('s4');
    const RPORT = 8987;
    const fake = makeRedis(RPORT); await fake.listen();
    const inst = bootInstance(8988, 'redis://127.0.0.1:' + RPORT, t.store, t.audit, t.key);
    const req = makeReq(8988);
    const code = await waitFor(8988, req);
    if (code === 200) {
      fs.writeFileSync(t.key, 'a'.repeat(64)); /* کلیدِ معلوم برای امضای دستی */
      killInst(inst); await awaitExit(inst);
      const inst2 = bootInstance(8989, 'redis://127.0.0.1:' + RPORT, t.store, t.audit, t.key);
      const req2 = makeReq(8989);
      const up2 = await waitFor(8989, req2);
      chk('S4a سرور با کلیدِ معلوم بالا آمد', up2, inst2.log.slice(-200));
      if (up2) {
        const now = Math.floor(Date.now() / 1000);
        const sub = 1; /* سوپرادمینِ seed */
        const tok = signToken('a'.repeat(64), { sub, role: 'superadmin', school_id: null, iat: now - 60, exp: now - 30, jti: 'jt_expired_probe', sv: 0 });
        const cookie = 'payesh_session=' + tok;
        const r1 = await authed(req2, cookie);
        chk('S4b توکنِ منقضی‌شده با ردیسِ سالم رد می‌شود (exp، fail-closed)',
          r1.status === 401, r1.status + ' ' + String(r1.body).slice(0, 100));
        fake.kill(); await sleep(1500);
        const r2 = await authed(req2, cookie);
        chk('S4c توکنِ منقضی‌شده با ردیسِ مرده هم رد می‌شود (exp به ردیس وابسته نیست)',
          r2.status === 401, r2.status + ' ' + String(r2.body).slice(0, 100));
      }
      killInst(inst2); await awaitExit(inst2);
    } else {
      chk('S4 سرور بالا آمد', false, inst.log.slice(-200));
      killInst(inst);
    }
    try { fake.kill(); } catch (e) {}
    rmDir(t.dir);
  }

  /* ═══ S6: پارتیشن / بلک‌هول ═══ */
  {
    console.log('\n— S6: پارتیشن (اتصال زنده، بدونِ پاسخ)');
    const t = tmpSetup('s6');
    const RPORT = 8990;
    const fake = makeRedis(RPORT); await fake.listen();
    const inst = bootInstance(8991, 'redis://127.0.0.1:' + RPORT, t.store, t.audit, t.key);
    const req = makeReq(8991);
    const code = await waitFor(8991, req);
    chk('S6a سرور با ردیسِ سالم بالا آمد و آماده شد', code === 200, 'health=' + code + ' | ' + inst.log.slice(-200));
    if (code === 200) {
      const cookie = await login(req);
      if (cookie) {
        const base = await authed(req, cookie);
        chk('S6b قبل از پارتیشن، درخواست سریع است', base.status === 200);
        const t0 = Date.now();
        fake.partition(); /* بلک‌هول: می‌خواند ولی جواب نمی‌دهد */
        const reqT = makeReq(8991, 20000); /* تایم‌اوتِ کلاینتِ دور، برای سنجشِ کرَل */
        const hung = await authed(reqT, cookie);
        const dt = Date.now() - t0;
        /* post-fix: commandTimeout هر فرمان را می‌بندد ⇒ مسیرِ fail-open در نهایت
           پاسخ می‌دهد (نه آویزانِ بی‌نهایت). pre-fix: هیچ‌وقت برنمی‌گشت.
           کرَلِ تجمعی = (تعدادِ عمل‌هایِ ردیس در مسیرِ auth) × timeout است. */
        chk('S6c پارتیشن: درخواست در نهایت پاسخ داد (کرَل، نه آویزانِ بی‌نهایت)',
          hung.status !== -1 && hung.status !== 0 && dt >= 1500 && dt <= 30000,
          'status=' + hung.status + ' ms=' + dt);
        console.log(`     ℹ️  مدتِ تا پاسخ (کرَلِ پارتیشن): ${dt} ms`);
      }
    }
    killInst(inst); await awaitExit(inst);
    try { fake.kill(); } catch (e) {}
    rmDir(t.dir);
  }

  console.log(`\nreaudit-redis-outage (A-22): ${pass}/${pass + fail} ${fail === 0 ? 'موفق' : 'شکست'}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('خطای غیرمنتظره:', e); process.exit(1); });
