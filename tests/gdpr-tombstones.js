#!/usr/bin/env node
/* رگرسیون S2-3b (باگ‌هانت چت ۵، نشست ۲، موج ۴): پلِ سنگ‌قبرِ فراموشیِ GDPR.
   ─────────────────────────────────────────────────────────────
   eraseUserData سطرها را بی‌صدا از کالکشن‌هایِ زنده خارج می‌کرد و هیچ
   سنگ‌قبری نمی‌گذاشت — دادهٔ «فراموش‌شده» رویِ IndexedDB کلاینت‌ها
   (دلتا و بوت‌استرپِ ادغامی) برایِ همیشه می‌ماند؛ فراموشیِ ناقص.
   حالا سطرهایِ پاک‌شده سنگ‌قبرِ سبکِ دلتا می‌گیرند. شمارِ purged و
   ترتیب/گزاره‌هایِ پاک‌سازی بی‌تغییر.
   اجرا: node tests/gdpr-tombstones.js (بدونِ سرور/پورت) */
'use strict';
const { eraseUserData } = require('../server/gdpr.js');
const { createPull } = require('../server/pull.js');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

function pullAs(store, session, since) {
  const pull = createPull({
    store, db: null,
    sessionFrom: async () => session,
    sendJson: (res, code, body) => { res._cap = { code, body }; }
  });
  const q = '?since=' + encodeURIComponent(since) + '&collections=users,parent_links,messages';
  const res = {};
  return pull.apiPull({ url: '/api/v1/pull' + q }, res).then(() => res._cap.body);
}

(async () => {
  console.log('\n▸ S2-3b — فراموشیِ GDPR به pull می‌رسد');

  const store = {
    users: [
      { id: 41, role: 'parent', school_id: 1, full_name: 'پدر' },
      { id: 5, role: 'manager', school_id: 1 }
    ],
    parent_links: [{ parent_id: 41, student_id: 21 }],
    parent_verifications: [],
    parent_subscriptions: [],
    messages: [{ id: 71, from_id: 41, to_id: 5, school_id: 1 }],
    __deleted_records: [],
    __server_version: 1
  };
  const before = new Date(Date.now() - 1000).toISOString();
  const purged = eraseUserData(store, 41);
  chk('G0 پاک‌سازی همان شمارِ قبلی را برمی‌گرداند',
    purged.users === 1 && purged.parent_links === 1 && purged.messages === 1
    && store.users.length === 1 && store.parent_links.length === 0, JSON.stringify(purged));

  const mgr = { id: 5, role: 'manager', school_id: 1 };
  const d = await pullAs(store, mgr, before);
  chk('G1 دلتا سنگ‌قبرِ users را دارد', d.deleted.some((t) => t.c === 'users' && Number(t.id) === 41),
    JSON.stringify(d.deleted));
  chk('G2 دلتا سنگ‌قبرِ messages را دارد', d.deleted.some((t) => t.c === 'messages' && Number(t.id) === 71));
  /* parent_links کلیدِ id ندارد (پیوندِ مرکب) — سنگ‌قبرِ idمحور نمی‌گیرد؛
     ثبت می‌شود که رفتار آگاهانه است، نه فراموشیِ تصادفی. */
  chk('G3 پیوندِ مرکبِ بی‌id سنگ‌قبرِ کاذب نگرفت',
    !d.deleted.some((t) => t.c === 'parent_links' && t.id == null));

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
