#!/usr/bin/env node
/* رگرسیون SUSPECT-C (باگ‌هانت چت ۵، نشست ۲): خطاهایِ ثبتِ idempotency و
   ابطالِ کش در حلقهٔ apply سینک با `.catch(()=>{})` بلعیده می‌شد —
   در تولید (با گاردهای BUG-2) این خطاها واقعی‌اند و باید دیده شوند.
   رفتارِ پاسخ بی‌تغییر می‌ماند (۲۰۰ + ok)؛ فقط audit اضافه می‌شود.
   اجرا: node tests/sync-cache-errors.js (بدونِ سرور/پورت — درون‌فرآیندی) */
'use strict';
const { createSync, attach } = require('../server/sync.js');
const cache = require('../server/cache.js');
const { opX } = require('./helpers/opx');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

function makeCtx(dbFake, audits) {
  const store = {
    announcements: [],
    users: [{ id: 5, role: 'manager', school_id: 1, full_name: 'M' }],
    __processed_uids: {}, __server_version: 0
  };
  return {
    ctx: {
      store, db: dbFake, MAX_BATCH: 500, AT_DRIFT_MS: 24 * 3600 * 1000,
      audit: (ev, d) => audits.push({ ev, d }),
      sessionFrom: () => ({ id: 5, role: 'manager', school_id: 1 }),
      sendJson: (res, code, body) => { res._cap = { code, body }; },
      markDirty: () => {}
    },
    store
  };
}
const mkOp = (uid) => opX({
  uid, by: 5, collection: 'announcements', type: 'ins',
  user_id: 5, school_id: 1, data: { school_id: 1, title: 'اعلان ' + uid }
});
const memDb = () => ({
  persistOpsBatch: async (ops) => ({ ok: true, driver: 'memory', count: ops.length }),
  isUidProcessed: async () => false
});
const flush = () => new Promise((r) => setImmediate(r));

(async () => {
  console.log('\n▸ SUSPECT-C — خطاهای کش در apply سینک audit می‌شوند');

  /* ── ۱) مسیرِ خراب: هر دو خطا audit می‌شوند، پاسخ بی‌تغییر ── */
  const origMark = cache.markProcessedUid;
  const origInv = cache.invalidateCollection;
  cache.markProcessedUid = async () => { throw new Error('redis-cmd-boom'); };
  cache.invalidateCollection = async () => { throw new Error('redis-pub-boom'); };
  try {
    const audits = [];
    const { ctx, store } = makeCtx(memDb(), audits);
    attach(store);
    const sync = createSync(ctx);
    const res = {};
    await sync.apiSync({}, res, { ops: [mkOp('cerr-1')] });
    await flush();
    const cap = res._cap || {};
    chk('C1 پاسخ هنوز ۲۰۰ و ok (رفتار حفظ شده)', cap.code === 200 && cap.body
      && cap.body.results.length === 1 && cap.body.results[0].ok === true,
      JSON.stringify(cap.body && cap.body.results));
    chk('C2 رکورد در store اعمال شده', store.announcements.length === 1);
    chk('C3 علامتِ حافظه‌ایِ uid خورده (idempotency درون‌نمونه)', !!store.__processed_uids['cerr-1']);
    const m = audits.find((a) => a.ev === 'sync_idempotency_mark_failed');
    chk('C4 خطای mark audit شد', !!m && m.d && m.d.uid === 'cerr-1'
      && /boom/.test(String(m.d.error || '')), JSON.stringify(audits.map((a) => a.ev)));
    const v = audits.find((a) => a.ev === 'sync_invalidate_failed');
    chk('C5 خطای invalidate audit شد', !!v && v.d && v.d.collection === 'announcements'
      && /boom/.test(String(v.d.error || '')));
  } finally {
    cache.markProcessedUid = origMark;
    cache.invalidateCollection = origInv;
  }

  /* ── ۲) شاهد: مسیرِ سالم auditِ اضافه ندارد ── */
  {
    const audits = [];
    const { ctx } = makeCtx(memDb(), audits);
    attach(ctx.store);
    const sync = createSync(ctx);
    const res = {};
    await sync.apiSync({}, res, { ops: [mkOp('cok-1')] });
    await flush();
    const cap = res._cap || {};
    chk('C6 مسیرِ سالم ۲۰۰ و ok', cap.code === 200 && cap.body && cap.body.results[0].ok === true);
    chk('C7 در مسیرِ سالم auditِ خطای کش نیست',
      !audits.some((a) => a.ev === 'sync_idempotency_mark_failed' || a.ev === 'sync_invalidate_failed'),
      JSON.stringify(audits.map((a) => a.ev)));
  }

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
