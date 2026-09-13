#!/usr/bin/env node
/**
 * تست‌های جامع لایه ذخیره‌سازی آفلاین IndexedDB (فاز ۴ — بندهای ۱۶ تا ۲۰)
 *
 * شامل تست‌های:
 *  ۱. راه‌اندازی و ساخت ساختار جداول (entities, sync_queue, metadata)
 *  ۲. استورهای سه‌گانه و ایندکس‌ها
 *  ۳. درج موجودیت (putEntity) و واکشی مجموعه (getCollection)
 *  ۴. دریافت تکی موجودیت بر اساس شناسه (getEntity)
 *  ۵. ویرایش و به‌روزرسانی موجودیت موجود در IndexedDB
 *  ۶. حذف موجودیت (removeEntity)
 *  ۷. ایندکس‌گذاری و واکشی بر اساس شناسه مدرسه (getEntitiesBySchool)
 *  ۸. افزودن به صف همگام‌سازی (addToQueue) و واکشی صف (getQueue)
 *  ۹. واکشی آیتم‌های معلق صف (getPendingQueue)
 *  ۱۰. به‌روزرسانی وضعیت آیتم صف همراه با ثبت خطا و تلاش مجدد (updateQueueStatus)
 *  ۱۱. فیلتر صف همگام‌سازی بر اساس وضعیت (getQueueByStatus)
 *  ۱۲. حذف آیتم از صف همگام‌سازی پس از ارسال موفق (removeFromQueue)
 *  ۱۳. متادیتا: ذخیره و خواندن تنظیمات و لاگ (setMetadata / getMetadata)
 *  ۱۴. مهاجرت خودکار از Store به IndexedDB (00-migration.js)
 *  ۱۵. پاک‌سازی کامل تمام استورها (clearAll)
 *  ۱۶. سناریوی Fallback و رفتار امن در صورت عدم پشتیبانی IndexedDB
 *
 * اجرا: node tests/idb-persistence.js
 */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (e) {
  console.log('⏭️  jsdom نصب نیست — سئوت رد شد. (npm i --no-save jsdom)');
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
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg || 'شرط برقرار نیست');
};

let pass = 0, fail = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    fail++;
    failures.push({ name, msg: e.message });
    console.log(`  ❌ ${name}\n     ${e.message}`);
  }
}

function group(title) {
  console.log(`\n▸ ${title}`);
}

(async () => {
  // فعال‌سازی بک‌اند سازگار با استاندارد IndexedDB در محیط تست jsdom
  W('offlineStorage.setBackend(makeOfflineIdbFake());');

  group('راه‌اندازی و ساختار مخزن IndexedDB');

  await test('۱. نمونه‌ی آفلاین در دسترس است و دیتابیس ساخته می‌شود', async () => {
    const supported = W('typeof offlineStorage !== "undefined" && offlineStorage.isSupported()');
    assert(supported === true, 'offlineStorage در دسترس نیست یا پشتیبانی نمی‌شود');

    await W('offlineStorage.init()');
    const dbName = W('offlineStorage.dbName');
    assert(dbName === 'payesh_offline_v2', `نام دیتابیس اشتباه است: ${dbName}`);
  });

  await test('۲. استورهای entities، sync_queue و metadata وجود دارند', async () => {
    const hasStores = W(`
      (function(){
        if (!offlineStorage.db) return false;
        var names = offlineStorage.db.objectStoreNames;
        var list = [];
        for(var i=0; i<names.length; i++) list.push(names[i] || names.item(i));
        return list.includes('entities') && list.includes('sync_queue') && list.includes('metadata');
      })()
    `);
    assert(hasStores === true, 'یکی از استورهای سه‌گانه در IndexedDB ساخته نشده است');
  });

  group('عملیات CRUD روی موجودیت‌ها (entities)');

  await test('۳. putEntity رکورد را درج کرده و getCollection آن را بازیابی می‌کند', async () => {
    await W(`
      offlineStorage.putEntity('students', { id: 101, school_id: 1, name: 'علی رضایی', grade: 10 })
    `);
    const students = await W(`offlineStorage.getCollection('students')`);
    assert(Array.isArray(students) && students.length === 1, 'رکورد دانش‌آموز ثبت نشد');
    assert(students[0].name === 'علی رضایی' && students[0].id === 101, 'محتوای رکورد نادرست است');
  });

  await test('۴. getEntity یک رکورد منفرد را بر اساس collection و id بازمی‌گرداند', async () => {
    const student = await W(`offlineStorage.getEntity('students', 101)`);
    assert(student != null, 'رکورد منفرد یافت نشد');
    assert(student.id === 101 && student.name === 'علی رضایی', 'مشخصات رکورد واکشی‌شده نامعتبر است');
  });

  await test('۵. putEntity ویرایش رکورد را بدون ایجاد داده‌ی تکراری اعمال می‌کند', async () => {
    await W(`
      offlineStorage.putEntity('students', { id: 101, school_id: 1, name: 'علی رضایی (ویرایش شده)', grade: 11 })
    `);
    const students = await W(`offlineStorage.getCollection('students')`);
    assert(students.length === 1, 'به‌جای ویرایش رکورد جدید ایجاد شده است');
    assert(students[0].name === 'علی رضایی (ویرایش شده)' && students[0].grade === 11, 'فیلدهای ویرایش‌شده اعمال نشدند');
  });

  await test('۶. removeEntity موجودیت هدف را از کالکشن حذف می‌کند', async () => {
    await W(`
      offlineStorage.putEntity('students', { id: 102, school_id: 1, name: 'سارا محمدی', grade: 10 })
    `);
    let students = await W(`offlineStorage.getCollection('students')`);
    assert(students.length === 2, 'رکورد دوم درج نشد');

    await W(`offlineStorage.removeEntity('students', 101)`);
    students = await W(`offlineStorage.getCollection('students')`);
    assert(students.length === 1, 'رکورد حذف نشد');
    assert(students[0].id === 102, 'رکورد اشتباه حذف شده است');
  });

  await test('۷. getEntitiesBySchool فیلتر ایندکس بر اساس مدرسه را انجام می‌دهد', async () => {
    await W(`
      Promise.all([
        offlineStorage.putEntity('classes', { id: 1, school_id: 1, title: 'کلاس ۱۰۱' }),
        offlineStorage.putEntity('classes', { id: 2, school_id: 2, title: 'کلاس ۲۰۲' }),
        offlineStorage.putEntity('teachers', { id: 10, school_id: 1, name: 'دبیر احمدی' })
      ])
    `);
    const school1Items = await W(`offlineStorage.getEntitiesBySchool(1)`);
    const school2Items = await W(`offlineStorage.getEntitiesBySchool(2)`);
    assert(school1Items.length >= 2, 'آیتم‌های مدرسه ۱ واکشی نشدند');
    assert(school2Items.length === 1, 'آیتم‌های مدرسه ۲ واکشی نشدند');
    assert(school2Items[0].title === 'کلاس ۲۰۲', 'محتوای مدرسه ۲ منطبق نیست');
  });

  group('مدیریت صف همگام‌سازی آفلاین (sync_queue)');

  await test('۸. addToQueue و getQueue آیتم‌های معلق را نگهداری و بازمی‌گردانند', async () => {
    const uid1 = 'op-uuid-001';
    await W(`
      offlineStorage.addToQueue({
        uid: 'op-uuid-001',
        op: { t: 'ins', c: 'grades', data: { id: 999, score: 20 } },
        status: 'pending'
      })
    `);
    const queue = await W(`offlineStorage.getQueue()`);
    assert(Array.isArray(queue) && queue.length >= 1, 'صف همگام‌سازی خالی است');
    const item = queue.find(q => q.uid === uid1);
    assert(item != null, 'عملیات با uid مشخص یافت نشد');
    assert(item.op.c === 'grades' && item.status === 'pending', 'مشخصات عملیات صف نادرست است');
  });

  await test('۹. getPendingQueue کلیه آیتم‌های معلق و ناموفق را واکشی می‌کند', async () => {
    await W(`
      offlineStorage.addToQueue({
        uid: 'op-uuid-failed',
        op: { t: 'upd', c: 'grades', id: 999, data: { score: 19 } },
        status: 'failed'
      })
    `);
    const pendingItems = await W(`offlineStorage.getPendingQueue()`);
    assert(Array.isArray(pendingItems), 'خروجی getPendingQueue آرایه نیست');
    assert(pendingItems.some(q => q.uid === 'op-uuid-001'), 'آیتم pending در خروجی نیست');
    assert(pendingItems.some(q => q.uid === 'op-uuid-failed'), 'آیتم failed در خروجی نیست');
  });

  await test('۱۰. updateQueueStatus وضعیت، تعداد تلاش‌ها و دلیل خطا را به‌روزرسانی می‌کند', async () => {
    await W(`
      offlineStorage.updateQueueStatus('op-uuid-001', 'failed', 'Timeout error from server')
    `);
    const queue = await W(`offlineStorage.getQueue()`);
    const item = queue.find(q => q.uid === 'op-uuid-001');
    assert(item != null, 'آیتم صف پیدا نشد');
    assert(item.status === 'failed', 'وضعیت آیتم به failed تغییر نیافت');
    assert(item.attempts >= 1, 'تعداد تلاش‌ها اضافه نشد');
    assert(item.last_error === 'Timeout error from server', 'دلیل خطا ثبت نشد');
  });

  await test('۱۱. getQueueByStatus فیلتر بر اساس وضعیت‌های pending / failed را به درستی برمی‌گرداند', async () => {
    await W(`
      offlineStorage.addToQueue({
        uid: 'op-uuid-002',
        op: { t: 'upd', c: 'attendance', id: 5, data: { status: 'absent' } },
        status: 'pending'
      })
    `);
    const pendingList = await W(`offlineStorage.getQueueByStatus('pending')`);
    const failedList = await W(`offlineStorage.getQueueByStatus('failed')`);

    assert(pendingList.some(q => q.uid === 'op-uuid-002'), 'آیتم معلق در فهرست pending نیست');
    assert(failedList.some(q => q.uid === 'op-uuid-001'), 'آیتم ناموفق در فهرست failed نیست');
  });

  await test('۱۲. removeFromQueue آیتم‌های همگام‌شده را از صف پاک می‌کند', async () => {
    await W(`offlineStorage.removeFromQueue('op-uuid-001')`);
    const queue = await W(`offlineStorage.getQueue()`);
    const item = queue.find(q => q.uid === 'op-uuid-001');
    assert(item == null, 'آیتم op-uuid-001 از صف پاک نشده است');
  });

  group('مدیریت متادیتا و تنظیمات (metadata)');

  await test('۱۳. setMetadata و getMetadata انواع اشیاء و آرایه‌ها را ذخیره و بازیابی می‌کنند', async () => {
    const metaObj = { theme: 'dark', last_sync_time: 1725790000000, offline_mode: true };
    await W(`offlineStorage.setMetadata('user_prefs', ${JSON.stringify(metaObj)})`);
    const retrieved = await W(`offlineStorage.getMetadata('user_prefs')`);
    assert(retrieved != null, 'متادیتا یافت نشد');
    assert(retrieved.theme === 'dark' && retrieved.offline_mode === true, 'مقادیر متادیتا مغایرت دارند');
  });

  group('مهاجرت داده‌های محلی به IndexedDB (00-migration.js)');

  await test('۱۴. migrateFromLocalStorageToIdb داده‌های پیشین را منتقل و پرچم مهاجرت را تنظیم می‌کند', async () => {
    // مقداردهی داده‌های نمونه در Store
    W(`
      Store.set('payesh_idb_migrated_v2', '');
      Store.set('payesh_idb_migrated_v3', '');
      Store.set('sms_log_v1', JSON.stringify([{ t: 'ins', c: 'legacy_test', data: { id: 1 } }]));
      Store.set('sms_queue_v1', JSON.stringify([{ uid: 'legacy-q-1', op: { t: 'ins', c: 'legacy_test' } }]));
      Store.set('sms_app_settings', JSON.stringify({ school_year: '1403-1404' }));
    `);

    const migrated = await W(`migrateFromLocalStorageToIdb(offlineStorage)`);
    assert(migrated === true, 'فرآیند مهاجرت با خطا مواجه شد یا انجام نشد');

    const flag = W(`Store.get('payesh_idb_migrated_v2')`);
    assert(flag === 'true', 'پرچم payesh_idb_migrated_v2 تنظیم نشده است');

    const legacyLog = await W(`offlineStorage.getMetadata('legacy_log')`);
    assert(Array.isArray(legacyLog) && legacyLog.length === 1, 'لاگ قدیمی به متادیتا مهاجرت نکرده است');

    const queue = await W(`offlineStorage.getQueue()`);
    assert(queue.some(q => q.uid === 'legacy-q-1'), 'صف قدیمی به IndexedDB مهاجرت نکرده است');

    const appSettings = await W(`offlineStorage.getMetadata('app_settings')`);
    assert(appSettings != null && appSettings.school_year === '1403-1404', 'تنظیمات برنامه مهاجرت نکرده است');
  });

  group('پاک‌سازی کامل و رفتار در نبود IndexedDB');

  await test('۱۵. clearAll تمام داده‌های هر سه استور را پاک می‌کند', async () => {
    await W(`offlineStorage.clearAll()`);
    const students = await W(`offlineStorage.getCollection('students')`);
    const queue = await W(`offlineStorage.getQueue()`);
    const meta = await W(`offlineStorage.getMetadata('user_prefs')`);

    assert(students.length === 0, 'استور entities پاک نشد');
    assert(queue.length === 0, 'استور sync_queue پاک نشد');
    assert(meta == null, 'استور metadata پاک نشد');
  });

  await test('۱۶. Fallback: کلاس OfflineStorage در صورت نبود IndexedDB بدون پرتاب خطا رفتار امن دارد', async () => {
    const res = await W(`
      (function(){
        var brokenStorage = new OfflineStorage('fallback_db', 1);
        brokenStorage.setBackend(null); // شبیه‌سازی نبود IDB در مرورگر
        var isSup = brokenStorage.isSupported();
        return brokenStorage.init().then(function() {
          return { supported: isSup, ok: true };
        }).catch(function(e) {
          return { supported: isSup, ok: false, err: e.message };
        });
      })()
    `);
    assert(res.supported === false, 'isSupported باید false برمی‌گرداند');
    assert(res.ok === true, 'init در صورت نبود IndexedDB نباید برنامه را بشکند');
  });

  // ───────────────────────────── خلاصه نتیجه
  const total = pass + fail;
  console.log('\n' + '─'.repeat(52));
  console.log(`نتیجه تست‌های IndexedDB: ${pass}/${total} تست موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  console.log('─'.repeat(52) + '\n');

  process.exit(fail ? 1 : 0);
})();
