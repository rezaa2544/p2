#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   M14-B02 reproduction — bootstrap cache invalidation on role/school change
   ───────────────────────────────────────────────────────────────────
   Claim under test (P1):
     "When a user's role or school changes, the bootstrap cache must not
      keep serving that user's old data/permissions for the TTL window
      (L1 = 60s, L2 = up to 300s)."

   This suite does NOT assume the claim. It boots real servers on the
   current HEAD, mutates a user through the real sync API, and observes
   what /api/v1/bootstrap actually returns afterwards.

   Cache-hit detector (the suite does not rely on any debug flag):
     bootstrap.js builds `server_time` fresh on every payload build
     (bootstrap.js:159 `nowIso = new Date().toISOString()`) and the cached
     body is returned verbatim (index.js:1387 `sendJson(res, r.status,
     r.body)`). So a read whose server_time equals the first read's
     server_time is, to the millisecond, a served cache entry; a changed
     server_time means the payload was rebuilt from the live store.

   Why no re-login is needed:
     sessionFrom re-reads the user from the LIVE store on every request
     (auth.js:150). So after a mutation, a cache MISS always produces the
     correct fresh payload — the ONLY thing that can serve stale data is
     the cache itself. This makes the content assertions unambiguous.

   Sections
     B02-1  cache liveness CANARY (server_time identity)
     B02-2  TEST 1 — role change, school unchanged (control; covered)
     B02-3  TEST 2 — school transfer 1→2 by superadmin (the claim)
     B02-4  TEST 3 — L2-only read (L1 evicted by LRU pressure)
     B02-5  TEST 5 — cross-instance invalidation (shared real Redis)
     B02-6  TEST 4 + pub/sub + epoch contract (unit level)
     B02-7  negative proof — B02_MUTATE=VULN neuters the fix mechanism

   False-green defenses:
     - every early exit prints a summary and process.exit(1)
     - servers are killed + process.exit() at the end (no orphan/EADDRINUSE)
     - a CANARY precedes every negative assertion (cache liveness proven)
     - observations are recorded, never assumed
   ═════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
const MUT = process.env.B02_MUTATE || '';

const PORT_A = 8981;   /* hermetic server A (role change + transfer)    */
const PORT_B = 8982;   /* hermetic server B (L2-only read via LRU)      */
const PORT_MA = 8991;  /* multi-instance A (shared Redis)               */
const PORT_MB = 8992;  /* multi-instance B (shared Redis)               */

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else {
    fail++;
    const detail = extra !== undefined ? ' — ' + String(extra).slice(0, 300) : '';
    errors.push(name + detail);
    console.log('  ❌ ' + name + detail);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const summarize = () => {
  console.log('────────────────────────────────────────────────────────');
  console.log('B02: ' + pass + ' ✅ / ' + fail + ' ❌');
  for (const e of errors) console.log('   ✗ ' + e);
};

const procs = [];
const tmpdirs = [];
process.on('exit', () => {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  for (const d of tmpdirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} }
});
function spawnServer(env) {
  const p = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  p.log = '';
  p.stdout.on('data', (d) => (p.log += d));
  p.stderr.on('data', (d) => (p.log += d));
  procs.push(p);
  return p;
}
function close(p) { try { p.kill('SIGKILL'); } catch (e) {} }

function req(port, method, p, body, headers) {
  return new Promise((resolve) => {
    const data = body !== undefined ? JSON.stringify(body) : null;
    const r = http.request({
      hostname: '127.0.0.1', port, path: p, method,
      headers: Object.assign(
        data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
        headers || {}
      )
    }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, json: j, headers: res.headers, text: b });
      });
    });
    r.on('error', () => resolve({ status: 0, json: null, headers: {}, text: '' }));
    if (data) r.write(data);
    r.end();
  });
}

async function boot(port, extraEnv) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-b02-'));
  tmpdirs.push(d);
  const env = Object.assign({}, process.env, {
    PORT: String(port), HOST: '127.0.0.1',
    PAYESH_STORE: path.join(d, 's.json'),
    PAYESH_AUDIT: path.join(d, 'a.log'),
    PAYESH_KEY: path.join(d, 'k.key'),
    PAYESH_DEMO_CODE: '1',
    PAYESH_OTP_PEPPER: 'b02-repro-pepper',
    /* از memory پروژه: suiteهایی که REST را لمس می‌کنند نیاز به این پرچم
       دارند وگرنه هر درخواست ۵۰۳ می‌شود. */
    PAYESH_ALLOW_DEV_MEMORY_AUTHORITY: '1',
    /* بخش‌های hermetic: fallbackِ درون‌حافظه‌ایِ ردیس تا هیچ حالتی بینِ
       بخش‌ها یا اجراها نشت نکند. بخشِ چندنمونه‌ای این را بازنویسی می‌کند. */
    REDIS_URL: ''
  }, extraEnv || {});
  fs.copyFileSync(REAL_STORE, env.PAYESH_STORE);
  const p = spawnServer(env);
  for (let i = 0; i < 80; i++) {
    const h = await req(port, 'GET', '/api/health');
    if (h.status === 200 && h.json && h.json.ok && h.json.pid === p.pid) return { proc: p, dir: d, env, port };
    if (p.exitCode !== null) { console.log('  server died:\n' + (p.log || '').slice(-800)); return null; }
    await sleep(300);
  }
  return null;
}

/* ── session helpers ───────────────────────────────────────────── */
async function login(port, phone, national_id, label) {
  const sc = await req(port, 'POST', '/api/auth/send-code', { phone });
  const code = sc.json && sc.json.demo_code;
  if (!code) {
    console.log('  [login' + (label ? '/' + label : '') + '] send-code → HTTP ' + sc.status + ' ' + String(sc.text).slice(0, 200));
    return null;
  }
  const lg = await req(port, 'POST', '/api/auth/login', { phone, code, national_id });
  if (lg.status !== 200 || !lg.json || !lg.json.ok) {
    console.log('  [login' + (label ? '/' + label : '') + '] login → HTTP ' + lg.status + ' ' + String(lg.text).slice(0, 200));
    return null;
  }
  const cookie = (lg.headers['set-cookie'] || [])[0];
  return { cookie: cookie ? cookie.split(';')[0] : '', user: lg.json.user };
}
function syncOp(port, cookie, ops) {
  return req(port, 'POST', '/api/sync', { ops }, cookie ? { Cookie: cookie } : {});
}
function bootstrap(port, cookie) {
  return req(port, 'GET', '/api/v1/bootstrap', undefined, cookie ? { Cookie: cookie } : {});
}
/* خلاصهٔ یک خوانش — مبنایِ تمامِ assertionها */
function snap(r) {
  const j = r.json;
  return {
    status: r.status,
    school: j && j.school ? j.school.id : null,
    role: j && j.user ? j.user.role : null,
    st: j ? j.server_time : null
  };
}
const sameSt = (a, b) => !!a && !!b && a.st === b.st;

/* ── sync op builder (real offline-client shape: full record) ─── */
function mkUserOp(actor, target, newSchoolId, newRole, uid) {
  const data = Object.assign({}, target);
  delete data.password;
  if (newSchoolId !== undefined) data.school_id = newSchoolId;
  if (newRole !== undefined) data.role = newRole;
  return { uid, c: 'users', t: 'upd', by: actor.id, user_id: actor.id, id: target.id, data };
}

/* poll until predicate truthy (returns last observation) */
async function waitFor(fn, timeoutMs, stepMs) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < (timeoutMs || 4000)) {
    try { last = await fn(); if (last) return last; } catch (e) { last = 'ERR ' + String((e && e.message) || e); }
    await sleep(stepMs || 200);
  }
  return last;
}

/* ── raw-Redis helpers for the multi-instance section ─────────── */
function redisCmd(url, cmd, key) {
  return new Promise((resolve) => {
    let host = '127.0.0.1', port = 6379;
    try { const u = new URL(url); host = u.hostname; port = Number(u.port) || 6379; } catch (e) {}
    const s = net.connect(port, host, () => {
      const k = Buffer.from(key, 'utf8');
      const body = cmd.toUpperCase() === 'PING'
        ? 'PING\r\n'
        : cmd.toUpperCase() === 'GET'
          ? 'GET $' + k.length + '\r\n' + key + '\r\n'
          : 'DEL $' + k.length + '\r\n' + key + '\r\n';
      s.write(body);
    });
    let buf = Buffer.alloc(0);
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      const t = buf.toString('utf8');
      if (cmd.toUpperCase() === 'GET') {
        if (t.indexOf('\r\n') >= 0) { s.destroy(); resolve(t.indexOf('$-1') === 0 ? null : t); }
      } else {
        /* PING → +PONG، DEL → :N — هر پاسخِ RESPِ کامل کافی است */
        if (t.indexOf('\r\n') >= 0) { s.destroy(); resolve(t); }
      }
    });
    s.on('error', () => resolve(null));
    setTimeout(() => { try { s.destroy(); } catch (e) {} resolve(null); }, 2000);
  });
}
const probeRedis = (url) => redisCmd(url, 'PING', 'x').then((t) => typeof t === 'string' && t.indexOf('PONG') >= 0);

async function main() {
  const seed = JSON.parse(fs.readFileSync(REAL_STORE, 'utf8'));
  const users = seed.users || [];
  const pick = (role, school_id) => users.find(u => u.role === role && u.active !== 0 && (school_id == null || u.school_id === school_id));
  const superadmin = pick('superadmin');
  const teacher = pick('teacher', 1);   /* id=4 — the transfer target */
  const manager = pick('manager', 1);

  if (!superadmin || !teacher || !manager) {
    console.log('❌ seed فاقد نقش‌های لازم است', !!superadmin, !!teacher, !!manager);
    summarize(); process.exit(1);
  }
  console.log('  target teacher id=' + teacher.id + ' (school ' + teacher.school_id + '), superadmin id=' + superadmin.id);
  if (MUT) console.log('— B02: حالتِ جهش — فقطِ رأیِ جهش (B02-7) اجرا می‌شود —');

  /* ═══ B02-0: boot hermetic server A ════════════════════════════ */
  let srvA = null;
  if (!MUT) {
    console.log('— B02-0: بوتِ سرورِ hermetic روی current HEAD —');
    srvA = await boot(PORT_A);
    chk('سرورِ A روی پورت ' + PORT_A + ' بالا آمد', !!srvA);
    if (!srvA) { summarize(); process.exit(1); }
  }

  if (!MUT) {
    /* ═══ B02-1: baseline + cache liveness CANARY ════════════════ */
    console.log('— B02-1: baseline و زنده‌بودنِ لایهٔ کش (CANARY) —');
    const sa = await login(PORT_A, superadmin.phone, superadmin.national_id, 'superadmin');
    const t1 = await login(PORT_A, teacher.phone, teacher.national_id, 'teacher');
    chk('ورودِ superadmin', !!sa);
    chk('ورودِ teacher (هدف)', !!t1);
    if (!sa || !t1) { summarize(); process.exit(1); }

    const c1 = snap(await bootstrap(PORT_A, t1.cookie));
    chk('CANARY: bootstrap اول 200 با مدرسهٔ ۱ و نقشِ teacher',
      c1.status === 200 && c1.school === 1 && c1.role === 'teacher', JSON.stringify(c1));
    const c2 = snap(await bootstrap(PORT_A, t1.cookie));
    /* اگر server_time یکی نبود، لایهٔ کش اصلاً در بازی نیست و تمامِ
       assertionهایِ «کهنه» بعدی بی‌معنی می‌شوند. */
    chk('CANARY: خوانشِ دوم همان server_time را داشت (ورودی واقعاً از کش سرو شد)',
      sameSt(c1, c2), JSON.stringify(c2));
    const t0St = c1.st;

    /* ═══ B02-2: TEST 1 — role change, school unchanged (control) ═══ */
    console.log('— B02-2: TEST ۱ — تغییرِ نقش (مدرسهٔ ثابت) — مسیرِ پوشیدهٔ موجود —');
    const rRole = await syncOp(PORT_A, sa.cookie, [mkUserOp(sa.user, teacher, teacher.school_id, 'counselor', 'b02-role-' + Date.now())]);
    const rRoleRes = (rRole.json && rRole.json.results && rRole.json.results[0]) || {};
    console.log('  sync → HTTP ' + rRole.status + ' ' + JSON.stringify(rRoleRes));
    chk('تغییرِ نقش اعمال شد (ok:true)', rRoleRes.ok === true, JSON.stringify(rRoleRes));
    /* کوکیِ اصلی کافی است: sessionFrom کاربر را از استورِ زنده می‌خواند،
       پس در صورتِ cache-miss، نقشِ جدید دیده می‌شود. */
    const roleObs = [];
    const roleFinal = await waitFor(async () => {
      const s = snap(await bootstrap(PORT_A, t1.cookie));
      roleObs.push({ role: s.role, school: s.school, cached: s.st === t0St });
      if (s.status === 200 && s.role === 'counselor' && s.school === 1 && s.st !== t0St) return s;
      return null;
    }, 4000);
    console.log('  مشاهدات: ' + JSON.stringify(roleObs));
    chk('TEST ۱: bootstrap پس از تغییرِ نقش، نقشِ جدید را از استورِ زنده ساخت (نه cached-stale)',
      !!roleFinal && roleFinal.role === 'counselor' && roleFinal.st !== t0St,
      'last=' + JSON.stringify(roleFinal));
    /* این کنترلِ مثبت اثبات می‌کند که مسیرِ ابطال در این suite قابلِ
       مشاهده است؛ پس شکستِ B02-3 نمی‌تواند یک مشاهدهٔ مرده باشد. */

    /* ═══ B02-3: TEST 2 — school transfer (the claim) ═════════════ */
    console.log('— B02-3: TEST ۲ — انتقالِ مدرسه ۱→۲ توسطِ superadmin — موردِ ادعا —');
    const rXfer = await syncOp(PORT_A, sa.cookie, [mkUserOp(sa.user, teacher, 2, 'teacher', 'b02-xfer-' + Date.now())]);
    const rXferRes = (rXfer.json && rXfer.json.results && rXfer.json.results[0]) || {};
    console.log('  sync → HTTP ' + rXfer.status + ' ' + JSON.stringify(rXferRes));
    chk('انتقالِ مدرسه اعمال شد (ok:true)', rXferRes.ok === true, JSON.stringify(rXferRes));
    /* چند ثانیه مشاهده می‌کنیم تا نشان داده شود حالتِ کهنه خودترمیم
       نمی‌شود (L1 کهنه، L2 با epochِ مدرسهٔ ۱ که bump نشده معتبر می‌ماند). */
    const xferObs = [];
    const xferFinal = await waitFor(async () => {
      const s = snap(await bootstrap(PORT_A, t1.cookie));
      xferObs.push({ school: s.school, role: s.role, cached: s.st === t0St });
      if (s.status === 200 && s.school === 2 && s.st !== t0St) return s;
      return null;
    }, 3500, 500);
    console.log('  مشاهدات: ' + JSON.stringify(xferObs));
    chk('TEST ۲: bootstrap پس از انتقال، مدرسهٔ ۲ را از استورِ زنده ساخت (نه مدرسهٔ ۱ِ کهنه)',
      !!xferFinal && xferFinal.school === 2 && xferFinal.st !== t0St,
      'last=' + JSON.stringify(xferFinal));

    /* ═══ B02-4: TEST 3 — L2-only read (L1 evicted by LRU) ════════ */
    console.log('— B02-4: TEST ۳ — خوانشِ خالص-L2 (L1 با فشارِ LRU خارج شد) —');
    const srvB = await boot(PORT_B, { PAYESH_L1_MAX_ENTRIES: '1' });
    chk('سرورِ B (سقفِ L1 = ۱) روی پورت ' + PORT_B + ' بالا آمد', !!srvB);
    if (!srvB) { summarize(); process.exit(1); }
    const saB = await login(PORT_B, superadmin.phone, superadmin.national_id, 'B-superadmin');
    const tB = await login(PORT_B, teacher.phone, teacher.national_id, 'B-teacher');
    const mB = await login(PORT_B, manager.phone, manager.national_id, 'B-manager');
    chk('ورودها روی سرورِ B', !!saB && !!tB && !!mB);
    if (saB && tB && mB) {
      const l1 = snap(await bootstrap(PORT_B, tB.cookie));         /* build → L1={teacher}, L2 set */
      const ev = snap(await bootstrap(PORT_B, mB.cookie));         /* build → l1Set(manager) ⇒ teacher اخراج */
      const l2 = snap(await bootstrap(PORT_B, tB.cookie));         /* L1-miss → L2 read */
      /* CANARY: بعد از یک اخراجِ تضمینی از L1، خوانش همان server_timeِ
         payloadِ اصلی را دارد ⇒ ورودی واقعاً در L2 نشسته و سرو می‌شود. */
      chk('CANARY: خوانشِ پس از اخراجِ L1، همان payload را از L2 آورد (server_time یکسان)',
        sameSt(l1, l2) && !sameSt(l1, ev), JSON.stringify({ l1: l1.st, ev: ev.st, l2: l2.st }));
      const t0StB = l1.st;

      const rXfer2 = await syncOp(PORT_B, saB.cookie, [mkUserOp(saB.user, teacher, 2, 'teacher', 'b02-xfer2-' + Date.now())]);
      const rXfer2Res = (rXfer2.json && rXfer2.json.results && rXfer2.json.results[0]) || {};
      chk('انتقالِ مدرسه روی سرورِ B اعمال شد', rXfer2Res.ok === true, JSON.stringify(rXfer2Res));
      /* دوباره L1 را اخراج می‌کنیم تا خوانشِ بعدی مجبور به L2 شود */
      await bootstrap(PORT_B, mB.cookie);
      const l2Obs = [];
      const l2Final = await waitFor(async () => {
        const s = snap(await bootstrap(PORT_B, tB.cookie));
        l2Obs.push({ school: s.school, cached: s.st === t0StB });
        if (s.status === 200 && s.school === 2 && s.st !== t0StB) return s;
        return null;
      }, 3500, 500);
      console.log('  مشاهداتِ L2: ' + JSON.stringify(l2Obs));
      chk('TEST ۳: خوانشِ خالص-L2 پس از انتقال، مدرسهٔ ۲ را ساخت (L2 هم ابطال شد)',
        !!l2Final && l2Final.school === 2 && l2Final.st !== t0StB,
        'last=' + JSON.stringify(l2Final));
    }
    close(srvB.proc);

    /* ═══ B02-5: TEST 5 — cross-instance invalidation (real Redis) ═ */
    console.log('— B02-5: TEST ۵ — ابطالِ بین‌نمونه‌ای (ردیسِ مشترک) —');
    const redisUrl = process.env.REDIS_URL && process.env.REDIS_URL.length > 0
      ? process.env.REDIS_URL : 'redis://127.0.0.1:6379';
    const redisUp = await probeRedis(redisUrl);
    if (!redisUp) {
      console.log('  ⏭ NOT-RUN: ردیسِ واقعی در ' + redisUrl + ' در دسترس نیست — بخشِ چندنمونه‌ای نیاز به یک گذرگاهِ مشترک دارد.');
      console.log('     (قراردادِ گذرگاه و epoch در B02-6 به‌صورتِ unit بررسی می‌شود)');
    } else {
      console.log('  ردیس در دسترس است — دو نمونه با گذرگاهِ مشترک بوت می‌شوند');
      const myKeys = ['payesh:cache:bootstrap:' + teacher.id, 'payesh:cache:school:1', 'payesh:cache:school:2',
                      'payesh:cache:epoch:school:1', 'payesh:cache:epoch:school:2'];
      for (const k of myKeys) await redisCmd(redisUrl, 'DEL', k);

      const mA = await boot(PORT_MA, { REDIS_URL: redisUrl });
      const mB = await boot(PORT_MB, { REDIS_URL: redisUrl });
      chk('نمونهٔ A روی ' + PORT_MA + ' بالا آمد', !!mA);
      chk('نمونهٔ B روی ' + PORT_MB + ' بالا آمد', !!mB);
      if (!mA || !mB) { summarize(); process.exit(1); }
      const tA = await login(PORT_MA, teacher.phone, teacher.national_id, 'A-teacher');
      const saM = await login(PORT_MB, superadmin.phone, superadmin.national_id, 'B-superadmin');
      chk('ورودها روی هر دو نمونه', !!tA && !!saM);
      if (tA && saM) {
        const a1 = snap(await bootstrap(PORT_MA, tA.cookie));       /* build در A → L1_A + L2 مشترک */
        const a2 = snap(await bootstrap(PORT_MA, tA.cookie));       /* L1_A hit */
        chk('CANARY: نمونهٔ A بوت‌استرپ را کش کرد (server_time یکسان)',
          sameSt(a1, a2) && a2.school === 1, JSON.stringify({ a1: a1.st, a2: a2.st, school: a2.school }));
        const t0StM = a1.st;

        /* جهش در نمونهٔ B رخ می‌دهد؛ انتظار می‌رود A مطلع شود.
           استورها جدا هستند (هر نمونه فایلِ خودش)، پس بارگذارِ
           correctnessاینجا پرچمِ «همان ورودیِ کش‌شده» است: A نباید
           payloadِ cacheشدهٔ خودش را ادامه دهد. */
        const rXfer3 = await syncOp(PORT_MB, saM.cookie, [mkUserOp(saM.user, teacher, 2, 'teacher', 'b02-multi-' + Date.now())]);
        const rXfer3Res = (rXfer3.json && rXfer3.json.results && rXfer3.json.results[0]) || {};
        chk('انتقال در نمونهٔ B اعمال شد', rXfer3Res.ok === true, JSON.stringify(rXfer3Res));

        const crossObs = [];
        const crossFinal = await waitFor(async () => {
          const s = snap(await bootstrap(PORT_MA, tA.cookie));
          crossObs.push({ school: s.school, cached: s.st === t0StM });
          if (s.status === 200 && s.st !== t0StM) return s;   /* buildِ تازه ⇒ ابطال رسید */
          return null;
        }, 5000);
        console.log('  مشاهداتِ A: ' + JSON.stringify(crossObs));
        chk('TEST ۵: نمونهٔ A پس از جهش در B، ورودیِ کش‌شدهٔ خود را سرو نکرد (buildِ تازه)',
          !!crossFinal && crossFinal.st !== t0StM, 'last=' + JSON.stringify(crossFinal));
      }
      close(mA.proc);
      close(mB.proc);
      for (const k of myKeys) await redisCmd(redisUrl, 'DEL', k);
    }

    /* ═══ B02-6: TEST 4 + pub/sub + epoch contract (unit) ═════════ */
    console.log('— B02-6: TEST ۴ + قراردادِ گذرگاه و epoch (unit) —');
    process.env.REDIS_URL = '';  /* hermetic: fallbackِ درون‌حافظه‌ای */
    const cache = require('../server/cache.js');
    const redis = require('../server/redis.js');
    await cache.init();
    const INVAL_CHANNEL = 'payesh:pubsub:inval';
    const busEvents = [];
    await redis.subscribe(INVAL_CHANNEL, (msg) => { try { busEvents.push(JSON.parse(msg)); } catch (e) {} });
    const payload = (uid, schoolId, role) => ({ user: { id: uid, role }, school: schoolId == null ? null : { id: schoolId }, role });

    const u6 = 9001, s6 = 21;
    await cache.setBootstrapCache(u6, payload(u6, s6, 'teacher'), 300);
    chk('unit: بوت‌استرپ خوانده شد (پایه)', !!(await cache.getBootstrapCache(u6)));
    await cache.invalidateUser(u6);
    chk('unit: invalidateUser، L1+L2 را پاک کرد', (await cache.getBootstrapCache(u6)) === null);
    const evUser = busEvents[busEvents.length - 1];
    chk('unit: invalidateUser رویدادِ user را روی گذرگاه منتشر کرد',
      !!evUser && evUser.type === 'user' && Number(evUser.user_id) === u6, JSON.stringify(evUser));

    /* epoch: ورودیِ L2 پاکت می‌شود و باید بعد از تغییرِ epochِ مدرسه رد شود.
       L1 باید خالی شود تا مسیرِ L2 (محلِ بررسیِ epoch) اجباراً طی شود. */
    const u7 = 9002, s7 = 22;
    await cache.setBootstrapCache(u7, payload(u7, s7, 'manager'), 300);
    cache.__l1ForTests().clear();
    await redis.set('payesh:cache:epoch:school:' + s7, 'forced:new', 'EX', 3600);
    chk('unit: تغییرِ epochِ مدرسه، ورودیِ L2 را کهنه کرد (دومرتبه‌خوانی ممنوع)',
      (await cache.getBootstrapCache(u7)) === null);

    /* شبیه‌سازیِ دقیقِ مسیرِ sync برای انتقالِ مدرسه: ابطالِ مدرسهٔ
       جدید (همان چیزی که sync.js امروز می‌فرستد) روی ورودیِ tagشدهٔ
       مدرسهٔ قدیمی اثری ندارد. */
    const u8 = 9003, sFrom = 23, sTo = 24;
    await cache.setBootstrapCache(u8, payload(u8, sFrom, 'teacher'), 300);
    await cache.invalidateCollection('users', sTo);
    const u8after = await cache.getBootstrapCache(u8);
    console.log('  invalidateCollection(users, ' + sTo + ') روی ورودیِ مدرسهٔ ' + sFrom + ' → ' + (u8after ? 'STALE بازگشت' : 'null'));
    chk('unit: ابطالِ مدرسهٔ جدید، ورودیِ تگشدهٔ مدرسهٔ قدیمی را پاک نکرد (ریشهٔ ادعا)',
      u8after !== null, JSON.stringify(u8after && { school: u8after.school && u8after.school.id }));
    /* اما ابطالِ مدرسهٔ مبدأ کار می‌کند — و invalidateUser هم مستقیماً */
    await cache.invalidateUser(u8);
    chk('unit: invalidateUser ورودیِ تگشدهٔ مدرسهٔ قدیمی را پاک کرد',
      (await cache.getBootstrapCache(u8)) === null);

    /* TEST 4 — قطعیِ ردیس: خطای ردیس نباید پاسخِ موفقِ کهنه بسازد.
       getBootstrapCache باید fail کند تا bootstrap.js مسیرِ miss-through
       را برود (bootstrap.js:254 آن را می‌گیرد)، نه اینکه کهنه برگرداند. */
    const origGet = redis.get;
    redis.get = async () => { throw new Error('REDIS_DOWN'); };
    let threw = false;
    try { await cache.getBootstrapCache(u6); } catch (e) { threw = true; }
    chk('TEST ۴: قطعیِ redis.get → getBootstrapCache fail کرد (miss-through، نه کهنهٔ خاموش)', threw);
    redis.get = origGet;
    /* setBootstrapCache مقداری برنمی‌گرداند، پس correctness را با یک
       خوانشِ مستقل تأیید می‌کنیم (نه با مقدارِ بازگشتیِ set). */
    await cache.setBootstrapCache(u6, payload(u6, s6, 'teacher'), 300);
    chk('TEST ۴: پس از بازگردانیِ redis.get، لایهٔ کش دوباره کار کرد',
      !!(await cache.getBootstrapCache(u6)));
  } /* end !MUT */

  /* ═══ B02-7: negative proof (B02_MUTATE=VULN) ══════════════════ */
  console.log('— B02-7: رأیِ جهش (negative proof) —');
  {
    const CACHE_PATH = path.join(ROOT, 'server', 'cache.js');
    const M = {
      /* VULN: مکانیزمِ invalidateUser (همان چیزی که اصلاحِ B02 به آن
         تکیه می‌کند) no-op می‌شود. باید تمامِ assertionهایِ پاکسازیِ
         ورودیِ کاربر قرمز شوند. */
      VULN: [
        'async function invalidateUser(userId) {\r\n  localUserBootstrapCache.delete(Number(userId));',
        'async function invalidateUser(userId) {\r\n  return; /* B02 VULN */\r\n  localUserBootstrapCache.delete(Number(userId));',
      ],
    };
    if (!M[MUT]) {
      console.log('  ⏭ جهش ناشناخته: ' + String(MUT) + ' (این بخش فقط با B02_MUTATE=VULN اجرا می‌شود)');
    } else {
      const p = path.resolve(ROOT, 'server', 'cache.b02-mutated.js');
      if (path.dirname(p) !== path.join(ROOT, 'server')) throw new Error('b02: mutated path escapes server/');
      const live = fs.readFileSync(CACHE_PATH, 'utf8');
      if (live.split(M[MUT][0]).length - 1 !== 1) { console.error('الگوی جهش مچ نشد'); process.exit(2); }
      fs.writeFileSync(p, live.replace(M[MUT][0], M[MUT][1]));
      process.on('exit', () => { try { fs.unlinkSync(p); } catch (_) {} });
      process.env.REDIS_URL = '';
      const mutCache = require('../server/cache.b02-mutated.js');
      await mutCache.init();
      const payload = (uid, schoolId, role) => ({ user: { id: uid, role }, school: schoolId == null ? null : { id: schoolId }, role });

      const u = 9004, sFrom = 25, sTo = 26;
      await mutCache.setBootstrapCache(u, payload(u, sFrom, 'teacher'), 300);
      /* دقیقاً همان دنبالهٔ post-commitِ sync پس از اصلاح:
         invalidateCollection(users, newSchool) + invalidateUser(userId) */
      await mutCache.invalidateCollection('users', sTo);
      await mutCache.invalidateUser(u);
      const got = await mutCache.getBootstrapCache(u);
      console.log('  VULN gate: getBootstrapCache(' + u + ') → ' + (got ? 'STALE ' + JSON.stringify({ school: got.school && got.school.id, role: got.role }) : 'null'));
      chk('VULN: دنبالهٔ اصلاح باید ورودی را پاک کند (این assertion باید تحتِ جهش FAIL شود)',
        got === null, JSON.stringify(got && { school: got.school && got.school.id }));
      /* مکانیزمِ دوم (epoch مدرسهٔ مبدأ) همچنان باید کار کند — جهش
         فقط invalidateUser را خنثی کرد. */
      await mutCache.setBootstrapCache(u, payload(u, sFrom, 'teacher'), 300);
      await mutCache.invalidateSchool(sFrom);
      const got2 = await mutCache.getBootstrapCache(u);
      chk('VULN: invalidateSchool(مدرسهٔ مبدأ) همچنان ورودی را پاک کرد (مکانیزمِ دوم سالم)',
        got2 === null, JSON.stringify(got2 && { school: got2.school && got2.school.id }));
    }
  }

  /* ── summary ─────────────────────────────────────────────────── */
  for (const p of procs) close(p);
  summarize();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (_) {} }
  process.exit(2);
});
