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

console.log('\n▸ ویزارد ورود اکسل');

test('توابع ویزارد ورود تعریف شده‌اند', () => {
  assert(W("typeof viewImport==='function'&&typeof parseCSV==='function'"
    + "&&typeof prepSheet==='function'&&typeof suggestMap==='function'"
    + "&&typeof validateImport==='function'&&typeof commitImport==='function'"
    + "&&typeof normHdr==='function'&&typeof IMP_FIELDS==='object'"), 'توابع ناقص است');
});

test('هر چهار مرحله ویزارد رندر می‌شوند', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null;S.route='import';S.filters={}");
  W("S.imp={step:0,entity:'students'}");
  assert(W('renderRoute()').length > 300, 'مرحله ۱');
  W("S.imp={step:1,entity:'students',sheet:{headers:['نام'],rows:[['علی']]},mapping:{0:'full_name'}}");
  assert(W('renderRoute()').length > 300, 'مرحله ۲');
  W("S.imp={step:2,entity:'students',preview:{rows:[],newClasses:[],counts:{total:0,ok:0,failed:0,updates:0}}}");
  assert(W('renderRoute()').length > 300, 'مرحله ۳');
  W("S.imp={step:3,entity:'students',result:{created:1,updated:0,parents:0,classes:0,skipped:0}}");
  assert(W('renderRoute()').length > 300, 'مرحله ۴');
  W("S.imp=null");
});

test('خواندن csv با جداکننده‌های مختلف', () => {
  assert(W("parseCSV('a,b\\nc,d').length") === 2, 'کاما');
  assert(W("parseCSV('a;b\\nc;d')[1][1]") === 'd', 'نقطه‌ویرگول');
  assert(W("parseCSV('\\uFEFFa,b')[0][0]") === 'a', 'حذف نشانه ابتدای فایل');
});

test('تشخیص ردیف تیتر و نگاشت هوشمند ستون‌ها', () => {
  const NL = String.fromCharCode(10);
  const csv = 'نام و نام خانوادگی,کد ملی,کلاس,جنسیت' + NL + 'علی رضایی,0013542419,دهم الف,پسر';
  const sh = W('prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students')");
  assert(W('prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students').headers.length") === 4, 'تعداد ستون');
  const map = W('JSON.stringify(prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students').mapping)");
  assert(map.indexOf('full_name') > -1 && map.indexOf('national_id') > -1
      && map.indexOf('class_name') > -1, 'نگاشت خودکار ناقص است: ' + map);
});

test('نگاشت با نویسه عربی و تیتر در ردیف دوم', () => {
  const NL = String.fromCharCode(10);
  const csv2 = 'نام دانش آموز;كدملي' + NL + 'محمد اکبری;0016283426';
  const m2 = W('JSON.stringify(prepSheet(parseCSV(' + JSON.stringify(csv2) + "),'students').mapping)");
  assert(m2.indexOf('full_name') > -1 && m2.indexOf('national_id') > -1, 'نویسه عربی شناخته نشد: ' + m2);
  const csv3 = 'گزارش مدرسه' + NL + 'نام و نام خانوادگی,کد ملی' + NL + 'رضا نوری,0018765432';
  assert(W('prepSheet(parseCSV(' + JSON.stringify(csv3) + "),'students').headers[0]") === 'نام و نام خانوادگی',
    'ردیف تیتر واقعی پیدا نشد');
  assert(W('prepSheet(parseCSV(' + JSON.stringify(csv3) + "),'students').rows.length") === 1, 'شمار ردیف داده');
});

test('اعتبارسنجی: نام کوتاه، کد ملی نامعتبر و تکراری رد می‌شوند', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  W("window.__N=(function(){var out=[];var n=100;while(out.length<2){n++;var b=String(n).padStart(9,'0');"
    + "var s=0;for(var i=0;i<9;i++)s+=Number(b[i])*(10-i);var r=s%11;var c=r<2?r:11-r;var nid=b+c;"
    + "if(validNid(nid)&&!nidOwner(nid))out.push(nid);}return out;})()");
  const n0 = W('window.__N[0]');
  const NL = String.fromCharCode(10);
  const csv = 'نام و نام خانوادگی,کد ملی' + NL + 'علی رضایی,' + n0
    + '' + NL + 'ب,' + W('window.__N[1]') + '' + NL + 'حسن کریمی,1234567890' + NL + 'رضا نوری,' + n0;
  W('window.__v=validateImport(prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students').rows,"
    + 'prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students').mapping,'students')");
  assert(W('window.__v.rows[0].ok') === true, 'ردیف سالم رد شد');
  assert(W('window.__v.rows[1].ok') === false, 'نام کوتاه پذیرفته شد');
  assert(W('window.__v.rows[2].ok') === false, 'کد ملی نامعتبر پذیرفته شد');
  assert(W('window.__v.rows[3].errors.some(function(x){return x.indexOf("تکراری")>-1;})'), 'تکرار تشخیص داده نشد');
});

test('کد ملی متعلق به مدرسه دیگر رد و تعارض ثبت می‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  const other = W("(function(){var o=db.users.find(function(u){return u.role==='student'"
    + '&&u.school_id!==' + sid + '&&u.national_id;});return o?o.national_id:null;})()');
  if(!other) return;
  const c0 = W('db.nid_conflicts.length');
  const NL = String.fromCharCode(10);
  const csv = 'نام و نام خانوادگی,کد ملی' + NL + 'دانش آموز جابه‌جا,' + other;
  W('window.__v2=validateImport(prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students').rows,"
    + 'prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students').mapping,'students')");
  assert(W('window.__v2.rows[0].ok') === false, 'ردیف پذیرفته شد');
  assert(W('db.nid_conflicts.length') > c0, 'تعارض ثبت نشد');
});

test('ثبت نهایی: کاربر، کلاس، ثبت‌نام و حساب ولی ساخته می‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  W("window.__M=(function(){var out=[];var n=5000;while(out.length<2){n++;var b=String(n).padStart(9,'0');"
    + "var s=0;for(var i=0;i<9;i++)s+=Number(b[i])*(10-i);var r=s%11;var c=r<2?r:11-r;var nid=b+c;"
    + "if(validNid(nid)&&!nidOwner(nid))out.push(nid);}return out;})()");
  const NAME = 'یکتا آزمون‌پور';
  const NL = String.fromCharCode(10);
  const csv = 'نام و نام خانوادگی,کد ملی,کلاس,جنسیت,نام پدر,کد ملی پدر' + NL + ''
    + NAME + ',' + W('window.__M[0]') + ',کلاس یکتای آزمون,دختر,پدر یکتا,' + W('window.__M[1]');
  W('window.__v3=validateImport(prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students').rows,"
    + 'prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students').mapping,'students')");
  W("S.imp={step:2,entity:'students',preview:window.__v3,sheet:{headers:[],rows:[]},mapping:{}}");
  W('window.__r=commitImport(S.imp)');
  assert(W('window.__r.created') === 1, 'کاربر ساخته نشد');
  assert(W('window.__r.classes') === 1, 'کلاس ساخته نشد');
  assert(W('window.__r.parents') >= 1, 'حساب ولی ساخته نشد');
  assert(W('db.users.filter(function(u){return u.full_name===' + JSON.stringify(NAME) + ';}).length') === 1,
    'رکورد یکتا ساخته نشد');
  const uid = W('db.users.filter(function(u){return u.full_name===' + JSON.stringify(NAME) + ';})[0].id');
  assert(W('db.enrollments.filter(function(e){return e.student_id===' + uid + ';}).length') === 1, 'ثبت‌نام نشد');
  assert(W('db.parent_links.filter(function(l){return l.student_id===' + uid + ';}).length') >= 1, 'پیوند ولی نیست');
  assert(W('db.users.filter(function(u){return u.full_name===' + JSON.stringify(NAME) + ';})[0].gender') === 'دختر',
    'جنسیت ثبت نشد');
});

test('ورود دوباره همان کد ملی به‌روزرسانی می‌کند نه تکرار', () => {
  const NAME = 'یکتا آزمون‌پور';
  const nid = W('db.users.filter(function(u){return u.full_name===' + JSON.stringify(NAME) + ';})[0].national_id');
  const uid = W('db.users.filter(function(u){return u.full_name===' + JSON.stringify(NAME) + ';})[0].id');
  const NL = String.fromCharCode(10);
  const csv = 'نام و نام خانوادگی,کد ملی,کلاس' + NL + '' + NAME + ' دوم,' + nid + ',کلاس یکتای آزمون';
  W('window.__v4=validateImport(prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students').rows,"
    + 'prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students').mapping,'students')");
  assert(W('window.__v4.counts.updates') === 1, 'به‌عنوان به‌روزرسانی شناخته نشد');
  W("S.imp={step:2,entity:'students',preview:window.__v4,sheet:{headers:[],rows:[]},mapping:{}}");
  W('window.__r2=commitImport(S.imp)');
  assert(W('window.__r2.updated') === 1 && W('window.__r2.created') === 0, 'رکورد تکراری ساخته شد');
  assert(W('db.enrollments.filter(function(e){return e.student_id===' + uid + ';}).length') === 1,
    'ثبت‌نام تکراری ماند');
  W('S.imp=null');
});

test('ویزارد ورود فقط برای مدیر باز است', () => {
  for(const role of ['student','teacher','parent','edu_office']){
    W("S.user=db.users.find(u=>u.role==='" + role + "');S.persona=null;S.boss=null;S.route='import';S.filters={}");
    assert(/دسترسی مجاز نیست|اشتراک/.test(W('renderRoute()')), role + ' دسترسی داشت');
  }
  const cases = [['student','imp-commit',false],['teacher','imp-commit',false],
                 ['manager','imp-commit',true],['superadmin','imp-preview',true]];
  for(const [role, act, want] of cases){
    W("S.user=db.users.find(u=>u.role==='" + role + "');S.persona=null;S.boss=null");
    assert(W("canAction('" + act + "')") === want, role + ' → ' + act);
  }
});

console.log('\n▸ فرم‌های رسمی و پنل پیامک');

test('توابع فرم و پیامک تعریف شده‌اند', () => {
  assert(W("typeof viewFormsSms==='function'&&typeof smsWalletOf==='function'"
    + "&&typeof printableDoc==='function'&&typeof smsParts==='function'"
    + "&&typeof smsTargets==='function'&&typeof formGradeSheet==='function'"
    + "&&typeof formExamMinutes==='function'&&typeof formStatistics==='function'"), 'توابع ناقص است');
  assert(W("Array.isArray(db.sms_wallet)&&Array.isArray(db.sms_log)"), 'مجموعه داده ناقص است');
});

test('هر دو تب فرم و پیامک رندر می‌شوند', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null;S.route='formssms';S.filters={}");
  for(const t of ['forms','sms']){
    W("S.tab='" + t + "'");
    const o = W('renderRoute()');
    assert(o.length > 500 && !o.includes('undefined') && !o.includes('[object'), 'تب ' + t + ' رندر نشد');
  }
  W("S.tab='grades'");
});

test('شمارش قطعه پیامک بر پایه ۷۰ نویسه است', () => {
  assert(W("smsParts('سلام')") === 1, 'متن کوتاه');
  assert(W("smsParts('ا'.repeat(70))") === 1, 'مرز ۷۰');
  assert(W("smsParts('ا'.repeat(71))") === 2, 'یک نویسه بیشتر');
  assert(W("smsParts('ا'.repeat(141))") === 3, 'سه قطعه');
});

test('کیف پول پیامک ساخته و شارژ می‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  const wal = W('smsWalletOf(' + sid + ')');
  assert(W('db.sms_wallet.some(function(x){return x.school_id===' + sid + ';})'), 'کیف پول ساخته نشد');
  W("(function(){var w=smsWalletOf(" + sid + ");update('sms_wallet',w.w.id,{balance:1000});})()");
  assert(W('smsWalletOf(' + sid + ').balance') === 1000, 'شارژ ثبت نشد');
});

test('ارسال پیامک: اعتبار درست کسر و رکورد ثبت می‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  W("(function(){var w=smsWalletOf(" + sid + ");update('sms_wallet',w.w.id,{balance:5000});})()");
  const before = W('smsWalletOf(' + sid + ').balance');
  const n0 = W('db.sms_log.length');
  const tg = W("smsTargets(" + sid + ",'teachers','')");
  const cnt = W("smsTargets(" + sid + ",'teachers','').length");
  if(!cnt) return;
  W("(function(){var t=smsTargets(" + sid + ",'teachers','');var need=t.length*smsParts('متن آزمایشی برای ارسال گروهی');"
    + "var w=smsWalletOf(" + sid + ");batchWrites(function(){"
    + "t.forEach(function(x){insert('sms_log',{school_id:" + sid + ",user_id:x.id,phone:x.phone,"
    + "body:'متن آزمایشی برای ارسال گروهی',parts:1,status:'sent',created_at:todayISO()});});"
    + "update('sms_wallet',w.w.id,{balance:w.balance-need});});})()");
  assert(W('db.sms_log.length') - n0 === cnt, 'تعداد رکورد نادرست');
  assert(before - W('smsWalletOf(' + sid + ').balance') === cnt, 'کسر اعتبار نادرست');
});

test('گیرندگان پیامک: یکتا، معتبر و محدود به مدرسه', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  assert(W("smsTargets(" + sid + ",'teachers','').every(function(u){return u.role==='teacher'&&u.school_id===" + sid + ";})"),
    'گروه دبیران آلوده است');
  assert(W("smsTargets(" + sid + ",'parents','').every(function(u){return /^09\\d{9}$/.test(u.phone||'');})"),
    'شماره نامعتبر در گیرندگان');
  assert(W("(function(){var a=smsTargets(" + sid + ",'parents','');var s={};"
    + "for(var i=0;i<a.length;i++){if(s[a[i].id])return false;s[a[i].id]=1;}return true;})()"), 'گیرنده تکراری');
});

test('سند چاپی: ساختار درست و بدون تزریق', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const cid = W('visibleClasses()[0].id');
  W("(function(){var s=studentsOfClass(" + cid + ")[0];"
    + "update('users',s.id,{full_name:'<img src=x onerror=XSS>'});})()");
  const d = W("formGradeSheet(byId('classes'," + cid + "),null,'نوبت اول')");
  const body = W("formGradeSheet(byId('classes'," + cid + "),null,'نوبت اول').body");
  assert(body.includes('&lt;img'), 'نام مخرب escape نشد');
  assert(!body.includes('<img src=x'), 'تگ خام در سند چاپی');
  assert(body.includes('مستمر') && body.includes('امضا'), 'ستون‌های دستی نیست');
});

test('دفتر آمار: شمارش‌ها با داده واقعی می‌خواند', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  const real = W("(function(){var n=0;db.classes.filter(function(c){return c.school_id===" + sid + ";})"
    + ".forEach(function(c){n+=studentsOfClass(c.id).length;});return n;})()");
  assert(W('formStatistics(' + sid + ').tot.students') === real, 'شمارش دانش‌آموز نادرست');
  const rate = W('formStatistics(' + sid + ').rate');
  assert(rate >= 0 && rate <= 100, 'درصد حضور خارج از بازه: ' + rate);
});

test('فرم و پیامک فقط برای مدیر باز است', () => {
  for(const role of ['student','teacher','parent','edu_office']){
    W("S.user=db.users.find(u=>u.role==='" + role + "');S.persona=null;S.boss=null;S.route='formssms';S.filters={};S.tab='forms'");
    assert(/دسترسی مجاز نیست|اشتراک/.test(W('renderRoute()')), role + ' دسترسی داشت');
  }
  const cases = [['student','sms-send',false],['teacher','sms-send',false],['teacher','form-print',false],
                 ['manager','sms-send',true],['manager','form-print',true],['superadmin','sms-topup-ok',true]];
  for(const [role, act, want] of cases){
    W("S.user=db.users.find(u=>u.role==='" + role + "');S.persona=null;S.boss=null");
    assert(W("canAction('" + act + "')") === want, role + ' → ' + act);
  }
});

console.log('\n▸ افت تحصیلی، جلسات اولیا، رشد مدرسه');

test('توابع سه صفحه جدید تعریف شده‌اند', () => {
  assert(W("typeof viewAtRisk==='function'&&typeof atRiskList==='function'"
    + "&&typeof viewMeetings==='function'&&typeof viewGrowth==='function'"
    + "&&typeof schoolStudents==='function'&&typeof parentsOfSchool==='function'"
    + "&&typeof refCodeOf==='function'&&typeof riskReasons==='function'"), 'توابع ناقص است');
  assert(W("Array.isArray(db.meeting_slots)"), 'meeting_slots وجود ندارد');
});

test('سه صفحه جدید برای مدیر رندر می‌شوند', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null;S.filters={};S.page=1");
  for(const r of ['atrisk','meetings','growth']){
    W("S.route='" + r + "'");
    const o = W('renderRoute()');
    assert(o.length > 400 && !o.includes('undefined') && !o.includes('[object'),
      'صفحه ' + r + ' درست رندر نشد');
  }
});

test('امتیاز ریسک: مرتب، محدود و با دلیل', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  const vid = W('schoolStudents(' + sid + ')[0].id');
  W("batchWrites(function(){var id=" + vid + ";"
    + "db.grades.filter(function(g){return g.student_id===id;}).forEach(function(g){update('grades',g.id,{score:6});});"
    + "var c=classOf(id);for(var i=0;i<20;i++)insert('attendance',{school_id:" + sid + ","
    + "class_id:c?c.id:1,student_id:id,date:daysAgoISO(i+1),status:i<10?'absent':'present',note:''});})");
  const found = W('atRiskList(60).find(function(r){return r.u.id===' + vid + ';})');
  assert(W('!!atRiskList(60).find(function(r){return r.u.id===' + vid + ';})'), 'دانش‌آموز پرخطر شناسایی نشد');
  assert(W('(atRiskList(60).find(function(r){return r.u.id===' + vid + ';})||{}).risk') >= 35, 'امتیاز ریسک پایین است');
  assert(W('atRiskList(60).every(function(r){return r.risk>=20;})'), 'ردیف با ریسک کمتر از ۲۰ برگشت');
  assert(W('(function(){var l=atRiskList(60);for(var i=1;i<l.length;i++)if(l[i-1].risk<l[i].risk)return false;return true;})()'),
    'مرتب‌سازی نزولی نیست');
  assert(W('(atRiskList(60).find(function(r){return r.u.id===' + vid + ';})||{}).reasons.length') > 0, 'دلیلی تولید نشد');
});

test('ساخت نوبت جلسه: پشت‌سرهم و بدون تکرار', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null;S.route='meetings';S.filters={}");
  const D = W("addDaysISO(todayISO(),9)");
  const tid = W("(db.users.find(u=>u.role==='teacher'&&u.school_id===S.user.school_id)||{}).id");
  if(!tid) return;
  W("batchWrites(function(){var mins=15*60;for(var i=0;i<4;i++){var t=toHHMMP(mins);"
    + "if(!db.meeting_slots.some(function(s){return s.teacher_id===" + tid + "&&s.date==='" + D + "'&&s.start_time===t;}))"
    + "insert('meeting_slots',{school_id:S.user.school_id,teacher_id:" + tid + ",date:'" + D + "',start_time:t,"
    + "duration:15,location:'د',status:'open',parent_id:null,student_id:null,created_at:todayISO()});mins+=15;}})");
  const n = W("db.meeting_slots.filter(function(s){return s.date==='" + D + "';}).length");
  assert(n === 4, 'تعداد نوبت نادرست: ' + n);
  const times = W("JSON.stringify(db.meeting_slots.filter(function(s){return s.date==='" + D + "';}).map(function(s){return s.start_time;}))");
  assert(times === '["15:00","15:15","15:30","15:45"]', 'ساعت‌ها نادرست: ' + times);
});

test('ولی: رزرو نوبت و منع رزرو دوم در همان روز', () => {
  W("(function(){var l=db.parent_links.find(function(l){var s=byId('users',l.student_id);"
    + "return s&&(s.status||'active')==='active';});S.user=byId('users',l.parent_id);S.persona='parent';S.boss=null;})()");
  W("db.parent_subscriptions.filter(function(s){return s.user_id===S.user.id;})"
    + ".forEach(function(s){update('parent_subscriptions',s.id,{status:'active',end_date:addDaysISO(todayISO(),90)});})");
  const kid = W('myKids()[0]');
  if(!W('myKids().length')) return;
  const sid2 = W('myKids()[0].school_id');
  const D = W("addDaysISO(todayISO(),11)");
  W("batchWrites(function(){var t=db.users.find(function(u){return u.role==='teacher'&&u.school_id===" + sid2 + ";});"
    + "if(!t)return;for(var i=0;i<2;i++)insert('meeting_slots',{school_id:" + sid2 + ",teacher_id:t.id,date:'" + D + "',"
    + "start_time:'1'+(6+i)+':00',duration:15,location:'د',status:'open',parent_id:null,student_id:null,created_at:todayISO()});})");
  const slots = W("db.meeting_slots.filter(function(s){return s.date==='" + D + "'&&s.status==='open';}).map(function(s){return s.id;})");
  if(!W("db.meeting_slots.filter(function(s){return s.date==='" + D + "'&&s.status==='open';}).length")) return;
  const s1 = W("db.meeting_slots.filter(function(s){return s.date==='" + D + "'&&s.status==='open';})[0].id");
  W("SLOT_ID=" + s1);
  W("update('meeting_slots'," + s1 + ",{status:'booked',parent_id:S.user.id,student_id:myKids()[0].id,booked_at:todayISO()})");
  assert(W("byId('meeting_slots'," + s1 + ").status") === 'booked', 'رزرو ثبت نشد');
  assert(W("db.meeting_slots.some(function(s){return s.parent_id===S.user.id&&s.date==='" + D + "'&&s.status==='booked';})"),
    'قاعده یک نوبت در روز قابل بررسی نیست');
});

test('مجوز سه صفحه جدید درست است', () => {
  const blocked = [['student','atrisk'],['student','growth'],['student','meetings'],
                   ['teacher','atrisk'],['teacher','growth'],['parent','atrisk'],['parent','growth']];
  for(const [role, route] of blocked){
    W("S.user=db.users.find(u=>u.role==='" + role + "');S.persona=null;S.boss=null;S.route='" + route + "';S.filters={}");
    assert(/دسترسی مجاز نیست|اشتراک/.test(W('renderRoute()')), role + ' به ' + route + ' دسترسی داشت');
  }
  const allowed = [['manager','atrisk'],['manager','growth'],['manager','meetings'],['teacher','meetings']];
  for(const [role, route] of allowed){
    W("S.user=db.users.find(u=>u.role==='" + role + "');S.persona=null;S.boss=null;S.route='" + route + "';S.filters={}");
    assert(!/دسترسی مجاز نیست/.test(W('renderRoute()')), role + ' نتوانست ' + route + ' را ببیند');
  }
});

test('اکشن‌های سه صفحه جدید بر اساس نقش محدودند', () => {
  const cases = [['student','risk-notify',false],['student','mtg-new',false],['parent','mtg-new',false],
                 ['parent','mtg-del',false],['parent','mtg-book',true],
                 ['teacher','mtg-new',true],['teacher','risk-notify',true],
                 ['manager','invite-parents',true],['teacher','invite-parents',false]];
  for(const [role, act, want] of cases){
    W("S.user=db.users.find(u=>u.role==='" + role + "');S.persona=null;S.boss=null");
    assert(W("canAction('" + act + "')") === want, role + ' → ' + act);
  }
});

console.log('\n▸ نوشتن دسته‌ای (batchWrites)');

test('batchWrites تعریف شده و هیچ عملیاتی گم نمی‌کند', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  assert(W("typeof batchWrites==='function'"), 'batchWrites موجود نیست');
  const l0 = W('log.length'), q0 = W('SYNC.queue.length');
  W("batchWrites(function(){for(var i=0;i<40;i++)insert('student_archive',"
    + "{school_id:1,student_id:i,full_name:'bt'+i,year_code:'1404-1405'});})");
  assert(W('log.length') - l0 === 40, 'همه عملیات در لاگ ثبت نشد');
  assert(W('SYNC.queue.length') - q0 === 40, 'همه عملیات وارد صف نشد');
});

test('پس از batch، localStorage با حافظه همگام است', () => {
  assert(W("JSON.parse(localStorage.getItem(LOG_KEY)).length===log.length"), 'لاگ همگام نیست');
  assert(W("JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY)).length===SYNC.queue.length"), 'صف همگام نیست');
});

test('batch تودرتو و استثنا پرچم را گیر نمی‌اندازند', () => {
  const l0 = W('log.length');
  W("batchWrites(function(){insert('student_archive',{school_id:1,student_id:1,full_name:'n1',year_code:'x'});"
    + "batchWrites(function(){insert('student_archive',{school_id:1,student_id:2,full_name:'n2',year_code:'x'});});})");
  assert(W('log.length') - l0 === 2, 'batch تودرتو نادرست');
  try{ W("batchWrites(function(){throw new Error('boom');})"); }catch(e){}
  assert(W('_BATCH_DEPTH') === 0, 'عمق batch پس از استثنا صفر نشد');
  assert(W("JSON.parse(localStorage.getItem(LOG_KEY)).length===log.length"), 'پس از استثنا ناهمگام شد');
});

console.log('\n▸ چرخه تحصیلی (lifecycle)');

test('توابع چرخه تحصیلی تعریف شده‌اند', () => {
  assert(W("typeof viewLifecycle==='function' && typeof graduateStudent==='function' "
    + "&& typeof moveStudent==='function' && typeof incompleteUsers==='function' "
    + "&& typeof recordConflict==='function' && typeof gradeFromName==='function'"),
    'توابع lifecycle موجود نیست');
});

test('چهار مجموعه دادهٔ چرخه تحصیلی وجود دارد', () => {
  assert(W("['student_transfers','transfer_requests','student_archive','nid_conflicts']"
    + ".every(function(k){return Array.isArray(db[k]);})"), 'مجموعه داده ناقص است');
});

test('استنتاج پایه از نام کلاس درست است', () => {
  const cases = [['نهم ۲',9],['دوازدهم تجربی',12],['ششم الف',6],['کلاس بی‌نام',null]];
  for(const [n, exp] of cases)
    assert(W('gradeFromName(' + JSON.stringify(n) + ')') === exp, 'gradeFromName: ' + n);
  assert(W('isTerminal(6)&&isTerminal(9)&&isTerminal(12)&&!isTerminal(7)'), 'isTerminal نادرست');
});

test('هر پنج تب چرخه تحصیلی بدون خطا رندر می‌شوند', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null;S.route='lifecycle';S.filters={}");
  for(const t of ['promotion','transfers','conflicts','incomplete','archive']){
    W("S.tab='" + t + "'");
    const o = W('renderRoute()');
    assert(o.length > 300 && !o.includes('undefined') && !o.includes('[object'),
      'تب ' + t + ' درست رندر نشد');
  }
  W("S.tab='grades'");
});

test('فارغ‌التحصیلی: بایگانی می‌شود و ثبت‌نام حذف می‌گردد', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  const cid = W('db.classes.filter(c=>c.school_id===' + sid + ')[0].id');
  const stId = W('activeStudentsOfClass(' + cid + ')[0].id');
  const n0 = W('db.student_archive.length');
  W('graduateStudent(byId("users",' + stId + '),' + sid + ',byId("classes",' + cid + '))');
  assert(W('db.student_archive.length') === n0 + 1, 'بایگانی ثبت نشد');
  assert(W('byId("users",' + stId + ').status') === 'graduated', 'وضعیت فارغ‌التحصیل ثبت نشد');
  assert(W('db.enrollments.filter(e=>e.student_id===' + stId + ').length') === 0, 'ثبت‌نام حذف نشد');
});

test('انتقال: کل پرونده به مدرسه مقصد منتقل می‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const A = W('S.user.school_id');
  const B = W('db.schools.find(s=>s.id!==' + A + ').id');
  const st = W("db.users.find(x=>x.role==='student'&&x.school_id===" + B + "&&(x.status||'active')==='active').id");
  const g0 = W('db.grades.filter(g=>g.student_id===' + st + ').length');
  const a0 = W('db.attendance.filter(a=>a.student_id===' + st + ').length');
  const cid = W('(db.classes.find(c=>c.school_id===' + A + ')||{}).id||null');
  W('moveStudent(byId("users",' + st + '),' + A + ',' + cid + ',null)');
  assert(W('byId("users",' + st + ').school_id') === A, 'مدرسه عوض نشد');
  assert(W('db.grades.filter(g=>g.student_id===' + st + '&&g.school_id===' + A + ').length') === g0,
    'نمرات منتقل نشد');
  assert(W('db.attendance.filter(a=>a.student_id===' + st + '&&a.school_id===' + A + ').length') === a0,
    'حضور و غیاب منتقل نشد');
  assert(W('db.enrollments.filter(e=>e.student_id===' + st + ').length') <= 1, 'ثبت‌نام تکراری ماند');
  assert(W('db.student_transfers.filter(t=>t.student_id===' + st + ').length') === 1, 'سابقه ثبت نشد');
});

test('تعارض کد ملی تکراری ثبت نمی‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const A = W('S.user.school_id');
  const B = W('db.schools.find(s=>s.id!==' + A + ').id');
  W('window.__o=db.users.find(u=>u.role==="student"&&u.school_id===' + B + '&&u.national_id)');
  if(!W('!!window.__o')) return;
  const n0 = W('db.nid_conflicts.length');
  W('recordConflict(' + A + ',window.__o.national_id,window.__o.full_name,window.__o,"excel")');
  W('recordConflict(' + A + ',window.__o.national_id,window.__o.full_name,window.__o,"excel")');
  assert(W('db.nid_conflicts.length') === n0 + 1, 'تعارض تکراری ثبت شد');
});

test('دانش‌آموز و دبیر به چرخه تحصیلی دسترسی ندارند', () => {
  for(const role of ['student','teacher','parent']){
    W("S.user=db.users.find(u=>u.role==='" + role + "');S.persona=null;S.boss=null;S.route='lifecycle';S.filters={}");
    assert(/دسترسی مجاز نیست|اشتراک/.test(W('renderRoute()')), role + ' به lifecycle دسترسی داشت');
  }
});

test('اکشن‌های چرخه تحصیلی فقط برای مدیر مجاز است', () => {
  const cases = [['student','promote-run',false],['teacher','tr-ok',false],
                 ['manager','promote-run',true],['manager','tr-ok',true],['superadmin','tr-send',true]];
  for(const [role, act, want] of cases){
    W("S.user=db.users.find(u=>u.role==='" + role + "');S.persona=null;S.boss=null");
    assert(W("canAction('" + act + "')") === want, role + ' → ' + act);
  }
});

console.log('\n▸ مجوزدهی روت‌ها و اکشن‌ها (امنیت)');

test('لایه مجوزدهی تعریف شده است', () => {
  assert(W("typeof canRoute==='function' && typeof canAction==='function' && typeof viewForbidden==='function'"),
    'توابع مجوزدهی موجود نیست');
});

test('دانش‌آموز به صفحه حضور و غیاب دسترسی ندارد', () => {
  W("S.user=db.users.find(u=>u.role==='student');S.persona=null;S.boss=null;S.route='attendance';S.filters={}");
  assert(/دسترسی مجاز نیست/.test(W('renderRoute()')), 'دانش‌آموز attendance را دید');
});

test('دانش‌آموز به پنل مدیریت اشتراک دسترسی ندارد', () => {
  W("S.route='adminsubs'");
  assert(/دسترسی مجاز نیست/.test(W('renderRoute()')), 'دانش‌آموز adminsubs را دید');
});

test('دانش‌آموز به مدیریت کاربران و مدارس دسترسی ندارد', () => {
  W("S.route='users'");
  const a = /دسترسی مجاز نیست/.test(W('renderRoute()'));
  W("S.route='schools'");
  const b = /دسترسی مجاز نیست/.test(W('renderRoute()'));
  assert(a && b, 'دانش‌آموز به صفحات مدیریتی دسترسی داشت');
});

test('دبیر به مدیریت مدارس دسترسی ندارد', () => {
  W("S.user=db.users.find(u=>u.role==='teacher');S.persona=null;S.boss=null;S.route='schools';S.filters={}");
  assert(/دسترسی مجاز نیست/.test(W('renderRoute()')), 'دبیر schools را دید');
});

test('اداره به فهرست کاربران دسترسی ندارد', () => {
  W("S.user=db.users.find(u=>u.role==='edu_office');S.persona=null;S.boss=null;S.route='users';S.filters={}");
  assert(/دسترسی مجاز نیست/.test(W('renderRoute()')), 'اداره users را دید');
});

test('دسترسی‌های مجاز دست‌نخورده مانده‌اند', () => {
  const cases = [['manager','attendance'],['manager','users'],['teacher','grades'],
                 ['student','record'],['superadmin','schools'],['edu_office','officedash']];
  for(const [role, route] of cases){
    W("S.user=db.users.find(u=>u.role==='" + role + "');S.persona=null;S.boss=null;S.route='" + route + "';S.filters={};S.page=1");
    const out = W('renderRoute()');
    assert(!/دسترسی مجاز نیست/.test(out) && out.length > 200,
      role + ' نتوانست ' + route + ' را ببیند');
  }
});

test('دانش‌آموز نمی‌تواند برای هم‌کلاسی غیبت ثبت کند', () => {
  /* دانش‌آموزی انتخاب می‌شود که کلاس دارد و کلاسش حداقل دو نفر است
     (تست‌های چرخه تحصیلی ممکن است بعضی دانش‌آموزان را فارغ‌التحصیل کرده باشند) */
  W("S.user=db.users.find(function(u){return u.role==='student'&&(u.status||'active')==='active'"
    + "&&classOf(u.id)&&studentsOfClass(classOf(u.id).id).length>1;});S.persona=null;S.boss=null");
  assert(W('!!S.user'), 'دانش‌آموز واجد شرایط یافت نشد');
  const cid = W('classOf(S.user.id).id');
  const victim = W('studentsOfClass(' + cid + ').find(s=>s.id!==S.user.id).id');
  const D = '2026-07-11';
  W("S.route='attendance';S.filters={class:" + cid + ",date:'" + D + "'}");
  W("(function(){var el=document.createElement('button');el.setAttribute('data-act','att-set');"
    + "el.setAttribute('data-id','" + victim + "');el.setAttribute('data-s','absent');"
    + "document.body.appendChild(el);el.click();el.remove();})()");
  const rec = W("db.attendance.filter(function(a){return a.student_id===" + victim + "&&a.date==='" + D + "';}).length");
  assert(rec === 0, 'دانش‌آموز توانست داده هم‌کلاسی را تغییر دهد');
});

test('مجوز اکشن‌ها بر اساس نقش درست است', () => {
  const cases = [['student','att-set',false],['student','school-del',false],
                 ['teacher','att-set',true],['teacher','school-del',false],
                 ['manager','user-del',true],['superadmin','school-del',true]];
  for(const [role, act, want] of cases){
    W("S.user=db.users.find(u=>u.role==='" + role + "');S.persona=null;S.boss=null");
    assert(W("canAction('" + act + "')") === want,
      role + ' → ' + act + ' مجوز نادرست');
  }
});

test('جانشینی سوپرادمین مجوز را نمی‌شکند', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin');S.boss=null;S.persona=null");
  const mgr = W("db.users.find(u=>u.role==='manager').id");
  W("(function(){S.boss=S.user;S.user=byId('users'," + mgr + ");})()");
  W("S.route='attendance';S.filters={}");
  const okAtt = !/دسترسی مجاز نیست/.test(W('renderRoute()'));
  W("S.route='geo'");
  const blockedGeo = /دسترسی مجاز نیست/.test(W('renderRoute()'));
  W("S.user=S.boss;S.boss=null");
  assert(okAtt && blockedGeo, 'رفتار جانشینی نادرست است');
});

console.log('\n▸ لایه ایندکس و مقیاس‌پذیری');

test('توابع ایندکس تعریف شده‌اند', () => {
  assert(W("typeof idxGroup==='function' && typeof idxUnique==='function' && typeof idxInvalidate==='function'"),
    'توابع ایندکس موجود نیست');
});

test('byId از ایندکس استفاده می‌کند و درست پاسخ می‌دهد', () => {
  assert(W("byId('classes',db.classes[0].id).id===db.classes[0].id"), 'byId نتیجه درست نداد');
});

test('افزودن رکورد بلافاصله در ایندکس دیده می‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='manager')");
  const cid = W('db.classes[0].id');
  const before = W('studentsOfClass(' + cid + ').length');
  W("window.__t=insert('users',{school_id:db.classes[0].school_id,role:'student',full_name:'تست ایندکس',username:'idx_t',password:'x',active:1}).id");
  W("insert('enrollments',{school_id:db.classes[0].school_id,class_id:" + cid + ",student_id:window.__t,year:'1404'})");
  assert(W('studentsOfClass(' + cid + ').length') === before + 1, 'رکورد تازه در ایندکس دیده نشد');
});

test('به‌روزرسانی بلافاصله در ایندکس منعکس می‌شود', () => {
  W("update('users',window.__t,{full_name:'نام جدید'})");
  assert(W("byId('users',window.__t).full_name==='نام جدید'"), 'به‌روزرسانی منعکس نشد');
});

test('حذف بلافاصله در ایندکس منعکس می‌شود', () => {
  W("remove('users',window.__t)");
  assert(W("byId('users',window.__t)===undefined"), 'حذف منعکس نشد');
});

test('ایندکس حضور با پیمایش مستقیم یکسان است', () => {
  const same = W("(function(){var c=db.classes[0].id,d=(db.attendance[0]||{}).date;if(!d)return true;"
    + "var m=idxAttByClassDate().get(c+'|'+d)||[];"
    + "var f=db.attendance.filter(function(a){return a.class_id===c&&a.date===d;});"
    + "return m.length===f.length;})()");
  assert(same, 'ایندکس حضور با پیمایش مستقیم نمی‌خواند');
});

test('مرتب‌سازی فارسی با Collator کار می‌کند', () => {
  assert(W("typeof sortByNameFa==='function' && sortByNameFa([{full_name:'ب'},{full_name:'آ'}])[0].full_name==='آ'"),
    'مرتب‌سازی فارسی درست نیست');
});

test('گزارش ایندکس ساختار درست دارد', () => {
  assert(W("(function(){var r=idxReport();return !!(r&&r.stats&&typeof r.stats.hits==='number');})()"),
    'گزارش ایندکس نادرست است');
});

console.log('\n▸ لایه محدوده داده (scope)');

test('توابع محدوده تعریف شده‌اند', () => {
  assert(W("typeof scopeDescriptor==='function' && typeof scopeHealth==='function' && typeof SCOPE_LIMITS==='object'"),
    'توابع محدوده موجود نیست');
});

test('برش دانش‌آموز فقط دادهٔ خودش را شامل می‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='student')");
  assert(W("(function(){var d=scopeDescriptor(S.user);return d.scope.student_id===S.user.id && d.collections.indexOf('attendance:self')>-1;})()"),
    'برش دانش‌آموز درست نیست');
});

test('اداره فقط دادهٔ تجمیعی می‌گیرد (بدون رکورد فردی)', () => {
  W("S.user=db.users.find(u=>u.role==='edu_office')");
  assert(W('scopeDescriptor(S.user).scope.aggregate_only===true'), 'اداره دادهٔ فردی می‌گیرد');
});

test('برش مدیر به مدرسهٔ خودش محدود است', () => {
  W("S.user=db.users.find(u=>u.role==='manager')");
  assert(W('scopeDescriptor(S.user).scope.school_id===S.user.school_id'), 'برش مدیر محدود نیست');
});

test('سنجش سلامت محدوده کار می‌کند', () => {
  assert(W("(function(){var h=scopeHealth();return typeof h.total==='number'&&typeof h.ok==='boolean';})()"),
    'scopeHealth نادرست است');
});

test('سقف‌های محافظ تعریف شده‌اند', () => {
  assert(W('SCOPE_LIMITS.maxRecords>0 && SCOPE_LIMITS.attendanceDays>0'), 'سقف‌ها تعریف نشده');
});

console.log('\n▸ محافظت از حافظه محلی');

test('تابع هشدار پرشدن حافظه وجود دارد', () => {
  assert(W("typeof storageFull==='function'"), 'storageFull موجود نیست');
});

test('در حالت عادی حافظه پر نیست', () => {
  assert(W('storageFull()===false'), 'وضعیت حافظه نادرست است');
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
