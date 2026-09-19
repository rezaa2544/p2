#!/usr/bin/env node
/**
 * تست‌های جامع دریافت و همگام‌سازی سرور (Pull / Bootstrap API — A01)
 *
 * شامل تست‌های:
 *  ۱. عدم احراز هویت در /api/v1/pull منجر به ۴۰۱ می‌شود
 *  ۲. دریافت اسنپ‌شات کامل مدیر (full_snapshot: true) با محدوده مدرسه
 *  ۳. دریافت اسنپ‌شات معلم محدود به کلاس‌ها و دروس تخصیص‌یافته
 *  ۴. دریافت اسنپ‌شات دانش‌آموز صرفاً محدود به اطلاعات و نمرات شخصی
 *  ۵. فیلتر کالکشن‌ها با پارامتر collections
 *  ۶. دریافت تفاضلی (Delta Sync) با پارامتر since
 *  ۷. دریافت رکوردهای حذف‌شده (Tombstones) در دلتا
 *  ۸. ادغام داده‌های سرور در کلاینت (mergeServerDelta)
 *  ۹. عدم بازنویسی و حفظ رکوردهای دارای تغییر معلق در صف محلی (sync_queue)
 *  ۱۰. اعمال حذفیات سرور در کلاینت (حذف از db و IndexedDB)
 *  ۱۱. تنظیم پرچم مهاجرت payesh_pull_migrated پس از دریافت موفق
 *  ۱۲. رفتار امن Fallback در زمان قطعی ارتباط با سرور
 *
 * اجرا: node tests/pull-bootstrap.js
 */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (e) {
  console.log('⏭️  jsdom نصب نیست — سئوت رد شد.');
  process.exit(1);
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

const { createPull } = require('../server/pull');

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
  // پایگاه داده آزمایشی سرور
  const mockStore = {
    schools: [
      { id: 1, name: 'دبیرستان پایش ۱' },
      { id: 2, name: 'دبیرستان پایش ۲' }
    ],
    users: [
      { id: 10, school_id: 1, role: 'manager', full_name: 'مدیر مدرسه ۱' },
      { id: 20, school_id: 1, role: 'teacher', full_name: 'دبیر احمدی' },
      { id: 30, school_id: 1, role: 'student', full_name: 'دانش‌آموز علی' },
      { id: 31, school_id: 1, role: 'student', full_name: 'دانش‌آموز رضا' },
      { id: 40, school_id: 2, role: 'manager', full_name: 'مدیر مدرسه ۲' }
    ],
    classes: [
      { id: 1, school_id: 1, name: 'کلاس ۱۰۱', grade: 10, homeroom_teacher_id: 20 },
      { id: 2, school_id: 1, name: 'کلاس ۱۰۲', grade: 10, homeroom_teacher_id: 99 },
      { id: 3, school_id: 2, name: 'کلاس ۲۰۱', grade: 10, homeroom_teacher_id: 40 }
    ],
    subjects: [
      { id: 1, name: 'ریاضی' },
      { id: 2, name: 'فیزیک' }
    ],
    schedule: [
      { id: 1, school_id: 1, class_id: 1, teacher_id: 20, subject_id: 1, day: 0, bell: 1 }
    ],
    enrollments: [
      { id: 1, school_id: 1, class_id: 1, student_id: 30 },
      { id: 2, school_id: 1, class_id: 2, student_id: 31 }
    ],
    grades: [
      { id: 101, school_id: 1, class_id: 1, student_id: 30, subject_id: 1, teacher_id: 20, score: 20, version: 1, updated_at: '2026-09-08T10:00:00.000Z' },
      { id: 102, school_id: 1, class_id: 2, student_id: 31, subject_id: 2, teacher_id: 99, score: 18, version: 1, updated_at: '2026-09-08T09:00:00.000Z' }
    ],
    attendance: [
      { id: 201, school_id: 1, class_id: 1, student_id: 30, date: '2026-09-08', status: 'present', version: 1, updated_at: '2026-09-08T10:00:00.000Z' }
    ],
    notifications: [
      { id: 1, user_id: 10, school_id: 1, title: 'اعلان مدیر' },
      { id: 2, user_id: 30, school_id: 1, title: 'اعلان علی' }
    ],
    __deleted_records: [],
    __server_version: 10
  };

  let currentSession = null;
  function mockSessionFrom() { return currentSession; }
  function mockSendJson(res, status, body) {
    return { status, body };
  }

  const pullController = createPull({
    store: mockStore,
    sessionFrom: mockSessionFrom,
    sendJson: mockSendJson
  });

  group('۱. تست‌های سمت سرور (API /api/v1/pull)');

  await test('۱. عدم احراز هویت ۴۰۱ برمی‌گرداند', async () => {
    currentSession = null;
    const res = await pullController.apiPull({ url: '/api/v1/pull' }, {});
    assert(res.status === 401, 'وضعیت پاسخ باید ۴۰۱ باشد');
    assert(res.body.ok === false && res.body.code === 'unauthorized', 'پیام عدم احراز دریافت نشد');
  });

  await test('۲. مدیر مدرسه اسنپ‌شات کامل مدرسه خود را دریافت می‌کند', async () => {
    currentSession = { id: 10, school_id: 1, role: 'manager' };
    const res = await pullController.apiPull({ url: '/api/v1/pull' }, {});
    assert(res.status === 200, 'وضعیت باید ۲۰۰ باشد');
    assert(res.body.full_snapshot === true, 'باید اسنپ‌شات کامل باشد');
    const cols = res.body.collections;
    assert(cols.classes.length === 2, 'تعداد کلاس‌های مدرسه ۱ باید ۲ باشد');
    assert(!cols.classes.some(c => c.school_id === 2), 'کلاس مدرسه ۲ نباید نشت کند');
    assert(cols.users.length === 4, 'کاربران مدرسه ۱ واکشی نشدند');
  });

  await test('۳. معلم فقط به کلاس‌ها و نمرات مرتبط دسترسی دارد', async () => {
    currentSession = { id: 20, school_id: 1, role: 'teacher' };
    const res = await pullController.apiPull({ url: '/api/v1/pull' }, {});
    const cols = res.body.collections;
    assert(cols.classes.length === 1 && cols.classes[0].id === 1, 'معلم فقط باید به کلاس ۱۰۱ دسترسی داشته باشد');
    assert(cols.grades.length === 1 && cols.grades[0].id === 101, 'نمره کلاس مرتبط فقط باید بیاید');
  });

  await test('۴. دانش‌آموز فقط اطلاعات و نمرات خودش را می‌بیند', async () => {
    currentSession = { id: 30, school_id: 1, role: 'student' };
    const res = await pullController.apiPull({ url: '/api/v1/pull' }, {});
    const cols = res.body.collections;
    assert(cols.users.length === 1 && cols.users[0].id === 30, 'دانش‌آموز نباید اطلاعات سایر کاربران را ببیند');
    assert(cols.grades.length === 1 && cols.grades[0].student_id === 30, 'فقط نمره خود دانش‌آموز');
  });

  await test('۵. فیلتر کالکشن‌ها با پارامتر collections اعمال می‌شود', async () => {
    currentSession = { id: 10, school_id: 1, role: 'manager' };
    const res = await pullController.apiPull({ url: '/api/v1/pull?collections=classes,subjects' }, {});
    const cols = res.body.collections;
    assert(cols.classes != null && cols.subjects != null, 'کالکشن‌های درخواستی موجود نیستند');
    assert(cols.grades == null, 'کالکشن grades نباید برگردد');
  });

  await test('۶. دلتای تغییرات با پارامتر since فیلتر می‌شود', async () => {
    currentSession = { id: 10, school_id: 1, role: 'manager' };
    const since = '2026-09-08T09:30:00.000Z';
    const res = await pullController.apiPull({ url: `/api/v1/pull?since=${encodeURIComponent(since)}` }, {});
    assert(res.body.full_snapshot === false, 'درخواست دلتا نباید اسنپ‌شات کامل باشد');
    const cols = res.body.collections;
    // فقط نمره ۱۰۱ که در ۱۰:۰۰ به‌روز شده باید بیاید، نمره ۱۰۲ که در ۰۹:۰۰ بوده نباید بیاید
    assert(cols.grades.length === 1 && cols.grades[0].id === 101, 'فیلتر زمانی دلتا درست کار نکرد');
  });

  await test('۷. رکوردهای حذف‌شده (Tombstones) در دلتا بازگردانده می‌شوند', async () => {
    mockStore.__deleted_records.push({
      c: 'grades',
      id: 999,
      school_id: 1,
      at: '2026-09-08T11:00:00.000Z'
    });
    currentSession = { id: 10, school_id: 1, role: 'manager' };
    const since = '2026-09-08T10:30:00.000Z';
    const res = await pullController.apiPull({ url: `/api/v1/pull?since=${encodeURIComponent(since)}` }, {});
    assert(Array.isArray(res.body.deleted) && res.body.deleted.length === 1, 'رکورد حذف‌شده بازگردانده نشد');
    assert(res.body.deleted[0].c === 'grades' && res.body.deleted[0].id === 999, 'شناسه یا کالکشن رکورد حذفی نادرست است');
  });

  group('۲. تست‌های سمت کلاینت (29-pull.js)');

  // آماده‌سازی محیط تست کلاینت
  W('generate();');
  W('offlineStorage.setBackend(makeOfflineIdbFake());');
  await W('offlineStorage.init()');

  await test('۸. mergeServerDelta داده‌های جدید را در db کلاینت ادغام می‌کند', async () => {
    const payload = {
      ok: true,
      server_time: '2026-09-08T12:00:00.000Z',
      full_snapshot: false,
      collections: {
        announcements: [
          { id: 801, title: 'اطلاعیه سراسری جدید', school_id: 1 }
        ]
      }
    };
    const merged = W(`mergeServerDelta(${JSON.stringify(payload)})`);
    assert(merged === true, 'ادغام دلتا انجام نشد');
    const ann = W(`db.announcements.find(x => x.id === 801)`);
    assert(ann != null && ann.title === 'اطلاعیه سراسری جدید', 'رکورد جدید در db ثبت نشد');
  });

  await test('۹. عدم بازنویسی رکوردهایی که در صف آفلاین منتظر ارسال هستند', async () => {
    // افزودن یک رکورد تغییریافته در صف محلی
    W(`
      if (typeof SYNC !== 'undefined') {
        SYNC.queue = [{ c: 'announcements', id: 801, data: { id: 801, title: 'عنوان محلی تغییریافته' } }];
      }
    `);
    const payload = {
      ok: true,
      collections: {
        announcements: [
          { id: 801, title: 'عنوان سرور که نباید رونویسی شود' }
        ]
      }
    };
    W(`mergeServerDelta(${JSON.stringify(payload)})`);
    const ann = W(`db.announcements.find(x => x.id === 801)`);
    assert(ann.title !== 'عنوان سرور که نباید رونویسی شود', 'تغییرات محلی توسط سرور بازنویسی شد!');
  });

  await test('۱۰. اعمال حذفیات سرور (deleted tombstones) در دیتابیس کلاینت', async () => {
    W(`
      db.announcements.push({ id: 802, title: 'اطلاعیه حذفی' });
      if (typeof SYNC !== 'undefined') SYNC.queue = [];
    `);
    const payload = {
      ok: true,
      collections: {},
      deleted: [{ c: 'announcements', id: 802 }]
    };
    W(`mergeServerDelta(${JSON.stringify(payload)})`);
    const exists = W(`db.announcements.some(x => x.id === 802)`);
    assert(exists === false, 'رکورد حذف‌شده از db پاک نشد');
  });

  await test('۱۱. pullFromServer پرچم payesh_pull_migrated و زمان آخرین پول را ذخیره می‌کند', async () => {
    win.mockCustomApi = {
      get: function() {
        return Promise.resolve({
          ok: true,
          server_time: '2026-09-08T12:30:00.000Z',
          collections: { subjects: [{ id: 99, name: 'آزمایشی' }] }
        });
      }
    };
    const res = await W('pullFromServer({ customApi: window.mockCustomApi, forceOnline: true })');
    assert(res.ok === true, 'pullFromServer با خطا مواجه شد');
    const flag = W('Store.get("payesh_pull_migrated")');
    assert(flag === 'true', 'پرچم payesh_pull_migrated تنظیم نشد');
    const lastPullTime = W('Store.get("payesh_last_pull_time")');
    assert(lastPullTime === '2026-09-08T12:30:00.000Z', 'زمان last_pull_time نادرست است');
  });

  await test('۱۲. رفتار امن Fallback در صورت خطای شبکه یا نبود سرور', async () => {
    win.mockFailingApi = {
      get: function() {
        return Promise.reject(new Error('Network timeout simulated'));
      }
    };
    const res = await W('pullFromServer({ customApi: window.mockFailingApi, forceOnline: true })');
    assert(res.ok === false && res.fallback === true, 'پاسخ fallback در زمان خطا برگردانده نشد');
    assert(res.error === 'Network timeout simulated', 'متن خطای fallback مغایرت دارد');
  });

  // ───────────────────────────── نتیجه
  const total = pass + fail;
  console.log('\n' + '─'.repeat(52));
  console.log(`نتیجه تست‌های Pull / Bootstrap: ${pass}/${total} تست موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  console.log('─'.repeat(52) + '\n');

  process.exit(fail ? 1 : 0);
})();
