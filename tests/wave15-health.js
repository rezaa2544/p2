#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Wave 15 — Health / Deployment: endpointهایِ سلامت + Graceful Shutdown
   پوشش:
     H1  /api/liveness  → همیشه 200 (فرایند زنده)
     H2  /api/readiness → dev: 200 (فال‌بکِ حافظه قابل‌قبول)
     H3  /api/health    → 200 + قراردادِ قدیمی + گزارشِ کامل (db/redis/queue/memory)
     H4  PAYESH_ENV=production + بدونِ ردیس ⇒ readiness 503 (سپکِ Wave 15)
         (liveness همچنان 200؛ health روی درگاهِ P0-13 — قراردادِ server13)
     H5  production + ردیسِ زنده (fake قراردادسازگار) ⇒ readiness 200؛
         سپسِ مرگِ ردیس در حینِ پرواز ⇒ 503؛ بازگشت به dev ⇒ 200
     H6  شمارشِ in-flight: پس از درخواست‌هایِ هم‌زمان به صفر می‌رسد
     H7  روش‌هایِ نامعتبر / hookِ __slow بدونِ env → 404
     S1  child: SIGTERM بدونِ ترافیک → exit 0 + خطوطِ [shutdown]
     S2  child: SIGTERM در حینِ درخواستِ طولانی → در‌حالت‌پرواز کامل می‌شود،
         اتصالِ تازه پذیرفته نمی‌شود، exit 0
     S3  child: production + ردیسِ مرده → fail-fast (exit 1 + [FATAL])
   اجرا: node tests/wave15-health.js  (نیازمند seed: node server/seed.js)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
if(!fs.existsSync(REAL_STORE)){
  console.log('⏭️  store موجود نیست — اول: node server/seed.js');
  process.exit(1);
}

/* ── data files جدا برایِ این اجرا ─────────────────────────────────── */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-w15-'));
const T_STORE = path.join(TMP, 'store.json');
fs.copyFileSync(REAL_STORE, T_STORE);
process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_KEY = path.join(TMP, 'key');
process.env.PAYESH_DEMO_CODE = '1';
delete process.env.PAYESH_ENV;
delete process.env.NODE_ENV;
delete process.env.REDIS_URL;
delete process.env.PAYESH_TEST_SLOW_MS;

const mod = require(path.join(ROOT, 'server', 'index.js'));
const server = mod.server;
const redis = mod.redis;

let pass = 0, fail = 0;
const errors = [];
function assert(cond, msg){ if(!cond) throw new Error(msg || 'assert'); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let BASE = '';
async function j(method, p, opts){
  const r = await fetch(BASE + p, Object.assign({ method }, opts || {}));
  let body = null;
  try { body = await r.json(); } catch (e) {}
  return { status: r.status, body };
}

/* ── fake ردیس قراردادسازگار (الگویِ wave11) ──────────────────────── */
function fakeRedis(){
  const m = new Map();
  const sets = new Map();
  let dead = false;
  return {
    dead: () => dead,
    kill: () => { dead = true; },
    async get(k) { const it = m.get(k); return it ? it.v : null; },
    async set(k, v) { m.set(k, String(v)); return 'OK'; },
    async del(...ks) { let n = 0; for(const k of ks){ if(m.delete(k)) n++; } return n; },
    async incr(k) { const n = m.has(k) ? parseInt(m.get(k), 10) + 1 : 1; m.set(k, String(n)); return n; },
    async expire() { return 1; },
    async ttl() { return -1; },
    async sAdd(k, ...ms) { if(!sets.has(k)) sets.set(k, new Set()); const s = sets.get(k); let n = 0; for(const x of ms){ if(!s.has(String(x))){ s.add(String(x)); n++; } } return n; },
    async sMembers(k) { const s = sets.get(k); return s ? Array.from(s) : []; },
    async sRem() { return 0; },
    async scan() { return ['0', Array.from(m.keys())]; },
    async publish() { return 1; },
    async subscribe() {},
    async ping() { if(dead) throw new Error('connection is closed.'); return 'PONG'; },
    disconnect() { return 'end'; },
    on() {},
    quit() { return 'OK'; }
  };
}

async function main(){
  await new Promise(resolve => server.listen(0, resolve));
  BASE = 'http://localhost:' + server.address().port;

  /* ── H1 liveness ────────────────────────────────────────────────── */
  {
    const r = await j('GET', '/api/liveness');
    assert(r.status === 200, 'liveness status ' + r.status);
    assert(r.body && r.body.ok === true && r.body.status === 'live', 'liveness body: ' + JSON.stringify(r.body));
    assert(r.body.name === 'payesh-server' && r.body.pid === process.pid, 'liveness name/pid');
    assert(Number.isFinite(r.body.uptime_s) && r.body.uptime_s >= 0, 'liveness uptime_s');
    assert(r.body.draining === false, 'liveness draining should be false');
    const h = await fetch(BASE + '/api/liveness', { method: 'HEAD' });
    assert(h.status === 200, 'liveness HEAD ' + h.status);
    pass++; console.log('  ✅ H1 liveness: 200 + live + pid + uptime (GET/HEAD)');
  }

  /* ── H2 readiness (dev — memory fallback قابل‌قبول) ─────────────── */
  {
    const r = await j('GET', '/api/readiness');
    assert(r.status === 200, 'readiness dev status ' + r.status);
    assert(r.body && r.body.ok === true && r.body.status === 'ready', 'readiness body: ' + JSON.stringify(r.body));
    assert(r.body.db && r.body.db.alive === true, 'readiness db');
    assert(r.body.redis && r.body.redis.alive === true && r.body.redis.live === false, 'readiness redis (dev: live=false)');
    assert(r.body.redis.required === false, 'readiness required=false in dev');
    assert(r.body.draining === false, 'readiness draining=false');
    pass++; console.log('  ✅ H2 readiness (dev): 200 + ready + db/redis گزارش');
  }

  /* ── H3 health: قراردادِ قدیمی + گزارشِ کامل ──────────────────── */
  {
    const r = await j('GET', '/api/health');
    assert(r.status === 200, 'health status ' + r.status);
    const b = r.body;
    /* قراردادِ پیشین (server1 S1 / server13 T2b) — دست نمی‌خورد */
    assert(b.ok === true && b.name === 'payesh-server' && b.phase === 1 && b.version === '1.0', 'health legacy fields');
    assert(b.pid === process.pid && !!b.time && !!b.cache, 'health legacy pid/time/cache');
    /* Wave 15: گزارشِ کامل */
    assert(b.db && b.db.alive === true && (b.db.driver === 'memory' || b.db.driver === 'postgres'), 'health db: ' + JSON.stringify(b.db));
    assert(b.db.pool === null || (Number.isFinite(b.db.pool.total) && Number.isFinite(b.db.pool.idle) && Number.isFinite(b.db.pool.pending)), 'health db.pool');
    assert(b.redis && typeof b.redis.alive === 'boolean', 'health redis');
    assert(Number.isFinite(b.queue.outbox) && Number.isFinite(b.queue.notify_pending) && Number.isFinite(b.queue.in_flight), 'health queue');
    assert(Number.isFinite(b.cache_l1) && b.cache_l1 >= 0, 'health cache_l1');
    assert(Number.isFinite(b.uptime_s) && Number.isFinite(b.memory.heap_used_kb), 'health uptime/memory');
    pass++; console.log('  ✅ H3 health: قراردادِ قدیمی سالم + db/redis/queue/pool/cache/memory');
  }

  /* ── H4 production (PAYESH_ENV) + بدونِ ردیس ⇒ readiness 503 ───── */
  {
    process.env.PAYESH_ENV = 'production';
    const rdy = await j('GET', '/api/readiness');
    assert(rdy.status === 503, 'readiness prod-no-redis status ' + rdy.status);
    assert(rdy.body.status === 'not_ready' && rdy.body.ok === false, 'readiness not_ready body');
    assert(rdy.body.redis.required === true && rdy.body.redis.live === false, 'readiness redis.required/live');
    const live = await j('GET', '/api/liveness');
    assert(live.status === 200, 'liveness stays 200 in prod-no-redis');
    const h = await j('GET', '/api/health');
    assert(h.status === 200, 'health keeps P0-13 gate (NODE_ENV) — contract server13: ' + h.status);
    delete process.env.PAYESH_ENV;
    const back = await j('GET', '/api/readiness');
    assert(back.status === 200, 'readiness back to 200 after unsetting prod');
    pass++; console.log('  ✅ H4 PAYESH_ENV=production + Redis قطع ⇒ readiness 503 (liveness 200، health قراردادِ P0-13)');
  }

  /* ── H5 production + ردیسِ زنده ⇒ 200؛ مرگِ runtime ⇒ 503 ─────── */
  {
    const fake = fakeRedis();
    redis.__setClientForTests(fake);
    process.env.PAYESH_ENV = 'production';
    const r1 = await j('GET', '/api/readiness');
    assert(r1.status === 200, 'readiness prod+live-redis ' + r1.status + ' ' + JSON.stringify(r1.body));
    assert(r1.body.redis.live === true, 'redis.live=true');
    fake.kill(); /* مرگِ ردیس در حینِ پرواز */
    const r2 = await j('GET', '/api/readiness');
    assert(r2.status === 503, 'readiness after redis death ' + r2.status);
    assert(r2.body.redis.alive === false, 'redis.alive=false after death');
    redis.__setClientForTests(null);
    delete process.env.PAYESH_ENV;
    const r3 = await j('GET', '/api/readiness');
    assert(r3.status === 200, 'readiness restored in dev ' + r3.status);
    pass++; console.log('  ✅ H5 production + ردیسِ زنده 200 → مرگِ runtime 503 → dev 200');
  }

  /* ── H6 in-flight counter ───────────────────────────────────────── */
  {
    assert(typeof mod.__drainForTests === 'function', '__drainForTests missing');
    const before = mod.__drainForTests();
    assert(before.draining === false, 'draining=false');
    const results = await Promise.all([
      j('GET', '/api/liveness'), j('GET', '/api/health'), j('GET', '/api/readiness'), j('GET', '/api/liveness')
    ]);
    assert(results.every(r => r.status === 200), 'concurrent all 200');
    await sleep(100); /* 'close' پاسخ‌ها */
    const after = mod.__drainForTests();
    assert(after.inFlight === 0, 'inFlight back to 0, got ' + after.inFlight);
    pass++; console.log('  ✅ H6 in-flight: ۴ هم‌زمان → صفر');
  }

  /* ── H7 روش‌هایِ نامعتبر + hookِ __slow بدونِ env ─────────────── */
  {
    const p1 = await j('POST', '/api/liveness');
    assert(p1.status === 404, 'POST liveness 404, got ' + p1.status);
    const s1 = await j('GET', '/api/__slow');
    assert(s1.status === 404, '__slow without env 404, got ' + s1.status);
    pass++; console.log('  ✅ H7 404s: POST liveness / __slow بدونِ env');
  }

  /* ── child helpers ──────────────────────────────────────────────── */
  function runChild(mode, readyTimeoutMs){
    const proc = spawn(process.execPath, [path.join(ROOT, 'tests', 'wave15-child.js'), ROOT, mode],
      { cwd: ROOT, env: Object.assign({}, process.env), stdio: ['ignore', 'pipe', 'pipe'] });
    const out = []; const errOut = [];
    proc.stdout.on('data', d => {
      for(const line of String(d).split('\n')){
        if(line.trim()) out.push(line);
      }
    });
    proc.stderr.on('data', d => { errOut.push(String(d)); });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (e) {}
        reject(new Error('child ' + mode + ' timeout (ready) — out: ' + out.slice(-5).join(' | ')));
      }, readyTimeoutMs);
      const iv = setInterval(() => {
        const m = out.find(l => l.startsWith('READY:'));
        if(m){
          clearTimeout(timer);
          clearInterval(iv);
          resolve({ proc, out, errOut, port: Number(m.slice(6)) });
        }
      }, 25);
      proc.on('exit', (code) => {
        clearTimeout(timer);
        clearInterval(iv);
        /* برایِ prod-noredis READY منتظر نیستیم — خود را در caller resolve می‌کنیم */
        resolve({ proc, out, errOut, port: null, exitedEarly: code });
      });
    });
  }
  function waitExit(proc, ms){
    return new Promise((resolve) => {
      const t = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (e) {} resolve({ code: 'sigkill-timeout', ms }); }, ms);
      proc.on('exit', (code, signal) => { clearTimeout(t); resolve({ code, signal }); });
    });
  }

  /* ── S1 SIGTERM بدونِ ترافیک → خروجِ تمیز ─────────────────────── */
  {
    const c = await runChild('shutdown', 15000);
    try{
      const l = await fetch('http://localhost:' + c.port + '/api/liveness');
      assert(l.status === 200, 'pre-shutdown liveness 200');
      const t0 = Date.now();
      c.proc.kill('SIGTERM');
      const ex = await waitExit(c.proc, 15000);
      assert(ex.code === 0, 'exit code 0, got ' + ex.code + ' ' + ex.signal + ' out: ' + c.out.slice(-6).join(' | '));
      assert(Date.now() - t0 < 10000, 'exited in budget');
      const all = c.out.join('\n');
      assert(/\[shutdown\] SIGTERM received/.test(all), 'SIGTERM marker missing: ' + all.slice(-300));
      assert(/\[shutdown\] clean — dependencies closed/.test(all), 'clean marker missing');
      assert(/exit 0/.test(all), 'exit-0 marker missing');
      pass++; console.log('  ✅ S1 child SIGTERM: exit 0 + [shutdown] SIGTERM + clean + exit 0 markers');
    } finally {
      try { c.proc.kill('SIGKILL'); } catch (e) {}
    }
  }

  /* ── S2 SIGTERM در حینِ درخواستِ طولانی → drain ───────────────── */
  {
    const c = await runChild('drain', 15000);
    try{
      /* درخواستِ ۱۵۰۰ms — هنوز در‌حالتِ پرواز است وقتی SIGTERM می‌رسد */
      const slowP = (async () => {
        const t0 = Date.now();
        const r = await fetch('http://localhost:' + c.port + '/api/__slow');
        const b = await r.json();
        return { status: r.status, b, ms: Date.now() - t0 };
      })();
      await sleep(250); /* سوکت برقرار، درخواست در حالِ پردازش */
      const t0 = Date.now();
      c.proc.kill('SIGTERM');
      await sleep(150); /* listen socket بسته شد */
      /* اتصالِ تازه نباید پذیرفته شود */
      let refused = false;
      try {
        const r2 = await fetch('http://localhost:' + c.port + '/api/liveness');
        await r2.arrayBuffer();
      } catch (e) { refused = true; }
      assert(refused, 'new connection after SIGTERM must be refused');
      /* درخواستِ در‌حالتِ پرواز باید کامل شود (drain) */
      const slow = await slowP;
      assert(slow.status === 200 && slow.b && slow.b.ok === true, 'in-flight request completed: ' + slow.status);
      assert(slow.ms >= 1000, 'slow request actually took the full time: ' + slow.ms);
      const ex = await waitExit(c.proc, 15000);
      assert(ex.code === 0, 'exit 0 after drain, got ' + ex.code + ' ' + ex.signal + ' out: ' + c.out.slice(-8).join(' | '));
      assert(Date.now() - t0 < 10000, 'drain within budget');
      const all = c.out.join('\n');
      assert(/\[shutdown\] SIGTERM received — draining 1 in-flight/.test(all), 'draining-1 marker: ' + all.slice(-300));
      assert(/\[shutdown\] clean — dependencies closed/.test(all), 'clean marker');
      pass++; console.log('  ✅ S2 child SIGTERM در حینِ ترافیک: در‌حالت‌پرواز کامل شد + اتصالِ تازه reject + exit 0');
    } finally {
      try { c.proc.kill('SIGKILL'); } catch (e) {}
    }
  }

  /* ── S3 production + ردیسِ مرده → fail-fast ────────────────────── */
  {
    const proc = spawn(process.execPath, [path.join(ROOT, 'tests', 'wave15-child.js'), ROOT, 'prod-noredis'],
      { cwd: ROOT, env: Object.assign({}, process.env), stdio: ['ignore', 'pipe', 'pipe'] });
    const out = []; const errOut = [];
    proc.stdout.on('data', d => out.push(String(d)));
    proc.stderr.on('data', d => errOut.push(String(d)));
    const ex = await new Promise((resolve) => {
      const t = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (e) {} resolve({ code: 'sigkill-timeout' }); }, 20000);
      proc.on('exit', (code, signal) => { clearTimeout(t); resolve({ code, signal }); });
    });
    assert(ex.code === 1, 'prod-no-redis fail-fast exit 1, got ' + ex.code + ' ' + ex.signal + ' out: ' + out.join('').slice(-200) + ' err: ' + errOut.join('').slice(-300));
    assert(errOut.join('').indexOf('[FATAL] Cache readiness failed') > -1, '[FATAL] marker missing: ' + errOut.join('').slice(-300));
    assert(out.join('').indexOf('UNEXPECTED') === -1, 'UNEXPECTED printed');
    pass++; console.log('  ✅ S3 production + Redis مرده: fail-fast exit 1 + [FATAL] (استارت نشد)');
  }

  /* ── cleanup + summary ──────────────────────────────────────────── */
  await new Promise(resolve => { try { server.close(resolve); } catch (e) { resolve(); } });
  try { redis.__setClientForTests(null); } catch (e) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log('────────────────────────────────────────────');
  console.log('Wave 15 — Health/Deployment: ' + pass + '/' + (pass + fail) + ' موفق' + (fail ? ' — ' + fail + ' خطا ❌' : '  —  بدون خطا ✅'));
  if(fail){ errors.forEach(e => console.log('   · ' + e)); process.exit(1); }
  process.exit(0);
}

main().catch(e => {
  console.error('CRASH: ' + (e && e.stack || e));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) {}
  process.exit(1);
});
