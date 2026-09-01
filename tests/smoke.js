#!/usr/bin/env node
/**
 * تست دودی (smoke) — برنامه را در یک DOM واقعی اجرا می‌کند،
 * با هر نقش وارد می‌شود و همه‌ی صفحات را رندر می‌کند تا خطای زمان اجرا پیدا شود.
 *
 * نیازمند jsdom:  npm i --no-save jsdom
 * اجرا:          node tests/smoke.js
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست دودی رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const errors = [];

function test(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; errors.push(`${name}: ${e.message}`); console.log(`  ❌ ${name}\n     ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

// ── راه‌اندازی DOM
const consoleErrors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: new (require('jsdom').VirtualConsole)()
    .on('jsdomError', (e) => consoleErrors.push(e.message))
    .on('error', (m) => consoleErrors.push(String(m))),
});

const win = dom.window;

/* متغیرهای سطح‌بالا با const/let روی window نمی‌نشینند؛
   با eval در همان scope به آن‌ها دسترسی می‌گیریم. */
const W = (expr) => win.eval(expr);
const setW = (expr) => win.eval(expr);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(300);   // اجازه بده بوت و تایمرها کامل شوند

console.log('\n▸ بوت برنامه');

test('اسکریپت بدون خطای بارگذاری اجرا شد', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
});

test('پایگاه داده‌ی نمونه ساخته شد', () => {
  assert(W('db.schools.length') > 0, 'db یا مدارس خالی است');
});

console.log('\n▸ برنامه‌ی درسی و کتاب‌ها');

test('نوع منطقه فقط «منطقه» و «روستا» است', () => {
  const kinds = Object.values(W('AREA_KIND'));
  assert(kinds.length === 2, `${kinds.length} نوع تعریف شده: ${kinds.join(', ')}`);
  assert(kinds.includes('منطقه') && kinds.includes('روستا'), `مقادیر: ${kinds.join(', ')}`);
});

test('هیچ منطقه‌ای نوع حذف‌شده (شهری/عشایری) ندارد', () => {
  const bad = W("db.districts.filter(d=>!['district','village'].includes(d.kind)).length");
  assert(bad === 0, `${bad} منطقه با نوع نامعتبر`);
});

test('کتاب‌های ابتدایی برای هر ۶ پایه تعریف شده', () => {
  W("GRADES_OF_LEVEL['ابتدایی']").forEach((g) => {
    assert(W(`booksFor('${g}','')`).length > 0, `پایه ${g} کتاب ندارد`);
  });
});

test('کتاب‌های متوسطه اول برای هر ۳ پایه تعریف شده', () => {
  W("GRADES_OF_LEVEL['متوسطه اول']").forEach((g) => {
    assert(W(`booksFor('${g}','')`).length > 0, `پایه ${g} کتاب ندارد`);
  });
});

test('متوسطه دوم: هر رشته در هر ۳ پایه کتاب دارد', () => {
  const fields = Object.values(W('BRANCHES')).flat();
  fields.forEach((fd) => {
    W("GRADES_OF_LEVEL['متوسطه دوم']").forEach((g) => {
      assert(W(`booksFor('${g}','${fd}')`).length > 0, `${g} / ${fd} کتاب ندارد`);
    });
  });
});

test('کتاب‌های متوسطه دوم بین رشته‌ها متفاوت‌اند', () => {
  const a = W("booksFor('دهم','ریاضی فیزیک')").map((b) => b[0]).join('|');
  const b = W("booksFor('دهم','علوم تجربی')").map((x) => x[0]).join('|');
  assert(a !== b, 'کتاب‌های دو رشته یکسان است');
});

test('پایه‌های ۱ تا ۹ نیازی به رشته ندارند', () => {
  ['اول', 'ششم', 'هفتم', 'نهم'].forEach((g) => {
    assert(!W(`needsField(levelOfGrade('${g}'))`), `پایه ${g} رشته می‌خواهد`);
  });
});

test('پایه‌های ۱۰ تا ۱۲ نیازمند رشته‌اند', () => {
  ['دهم', 'یازدهم', 'دوازدهم'].forEach((g) => {
    assert(W(`needsField(levelOfGrade('${g}'))`), `پایه ${g} رشته نمی‌خواهد`);
  });
});

test('دروس داده‌ی نمونه پایه دارند', () => {
  const withGrade = W('db.subjects.filter(s=>s.grade).length');
  const total = W('db.subjects.length');
  assert(withGrade === total, `${total - withGrade} درس بدون پایه`);
});

test('دروس متوسطه دوم در داده‌ی نمونه رشته دارند', () => {
  const noField = W('db.subjects.filter(s=>needsField(levelOfGrade(s.grade))&&!s.field).length');
  assert(noField === 0, `${noField} درس متوسطه دوم بدون رشته`);
});

console.log('\n▸ فیلترهای جمع‌شونده');

test('تابع filterPanel موجود است', () => {
  assert(W('typeof filterPanel') === 'function');
});

test('فیلترها به‌صورت پیش‌فرض بسته‌اند', () => {
  assert(W('Object.keys(S.fopen||{}).length') === 0, 'فیلتری از ابتدا باز است');
});

test('filterPanel بسته فقط دکمه می‌سازد نه کنترل‌ها', () => {
  const out = W(`(S.fopen={}, filterPanel('schools','<select data-f=\\'sp\\'></select>'))`);
  assert(out.includes('filters-toggle'), 'دکمه فیلتر نیست');
  assert(!out.includes("data-f='sp'"), 'کنترل‌ها بدون کلیک نمایش داده شده‌اند');
});

test('filterPanel باز، کنترل‌ها را نشان می‌دهد', () => {
  const out = W(`(S.fopen={schools:true}, filterPanel('schools','<select data-f=\\'sp\\'></select>'))`);
  assert(out.includes("data-f='sp'"), 'کنترل‌ها بعد از باز شدن نمایش داده نشدند');
  W('S.fopen={}');
});

test('شمارش فیلترهای فعال درست است', () => {
  const n = W("(S.filters={slevel:'ابتدایی',sgender:'پسرانه'}, activeFilterCount('schools'))");
  assert(n === 2, `شمارش: ${n}`);
  W('S.filters={}');
});

console.log('\n▸ رندر همه‌ی صفحات با همه‌ی نقش‌ها');

const ROUTES = {
  superadmin: ['dashboard', 'schools', 'users', 'subjects', 'announcements', 'calendar', 'geo', 'offices', 'officedash', 'regions', 'adminsubs', 'notifications'],
  manager: ['dashboard', 'classes', 'subjects', 'schedule', 'calendar', 'users', 'attendance', 'grades', 'discipline', 'leaves', 'exams', 'teachers', 'corrections', 'tuition', 'announcements', 'notifications', 'chat'],
  teacher: ['dashboard', 'classes', 'schedule', 'calendar', 'attendance', 'grades', 'discipline', 'leaves', 'exams', 'announcements', 'notifications', 'chat'],
  student: ['dashboard', 'schedule', 'exams', 'record', 'calendar', 'mytuition', 'leaves', 'announcements', 'notifications', 'chat'],
};

Object.entries(ROUTES).forEach(([role, routes]) => {
  const has = W(`db.users.some(u=>u.role==='${role}')`);
  if (!has) { console.log(`  ⏭️  نقش ${role} در داده نمونه نیست`); return; }

  test(`ورود به‌عنوان ${role}`, () => {
    const ok = W(`(S.user=db.users.find(u=>u.role==='${role}'), S.filters={}, S.fopen={}, S.page=1, S.user.role)`);
    assert(ok === role);
  });

  routes.forEach((route) => {
    test(`  ${role} → ${route}`, () => {
      const out = W(`(S.route='${route}', S.filters={}, S.page=1, renderRoute())`);
      assert(typeof out === 'string' && out.length > 0, 'خروجی خالی');
      assert(!out.includes('undefined]'), 'خروجی شامل undefined است');
    });
  });
});

console.log('\n▸ کار در حالت آفلاین و همگام‌سازی');

test('لایه همگام‌سازی راه‌اندازی شده', () => {
  assert(W('typeof SYNC') === 'object', 'SYNC تعریف نشده');
  assert(W('typeof enqueueOp') === 'function', 'enqueueOp نیست');
});

test('صف ارسال در ابتدا خالی است', () => {
  W('SYNC.queue=[];SYNC.online=true;0');
  assert(W('pendingCount()') === 0);
});

test('تولید داده نمونه صف را پر نکرده', () => {
  assert(W('SYNC.queue.length') === 0, 'داده دمو وارد صف شده — نباید می‌شد');
});

test('تغییر در حالت آفلاین وارد صف می‌شود', () => {
  W("SYNC.online=false;SYNC.queue=[];S.user=db.users.find(u=>u.role==='teacher');0");
  const before = W('pendingCount()');
  W("insert('attendance',{student_id:db.users.find(u=>u.role==='student').id,class_id:1,date:todayISO(),status:'present',school_id:1});0");
  const after = W('pendingCount()');
  assert(after === before + 1, `صف از ${before} به ${after} رفت`);
});

test('داده آفلاین بلافاصله در برنامه دیده می‌شود', () => {
  const n = W("db.attendance.filter(a=>a.date===todayISO()).length");
  assert(n > 0, 'رکورد ثبت‌شده در db نیست');
});

test('صف در localStorage ذخیره می‌شود (بقا پس از بستن مرورگر)', () => {
  const raw = W('localStorage.getItem(SYNC_QUEUE_KEY)');
  assert(raw && JSON.parse(raw).length > 0, 'صف ذخیره نشده');
});

test('چند تغییر آفلاین پشت سر هم در صف می‌مانند', () => {
  const before = W('pendingCount()');
  W("insert('grades',{student_id:1,subject_id:1,class_id:1,term:'نوبت اول',score:18,school_id:1});0");
  W("insert('discipline',{student_id:1,kind:'positive',title:'تست',points:2,date:todayISO(),school_id:1});0");
  assert(W('pendingCount()') === before + 2, 'همه‌ی تغییرات ثبت نشدند');
});

test('در حالت آفلاین چیزی ارسال نمی‌شود', async () => {
  const before = W('pendingCount()');
  W('syncNow();0');
  assert(W('pendingCount()') === before, 'در آفلاین تلاش به ارسال شد');
});

test('نشانگر وضعیت، حالت آفلاین را نشان می‌دهد', () => {
  const b = W('syncBadge()');
  assert(b.includes('آفلاین'), 'نشانگر آفلاین را نشان نمی‌دهد');
});

test('نشانگر تعداد تغییرات معلق را نشان می‌دهد', () => {
  const b = W('syncBadge()');
  assert(/badge/.test(b), 'تعداد معلق نمایش داده نمی‌شود');
});

test('پنجره وضعیت همگام‌سازی باز می‌شود', () => {
  W('syncPanelModal();0');
  const html = W("document.getElementById('modal').innerHTML");
  assert(html.includes('همگام'), 'پنجره باز نشد');
  W('closeModal();0');
});

test('نشانگر پس از اتصال، حالت همگام را نشان می‌دهد', () => {
  W('SYNC.queue=[];SYNC.online=true;SYNC.syncing=false;0');
  const b = W('syncBadge()');
  assert(b.includes('همگام'), 'حالت همگام نمایش داده نشد');
});

test('پاک‌سازی کامل، صف را هم خالی می‌کند', () => {
  const has = W("typeof resetAll==='function' && resetAll.toString().includes('SYNC_QUEUE_KEY')");
  assert(has, 'resetAll صف همگام‌سازی را پاک نمی‌کند');
});

console.log('\n▸ حذف کلاس‌ها از پنل سوپرادمین');

test('«کلاس‌ها» در منوی سوپرادمین نیست', () => {
  const nav = JSON.stringify(W('NAV.superadmin'));
  assert(!nav.includes("'classes'") && !nav.includes('"classes"'), 'هنوز در منو هست');
});

test('«کلاس‌ها» در منوی مدیر مدرسه هست', () => {
  const nav = JSON.stringify(W('NAV.manager'));
  assert(nav.includes('classes'), 'از منوی مدیر حذف شده — نباید می‌شد');
});

console.log('\n▸ فیلتر و جستجوی دروس');

test('جستجوی دروس کار می‌کند', () => {
  const out = W("(S.user=db.users.find(u=>u.role==='manager'), S.route='subjects', S.filters={subq:'ریاضی'}, viewSubjects())");
  assert(out.includes('ریاضی'), 'نتیجه‌ی جستجو خالی است');
  W('S.filters={}');
});

test('فیلتر پایه در دروس کار می‌کند', () => {
  const out = W("(S.filters={subgrade:'دهم'}, viewSubjects())");
  assert(typeof out === 'string' && out.length > 0);
  W('S.filters={}');
});

// ── نتیجه
const total = pass + fail;
console.log('\n' + '─'.repeat(52));
console.log(`تست دودی: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
if (consoleErrors.length) {
  console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
  consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
}
console.log('─'.repeat(52) + '\n');

dom.window.close();
process.exit(fail ? 1 : 0);
}
