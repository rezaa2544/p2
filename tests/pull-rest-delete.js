#!/usr/bin/env node
/* رگرسیون S2-3a (باگ‌هانت چت ۵، نشست ۲، موج ۴): پلِ سنگ‌قبرِ حذفِ REST.
   ─────────────────────────────────────────────────────────────
   حذفِ REST (deleter.softDelete) رکورد را از مجموعهٔ زنده خارج می‌کرد و
   بایگانی می‌کرد، ولی سنگ‌قبری در `__deleted_records` نمی‌گذاشت — pull
   فقط همان را می‌خواند، پس کلاینت‌هایِ دلتا (و حتی بوت‌استرپِ ادغامی)
   حذف را هیچ‌وقت نمی‌دیدند: رکوردِ شبح برایِ همیشه می‌ماند.
   حالا softDelete (تک‌گلوگاهِ هر ۵ حذفِ REST) سنگ‌قبرِ سبکِ دلتا هم
   می‌گذارد. بایگانیِ کامل و رویدادِ برون‌مرزی بی‌تغییر.
   اجرا: node tests/pull-rest-delete.js (بدونِ سرور/پورت) */
'use strict';
const { createDeleteService } = require('../server/delete-service.js');
const { createPull } = require('../server/pull.js');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

function seed() {
  return {
    attendance: [{ id: 11, student_id: 21, class_id: 9, school_id: 1, date: '2026-09-01', status: 'present', version: 1, created_at: '2026-09-01T00:00:00.000Z' }],
    users: [
      { id: 5, role: 'manager', school_id: 1 },
      { id: 6, role: 'manager', school_id: 2 }
    ],
    __deleted_records: [],
    __server_version: 1
  };
}
function pullAs(store, session, since) {
  const pull = createPull({
    store, db: null,
    sessionFrom: async () => session,
    sendJson: (res, code, body) => { res._cap = { code, body }; }
  });
  const q = since ? ('?since=' + encodeURIComponent(since) + '&collections=attendance,users') : '?collections=attendance,users';
  const res = {};
  return pull.apiPull({ url: '/api/v1/pull' + q }, res).then(() => res._cap.body);
}

(async () => {
  console.log('\n▸ S2-3a — حذفِ REST به pull می‌رسد');

  const store = seed();
  const deleter = createDeleteService({ store, db: null, markDirty: () => {}, outbox: null });
  const before = new Date(Date.now() - 1000).toISOString();
  const del = await deleter.softDelete('attendance', { id: 11 }, { actor: { id: 5 }, audit: () => {} });
  chk('R0 حذف موفق و از مجموعهٔ زنده خارج شد', del.ok === true && store.attendance.length === 0);

  const mgr1 = { id: 5, role: 'manager', school_id: 1 };
  const d1 = await pullAs(store, mgr1, before);
  chk('R1 دلتایِ مدیرِ همان مدرسه سنگ‌قبر را دارد',
    Array.isArray(d1.deleted) && d1.deleted.some((t) => t.c === 'attendance' && Number(t.id) === 11),
    JSON.stringify(d1.deleted));

  const mgr2 = { id: 6, role: 'manager', school_id: 2 };
  const d2 = await pullAs(store, mgr2, before);
  chk('R2 دلتایِ مدرسهٔ دیگر سنگ‌قبر را ندارد (اسکوپ)',
    Array.isArray(d2.deleted) && !d2.deleted.some((t) => t.c === 'attendance' && Number(t.id) === 11));

  const snap = await pullAs(store, mgr1, null);
  chk('R3 اسنپ‌شات رکوردِ حذف‌شده را ندارد',
    Array.isArray(snap.collections.attendance) && snap.collections.attendance.length === 0);

  chk('R4 بایگانیِ کاملِ سنگ‌قبر سرِ جایش است (رفتارِ موجود)',
    Array.isArray(store.tombstones) && store.tombstones.length === 1
    && store.tombstones[0].collection === 'attendance' && store.tombstones[0].record.id === 11);

  /* مجموعهٔ دوم (users) — همان گلوگاه */
  store.users.push({ id: 31, role: 'teacher', school_id: 1 });
  await deleter.softDelete('users', { id: 31 }, { actor: { id: 5 }, audit: () => {} });
  const d3 = await pullAs(store, mgr1, before);
  chk('R5 حذفِ users هم سنگ‌قبرِ دلتا گرفت',
    d3.deleted.some((t) => t.c === 'users' && Number(t.id) === 31), JSON.stringify(d3.deleted));

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
