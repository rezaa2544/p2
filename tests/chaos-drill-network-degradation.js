#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   chaos-drill-network-degradation.js — سناریوی S5: تخریبِ شبکه → timeout → retry → dedupe

   بدیلِ صادقانهٔ tc/netem (که در این سندباکس وجود ندارد — «qdisc kind unknown»):
   پروکسیِ TCP درونِ drill با سه حالتِ تزریقِ قابلِ‌اثبات:
     delay(ms)  : تأخیرِ واقعی پیش از رساندنِ درخواست
     abort      : قطعِ اتصال پیش از رسیدنِ درخواست (سرور هرگز آن را نمی‌بیند)
     swallow    : رساندنِ درخواست + بلعیدنِ پاسخ (سمتِ سرور اعمال می‌شود، کلاینت timeout می‌خورد)

   ادعاهای سنجیده:
     timeout rate   : نرخِ timeout تحتِ تخریب
     retry          : تلاشِ مجدد با همان uid (رفتارِ واقعیِ صفِ آفلاینِ کلاینت)
     idempotency    : «timeout ولی اعمال‌شده» ⇒ retry باید duplicate_ignored بدهد و فقط یک ردیف بسازد
     no loss        : «abort» ⇒ retry باید همان یک‌بار را اعمال کند
     recovery       : پس از برداشتنِ تخریب، تأخیر به خطِ پایه برمی‌گردد

   اجرا: timeout 150 node tests/chaos-drill-network-degradation.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const L = require('./chaos-drill-lib');

const T = { baselineMs: null, delayedMs: null, timeoutRate: null, retries: 0, dedupeHits: 0, rowsAfterRetry: null, recoveredMs: null, appliedDespiteTimeout: null };
const rows = [];

(async () => {
  const infra = await L.Infra.start();
  infra.seedPg(['schools', 'classes', 'users', 'preapps']);
  const api = await L.startApi({ infra });
  const proxy = await L.startProxy(api.port);
  const st = infra.store();
  const mgr = st.users.find((u) => u.role === 'manager' && u.school_id === 1);
  const lg = await L.loginAs(proxy.port, mgr); /* لاگین هم از مسیرِ پروکسی (انتهای واقعی) */
  L.check(rows, 'setup: لاگین از مسیرِ پروکسی', lg.ok, 'login=' + lg.login.status + ' proxy_target=' + api.port);

  /* ── پایه ────────────────────────────────────────────────────── */
  const b = [];
  for (let i = 0; i < 3; i++) {
    const w = await L.syncWrite(proxy.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's5-base-' + i, stage: 'contact' } });
    if (w.acked) b.push(w.ms);
  }
  T.baselineMs = b.length ? b.slice().sort((x, y) => x - y)[1] : null;
  L.check(rows, 'baseline: نوشت از مسیرِ پروکسی ack می‌شود', b.length === 3, 'latencies=' + b.join(',') + 'ms median=' + T.baselineMs + 'ms');

  /* ── تزریق ۱: تأخیرِ واقعی زیرِ آستانهٔ timeout ──────────────── */
  proxy.setMode('delay', 700);
  const d1 = await L.syncWrite(proxy.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's5-delayed', stage: 'contact' } }, 6000);
  T.delayedMs = d1.ms;
  L.check(rows, 'inject/delay: تأخیرِ ۷۰۰ms اعمال شد (نه توهمِ تزریق) و درخواست سالم رفت‌وبرگشت',
    proxy.state.delayed > 0 && d1.acked && d1.ms >= 650, 'delayed_connections=' + proxy.state.delayed + ' latency=' + d1.ms + 'ms (baseline ' + T.baselineMs + 'ms) acked=' + d1.acked);

  /* ── تزریق ۲: swallow ⇒ timeout ولی اعمال‌شده (کلیدِ idempotency) ── */
  proxy.setMode('swallow');
  const uidA = 's5-timeout-' + Date.now();
  const toA = await L.syncWrite(proxy.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's5-timeout-applied', stage: 'contact' }, uid: uidA }, 1200);
  const isTimeout = toA.status === 0 && /timeout/i.test(String(toA.error));
  L.check(rows, 'inject/swallow: کلاینت timeout خورد (خطای شبکه، نه پاسخِ جعلی)',
    isTimeout, 'status=' + toA.status + ' error=' + toA.error + ' swallowed=' + proxy.state.swallowed + ' ms=' + toA.ms);
  await L.sleep(700); /* فرصت به سرور تا درخواستِ بلعیده‌شده را اعمال کند */
  const appliedBefore = infra.psql("SELECT count(*) FROM preapps WHERE name='s5-timeout-applied'");
  L.check(rows, 'inject/swallow: سرور درخواست را واقعاً اعمال کرده (بدترین حالتِ timeout: کار انجام شده، پاسخ گم شده)',
    appliedBefore === '1', 'rows_before_retry=' + appliedBefore);

  /* retry با همان uid (رفتارِ صفِ آفلاین) */
  proxy.setMode('passthrough');
  const retryA = await L.syncWrite(proxy.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's5-timeout-applied', stage: 'contact' }, uid: uidA });
  T.retries++;
  const dupCode = retryA.json && retryA.json.results && retryA.json.results[0] && retryA.json.results[0].code;
  if (dupCode === 'duplicate_ignored') T.dedupeHits++;
  const rowsAfterA = infra.psql("SELECT count(*) FROM preapps WHERE name='s5-timeout-applied'");
  T.rowsAfterRetry = rowsAfterA;
  L.check(rows, 'idempotency: retry با همان uid پاسخِ idempotent گرفت (duplicate_ignored) — بدونِ ردیفِ دوم',
    retryA.acked && dupCode === 'duplicate_ignored' && rowsAfterA === '1',
    'status=' + retryA.status + ' code=' + dupCode + ' rows=' + rowsAfterA + ' (expected 1)');

  /* ── تزریق ۳: abort ⇒ درخواست هرگز نرسید؛ retry باید بدونِ گم‌شدن اعمال کند ── */
  proxy.setMode('abort');
  const uidB = 's5-abort-' + Date.now();
  const toB = await L.syncWrite(proxy.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's5-abort-lost', stage: 'contact' }, uid: uidB }, 3000);
  L.check(rows, 'inject/abort: اتصال پیش از رسیدن قطع شد (سرور چیزی ندید)',
    toB.status === 0 && proxy.state.aborted > 0, 'client error=' + toB.error + ' aborted_connections=' + proxy.state.aborted);
  const rowsBeforeB = infra.psql("SELECT count(*) FROM preapps WHERE name='s5-abort-lost'");
  L.check(rows, 'inject/abort: هیچ نوشتِ جزئی از درخواستِ قطع‌شده ثبت نشد', rowsBeforeB === '0', 'rows=' + rowsBeforeB);

  proxy.setMode('passthrough');
  const retryB = await L.syncWrite(proxy.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's5-abort-lost', stage: 'contact' }, uid: uidB });
  T.retries++;
  const rowsAfterB = infra.psql("SELECT count(*) FROM preapps WHERE name='s5-abort-lost'");
  L.check(rows, 'no loss: retry پس از abort همان یک‌بار را اعمال کرد',
    retryB.acked && rowsAfterB === '1', 'status=' + retryB.status + ' rows=' + rowsAfterB);

  /* ── تخریبِ ترکیبی: نرخِ timeout در ۸ درخواست ───────────────── */
  proxy.setMode('swallow');
  let timeouts = 0;
  const mixed = [];
  for (let i = 0; i < 8; i++) {
    const w = await L.syncWrite(proxy.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's5-mixed-' + i, stage: 'contact' } }, 900);
    mixed.push(w.status);
    if (w.status === 0) timeouts++;
  }
  T.timeoutRate = timeouts / 8;
  L.check(rows, 'degradation: نرخِ timeout تحتِ تخریب ۸/۸ سنجیده شد (بدونِ پاسخِ دروغ)',
    timeouts === 8, 'statuses=' + mixed.join(',') + ' timeout_rate=' + (T.timeoutRate * 100).toFixed(0) + '%');
  await L.sleep(800);
  T.appliedDespiteTimeout = Number(infra.psql("SELECT count(*) FROM preapps WHERE name LIKE 's5-mixed-%'"));
  console.log('[evidence] از ۸ درخواستِ timeout‌خورده، ' + T.appliedDespiteTimeout + ' در PG اعمال شده بود (کلاسِ «timeout ولی اعمال‌شده» — پشتوانهٔ idempotency)');

  proxy.setMode('passthrough');
  const recover = [];
  for (let i = 0; i < 3; i++) {
    const w = await L.syncWrite(proxy.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 1, name: 's5-recovered-' + i, stage: 'contact' } }, 6000);
    if (w.acked) recover.push(w.ms);
  }
  T.recoveredMs = recover.length ? recover.slice().sort((x, y) => x - y)[1] : null;
  L.check(rows, 'recovery: پس از برداشتنِ تخریب، تأخیر به خطِ پایه برگشت',
    recover.length === 3 && T.recoveredMs <= T.baselineMs * 5 + 50, 'recovered_latency=' + recover.join(',') + 'ms (baseline ' + T.baselineMs + 'ms)');

  /* ── یکپارچگیِ نهایی ────────────────────────────────────────── */
  const dupNames = infra.psql("SELECT count(*) FROM (SELECT name, count(*) c FROM preapps WHERE name LIKE 's5-%' GROUP BY name HAVING count(*) > 1) t");
  L.check(rows, 'integrity: هیچ نامِ تکراری از opsِ بازپخش‌شده (no duplicates)', dupNames === '0', 'duplicate_names=' + dupNames);
  const expectedNames = ['s5-abort-lost', 's5-base-0', 's5-base-1', 's5-base-2', 's5-delayed', 's5-recovered-0', 's5-recovered-1', 's5-recovered-2', 's5-timeout-applied'];
  const got = infra.psql("SELECT string_agg(DISTINCT name, ',' ORDER BY name) FROM preapps WHERE name LIKE 's5-%' AND name NOT LIKE 's5-mixed-%'");
  L.check(rows, 'integrity: مجموعهٔ ack‌شده دقیقاً همان است که در PG هست (no loss)', got === expectedNames.join(','), 'PG=' + got);

  const x = await L.syncWrite(proxy.port, lg.jar, { by: mgr.id, collection: 'preapps', type: 'ins', data: { school_id: 2, name: 's5-crosstenant', stage: 'contact' } });
  L.check(rows, 'tenant isolation: نوشتِ school_id=2 با کوکیِ مدیرِ school 1 = 403', x.status === 403, 'status=' + x.status);

  const ledger = infra.psql("SELECT count(*) FROM server_processed_uids WHERE uid LIKE 's5-%'");
  console.log('[evidence] ردیف‌های ledgerِ idempotency (PG) برای uidهای s5-*: ' + ledger + ' | retries=' + T.retries + ' dedupe_hits=' + T.dedupeHits);
  console.log('[evidence] شمارِ تزریق‌ها: connections=' + proxy.state.connections + ' delayed=' + proxy.state.delayed + ' aborted=' + proxy.state.aborted + ' swallowed=' + proxy.state.swallowed);

  proxy.stop(); api.stop(); infra.stop();
  L.report('S5-network-degradation', rows, T,
    'baseline=' + T.baselineMs + 'ms | delayed=' + T.delayedMs + 'ms | timeout_rate=' + (T.timeoutRate * 100).toFixed(0) + '% | retries=' + T.retries + ' | dedupe_hits=' + T.dedupeHits + ' | recovered=' + T.recoveredMs + 'ms');
})().catch((e) => { console.error('DRILL ERROR: ' + (e && e.message)); process.exit(3); });
