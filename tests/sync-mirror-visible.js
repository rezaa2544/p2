#!/usr/bin/env node
/* رگرسیون SUSPECT-A (باگ‌هانت چت ۵، نشست ۲): شکستِ آینهٔ PG پیش‌تر برایِ
   کلاینت کاملاً نامرئی بود (۲۰۰ + ok، فقط audit سمت سرور) — در حالی که
   خوانش‌های PG و حافظه پس از آن ناهمگام‌اند. حالا پاسخ پرچمِ
   `mirror_failed` می‌گیرد (ok همچنان true — سازگاری) تا کلاینت/اپراتور
   ناهمگامی را ببیند. برشِ تراکنشیِ کامل همچنان کار Wave 1 است.
   اجرا: node tests/sync-mirror-visible.js (بدونِ سرور/پورت) */
'use strict';
const { createSync, attach } = require('../server/sync.js');
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
const mkOps = (tag) => [1, 2].map((i) => opX({
  uid: tag + '-' + i, by: 5, collection: 'announcements', type: 'ins',
  user_id: 5, school_id: 1, data: { school_id: 1, title: tag + ' واحد ' + i }
}));

(async () => {
  console.log('\n▸ SUSPECT-A — شکستِ آینهٔ PG برای کلاینت مرئی است');

  /* ── ۱) مسیرِ خراب: پرچم + سازگاری ── */
  {
    const audits = [];
    const { ctx, store } = makeCtx({
      persistOpsBatch: async () => { throw new Error('pg down'); },
      isUidProcessed: async () => false
    }, audits);
    attach(store);
    const sync = createSync(ctx);
    const res = {};
    await sync.apiSync({}, res, { ops: mkOps('mv') });
    const cap = res._cap || {};
    chk('M1 پاسخ هنوز ۲۰۰ و هر op ـok (سازگاری)', cap.code === 200 && cap.body
      && cap.body.results.length === 2 && cap.body.results.every((r) => r.ok === true));
    chk('M2 پرچم mirror_failed در پاسخ هست', !!(cap.body && cap.body.mirror_failed === true),
      JSON.stringify(Object.keys((cap.body || {}))));
    chk('M3 رکوردها در حافظه اعمال شده ماندند', store.announcements.length === 2);
    chk('M4 شکست audit شد (sync_mirror_failed)',
      audits.some((a) => a.ev === 'sync_mirror_failed' && a.d && a.d.ops === 2));
  }

  /* ── ۲) شاهد: مسیرِ سالم پرچم ندارد (شکلِ بایت‌به‌بایتِ قبلی) ── */
  {
    const audits = [];
    const { ctx } = makeCtx({
      persistOpsBatch: async (ops) => ({ ok: true, driver: 'memory', count: ops.length }),
      isUidProcessed: async () => false
    }, audits);
    attach(ctx.store);
    const sync = createSync(ctx);
    const res = {};
    await sync.apiSync({}, res, { ops: mkOps('mok') });
    const cap = res._cap || {};
    chk('M5 مسیرِ سالم ۲۰۰ و ok', cap.code === 200 && cap.body && cap.body.results.every((r) => r.ok === true));
    chk('M6 در مسیرِ سالم کلیدِ mirror_failed نیست',
      cap.body && !('mirror_failed' in cap.body), JSON.stringify(Object.keys((cap.body || {}))));
  }

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
