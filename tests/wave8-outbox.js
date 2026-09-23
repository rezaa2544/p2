#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave8-outbox.js — ویو ۸: صندوق رویدادها + کارگر
   ───────────────────────────────────────────────────────────────────
   بدون نیاز به سرورِ واقعی — ماژول‌ها مستقیم با فروشگاهِ جعلی:

   O1  ثبت رویداد با چرخهٔ عمر (pending / retry_count / processed_at)
   O2  کارگر رویداد را پردازش و 'processed' می‌کند؛ پردازشِ دوباره ندارد
   O3  شکست ⇒ تلاش مجدد + شمارنده؛ پس از سقف ⇒ 'failed'؛ رویداد حذف نمی‌شود
   O4  رویداد بدون هندلر دست نمی‌خورد
   O5  مسیر واقعی: حذف با سنگ‌قبر ⇒ رویداد با مهارِ مدرسه ⇒ باطل‌شدن کش
   O6  آینهٔ پستگرس: درج و به‌روزرسانیِ وضعیت با دی‌بیِ جعلی
   O7  سقف ۱۰۰۰ رویداد حفظ شده است (رفتار پیشین)
   اجرا:  node tests/wave8-outbox.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { createOutbox } = require(path.join(ROOT, 'server', 'outbox.js'));
const { createWorker } = require(path.join(ROOT, 'server', 'worker.js'));
const { createDeleteService } = require(path.join(ROOT, 'server', 'delete-service.js'));

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 200) : '')); }
}

async function main() {
  console.log('\n▸ ویو ۸ — صندوق رویدادها و کارگر');

  /* O1 — ثبت با چرخهٔ عمر */
  {
    const store = {};
    const outbox = createOutbox({ store });
    const evt = await outbox.append({ type: 'sms.dispatch', collection: 'notify_queue', record_id: 7, payload: { school_id: 1 } });
    chk('O1 ثبت رویداد با وضعیت اولیهٔ کامل',
      evt.status === 'pending' && evt.retry_count === 0 && evt.processed_at === null
      && evt.id === 1 && evt.payload.school_id === 1 && store.outbox.length === 1);
  }

  /* O2 — پردازش و ایدمپوتانس */
  {
    const store = {};
    const outbox = createOutbox({ store });
    let calls = 0;
    await outbox.append({ type: 'demo.job', payload: { n: 1 } });
    const worker = createWorker({ store, outbox, handlers: { 'demo.job': async () => { calls++; } }, maxRetries: 3 });
    await worker.tick();
    await worker.tick(); /* دور دوم نباید دوباره پردازش کند */
    const evt = store.outbox[0];
    chk('O2 پردازش شد، دوباره پردازش نشد',
      calls === 1 && evt.status === 'processed' && !!evt.processed_at && evt.retry_count === 0);
  }

  /* O3 — شکست، تلاش مجدد، سپس 'failed' — بدون حذف رویداد */
  {
    const store = {};
    const outbox = createOutbox({ store });
    await outbox.append({ type: 'flaky.job' });
    const worker = createWorker({ store, outbox, handlers: { 'flaky.job': async () => { throw new Error('boom'); } }, maxRetries: 2 });
    await worker.tick();
    const e1 = store.outbox[0] || {};
    chk('O3a شکست اول: شمارنده ۱، هنوز در صف', e1.retry_count === 1 && e1.status === 'pending' && e1.last_error === 'boom');
    await worker.tick();
    const e2 = store.outbox[0] || {};
    /* قرارداد B3/B4 به‌روزشده (Arena 1 + فیکس F-A5): پس از سقف تلاش ⇒
       انتقال copy به DLQ و وضعیت مبدأ `dead_letter` (همان‌چه moveToDlq و
       پروب زندهٔ failover می‌سازند) و retry_count نهایی = شمار واقعی تلاش‌ها
       (که پیش‌تر در مسیر DLQ گم می‌شد): t1: pending/1، t2: dead_letter/2 + DLQ،
       t3: بدون پردازشِ مجدد. */
    chk('O3b شکست دوم: شمارنده ۲ و سقفِ تلاش ⇒ dead_letter', e2.retry_count === 2 && e2.status === 'dead_letter');
    const dlq0 = (store.outbox_dlq || [])[0] || {};
    chk('O3b2 کپیِ رویدادِ مسموم در DLQ ثبت شد', store.outbox_dlq && store.outbox_dlq.length === 1 && dlq0.error_message === 'boom');
    await worker.tick();
    const e3 = store.outbox[0] || {};
    chk('O3c پس از سقف تلاش: وضعیت dead_letter می‌ماند و دوباره تلاش نمی‌شود', e3.retry_count === 2 && e3.status === 'dead_letter');
    chk('O3d رویداد با وجود شکست حذف نشد (داده نمی‌میرد)', store.outbox.length === 1 && (store.outbox[0] || {}).id === e3.id);
    await worker.tick();
    chk('O3e رویداد failed دیگر پردازش نمی‌شود', (store.outbox[0] || {}).retry_count === 2);
  }

  /* O4 — بدون هندلر: دست نمی‌خورد */
  {
    const store = {};
    const outbox = createOutbox({ store });
    await outbox.append({ type: 'other.consumer' });
    const worker = createWorker({ store, outbox, handlers: { 'demo.job': async () => {} } });
    await worker.tick();
    const evt = store.outbox[0];
    chk('O4 رویداد بدون هندلر دست نخورد', evt.status === 'pending' && evt.retry_count === 0);
  }

  /* O5 — مسیر واقعی: حذف ⇒ رویداد با مهار مدرسه ⇒ کش باطل می‌شود */
  {
    const store = { users: [{ id: 5, school_id: 3, role: 'student', full_name: 'تست', version: 1 }], tombstones: [] };
    const outbox = createOutbox({ store });
    const deleter = createDeleteService({ store, markDirty: () => {}, outbox });
    const invalidated = [];
    const fakeCache = { invalidateCollection: async (coll, sid) => { invalidated.push([coll, sid]); } };
    const worker = createWorker({
      store, outbox,
      handlers: {
        '*.deleted': async (evt) => {
          const sid = evt.payload && evt.payload.school_id;
          if (sid != null) await fakeCache.invalidateCollection(evt.collection, sid);
        }
      }
    });
    const res = await deleter.softDelete('users', { id: 5 }, { actor: { id: 2 } });
    chk('O5a حذف نرم انجام شد و رویداد با مهار مدرسه ثبت شد',
      res.ok === true && store.outbox.length === 1 && store.outbox[0].payload.school_id === 3);
    await worker.tick();
    chk('O5b کارگر کشِ مدرسهٔ رکوردِ حذف‌شده را باطل کرد',
      invalidated.length === 1 && invalidated[0][0] === 'users' && invalidated[0][1] === 3
      && store.outbox[0].status === 'processed');
  }

  /* O6 — آینهٔ پستگرس با دی‌بی جعلی */
  {
    const queries = [];
    const fakeDb = {
      isPostgres: () => true,
      query: async (sql, params) => { queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params }); }
    };
    const store = {};
    const outbox = createOutbox({ store, db: fakeDb });
    const evt = await outbox.append({ type: 'demo.job', collection: 'x', record_id: 9 });
    const ins = queries.find(q => q.sql.indexOf('INSERT INTO server_outbox') === 0);
    chk('O6a درج در آینهٔ پستگرس', !!ins && ins.params[0] === evt.id && ins.params[1] === 'demo.job');
    await outbox.mark(evt.id, { status: 'processed', processed_at: new Date().toISOString() });
    const upd = queries.find(q => q.sql.indexOf('UPDATE server_outbox SET status') === 0);
    chk('O6b به‌روزرسانی وضعیت در آینه', !!upd && upd.params[1] === 'processed' && upd.params[0] === evt.id);
    /* دی‌بی خراب ⇒ هیچ کرشی؛ اسنپ‌شات منبع حقیقت می‌ماند */
    const badDb = { isPostgres: () => true, query: async () => { throw new Error('db down'); } };
    const store2 = {};
    const ob2 = createOutbox({ store: store2, db: badDb });
    const e2 = await ob2.append({ type: 'demo.job' });
    await ob2.mark(e2.id, { status: 'processed' });
    chk('O6c خرابی آینه ⇒ رفتار عادی (منبع حقیقت اسنپ‌شات)', store2.outbox[0].status === 'processed');
  }

  /* O7 — سقف صف */
  {
    const store = {};
    const outbox = createOutbox({ store });
    for (let i = 0; i < 1005; i++) await outbox.append({ type: 'cap.test', n: i });
    chk('O7 سقف ۱۰۰۰ رویداد حفظ شده', store.outbox.length === outbox.cap && store.outbox[0].n === 5);
  }

  const total = pass + fail;
  console.log('────────────────────────────────────────────────────');
  console.log(`ویو ۸ — اوت‌باکس: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
