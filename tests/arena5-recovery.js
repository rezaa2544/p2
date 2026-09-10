#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Arena 5 — Recovery Validation (Wave 20)
   تکمیلِ مسئولیتِ «Recovery Validation» + شروطِ Production:
     «Restore Drill» و «Failover Test» (ADDENDUM: Reliability)

   R1  Crash Consistency (SIGKILL): فرایندِ واقعی با store جدا ←
       نوشتِ واقعی (sync) ← flush ← kill -9 ← فایلِ سالم + دادهٔ
       ماندگار ← restart رویِ همان store ⇒ readiness 200 + دادهٔ
       قابلِ خواندن/نوشتن (بدونِ خرابیِ atomik store).
   R2  Restore Drill: backup (API) ← فسادِ حافظه‌ای ← restore (API)
       ⇒ داده برمی‌گردد + audit restore_completed + بکاپِ سالم.
   R3  Redis Failover/Failback (ioredis واقعی + fake RESP TCP):
       ردیسِ زنده ⇒ readiness 200؛ مرگِ ردیس ⇒ 503؛ بازگشتِ ردیس
       درِ درونِ پنجرهٔ retry (200+400+600ms) ⇒ **200 بدونِ
       restart** (failback واقعی)؛ قطعِ طولانی (خارجِ پنجره) ⇒ 503
       ماندگار (محدودیتِ مُستند retryStrategy: restart لازم) ←
       restartِ فرایند ⇒ 200.
   R4  PostgreSQL Failback (قراردادِ استاتیک — PG در ساندباکس نیست):
       scheduleReconnect در مسیرِ خطا/بستن + backoffِ محدود +
       driver حافظه همیشه ok (valide در R2 درون‌فرایند).

   اجرا: node tests/arena5-recovery.js   (نیازمند seed: node server/seed.js)
   ═══════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
if(!fs.existsSync(REAL_STORE)){
  console.log('⏭️  store موجود نیست — اول: node server/seed.js');
  process.exit(0);
}

/* superadmin از seed (ثابتِ SEED=20260901) — برایِ مقاومت در برابر
   تغییرِ seed، از خودِ فایلِ store خوانده می‌شود. */
const SEED_SU = (JSON.parse(fs.readFileSync(REAL_STORE, 'utf8')).users || [])
  .find((u) => u.role === 'superadmin');
if(!SEED_SU) { console.log('⏭️  superadmin در seed نیست — seed بازنشانی شود'); process.exit(0); }
const SUPERADMIN_PHONE = SEED_SU.phone;
const SUPERADMIN_NID = String(SEED_SU.national_id);
const SUPERADMIN_ID = SEED_SU.id;
const SEED_SCHOOL_ID = (JSON.parse(fs.readFileSync(REAL_STORE, 'utf8')).schools || [])[0].id;
const CHILD = [
  "process.on('uncaughtException',function(e){console.log('UNCAUGHT:'+(e&&e.message||e));process.exit(4)});",
  "const m=require('./server/index.js');",
  "m.server.listen(0,()=>{console.log('READY:'+m.server.address().port)});"
].join('');

let pass = 0, fail = 0;
const fails = [];
function chk(name, cond, extra){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── helpers ─────────────────────────────────────────────────────── */
async function j(BASE, method, p, opts){
  const r = await fetch(BASE + p, Object.assign({ method }, opts || {}));
  let body = null;
  try { body = await r.json(); } catch (e) {}
  return { status: r.status, body, headers: r.headers };
}

function baseEnv(storePath, tmp){
  const env = Object.assign({}, process.env);
  for(const k of ['PAYESH_ENV','NODE_ENV','REDIS_URL','PAYESH_TEST_SLOW_MS',
    'PAYESH_BEHIND_PROXY','PAYESH_SHUTDOWN_TIMEOUT_MS']) delete env[k];
  env.PAYESH_STORE = storePath;
  env.PAYESH_AUDIT = path.join(tmp, 'audit.log');
  env.PAYESH_KEY = path.join(tmp, 'key');
  env.PAYESH_DEMO_CODE = '1';
  return env;
}

function spawnServer(storePath, tmp, extraEnv){
  const proc = spawn(process.execPath, ['-e', CHILD],
    { cwd: ROOT, env: Object.assign(baseEnv(storePath, tmp), extraEnv || {}),
      stdio: ['ignore', 'pipe', 'pipe'] });
  const out = [];
  proc.stdout.on('data', (d) => { out.push(String(d)); });
  proc.stderr.on('data', (d) => { out.push(String(d)); });
  const ready = (timeoutMs) => new Promise((resolve, reject) => {
    const t0 = Date.now();
    const timer = setInterval(() => {
      const m = out.join('').match(/READY:(\d+)/);
      if(m){ clearInterval(timer); resolve('http://127.0.0.1:' + m[1]); }
      else if(Date.now() - t0 > timeoutMs){
        try { proc.kill('SIGKILL'); } catch (e) {}
        clearInterval(timer);
        reject(new Error('child not ready — ' + out.join('').slice(-300)));
      }
    }, 50);
  });
  return { proc, out, ready, BASE: null };
}

async function login(BASE){
  let r = await j(BASE, 'POST', '/api/auth/send-code', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: SUPERADMIN_PHONE }) });
  if(r.status !== 200 || !r.body || !r.body.demo_code)
    throw new Error('send-code failed: ' + r.status + ' ' + JSON.stringify(r.body));
  r = await j(BASE, 'POST', '/api/auth/login', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: SUPERADMIN_PHONE, code: r.body.demo_code, national_id: SUPERADMIN_NID }) });
  if(r.status !== 200 || !r.body || !r.body.ok)
    throw new Error('login failed: ' + r.status + ' ' + JSON.stringify(r.body));
  const sc = r.headers.get('set-cookie');
  const m = sc && sc.match(/payesh_session=([^;]+)/);
  if(!m) throw new Error('no session cookie: ' + sc);
  return 'payesh_session=' + m[1];
}

async function readiness(BASE){
  const r = await j(BASE, 'GET', '/api/readiness');
  return r.status;
}

async function waitStatus(BASE, want, timeoutMs){
  const t0 = Date.now();
  for(;;){
    const s = await readiness(BASE);
    if(s === want) return s;
    if(Date.now() - t0 > timeoutMs) return s;
    await sleep(150);
  }
}

async function waitForFile(fn, timeoutMs, what){
  const t0 = Date.now();
  for(;;){
    try { if(fn()) return true; } catch (e) {}
    if(Date.now() - t0 > timeoutMs) break;
    await sleep(200);
  }
  return false;
}

/* ── fake ردیس TCP (RESP حداقلی اما کامل برایِ ioredis 6) ───────────
   ioredis 6 handshake: HELLO 3 + CLIENT SETINFO ... — سروری که HELLO
   ندارد باید خطای «unknown command 'HELLO'» بدهد تا ioredis به RESP2
   down کند؛ سپس _readyCheck با INFO (loading:0) کامل می‌شود. */
function parseResp(buf){
  const commands = [];
  let i = 0;
  while(i < buf.length){
    const lineEnd = buf.indexOf('\r\n', i);
    if(lineEnd === -1) break;
    if(buf[i] === 0x2a){ /* *N — bulk array */
      const n = parseInt(buf.slice(i + 1, lineEnd), 10);
      let p = lineEnd + 2;
      const args = [];
      let ok = true;
      for(let a = 0; a < n; a++){
        if(p >= buf.length || buf[p] !== 0x24){ ok = false; break; }
        const lenEnd = buf.indexOf('\r\n', p + 1);
        if(lenEnd === -1){ ok = false; break; }
        const len = parseInt(buf.slice(p + 1, lenEnd), 10);
        const sStart = lenEnd + 2;
        if(sStart + len + 2 > buf.length){ ok = false; break; }
        args.push(buf.slice(sStart, sStart + len).toString());
        p = sStart + len + 2;
      }
      if(!ok) break;
      commands.push(args);
      i = p;
    } else { /* inline */
      commands.push(buf.slice(i, lineEnd).toString().split(' '));
      i = lineEnd + 2;
    }
  }
  return { commands, rest: buf.slice(i) };
}

function fakeRedis(){
  const conns = new Set();
  const srv = net.createServer((sock) => {
    conns.add(sock);
    let pending = Buffer.alloc(0);
    sock.on('data', (d) => {
      pending = Buffer.concat([pending, d]);
      const { commands, rest } = parseResp(pending);
      pending = rest;
      for(const args of commands){
        const cmd = String(args[0] || '').toUpperCase();
        if(cmd === 'HELLO') sock.write("-ERR unknown command 'HELLO'\r\n");
        else if(cmd === 'PING') sock.write('+PONG\r\n');
        else if(cmd === 'INFO'){
          const t = 'redis_version:7.0.0\r\nloading:0\r\n';
          sock.write('$' + t.length + '\r\n' + t + '\r\n');
        }
        else if(cmd === 'SUBSCRIBE'){
          const ch = String(args[1] || '');
          sock.write('*3\r\n$9\r\nsubscribe\r\n$' + ch.length + '\r\n' + ch + '\r\n:1\r\n');
        }
        else sock.write('+OK\r\n'); /* CLIENT/AUTH/SELECT/... */
      }
    });
    sock.on('close', () => conns.delete(sock));
    sock.on('error', () => {});
  });
  let port = null;
  return {
    start(p){ return new Promise((res, rej) => { srv.once('error', rej); srv.listen(p || 0, '127.0.0.1', () => { srv.removeListener('error', rej); port = srv.address().port; res(port); }); }); },
    stop(){ for(const c of conns){ try { c.destroy(); } catch (e) {} } conns.clear(); try { srv.close(); } catch (e) {} },
    get port(){ return port; }
  };
}

(async () => {
  /* ── R1 ── */
  console.log('\n▸ R1 — Crash Consistency (SIGKILL)');
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-a5-r1-'));
    const T = path.join(tmp, 'store.json');
    fs.copyFileSync(REAL_STORE, T);

    const c1 = spawnServer(T, tmp);
    let BASE = '';
    try { BASE = await c1.ready(15000); } catch (e) { chk('R1a استارتِ فرایند', false, String(e.message).slice(0, 200)); }
    if(BASE){
      chk('R1a استارتِ فرایند (READY)', true);
      let cookie = '';
      try { cookie = await login(BASE); chk('R1b لاگینِ superadmin (demo code)', true); }
      catch (e) { chk('R1b لاگینِ superadmin', false, String(e).slice(0, 120)); }

      if(cookie){
        const mk = (n) => 'crashmark-' + Date.now() + '-' + n;
        const names = [mk(1), mk(2), mk(3)];
        const ops = names.map((n, i) => ({ uid: 'r1-' + i, t: 'ins', c: 'visitors', by: SUPERADMIN_ID, data: { school_id: SEED_SCHOOL_ID, name: n, purpose: 'Arena5-R1', in_at: '', out_at: '', registered_by: 1, created_at: '' } }));
        let r = await j(BASE, 'POST', '/api/sync', { headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ ops }) });
        chk('R1c syncِ نوشتِ واقعی (3 visitor)', r.status === 200 && r.body && r.body.ok, r.status + ' ' + JSON.stringify(r.body).slice(0, 120));

        const flushed = await waitForFile(() => {
          const s = fs.readFileSync(T, 'utf8');
          return names.every((n) => s.indexOf(n) > -1);
        }, 8000, 'flush');
        chk('R1d flush به دیسک (persist ≤ 8s)', flushed);

        /* ── کشتنِ خشکانه ── */
        c1.proc.kill('SIGKILL');
        const ex = await new Promise((resolve) => {
          const t = setTimeout(() => resolve({ code: 'timeout', signal: null }), 5000);
          c1.proc.on('exit', (code, signal) => { clearTimeout(t); resolve({ code, signal }); });
        });
        chk('R1e فرایند SIGKILL شد', ex.signal === 'SIGKILL' || ex.code !== 0, JSON.stringify(ex));

        /* ── یکپارچگیِ فایل پس ازِ crash ── */
        let parsed = null;
        try { parsed = JSON.parse(fs.readFileSync(T, 'utf8')); } catch (e) {}
        chk('R1f store پس ازِ crash سالم (JSON قابلِ parse)', !!parsed);
        if(parsed){
          const s = JSON.stringify(parsed.visitors || []);
          chk('R1g دادهٔ flushشده پس ازِ crash مانده', names.every((n) => s.indexOf(n) > -1));

          /* ── restart رویِ همان store ── */
          const c2 = spawnServer(T, tmp);
          let BASE2 = '';
          try { BASE2 = await c2.ready(15000); } catch (e) { chk('R1h restart رویِ storeِ crash‌خورده', false, String(e.message).slice(0, 200)); }
          if(BASE2){
            const st = await waitStatus(BASE2, 200, 5000);
            chk('R1h restart + readiness 200', st === 200, 'got ' + st);

            /* دادهٔ قابلِ خواندن است: id یکی ازِ مارکرها را از فایل بگیر
               و با sync del آن را حذف کن — اثباتِ خواندن+نوشتنِ زنده. */
            const victim = (parsed.visitors || []).find((v) => names.indexOf(v.name) > -1);
            if(victim){
              /* کوکیِ c1 در c2 هم معتبر است: همان PAYESH_KEY (امضا) +
                 sv ثابت ۰ در dev + بدونِ revocation ⇒ session از crash
                 عبور می‌کند (بخشی ازِ recovery). */
              const r2 = await j(BASE2, 'POST', '/api/sync', { headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ ops: [{ uid: 'r1-del', t: 'del', c: 'visitors', by: SUPERADMIN_ID, id: victim.id }] }) });
              chk('R1i دادهٔ زنده: del رویِ رکوردِ مانده', r2.status === 200 && r2.body && r2.body.ok, r2.status + ' ' + JSON.stringify(r2.body).slice(0, 120));
              const gone = await waitForFile(() => {
                try { return JSON.stringify(JSON.parse(fs.readFileSync(T, 'utf8')).visitors || []).indexOf(victim.name) === -1; }
                catch (e) { return false; }
              }, 8000, 'del-flush');
              chk('R1j حذف flush شد (نوشتنِ زنده)', gone);
            } else {
              chk('R1i دادهٔ زنده (victim یافت شد)', false, 'no marker visitor');
            }
            try { c2.proc.kill('SIGTERM'); } catch (e) {}
          }
        } else {
          chk('R1g دادهٔ flushشده مانده', false, 'store unparseable');
        }
      }
    }
    try { c1.proc.kill('SIGKILL'); } catch (e) {}
  }

  /* ── R2: Restore Drill (درون‌فرایند) ── */
  console.log('\n▸ R2 — Restore Drill (backup ← فساد ← restore)');
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-a5-r2-'));
    const T = path.join(tmp, 'store.json');
    fs.copyFileSync(REAL_STORE, T);
    Object.assign(process.env, baseEnv(T, tmp));

    const mod = require(path.join(ROOT, 'server', 'index.js'));
    await new Promise((res) => mod.server.listen(0, res));
    const BASE = 'http://127.0.0.1:' + mod.server.address().port;

    let cookie = '';
    try { cookie = await login(BASE); chk('R2a لاگینِ superadmin', true); }
    catch (e) { chk('R2a لاگینِ superadmin', false, String(e).slice(0, 120)); }

    if(cookie){
      const markName = 'restoremark-' + Date.now();
      let r = await j(BASE, 'POST', '/api/sync', { headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ ops: [{ uid: 'r2-1', t: 'ins', c: 'visitors', by: SUPERADMIN_ID, data: { school_id: SEED_SCHOOL_ID, name: markName, purpose: 'Arena5-R2', in_at: '', out_at: '', registered_by: 1, created_at: '' } }] }) });
      chk('R2b نوشتِ مارکر', r.status === 200 && r.body && r.body.ok, String(r.status));
      await waitForFile(() => { try { return fs.readFileSync(T, 'utf8').indexOf(markName) > -1; } catch (e) { return false; } }, 8000, 'flush');

      r = await j(BASE, 'POST', '/api/admin/backup', { headers: { cookie } });
      chk('R2c backup (API) → 200 + file', r.status === 200 && r.body && r.body.ok && !!r.body.file, r.status + ' ' + JSON.stringify(r.body).slice(0, 120));
      const bfile = r.body && r.body.file;

      if(bfile){
        const bfp = path.join(tmp, 'backups', bfile);
        const bOk = fs.existsSync(bfp) && JSON.stringify(JSON.parse(fs.readFileSync(bfp, 'utf8')).visitors || []).indexOf(markName) > -1;
        chk('R2d فایلِ بکاپ سالم + شاملِ مارکر', bOk);

        /* ── فسادِ حافظه‌ای (سzenario: دادهٔ گم شده/خراب) ── */
        const before = mod.store.visitors.length;
        mod.store.visitors = mod.store.visitors.filter((v) => v.name !== markName);
        chk('R2e فساد اعمال شد (مارکر از حافظه حذف)', mod.store.visitors.length === before - 1, before + '→' + mod.store.visitors.length);

        r = await j(BASE, 'POST', '/api/admin/restore', { headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ file: bfile }) });
        chk('R2f restore (API) → 200', r.status === 200 && r.body && r.body.ok, r.status + ' ' + JSON.stringify(r.body).slice(0, 120));
        chk('R2g مارکر بازگشت (بازیابیِ واقعی)', (mod.store.visitors || []).some((v) => v.name === markName));

        const auditTxt = fs.existsSync(path.join(tmp, 'audit.log')) ? fs.readFileSync(path.join(tmp, 'audit.log'), 'utf8') : '';
        chk('R2h audit: backup_created + restore_completed', auditTxt.indexOf('backup_created') > -1 && auditTxt.indexOf('restore_completed') > -1);

        /* ── valite: driver حافظهٔ db (بخشِ درون‌فرایندِ R4) ── */
        const dp = await mod.db.ping();
        chk('R2i db.ping (درایورِ حافظه) ok', !!(dp && dp.ok && dp.driver === 'memory'), JSON.stringify(dp).slice(0, 100));
      }
    }
    try { mod.server.close(); } catch (e) {}
    /* فرایند: R3/R4 ادامه دارند — store را برگردان تا فرایند تمیز برود */
    process.exitCode = process.exitCode || 0;
  }

  /* ── R3: Redis Failover / Failback (ioredis واقعی) ── */
  console.log('\n▸ R3 — Redis Failover/Failback (ioredis واقعی)');
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-a5-r3-'));
    const T = path.join(tmp, 'store.json');
    fs.copyFileSync(REAL_STORE, T);

    const fake = fakeRedis();
    await fake.start(0);
    const rport = fake.port;
    chk('R3a fake ردیس (TCP RESP) بالا', rport > 0, 'port ' + rport);

    /* P0#2: production + Redis مشترک ⇒ کلیدِ نشستِ مشترک الزامی است (fail-fastِ تازه) */
    const c3 = spawnServer(T, tmp, { PAYESH_ENV: 'production', NODE_ENV: 'production', PAYESH_BEHIND_PROXY: '1', REDIS_URL: 'redis://127.0.0.1:' + rport, PAYESH_JWT_SECRET: 'arena5-recovery-shared-jwt-secret-0123456789' });
    let BASE = '';
    try { BASE = await c3.ready(15000); } catch (e) { chk('R3b استارتِ production + ردیسِ زنده', false, String(e.message).slice(0, 200)); }
    if(BASE){
      /* race-guard: readiness با eventِ connectِ کلاینتِ اصلی می‌تواند
         پیش از تکمیلِ init (مرحلهٔ subClient) 200 بدهد؛ اگر در همان
         پنجره ردیس بمیرد، promiseِ connect می‌ریزد و init fail-fast
         می‌کند. اینجا صبر می‌کنیم تا init کامل شود (خطِ [Cache]). */
      const initFull = await new Promise((res) => {
        const t0 = Date.now();
        const t = setInterval(() => {
          if(c3.out.join('').indexOf('[Cache] Redis distributed') > -1){ clearInterval(t); res(true); }
          else if(Date.now() - t0 > 10000){ clearInterval(t); res(false); }
        }, 50);
      });
      chk('R3b استارتِ production + ردیسِ زنده (init کامل)', initFull);
      const s1 = await waitStatus(BASE, 200, 8000);
      chk('R3c readiness 200 (ردیسِ زنده)', s1 === 200, 'got ' + s1);

      /* ── مرگِ ردیس در حینِ پرواز ── */
      fake.stop();
      const s2 = await waitStatus(BASE, 503, 8000);
      chk('R3d مرگِ ردیس ⇒ readiness 503', s2 === 503, 'got ' + s2);

      /* ── بازگشتِ ردیس درِ درونِ پنجرهٔ retry (200+400+600ms) ── */
      await sleep(250);
      await fake.start(rport);
      const s3 = await waitStatus(BASE, 200, 8000);
      chk('R3e failback بدونِ restart (retry درِ پنجره) ⇒ 200', s3 === 200, 'got ' + s3);

      /* ── قطعِ طولانی (خارجِ پنجرهٔ retry) ── */
      fake.stop();
      await sleep(3000); /* > 200+400+600ms + حاشیه — retryStrategy تمام */
      const s4 = await waitStatus(BASE, 503, 5000);
      chk('R3f قطعِ طولانی ⇒ 503 (retryStrategy تمام شده)', s4 === 503, 'got ' + s4);

      /* بازگشتِ ردیس پس ازِ انصرخاخِ retry ⇒ بدونِ restart نمی‌آید
         (محدودیتِ مُستند — اثباتِ قرارداد) */
      await fake.start(rport);
      await sleep(2000);
      const s5 = await readiness(BASE);
      chk('R3g محدودیتِ مُستند: بدونِ restart، 503 ماندگار', s5 === 503, 'got ' + s5);

      /* ── recovery = restartِ فرایند (مسیرِ عملیاتی) ── */
      c3.proc.kill('SIGTERM');
      await new Promise((resolve) => {
        const t = setTimeout(() => { try { c3.proc.kill('SIGKILL'); } catch (e) {} resolve(); }, 8000);
        c3.proc.on('exit', () => { clearTimeout(t); resolve(); });
      });
      const c4 = spawnServer(T, tmp, { PAYESH_ENV: 'production', NODE_ENV: 'production', PAYESH_BEHIND_PROXY: '1', REDIS_URL: 'redis://127.0.0.1:' + rport, PAYESH_JWT_SECRET: 'arena5-recovery-shared-jwt-secret-0123456789' });
      let BASE4 = '';
      try { BASE4 = await c4.ready(15000); } catch (e) { chk('R3h restart پس ازِ قطعِ طولانی', false, String(e.message).slice(0, 200)); }
      if(BASE4){
        await new Promise((res) => {
          const t0 = Date.now();
          const t = setInterval(() => {
            if(c4.out.join('').indexOf('[Cache] Redis distributed') > -1){ clearInterval(t); res(true); }
            else if(Date.now() - t0 > 10000){ clearInterval(t); res(false); }
          }, 50);
        });
        const s6 = await waitStatus(BASE4, 200, 8000);
        chk('R3h restart ⇒ readiness 200 (recovery کامل)', s6 === 200, 'got ' + s6);
        try { c4.proc.kill('SIGTERM'); } catch (e) {}
      }
    }
    fake.stop();
  }

  /* ── R4: PostgreSQL Failback (قراردادِ استاتیک) ── */
  console.log('\n▸ R4 — PostgreSQL Failback (قراردادِ استاتیک — PG در ساندباکس نیست)');
  {
    const dbsrc = fs.readFileSync(path.join(ROOT, 'server', 'db.js'), 'utf8');
    chk('R4a scheduleReconnect تعریف شده', dbsrc.indexOf('function scheduleReconnect') > -1);
    const callSites = (dbsrc.match(/scheduleReconnect\(\)/g) || []).length;
    chk('R4b در مسیرِ خطا/بستن صدا زده می‌شود (≥2 نقطه)', callSites >= 2, 'callSites=' + callSites);
    /* delay ثابتِ ۱۰s + تایمرِ تکی (نگهبان reconnectTimer ⇒ بدونِ انباشت) + unref */
    chk('R4c reconnect: delayِ ثابت + بدونِ انباشت (single-timer) + unref', /10000\)\.unref\(\)/.test(dbsrc) && dbsrc.indexOf('if (!config.connectionString || reconnectTimer) return;') > -1);
    chk('R4d ping با SELECT 1 (درایور postgres)', dbsrc.indexOf('SELECT 1') > -1);
    /* خوانش از store است نه PG (معماری) — readiness driver-aware */
    const idxsrc = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');
    chk('R4e readiness: DB = pingِ موتور (memory همیشه ok)', idxsrc.indexOf('dbp = await db.ping()') > -1);
  }

  /* ── جمع ── */
  console.log('\n════════════════════════════════════════');
  console.log('Arena5-Recovery: ' + pass + ' سبز / ' + fail + ' قرمز');
  if(fail) {
    for(const f of fails) console.log('  ✗ ' + f);
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error('FATAL: ' + ((e && e.stack) || e));
  process.exit(1);
});
