#!/usr/bin/env node
/* رگرسیون S2-1 (باگ‌هانت چت ۵، نشست ۲، موج ۴): ادعایِ اتمیکِ uid.
   ─────────────────────────────────────────────────────────────
   بررسیِ idempotency در حلقهٔ اعتبارسنجی بود ولی ثبتِ علامت در حلقهٔ
   apply (بعدتر، بدونِ بازبینی): تکراریِ درونِ یک دسته همیشه دو بار اعمال
   می‌شد و دو دستهٔ هم‌زمان با uid یکسان مسابقه می‌دادند (هر دو ok).
   حالا ادعا در حلقهٔ apply (بدونِ await → اتمیکِ درون‌فرآیند) انجام
   می‌شود و تکراری `duplicate_ignored` می‌گیرد.
   باقی‌ماندهٔ ثبت‌شده: ادعایِ توزیع‌شده (دو نمونه هم‌زمان) کار Wave 6 است.
   اجرا: node tests/sync-dup-claim.js (بدونِ سرور/پورت) */
'use strict';
const { createSync, attach } = require('../server/sync.js');
const { opX } = require('./helpers/opx');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

function makeCtx() {
  const store = {
    announcements: [],
    users: [{ id: 5, role: 'manager', school_id: 1 }],
    __processed_uids: {}, __server_version: 0
  };
  const mirrored = [];
  const ctx = {
    store,
    db: {
      persistOpsBatch: async (ops) => { mirrored.push(...ops); return { ok: true }; },
      isUidProcessed: async () => false
    },
    MAX_BATCH: 500, AT_DRIFT_MS: 24 * 3600 * 1000,
    audit: () => {},
    sessionFrom: () => ({ id: 5, role: 'manager', school_id: 1 }),
    sendJson: (res, code, body) => { res._cap = { code, body }; },
    markDirty: () => {}
  };
  attach(store);
  return { ctx, store, mirrored };
}
const mk = (uid, n) => opX({
  uid, by: 5, collection: 'announcements', type: 'ins',
  user_id: 5, school_id: 1, data: { school_id: 1, title: 'T' + n }
});

(async () => {
  console.log('\n▸ S2-1 — uid فقط یک بار اعمال می‌شود');

  /* ── ۱) تکراریِ درونِ یک دسته ── */
  {
    const { ctx, store, mirrored } = makeCtx();
    const res = {};
    await createSync(ctx).apiSync({}, res, { ops: [mk('dup-1', 1), mk('dup-1', 2)] });
    const rs = (res._cap.body || {}).results || [];
    chk('D1 فقط یک رکورد ساخته شد', store.announcements.length === 1, 'n=' + store.announcements.length);
    chk('D2 اولی ok و دومی duplicate_ignored',
      rs.length === 2 && rs[0].ok === true && !rs[0].code && rs[1].ok === true && rs[1].code === 'duplicate_ignored',
      JSON.stringify(rs));
    chk('D3 آینه فقط یک بار', mirrored.filter((m) => m.uid === 'dup-1').length === 1, 'n=' + mirrored.length);
    chk('D4 نسخهٔ سرور فقط یک بار چرخید', store.__server_version === 1, 'v=' + store.__server_version);
  }

  /* ── ۲) مسابقهٔ نامتقارنِ دو دستهٔ هم‌زمان ── */
  {
    const { ctx, store } = makeCtx();
    const s = createSync(ctx);
    const rA = {}, rB = {};
    await Promise.all([
      s.apiSync({}, rA, { ops: [mk('race-2', 1), mk('other-9', 9)] }),
      s.apiSync({}, rB, { ops: [mk('race-2', 2)] })
    ]);
    const titles = store.announcements.map((a) => a.title).sort().join(',');
    chk('D5 مسابقه: race-2 فقط یک بار (۲ رکورد در کل)', store.announcements.length === 2, titles);
    const codes = [rA._cap.body.results[0], rB._cap.body.results[0]].map((r) => r.code || 'ok').sort().join('+');
    chk('D6 یکی ok و دیگری duplicate_ignored', codes === 'duplicate_ignored+ok',
      JSON.stringify([rA._cap.body.results[0], rB._cap.body.results[0]]));
  }

  /* ── ۳) ارسالِ مجددِ ترتیبی (رفتارِ موجود — نباید بشکند) ── */
  {
    const { ctx, store } = makeCtx();
    const s = createSync(ctx);
    const r1 = {}, r2 = {};
    await s.apiSync({}, r1, { ops: [mk('seq-1', 1)] });
    await s.apiSync({}, r2, { ops: [mk('seq-1', 1)] });
    chk('D7 ارسالِ مجدد duplicate_ignored و بدونِ رکوردِ اضافه',
      store.announcements.length === 1 && r2._cap.body.results[0].code === 'duplicate_ignored');
  }

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
