#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════
   tests/b-pg-health-blackhole.js — B-PG-1 negative/positive proof
   ─────────────────────────────────────────────────────────────────────
   PROBE: یک پارتیشنِ «اتصالِ برقرار ولی بی‌پاسخ» (blackhole) روی
   PostgreSQL، در حینِ اجرا — نه در بوت.

   انتظار (FIXED): /api/health و /api/readiness باید ok:false / HTTP 503
   بدهند، در زمانی کراندار، چون db.ping() در همان درخواست اندازه‌گیری
   می‌کند که پاسخی نمی‌گیرد.

   BUG (pre-fix): server/db.js فقط connectionTimeoutMillis را تنظیم می‌کرد،
   که تنها *برقراریِ* اتصالِ جدید را می‌بندد. یک کلاینتِ استیجارگرفتهٔ
   pool که سوکتش باز می‌ماند ولی هیچ پاسخی نمی‌گیرد (موتور یخ‌زده، یک
   TCP blackhole، firewall DROP) هیچ کرانی نداشت: query_timeout پیش‌فرضِ
   pg برابر false/نامحدود است. نتیجه: await pool.query(...) تا ابد معلق
   می‌ماند، درست همان اندازه‌گیریِ سلامتی که قرار بود ۵۰۳ را گزارش کند.
   ⇒ /api/health خودش هنگ می‌کرد و نمی‌توانست قطعیِ خودش را اعلام کند.

   FIX (B-PG-1): یک query_timeout در سطحِ pool (هر کلاینتی که pg-pool
   می‌سازد آن را به ارث می‌برد) + یک کرانِ کوتاه‌تر برای خودِ ping.
   وقتی یک queryِ ارسال‌شده تایم‌اوت می‌شود، pg connection را destroy
   می‌کند، پس کلاینتِ سیاه‌چاله‌شده به جایِ مسموم کردنِ pool دور ریخته
   می‌شود.

   TWO TREES (امتحانِ دوطرفه — بدونِ این، تست می‌تواند همیشه سبز باشد):
     درختِ fixed  → این پروب باید PASS کند (exit=0).
     درختِ broken → باید FAIL کند. چون خودِ fix با env قابل تنظیم است،
       حالتِ PROBE_LEGACY=1 مسیرِ pre-fix را دقیقاً بازتولید می‌کند
       (query_timeout=0 یعنی نامحدود، keepAlive خاموش):
         PROBE_LEGACY=1 node tests/b-pg-health-blackhole.js
       این قراردادِ «اصلاحِ بار-دار» است: اگر کران حذف شود، پروب قرمز
       می‌شود. (به‌علاوه، همانندِ پروبِ ری‌دیس، با git stash روی fix نیز
       بررسی شد.)

   تزریقِ failure چگونه کار می‌کند: relayِ TCP دوحالته بینِ سرور و
   PostgreSQL واقعی. حالتِ forward داده‌ها را در هر دو جهت تلمبه می‌کند.
   freeze() ارسال را رویِ *همهٔ جفت‌های برقرارشده* متوقف می‌کند، بی‌آنکه
   سوکت‌ها را ببندد — پس اتصالِ pool زنده می‌ماند ولی هیچ پاسخی نمی‌گیرد:
   همان شکلِ پارتیشنی که connectionTimeoutMillis نمی‌بندد. سرور query را
   در سوکتِ یخ‌زده می‌نویسد (پروب این بایت‌ها را می‌شمارد = مدرکِ هرمتیک
   اینکه پنجرهٔ سیاه‌چاله واقعاً طی شده) و منتظرِ پاسخ می‌ماند.

   نیازها: PostgreSQL زنده روی 127.0.0.1:5432 + Redis زنده. یک پایگاهِ
   دادهٔ موقت (payesh_bpg_probe) می‌سازد و در پایان پاک می‌کند.
   ════════════════════════════════════════════════════════════════════ */
'use strict';
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const net = require('net');
const { Client } = require('pg');

const PORT = 38532;        /* پورتِ APIِ سرور (نه ۸۹xx/۹۰xx → لاینِ موازی) */
const RELAY_PORT = 38533;  /* پورتی که DATABASE_URLِ سرور به آن اشاره می‌کند */
const PG_HOST = '127.0.0.1';
const PG_PORT = 5432;
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const LEGACY = process.env.PROBE_LEGACY === '1';
const PROBE_DB = 'payesh_bpg_probe';

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: String(detail || '').slice(0, 220) });
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '  — ' + results[results.length - 1].detail));
}

/* اتصالِ مدیر برای CREATE/DROP DATABASE: اول overrideِ صریح، بعد PGURL/
   DATABASE_URLِ کارِ CI (کاربرِ آن superuser است)، بعد کلاسترِ محلیِ
   این دستگاه. همیشه روی پایگاهِ maintenanceِ «postgres» وصل می‌شود. */
function parseUrl(u) {
  const x = new URL(u);
  return {
    host: x.hostname, port: x.port || '5432',
    user: x.username, password: decodeURIComponent(x.password || ''),
    db: decodeURIComponent(x.pathname.replace(/^\//, ''))
  };
}
const parsed = parseUrl(process.env.PAYESH_BPG_ADMIN_URL || process.env.PGURL || process.env.DATABASE_URL
  || 'postgresql://postgres:123456@127.0.0.1:5432/postgres');
const adminOpts = { host: parsed.host, port: parsed.port, user: parsed.user, password: parsed.password, database: 'postgres' };
const probeUrl = 'postgresql://' + encodeURIComponent(parsed.user) + ':' + encodeURIComponent(parsed.password)
  + '@' + parsed.host + ':' + parsed.port + '/' + PROBE_DB;

/* relay دوحالته با حالتِ freeze — تزریقِ واقعیِ blackhole روی اتصالِ
   برقرارشده. برخلافِ حالتِ «قطعِ کامل»، سوکت‌ها باز می‌مانند تا
   connectionTimeoutMillis نتواند آن را ببندد. */
function startRelay() {
  return new Promise((resolve, reject) => {
    const pairs = [];        /* { sock, up, open } */
    const blackholed = [];   /* اتصال‌های پذیرفته‌شدهِ حینِ freeze */
    const stats = { frozenInbound: 0 };   /* بایت‌های سرور→relay روی جفتِ یخ‌زده */
    let frozen = false;
    const srv = net.createServer((sock) => {
      if (frozen) { sock.resume(); blackholed.push(sock); return; }
      const up = net.connect(PG_PORT, PG_HOST);
      const pair = { sock, up, open: true };
      pairs.push(pair);
      sock.on('data', (d) => {
        if (!pair.open) { stats.frozenInbound += d.length; return; }
        up.write(d);
      });
      up.on('data', (d) => { if (pair.open) sock.write(d); });
      const fin = () => {
        pair.open = false;
        try { sock.destroy(); } catch (e) {}
        try { up.destroy(); } catch (e) {}
      };
      sock.on('error', fin); sock.on('close', fin);
      up.on('error', fin); up.on('close', fin);
    });
    srv.on('error', reject);
    srv.listen(RELAY_PORT, PG_HOST, () => {
      resolve({
        stats,
        /* تزریق: ارسال را رویِ همهٔ جفت‌های برقرارشده متوقف کن، سوکت‌ها
           را باز نگه دار. اتصال‌های تازه هم سیاه‌چاله می‌شوند. */
        freeze: () => {
          frozen = true;
          for (const p of pairs) p.open = false;
        },
        /* بازگشت: اتصال‌های تازه دوباره forward می‌شوند تا pool بتواند
           کلاینت‌های تازه بسازد. */
        restore: () => {
          frozen = false;
          for (const s of blackholed) { try { s.destroy(); } catch (e) {} }
          blackholed.length = 0;
        },
        sever: () => {
          try { srv.close(); } catch (e) {}
          for (const p of pairs) {
            p.open = false;
            try { p.sock.destroy(); } catch (e) {}
            try { p.up.destroy(); } catch (e) {}
          }
          pairs.length = 0;
          for (const s of blackholed) { try { s.destroy(); } catch (e) {} }
          blackholed.length = 0;
        }
      });
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
    req.setTimeout(9000, () => { req.destroy(); resolve({ status: 0, json: null, raw: 'TIMEOUT' }); });
    req.end();
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  console.log('B-PG-1 health-under-runtime-PG-blackhole probe  (PROBE_LEGACY=' + (LEGACY ? '1' : '0') + ')');

  /* ── setup: پایگاهِ دادهٔ موقت + زنجیرهٔ migration ─────────────────── */
  const admin = new Client(adminOpts);
  try { await admin.connect(); }
  catch (e) {
    console.log('  SETUP FAILED: cannot reach the PostgreSQL admin connection (' + e.message + ')');
    console.log('  this probe needs a live PostgreSQL on ' + parsed.host + ':' + parsed.port + ' (set PAYESH_BPG_ADMIN_URL to override)');
    process.exit(1);
  }
  try {
    await admin.query('DROP DATABASE IF EXISTS ' + PROBE_DB);
    await admin.query('CREATE DATABASE ' + PROBE_DB);
  } catch (e) {
    console.log('  SETUP FAILED: cannot create scratch database ' + PROBE_DB + ' (' + e.message + ')');
    try { await admin.end(); } catch (_) {}
    process.exit(1);
  }
  await admin.end();

  let migrateOut = '';
  try {
    migrateOut = execFileSync(process.execPath, ['tools/migrate-ledger.js', 'up'], {
      cwd: '.', encoding: 'utf8',
      env: Object.assign({}, process.env, { DATABASE_URL: probeUrl }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (e) {
    console.log('  SETUP FAILED: migration chain did not apply to ' + PROBE_DB);
    console.log('  ' + String(e.stderr || e.stdout || e.message).slice(0, 500));
    try { await admin.connect(); await admin.query('DROP DATABASE IF EXISTS ' + PROBE_DB); await admin.end(); } catch (_) {}
    process.exit(1);
  }
  console.log('  scratch DB ready: ' + migrateOut.trim().split('\n').pop().slice(0, 90));

  /* ── boot سرور از طریقِ relay ───────────────────────────────────── */
  const relay = await startRelay();
  console.log('  relay forward on 127.0.0.1:' + RELAY_PORT + ' -> ' + PG_HOST + ':' + PG_PORT);

  const env = {
    DATABASE_URL: probeUrl.replace('@' + parsed.host + ':' + parsed.port + '/', '@127.0.0.1:' + RELAY_PORT + '/'),
    REDIS_URL,
    PAYESH_ENV: 'production',
    ALLOW_MEMORY_FALLBACK: '1',
    PAYESH_BEHIND_PROXY: '1',
    PAYESH_JWT_SECRET: 'b-pg-health-blackhole-probe-secret-32b',
    PORT: String(PORT),
    HOST: '127.0.0.1',
    PATH: process.env.PATH,
    SYSTEMROOT: process.env.SYSTEMROOT,
    TEMP: process.env.TEMP
  };
  if (LEGACY) {
    /* بازتولیدِ دقیقِ درختِ pre-fix: هر سه کرانِ B-PG-1 خاموش می‌شوند.
       فقطِ query_timeout خاموش کافی نیست — مکانیزمِ تجربیِ اثبات‌شده این است:
       پس از نابود شدنِ اولین کلاینتِ یخ‌زده، هر ping نیاز به یک اتصالِ تازه
       از میانِ blackhole دارد و همان connectionTimeoutMillis است که آن
       اتصالِ هرگزتکمیل‌نشدنی را می‌بندد. پس اگر connectionTimeoutMillis را
       روشن نگه‌داریم، درختِ شکسته هم (به‌اشتباه) سبز می‌شود. */
    Object.assign(env, {
      PAYESH_PG_QUERY_TIMEOUT_MS: '0',
      PAYESH_PG_PING_TIMEOUT_MS: '0',
      PAYESH_PG_KEEPALIVE: '0',
      PG_TIMEOUT_MS: '0',
      PG_TIMEOUT: '0'
    });
  }

  const proc = spawn(process.execPath, ['server/index.js'], { env, cwd: '.', stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });

  let exitCode = null;
  proc.on('exit', (c) => { exitCode = c; });

  try {
    /* صبر تا سرور از مسیرِ forward relay کاملاً سالم بالا بیاید */
    let up = null;
    for (let i = 0; i < 360; i += 1) {
      const h = await get('/api/health');
      if (h.status !== 0) { up = h; break; }
      await sleep(250);
    }
    check('baseline: healthy boot through forward relay (200 + ok:true + db driver=postgres alive=true)',
      !!(up && up.status === 200 && up.json && up.json.ok === true && up.json.db
        && up.json.db.driver === 'postgres' && up.json.db.alive === true),
      'status=' + (up && up.status) + ' log=' + log.slice(-160));
    if (!up) { console.log('  boot never came up; abort'); throw new Error('boot failed'); }

    /* ── INJECT: blackhole روی اتصالِ برقرارشده ── */
    relay.freeze();
    await sleep(300);
    console.log('  INJECTED: relay frozen — established sockets open, nothing forwarded');

    let okTrue = 0, okFalse = 0, http503 = 0, hangs = 0, pgDriverDead = 0, maxMs = 0;
    const sampleMs = [];
    for (let i = 0; i < 8; i += 1) {
      const t0 = Date.now();
      const h = await get('/api/health');
      const t1 = Date.now();
      const ms = t1 - t0;
      maxMs = Math.max(maxMs, ms);
      sampleMs.push(ms);
      console.log('    sample ' + i + ': status=' + h.status + ' ms=' + ms
        + ' ok=' + (h.json && h.json.ok) + ' db=' + (h.json && h.json.db && h.json.db.driver + '/' + h.json.db.alive)
        + ' redis=' + (h.json && h.json.redis && h.json.redis.alive));
      if (h.status === 0) hangs += 1;
      if (h.json && h.json.ok === true) okTrue += 1;
      if (h.json && h.json.ok === false) okFalse += 1;
      if (h.status === 503) http503 += 1;
      if (h.json && h.json.db && h.json.db.driver === 'postgres' && h.json.db.alive === false) pgDriverDead += 1;
      await sleep(120);
    }
    console.log('  samples: ok=true ' + okTrue + ' / ok=false ' + okFalse + ' / HTTP503 ' + http503
      + ' / hangs(client-timeout) ' + hangs + ' / pg-driver-but-dead ' + pgDriverDead
      + ' / slowest ' + maxMs + 'ms / frozenInbound ' + relay.stats.frozenInbound + 'B');

    if (LEGACY) {
      /* حالتِ اثباتِ دوطرفه: در مسیرِ pre-fix هیچ کرانی وجود ندارد، پس
         health هرگز پاسخ نمی‌دهد و کلاینتِ پروب تایم‌اوت می‌شود. هر دو
         چکِ زیر FAIL می‌شوند → RED → یعنی اصلاحِ B-PG-1 بار-دار است. */
      check('LEGACY precondition: blackhole window actually exercised (server sent query bytes into a frozen socket)',
        relay.stats.frozenInbound > 0, 'frozenInbound=' + relay.stats.frozenInbound + 'B — without this, green proves nothing');
      check('LEGACY negative: unbounded hang reproduced (>= 6 of 8 health requests never answered)',
        hangs >= 6, 'hangs=' + hangs + ' slowest=' + maxMs + 'ms — pre-fix code could not even report its own outage');
    } else {
      check('precondition: blackhole window actually exercised (server sent query bytes into a frozen socket)',
        relay.stats.frozenInbound > 0,
        'frozenInbound=' + relay.stats.frozenInbound + 'B — otherwise a refused-port false-green would pass this test without testing anything');
      check('negative: no false-green health verdict under blackhole (ok=true == 0)', okTrue === 0,
        'ok=true=' + okTrue + ' of 8 — health must not claim healthy while db.alive:false in the same body');
      check('positive: health reports unhealthy (ok=false >= 6 of 8)', okFalse >= 6, 'ok=false=' + okFalse);
      check('positive: body self-consistent (db driver=postgres but alive=false — connected, unanswered)',
        pgDriverDead >= 6, 'pg-driver-but-dead=' + pgDriverDead);
      check('positive: HTTP status is 503', http503 >= 6, 'HTTP503=' + http503);
      /* B-PG-1 bound. The health path holds at most TWO postgres interactions
         in series: the canary SoT refresh (routeRequestSoT → refreshCacheFromPg)
         and db.ping(). Each is individually bounded by connectionTimeoutMillis
         (۳۰۰۰ms), so the theoretical worst case is ~۶۰۰۰ms — reached once, on
         the first request after the SoT cache TTL expires, before the refresh
         failure has set the outage backoff. Every request after that hits the
         backoff gate and pays only db.ping. Two assertions, so a regression of
         EITHER bound is caught: an absolute ceiling, and a steady-state
         ceiling that proves the backoff gate (not just the timeouts) is what
         keeps the tail flat. */
      const med = sampleMs.slice().sort((a, b) => a - b)[Math.floor(sampleMs.length / 2)];
      check('positive: worst response bounded (<= 6500ms — 2x connectionTimeoutMillis in series + jitter)',
        maxMs <= 6500, 'slowest=' + maxMs + 'ms');
      check('positive: steady-state bounded (median <= 3500ms — SoT backoff gate keeps the tail flat)',
        med <= 3500, 'median=' + med + 'ms');
      check('positive: no client-side hang at all (hangs == 0)', hangs === 0, 'hangs=' + hangs);
      check('positive: readiness is fail-closed (503)',
        (await get('/api/readiness')).status === 503, '');

      /* ── RECOVERY: پس ازِ بازگشتِ relay، pool باید کلاینتِ تازه بسازد ── */
      relay.restore();
      let recovered = null;
      for (let i = 0; i < 80; i += 1) {
        const h = await get('/api/health');
        if (h.json && h.json.ok === true && h.json.db && h.json.db.alive === true) { recovered = h; break; }
        await sleep(250);
      }
      check('recovery: health returns to 200 + ok:true + db alive=true after the partition clears',
        !!(recovered && recovered.status === 200), 'recovered=' + (recovered && recovered.status) + ' log=' + log.slice(-140));
    }
  } finally {
    try { relay.sever(); } catch (e) {}
    try { proc.kill('SIGTERM'); } catch (e) {}
    try {
      if (exitCode === null) {
        await new Promise((r) => { const t = setTimeout(r, 2000); proc.on('exit', () => { clearTimeout(t); r(); }); });
      }
    } catch (e) {}
    /* پاکسازیِ پایگاهِ دادهٔ موقت */
    try {
      const c = new Client(adminOpts);
      await c.connect();
      await c.query('DROP DATABASE IF EXISTS ' + PROBE_DB);
      await c.end();
    } catch (e) {
      console.log('  cleanup warning: could not drop ' + PROBE_DB + ' (' + e.message + ')');
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log('\n  --- server log tail ---\n' + log.slice(-2200));
  }
  console.log('\n  ' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  if (failed.length) {
    console.log('  FAILED: ' + failed.map((f) => f.name).join(' | '));
    process.exit(1);
  }
  if (LEGACY) {
    /* پلاریتهٔ خروجی: درختِ شکسته باید exit≠0 بدهد تا اثباتِ RED ماشین-خوانا
       باشد. در حالتِ LEGACY سبز شدنِ همهٔ چک‌ها یعنی «باگ بازتولید شد»، نه
       «پروب سالم است» — پس پیامِ توضیحی می‌آید ولی خروج همچنان ۱ می‌ماند. */
    console.log('  RED ON BROKEN TREE (expected — unbounded hang reproduced, B-PG-1 fix is load-bearing)');
    process.exit(1);
  }
  console.log('  ALL GREEN — health/readiness are bounded and fail-closed under a runtime PG blackhole');
})().catch((e) => {
  console.error('PROBE ERROR:', e.stack || e);
  process.exit(2);
});
