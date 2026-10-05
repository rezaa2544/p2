#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   tools/m15-outbox-capacity.js — N-36 §۹
   ─────────────────────────────────────────────────────────────────
   اندازه‌گیریِ واقعیِ ظرفیتِ مسیرِ دوام‌دار روی PG زنده.

   ادعای national-scale بدونِ measurement ممنوع است — این ابزار
   اعدادِ واقعی را از PG برمی‌دارد: produce throughput، consume
   throughput، عمقِ backlog تحتِ فشار، تأخیر، و رفتارِ retention.

   اجرا:  N36_TEST_DATABASE_URL=postgres://... node tools/m15-outbox-capacity.js
   ═════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
process.chdir(ROOT);

const DSN = process.env.N36_TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!DSN) { console.error('❌ N36_TEST_DATABASE_URL required — no measurement without live PG'); process.exit(1); }

const { Pool } = require('pg');
const { createOutbox } = require('../server/outbox.js');
const { createWorker } = require('../server/worker.js');
const cacheEvents = require('../server/cache-invalidation-events.js');

function makePgDb(pool) {
  return {
    isPostgres: () => true,
    query: async (sql, params) => { const r = await pool.query(sql, params || []); return { rows: r.rows, rowCount: r.rowCount }; }
  };
}

(async () => {
  const pool = new Pool({ connectionString: DSN });
  await pool.query('select 1');
  console.log('● PG زنده وصل شد');

  const TAG = 'n36-cap-' + Date.now();
  const prevInst = process.env.PAYESH_INSTANCE_ID;
  process.env.PAYESH_INSTANCE_ID = 'P-' + TAG;
  const outbox = createOutbox({ store: {}, db: makePgDb(pool) });
  if (prevInst === undefined) delete process.env.PAYESH_INSTANCE_ID; else process.env.PAYESH_INSTANCE_ID = prevInst;

  const calls = [];
  const worker = createWorker({
    store: {}, outbox, maxRetries: 3,
    handlers: {
      'cache.user_changed': async (e) => { calls.push(Number(e.payload.user_id)); },
      'cache.school_changed': async (e) => { calls.push(Number(e.payload.school_id)); }
    }
  });

  /* ── ۱) Produce throughput ── */
  const N = Number(process.env.N36_CAP_N || 500);
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    await cacheEvents.appendDurable(outbox, cacheEvents.userChanged(7000 + i, 1, 1, 'rest'));
  }
  const produceMs = Date.now() - t0;
  const produceRps = Math.round((N / produceMs) * 1000);
  console.log(`\n■ Produce: ${N} رویداد در ${produceMs}ms ⇒ ${produceRps} رویداد/ثانیه`);

  /* ── ۲) Consume throughput (batch پیش‌فرض ۵۰) ── */
  const d0 = await outbox.replicateBacklog();
  const t1 = Date.now();
  let ticks = 0;
  for (;;) {
    await worker.tickReplicate(); ticks++;
    const d = await outbox.replicateBacklog();
    if (d.depth === 0 || ticks > 200) break;
  }
  const consumeMs = Date.now() - t1;
  const consumeRps = Math.round((N / consumeMs) * 1000);
  console.log(`■ Consume: ${N} رویداد در ${consumeMs}ms (${ticks} tick) ⇒ ${consumeRps} رویداد/ثانیه`);
  console.log(`■ Batch اندازهٔ واقعی هر tick: ~${Math.min(50, N)}`);

  /* ── ۳) تأخیرِ end-to-end در حالتِ تک‌رویداد ── */
  const t2 = Date.now();
  await cacheEvents.appendDurable(outbox, cacheEvents.schoolChanged('bench', 9001, 1, 1, 'rest'));
  for (let i = 0; i < 100; i++) {
    await worker.tickReplicate();
    if (calls.indexOf(9001) > -1) break;
  }
  console.log(`■ Latency تک‌رویداد: ${Date.now() - t2}ms`);

  /* ── ۴) پشتِ فشار: backlog وقتی کارگر کندتر از تولیدکننده است ── */
  const BURST = Number(process.env.N36_CAP_BURST || 300);
  const t3 = Date.now();
  for (let i = 0; i < BURST; i++) await cacheEvents.appendDurable(outbox, cacheEvents.userChanged(8000 + i, 1, 1, 'rest'));
  const burstMs = Date.now() - t3;
  const dPeak = await outbox.replicateBacklog();
  console.log(`■ Backlog بعد از ${BURST} تولیدِ متوالی: depth=${dPeak.depth} oldest=${dPeak.oldest ? String(dPeak.oldest).slice(0, 19) : 'null'} (تولید در ${burstMs}ms)`);

  /* ── ۵) Retention: reapProcessed ── */
  /* همه را processed کن */
  for (let i = 0; i < 300; i++) await worker.tickReplicate();
  const afterDrain = await outbox.replicateBacklog();
  const rowC = await pool.query("select status, count(*)::int as n from server_outbox where type like 'cache.%' group by status");
  console.log(`■ وضعیتِ صف بعد از drain: ${JSON.stringify(rowC.rows)} depth=${afterDrain.depth}`);

  /* reap با age=0 یعنی هر processedِ قدیمی‌تر از حالا حذف شود */
  const reaped = await outbox.reapProcessed(0);
  const rowC2 = await pool.query("select status, count(*)::int as n from server_outbox where type like 'cache.%' group by status");
  console.log(`■ Retention reap(age=0): ${reaped} ردیف حذف شد؛ وضعیتِ پس از آن: ${JSON.stringify(rowC2.rows)}`);

  /* ── ۶) cleanup ── */
  await pool.query('delete from server_outbox where type like $1', ['cache.%']);
  await pool.query('delete from server_outbox_watermark where instance_id like $1', ['P-' + TAG + '%']);
  await pool.end();
  console.log('\n● اندازه‌گیری تمام شد. این اعداد برای این ماشینِ واحد هستند — scale-up نیاز به benchmark روی سخت‌افزارِ production دارد.');
})().catch(e => { console.error('FATAL', e.message); console.error(e.stack); process.exit(2); });
