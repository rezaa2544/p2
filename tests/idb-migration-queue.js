#!/usr/bin/env node
/* رگرسیونِ W7-5 (باگ‌هانت چت ۵، نشست ۴، موج ۷): مهاجرتِ ناقصِ IDB.
   ─────────────────────────────────────────────────────────────────
   صفِ همگام‌سازیِ واقعی در localStorage زیرِ کلیدِ `sms_syncq_v1`
   (SYNC_QUEUE_KEY در 27-sync.js) ذخیره می‌شود، ولی
   migrateFromLocalStorageToIdb فقط کلیدهایِ کهنهٔ `sms_queue_v1` و
   `payesh_sync_queue` را می‌خواند — صفِ معلقِ واقعی هیچ‌وقت به IDB
   منتقل نمی‌شد و پرچمِ مهاجرت با صفِ ناتمام «انجام شد» می‌شد.
   اجرا: node tests/idb-migration-queue.js */
'use strict';
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (e) {
  console.log('⏭️  jsdom نصب نیست — سوئیت رد شد. (npm i --no-save jsdom)');
  process.exit(0);
}

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {})
});
const win = dom.window;
const W = (expr) => win.eval(expr);

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

(async () => {
  console.log('\n▸ W7-5 — مهاجرتِ صفِ واقعی (sms_syncq_v1) به IndexedDB');

  W('offlineStorage.setBackend(makeOfflineIdbFake());');
  W(`
    Store.set('payesh_idb_migrated_v2', '');
    Store.set('sms_syncq_v1', JSON.stringify([
      { uid: 'real-q-1', op: { t: 'ins', c: 'attendance', data: { id: 9001 } }, status: 'pending', created_at: '2026-09-10T00:00:00.000Z' },
      { uid: 'real-q-2', op: { t: 'upd', c: 'grades', id: 5, data: { score: 18 } }, status: 'failed', tries: 2, created_at: '2026-09-10T00:00:01.000Z' }
    ]));
  `);

  const migrated = await W(`migrateFromLocalStorageToIdb(offlineStorage)`);
  chk('M1 مهاجرت اجرا شد', migrated === true);

  const queue = await W(`offlineStorage.getQueue()`);
  const uids = (queue || []).map(q => q.uid).join(',');
  chk('M2 قلمِ real-q-1 (کلیدِ واقعی) مهاجرت کرد', (queue || []).some(q => q.uid === 'real-q-1'), 'uids=' + uids);
  chk('M3 قلمِ failed هم مهاجرت کرد', (queue || []).some(q => q.uid === 'real-q-2'), 'uids=' + uids);

  const flag = W(`Store.get('payesh_idb_migrated_v2')`);
  chk('M4 پرچمِ مهاجرت تنظیم شد', flag === 'true');

  /* فال‌بکِ کهنه (کلیدِ قدیمی) هنوز کار می‌کند */
  W(`
    Store.set('payesh_idb_migrated_v2', '');
    Store.set('payesh_idb_migrated_v3', '');
    Store.remove('sms_syncq_v1');
    Store.set('sms_queue_v1', JSON.stringify([{ uid: 'legacy-q-9', op: { t: 'ins', c: 'legacy' } }]));
  `);
  const migrated2 = await W(`migrateFromLocalStorageToIdb(offlineStorage)`);
  const queue2 = await W(`offlineStorage.getQueue()`);
  chk('M5 فال‌بکِ کلیدِ کهنه هم مهاجرت می‌کند', migrated2 === true && (queue2 || []).some(q => q.uid === 'legacy-q-9'), JSON.stringify((queue2 || []).map(q => q.uid)));

  /* S7-10a: کاربرانِ نسخهٔ قبلی ممکن است پرچمِ v2 را داشته باشند اما
     یک کلیدِ کهنه هنوز منتقل نشده باشد. پرچم نباید این repair را bypass کند. */
  await W(`offlineStorage.clearAll()`);
  W(`
    Store.set('payesh_idb_migrated_v2', 'true');
    Store.set('payesh_idb_migrated_v3', '');
    Store.set('sms_queue_v1', JSON.stringify([{ uid: 'late-legacy-q', op: { t: 'ins', c: 'legacy_late' }, status: 'pending' }]));
  `);
  const migrated3 = await W(`migrateFromLocalStorageToIdb(offlineStorage)`);
  const queue3 = await W(`offlineStorage.getQueue()`);
  chk('M6 پرچمِ قدیمی، صفِ کهنه را bypass نمی‌کند', migrated3 === true && (queue3 || []).some(q => q.uid === 'late-legacy-q'), JSON.stringify((queue3 || []).map(q => q.uid)));

  /* S7-10b: uid مشترک در سه نسل — قدیمی‌تر اول، کلیدِ جاری آخر؛
     محتوای جاری نباید با رکوردِ کهنه overwrite شود. */
  await W(`offlineStorage.clearAll()`);
  W(`
    Store.set('payesh_idb_migrated_v2', '');
    Store.set('payesh_idb_migrated_v3', '');
    Store.set('sms_syncq_v1', JSON.stringify([{ uid: 'shared-q', op: { t: 'upd', c: 'current_shape' }, status: 'failed', attempts: 4 }]));
    Store.set('sms_queue_v1', JSON.stringify([{ uid: 'shared-q', op: { t: 'ins', c: 'legacy_shape' }, status: 'pending', attempts: 0 }]));
  `);
  await W(`migrateFromLocalStorageToIdb(offlineStorage)`);
  const queue4 = await W(`offlineStorage.getQueue()`);
  const shared = (queue4 || []).find(q => q.uid === 'shared-q');
  chk('M7 نسخهٔ جاریِ uid مشترک برنده می‌شود', !!shared && shared.status === 'failed' && shared.attempts === 4 && shared.op && shared.op.c === 'current_shape', JSON.stringify(shared));

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
