#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════
   tests/a-next-health-blackhole.js — A-NEXT negative/positive proof
   ─────────────────────────────────────────────────────────────────────
   PROBE: یک پارتیشن «اتصال زنده ولی بی‌پاسخ» (blackhole) روی Redis.
   انتظار (FIXED): /api/health باید ok:false / HTTP 503 بدهد چون
   اندازه‌گیریِ تازهٔ redis.ping() در همان درخواست نشان می‌دهد ردیس
   پاسخ نمی‌دهد.
   BUG (pre-fix): verdict از پرچمِ همگامِ redis.ready() ساخته می‌شد که
   با رویدادِ 'connect'ِ ioredis روشن می‌شود؛ TCPِ پذیرفته‌شده توسطِ
   blackhole آن را true می‌کند در حالی که هیچ فرمانی جواب نمی‌گیرد.
   ⇒ false-green: ok:true + cache:redis + HTTP 200 در کنارِ
      redis.alive:false در همان بدنه.

   TWO TREES (امتحانِ دوطرفه — بدونِ این، تست می‌تواند همیشه سبز باشد):
     درختِ broken → همین پروب باید FAIL کند (exit≠۰): یعنی false-greenِ
       واقعی کشف شده. این تنها راه اثباتِ این است که تست واقعاً چیزی
       را assert می‌کند. (به‌صورتِ عملی با git stash رویِ fix اجرا شد.)
     درختِ fixed → باید PASS کند (exit=۰).

   نکتهٔ مهم: این تست یک blackhole واقعی در سطحِ TCP است (سرورِ سیاه‌چاله
   سوکت را می‌پذیرد و هرگز پاسخ نمی‌دهد) — همان پارتیشنی که A-22 برای
   commandTimeout توصیف کرده. هیچ mock ای استفاده نمی‌شود.

   دوعمlit تعریف‌شده (امتحان دوطرفه):
     node tests/a-next-health-blackhole.js                 ← درختِ fixed باید GREEN
     PROBE_LEGACY=1 node tests/a-next-health-blackhole.js  ← درختِ broken باید نشان دهد false-green بازتولید شده

   عمداً در suiteهای پیش‌فرض (tests/run.js / api/runner.js / smoke.js) نیست:
     به یک Redis زنده روی ۱۲۷.۰.۰.۱:۶۳۷۹ نیاز دارد که در CI در دسترس نیست.
   ════════════════════════════════════════════════════════════════════ */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');

const PORT = 4399;
const RELAY_PORT = 4398;
const REDIS_PORT = 6379;
const LEGACY = process.env.PROBE_LEGACY === '1';
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: String(detail || '').slice(0, 220) });
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '  — ' + results[results.length - 1].detail));
}

/* relay دوحالته — یک TCP acceptor ساده:
     mode='forward'   → به Redis واقعی روی لوکال‌هاست هدایت می‌کند
     mode='blackhole' → سوکت را می‌پذیرد و هرگز پاسخ نمی‌دهد
   جابه‌جا کردنِ حالت، خودِ تزریقِ failure است. همهٔ پورت‌ها literal
   ثابت‌اند (نه از env) تا پروب hermetic و قابل تکرار باشد.

   تلهٔ harness (یادگرفته‌شده): relay.close() فقط listener را می‌بندد و
   socketهای برقرارشده را زنده نگه می‌دارد — اتصالِ قدیمیِ سرور همچنان
   به Redis واقعی می‌رسید و پروب false-green می‌شد. بنابراین inject باید
   تمامِ جفتِ socketها را destroy کند، نه فقط listen را. */
function startRelay(mode) {
  return new Promise((resolve, reject) => {
    const pairs = [];
    const srv = net.createServer((sock) => {
      if (mode === 'blackhole') { sock.resume(); pairs.push([sock, null]); return; }
      const up = net.connect(REDIS_PORT, '127.0.0.1');
      const pair = [sock, up];
      pairs.push(pair);
      let open = true;
      sock.on('data', (d) => { if (open) up.write(d); });
      up.on('data', (d) => { if (open) sock.write(d); });
      const fin = () => { if (open) { open = false; try { sock.destroy(); } catch (e) {} try { up.destroy(); } catch (e) {} } };
      sock.on('error', fin); sock.on('close', fin);
      up.on('error', fin); up.on('close', fin);
    });
    srv.on('error', reject);
    srv.listen(RELAY_PORT, '127.0.0.1', () => {
      const api = {
        srv,
        /* قطعِ واقعی: هم listener و هم همهٔ جفت‌های برقرارشده. */
        sever: () => { try { srv.close(); } catch (e) {} for (const p of pairs) { try { p[0].destroy(); } catch (e) {} if (p[1]) { try { p[1].destroy(); } catch (e) {} } } pairs.length = 0; },
      };
      resolve(api);
    });
  });
}

function get(path) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (e) {}
        resolve({ status: res.statusCode, json, raw: body.slice(0, 300) });
      });
    });
    req.on('error', (e) => resolve({ status: 0, json: null, raw: 'ERR ' + e.code }));
    req.setTimeout(6000, () => { req.destroy(); resolve({ status: 0, json: null, raw: 'TIMEOUT' }); });
    req.end();
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  console.log('A-NEXT health-under-runtime-blackhole probe  (PROBE_LEGACY=' + (process.env.PROBE_LEGACY === '1' ? '1' : '0') + ')');

  const relay = await startRelay('forward');
  console.log('  relay forward on 127.0.0.1:' + RELAY_PORT + ' -> 127.0.0.1:' + REDIS_PORT);

  const env = {
    /* STORE در حالتِ dev (حافظه) تا پروب بدونِ PG ایزوله بماند؛ ولی
       چون REDIS_URL تنظیم است، redis.js این استقرار را «production»
       می‌بیند و همهٔ قراردادهایِ fail-closed (prodNoRedis/prodRethrow)
       اعمال می‌شوند — دقیقاً همان مسیری که می‌خواهیم اثبات کنیم. */
    REDIS_URL: 'redis://127.0.0.1:' + RELAY_PORT,
    PAYESH_ENV: 'production',
    ALLOW_MEMORY_FALLBACK: '1',
    PAYESH_BEHIND_PROXY: '1',
    PAYESH_JWT_SECRET: 'a-next-health-blackhole-probe-secret-32b',
    PORT: String(PORT),
    HOST: '127.0.0.1',
    PATH: process.env.PATH,
    SYSTEMROOT: process.env.SYSTEMROOT,
    TEMP: process.env.TEMP,
  };

  const NODE_BIN = process.execPath;
  const SERVER_ENTRY = 'server/index.js';
  const proc = spawn(NODE_BIN, [SERVER_ENTRY], { env, cwd: '.', stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });

  try {
    /* صبر تا سرور از مسیرِ forward relay کاملاً سالم بالا بیاید */
    let up = null;
    for (let i = 0; i < 60; i += 1) {
      const h = await get('/api/health');
      if (h.status !== 0) { up = h; break; }
      await sleep(250);
    }
    check('baseline: healthy boot through forward relay (200 + ok:true + redis alive)',
      !!(up && up.status === 200 && up.json && up.json.ok === true && up.json.redis && up.json.redis.alive === true),
      'status=' + (up && up.status) + ' log=' + log.slice(-140));
    if (!up) { console.log('  boot never came up; abort'); throw new Error('boot failed'); }

    /* ── INJECT: relay به blackhole تبدیل می‌شود (پارتیشن واقعی) ──
       یک بوتِ مستقیم روی blackhole به‌درستی FATAL می‌شود (P0-13) —
       تأیید شده. false-green فقط در پارتیشنِ حینِ اجرا رخ می‌دهد.
       sever() هم listener و هم همهٔ socketهای برقرارشده را قطع می‌کند. */
    relay.sever();
    await sleep(400);
    const bh = await startRelay('blackhole');
    await sleep(1200);   /* زمانِ reconnectِ ioredis (backoff کوچک) */
    console.log('  INJECTED: relay now blackhole — TCP accepted, never answered');

    /* CORE: verdict باید با اندازه‌گیریِ تازهٔ همان درخواست موافق باشد.
       pre-fix: ok:true اما redis.alive:false (تناقض در یک بدنه).

       تلهٔ false-greenِ harness (hardened): اگر reconnect به جایِ
       blackhole روی ECONNREFUSED بیفتد، پرچمِ stale هم false می‌ماند و
       کدِ broken هم ok:false می‌دهد — یعنی سبز شدنِ این چک‌ها اثباتِ
       هیچ‌چیزِ روشنی دربارهٔ پنجرهٔ blackhole نیست. پس باید اثبات کنیم
       که پنجرهٔ «اتصالِ پذیرفته‌شده ولی بی‌پاسخ» واقعاً طی شده:
       driver==='redis' یعنی کلاینت به blackhole وصل شده (رویداد
       connect زده)، در حالی که alive:false یعنی هیچ پاسخی نگرفته. */
    let trueCount = 0, falseCount = 0, contradiction = 0, http200 = 0;
    let blackholeWindow = 0;   /* driver==='redis' && alive===false */
    let maxMs = 0;
    for (let i = 0; i < 10; i += 1) {
      const t0 = Date.now();
      const h = await get('/api/health');
      maxMs = Math.max(maxMs, Date.now() - t0);
      if (h.json && h.json.ok === true) trueCount += 1;
      if (h.json && h.json.ok === false) falseCount += 1;
      if (h.status === 200) http200 += 1;
      if (h.json && h.json.ok === true && h.json.redis && h.json.redis.alive === false) contradiction += 1;
      if (h.json && h.json.redis && h.json.redis.driver === 'redis' && h.json.redis.alive === false) blackholeWindow += 1;
      await sleep(70);
    }
    console.log('  samples: ok=true ' + trueCount + ' / ok=false ' + falseCount + ' / HTTP200 ' + http200 +
      ' / contradiction ' + contradiction + ' / blackhole-window(driver=redis&alive=false) ' + blackholeWindow +
      ' / slowest ' + maxMs + 'ms');

    if (LEGACY) {
      /* حالتِ اثباتِ دوطرفه: در درختِ broken، ok=true>0 دیده می‌شود
         (پرچمِ stale زیر blackhole true است) → هر دو check زیر FAIL
         می‌شوند → RED. این تنها راه اثبات این است که تست واقعاً
         چیزی را assert می‌کند، نه اینکه همیشه سبز باشد. */
      check('LEGACY precondition: blackhole window actually exercised (>= 5 samples driver=redis alive=false)',
        blackholeWindow >= 5, 'blackholeWindow=' + blackholeWindow + ' — without this, green proves nothing');
      check('LEGACY negative: broken-tree health must NOT be green under blackhole (trueCount > 0 proves the bug)',
        trueCount > 0,
        'ok=true=' + trueCount + ' — pre-fix code reported healthy while redis.alive:false in the same body');
      check('LEGACY negative: contradiction observed (ok=true & redis.alive=false)', contradiction >= 1, 'contradiction=' + contradiction);
    } else {
      check('precondition: blackhole window actually exercised (driver=redis & alive=false on >= 5 samples)',
        blackholeWindow >= 5,
        'blackholeWindow=' + blackholeWindow + ' — otherwise a refused-port false-green would pass this test without testing anything');
      check('negative: no false-green health verdict under blackhole (ok=true == 0)', trueCount === 0,
        'ok=true=' + trueCount + ' of 10 — stale ready() flag reported healthy while the same body said redis.alive:false');
      check('positive: health reports unhealthy (ok=false >= 8 of 10)', falseCount >= 8, 'ok=false=' + falseCount);
      check('positive: body self-consistent (no ok=true with redis.alive=false)', contradiction === 0, 'contradiction=' + contradiction);
      /* commandTimeout (redis.js، ۲۰۰۰ms پیش‌فرض) است که hang را می‌بندد،
         نه یک fast-fail تصادفی. بدونِ این کران، پارتیشن می‌توانست
         اپراتور را برای همیشه مسدود کند. */
      check('positive: worst response bounded (<= 3000ms — commandTimeout binds the hang)', maxMs <= 3000, 'slowest=' + maxMs + 'ms');

      const h1 = await get('/api/health');
      check('positive: HTTP status is 503 (not 200)', h1.status === 503, 'status=' + h1.status);
      check('positive: blackhole-state verdict field (driver=redis, alive=false, cache!=redis)',
        !!(h1.json && h1.json.redis && h1.json.redis.driver === 'redis' && h1.json.redis.alive === false && h1.json.cache !== 'redis'),
        'driver=' + (h1.json && h1.json.redis && h1.json.redis.driver) + ' alive=' + (h1.json && h1.json.redis && h1.json.redis.alive) + ' cache=' + (h1.json && h1.json.cache));
      check('positive: readiness is fail-closed (503 — P0-13 gate intact)', (await get('/api/readiness')).status === 503, '');
    }
    try { bh.sever(); } catch (e) {}
  } finally {
    try { relay.sever(); } catch (e) {}
    try { proc.kill('SIGTERM'); } catch (e) {}
    try {
      if (proc.exitCode === null && proc.signalCode === null) {
        await new Promise((r) => { const t = setTimeout(r, 1500); proc.on('exit', () => { clearTimeout(t); r(); }); });
      }
    } catch (e) {}
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n  ' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  if (failed.length) {
    console.log('  FAILED: ' + failed.map((f) => f.name).join(' | '));
    process.exit(1);
  }
  console.log(LEGACY ? '  RED ON BROKEN TREE (expected — false-green reproduced)' : '  ALL GREEN — verdict is fresh-measurement based (no false-green under runtime blackhole)');
})();
