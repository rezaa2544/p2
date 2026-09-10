#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave18w19-multinode-live — اجرایِ زندهٔ W18(بار) + W19(chaos) روی
   معماریِ چندنمونه‌ایِ P0 #2 (دو فرایندِ واقعیِ production + Redis واقعی)

   زمینه:
     W18/W19 به‌صورتِ تک‌نمونهٔ شبیه‌سازی‌شده سبز بودند؛ اجرایِ LIVE در
     طرح‌ها «در انتظارِ زیرساختِ چندنمونه‌ای» بود. P0 #2 (Redis مشترک
     برایِ همهٔ stateهایِ حیاتی + fail-closed + کلیدِ نشستِ مشترک)
     دقیقاً همان زیرساخت را ممکن کرد ⇒ این اجرا.

   ایمنی (الگوی W19):
     پیش‌فرض **DRY_RUN** — فقط طرح + اسکلتِ خروجی چاپ می‌شود، هیچ
     فرایندی استارت/کشته نمی‌شود و هیچ دستوری ویرانگر اجرا نمی‌شود.
     اجرایِ زنده فقط با `--live` + envهایِ الزامی (وگرنه خطا).
     سناریویِ redis-down همیشه redis را در `finally` برمی‌گرداند.

   envهایِ لازم برای --live:
     LIVE_REDIS_URL       مثلاً redis://127.0.0.1:6379 (الزامی)
     LIVE_REDIS_BIN_DIR   دایرکتوریِ redis-server/redis-cli (الزامی برای C2/C3)
     LIVE_REDIS_DATA_DIR  دایرکتوریِ دادهٔ redis برایِ restart (AOF)
     LIVE_LOAD_SECONDS    فازِ بار (پیش‌فرض 75)
     LIVE_PORT_A / LIVE_PORT_B  (پیش‌فرض 19471/19472)
     LIVE_JWT_SECRET      کلیدِ نشستِ مشترک (پیش‌فرض: مقدارِ تستیِ ثابت)

   فرضیه‌ها (PASS/FAIL خودکار در summary):
     H1  استارتِ A و B در production + Redis زنده + کلیدِ مشترک
     H2  فراوریِ کلیِ فازِ بار ≥ 99% (بدونِ 5xx)
     H3  صفر 5xx در endpointهایِ state-plane (/api/auth/*)
     H4  cross-instance: /me همهٔ کاربرانِ پول از نمونهٔ متضاد ⇒ 200
     H5  cross-instance: logout در B ⇒ /me در A = 401 (denylist مشترک)
     H6  C1: SIGKILLِ B در حینِ بار ⇒ A ≥ 99.9%؛ نشستِ صادرشده در B در A معتبر
     H7  C1: پس از restartِ B، همان نشست در B معتبر (state در Redis بود)
     H8  C2: redis SHUTDOWN NOSAVE ⇒ liveness 200 + readiness 503 (هر دو)؛
           خوانش‌ها بدونِ 5xx؛ هیچ فرایندی کرش نکرد
     H9  C3: restartِ redis (AOF) + restartِ instanceها (قراردادِ بازیابیِ
           fail-closed) ⇒ readiness 200؛ seq ≥ مارکرِ پیشین؛ نشستِ خارج‌شده
           پیشِ kill هنوز 401 (denylist در AOF ماند)؛ نشستِ سالم 200 دو-نمونه‌ای
     H10 هیچ [FATAL]/uncaught در stderr فرزندِ A/B در طولِ کلِ اجرا

   خروجی: /tmp/multinode-live/{timeline.csv,summary.txt,childA.log,childB.log}
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LIVE = process.argv.includes('--live');
const OUT = '/tmp/multinode-live';

const REDIS_URL = process.env.LIVE_REDIS_URL || '';
const REDIS_BIN = process.env.LIVE_REDIS_BIN_DIR || '';
const REDIS_DATA = process.env.LIVE_REDIS_DATA_DIR || '';
const LOAD_S = Number(process.env.LIVE_LOAD_SECONDS || 75);
const PORT_A = Number(process.env.LIVE_PORT_A || 19471);
const PORT_B = Number(process.env.LIVE_PORT_B || 19472);
const SHARED_JWT = process.env.LIVE_JWT_SECRET || 'multinode-live-shared-jwt-secret-0123456789abcdef';

let A = null, B = null;
global.__sessionsLive = [];
let pass = 0, fail = 0;
const results = [];
function chk(id, ok, detail){
  if(ok){ pass++; results.push('PASS ' + id + ' — ' + detail); console.log('  ✅ ' + id + ' ' + detail); }
  else   { fail++; results.push('FAIL ' + id + ' — ' + detail); console.log('  ❌ ' + id + ' ' + detail); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function procDead(proc){
  /* ساندباکس: رویدادِ exitِ فرزند همیشه نمی‌آید (subreaper) ⇒ liveness با kill(pid,0) */
  if(proc.exitCode !== null || proc.signal) return true;
  try { process.kill(proc.pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; }
}
async function j(base, m, p, opts){
  const t0 = Date.now();
  const r = await fetch(base + p, Object.assign({ method: m }, opts || {}));
  const text = await r.text();
  let body = null; try { body = JSON.parse(text); } catch (e) {}
  return { status: r.status, ms: Date.now() - t0, body, text, headers: r.headers };
}

/* ── طرح (DRY_RUN و گزارشِ زنده هر دو چاپ می‌کنند) ───────────────── */
const PLAN = `
┌─ طرحِ اجرایِ زندهٔ چندنمونه‌ای (W18-bar + W19-chaos) ─────────────────
│ زیرساخت:  2 × node server/index.js (production) + 1 × Redis واقعی (AOF)
│ مشترک:     REDIS_URL + PAYESH_JWT_SECRET      جدا: PAYESH_STORE/AUDIT/KEY
│ PG:        در انتظار (ساندباکس بدونِ PG قابلِ نصب — plane داده = W1/W3)
│ k6/tc:     غیرقابل‌دسترسی از egressِ ساندباکس ⇒ harness Node (پروفایلِ W18)
│            و chaosِ قوی‌ترِ واقعی: SIGKILL instance + SHUTDOWN NOSAVE
├─ فاز ۱ — بار (W18-L، ${'LIVE_LOAD_SECONDS'}s پیش‌فرض 75) ──────────────────────────
│  ۱۶ کاربرِ واقعیِ seed: login flow (send-code + login) متناوب A/B
│  mix پایدار: 40% /me (متناوب A/B — cross-instance) · 25% GET-list
│  15% probe (liveness/readiness/health) · 20% login تازه (cooldown 60s — 429 طبیعی)
│  logout + 401 دو-طرفه: تستِ اختصاصیِ H5 (کاربرِ جدا، بدونِ تداخلِ cooldown)
├─ فاز ۲ — chaos (W19-L) ───────────────────────────────────────────
│  C1 SIGKILLِ B در حینِ بار → A تنها می‌ماند → B برمی‌گردد
│  C2 redis SHUTDOWN NOSAVE در حینِ بار → readiness 503 (P0-13 runtime)
│  C3 restartِ redis (AOF) + restartِ instanceها → بازیابی (قراردادِ fail-closed)
└────────────────────────────────────────────────────────────────────`;

if(!LIVE){
  console.log('wave18w19-multinode-live — DRY_RUN (هیچ چیزی اجرا نمی‌شود)');
  console.log(PLAN);
  console.log('اجرایِ زنده:  LIVE_REDIS_URL=redis://127.0.0.1:6379 LIVE_REDIS_BIN_DIR=… \\');
  console.log('              node tests/wave18w19-multinode-live.js --live');
  console.log('────────────────────────────────────────────────────');
  console.log('multinode-live: DRY_RUN کامل (طرح + اسکلت)');
  process.exit(0);
}
if(!REDIS_URL || !REDIS_BIN){
  console.error('خطا: --live بدون LIVE_REDIS_URL / LIVE_REDIS_BIN_DIR مجاز نیست (الگوی W19)');
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });
const timeline = fs.openSync(path.join(OUT, 'timeline.csv'), 'w');
fs.writeSync(timeline, 'ts,phase,target,endpoint,status,ms\n');

console.log('wave18w19-multinode-live — اجرایِ زنده');
console.log(PLAN);
console.log('  redis: ' + REDIS_URL + ' · bin: ' + REDIS_BIN);

/* ── ابزارها ─────────────────────────────────────────────────────── */
function spawnInstance(name, storeFile, tmp, port){
  const env = Object.assign({}, process.env);
  for(const k of ['PAYESH_ENV','NODE_ENV','REDIS_URL','PAYESH_JWT_SECRET','PAYESH_JWT_SECRET_PREV',
    'PAYESH_TEST_SLOW_MS','PAYESH_BEHIND_PROXY','PAYESH_SHUTDOWN_TIMEOUT_MS','DATABASE_URL',
    'PAYESH_SMS_IP_LIMIT','PAYESH_LOGIN_IP_LIMIT','PAYESH_DEMO_CODE','PAYESH_STORE','PAYESH_AUDIT','PAYESH_KEY'])
    delete env[k];
  Object.assign(env, {
    PORT: String(port), HOST: '127.0.0.1',
    PAYESH_STORE: storeFile,
    PAYESH_AUDIT: path.join(tmp, name + '-audit.log'),
    PAYESH_KEY: path.join(tmp, name + '-jwt.key'),
    PAYESH_ENV: 'production', NODE_ENV: 'production', PAYESH_BEHIND_PROXY: '1',
    REDIS_URL,
    PAYESH_JWT_SECRET: SHARED_JWT,
    PAYESH_DEMO_CODE: '1',
    PAYESH_SMS_IP_LIMIT: '100000', PAYESH_LOGIN_IP_LIMIT: '100000',
  });
  const logF = fs.openSync(path.join(OUT, 'child' + name + '.log'), 'a');
  const proc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT, env, stdio: ['ignore', logF, logF],
  });
  return { proc, name, port, base: 'http://127.0.0.1:' + port };
}
async function waitReady(inst, ms){
  const t0 = Date.now();
  while(Date.now() - t0 < ms){
    try {
      const r = await j(inst.base, 'GET', '/api/liveness');
      if(r.status === 200) return true;
    } catch (e) {}
    if(procDead(inst.proc)) return false;
    await sleep(300);
  }
  return false;
}
function redisCli(...args){
  return new Promise((resolve) => {
    const p = spawn(path.join(REDIS_BIN, 'redis-cli'), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let o = ''; p.stdout.on('data', (d) => o += d);
    p.on('exit', (code) => resolve({ code, out: o.trim() }));
    setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} }, 10000);
  });
}
function redisServer(){
  const args = ['--port', REDIS_URL.split(':')[2].replace(/\D.*$/, ''), '--bind', '127.0.0.1',
    '--dir', REDIS_DATA, '--appendonly', 'yes', '--appendfsync', 'everysec', '--save', ''];
  const logF = fs.openSync(path.join(OUT, 'redis.log'), 'a');
  const p = spawn(path.join(REDIS_BIN, 'redis-server'), args, { stdio: ['ignore', logF, logF] });
  p.unref();
  return p;
}
function sampler(phase){
  const iv = setInterval(async () => {
    for(const t of ['A', 'B']){
      try {
        const r = await j(t === 'A' ? A.base : B.base, 'GET', '/api/readiness');
        fs.writeSync(timeline, Date.now() + ',' + phase + ',inst' + t + ',readiness,' + r.status + ',' + r.ms + '\n');
      } catch (e) {
        fs.writeSync(timeline, Date.now() + ',' + phase + ',inst' + t + ',readiness,ERR,' + (e.message || 'e') + '\n');
      }
    }
  }, 5000);
  return iv;
}
function stats(m){
  const tot = Object.values(m).reduce((a, b) => a + b.total, 0);
  const bad5 = Object.values(m).reduce((a, b) => a + b.s5, 0);
  return { tot, bad5, avail: tot ? (100 * (tot - bad5) / tot) : 100 };
}

async function main(){
  /* ── Phase 0 — زیرساخت ───────────────────────────────────────────── */
  console.log('\n▸ Phase 0 — چکِ زیرساخت');
  {
    const ping = await redisCli('-p', REDIS_URL.split(':')[2].replace(/\D.*$/, ''), 'PING');
    if(ping.out !== 'PONG') throw new Error('redis زنده نیست: ' + ping.out);
    console.log('  redis PONG (AOF، ' + REDIS_DATA + ')');
    const seed = path.join(ROOT, 'server', 'data', 'payesh.json');
    if(!fs.existsSync(seed)) throw new Error('seed store نیست: ' + seed);
    const s = JSON.parse(fs.readFileSync(seed, 'utf8'));
    const users = (s.users && !Array.isArray(s.users.users) ? s.users : s.users) || [];
    const pool = (Array.isArray(users) ? users : Object.values(users))
      .filter((u) => u && u.phone && u.national_id).slice(0, 17);
    global.__pool = pool.slice(0, 16);
    global.__h5user = pool[16];
    console.log('  seed pool: ' + global.__pool.length + ' کاربر (1+1 اختصاصیِ H5)');
  }

  /* ── Phase 1 — deploy دو نمونه ───────────────────────────────────── */
  console.log('\n▸ Phase 1 — deploy (2 × production instance)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mn-live-'));
  const storeA = path.join(tmp, 'storeA.json');
  const storeB = path.join(tmp, 'storeB.json');
  fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), storeA);
  fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), storeB);
  A = spawnInstance('A', storeA, tmp, PORT_A);
  B = spawnInstance('B', storeB, tmp, PORT_B);
  const readyA = await waitReady(A, 30000);
  const readyB = await waitReady(B, 30000);
  chk('H1', readyA && readyB, 'استارتِ A و B در production + Redis زنده + کلیدِ مشترک (ready A=' + readyA + ' B=' + readyB + ')');
  if(!readyA || !readyB){
    fs.writeSync(timeline, Date.now() + ',boot,inst?,liveness,NONE,0\n');
    console.log('  boot شکست — خاتمه؛ لاگ‌ها در ' + OUT);
    process.exit(1);
  }

  /* ── stateplane load engine ───────────────────────────────────────── */
  const M = {}; function rec(op, st, ms){
    if(!M[op]) M[op] = { total: 0, s5: 0, s4: 0, s2: 0, sum: 0 };
    M[op].total++; M[op].sum += ms;
    if(st >= 500) M[op].s5++; else if(st >= 400) M[op].s4++; else if(st >= 200) M[op].s2++;
  }
  async function loginFlow(inst, user){
    const sc = await j(inst.base, 'POST', '/api/auth/send-code', {
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: user.phone }),
    });
    rec('send-code', sc.status, sc.ms);
    if(sc.status !== 200 || !sc.body || !sc.body.demo_code) return { ok: false, why: sc.status };
    const lg = await j(inst.base, 'POST', '/api/auth/login', {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: user.phone, code: sc.body.demo_code, national_id: user.national_id }),
    });
    rec('login', lg.status, lg.ms);
    const ck = lg.headers.get('set-cookie') || '';
    if(lg.status !== 200 || !ck) return { ok: false, why: lg.status };
    return { ok: true, cookie: ck.split(';')[0] };
  }

  let stopLoad = false;
  async function loadEngine(phase, durMs){
    const t0 = Date.now();
    const pool = global.__pool;
    const sessions = global.__sessionsLive;
    let li = 0;
    /* ساختِ pool: ۱۶ login متناوب A/B */
    const builders = [];
    for(let i = 0; i < pool.length; i++){
      const inst = i % 2 === 0 ? A : B;
      builders.push(loginFlow(inst, pool[i]).then((r) => {
        if(r.ok) sessions.push({ user: pool[i], cookie: r.cookie, issuedOn: i % 2 === 0 ? 'A' : 'B' });
      }));
    }
    await Promise.all(builders);
    const okSessions = sessions.length;
    console.log('  pool آماده: ' + okSessions + '/' + pool.length + ' نشست (متناوب A/B)');
    while(!stopLoad && Date.now() - t0 < durMs){
      const r = Math.random();
      if(r < 0.40 && sessions.length){
        const s = sessions[Math.floor(Math.random() * sessions.length)];
        const inst = Math.random() < 0.5 ? A : B;
        const rr = await j(inst.base, 'GET', '/api/auth/me', { headers: { cookie: s.cookie } });
        rec('me', rr.status, rr.ms);
      } else if(r < 0.65){
        const inst = Math.random() < 0.5 ? A : B;
        const rr = await j(inst.base, 'GET', '/api/v1/students');
        rec('list', rr.status, rr.ms);
      } else if(r < 0.80){
        const inst = Math.random() < 0.5 ? A : B;
        const ep = ['/api/liveness', '/api/health', '/api/readiness'][Math.floor(Math.random() * 3)];
        const rr = await j(inst.base, 'GET', ep);
        rec('probe', rr.status, rr.ms);
        } else if(li < 200){

          /* re-login mix — بدونِ pop (خروج را H5 و C2 می‌سنجند) ⇒ آرایهٔ نشست‌ها خالی نمی‌شود */

          const inst = li % 2 === 0 ? A : B;

          const r2 = await loginFlow(inst, pool[li % pool.length]);

          if(r2.ok) sessions.push({ user: pool[li % pool.length], cookie: r2.cookie, issuedOn: li % 2 === 0 ? 'A' : 'B' });

          li++;

        }
      await sleep(40);
    }
    return { sessions, pool: pool.length };
  }

  /* ── Phase 2 — بار (W18-L) ───────────────────────────────────────── */
  console.log('\n▸ Phase 2 — فازِ بار (W18-L، ' + LOAD_S + 's)');
  {
    const sm = sampler('load');
    const engP = loadEngine('load', LOAD_S * 1000);
    /* H4/H5 در حینِ بار: بعد از ۴۰ ثانیه، یک کاربرِ اختصاصی */
    await sleep(40000);
    {
      const cross = global.__sessionsLive.slice(0, 12);
      const bad = [];
      for(const s of cross){
        /* نشستِ هر کاربر را از نمونهٔ متضاد می‌خوانیم */
        const onA = await j(A.base, 'GET', '/api/auth/me', { headers: { cookie: s.cookie } });
        const onB = await j(B.base, 'GET', '/api/auth/me', { headers: { cookie: s.cookie } });
        if(onA.status !== 200 || onB.status !== 200) bad.push(s.user.phone + ':A=' + onA.status + '/B=' + onB.status);
      }
      chk('H4', bad.length === 0, 'cross-instance: /me از نمونهٔ متضاد برایِ 12 کاربر ⇒ 200 (بد: ' + bad.join(',') + ')');
      /* H5: logout در B ⇒ 401 در A */
      const lg1 = await loginFlow(B, global.__h5user);
      if(lg1.ok){
        await sleep(1500);
        const outB = await j(B.base, 'POST', '/api/auth/logout', { headers: { cookie: lg1.cookie } });
        rec('logout', outB.status, outB.ms);
        await sleep(1500);
        const meA = await j(A.base, 'GET', '/api/auth/me', { headers: { cookie: lg1.cookie } });
        const meB = await j(B.base, 'GET', '/api/auth/me', { headers: { cookie: lg1.cookie } });
        chk('H5', meA.status === 401 && meB.status === 401,
          'logout در B ⇒ /me در A = ' + meA.status + ' (باید 401) و در B = ' + meB.status);
      } else {
        chk('H5', false, 'login_flow اختصاصیِ H5 ناموفق (' + lg1.why + ')');
      }
    }
    const { sessions } = await engP;
    stopLoad = true;
    clearInterval(sm);
    const st = stats(M);
    const auth5 = (M['send-code'] ? M['send-code'].s5 : 0) + (M['login'] ? M['login'].s5 : 0)
      + (M['me'] ? M['me'].s5 : 0) + (M['logout'] ? M['logout'].s5 : 0);
    console.log('  بار: ' + st.tot + ' درخواست · فراوری ' + st.avail.toFixed(2) + '% · p50 ≈ ' +
      Math.round(Object.values(M).reduce((a, b) => a + b.sum, 0) / st.tot) + 'ms');
    chk('H2', st.avail >= 99, 'فراوریِ کلیِ فازِ بار ' + st.avail.toFixed(2) + '% (باید ≥99%) روی ' + st.tot + ' درخواست');
    chk('H3', auth5 === 0, 'صفر 5xx در state-plane (auth): ' + auth5);
    global.__sessions = sessions;
  }

  /* ── Phase 3 — chaos (W19-L) ─────────────────────────────────────── */
  console.log('\n▸ Phase 3 — chaos (W19-L)');
  /* ── C1: SIGKILL B ── */
  {
    const sm = sampler('c1');
    const before = await j(A.base, 'GET', '/api/auth/me', { headers: { cookie: global.__sessions[0].cookie } });
    /* نشستِ نمونهٔ B: آخرین نشستِ issuedOn=B */
    const onB = global.__sessions.find((s) => s.issuedOn === 'B');
    B.proc.kill('SIGKILL');
    await sleep(2000);
    const c1 = { tot: 0, s5: 0 };
    const t0 = Date.now();
    while(Date.now() - t0 < 12000){
      const r = Math.random();
      let rr;
      if(r < 0.5){
        const s = global.__sessions[Math.floor(Math.random() * global.__sessions.length)];
        rr = await j(A.base, 'GET', '/api/auth/me', { headers: { cookie: s.cookie } });
      } else {
        rr = await j(A.base, 'GET', '/api/v1/students');
      }
      c1.tot++; if(rr.status >= 500) c1.s5++;
      await sleep(80);
    }
    const c1avail = 100 * (1 - c1.s5 / c1.tot);
    /* نشستِ صادرشده در B (مردنِ B نباید آن را بکند — state در Redis است) */
    const onBAfter = onB ? await j(A.base, 'GET', '/api/auth/me', { headers: { cookie: onB.cookie } }) : null;
    clearInterval(sm);
    const bDead = procDead(B.proc);
    chk('H6', bDead && c1avail >= 99.9 && before.status === 200 && (!onBAfter || onBAfter.status === 200),
      'C1: SIGKILL B (dead=' + bDead + ')؛ A در 12s: ' + c1avail.toFixed(2) + '% روی ' + c1.tot +
      '؛ نشستِ صادرشده در B در A: ' + (onBAfter ? onBAfter.status : 'n/a'));
    /* restart B */
    global.B2 = spawnInstance('B', storeB, tmp, PORT_B);
    const rb = await waitReady(global.B2, 30000);
    const onBRestart = rb && onB ? await j(global.B2.base, 'GET', '/api/auth/me', { headers: { cookie: onB.cookie } }) : null;
    B.proc = global.B2.proc; B.base = global.B2.base;
    chk('H7', rb && onBRestart && onBRestart.status === 200,
      'C1b: B برنگشت (ready=' + rb + ') و نشستِ پیشینِ B در B بعد از restart: ' + (onBRestart ? onBRestart.status : 'n/a') + ' (state در Redis بود، نه حافظهٔ B)');
  }

  /* ── C2/C3: redis SHUTDOWN NOSAVE + restart (AOF) ── */
  {
    const seqBefore = Number((await redisCli('INCRBY', 'payesh:outbox:seq', '7')).out); /* مارکرِ AOF: بعد از restart باید ≥ این باشد */
    const sm = sampler('c2');
    const victim = global.__sessions[global.__sessions.length - 1];
    /* خروجِ کاربرِ victim از A (بعد از بازگشتِ redis باید هنوز 401 بماند) */
    const outA = await j(A.base, 'POST', '/api/auth/logout', { headers: { cookie: victim.cookie } });
    rec('logout', outA.status, outA.ms);
    await sleep(2000);

    const sh = await redisCli('-p', REDIS_URL.split(':')[2].replace(/\D.*$/, ''), 'SHUTDOWN', 'NOSAVE');
    console.log('  redis SHUTDOWN NOSAVE (exit ' + sh.code + ')');
    /* بارِ کمِ خوانش در حینِ مرگِ redis */
    const c2 = { tot: 0, s5: 0, live: 0, ready503: 0 };
    const t0 = Date.now();
    let aliveA = true, aliveB = true;
    while(Date.now() - t0 < 20000){
      for(const inst of [A, B]){
        const rr = await j(inst.base, 'GET', '/api/v1/students');
        c2.tot++; if(rr.status >= 500) c2.s5++;
        const lv = await j(inst.base, 'GET', '/api/liveness');
        const rdy = await j(inst.base, 'GET', '/api/readiness');
        if(lv.status === 200) c2.live++;
        if(rdy.status === 503) c2.ready503++;
      }
      aliveA = !procDead(A.proc); aliveB = !procDead(B.proc);
      await sleep(2500);
    }
    clearInterval(sm);
    chk('H8', c2.live >= 8 && c2.ready503 >= 8 && c2.s5 === 0 && aliveA && aliveB,
      'C2: حینِ مرگِ redis (20s) — liveness200=' + c2.live + '/16 · readiness503=' + c2.ready503 +
      '/16 · 5xx خوانش=' + c2.s5 + ' · A زنده=' + aliveA + ' B زنده=' + aliveB);

    /* C3: restart redis — AOF باید state را برگرداند */
    if(REDIS_DATA){
      redisServer();
      const t1 = Date.now();
      let back = false;
      while(Date.now() - t1 < 45000){
        const p = await redisCli('-p', REDIS_URL.split(':')[2].replace(/\D.*$/, ''), 'PING');
        if(p.out === 'PONG'){ back = true; break; }
        await sleep(1000);
      }
      let rdy200 = 0, meVictim = null, meOld = null, meOldCross = null;
      if(back){
        /* قراردادِ بازیابیِ P0-13: کلاینتِ redis عمداً بعد از ~4 تلاش تسلیم می‌شود
           (fail-closed) ⇒ بازیابی = restartِ instance با redis زنده */
        /* نمونه‌هایِ پیشین (که کلاینتِ redisشان عمداً تسلیم شده) را خارج می‌کنیم —
           خودِ restart بخشی از قراردادِ بازیابی است */
        try { A.proc.kill('SIGKILL'); } catch (e) {}
        try { B.proc.kill('SIGKILL'); } catch (e) {}
        await sleep(2000);
        const A2 = spawnInstance('A', storeA, tmp, PORT_A);
        const B3 = spawnInstance('B', storeB, tmp, PORT_B);
        const ra = await waitReady(A2, 30000);
        const rbb = await waitReady(B3, 30000);
        if(ra && rbb){
          const rd1 = await j(A2.base, 'GET', '/api/readiness');
          const rd2 = await j(B3.base, 'GET', '/api/readiness');
          rdy200 = (rd1.status === 200 ? 1 : 0) + (rd2.status === 200 ? 1 : 0);
          if(rdy200 === 2){
            meVictim = await j(A2.base, 'GET', '/api/auth/me', { headers: { cookie: victim.cookie } });
            const oldS = global.__sessionsLive[0];
            meOld = await j(A2.base, 'GET', '/api/auth/me', { headers: { cookie: oldS.cookie } });
            meOldCross = await j(B3.base, 'GET', '/api/auth/me', { headers: { cookie: oldS.cookie } });
          }
        }
        A.proc = A2.proc; A.base = A2.base;
        B.proc = B3.proc; B.base = B3.base;
      }
      const seqAfter = back ? Number((await redisCli('INCRBY', 'payesh:outbox:seq', '0')).out) : -1;
      chk('H9', back && rdy200 === 2 && seqAfter >= seqBefore && meVictim && meVictim.status === 401
        && meOld && meOld.status === 200 && meOldCross && meOldCross.status === 200,
        'C3: redis برگشت (AOF) + restartِ instanceها ⇒ readiness200=' + rdy200 + '/2؛ seq ' + seqBefore +
        ' → ' + seqAfter + ' (AOF نگهداری)؛ نشستِ خارج‌شده پیشِ kill: ' + (meVictim ? meVictim.status : 'n/a') +
        ' (باید 401)؛ نشستِ پیشین در A2: ' + (meOld ? meOld.status : 'n/a') + ' / در B3: ' +
        (meOldCross ? meOldCross.status : 'n/a') + ' (باید 200)');
    } else {
      chk('H9', false, 'LIVE_REDIS_DATA_DIR نیست — restartِ redis/C3 اجرا نشد');
    }
  }

  /* ── H10 + خاتمه ─────────────────────────────────────────────────── */
  {
    let fatal = '';
    for(const n of ['A', 'B']){
      const p = path.join(OUT, 'child' + n + '.log');
      if(fs.existsSync(p)){
        const t = fs.readFileSync(p, 'utf8');
        if(/\[FATAL\]|uncaught|UnhandledPromise/i.test(t)) fatal += n + ' ';
      }
    }
    chk('H10', fatal === '', 'هیچ [FATAL]/uncaught در لاگِ A و B' + (fatal ? ' — یافت: ' + fatal : ''));
  }
  console.log('\n▘ cleanup');
  for(const inst of [A, B]){ try { inst.proc.kill('SIGTERM'); } catch (e) {} }
  await sleep(1500);
  for(const inst of [A, B]){ try { if(inst.proc.exitCode === null) inst.proc.kill('SIGKILL'); } catch (e) {} }
  fs.closeSync(timeline);
  const lines = results.map((r) => r).join('\n');
  fs.writeFileSync(path.join(OUT, 'summary.txt'),
    'wave18w19-multinode-live — ' + new Date().toISOString() + '\nredis: ' + REDIS_URL +
    '\nload_s: ' + LOAD_S + '\n\n' + lines + '\n\n' +
    Object.entries(M).map(([k, v]) => 'op ' + k + ': total=' + v.total + ' 2xx=' + v.s2 +
      ' 4xx=' + v.s4 + ' 5xx=' + v.s5 + ' avg_ms=' + Math.round(v.sum / v.total)).join('\n') + '\n');
  console.log('────────────────────────────────────────────────────');
  console.log('multinode-live: ' + pass + ' سبز / ' + fail + ' قرمز  (خروجی: ' + OUT + ')');
  process.exit(fail ? 1 : 0);

}
main().catch((e) => { console.error("CRASH:", e && e.stack || e); process.exit(1); });
