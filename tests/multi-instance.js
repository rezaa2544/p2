#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/multi-instance.js — P0#2: معماری چندنمونه‌ای امن
   ───────────────────────────────────────────────────────────────────
   دو فرایندِ واقعیِ سرور (instance A و B) با **یک Redis مشترک**
   (fake-RESP روی TCP — همان الگویِ tests/arena5-recovery.js، این‌بار
   با معنایِ واقعیِ کلید/ارزش) + PG بدونِ دسترسی (datastore plane در
   سندِ معماری «در انتظارِ زیرساخت» است — Wave 1/3).

   چرخهٔ الزامیِ پرامپت:  write A → read B → update B → read A
     MI-2  write A  : send-code در A (کد روی Redis مشترک)
     MI-3  read  B  : login در B با همان کد ⇒ 200
     MI-4  read  A  : /me با کوکیِ B در A ⇒ 200 (JWT مشترک + denylist مشترک)
     MI-5  update B : logout در B (denylist)
     MI-6  read  A  : /me در A با همان کوکی ⇒ 401
     MI-7  update B : 5 کدِ غلط در B (مرگِ کد + سنگ‌قبر روی Redis مشترک)
     MI-8  read  A  : login در A با همان کدِ «مردۀ» ⇒ 401 bad_code
   + MI-9  rate limitِ IP **مشترک** بین نمونه‌ها (سقف در A می‌شمارد، B می‌خورد)
   + MI-10 fail-closed: production + Redis مرده ⇒ استارت نمی‌دهد (P0-13)
   + MI-11 fail-fast: production + بک‌اندِ مشترک + بدونِ PAYESH_JWT_SECRET ⇒ exit 1
   + MI-12 outbox ids: دنبالهٔ مشترکِ Redis — دو outbox، صفرِ تلاش‌تلاقی
   + MI-13 idempotency: علامت در یک نمونه، خوانده در دیگری (قرارداد)

   اجرا: node tests/multi-instance.js   (نیازمند seed: node server/seed.js)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
if(!fs.existsSync(REAL_STORE)){
  console.log('⏭️  store موجود نیست — اول: node server/seed.js');
  process.exit(1);
}
const SEED = JSON.parse(fs.readFileSync(REAL_STORE, 'utf8'));
const SEED_SU = (SEED.users || []).find((u) => u.role === 'superadmin');
const SEED_MGR = (SEED.users || []).find((u) => u.role === 'manager' && String(u.phone || '').length >= 10);
if(!SEED_SU || !SEED_MGR){ console.log('⏭️  superadmin/manager در seed نیست — seed بازنشانی شود'); process.exit(1); }
const SU_PHONE = String(SEED_SU.phone).replace(/[\s\-()]/g, '');
const MGR_PHONE = String(SEED_MGR.phone).replace(/[\s\-()]/g, '');
/* ۷ تلفنِ جدا برایِ سقفِ IP (هرکدام یک‌بار) */
const POOL = (SEED.users || [])
  .map((u) => String(u.phone || '').replace(/[\s\-()]/g, ''))
  .filter((p) => p.length >= 10 && p !== SU_PHONE && p !== MGR_PHONE)
  .slice(0, 7);
if(POOL.length < 7){ console.log('⏭️  تلفنِ کافی در seed نیست'); process.exit(1); }

let pass = 0, fail = 0; const fails = [];
function chk(name, cond, extra){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function j(BASE, method, p, opts){
  const r = await fetch(BASE + p, Object.assign({ method }, opts || {}));
  let body = null; try { body = await r.json(); } catch (e) {}
  return { status: r.status, body, headers: r.headers };
}
function jtiOf(cookie){
  const m = String(cookie || '').match(/payesh_session=([^;]+)/);
  if(!m) return null;
  try { return JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString('utf8')).jti; }
  catch(e){ return null; }
}
async function freePort(){
  const s = net.createServer();
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res); });
  const p = s.address().port; await new Promise((res) => s.close(res));
  return p;
}

/* ── fake ردیس TCP — RESP حداقلی با **معنایِ واقعی** (ioredis 6) ─────
   ioredis 6: HELLO ⇒ خطا (down به RESP2)؛ آماده‌سازی با INFO (loading:0).
   دستورات: PING/HELLO/CLIENT/AUTH/SELECT/INFO + GET/SET[EX|NX]/INCR/TTL/
   EXPIRE/DEL/EVAL(اسکرپتِ INCR_WITH_TTL و CAS_DEL)/SUBSCRIBE/PUBLISH/
   SADD/SMEMBERS/SREM. */
function parseResp(buf){
  const commands = []; let i = 0;
  while(i < buf.length){
    const lineEnd = buf.indexOf('\r\n', i);
    if(lineEnd === -1) break;
    if(buf[i] === 0x2a){
      const n = parseInt(buf.slice(i + 1, lineEnd), 10);
      let p = lineEnd + 2, ok = true; const args = [];
      for(let a = 0; a < n; a++){
        if(p >= buf.length || buf[p] !== 0x24){ ok = false; break; }
        const lenEnd = buf.indexOf('\r\n', p + 1);
        if(lenEnd === -1){ ok = false; break; }
        const len = parseInt(buf.slice(p + 1, lenEnd), 10);
        const s0 = lenEnd + 2;
        if(s0 + len + 2 > buf.length){ ok = false; break; }
        args.push(buf.slice(s0, s0 + len).toString());
        p = s0 + len + 2;
      }
      if(!ok) break;
      commands.push(args); i = p;
    } else { commands.push(buf.slice(i, lineEnd).toString().split(' ')); i = lineEnd + 2; }
  }
  return { commands, rest: buf.slice(i) };
}
function respBulk(v){ const b = String(v); return '$' + Buffer.byteLength(b) + '\r\n' + b + '\r\n'; }
function fakeRedisServer(){
  const kv = new Map();          // key -> { v, exp? }
  const sets = new Map();        // key -> Set
  const subs = new Map();        // channel -> Set<sock>
  const conns = new Set();
  const alive = (e) => !e.exp || Date.now() < e.exp;
  const getRaw = (k) => { const e = kv.get(k); return (e && alive(e)) ? e.v : null; };
  const srv = net.createServer((sock) => {
    conns.add(sock);
    let pending = Buffer.alloc(0);
    sock.on('data', (d) => {
      pending = Buffer.concat([pending, d]);
      const { commands, rest } = parseResp(pending); pending = rest;
      for(const args of commands){
        const cmd = String(args[0] || '').toUpperCase();
        const a1 = String(args[1] || '');
        if(cmd === 'HELLO') sock.write("-ERR unknown command 'HELLO'\r\n");
        else if(cmd === 'PING') sock.write('+PONG\r\n');
        else if(cmd === 'INFO'){ const t = 'redis_version:7.0.0\r\nloading:0\r\n'; sock.write(respBulk(t)); }
        else if(cmd === 'GET'){ const v = getRaw(a1); sock.write(v === null ? '$-1\r\n' : respBulk(v)); }
        else if(cmd === 'SET'){
          let val = String(args[2] || ''), exp = null, nx = false;
          for(let i = 3; i < args.length - 1; i += 2){
            const m = String(args[i]).toUpperCase(), dv = Number(args[i + 1]);
            if(m === 'EX') exp = Date.now() + dv * 1000; else if(m === 'PX') exp = Date.now() + dv; else if(m === 'NX') nx = true;
          }
          const cur = getRaw(a1);
          if(nx && cur !== null){ sock.write('$-1\r\n'); }
          else { kv.set(a1, { v: val, exp }); sock.write('+OK\r\n'); }
        }
        else if(cmd === 'INCR'){
          const cur = getRaw(a1); const n = (cur === null ? 0 : parseInt(cur, 10) || 0) + 1;
          const e = kv.get(a1); if(e && !e.exp) kv.set(a1, { v: String(n) }); else if(cur === null) kv.set(a1, { v: String(n) });
          sock.write(':' + n + '\r\n');
        }
        else if(cmd === 'TTL'){
          const e = kv.get(a1);
          if(!e || !alive(e)) sock.write(':-2\r\n');
          else if(!e.exp) sock.write(':-1\r\n');
          else sock.write(':' + Math.max(0, Math.ceil((e.exp - Date.now()) / 1000)) + '\r\n');
        }
        else if(cmd === 'EXPIRE'){ const e = kv.get(a1); if(!e || !alive(e)) sock.write(':0\r\n'); else { e.exp = Date.now() + Number(args[2]) * 1000; sock.write(':1\r\n'); } }
        else if(cmd === 'DEL'){ let n = 0; for(let i = 1; i < args.length; i++){ if(kv.delete(String(args[i]))) n++; } sock.write(':' + n + '\r\n'); }
        else if(cmd === 'EVAL'){
          const script = String(args[1] || '');
          const key = String(args[3] || ''); const arg = String(args[4] || '');
          if(script.indexOf('INCR') >= 0){ /* INCR_WITH_TTL */
            const cur = getRaw(key); const n = (cur === null ? 0 : parseInt(cur, 10) || 0) + 1;
            kv.set(key, { v: String(n), exp: Date.now() + Number(arg) * 1000 });
            sock.write(':' + n + '\r\n');
          } else if(script.indexOf('"get"') >= 0 || script.indexOf("'get'") >= 0){ /* CAS_DEL */
            const cur = getRaw(key);
            if(cur !== null && cur === arg){ kv.delete(key); sock.write(':1\r\n'); } else sock.write(':0\r\n');
          } else sock.write(':0\r\n');
        }
        else if(cmd === 'SUBSCRIBE'){
          const ch = a1;
          if(!subs.has(ch)) subs.set(ch, new Set());
          subs.get(ch).add(sock);
          sock.write('*3\r\n$9\r\nsubscribe\r\n' + respBulk(ch) + ':1\r\n');
        }
        else if(cmd === 'PUBLISH'){
          const ch = a1; const msg = String(args[2] || '');
          const s = subs.get(ch); let n = 0;
          if(s) for(const c of s){ try { c.write('*3\r\n$7\r\nmessage\r\n' + respBulk(ch) + respBulk(msg)); n++; } catch(e) {} }
          sock.write(':' + n + '\r\n');
        }
        else if(cmd === 'SADD'){
          let s = sets.get(a1); if(!s){ s = new Set(); sets.set(a1, s); }
          let n = 0; for(let i = 2; i < args.length; i++){ if(!s.has(String(args[i]))){ s.add(String(args[i])); n++; } }
          sock.write(':' + n + '\r\n');
        }
        else if(cmd === 'SMEMBERS'){
          const s = sets.get(a1) || new Set(); const m = Array.from(s);
          sock.write('*' + m.length + '\r\n' + m.map(respBulk).join(''));
        }
        else if(cmd === 'SREM'){
          const s = sets.get(a1); let n = 0;
          if(s) for(let i = 2; i < args.length; i++){ if(s.delete(String(args[i]))) n++; }
          sock.write(':' + n + '\r\n');
        }
        else sock.write('+OK\r\n'); /* CLIENT SETINFO / AUTH / SELECT / ... */
      }
    });
    sock.on('close', () => { conns.delete(sock); for(const s of subs.values()) s.delete(sock); });
    sock.on('error', () => {});
  });
  let port = null;
  return {
    start(){ return new Promise((res, rej) => { srv.once('error', rej); srv.listen(0, '127.0.0.1', () => { srv.removeListener('error', rej); port = srv.address().port; res(port); }); }); },
    stop(){ for(const c of conns){ try { c.destroy(); } catch(e) {} } conns.clear(); for(const s of subs.values()) s.clear(); try { srv.close(); } catch(e) {} },
    get port(){ return port; },
    getRaw,
  };
}

/* ── spawn instance ───────────────────────────────────────────────── */
const SHARED_JWT = 'multi-instance-test-shared-jwt-secret-abcdef0123';
function spawnInstance(name, storeFile, port, tmp, extraEnv, opts){
  opts = opts || {};
  const env = Object.assign({}, process.env);
  for(const k of ['PAYESH_ENV','NODE_ENV','REDIS_URL','PAYESH_JWT_SECRET','PAYESH_JWT_SECRET_PREV',
    'PAYESH_TEST_SLOW_MS','PAYESH_BEHIND_PROXY','PAYESH_SHUTDOWN_TIMEOUT_MS','DATABASE_URL',
    'PAYESH_SMS_IP_LIMIT','PAYESH_LOGIN_IP_LIMIT','PAYESH_DEMO_CODE']) delete env[k];
  Object.assign(env, {
    PORT: String(port), HOST: '127.0.0.1',
    PAYESH_STORE: storeFile,
    PAYESH_AUDIT: path.join(tmp, name + '-audit.log'),
    PAYESH_KEY: path.join(tmp, name + '-jwt.key'),
    PAYESH_DEMO_CODE: '1',
    PAYESH_JWT_SECRET: opts.noSharedJwt ? undefined : SHARED_JWT,
    PAYESH_SMS_IP_LIMIT: '8',
    PAYESH_LOGIN_IP_LIMIT: '20',
  }, extraEnv || {});
  if(opts.noSharedJwt) delete env.PAYESH_JWT_SECRET;
  const proc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = [];
  proc.stdout.on('data', (d) => out.push(String(d)));
  proc.stderr.on('data', (d) => out.push(String(d)));
  const ready = (timeoutMs) => new Promise((resolve, reject) => {
    const t0 = Date.now();
    const timer = setInterval(() => {
      const txt = out.join('');
      if(txt.indexOf('on http://') > -1){ clearInterval(timer); resolve('http://127.0.0.1:' + port); }
      else if(proc.exitCode !== null){ clearInterval(timer); reject(new Error('child exited ' + proc.exitCode + ' — ' + txt.slice(-300))); }
      else if(Date.now() - t0 > timeoutMs){ try { proc.kill('SIGKILL'); } catch(e) {} clearInterval(timer); reject(new Error('child not ready — ' + txt.slice(-300))); }
    }, 50);
  });
  return { proc, out, ready, name };
}
async function waitForFake(fake, key, pred, timeoutMs, what){
  const t0 = Date.now();
  for(;;){
    let v = null; try { v = fake.getRaw(key); } catch(e) {}
    if(v !== null && pred(v)) return v;
    if(Date.now() - t0 > timeoutMs) throw new Error('fake redis: ' + what + ' (آخرین: ' + String(v).slice(0, 120) + ')');
    await sleep(100);
  }
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-mi-'));
  const storeA = path.join(tmp, 'a-payesh.json'), storeB = path.join(tmp, 'b-payesh.json');
  fs.copyFileSync(REAL_STORE, storeA); fs.copyFileSync(REAL_STORE, storeB);

  const fake = fakeRedisServer();
  await fake.start();
  console.log('\n▸ fake Redis مشترک روی 127.0.0.1:' + fake.port);

  const portA = await freePort(), portB = await freePort();
  const A = spawnInstance('A', storeA, portA, tmp, { PAYESH_ENV: 'production', NODE_ENV: 'production', PAYESH_BEHIND_PROXY: '1', REDIS_URL: 'redis://127.0.0.1:' + fake.port });
  const B = spawnInstance('B', storeB, portB, tmp, { PAYESH_ENV: 'production', NODE_ENV: 'production', PAYESH_BEHIND_PROXY: '1', REDIS_URL: 'redis://127.0.0.1:' + fake.port });

  let BASEA = '', BASEB = '', cookie = '';
  try{
    /* ── MI-1: استارتِ هر دو instance (production + Redis زندهٔ مشترک) ── */
    console.log('\n▸ MI-1 — استارتِ دو instance (production + Redis مشترک)');
    try { BASEA = await A.ready(20000); BASEB = await B.ready(20000); chk('MI-1 استارتِ A و B (production + Redis مشترک زنده)', true); }
    catch(e){ chk('MI-1 استارتِ A و B', false, String(e.message).slice(0, 200)); }

    if(BASEA && BASEB){
      /* صبر تا init کامل (ready-check: event connect می‌تواند زود بزند) */
      await sleep(800);

      /* ── MI-2: write A → read B — کدِ OTP در A می‌آید، login در B ── */
      console.log('\n▸ MI-2 — write A → read B (OTP روی Redis مشترک)');
      let code = '';
      try{
        const r = await j(BASEA, 'POST', '/api/auth/send-code', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: SU_PHONE }) });
        chk('MI-2a send-code در A', r.status === 200 && r.body && r.body.demo_code, r.status + ' ' + JSON.stringify(r.body));
        code = r.body ? r.body.demo_code : '';
        await waitForFake(fake, 'payesh:otp:state', (v) => { try { const d = JSON.parse(v); return !!(d.codes && d.codes[SU_PHONE]); } catch(e){ return false; } }, 8000, 'فلاشِ کد به Redis');
        const rl = await j(BASEB, 'POST', '/api/auth/login', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: SU_PHONE, code, national_id: SEED_SU.national_id }) });
        chk('MI-2b login در B با کدِ صادرشده در A ⇒ 200 (write A → read B)', rl.status === 200 && rl.body && rl.body.ok, rl.status + ' ' + JSON.stringify(rl.body).slice(0, 160));
        const sc = rl.headers && rl.headers.get('set-cookie');
        cookie = sc ? String(sc).split(';')[0] : '';
        chk('MI-2c کوکیِ نشستِ B گرفته شد', !!cookie && !!jtiOf(cookie));
      }catch(e){ chk('MI-2 write A → read B', false, String(e.message).slice(0, 160)); }

      if(cookie){
        /* ── MI-3: read A — کوکیِ B در instance A هم معتبر است ── */
        console.log('\n▸ MI-3 — read A (جلسهٔ ساخته‌شده در B، در A)');
        const ra = await j(BASEA, 'GET', '/api/auth/me', { headers: { cookie } });
        chk('MI-3 /me در A با کوکیِ B ⇒ 200 همان کاربر (JWT مشترک + denylist مشترک)',
          ra.status === 200 && ra.body && ra.body.user && ra.body.user.id === SEED_SU.id, ra.status + ' ' + JSON.stringify(ra.body).slice(0, 160));

        /* ── MI-4: update B → read A — logout در B، نشست در A می‌میرد ── */
        console.log('\n▸ MI-4 — update B → read A (denylistِ توزیع‌شده)');
        const ro = await j(BASEB, 'POST', '/api/auth/logout', { headers: { cookie } });
        chk('MI-4a logout در B', ro.status === 200);
        const jti = jtiOf(cookie);
        await waitForFake(fake, 'revoked:' + jti, () => true, 5000, 'denylist روی Redis').catch(() => {});
        const ra2 = await j(BASEA, 'GET', '/api/auth/me', { headers: { cookie } });
        chk('MI-4b /me در A با کوکیِ خارج‌شده ⇒ 401 (update B → read A)', ra2.status === 401, 'got ' + ra2.status);
        const rb2 = await j(BASEB, 'GET', '/api/auth/me', { headers: { cookie } });
        chk('MI-4c /me در B با کوکیِ خارج‌شده ⇒ 401 (فوریِ محلی)', rb2.status === 401, 'got ' + rb2.status);
      }

      /* ── MI-5: rate limitِ IP — مشترک بین نمونه‌ها (سقف ۸/پنجره) ── */
      console.log('\n▸ MI-5 — rate limitِ IP مشترک (شمارش در A، اجرای حد در B)');
      let sentA = 1; /* send-codeِ MI-2 همین IP را شمرد */
      let ip429 = null;
      try{
        for(const ph of POOL){
          const r = await j(BASEA, 'POST', '/api/auth/send-code', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: ph }) });
          if(r.status === 200) sentA++; else { chk('MI-5a ارسال‌هایِ A تا سقف', false, 'phone ' + ph + ' → ' + r.status); break; }
        }
        const rB = await j(BASEB, 'POST', '/api/auth/send-code', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: MGR_PHONE }) });
        chk('MI-5b درخواستِ B پس از ' + sentA + ' ارسالِ A ⇒ 429 (شمارندهٔ مشترک)', rB.status === 429, 'got ' + rB.status + ' ' + JSON.stringify(rB.body));
        ip429 = rB.status === 429;
      }catch(e){ chk('MI-5 rate limit مشترک', false, String(e.message).slice(0, 160)); }

      /* ── MI-6/MI-7/MI-8: مرگِ کد در B ⇒ کد در A نیز مرده (tombstone) ──
         (به‌دلیلِ سقفِ IPِ MI-5، send-code تازه نمی‌آید؛ کدِ MI-2 دیگر مصرف
         شده است ⇒ برایِ این بند یک کالکسیونِ مستقلِ state استفاده نمی‌شود:
         به‌جایش، رفتارِ tombstone روی **login_fail/cd** سنجیده می‌شود؟ —
         خیر: ساده‌تر و قوی‌تر — MI-5 فقط ۸ تا سقف پر کرد؛ یک پنجرهٔ تازه
         لازم نیست چون کدِ جدید نیاز است. راهِ تمیز: پنجرهٔ IP ۹۰۰s است؛
         به‌جای صبر، **کدِ مصرف‌شدهٔ MI-2** را می‌بندیم: login دوباره با
         همان code ⇒ bad_code (کدِ مصرف‌شده در B زنده نمی‌ماند — tombstone
         همان‌جا که مصرف شد = B). برایِ جهتِ A→B مرگ: کدی که در **A**
         مصرف/مرد، در B نیز باید مرده باشد. */
      console.log('\n▸ MI-6/7/8 — مرگِ کد و tombstone بین نمونه‌ها');
      try{
        /* کدِ MI-2 در B (login موفق) مصرف شد ⇒ tombstone روی Redis مشترک.
           replayِ همان کد در A باید bad_code بدهد (وگرنه نمونهٔ خواهر کدِ
           مرده را زنده داشت = بازپخش). */
        const rReplayA = await j(BASEA, 'POST', '/api/auth/login', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: SU_PHONE, code, national_id: SEED_SU.national_id }) });
        chk('MI-6 replay کدِ مصرف‌شده در B، در A ⇒ 401 bad_code (tombstone مشترک)',
          rReplayA.status === 401 && rReplayA.body && rReplayA.body.code === 'bad_code', rReplayA.status + ' ' + JSON.stringify(rReplayA.body).slice(0, 160));
        const st = await fake.getRaw('payesh:otp:state');
        let tombOk = false;
        try { const d = JSON.parse(st || '{}'); tombOk = !!(d.tomb && d.tomb[SU_PHONE]) && !(d.codes && d.codes[SU_PHONE]); } catch(e) {}
        chk('MI-7 state مشترک: کد حذف + tombstone روی Redis (نه فقط حافظهٔ B)', tombOk, String(st).slice(0, 160));
        /* cooldown مشترک: همان تلفن در A هم 429 می‌شود (cd در state مشترک) */
        const rCd = await j(BASEA, 'POST', '/api/auth/send-code', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: SU_PHONE }) });
        chk('MI-8 send-codeِ دوبارهٔ همان تلفن در A ⇒ 429 (cooldown روی state مشترک)', rCd.status === 429, 'got ' + rCd.status);
      }catch(e){ chk('MI-6/7/8 tombstone بین نمونه‌ها', false, String(e.message).slice(0, 160)); }
    }
  } finally {
    for(const inst of [A, B]){ try { inst.proc.kill('SIGKILL'); } catch(e) {} }
  }

  /* ── MI-9: fail-closed — production + Redis مرده ⇒ استارت نمی‌دهد ── */
  console.log('\n▸ MI-9 — fail-closed: production + Redis مرده (P0-13)');
  {
    const storeC = path.join(tmp, 'c-payesh.json'); fs.copyFileSync(REAL_STORE, storeC);
    const portC = await freePort();
    const C = spawnInstance('C', storeC, portC, tmp, { PAYESH_ENV: 'production', NODE_ENV: 'production', PAYESH_BEHIND_PROXY: '1', REDIS_URL: 'redis://127.0.0.1:9' });
    const ex = await new Promise((resolve) => {
      const t = setTimeout(() => resolve({ code: 'timeout', signal: null }), 25000);
      C.proc.on('exit', (code, signal) => { clearTimeout(t); resolve({ code, signal }); });
    });
    const txt = C.out.join('');
    chk('MI-9 production + ردیسِ مرده ⇒ exit 1 + [FATAL] (فال‌بکِ حافظه ممنوع)',
      ex.code === 1 && txt.indexOf('[FATAL]') > -1, 'code=' + ex.code + ' ' + txt.slice(-200).replace(/\n/g, ' '));
  }

  /* ── MI-10: fail-fast — production + بک‌اندِ مشترک + بدونِ PAYESH_JWT_SECRET ── */
  console.log('\n▸ MI-10 — fail-fast: بدونِ کلیدِ نشستِ مشترک (P0#2)');
  {
    const storeD = path.join(tmp, 'd-payesh.json'); fs.copyFileSync(REAL_STORE, storeD);
    const portD = await freePort();
    const D = spawnInstance('D', storeD, portD, tmp, { PAYESH_ENV: 'production', NODE_ENV: 'production', PAYESH_BEHIND_PROXY: '1', REDIS_URL: 'redis://127.0.0.1:' + fake.port }, { noSharedJwt: true });
    const ex = await new Promise((resolve) => {
      const t = setTimeout(() => resolve({ code: 'timeout', signal: null }), 25000);
      D.proc.on('exit', (code, signal) => { clearTimeout(t); resolve({ code, signal }); });
    });
    const txt = D.out.join('');
    chk('MI-10 production + Redis + بدونِ PAYESH_JWT_SECRET ⇒ exit 1 + پیامِ کلیدِ مشترک',
      ex.code === 1 && txt.indexOf('PAYESH_JWT_SECRET') > -1, 'code=' + ex.code + ' ' + txt.slice(-200).replace(/\n/g, ' '));
  }

  /* ── MI-11: outbox ids — دنبالهٔ مشترک (دو outbox روی یک Redis) ── */
  console.log('\n▸ MI-11 — outbox ids روی دنبالهٔ مشترکِ Redis');
  {
    const redis = require('../server/redis');
    const { createOutbox } = require('../server/outbox');
    const map = new Map();
    const fakeInProc = {
      ping: async () => 'PONG',
      get: async (k) => (map.has(k) ? String(map.get(k)) : null),
      set: async (k, v) => { map.set(k, String(v)); return 'OK'; },
      del: async (...ks) => { let n = 0; for(const k of ks) if(map.delete(k)) n++; return n; },
      incr: async (k) => { const n = (parseInt(map.get(k) || '0', 10) || 0) + 1; map.set(k, String(n)); return n; },
      expire: async () => 1, ttl: async () => -1, eval: async () => 0,
      publish: async () => 0, subscribe: async () => true,
      sadd: async () => 0, smembers: async () => [], srem: async () => 0,
    };
    redis.__setClientForTests(fakeInProc);
    try{
      const s1 = { outbox: [] }, s2 = { outbox: [] };
      const o1 = createOutbox({ store: s1, db: null });
      const o2 = createOutbox({ store: s2, db: null });
      const ids = [];
      for(let i = 0; i < 30; i++){
        const arr = i % 2 === 0 ? s1.outbox : s2.outbox;
        const ob = i % 2 === 0 ? o1 : o2;
        await ob.append({ type: 'mi.test', collection: 'visitors', record_id: i });
        ids.push(arr[arr.length - 1].id);
      }
      const uniq = new Set(ids).size === 30;
      chk('MI-11a ۳۰ appendِ متناوب از دو outbox ⇒ ۳۰ idِ منحصر‌به‌فرد (تلاقی صفر)', uniq, 'uniq=' + new Set(ids).size);
      chk('MI-11b دنباله روی Redis مشترک (payesh:outbox:seq = 30)', Number(map.get('payesh:outbox:seq')) === 30, 'seq=' + map.get('payesh:outbox:seq'));
    }finally{ redis.__setClientForTests(null); }
  }

  /* ── MI-12: idempotency — قراردادِ سه‌لایه (Redis ← PG ← محلی) ── */
  console.log('\n▸ MI-12 — idempotency روی Redis مشترک');
  {
    const redis = require('../server/redis');
    const cache = require('../server/cache');
    const map = new Map();
    const fakeInProc = {
      ping: async () => 'PONG',
      get: async (k) => (map.has(k) ? String(map.get(k)) : null),
      set: async (k, v, m, d) => { map.set(k, String(v)); return 'OK'; },
      del: async () => 0, incr: async () => 1,
      expire: async () => 1, ttl: async () => 60, eval: async () => 1,
      publish: async () => 0, subscribe: async () => true,
      sadd: async () => 0, smembers: async () => [], srem: async () => 0,
    };
    redis.__setClientForTests(fakeInProc);
    try{
      const before = await cache.isProcessedUid('mi-uid-1');
      await cache.markProcessedUid('mi-uid-1');
      const after = await cache.isProcessedUid('mi-uid-1');
      chk('MI-12 mark در «نمونهٔ A» ⇒ read در «نمونهٔ B» (همان Redis مشترک)', before === false && after === true && !!map.get('payesh:idempotency:mi-uid-1'));
    }finally{ redis.__setClientForTests(null); }
  }

  /* ── planeِ datastore — صادقانه ── */
  console.log('\n▸ planeِ datastore (memoryStore + payesh.json)');
  console.log('  ⏳ write A → read B روی **دادهٔ اپ** نیازمندِ PG مشترک است (Wave 1/3 — نیمه‌مسیر:');
  console.log('     bootstrap/pull + GET-listهایِ students/attendance/grades/classes/users DB-native؛ بقیه در سند معماری §۴).');
  console.log('     در این ساندباکس PG زنده نیست — «در انتظارِ زیرساخت» (الگوی W18/W19).');

  fake.stop();
  console.log('\n' + '─'.repeat(52));
  console.log('multi-instance: ' + pass + ' سبز / ' + fail + ' قرمز');
  if(fail) for(const f of fails) console.log('  ✗ ' + f);
  console.log('─'.repeat(52) + '\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('crash: ' + (e && e.stack || e));
  process.exit(1);
});
