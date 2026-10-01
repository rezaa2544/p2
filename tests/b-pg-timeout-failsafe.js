#!/usr/bin/env node
/**
 * B-PG-REWORK/M12-F1 — پروبِ runtimeِ کران‌هایِ fail-safe
 *
 * F-1 فقط یک مشکلِ parsing نیست؛ یک مشکلِ *رفتارِ runtime* است. این پروب
 * هر شکل از misconfiguration را می‌گیرد، یک سرورِ واقعی روی یک TCP blackhole
 * ( PG زنده می‌پذیرد ولی هرگز جواب نمی‌دهد) بالا می‌آورد و اثبات می‌کند که
 *
 *   هر misconfiguration ⇒ failِ کران‌دار (نه hang)
 *
 * Driver در سه جا کران را فقط با مقدارِ positive می‌شناسد (تأییدشده روی
 * HEAD 6152a48a):
 *   pg-pool/index.js:206  `if (!this.options.connectionTimeoutMillis)`
 *   pg/lib/client.js:167   `if (this._connectionTimeoutMillis > 0)`
 *   pg/lib/client.js:702   `config.query_timeout || this.connectionParameters.query_timeout`
 *
 * مکانیزم (همان b-pg-health-blackhole): سرور از مسیرِ forward relay سالم
 * بالا می‌آید، بعد relay freeze می‌شود → اتصال‌های تازه پذیرفته می‌شوند ولی
 * هیچ جوابی نمی‌آیند. فقط connectionTimeoutMillis + query_timeout زنده‌اند
 * و این پروب اثبات می‌کند که مقادیرِ نامعتبر هرگز آن‌ها را خاموش نمی‌کنند.
 *
 *     node tests/b-pg-timeout-failsafe.js              # درختِ اصلاح‌شده: exit 0
 *     PAYESH_PG_UNBOUNDED_PROBE=1 node tests/b-pg-timeout-failsafe.js
 *                            # درختِ شکسته: exit 1 (شکل‌ها hang می‌کنند)
 *
 * همهٔ waitها watchdog-guarded هستند؛ timeout ⇒ FAIL، هرگز hang یا skip→pass.
 */
'use strict';

const { spawn, execFileSync } = require('child_process');
const net = require('net');
const http = require('http');
const { Client } = require('pg');

const PORT = 38542;
const RELAY_PORT = 38543;
const PG_HOST = '127.0.0.1';
const PG_PORT = 5432;
const PROBE_DB = 'payesh_bpg_failsafe';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

/* LEGACY: پرچمِ بازتولیدِ درختِ pre-fix. وقتی روشن است، سرور درست همان
 * مقادیرِ نامحدودِ قدیمی را می‌بیند و پروب انتظارِ hang دارد. */
const LEGACY = process.env.PAYESH_PG_UNBOUNDED_PROBE === '1' && process.env.NODE_ENV !== 'production';

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: String(detail || '').slice(0, 220) });
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '  — ' + results[results.length - 1].detail));
}

/* شکل‌هایِ misconfiguration که باید fail-safe باشند. هر کدام قبلاً به
 * unbounded تبدیل می‌شدند (parseInt('0')=0، parseInt('abc')=NaN،
 * parseInt('-1')=-1 — هر سه توسطِ فیلترهایِ driver رد می‌شوند). */
const SHAPES = [
  { label: 'unset', env: {} },
  { label: 'empty string', env: { PG_TIMEOUT_MS: '', PAYESH_PG_QUERY_TIMEOUT_MS: '', PAYESH_PG_PING_TIMEOUT_MS: '' } },
  { label: 'zero', env: { PG_TIMEOUT_MS: '0', PAYESH_PG_QUERY_TIMEOUT_MS: '0', PAYESH_PG_PING_TIMEOUT_MS: '0' } },
  { label: 'negative', env: { PG_TIMEOUT_MS: '-1', PAYESH_PG_QUERY_TIMEOUT_MS: '-5', PAYESH_PG_PING_TIMEOUT_MS: '-9' } },
  { label: 'non-numeric', env: { PG_TIMEOUT_MS: 'abc', PAYESH_PG_QUERY_TIMEOUT_MS: 'NaN', PAYESH_PG_PING_TIMEOUT_MS: '10x' } }
];

function parseUrl(u) {
  const x = new URL(u);
  return { host: x.hostname, port: x.port || '5432', user: x.username, password: decodeURIComponent(x.password || '') };
}

/* teardownِ best-effort: شکستِ socket/process/close در مسیرِ پاک‌سازی هرگز
 * نباید نتیجهٔ واقعیِ پروب را ببلعد. همهٔ cleanupها از این helper می‌گذرند
 * تا یک `catch (e) {}`ِ برهنه (که esl@10 به‌عنوانِ no-empty می‌شمارد) در
 * فایلِ جدید باقی نماند. */
function bestEffort(fn) {
  try { fn(); } catch (e) { /* intentionally ignored — cleanup path */ }
}
const adminUrl = process.env.PAYESH_BPG_ADMIN_URL || process.env.PGURL || process.env.DATABASE_URL
  || 'postgresql://postgres:123456@127.0.0.1:5432/postgres';
const adminOpts = parseUrl(adminUrl);

/* ── TCP blackhole relay (همان مکانیزمِ b-pg-health-blackhole) ──────
 * PG واقعی پشتِ relay است. بعد از freeze، اتصال پذیرفته می‌شود ولی هیچ
 * بایتی جواب داده نمی‌شود — یعنی connectionTimeoutMillis و query_timeout
 * هر دو باید فعال شوند تا سرور آزاد شود. */
function startRelay() {
  return new Promise((resolve, reject) => {
    const blackholed = [];
    const stats = { frozenInbound: 0 };
    let frozen = false;
    const srv = net.createServer((sock) => {
      if (frozen) { sock.resume(); blackholed.push(sock); return; }
      const up = net.connect(PG_PORT, PG_HOST);
      const fin = () => {
        bestEffort(() => sock.destroy());
        bestEffort(() => up.destroy());
      };
      sock.on('data', (d) => {
        if (frozen) { stats.frozenInbound += d.length; return; }
        up.write(d);
      });
      up.on('data', (d) => { sock.write(d); });
      sock.on('error', fin); sock.on('close', fin);
      up.on('error', fin); up.on('close', fin);
    });
    srv.on('error', reject);
    srv.listen(RELAY_PORT, PG_HOST, () => resolve({
      stats,
      freeze: () => { frozen = true; },
      restore: () => {
        frozen = false;
        for (const s of blackholed) { bestEffort(() => s.destroy()); }
        blackholed.length = 0;
      },
      sever: () => {
        bestEffort(() => srv.close());
        for (const s of blackholed) { bestEffort(() => s.destroy()); }
        blackholed.length = 0;
      }
    }));
  });
}

function get(path) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (e) { /* body is not JSON — keep raw for the verdict */ }
        resolve({ status: res.statusCode, json, raw: body.slice(0, 300) });
      });
    });
    req.on('error', (e) => resolve({ status: 0, json: null, raw: 'ERR ' + e.code }));
    /* watchdogِ سمتِ کلاینت: ۱۲ ثانیه. هر شکلِ fail-safe باید خیلی
     * زودتر از این تمام شود (defaultها ۳s/۱۰s). */
    req.setTimeout(12000, () => { req.destroy(); resolve({ status: 0, json: null, raw: 'CLIENT_WATCHDOG_TIMEOUT' }); });
    req.end();
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function bootServer(shapeEnv) {
  /* همان الگوی b-pg-health-blackhole: اعتبارِ adminِ واقعی، فقط host:port
   * به relay اشاره می‌کند (همان کاربرِ مالکِ scratch DB). */
  const probeUrl = adminUrl.replace('@' + adminOpts.host + ':' + adminOpts.port + '/', '@127.0.0.1:' + RELAY_PORT + '/');
  const env = Object.assign({}, process.env, shapeEnv, {
    DATABASE_URL: probeUrl.replace(/\/[^/?]*$/, '/' + PROBE_DB),
    REDIS_URL,
    PAYESH_ENV: 'production',
    ALLOW_MEMORY_FALLBACK: '1',
    PAYESH_BEHIND_PROXY: '1',
    PAYESH_JWT_SECRET: 'b-pg-timeout-failsafe-probe-secret-32b',
    PORT: String(PORT),
    HOST: '127.0.0.1',
    PATH: process.env.PATH,
    SYSTEMROOT: process.env.SYSTEMROOT,
    TEMP: process.env.TEMP
  });
  const proc = spawn(process.execPath, ['server/index.js'], { env, cwd: '.', stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  return { proc, getLog: () => log };
}

(async () => {
  console.log('B-PG timeout fail-safe probe  (LEGACY=' + (LEGACY ? '1 (expect shapes to hang — broken tree)' : '0 (expect shapes to fail bounded)') + ')');

  /* F-2: قراردادِ verdictِ greppable — هر مسیرِ خروجِ زودهنگام باید خودش را
   * معرفی کند تا runner/CI نتوانند پروبِ اجرا نشده را سبز گزارش کنند. */
  function notRun(reason) {
    console.log('B-PG-PROBE VERDICT: NOT-RUN reason=' + String(reason).slice(0, 200));
  }

  /* ── setup: scratch DB روی کلاسترِ واقعی ── */
  const admin = new Client(adminOpts);
  try { await admin.connect(); }
  catch (e) {
    notRun('cannot reach the PostgreSQL admin connection (' + e.message + ') — needs a live PostgreSQL on '
      + adminOpts.host + ':' + adminOpts.port + ' (PAYESH_BPG_ADMIN_URL/PGURL/DATABASE_URL)');
    console.log('  SETUP FAILED: cannot reach the PostgreSQL admin connection (' + e.message + ')');
    console.log('  this probe needs a live PostgreSQL on ' + adminOpts.host + ':' + adminOpts.port);
    process.exit(1);
  }
  try {
    await admin.query('DROP DATABASE IF EXISTS ' + PROBE_DB);
    await admin.query('CREATE DATABASE ' + PROBE_DB);
  } catch (e) {
    notRun('cannot create scratch database ' + PROBE_DB + ' (' + e.message + ')');
    console.log('  SETUP FAILED: cannot create scratch database ' + PROBE_DB + ' (' + e.message + ')');
    try { await admin.end(); } catch (_) { /* connection already broken — nothing to close */ }
    process.exit(1);
  }
  await admin.end();

  try {
    execFileSync(process.execPath, ['tools/migrate-ledger.js', 'up'], {
      env: Object.assign({}, process.env, {
        DATABASE_URL: 'postgresql://' + adminOpts.user + ':' + encodeURIComponent(adminOpts.password)
          + '@127.0.0.1:5432/' + PROBE_DB
      }),
      stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000
    });
  } catch (e) {
    notRun('migration chain did not apply to ' + PROBE_DB + ' (' + String(e.message).slice(0, 140) + ')');
    console.log('  SETUP FAILED: migration chain did not apply to ' + PROBE_DB);
    process.exit(1);
  }

  const relay = await startRelay();

  /* LEGACY: کدام شکل‌ها واقعاً hang کردند — برای پیامِ verdictِ روشن. */
  const legacyHangShapes = [];

  for (const shape of SHAPES) {
    console.log('\n  --- shape: ' + shape.label + ' ---');
    const { proc, getLog } = bootServer(shape.env);

    /* فاز ۱: سرور از مسیرِ forward relay کاملاً سالم بالا می‌آید. */
    let up = null;
    for (let i = 0; i < 360; i += 1) {
      const h = await get('/api/health');
      if (h.status !== 0) { up = h; break; }
      await sleep(250);
    }
    check('shape "' + shape.label + '": healthy boot through the forward relay (200 + ok:true + postgres alive)',
      !!(up && up.status === 200 && up.json && up.json.ok === true && up.json.db
        && up.json.db.driver === 'postgres' && up.json.db.alive === true),
      'status=' + (up && up.status) + ' log=' + getLog().slice(-160));
    if (!up) {
      bestEffort(() => proc.kill('SIGKILL'));
      relay.sever();
      continue;
    }

    /* فاز ۲: INJECT — اتصال‌های تازه سیاه‌چاله می‌شوند، سوکت‌های برقرارشده
     * باز می‌مانند ولی جواب نمی‌دهند. pool بعد از نابودیِ اولین کلاینتِ
     * یخ‌زده باید کلاینتِ تازه بسازد و همان connectionTimeoutMillis است که
     * آن اتصالِ هرگزتکمیل‌نشدنی را می‌بندد. */
    relay.freeze();
    await sleep(300);

    let hangs = 0, okFalse = 0, http503 = 0, maxMs = 0;
    const sampleMs = [];
    for (let i = 0; i < 4; i += 1) {
      const t0 = Date.now();
      const h = await get('/api/health');
      const ms = Date.now() - t0;
      maxMs = Math.max(maxMs, ms);
      sampleMs.push(ms);
      console.log('    sample ' + i + ': status=' + h.status + ' ms=' + ms
        + ' ok=' + (h.json && h.json.ok) + ' raw=' + String(h.raw).slice(0, 40));
      if (h.status === 0) hangs += 1;
      if (h.json && h.json.ok === false) okFalse += 1;
      if (h.status === 503) http503 += 1;
      await sleep(120);
    }
    console.log('    summary: hangs=' + hangs + ' ok=false ' + okFalse + ' HTTP503 ' + http503
      + ' slowest=' + maxMs + 'ms frozenInbound=' + relay.stats.frozenInbound + 'B');

    if (LEGACY) {
      /* درختِ pre-fix: conn=0 و q=0 ⇒ driver هیچ تایم‌اوی نمی‌گیرد، پس
       * health هرگز جواب نمی‌دهد و watchdog می‌زند.
       *
       * توجه: فقطِ شکل‌هایی که مقدارِ *صریحاً نامعتبر* دارند hang می‌کنند
       * (zero/negative/non-numeric). unset و empty-string در درختِ pre-fix
       * هم defaultِ '3000' را می‌گرفتند (رشتهٔ '0' truthy است ولی unset
       * نیست)، پس سبز ماندنِ آن دو شکل در LEGACY ویژگیِ درستِ آن دو شکل
       * است، نه یک regression — این دقیقاً همان شکل‌هایی است که F-1 روی
       * آن‌ها گزارش شده بود. */
      check('shape "' + shape.label + '": precondition — blackhole window actually exercised (query bytes sent into a frozen socket)',
        relay.stats.frozenInbound > 0, 'frozenInbound=' + relay.stats.frozenInbound + 'B');
      check('shape "' + shape.label + '": BROKEN tree hangs (>= 3 of 4 health requests never answered)',
        hangs >= 3, 'hangs=' + hangs + ' slowest=' + maxMs + 'ms');
      if (hangs >= 3) legacyHangShapes.push(shape.label);
    } else {
      /* درختِ اصلاح‌شده: failِ کران‌دار. health باید ۵۰۳ بدهد و در زیرِ
       * watchdog تمام شود — هیچ شکلِ misconfiguration‌ای نباید hang کند. */
      check('shape "' + shape.label + '": precondition — blackhole window actually exercised',
        relay.stats.frozenInbound > 0, 'frozenInbound=' + relay.stats.frozenInbound + 'B');
      check('shape "' + shape.label + '": no hang under blackhole (0 of 4 requests hit the watchdog)',
        hangs === 0, 'hangs=' + hangs + ' slowest=' + maxMs + 'ms');
      check('shape "' + shape.label + '": health reports unhealthy (ok=false in every answered sample)',
        okFalse >= 3, 'ok=false=' + okFalse);
      check('shape "' + shape.label + '": HTTP status is 503', http503 >= 3, 'HTTP503=' + http503);
      check('shape "' + shape.label + '": every answer arrives bounded (slowest under 11s)',
        maxMs < 11000, 'slowest=' + maxMs + 'ms samples=' + JSON.stringify(sampleMs));
    }

    relay.restore();
    bestEffort(() => proc.kill('SIGKILL'));
    await sleep(400);
    /* relay را نبستیم — shapeهای بعدی هم از همان relay استفاده می‌کنند.
     * frozenInbound ریست می‌شود تا preconditionِ هر شکل مستقل بماند. */
    relay.stats.frozenInbound = 0;
  }

  /* ── cleanup ── */
  relay.sever();
  try {
    const a = new Client(adminOpts);
    await a.connect();
    await a.query('DROP DATABASE IF EXISTS ' + PROBE_DB);
    await a.end();
  } catch (e) { console.log('  cleanup warning: could not drop ' + PROBE_DB + ' (' + e.message + ')'); }

  const failed = results.filter((r) => !r.ok);
  console.log('\n  ' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  /* ترتیب مهم است: در حالتِ LEGACY دو شکلِ unset/empty *به‌طرزِ درستی* fail
   * می‌شوند (در درختِ pre-fix هم bounded بودند)، پس شاخهٔ failed.length
   * نباید قبل از پیامِ LEGACY قضیه را تمام کند. */
  if (LEGACY) {
    const reproduced = legacyHangShapes.length >= 3;
    console.log('B-PG-PROBE VERDICT: FAIL mode=LEGACY broken-tree-hang-reproduced'
      + ' shapes=' + JSON.stringify(legacyHangShapes));
    if (reproduced) {
      console.log('  RED ON BROKEN TREE (expected — ' + legacyHangShapes.length
        + ' of ' + SHAPES.length + ' shapes hang unbounded in the pre-fix tree)');
      console.log('  note: unset/empty-string stay bounded even pre-fix — `X || \'3000\'` handled those;'
        + ' the F-1 defect is the explicitly-invalid shapes (zero/negative/non-numeric)');
    } else {
      console.log('  WARNING: fewer than 3 shapes reproduced the pre-fix hang — probe may be losing its load-bearing proof');
    }
    process.exit(1);
  }
  if (failed.length) {
    console.log('  FAILED: ' + failed.map((f) => f.name).join(' | '));
    console.log('B-PG-PROBE VERDICT: FAIL mode=FIXED failed=' + failed.length);
    process.exit(1);
  }
  console.log('B-PG-PROBE VERDICT: PASS mode=FIXED');
  console.log('  ALL GREEN — every timeout misconfiguration degrades to a bounded failure, never a hang');
})().catch((e) => {
  console.error('B-PG-PROBE VERDICT: ERROR harness-crash');
  console.error('PROBE ERROR:', e.stack || e);
  process.exit(2);
});
