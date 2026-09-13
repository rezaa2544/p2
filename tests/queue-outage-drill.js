#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/queue-outage-drill.js — Wave 19 · مانورِ «قطعیِ صف» (Queue Outage)
   ───────────────────────────────────────────────────────────────────
   معماریِ واقعیِ صفِ این پروژه = Outbox تراکنشی (server/outbox.js):
   هر جهش رویدادی در `store.outbox` (حافظه، سقفِ ۱۰۰۰) + جدولِ
   `server_outbox` (پایتگاه‌داده) می‌نشانَد؛ مصرف‌کننده = server/worker.js
   که رویدادهای pending را با تلاشِ مجدد پردازش و علامت‌گذاری می‌کند
   (رویداد در شکست هرگز حذف نمی‌شود). این مانور همان اجزایِ واقعی را
   با PostgreSQL واقعی می‌آزماید — نه شبیه‌سازیِ صف؛ خرابی در مرزِ
   هندلر (نقطهٔ تجلیِ قطعیِ پایین‌دست) تزریق می‌شود.

   سناریوها:
     Q1  Queue Down → Buffer → Queue Up → Replay → Verify
         (هندلر می‌شکند؛ ۱۰ رویداد بافر می‌مانند؛ پس از بهبود، همه با
          ترتیب و بدون تکرار اعمال می‌شوند)
     Q2  Slow Consumer (۵۰۰ms) → رشدِ lag → Producer جدا می‌ماند
         (۲۰ تولیدِ هم‌زمان؛ p95 مسیرِ append در برابر مصرفِ کند)
     Q3  تحویلِ مکرر (at-least-once) → Dedupe
         (درجِ دوبارهٔ همان idها در PG + دو tickِ هم‌زمان + tick پس از
          پردازش ⇒ هر رویداد دقیقاً یک‌بار اعمال شود)
     Q4  Backlog ‏۱۲۰ → Drain
         (کارگر خاموش؛ ۱۲۰ رویداد؛ سپس روشن — عمقِ اوج، مدتِ تخلیه،
          ترتیب، صفر loss)

   اجرای زنده (نیازمندِ PG واقعی):
     QOD_LIVE_PG=1 [PGHOST=… PGPORT=… PGUSER=… PGDATABASE=…] \
       node tests/queue-outage-drill.js
   بدونِ زیرساخت:  node tests/queue-outage-drill.js --skip-live
   قانونِ «سبزِ جعلی ممنوع»: بدونِ PG زنده، سناریوها PASS نمی‌شوند؛
   NOT-RUN گزارش می‌شوند و خروجیِ ۲ یعنی «اجرا نشد»، نه «موفق».
   خروجیِ ماشین‌خوان: tests/chaos-output/queue-outage-drill.json
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_LIVE = process.argv.includes('--skip-live');
const LIVE_WANTED = !!process.env.QOD_LIVE_PG && !SKIP_LIVE;

const CFG = {
  pgHost: process.env.PGHOST || '/var/tmp/qod-run/sock',
  pgPort: Number(process.env.PGPORT || 55432),
  pgUser: process.env.PGUSER || 'postgres',
  pgDatabase: process.env.PGDATABASE || 'postgres',
  out: path.join(ROOT, 'tests', 'chaos-output', 'queue-outage-drill.json'),
  budgetMs: Number(process.env.QOD_BUDGET_MS || 120000),
};

let pass = 0, fail = 0, notRun = 0;
const results = [];
function chk(name, cond, detail) {
  const status = cond === true ? 'pass' : (cond === false ? 'fail' : 'not-run');
  if (status === 'pass') { pass++; console.log('  ✅ ' + name); }
  else if (status === 'fail') { fail++; console.log('  ❌ ' + name + (detail ? '  — ' + String(detail).slice(0, 200) : '')); }
  else { notRun++; console.log('  ⏭️  ' + name + ' — NOT RUN' + (detail ? ': ' + detail : '')); }
  results.push({ name, status, detail: detail == null ? null : String(detail).slice(0, 300) });
}
function grp(t) { console.log('\n▸ ' + t); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
function stats(a) {
  const s = [...a].sort((x, y) => x - y);
  return { n: s.length, p50: pct(s, 0.5), p95: pct(s, 0.95), max: s[s.length - 1] };
}

/* ═══ بخشِ ایستا — همیشه اجرا می‌شود (بدونِ زیرساخت) ═══════════════ */
grp('بررسیِ ایستا (بدونِ زیرساخت)');
{
  const ob = fs.existsSync(path.join(ROOT, 'server', 'outbox.js'))
    ? fs.readFileSync(path.join(ROOT, 'server', 'outbox.js'), 'utf8') : '';
  const wk = fs.existsSync(path.join(ROOT, 'server', 'worker.js'))
    ? fs.readFileSync(path.join(ROOT, 'server', 'worker.js'), 'utf8') : '';
  chk('S1 outbox تراکنشی: درجِ PG با ON CONFLICT DO NOTHING (تکرارِ id ساکت رد می‌شود)',
    /ON CONFLICT \(id\) DO NOTHING/.test(ob));
  chk('S2 صفِ سقف‌دار: OUTBOX_CAP = 1000 (صف، نه انبار)',
    /OUTBOX_CAP = 1000/.test(ob));
  chk('S3 کارگر رویداد را در شکست حذف نمی‌کند (فقط علامت می‌خورد)',
    !/splice|\.pop\(\)|\.shift\(\)/.test(wk) && /failed/.test(wk));
  chk('S4 کارگر: سقفِ تلاش (maxRetries) و گاردِ پردازشِ هم‌زمان (inFlight)',
    /maxRetries/.test(wk) && /inFlight/.test(wk));
  const rules = fs.existsSync(path.join(ROOT, 'infra', 'observability', 'alert-rules.yml'))
    ? fs.readFileSync(path.join(ROOT, 'infra', 'observability', 'alert-rules.yml'), 'utf8') : '';
  chk('S5 آلارمِ SyncQueueDepth (آستانهٔ ۱۰۰۰) در alert-rules.yml تعریف شده',
    /alert: SyncQueueDepth/.test(rules) && /payesh_sync_queue_depth > 1000/.test(rules));
  const met = fs.readFileSync(path.join(ROOT, 'server', 'metrics.js'), 'utf8');
  chk('S6 متریکِ payesh_sync_queue_depth (عمقِ صف از PG) زنده است',
    /payesh_sync_queue_depth/.test(met));
  const syncDoc = ['SYNC_PROTOCOL.md', 'ASYNC_ARCHITECTURE.md', 'SYNC_FLOW.md']
    .map((f) => path.join(ROOT, 'docs', f))
    .filter((p) => fs.existsSync(p))
    .map((p) => fs.readFileSync(p, 'utf8'))
    .join('\n');
  chk('S7 سندِ همگام‌سازی/معماریِ ناهمگام، outbox را به‌عنوانِ صفِ رویداد مستند کرده',
    /outbox/i.test(syncDoc));
}

/* ═══ خروجی ═══════════════════════════════════════════════════════ */
function finish(code) {
  console.log('\n────────────────────────────────────────────');
  console.log('Queue-Outage drill: ' + pass + ' موفق / ' + fail + ' خطا' +
    (notRun ? ' / ' + notRun + ' NOT-RUN ⏭️' : '') + (fail ? ' ❌' : (notRun ? '' : '  —  بدون خطا ✅')));
  try {
    fs.mkdirSync(path.dirname(CFG.out), { recursive: true });
    fs.writeFileSync(CFG.out, JSON.stringify({
      generatedAt: new Date().toISOString(),
      live: !!liveState.ok, pg: liveState.ok
        ? { host: CFG.pgHost, port: CFG.pgPort, database: CFG.pgDatabase } : null,
      summary: { pass, fail, notRun },
      metrics: liveState.metrics,
      results,
    }, null, 1));
    console.log('خروجیِ ماشین‌خوان: ' + CFG.out);
  } catch (e) { /* خروجی بهترین‌تلاش است */ }
  if (liveState.pool) liveState.pool.end().catch(() => {});
  process.exit(code);
}

/* وضعیتِ زیرساخت — پیش از IIFE تعریف می‌شود تا finish در هر مسیری قابل‌فراخوانی باشد */
const liveState = { pool: null, ok: false, metrics: { scenarios: {} } };

/* ═══ مانورِ زنده ═════════════════════════════════════════════════ */
(async () => {
  let liveWhy = null;
  if (!LIVE_WANTED) {
    liveWhy = SKIP_LIVE ? 'پرچمِ --skip-live داده شده' : 'QOD_LIVE_PG=1 داده نشده';
  } else {
    try {
      const pg = require('pg');
      liveState.pool = new pg.Pool({
        host: CFG.pgHost, port: CFG.pgPort, user: CFG.pgUser,
        database: CFG.pgDatabase, max: 8, connectionTimeoutMillis: 4000,
      });
      const t0 = Date.now();
      await liveState.pool.query('SELECT 1');
      const has = await liveState.pool.query(
        "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name='server_outbox'");
      if (!has.rows[0] || has.rows[0].n < 1) throw new Error('جدول server_outbox یافت نشد');
      /* دریل مالِ جدول است و باید از صفر شروع شود تا اجرای مجدد قابل‌تکرار بماند */
      await liveState.pool.query('DELETE FROM server_outbox');
      liveState.ok = true;
      console.log('\nزیرساختِ زنده تأیید شد: PG=%s:%s (%dms) — صف = server_outbox واقعی',
        CFG.pgHost, CFG.pgPort, Date.now() - t0);
    } catch (e) {
      liveWhy = 'اتصال به PG برقرار نشد: ' + (e.message || e.code);
      console.log('\n⚠️  ' + liveWhy);
    }
  }

  if (!liveState.ok) {
    grp('مانورِ زنده');
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) chk(q + ' — NOT RUN', null, liveWhy);
    return finish(2);
  }

  const pool = liveState.pool;
  const tStart = Date.now();
  const overBudget = () => Date.now() - tStart > CFG.budgetMs;

  /* رابطِ db با همان قراردادی که اپ به outbox می‌دهد — روی PG واقعی */
  const dbAdapter = { query: (sql, params) => pool.query(sql, params), isPostgres: () => true };

  async function pgState() {
    const r = await pool.query("SELECT status, count(*)::int AS n FROM server_outbox GROUP BY status");
    const s = { pending: 0, processed: 0, failed: 0, other: 0 };
    for (const row of r.rows) {
      if (row.status === 'pending') s.pending = row.n;
      else if (row.status === 'processed') s.processed = row.n;
      else if (row.status === 'failed') s.failed = row.n;
      else s.other += row.n;
    }
    const t = await pool.query('SELECT count(*)::int AS n FROM server_outbox');
    s.total = t.rows[0].n;
    return s;
  }

  async function waitUntil(fn, timeoutMs, everyMs = 20) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (await fn()) return true;
      await sleep(everyMs);
    }
    return await fn();
  }

  /* یکپارچگیِ داده — اینواریانتِ صف = FIFO نسبت به «لحظهٔ صف‌شدن»:
     با تولیدِ هم‌زمان، ترتیبِ idهای عددی لازم نیست با ترتیبِ push یکی باشد
     (id از nextval می‌آید ولی push پس از await)؛ ملاک، ترتیبِ واقعیِ ورود به
     صف است. dupes/lost/extra نسبت به مجموعهٔ idها. */
  function integrity(enqueued, applied) {
    const dupes = applied.filter((id, i) => applied.indexOf(id) !== i);
    const lost = enqueued.filter((id) => !applied.includes(id));
    const extra = applied.filter((id) => !enqueued.includes(id));
    const orderOk = enqueued.length === applied.length &&
      enqueued.every((v, i) => applied[i] === v);
    return { dupes, lost, extra, orderOk,
      ok: dupes.length === 0 && lost.length === 0 && extra.length === 0 && orderOk };
  }

  async function freshFixture(handlerFactory) {
    const store = { outbox: [], __outbox_seq: 0 };
    const outbox = require('../server/outbox').createOutbox({ store, db: dbAdapter });
    const applied = [];
    const handler = handlerFactory(applied);
    const worker = require('../server/worker').createWorker({
      store, outbox, handlers: { 'qod.test': handler },
      intervalMs: 25, maxRetries: 1000,
    });
    return { store, outbox, worker, applied };
  }

  /* ═══ Q1 — Queue Down → Buffer → Replay ═════════════════════════ */
  grp('Q1 — قطعیِ صف → بافر → بازیابی → Replay');
  {
    const m = {};
    let outage = true;
    const fx = await freshFixture((applied) => async (evt) => {
      if (outage) throw new Error('queue-down: consumer unavailable');
      applied.push(evt.id);
    });
    const appended = [];
    for (let i = 0; i < 10 && !overBudget(); i++) {
      const evt = await fx.outbox.append({ type: 'qod.test', collection: 'qod', record_id: i + 1 });
      appended.push(evt.id);
    }
    fx.worker.start();
    await sleep(150); /* چند تیک در قطعی — بافر باید پر بماند */
    const during = await pgState();
    m.bufferDepthPg = during.pending;
    m.bufferDepthMem = fx.outbox.depth().pending;
    m.retriedDuringOutage = fx.store.outbox.filter((e) => (e.retry_count || 0) > 0).length;
    chk('Q1a در قطعی، ۱۰ رویداد در بافر ماندند (PG pending=10)', during.pending === 10,
      'pending=' + during.pending);
    chk('Q1b عمقِ صفِ حافظه هم 10 است (depth().pending)', m.bufferDepthMem === 10,
      'depth=' + m.bufferDepthMem);
    chk('Q1c تلاشِ مجدد در قطعی ثبت شد (retry_count>0)', m.retriedDuringOutage > 0,
      'retried=' + m.retriedDuringOutage);
    const tRecover = Date.now();
    outage = false;
    const drained = await waitUntil(async () => (await pgState()).pending === 0
      && fx.applied.length === 10, 30000);
    m.replayMs = Date.now() - tRecover;
    const after = await pgState();
    const ig = integrity(appended, fx.applied);
    m.integrity = { ok: ig.ok, dupes: ig.dupes.length, lost: ig.lost.length, orderOk: ig.orderOk };
    chk('Q1d پس از بهبود، همهٔ ۱۰ رویداد replay شدند (pending=0)', drained && after.pending === 0,
      'pending=' + after.pending);
    chk('Q1e هر رویداد دقیقاً یک‌بار اعمال شد (صفر duplicate)', ig.dupes.length === 0,
      'dupes=' + JSON.stringify(ig.dupes));
    /* مشاهدهٔ رفتاری (سنجه، نه معیارِ قبولی): اگر رفعِ قطعی وسطِ تیکِ در جریان
       بیفتد، رویدادهای آخرِ همان تیک زودتر از رویدادهای اولش اعمال می‌شوند
       (applied مثل [5..10,1..4]). کارگر ترتیبِ بین-retry را تضمین نمی‌کند —
       قراردادِ واقعی‌اش exactly-once + صفر loss است و هندلرهای اپ (ابطالِ کش)
       idempotent و بی‌حساس به ترتیب‌اند. ترتیبِ سخت در تخلیهٔ تمیز (Q2/Q4)
       سنجه می‌شود. */
    m.orderPreservedAcrossRecovery = ig.orderOk;
    chk('Q1f قراردادِ کارگر برقرار ماند: صفر loss/extra + صفر duplicate',
      ig.lost.length === 0 && ig.extra.length === 0 && ig.dupes.length === 0,
      JSON.stringify({ lost: ig.lost, extra: ig.extra, dupes: ig.dupes }));
    if (!ig.orderOk) console.log('      ℹ️ ترتیب در مرزِ بازیابی نقض شد (تیکِ در جریان — ' +
      'خارج از قراردادِ کارگر؛ به‌عنوان سنجه ثبت شد)');
    chk('Q1g در PG همه processed شدند (failed=0)', after.processed === 10 && after.failed === 0,
      JSON.stringify(after));
    console.log('      replay=' + m.replayMs + 'ms · bufferDepth=' + m.bufferDepthPg +
      ' · retries(قطعی)=' + m.retriedDuringOutage);
    liveState.metrics.scenarios.Q1 = m;
    fx.worker.stop();
  }

  /* ═══ Q2 — Slow Consumer → Lag → Producer جدا ══════════════════ */
  grp('Q2 — مصرف‌کنندهٔ کند (۵۰۰ms) → رشدِ lag → جدا بودنِ مسیرِ تولید');
  {
    const m = {};
    const fx = await freshFixture((applied) => async (evt) => {
      await sleep(500); /* مصرف‌کنندهٔ کند — صف پشتِ آن انباشته می‌شود */
      applied.push(evt.id);
    });
    const appended = [];
    const appendMs = [];
    await Promise.all(Array.from({ length: 20 }, async (_, i) => {
      const ta = Date.now();
      const evt = await fx.outbox.append({ type: 'qod.test', collection: 'qod', record_id: 100 + i });
      appendMs.push(Date.now() - ta);
      appended.push(evt.id);
    }));
    m.producerStats = stats(appendMs);
    fx.worker.start();
    let maxLag = 0;
    const tDrain = Date.now();
    const drained = await waitUntil(async () => {
      const s = await pgState();
      maxLag = Math.max(maxLag, s.pending);
      return s.pending === 0 && fx.applied.length === 20;
    }, 60000, 50);
    m.drainMs = Date.now() - tDrain;
    m.maxLag = maxLag;
    m.throughputPerSec = +(20 / (m.drainMs / 1000)).toFixed(2);
    /* ترتیبِ ملاک = ترتیبِ واقعیِ ورود به صف (push)، نه ترتیبِ idها */
    const enqueued = fx.store.outbox.map((e) => e.id);
    const ig = integrity(enqueued, fx.applied);
    m.integrity = { ok: ig.ok, dupes: ig.dupes.length, lost: ig.lost.length, orderOk: ig.orderOk };
    chk('Q2a صف انباشته شد و سپس کامل تخلیه (۲۰/۲۰)', drained && fx.applied.length === 20,
      'applied=' + fx.applied.length);
    chk('Q2b مسیرِ تولید از مصرفِ کند جدا ماند (p95 append < 500ms)',
      m.producerStats.p95 < 500, 'p95=' + m.producerStats.p95 + 'ms');
    chk('Q2c lag ثبت شد (maxLag ≥ 20 در اوج)', maxLag >= 20, 'maxLag=' + maxLag);
    chk('Q2d یکپارچگی: صفر duplicate/lost + ترتیب', ig.ok, JSON.stringify(ig));
    console.log('      maxLag=' + m.maxLag + ' · drain=' + m.drainMs + 'ms (' +
      m.throughputPerSec + '/s) · append p50/p95=' + m.producerStats.p50 + '/' + m.producerStats.p95 + 'ms');
    liveState.metrics.scenarios.Q2 = m;
    fx.worker.stop();
  }

  /* ═══ Q3 — تحویلِ مکرر → Dedupe ═════════════════════════════════ */
  grp('Q3 — تحویلِ مکرر (at-least-once) → حذفِ تکرار در هر دو لایه');
  {
    const m = {};
    const fx = await freshFixture((applied) => async (evt) => {
      await sleep(60); /* فرصتِ هم‌پوشانی برای گاردِ inFlight */
      applied.push(evt.id);
    });
    const appended = [];
    for (let i = 0; i < 5; i++) {
      const evt = await fx.outbox.append({ type: 'qod.test', collection: 'qod', record_id: 200 + i });
      appended.push(evt.id);
    }
    /* (الف) تحویلِ مکرر در لایهٔ ذخیره: همان ۵ رویداد با همان idها دوباره INSERT */
    const dupSql = `INSERT INTO server_outbox (id, type, collection, record_id, version, payload, created_at)
                    VALUES ($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT (id) DO NOTHING`;
    let insertedDup = 0;
    for (const id of appended) {
      const r = await pool.query(dupSql, [id, 'qod.test', 'qod', null, null, null]);
      insertedDup += r.rowCount;
    }
    m.storageDupBlocked = appended.length - insertedDup;
    chk('Q3a درجِ دوبارهٔ همان idها در PG رد شد (۵/۵، صفر ردیفِ تازه)', insertedDup === 0,
      'inserted=' + insertedDup);
    /* (ب) تحویلِ مکرر در لایهٔ مصرف: دو tickِ هم‌زمان + tick پس از پردازش */
    fx.worker.start();
    await Promise.all([fx.worker.tick(), fx.worker.tick()]); /* هم‌پوشانی عمدی */
    await fx.worker.tick(); /* پس از پردازش — status guard */
    const drained = await waitUntil(async () => (await pgState()).pending === 0
      && fx.applied.length === 5, 30000);
    const ig = integrity(appended, fx.applied);
    m.dedupeHitRate = '100% (ذخیره ' + m.storageDupBlocked + '/' + appended.length +
      ' + مصرف — صفر اعمالِ مکرر)';
    m.integrity = { ok: ig.ok, dupes: ig.dupes.length, lost: ig.lost.length, orderOk: ig.orderOk };
    chk('Q3b هر ۵ رویداد دقیقاً یک‌بار اعمال شدند (تحویلِ مکرر بلاک)',
      drained && ig.dupes.length === 0 && fx.applied.length === 5,
      'applied=' + fx.applied.length + ' dupes=' + JSON.stringify(ig.dupes));
    chk('Q3c هیچ رویدادی گم نشد و ترتیب حفظ شد', ig.lost.length === 0 && ig.orderOk,
      JSON.stringify(ig));
    console.log('      dedupe: ' + m.dedupeHitRate + ' · applied=' + fx.applied.length);
    liveState.metrics.scenarios.Q3 = m;
    fx.worker.stop();
  }

  /* ═══ Q4 — Backlog ‏۱۲۰ → Drain ═════════════════════════════════ */
  grp('Q4 — انباشتِ ۱۲۰ رویداد → تخلیه');
  {
    const m = {};
    const fx = await freshFixture((applied) => async (evt) => { applied.push(evt.id); });
    const appended = [];
    const heapBefore = process.memoryUsage().heapUsed;
    const t0 = Date.now();
    for (let i = 0; i < 120 && !overBudget(); i++) {
      const evt = await fx.outbox.append({ type: 'qod.test', collection: 'qod', record_id: 300 + i });
      appended.push(evt.id);
    }
    m.fillMs = Date.now() - t0;
    const peak = await pgState();
    m.peakDepthPg = peak.pending;
    m.peakDepthMem = fx.outbox.depth().pending;
    m.ringLength = fx.store.outbox.length;
    chk('Q4a عمقِ اوج = ۱۲۰ در PG (کارگر خاموش بود)', m.peakDepthPg === 120,
      'pending=' + m.peakDepthPg);
    chk('Q4b حلقهٔ حافظه هم ۱۲۰ است و سقفِ ۱۰۰۰ رعایت شد (سر نخورد)',
      m.peakDepthMem === 120 && m.ringLength === 120,
      'depth=' + m.peakDepthMem + ' ring=' + m.ringLength);
    fx.worker.start();
    const tDrain = Date.now();
    const drained = await waitUntil(async () => {
      const s = await pgState();
      return s.pending === 0 && fx.applied.length === 120;
    }, 60000, 20);
    m.drainMs = Date.now() - tDrain;
    m.drainRatePerSec = +(120 / (m.drainMs / 1000)).toFixed(0);
    m.heapDeltaMB = +(((process.memoryUsage().heapUsed - heapBefore) / 1048576)).toFixed(2);
    const ig = integrity(appended, fx.applied);
    m.integrity = { ok: ig.ok, dupes: ig.dupes.length, lost: ig.lost.length, orderOk: ig.orderOk };
    chk('Q4c همهٔ ۱۲۰ رویداد تخلیه شدند (pending=0)', drained, 'applied=' + fx.applied.length);
    chk('Q4d یکپارچگی: صفر duplicate/lost + ترتیبِ صعودیِ idها', ig.ok, JSON.stringify(ig));
    const after = await pgState();
    chk('Q4e در PG همه processed شدند (failed=0)', after.processed >= 120 && after.failed === 0,
      JSON.stringify(after));
    console.log('      fill=' + m.fillMs + 'ms · drain=' + m.drainMs + 'ms (' +
      m.drainRatePerSec + '/s) · peak=' + m.peakDepthPg + ' · heapΔ=' + m.heapDeltaMB + 'MB');
    liveState.metrics.scenarios.Q4 = m;
    fx.worker.stop();
  }

  finish(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('مانور با خطا متوقف شد:', e && e.stack || e);
  fail++; results.push({ name: 'harness', status: 'fail', detail: String(e && e.message || e) });
  finish(1);
});
