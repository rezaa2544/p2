#!/usr/bin/env node
/* رگرسیون S2-2 (باگ‌هانت چت ۵، نشست ۲، موج ۴): ردِّ پایِ اتکایِ روزِ مجازی
   به ساعتِ ادعاییِ کلاینت.
   ─────────────────────────────────────────────────────────────
   تصمیمِ «مجاز» برایِ assets (و عملاً فقط آن) می‌تواند بر op.atِ کلاینت
   تکیه کند؛ op.atِ عقب‌کشیده (<۲۴h) هم گارد را دور می‌زد هم auditِ skew
   را — کاملاً نامرئی. مشروعیتِ آفلاین ایجاب می‌کند op.at پذیرفته شود،
   پس رفع، «بلوکه» نیست بلکه «ردِّ پا»ست: وقتی اجازه بر تاریخِ ادعاییِ
   متفاوت از امروزِ سرور تکیه کرد و امروزِ سرور مجازی بود (یعنی واگرایی
   در تصمیم مؤثر بود)، رویدادِ sync_virtual_day_offline_allow ثبت می‌شود.
   رفتارِ مجاز/مسدود بی‌تغییر. (بستنِ کاملِ جعل نیازمندِ تصمیمِ محصول/
   Wave است — در گزارش ثبت شده.)
   اجرا: node tests/sync-virtualday-audit.js (بدونِ سرور/پورت) */
'use strict';
const { createSync, attach } = require('../server/sync.js');
const { opX } = require('./helpers/opx');

const TODAY = new Date().toISOString().slice(0, 10);
/* «دیروزِ» قطعی: ظهرِ UTCِ دیروز — برخلافِ `now - 14h` که بسته به ساعتِ اجرا
   ممکن است هنوز «امروز» باشد و تست را وابسته به زمان می‌کرد (flake). */
const BACKDATED = (() => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() - 1, 12, 0, 0)).toISOString();
})();

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

function makeCtx(virtualDates) {
  const store = {
    assets: [{ id: 1, school_id: 1, status: 'available', title: 'A' }],
    attendance_modes: (virtualDates || []).map((d) => ({ school_id: 1, date: d, mode: 'virtual' })),
    users: [{ id: 5, role: 'manager', school_id: 1 }],
    __processed_uids: {}, __server_version: 0
  };
  const audits = [];
  const ctx = {
    store,
    db: { persistOpsBatch: async () => ({ ok: true }), isUidProcessed: async () => false },
    MAX_BATCH: 500, AT_DRIFT_MS: 24 * 3600 * 1000,
    audit: (ev, d) => audits.push({ ev, d }),
    sessionFrom: () => ({ id: 5, role: 'manager', school_id: 1 }),
    sendJson: (res, code, body) => { res._cap = { code, body }; },
    markDirty: () => {}
  };
  attach(store);
  return { ctx, store, audits };
}
function mkUpd(uid, at) {
  const o = opX({
    uid, by: 5, collection: 'assets', type: 'upd',
    user_id: 5, school_id: 1, id: 1, data: { id: 1, status: 'in_use' }
  });
  o.at = at;
  return o;
}
const evs = (audits) => audits.map((a) => a.ev);

(async () => {
  console.log('\n▸ S2-2 — اتکایِ روزِ مجازی به op.at ردِّ پا دارد');

  /* ── ۱) پینِ رفتارِ موجود: صادقانه مسدود می‌شود ── */
  {
    const { ctx, audits } = makeCtx([TODAY]);
    const res = {};
    await createSync(ctx).apiSync({}, res, { ops: [mkUpd('v-ctrl', new Date().toISOString())] });
    const r = res._cap.body.results[0];
    chk('W1 امروزِ مجازی + op.atِ صادقانه → مسدود', r.ok === false && r.code === 'virtual_day');
    chk('W2 همان: sync_virtual_day_blocked ثبت شد', evs(audits).includes('sync_virtual_day_blocked'));
  }

  /* ── ۲) عقب‌کشیده: مجاز می‌ماند (آفلاینِ مشروع) ولی ردِّ پا دارد ── */
  {
    const { ctx, store, audits } = makeCtx([TODAY]);
    const res = {};
    await createSync(ctx).apiSync({}, res, { ops: [mkUpd('v-back', BACKDATED)] });
    const r = res._cap.body.results[0];
    chk('W3 عقب‌کشیده هنوز مجاز (مشروعیتِ آفلاین حفظ شده)', r.ok === true && store.assets[0].status === 'in_use');
    const a = audits.find((x) => x.ev === 'sync_virtual_day_offline_allow');
    chk('W4 همان: sync_virtual_day_offline_allow با تاریخِ ادعایی ثبت شد',
      !!a && a.d && a.d.date === BACKDATED.slice(0, 10) && a.d.uid === 'v-back',
      JSON.stringify(evs(audits)));
  }

  /* ── ۳) بدونِ نویز: روزِ عادی، واگرایی در تصمیم مؤثر نیست ── */
  {
    const { ctx, audits } = makeCtx([]);
    const res = {};
    await createSync(ctx).apiSync({}, res, { ops: [mkUpd('v-norm', BACKDATED)] });
    const r = res._cap.body.results[0];
    chk('W5 روزِ عادی + عقب‌کشیده → مجازِ بی‌سر‌و‌صدا',
      r.ok === true && !evs(audits).includes('sync_virtual_day_offline_allow'),
      JSON.stringify(evs(audits)));
  }

  /* ── ۴) عقب‌کشیده به روزِ مجازیِ دیگر: مسدود (نه مجازِ ردپادار) ── */
  {
    const { ctx, audits } = makeCtx([TODAY, BACKDATED.slice(0, 10)]);
    const res = {};
    await createSync(ctx).apiSync({}, res, { ops: [mkUpd('v-both', BACKDATED)] });
    const r = res._cap.body.results[0];
    chk('W6 عقب‌کشیده به مجازی → مسدود', r.ok === false && r.code === 'virtual_day');
    chk('W7 همان: فقط blocked (نه offline_allow)',
      evs(audits).includes('sync_virtual_day_blocked') && !evs(audits).includes('sync_virtual_day_offline_allow'));
  }

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
