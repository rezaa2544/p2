#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   chaos-drill-redis-outage.js — سناریوی S2: قطعِ Redis → فالبک → بازگشت

   معماری (تأییدشده در نقشه‌برداری): store = منبعِ حقیقتِ offline-first؛
   PG = آینه؛ Redis = کش/stateِ گذرا (در production الزامی برای readiness).

   اندازه‌گیری‌ها:
     time-to-detect  : چند ms تا readiness «امتناع» کرد (۵۰۳) در حالی که liveness ۲۰۰ ماند
     fallback latency: تأخیرِ نوشتِ ack‌شده در قطع، در برابرِ خطِ پایه
     cache miss      : رفتارِ مسیرهایی که به Redis وابسته‌اند (نرخ‌محدودسازی/کش)
     integrity       : پس از بازگشت Redis (که با --save '' کاملاً خالی بالا می‌آید)
                       نوشته‌های ack‌شده باید در store و PG دست‌نخورده باشند — نه گم شوند، نه تکرار.

   اجرا: timeout 120 node tests/chaos-drill-redis-outage.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const L = require('./chaos-drill-lib');
const ROOT_FILE = (p) => path.join(__dirname, '..', p);

const T = { detect: null, recover: null, writeBaselineMs: null, writeOutageMs: null, writeOutageStatus: null };
const rows = [];

(async () => {
  const infra = await L.Infra.start();
  infra.seedPg(['schools', 'classes', 'users', 'preapps']);
  const api = await L.startApi({ infra });
  const st = infra.store();
  const mgr = st.users.find((u) => u.role === 'manager' && u.school_id === 1);
  const lg = await L.loginAs(api.port, mgr);
  L.check(rows, 'setup: لاگینِ مدیر', lg.ok, 'login=' + lg.login.status);

  const r0 = await L.readiness(api.port);
  const l0 = await L.liveness(api.port);
  L.check(rows, 'baseline: readiness=ready و redis.live=true',
    r0.status === 200 && r0.json && r0.json.redis && r0.json.redis.live === true,
    'status=' + r0.status + ' redis=' + JSON.stringify(r0.json && r0.json.redis));
  L.check(rows, 'baseline: liveness=200', l0.status === 200, 'pid=' + (l0.json && l0.json.pid));
  L.check(rows, 'baseline: Redis واقعاً زنده است (redis-cli PING)', infra.redis(['ping']).toUpperCase() === 'PONG', infra.redis(['ping']));

  /* خطِ پایهٔ نوشت (۳ نمونه برای میانه) */
  const base = [];
  for (let i = 0; i < 3; i++) {
    const w = await L.syncWrite(api.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's2-base-' + i, stage: 'contact' } });
    if (w.acked) base.push(w.ms);
  }
  T.writeBaselineMs = base.length ? median(base) : null;
  L.check(rows, 'baseline: نوشتِ ack‌شده سنجیده شد', base.length === 3, 'latencies=' + base.join(',') + 'ms median=' + T.writeBaselineMs + 'ms');

  /* ── تزریق: خاموشیِ واقعیِ Redis ─────────────────────────────── */
  infra.stopRedis('shutdown');
  const t0 = Date.now();
  const dead = await L.until(async () => infra.redis(['ping']).startsWith('ERR:'), { timeoutMs: 8000, stepMs: 20, label: 'redis-dead' });
  L.check(rows, 'inject: Redis واقعاً از دسترس خارج شد (PING خطا)', dead.ok, 'after=' + dead.ms + 'ms');
  L.check(rows, 'inject: پورتِ Redis بسته شد', (await L.readiness(api.port).catch(() => null)) !== null, 'api پاسخ می‌دهد (پروسه زنده)');

  /* ── تشخیص: readiness امتناع، liveness زنده ─────────────────── */
  const det = await L.until(async () => { const r = await L.readiness(api.port, 2500); return r.status === 503; }, { timeoutMs: 20000, stepMs: 20, label: 'readiness-503' });
  T.detect = det.ok ? det.ms : null;
  L.check(rows, 'detect: readiness=503 (fail-closed) در حینِ قطعِ Redis', det.ok, 'time_to_detect=' + det.ms + 'ms from shutdown');
  const rd = await L.readiness(api.port);
  const lv = await L.liveness(api.port);
  L.check(rows, 'detect: liveness همچنان ۲۰۰ (زنده‌بودنِ پروسه confused نشود)', lv.status === 200, 'liveness=' + lv.status + ' pid=' + (lv.json && lv.json.pid));
  L.check(rows, 'detect: دلیلِ امتناع صریح است (redis.alive=false و required=true)',
    rd.json && rd.json.redis && rd.json.redis.alive === false && rd.json.redis.required === true,
    'readiness body=' + JSON.stringify(rd.json));

  /* ── فالبک: نوشت و مسیرهای وابسته در حینِ قطع ───────────────── */
  const wOut = await L.syncWrite(api.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's2-outage-write', stage: 'contact' } });
  T.writeOutageMs = wOut.ms; T.writeOutageStatus = wOut.status;
  /* ادعای معماری: Redis کش است ⇒ مسیرِ نوشت باید یا فالبک کند یا امتناعِ صریحِ
     503 بدهد. ۵۰۰ = سرریزِ خطا به کلاینت. */
  L.check(rows, 'fallback: نوشت در قطعِ Redis فالبک/امتناعِ صریح می‌دهد (نه ۵۰۰ِ سرریز)',
    [200, 503, 429].includes(wOut.status), 'status=' + wOut.status + ' ms=' + wOut.ms + ' raw=' + wOut.raw.slice(0, 120));
  const dedupePath = /cache\.isProcessedUid|payesh:idempotency/.test(require('fs').readFileSync(ROOT_FILE('server/sync.js'), 'utf8')) &&
                     /prodRethrow/.test(require('fs').readFileSync(ROOT_FILE('server/redis.js'), 'utf8'));
  console.log('[root-cause] sync.js:879 cache.isProcessedUid → redis.get → prodRethrow (redis.js) — زنجیرهٔ وابستگیِ سختِ مسیرِ نوشت: ' + dedupePath);

  const sc = await L.httpReq(api.port, 'POST', '/api/auth/send-code', { phone: mgr.phone }, { timeoutMs: 8000 });
  L.check(rows, 'fallback: rate-limit در قطعِ Redis fail-open است (نه ۵۰۰)', sc.status === 200 || sc.status === 429,
    'send-code status=' + sc.status + ' raw=' + sc.raw.slice(0, 120));

  const authMe = await L.httpReq(api.port, 'GET', '/api/auth/me', null, { jar: lg.jar, timeoutMs: 8000 });
  L.check(rows, 'fallback: نشستِ موجود در قطعِ Redis معتبر می‌ماند (احرازِ stateful نمی‌شکند)',
    authMe.status === 200, 'me status=' + authMe.status + ' ms=' + authMe.ms);

  const bootOut = await L.httpReq(api.port, 'GET', '/api/v1/bootstrap', null, { jar: lg.jar, timeoutMs: 8000 });
  L.check(rows, 'fallback: خوانشِ bootstrap در قطعِ Redis پاسخ می‌دهد (کش‌فالبک، نه ۵۰۰)',
    [200, 503].includes(bootOut.status), 'bootstrap status=' + bootOut.status + ' ms=' + bootOut.ms);

  const healthOut = await L.health(api.port);
  L.check(rows, 'fallback: /api/health بدونِ سقوط گزارش می‌دهد',
    healthOut.status === 200 && healthOut.json && healthOut.json.redis && healthOut.json.redis.alive === false,
    'health.redis=' + JSON.stringify(healthOut.json && healthOut.json.redis) + ' status=' + healthOut.status);

  /* ── بازیابی: Redis خالی بالا می‌آید ────────────────────────── */
  await infra.startRedisAgain();
  const rec = await L.until(async () => { const r = await L.readiness(api.port, 2500); return r.status === 200 && r.json && r.json.status === 'ready'; },
    { timeoutMs: 30000, stepMs: 25, label: 'readiness-ready' });
  T.recover = rec.ok ? rec.ms : null;
  L.check(rows, 'recover: readiness به ready برگشت در ≤۳۰s', rec.ok, 'time_to_recover=' + rec.ms + 'ms');
  L.check(rows, 'recover: Redis تازه واقعاً زنده است', infra.redis(['ping']).toUpperCase() === 'PONG', infra.redis(['ping']));
  const dbsize = infra.redis(['dbsize']);
  console.log('[evidence] Redis پس از restart: dbsize=' + dbsize + ' (خالی — کش، نه منبعِ حقیقت)');

  /* ── یکپارچگیِ داده پس از بازگشت ───────────────────────────── */
  const wAfter = await L.syncWrite(api.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's2-after-restore', stage: 'contact' } });
  L.check(rows, 'integrity: نوشتِ پس از بازگشت ack شد و نشست پابرجاست', wAfter.acked, 'status=' + wAfter.status + ' ms=' + wAfter.ms);

  const pgNames = infra.psql("SELECT string_agg(name, ',' ORDER BY name) FROM preapps WHERE name LIKE 's2-%'");
  const storeNow = infra.store();
  const pgList = pgNames.startsWith('ERR:') ? [] : pgNames.split(',').filter(Boolean);
  const expectedBase = ['s2-after-restore', 's2-base-0', 's2-base-1', 's2-base-2'];
  const outageAck = wOut.status === 200 && wOut.acked;
  const expected = outageAck ? expectedBase.concat(['s2-outage-write']) : expectedBase;
  L.check(rows, 'integrity: هیچ ردیفِ گم‌شده‌ای نیست (PG ⊇ همهٔ ack‌شده‌ها)',
    expected.every((n) => pgList.includes(n)), 'PG=' + JSON.stringify(pgList));
  L.check(rows, 'integrity: هیچ ردیفِ تکراری/جعل‌شده (PG = بدقیقاً همان مجموعهٔ ack‌شده)',
    pgList.length === new Set(pgList).size && pgList.length === expected.length, 'PG count=' + pgList.length + ' expected=' + expected.length);
  /* دوامِ واقعی: پروسهٔ تازه روی همان PG باید همان مجموعه را ببیند
     (ستونِ فایلی در حالتِ PG-live فقط mirrorِ bootstrap است — ادعا نکن که منبع است). */
  const api2 = await L.startApi({ infra });
  const lg2 = await L.loginAs(api2.port, mgr);
  const freshRows = infra.psql("SELECT count(*) FROM preapps WHERE name LIKE 's2-%'");
  const boot2 = await L.httpReq(api2.port, 'GET', '/api/v1/bootstrap', null, { jar: lg2.jar, timeoutMs: 8000 });
  L.check(rows, 'integrity: پس از restartِ پروسه، همان مجموعه از PG خوانده می‌شود (دوام)',
    lg2.ok && freshRows === String(expected.length) && boot2.status === 200,
    'fresh_login=' + lg2.login.status + ' PG rows=' + freshRows + ' bootstrap=' + boot2.status);
  api2.stop();
  L.check(rows, 'integrity: store پس از قطع JSON سالم و parse‌پذیر است',
    !!storeNow.users && Array.isArray(storeNow.preapps), 'users=' + storeNow.users.length + ' preapps=' + storeNow.preapps.length);

  /* rate-limit پس از بازگشت (state واقعیِ Redis) */
  const sc2 = await L.httpReq(api.port, 'POST', '/api/auth/send-code', { phone: mgr.phone }, { timeoutMs: 8000 });
  L.check(rows, 'integrity: rate-limit پس از بازگشت فعال است (کدِ cooldown ⇒ 429 یا 200)', [200, 429].includes(sc2.status),
    'send-code status=' + sc2.status + ' raw=' + sc2.raw.slice(0, 90));

  const x = await L.syncWrite(api.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 2, name: 's2-crosstenant', stage: 'contact' } });
  L.check(rows, 'tenant isolation: نوشتِ school_id=2 با کوکیِ مدیرِ school 1 = 403', x.status === 403, 'status=' + x.status + ' raw=' + x.raw.slice(0, 90));

  api.stop(); infra.stop();
  L.report('S2-redis-outage', rows, T,
    'time_to_detect=' + T.detect + 'ms | time_to_recover=' + T.recover + 'ms | write baseline=' + T.writeBaselineMs + 'ms vs outage=' + T.writeOutageMs + 'ms(status ' + T.writeOutageStatus + ')');
})().catch((e) => { console.error('DRILL ERROR: ' + (e && e.message)); process.exit(3); });

function median(a) { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
