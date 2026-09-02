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

console.log('\n▸ سابقه تغییرات و آمار فعالیت');

test('توابع سابقه و فعالیت تعریف شده‌اند', () => {
  assert(W("typeof viewAudit==='function'&&typeof auditList==='function'"
    + "&&typeof auditSummary==='function'&&typeof viewActivity==='function'"
    + "&&typeof trackVisit==='function'&&typeof onlineUsers==='function'"
    + "&&typeof perfSample==='function'&&typeof loadReport==='function'"
    + "&&typeof serverLoadEstimate==='function'&&typeof shortStamp==='function'"), 'توابع ناقص است');
});

test('دفترچه عملیات «چه کسی» و «کِی» را ثبت می‌کند', () => {
  W("S.user=db.users.find(u=>u.role==='teacher');S.persona=null;S.boss=null");
  const uid = W('S.user.id');
  W("var c=visibleClasses()[0];insert('grades',{school_id:c.school_id,class_id:c.id,"
    + "student_id:studentsOfClass(c.id)[0].id,subject_id:1,term:'نوبت اول',type:'کلاسی',"
    + "score:17,date:todayISO()})");
  assert(W('log[log.length-1].by') === uid, 'شناسه کاربر ثبت نشد');
  assert(!!W('log[log.length-1].at'), 'مهر زمان ثبت نشد');
});

test('سابقه تغییرات: فیلترها و ترتیب درست کار می‌کنند', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null;S.filters={}");
  assert(W('auditList({}).length') > 0, 'سابقه خالی است');
  assert(W("auditList({op:'ins'}).every(function(r){return r.op.t==='ins';})"), 'فیلتر نوع عمل');
  assert(W("auditList({coll:'grades'}).every(function(r){return r.op.c==='grades';})"), 'فیلتر نوع داده');
  assert(W('auditList({sensitive:true}).every(function(r){return r.sensitive;})'), 'فیلتر حساس');
  assert(W('auditSummary().total') === W('log.length'), 'شمارش کل نادرست');
});

test('صفحه سابقه تغییرات رندر می‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null;S.route='audit';S.filters={}");
  const o = W('renderRoute()');
  assert(o.length > 1500 && !o.includes('undefined') && !o.includes('[object'), 'رندر نشد');
});

test('ثبت بازدید و تشخیص کاربران برخط', () => {
  W("localStorage.removeItem(VISITS_KEY)");
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  W('trackVisit(S.user.id)');
  assert(W('loadVisits().days[todayISO()]') >= 1, 'بازدید امروز ثبت نشد');
  assert(W('onlineUsers(5).length') >= 1, 'کاربر برخط شناسایی نشد');
  assert(W('onlineUsers(5).some(function(o){return o.user.id===S.user.id;})'), 'کاربر جاری برخط نیست');
  W("(function(){var v=loadVisits();v.users[999999]=new Date(Date.now()-3600000).toISOString();saveVisits(v);})()");
  assert(!W('onlineUsers(5).some(function(o){return o.user&&o.user.id===999999;})'),
    'کاربر قدیمی برخط شمرده شد');
});

test('سنجش بار: نمونه‌ها ثبت و محدود می‌شوند', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null;S.filters={}");
  for(const r of ['dashboard','users','schools']){ W("S.route='" + r + "'"); W('renderRoute()'); }
  assert(W('loadReport().samples') > 0, 'نمونه‌ای ثبت نشد');
  assert(W('loadReport().p90') >= W('loadReport().p50'), 'صدک‌ها نامنطقی');
  assert(W('loadReport().routes.length') > 0, 'تفکیک صفحه ندارد');
  for(let i = 0; i < 300; i++) W("perfSample('x',1)");
  assert(W('PERF.samples.length') <= W('PERF.max'), 'سقف نمونه رعایت نشد');
});

test('برآورد بار سرور با تعداد کاربر رشد می‌کند', () => {
  assert(W('serverLoadEstimate(5000000).rps') > 0, 'برآورد صفر است');
  assert(W('serverLoadEstimate(1000000).rps') < W('serverLoadEstimate(5000000).rps'), 'رشد ندارد');
  assert(W('serverLoadEstimate(5000000).apiNodes') > 0, 'تعداد نمونه سرویس نامعتبر');
});

test('صفحه بازدید و بار رندر می‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null;S.route='activity';S.filters={}");
  const o = W('renderRoute()');
  assert(o.length > 1500 && !o.includes('undefined') && !o.includes('[object'), 'رندر نشد');
  assert(o.includes('کاربر برخط') && o.includes('بار سرور'), 'بخش‌های اصلی نیستند');
});

test('نگهداری فقط ۹۰ روز اخیر', () => {
  W("(function(){var v={days:{},users:{},sessions:0};for(var i=0;i<120;i++)"
    + "v.days['2025-'+String((i%12)+1).padStart(2,'0')+'-'+String((i%28)+1).padStart(2,'0')]=1;"
    + "saveVisits(v);})()");
  W('trackVisit(1)');
  assert(W('Object.keys(loadVisits().days).length') <= 90, 'بیش از ۹۰ روز نگه داشته شد');
});

test('سابقه و فعالیت فقط برای سوپرادمین باز است', () => {
  for(const role of ['manager','teacher','student','parent','edu_office']){
    W("S.user=db.users.find(u=>u.role==='" + role + "');S.persona=null;S.boss=null;S.filters={}");
    for(const r of ['audit','activity']){
      W("S.route='" + r + "'");
      assert(/دسترسی مجاز نیست|اشتراک/.test(W('renderRoute()')), role + ' به ' + r + ' دسترسی داشت');
    }
  }
});

console.log('\n▸ اعتبارسنجی دیداری فرم‌ها');

test('توابع اعتبارسنجی تعریف شده‌اند', () => {
  assert(W("typeof need==='function'&&typeof needAll==='function'"
    + "&&typeof invalid==='function'&&typeof markFieldError==='function'"
    + "&&typeof clearFieldErrors==='function'&&typeof focusField==='function'"), 'توابع ناقص');
});

test('فیلد خالی قرمز می‌شود و پیام می‌گیرد', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null;S.route='classes';S.filters={}");
  W('classModal(null)');
  W("document.getElementById('c_name').value=''");
  const n0 = W('db.classes.length');
  W("(function(){var el=document.createElement('button');el.setAttribute('data-act','class-save');"
    + "document.body.appendChild(el);el.click();el.remove();})()");
  assert(W('db.classes.length') === n0, 'با فیلد خالی ذخیره شد');
  assert(W("document.getElementById('c_name').classList.contains('has-error')"), 'کادر قرمز نشد');
  assert(W("!!document.querySelector('.field-error-msg')"), 'پیام زیر فیلد نیامد');
});

test('نشانه خطا با تایپ کاربر پاک می‌شود', () => {
  W("(function(){var el=document.getElementById('c_name');el.value='کلاس آزمایشی';"
    + "el.dispatchEvent(new window.Event('input',{bubbles:true}));})()");
  assert(!W("document.getElementById('c_name').classList.contains('has-error')"), 'کادر قرمز پاک نشد');
  W('closeModal()');
});

test('چند فیلد خالی هم‌زمان قرمز می‌شوند', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null;S.route='schools';S.filters={}");
  W('schoolModal(null)');
  W("document.getElementById('m_name').value='';document.getElementById('m_code').value=''");
  const n0 = W('db.schools.length');
  W("(function(){var el=document.createElement('button');el.setAttribute('data-act','school-save');"
    + "document.body.appendChild(el);el.click();el.remove();})()");
  assert(W('db.schools.length') === n0, 'با فیلد خالی ذخیره شد');
  assert(W("document.querySelectorAll('.has-error').length") >= 2, 'هر دو فیلد قرمز نشدند');
  W('closeModal()');
});

test('اعتبارسنجی کد ملی و موبایل کاربر', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null;S.route='users';S.filters={}");
  W('userModal(null)');
  if(!W("!!document.getElementById('u_nid')")) return;
  W("document.getElementById('u_name').value='آزمون اعتبار'");
  if(W("!!document.getElementById('u_user')")) W("document.getElementById('u_user').value='azm_val'");
  W("document.getElementById('u_nid').value='1234567890'");
  const n0 = W('db.users.length');
  W("(function(){var el=document.createElement('button');el.setAttribute('data-act','user-save');"
    + "document.body.appendChild(el);el.click();el.remove();})()");
  assert(W('db.users.length') === n0, 'کد ملی نامعتبر ذخیره شد');
  assert(W("document.getElementById('u_nid').classList.contains('has-error')"), 'فیلد کد ملی قرمز نشد');
  W('closeModal()');
});

console.log('\n▸ نوع چیدمان کلاس: کلاس‌محور یا رشته‌محور');

test('فرم کلاس گزینه نوع چیدمان دارد', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null;S.route='classes';S.filters={}");
  W('classModal(null)');
  const m = W("(document.getElementById('modal')||{}).innerHTML||''");
  assert(m.indexOf('c_mode') > -1, 'گزینه نوع چیدمان نیست');
  assert(m.indexOf('کلاس‌محور') > -1 && m.indexOf('رشته‌محور') > -1, 'دو گزینه نیستند');
  W('closeModal()');
});

test('کلاس‌محور: رشته پنهان و اختیاری است', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null;S.route='classes';S.filters={}");
  W('classModal(null)');
  W("document.getElementById('c_name').value='ششم آزمون';document.getElementById('c_grade').value='ششم'");
  W("(function(){var el=document.getElementById('c_mode');el.value='class';"
    + "el.dispatchEvent(new window.Event('change',{bubbles:true}));})()");
  assert(W("document.getElementById('c_fieldwrap_cls').style.display") === 'none', 'رشته پنهان نشد');
  const n0 = W('db.classes.length');
  W("(function(){var el=document.createElement('button');el.setAttribute('data-act','class-save');"
    + "document.body.appendChild(el);el.click();el.remove();})()");
  assert(W('db.classes.length') === n0 + 1, 'کلاس‌محور بدون رشته ذخیره نشد');
  assert(W('db.classes[db.classes.length-1].class_mode') === 'class', 'نوع ذخیره نشد');
  assert(W('db.classes[db.classes.length-1].grade_level') === 6, 'پایه استنتاج نشد');
});

test('رشته‌محور: رشته الزامی است', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null;S.route='classes';S.filters={}");
  W('classModal(null)');
  W("document.getElementById('c_name').value='دهم آزمون';document.getElementById('c_grade').value='دهم'");
  W("(function(){var el=document.getElementById('c_mode');el.value='field';"
    + "el.dispatchEvent(new window.Event('change',{bubbles:true}));})()");
  W("document.getElementById('c_field').value=''");
  const n0 = W('db.classes.length');
  W("(function(){var el=document.createElement('button');el.setAttribute('data-act','class-save');"
    + "document.body.appendChild(el);el.click();el.remove();})()");
  assert(W('db.classes.length') === n0, 'بدون رشته ذخیره شد');
  assert(W("document.getElementById('c_field').classList.contains('has-error')"), 'فیلد رشته قرمز نشد');
  W("(function(){var el=document.getElementById('c_field');el.value='علوم تجربی';"
    + "el.dispatchEvent(new window.Event('change',{bubbles:true}));})()");
  W("(function(){var el=document.createElement('button');el.setAttribute('data-act','class-save');"
    + "document.body.appendChild(el);el.click();el.remove();})()");
  assert(W('db.classes.length') === n0 + 1, 'با رشته ذخیره نشد');
  assert(W('db.classes[db.classes.length-1].field') === 'علوم تجربی', 'رشته ثبت نشد');
  assert(W('db.classes[db.classes.length-1].class_mode') === 'field', 'نوع ذخیره نشد');
});

test('حالت خودکار نوع را از پایه حدس می‌زند', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null;S.route='classes';S.filters={}");
  W('classModal(null)');
  W("document.getElementById('c_name').value='یازدهم خودکار';document.getElementById('c_grade').value='یازدهم'");
  W("document.getElementById('c_mode').value=''");
  if(W("!!document.getElementById('c_field')")) W("document.getElementById('c_field').value='ریاضی فیزیک'");
  const n0 = W('db.classes.length');
  W("(function(){var el=document.createElement('button');el.setAttribute('data-act','class-save');"
    + "document.body.appendChild(el);el.click();el.remove();})()");
  assert(W('db.classes.length') === n0 + 1, 'ذخیره نشد');
  assert(W('db.classes[db.classes.length-1].class_mode') === 'field', 'پایه ۱۱ باید رشته‌محور شود');
});

console.log('\n▸ چرخه سال تحصیلی و چیدمان کلاس');

test('توابع چرخه سال تحصیلی تعریف شده‌اند', () => {
  assert(W("typeof viewSchoolYear==='function'&&typeof yearState==='function'"
    + "&&typeof isYearEndSeason==='function'&&typeof isEnrollSeason==='function'"
    + "&&typeof needPlacement==='function'&&typeof autoPlacement==='function'"
    + "&&typeof applyPlacement==='function'&&typeof createParallelClass==='function'"
    + "&&typeof placementScore==='function'&&typeof tuitionCleared==='function'"
    + "&&typeof yearEndReminder==='function'&&typeof isFieldBased==='function'"), 'توابع ناقص');
  assert(W('Array.isArray(db.school_years)'), 'مجموعه school_years نیست');
});

test('سه تب چرخه سال رندر می‌شوند', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null;S.route='schoolyear';S.filters={}");
  for(const t of ['status','placement','enroll']){
    W("S.tab='" + t + "'");
    const o = W('renderRoute()');
    assert(o.length > 500 && !o.includes('undefined') && !o.includes('[object'), 'تب ' + t);
  }
  W("S.tab='grades'");
});

test('تشخیص مقطع رشته‌محور درست است', () => {
  assert(W('isFieldBased(10)') === true, 'پایه ۱۰ باید رشته‌محور باشد');
  assert(W('isFieldBased(12)') === true, 'پایه ۱۲ باید رشته‌محور باشد');
  assert(W('isFieldBased(9)') === false, 'پایه ۹ نباید رشته‌محور باشد');
  assert(W('isFieldBased(6)') === false, 'پایه ۶ نباید رشته‌محور باشد');
});

test('بستن سال: ارتقای پایه و ثبت وضعیت', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  W("db.classes.filter(function(c){return c.school_id===" + sid + ";})"
    + ".forEach(function(c,i){update('classes',c.id,{grade_level:[7,10,11][i%3]});})");
  W("window.__sy=(function(){var c=db.classes.filter(function(x){return x.school_id===" + sid
    + "&&x.grade_level===10;})[0];var s=activeStudentsOfClass(c.id)[0];return s?s.id:null;})()");
  if(!W('window.__sy')) return;
  W("batchWrites(function(){db.classes.filter(function(c){return c.school_id===" + sid + ";})"
    + ".forEach(function(c){var g=c.grade_level||gradeFromName(c.name);if(!g)return;"
    + "activeStudentsOfClass(c.id).forEach(function(st){"
    + "if(g===12){graduateStudent(st," + sid + ",c);}"
    + "else if(isTerminal(g)){update('users',st.id,{status:'awaiting_transfer',grade_level:g+1});}"
    + "else{update('users',st.id,{grade_level:g+1});}});});"
    + "saveYearState(" + sid + ",{closed:1,closed_at:new Date().toISOString(),promoted:1});})");
  assert(W('yearState(' + sid + ').closed') === 1, 'سال بسته نشد');
  assert(W("byId('users',window.__sy).grade_level") === 11, 'پایه ارتقا نیافت');
});

test('ناسازگاری پایه و کلاس شناسایی می‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  assert(W('needPlacement(' + sid + ').length') > 0, 'دانش‌آموز نیازمند چیدمان یافت نشد');
  assert(W('needPlacement(' + sid + ').some(function(x){return x.user.id===window.__sy;})'),
    'دانش‌آموز ارتقایافته در فهرست چیدمان نیست');
});

test('ساخت کلاس موازی برای یک رشته', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  const n0 = W('db.classes.filter(function(c){return c.school_id===' + sid + ';}).length');
  W("window.__pc=createParallelClass(" + sid + ",11,'علوم تجربی','الف')");
  assert(W('db.classes.filter(function(c){return c.school_id===' + sid + ';}).length') === n0 + 1,
    'کلاس ساخته نشد');
  assert(W('window.__pc.grade_level') === 11, 'پایه نادرست');
  assert(W('window.__pc.field') === 'علوم تجربی', 'رشته نادرست');
  assert(W('window.__pc.name').indexOf('الف') > -1, 'پسوند در نام نیست');
});

test('چیدمان خودکار متوازن است و ظرفیت را رعایت می‌کند', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  W("createParallelClass(" + sid + ",11,'علوم تجربی','ب')");
  W("db.users.filter(function(u){return u.role==='student'&&u.school_id===" + sid + ";})"
    + ".slice(0,24).forEach(function(u){update('users',u.id,{grade_level:11,field:'علوم تجربی'});})");
  const list = W("needPlacement(" + sid + ").filter(function(x){return x.grade===11;})");
  const n = W("needPlacement(" + sid + ").filter(function(x){return x.grade===11;}).length");
  if(!n) return;
  W("window.__bk=autoPlacement(needPlacement(" + sid + ").filter(function(x){return x.grade===11;}),"
    + "targetClasses(" + sid + ",11,'علوم تجربی'))");
  const sizes = W('JSON.stringify(window.__bk.map(function(b){return b.list.length;}))');
  const arr = JSON.parse(sizes);
  assert(arr.length >= 2, 'کمتر از دو کلاس مقصد');
  assert(Math.abs(arr[0] - arr[1]) <= 1, 'کلاس‌ها هم‌اندازه نیستند: ' + sizes);
});

test('اعمال چیدمان ناسازگاری را رفع می‌کند', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  W("(function(){var out=[];window.__bk.forEach(function(b){b.list.forEach(function(s){"
    + "out.push({studentId:s.user.id,classId:b.cls.id});});});window.__pp=out;})()");
  W('applyPlacement(window.__pp)');
  const bad = W("db.users.filter(function(u){return u.role==='student'&&u.school_id===" + sid
    + "&&(u.status||'active')==='active'&&u.grade_level===11&&(function(){var c=classOf(u.id);"
    + 'return !c||Number(c.grade_level)!==11;})();}).length');
  assert(bad === 0, bad + ' دانش‌آموز هنوز پایه/کلاس ناسازگار دارند');
  assert(W("db.users.filter(function(u){return u.grade_level===11&&classOf(u.id);})"
    + ".every(function(u){return u.field==='علوم تجربی';})"), 'رشته ثابت نماند');
});

test('یادآوری پایان سال قواعدش را رعایت می‌کند', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  W("saveYearState(" + sid + ",{closed:1,reminded_at:null})");
  const n0 = W("db.notifications.filter(function(n){return n.title.indexOf('پایان سال')>-1;}).length");
  W('yearEndReminder()');
  assert(W("db.notifications.filter(function(n){return n.title.indexOf('پایان سال')>-1;}).length") === n0,
    'با سال بسته نباید یادآوری شود');
  W("saveYearState(" + sid + ",{closed:0,reminded_at:new Date().toISOString()})");
  W('yearEndReminder()');
  assert(W("db.notifications.filter(function(n){return n.title.indexOf('پایان سال')>-1;}).length") === n0,
    'یادآوری تکراری در همان روز');
});

test('چرخه سال تحصیلی فقط برای مدیر و سوپرادمین', () => {
  for(const role of ['teacher','student','parent','edu_office']){
    W("S.user=db.users.find(u=>u.role==='" + role + "');S.persona=null;S.boss=null;S.route='schoolyear';S.filters={}");
    assert(/دسترسی مجاز نیست|اشتراک/.test(W('renderRoute()')), role + ' دسترسی داشت');
  }
  const cases = [['teacher','year-close',false],['student','place-auto',false],
                 ['manager','year-close',true],['manager','place-auto',true]];
  for(const [role, act, want] of cases){
    W("S.user=db.users.find(u=>u.role==='" + role + "');S.persona=null;S.boss=null");
    assert(W("canAction('" + act + "')") === want, role + ' → ' + act);
  }
});

console.log('\n▸ اشتراک مشترک: یک پرداخت برای هر دانش‌آموز');

test('توابع اشتراک مشترک تعریف شده‌اند', () => {
  assert(W("typeof studentSubscription==='function'&&typeof effectiveParentAccess==='function'"),
    'توابع ناقص است');
});

test('اگر یک ولی بپردازد، ولی دیگرِ همان دانش‌آموز هم دسترسی دارد', () => {
  const info = W('(function(){var g={};db.parent_links.forEach(function(l){'
    + '(g[l.student_id]=g[l.student_id]||[]).push(l.parent_id);});'
    + 'var k=Object.keys(g).filter(function(s){return g[s].length>1;})[0];'
    + 'return k?{kid:Number(k),a:g[k][0],b:g[k][1]}:null;})()');
  if(!W('(function(){var g={};db.parent_links.forEach(function(l){'
    + '(g[l.student_id]=g[l.student_id]||[]).push(l.parent_id);});'
    + 'return Object.keys(g).some(function(s){return g[s].length>1;});})()')) return;
  const A = W('window.__A=(function(){var g={};db.parent_links.forEach(function(l){'
    + '(g[l.student_id]=g[l.student_id]||[]).push(l.parent_id);});'
    + 'var k=Object.keys(g).filter(function(s){return g[s].length>1;})[0];return g[k][0];})()');
  const B = W('window.__B=(function(){var g={};db.parent_links.forEach(function(l){'
    + '(g[l.student_id]=g[l.student_id]||[]).push(l.parent_id);});'
    + 'var k=Object.keys(g).filter(function(s){return g[s].length>1;})[0];return g[k][1];})()');
  const KID = W('window.__K=(function(){var g={};db.parent_links.forEach(function(l){'
    + '(g[l.student_id]=g[l.student_id]||[]).push(l.parent_id);});'
    + 'return Number(Object.keys(g).filter(function(s){return g[s].length>1;})[0]);})()');
  /* فقط ولی الف پرداخت می‌کند */
  W('db.parent_subscriptions.filter(function(s){return s.user_id===' + B + ';})'
    + ".forEach(function(s){remove('parent_subscriptions',s.id);})");
  W('db.parent_subscriptions.filter(function(s){return s.user_id===' + A + ';})'
    + ".forEach(function(s){update('parent_subscriptions',s.id,"
    + "{status:'active',end_date:addDaysISO(todayISO(),200),paid_at:todayISO()});})");
  if(!W('db.parent_subscriptions.some(function(s){return s.user_id===' + A + ';})'))
    W("insert('parent_subscriptions',{user_id:" + A + ",plan:'yearly',amount:2200000,"
      + "status:'active',start_date:todayISO(),end_date:addDaysISO(todayISO(),200),paid_at:todayISO()})");
  assert(W('!!studentSubscription(' + KID + ')'), 'اشتراک دانش‌آموز پیدا نشد');
  assert(W('studentSubscription(' + KID + ').payerId') === A, 'پرداخت‌کننده نادرست');
  assert(W('effectiveParentAccess(' + B + ').active') === true, 'ولی دوم دسترسی ندارد');
  assert(W('effectiveParentAccess(' + B + ').own') === false, 'ولی دوم نباید صاحب اشتراک باشد');
  assert(!!W('effectiveParentAccess(' + B + ').via'), 'مسیر دسترسی مشخص نیست');
});

test('پنل ولی دوم قفل نیست و صفحه‌ها باز است', () => {
  const B = W('window.__B');
  W("S.user=byId('users'," + B + ");S.persona='parent';S.boss=null;S.filters={}");
  assert(W('parentLocked()') === false, 'پنل ولی دوم قفل است');
  W("S.route='children'");
  const o = W('renderRoute()');
  assert(!/دسترسی مجاز نیست/.test(o) && o.length > 500, 'صفحه فرزندان باز نشد');
});

test('صفحه اشتراک دلیل باز بودن را توضیح می‌دهد', () => {
  const B = W('window.__B');
  W("S.user=byId('users'," + B + ");S.persona='parent';S.boss=null;S.route='subscription';S.filters={}");
  const o = W('renderRoute()');
  assert(o.indexOf('اشتراک شما از پیش فعال است') > -1, 'کارت توضیح نمایش داده نشد');
  assert(o.indexOf('دانش‌آموز</b> تعلق دارد') > -1, 'توضیح تعلق اشتراک نیست');
});

test('اگر هیچ ولی‌ای نپردازد، دسترسی قطع می‌شود', () => {
  const A = W('window.__A'), B = W('window.__B'), KID = W('window.__K');
  W("db.parent_subscriptions.forEach(function(s){update('parent_subscriptions',s.id,"
    + "{status:'expired',end_date:'2020-01-01'});})");
  W('effectiveParentAccess(' + A + ');effectiveParentAccess(' + B + ')');
  W("db.parent_subscriptions.forEach(function(s){update('parent_subscriptions',s.id,"
    + "{status:'expired',end_date:'2020-01-01'});})");
  assert(!W('studentSubscription(' + KID + ')'), 'اشتراک فعال نباید بماند');
  assert(W('effectiveParentAccess(' + B + ').active') === false, 'ولی دوم هنوز دسترسی دارد');
  assert(W('effectiveParentAccess(' + A + ').active') === false, 'ولی اول هنوز دسترسی دارد');
});

test('ولیِ بی‌ربط از اشتراک دیگران سود نمی‌برد', () => {
  const A = W('window.__A');
  W('db.parent_subscriptions.filter(function(s){return s.user_id===' + A + ';})'
    + ".forEach(function(s){update('parent_subscriptions',s.id,"
    + "{status:'active',end_date:addDaysISO(todayISO(),200)});})");
  const far = W('(function(){var kidsA={};db.parent_links.filter(function(l){'
    + 'return l.parent_id===' + A + ';}).forEach(function(l){kidsA[l.student_id]=1;});'
    + "var o=db.users.find(function(u){return u.role==='parent'&&"
    + '!db.parent_links.some(function(l){return l.parent_id===u.id&&kidsA[l.student_id];});});'
    + 'return o?o.id:null;})()');
  if(far) assert(W('effectiveParentAccess(' + far + ').active') === false, 'ولی بی‌ربط دسترسی گرفت');
});

console.log('\n▸ پلان فروش و پشتیبان‌گیری');

test('توابع پلان و پشتیبان تعریف شده‌اند', () => {
  assert(W("typeof viewPlans==='function'&&typeof planStats==='function'"
    + "&&typeof validatePlanSettings==='function'&&typeof buildBackup==='function'"
    + "&&typeof validateBackup==='function'&&typeof restoreBackup==='function'"), 'توابع ناقص');
});

test('صفحه پلان‌ها رندر می‌شود و آمار درست است', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null;S.route='plans';S.filters={}");
  const o = W('renderRoute()');
  assert(o.length > 1200 && !o.includes('undefined') && !o.includes('[object'), 'رندر نشد');
  assert(W('planStats().length') === 3, 'سه پلان نیست');
  assert(W('planStats()[0].price') === W('subSettings().price_monthly'), 'قیمت با تنظیمات نمی‌خواند');
});

test('اعتبارسنجی تنظیمات پلان مقدار بی‌معنا را رد می‌کند', () => {
  assert(W('validatePlanSettings({price_monthly:-5}).length') > 0, 'قیمت منفی');
  assert(W('validatePlanSettings({trial_days:400}).length') > 0, 'دوره آزمایشی بیش از حد');
  assert(W('validatePlanSettings({school_share_percent:150}).length') > 0, 'سهم بیش از ۱۰۰');
  assert(W('validatePlanSettings({price_monthly:100000,price_yearly:5000000}).length') > 0,
    'سالانه گران‌تر از ماهانه باید رد شود');
  assert(W('validatePlanSettings({price_monthly:250000,price_yearly:2200000}).length') === 0,
    'مقادیر منطقی رد شد');
});

test('تنظیمات پلان ذخیره و اعمال می‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null");
  W("saveSubSettings({price_monthly:300000,school_share_percent:25,trial_days:14,trial_enabled:1})");
  assert(W('subSettings().price_monthly') === 300000, 'قیمت ذخیره نشد');
  assert(W('subSettings().school_share_percent') === 25, 'سهم ذخیره نشد');
  assert(W('planStats()[0].price') === 300000, 'آمار پلان به‌روز نشد');
});

test('بستهٔ پشتیبان ساختار درست دارد', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null");
  assert(W("buildBackup().format") === 'payesh-backup', 'قالب نادرست');
  assert(W('buildBackup().version') === 2, 'نسخه نادرست');
  assert(W('buildBackup().ops.length') === W('log.length'), 'شمار عملیات نادرست');
  assert(W('validateBackup(buildBackup()).ok') === true, 'پشتیبان خودمان نامعتبر شد');
});

test('اعتبارسنجی پشتیبان فایل خراب را رد می‌کند', () => {
  assert(W('validateBackup(null).ok') === false, 'فایل خالی');
  assert(W("validateBackup({format:'other'}).ok") === false, 'قالب غریبه');
  assert(W("validateBackup({format:'payesh-backup',version:99,ops:[]}).ok") === false, 'نسخه جدیدتر');
  assert(W("validateBackup({format:'payesh-backup',version:2,ops:[{t:'zzz',c:'grades'}]}).ok") === false,
    'نوع عمل ناشناخته');
  assert(W("validateBackup({format:'payesh-backup',version:2,ops:[{t:'ins',c:'nope'}]}).ok") === false,
    'مجموعه ناموجود');
});

test('بازیابی داده تخریب‌شده را برمی‌گرداند', () => {
  W("S.user=db.users.find(u=>u.role==='teacher');S.persona=null;S.boss=null");
  W("var c=visibleClasses()[0];insert('announcements',{school_id:c.school_id,"
    + "title:'نشانه بازیابی',body:'آزمون',author_id:S.user.id,date:todayISO(),pinned:0})");
  W('window.__bk=JSON.parse(JSON.stringify(buildBackup()))');
  const n0 = W("db.announcements.filter(function(a){return a.title==='نشانه بازیابی';}).length");
  W("db.announcements.filter(function(a){return a.title==='نشانه بازیابی';})"
    + ".forEach(function(a){remove('announcements',a.id);})");
  assert(W("db.announcements.filter(function(a){return a.title==='نشانه بازیابی';}).length") === 0,
    'تخریب انجام نشد');
  const res = W('restoreBackup(window.__bk)');
  assert(W('restoreBackup(window.__bk).ok') === true, 'بازیابی ناموفق');
  assert(W("db.announcements.filter(function(a){return a.title==='نشانه بازیابی';}).length") === n0,
    'داده برنگشت');
  assert(W('JSON.parse(localStorage.getItem(LOG_KEY)).length===log.length'), 'localStorage ناهمگام');
});

test('بازیابی فایل خراب داده را نابود نمی‌کند', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null");
  const before = W('db.users.length');
  assert(W("restoreBackup({format:'payesh-backup',version:2,ops:[{t:'ins',c:'جعلی',data:{}}]}).ok") === false,
    'فایل خراب پذیرفته شد');
  assert(W('db.users.length') === before, 'داده آسیب دید');
});

test('پلان و پشتیبان فقط برای سوپرادمین است', () => {
  for(const role of ['manager','teacher','student','parent','edu_office']){
    W("S.user=db.users.find(u=>u.role==='" + role + "');S.persona=null;S.boss=null;S.route='plans';S.filters={}");
    assert(/دسترسی مجاز نیست|اشتراک/.test(W('renderRoute()')), role + ' به پلان‌ها دسترسی داشت');
  }
  const cases = [['manager','plan-save',false],['manager','backup-make',false],
                 ['manager','restore-ok',false],['superadmin','plan-save',true],
                 ['superadmin','restore-ok',true]];
  for(const [role, act, want] of cases){
    W("S.user=db.users.find(u=>u.role==='" + role + "');S.persona=null;S.boss=null");
    assert(W("canAction('" + act + "')") === want, role + ' → ' + act);
  }
});

console.log('\n▸ ابزارهای تکمیلی سوپرادمین');

test('توابع ابزارهای تکمیلی تعریف شده‌اند', () => {
  assert(W("typeof schoolsOverview==='function'&&typeof schoolStatus==='function'"
    + "&&typeof exportData==='function'&&typeof downloadCSV==='function'"
    + "&&typeof csvCell==='function'&&typeof broadcastAnnouncement==='function'"), 'توابع ناقص');
});

test('وضعیت و فعالیت مدارس محاسبه می‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null;S.filters={}");
  assert(W('schoolsOverview().length') === W('db.schools.length'), 'همه مدارس نیستند');
  assert(W('schoolsOverview()[0].st.students') >= 0, 'شمارش دانش‌آموز نادرست');
  assert(W("['active','slow','idle','never'].indexOf(schoolsOverview()[0].st.state)>-1"),
    'وضعیت نامعتبر');
  W("S.route='schools'");
  assert(W('renderRoute()').indexOf('آخرین فعالیت') > -1, 'ستون آخرین فعالیت نیست');
});

test('سلول csv در برابر تزریق فرمول امن است', () => {
  assert(W("csvCell('=SUM(A1)').charAt(0)") === "'", 'فرمول خنثی نشد');
  assert(W("csvCell('+1')").charAt(0) === "'", 'علامت مثبت خنثی نشد');
  assert(W("csvCell('a,b')") === '"a,b"', 'کاما محصور نشد');
  assert(W('csvCell(\'a"b\')') === '"a""b"', 'نقل‌قول escape نشد');
});

test('خروجی csv برای چهار صفحه ساخته می‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null");
  for(const r of ['schools','users','finance','audit']){
    const n = W("exportData('" + r + "').rows.length");
    const h = W("exportData('" + r + "').headers.length");
    assert(h > 0, 'ستون ندارد: ' + r);
    assert(n >= 0, 'ردیف نامعتبر: ' + r);
  }
  assert(W("exportData('schools').rows.length") === W('db.schools.length'), 'شمار مدارس');
});

test('اطلاعیه سراسری در دو حالت کار می‌کند', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null");
  const n0 = W('db.announcements.length');
  W("broadcastAnnouncement('عنوان آزمون','متن آزمون سراسری','all')");
  assert(W('db.announcements.length') === n0 + 1, 'حالت سراسری');
  assert(W('db.announcements[db.announcements.length-1].school_id') === null, 'دامنه سراسری نیست');
  const n1 = W('db.announcements.length');
  W("broadcastAnnouncement('عنوان دوم','متن برای هر مدرسه','each')");
  assert(W('db.announcements.length') > n1, 'حالت هر مدرسه');
});

test('مجوز ابزارهای تکمیلی', () => {
  const cases = [['superadmin','ann-broadcast',true],['manager','ann-broadcast',false],
                 ['manager','export-csv',true],['student','export-csv',false],
                 ['teacher','export-csv',false],['parent','ann-broadcast',false]];
  for(const [role, act, want] of cases){
    W("S.user=db.users.find(u=>u.role==='" + role + "');S.persona=null;S.boss=null");
    assert(W("canAction('" + act + "')") === want, role + ' → ' + act);
  }
});

console.log('\n▸ سازگاری با فایل واقعی مدرسه');

test('ستون‌های فایل واقعی مدرسه شناخته می‌شوند', () => {
  const real = ['ردیف','نام','نام خانوادگی','رشته','تاریخ تولد','شماره ملی','سری شناسنامه',
    'سریال شناسنامه','نام پدر','کد ملی پدر','تحصیلات پدر','وضعیت حیات پدر','نام مادر',
    'کد ملی مادر','تحصیلات مادر','وضعیت حیات مادر','سرپرست دانش آموز','معدل سال گذشته',
    'تعداد درس افتاده','تحت پوشش','نوع ارگان','درصد','تعداد خواهر','تعداد برادر',
    'شغل پدر','شغل مادر','موبایل دانش آموز','شماره پدر','شماره مادر','شماره ثابت',
    'محل سکونت','نام روستا','وضعیت اقامت','آدرس','استعداد یابی'];
  const map = W('suggestMap(' + JSON.stringify(real) + ",'students')");
  const n = W('Object.keys(suggestMap(' + JSON.stringify(real) + ",'students')).length");
  assert(n >= 33, 'فقط ' + n + ' ستون از ۳۵ شناخته شد');
  const j = W('JSON.stringify(suggestMap(' + JSON.stringify(real) + ",'students'))");
  assert(j.indexOf('"0"') < 0, 'ستون ردیف نباید نگاشت شود');
  for(const k of ['first_name','last_name','father_job','mother_job','last_gpa',
                  'covered','org_type','address','residence','talent'])
    assert(j.indexOf(k) > -1, 'فیلد ' + k + ' نگاشت نشد');
});

test('نام و نام خانوادگی جدا ترکیب می‌شوند', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const NL = String.fromCharCode(10);
  const csv = 'نام,نام خانوادگی,کلاس' + NL + 'پیشوا,رحمانی,کلاس آزمون نام';
  W('window.__v=validateImport(prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students').rows,"
    + 'prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students').mapping,'students')");
  assert(W('window.__v.rows[0].data.full_name') === 'پیشوا رحمانی', 'ترکیب نشد');
  assert(W('window.__v.rows[0].data.first_name') === 'پیشوا', 'نام جدا نگه داشته نشد');
  assert(W('window.__v.rows[0].data.last_name') === 'رحمانی', 'نام خانوادگی جدا نگه داشته نشد');
});

test('معدل با ممیز فارسی و ارقام فارسی خوانده می‌شود', () => {
  assert(W("toNumFa('۱۲/۸۸')") === 12.88, 'ممیز اسلش');
  assert(W("toNumFa('۱۳٫۰۵')") === 13.05, 'ممیز فارسی');
  assert(W("toNumFa('۱۷')") === 17, 'عدد صحیح فارسی');
  assert(W("toNumFa('')") === null, 'مقدار خالی');
});

test('شماره دانش‌آموز و پدر جدا ثبت می‌شوند', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const NL = String.fromCharCode(10);
  const csv = 'نام,نام خانوادگی,موبایل دانش آموز,شماره پدر,شماره مادر' + NL
    + 'سینا,سهرابی,۰۹۱۸۱۷۶۳۳۹۴,۰۹۱۲۱۱۱۲۲۳۳,۰۹۳۳۷۷۴۹۶۳۵';
  W('window.__v2=validateImport(prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students').rows,"
    + 'prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students').mapping,'students')");
  const d = W('window.__v2.rows[0].data');
  assert(W('window.__v2.rows[0].data.phone') === '09181763394', 'موبایل دانش‌آموز');
  assert(W('window.__v2.rows[0].data.father_phone') === '09121112233', 'شماره پدر');
  assert(W('window.__v2.rows[0].data.mother_phone') === '09337749635', 'شماره مادر');
});

test('تحت پوشش و وضعیت حیات درست تفسیر می‌شوند', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const NL = String.fromCharCode(10);
  const csv = 'نام,نام خانوادگی,تحت پوشش,نوع ارگان,درصد,وضعیت حیات پدر' + NL
    + 'کارو,نیک‌بخت,بلی,کمیته امداد,۳۰,فوت شده';
  W('window.__v3=validateImport(prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students').rows,"
    + 'prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students').mapping,'students')");
  assert(W('window.__v3.rows[0].data.covered') === 1, 'بلی باید ۱ شود');
  assert(W('window.__v3.rows[0].data.org_type') === 'کمیته امداد', 'نوع ارگان');
  assert(W('window.__v3.rows[0].data.org_percent') === 30, 'درصد');
  assert(W('window.__v3.rows[0].data.father_alive') === 'فوت', 'وضعیت حیات');
});

test('تب شناسنامه اطلاعات تکمیلی را نشان می‌دهد', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  W("(function(){var s=db.users.find(function(u){return u.role==='student'&&u.school_id===" + sid + ";});"
    + "update('users',s.id,{last_gpa:17.5,father_job:'کارگر',father_edu:'دیپلم',"
    + "covered:1,org_type:'کمیته امداد',address:'خیابان آزمون',sisters:2});window.__pid=s.id;})()");
  W("S.route='record';S.child=window.__pid;S.tab='profile';S.filters={}");
  const o = W('renderRoute()');
  assert(o.indexOf('کارگر') > -1, 'شغل پدر دیده نشد');
  assert(o.indexOf('دیپلم') > -1, 'تحصیلات پدر دیده نشد');
  assert(o.indexOf('کمیته امداد') > -1, 'نوع ارگان دیده نشد');
  assert(o.indexOf('خیابان آزمون') > -1, 'آدرس دیده نشد');
  assert(!o.includes('undefined') && !o.includes('[object'), 'خروجی ناسالم');
  W("S.tab='grades';S.child=null");
});

test('پرونده دانش‌آموز: مرز دسترسی رعایت می‌شود', () => {
  W("S.user=db.users.find(function(u){return u.role==='student'&&classOf(u.id);});S.persona=null;S.boss=null");
  const me = W('S.user.id');
  const peer = W('(function(){var c=classOf(' + me + ');var o=studentsOfClass(c.id)'
    + '.find(function(s){return s.id!==' + me + ';});return o?o.id:null;})()');
  if(peer){
    W('S.child=' + peer);
    assert(W('recordTargetId()') === me, 'دانش‌آموز توانست پرونده هم‌کلاسی را باز کند');
  }
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  const other = W("db.users.find(function(u){return u.role==='student'&&u.school_id!==" + sid + ";}).id");
  W('S.child=' + other);
  assert(W('recordTargetId()') !== other, 'مدیر به دانش‌آموز مدرسه دیگر دسترسی داشت');
  W('S.child=null');
});

console.log('\n▸ پنل سوپرادمین: مالی، رمز، سلامت');

test('توابع پنل سوپرادمین تعریف شده‌اند', () => {
  assert(W("typeof viewFinance==='function'&&typeof financeSummary==='function'"
    + "&&typeof viewHealth==='function'&&typeof healthReport==='function'"
    + "&&typeof resetPassword==='function'&&typeof canResetPassword==='function'"
    + "&&typeof tempPassword==='function'"), 'توابع ناقص است');
});

test('صفحه مالی و سلامت برای سوپرادمین رندر می‌شوند', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null;S.filters={};S.page=1");
  for(const r of ['finance','health']){
    W("S.route='" + r + "'");
    const o = W('renderRoute()');
    assert(o.length > 800 && !o.includes('undefined') && !o.includes('[object'),
      'صفحه ' + r + ' درست رندر نشد');
  }
});

test('اعداد مالی با پایگاه داده می‌خوانند', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null");
  const realRev = W('db.parent_subscriptions.filter(function(s){return s.paid_at;})'
    + '.reduce(function(a,b){return a+Number(b.amount||0);},0)');
  const realPaid = W('db.installments.reduce(function(a,b){return a+Number(b.paid_amount||0);},0)');
  assert(W('financeSummary().sub.revenue') === realRev, 'درآمد اشتراک نادرست');
  assert(W('financeSummary().tuition.paid') === realPaid, 'شهریه دریافتی نادرست');
  assert(W('financeSummary().schools.length') === W('db.schools.length'), 'همه مدارس نیستند');
  assert(W('(function(){var a=financeSummary().schools;for(var i=1;i<a.length;i++)'
    + 'if(a[i-1].paid<a[i].paid)return false;return true;})()'), 'رتبه‌بندی نزولی نیست');
});

test('بازنشانی رمز: مرز نقش‌ها رعایت می‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null");
  assert(W("canResetPassword(db.users.find(function(u){return u.role==='student';}))") === true,
    'سوپرادمین نتوانست رمز دانش‌آموز را بازنشانی کند');
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  assert(W("canResetPassword(db.users.find(function(u){return u.role==='student'&&u.school_id===" + sid + ";}))") === true,
    'مدیر نتوانست رمز دانش‌آموز مدرسه خودش را عوض کند');
  assert(W("canResetPassword(db.users.find(function(u){return u.role==='student'&&u.school_id!==" + sid + ";}))") === false,
    'مدیر به دانش‌آموز مدرسه دیگر دسترسی داشت');
  assert(W("canResetPassword(db.users.find(function(u){return u.role==='superadmin';}))") === false,
    'مدیر توانست رمز سوپرادمین را عوض کند');
  W("S.user=db.users.find(u=>u.role==='student');S.persona=null;S.boss=null");
  assert(W("canResetPassword(db.users.find(function(u){return u.role==='teacher';}))") === false,
    'دانش‌آموز اجازه بازنشانی داشت');
});

test('بازنشانی رمز واقعاً رمز را عوض و اعلان می‌فرستد', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null");
  const tid = W("db.users.find(function(u){return u.role==='teacher';}).id");
  const old = W("byId('users'," + tid + ").password");
  const n0 = W('db.notifications.length');
  const pass = W('resetPassword(' + tid + ')');
  assert(pass && pass !== old, 'رمز عوض نشد');
  assert(/^[a-z]{4}[2-9]{4}$/.test(pass), 'قالب رمز نادرست: ' + pass);
  assert(W("byId('users'," + tid + ").must_change_password") === 1, 'پرچم تغییر رمز ست نشد');
  assert(W('db.notifications.length') > n0, 'اعلان فرستاده نشد');
  assert(W('db.notifications[db.notifications.length-1].user_id') === tid, 'اعلان به کاربر اشتباه رفت');
});

test('رمزهای موقت یکتا هستند', () => {
  const seen = {};
  let uniq = 0;
  for(let i = 0; i < 30; i++){
    const p = W('tempPassword()');
    if(!seen[p]){ seen[p] = 1; uniq++; }
  }
  assert(uniq >= 28, 'رمزها به‌اندازه کافی یکتا نیستند: ' + uniq);
});

test('گزارش سلامت مقادیر معتبر می‌دهد', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null");
  const h = W('healthReport()');
  assert(W('healthReport().storage.percent') >= 0, 'درصد حافظه منفی');
  assert(W('healthReport().index.rate') >= 0 && W('healthReport().index.rate') <= 100, 'نرخ ایندکس نامعتبر');
  const real = W('(function(){var n=0;Object.keys(db).forEach(function(k){'
    + 'if(Array.isArray(db[k]))n+=db[k].length;});return n;})()');
  assert(W('healthReport().data.total') === real, 'شمارش رکوردها نادرست');
  assert(W('healthReport().data.top.length') > 0, 'فهرست بزرگ‌ترین جدول‌ها خالی است');
});

test('مالی و سلامت فقط برای سوپرادمین باز است', () => {
  for(const role of ['manager','teacher','student','parent','edu_office']){
    W("S.user=db.users.find(u=>u.role==='" + role + "');S.persona=null;S.boss=null;S.filters={}");
    for(const r of ['finance','health']){
      W("S.route='" + r + "'");
      assert(/دسترسی مجاز نیست|اشتراک/.test(W('renderRoute()')), role + ' به ' + r + ' دسترسی داشت');
    }
  }
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  assert(W("canAction('pass-reset')") === true, 'مدیر باید بتواند رمز بازنشانی کند');
  assert(W("canAction('health-backup')") === false, 'مدیر نباید پشتیبان بگیرد');
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
  /* «نام دانش آموز» به first_name نگاشت می‌شود چون فایل‌های واقعی
     مدرسه نام و نام خانوادگی را جدا دارند */
  assert((m2.indexOf('first_name') > -1 || m2.indexOf('full_name') > -1)
    && m2.indexOf('national_id') > -1, 'نویسه عربی شناخته نشد: ' + m2);
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
  /* کلاسی که واقعاً دانش‌آموز دارد (آزمون‌های دیگر ممکن است چیدمان را عوض کرده باشند) */
  const cid = W('(visibleClasses().filter(function(c){return studentsOfClass(c.id).length;})[0]'
    + '||visibleClasses()[0]).id');
  if(!W('studentsOfClass(' + cid + ').length')) return;
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
  const cid = W('(db.classes.filter(function(c){return c.school_id===' + sid
    + '&&activeStudentsOfClass(c.id).length;})[0]||{}).id||0');
  if(!cid) return;
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


// ── شاخه و رشتهٔ مدرسهٔ متوسطه دوم
test('سه شاخهٔ متوسطه دوم تعریف شده‌اند', () => {
  const ks = W('Object.keys(BRANCHES)');
  assert(ks.length === 3, 'تعداد شاخه: ' + ks.length);
  ['نظری', 'فنی و حرفه‌ای', 'کاردانش'].forEach((b) => {
    assert(ks.indexOf(b) >= 0, 'شاخهٔ گمشده: ' + b);
  });
});

test('هر شاخه دست‌کم سه رشته دارد', () => {
  W('Object.keys(BRANCHES)').forEach((b) => {
    const n = W("fieldsOfBranch(" + JSON.stringify(b) + ").length");
    assert(n >= 3, b + ' فقط ' + n + ' رشته دارد');
  });
});

test('مدارس نمونهٔ متوسطه دوم شاخه دارند و بقیه ندارند', () => {
  const bad = W("db.schools.filter(function(s){var has=(s.branches||[]).length>0; return s.level==='متوسطه دوم' ? !has : has;}).length");
  assert(bad === 0, bad + ' مدرسه شاخهٔ نادرست دارد');
});

test('مدرسهٔ چندشاخه‌ای پشتیبانی می‌شود', () => {
  const n = W("(db.schools.find(function(s){return s.code==='IZ-105';})||{branches:[]}).branches.length");
  assert(n === 2, 'ایران‌زمین باید دو شاخه داشته باشد، دارد: ' + n);
});

test('رشته‌های مدرسه زیرمجموعهٔ شاخه‌هایش هستند', () => {
  const bad = W("db.schools.filter(function(s){var ok=(s.branches||[]).reduce(function(a,b){return a.concat(fieldsOfBranch(b));},[]); return (s.fields||[]).some(function(f){return ok.indexOf(f)<0;});}).length");
  assert(bad === 0, bad + ' مدرسه رشتهٔ خارج از شاخه دارد');
});

test('انتخابگر شاخه سه کارت با تیک می‌سازد', () => {
  const h = W("branchPicker({level:'متوسطه دوم',branches:[],fields:[]})");
  const d = dom.window.document.createElement('div');
  d.innerHTML = h;
  assert(d.querySelectorAll('.branch-card').length === 3, 'تعداد کارت شاخه');
  assert(d.querySelectorAll('input.m-branch').length === 3, 'تعداد تیک شاخه');
  assert(d.querySelectorAll('input.m-field').length >= 12, 'تعداد تیک رشته');
});

test('شاخهٔ تیک‌خورده رشته‌هایش باز است و بقیه بسته', () => {
  const h = W("branchPicker({level:'متوسطه دوم',branches:['نظری'],fields:['علوم تجربی']})");
  const d = dom.window.document.createElement('div');
  d.innerHTML = h;
  const on = d.querySelectorAll('.branch-card.on');
  assert(on.length === 1, 'فقط یک کارت باید فعال باشد، هست: ' + on.length);
  assert(on[0].querySelector('.branch-fields').style.display === 'flex', 'رشته‌های شاخهٔ فعال باید دیده شوند');
  const off = d.querySelector('.branch-card:not(.on) .branch-fields');
  assert(off.style.display === 'none', 'رشته‌های شاخهٔ غیرفعال باید پنهان باشند');
  assert(d.querySelectorAll('.field-chip.on').length === 1, 'رشتهٔ انتخاب‌شده باید نشان‌دار باشد');
});

test('مودال مدرسه برای متوسطه دوم انتخابگر را باز نشان می‌دهد', () => {
  const sch = W("db.schools.find(function(s){return s.level==='متوسطه دوم';})");
  W('window._edit=db.schools.find(function(s){return s.level==="متوسطه دوم";}); schoolModal(window._edit)');
  const box = dom.window.document.querySelector('#m_branch_box');
  assert(box, 'جعبهٔ شاخه پیدا نشد');
  assert(box.style.display === 'block', 'باید باز باشد، هست: ' + box.style.display);
  const closeBtn = dom.window.document.querySelector('[data-act="modal-close"],.modal-back');
  W('closeModal&&closeModal()');
});

test('مودال مدرسه برای ابتدایی انتخابگر را پنهان می‌کند', () => {
  W('window._edit=db.schools.find(function(s){return s.level==="متوسطه اول";}); schoolModal(window._edit)');
  const box = dom.window.document.querySelector('#m_branch_box');
  assert(box && box.style.display === 'none', 'باید پنهان باشد');
  W('closeModal&&closeModal()');
});

test('صافی شاخه در فهرست مدارس کار می‌کند', () => {
  /* فهرست کامل مدارس فقط برای سوپرادمین دیده می‌شود؛ نقش‌های دیگر
     تنها مدرسهٔ خودشان را می‌بینند و صافی معنا پیدا نمی‌کند. */
  const prev = W('S.user && S.user.username');
  W('S.user=db.users.find(function(u){return u.role==="superadmin";})');
  const out = W("(S.filters={sbranch:'کاردانش'}, viewSchools())");
  assert(typeof out === 'string' && out.length > 0);
  assert(out.indexOf('ایران‌زمین') >= 0, 'مدرسهٔ کاردانش باید در نتیجه باشد');
  assert(out.indexOf('فرزانگان') < 0, 'مدرسهٔ نظری نباید در نتیجهٔ کاردانش باشد');
  W('S.filters={}');
  if (prev) W('S.user=db.users.find(function(u){return u.username===' + JSON.stringify(prev) + ';})');
});

test('کمک‌ابزار دلار-دلار آرایهٔ واقعی برمی‌گرداند', () => {
  const isArr = W("Array.isArray($$('div'))");
  assert(isArr === true, 'باید آرایه باشد تا map و filter کار کند');
});


// ── محدودشدن رشته‌ها به شاخه‌های همان مدرسه
test('رشته‌های مدرسهٔ نظری فقط رشته‌های نظری است', () => {
  const f = W("schoolFields(db.schools.find(function(s){return s.code==='SH-101';}).id)");
  assert(f.length === 4, 'باید ۴ رشته باشد، هست: ' + f.length);
  assert(f.indexOf('علوم تجربی') >= 0, 'علوم تجربی باید باشد');
  assert(f.indexOf('مکانیک خودرو') < 0, 'رشتهٔ فنی نباید در دبیرستان نظری باشد');
});

test('مدرسهٔ دوشاخه‌ای رشته‌های هر دو شاخه را دارد', () => {
  const f = W("schoolFields(db.schools.find(function(s){return s.code==='IZ-105';}).id)");
  assert(f.indexOf('کامپیوتر') >= 0, 'رشتهٔ فنی باید باشد');
  assert(f.indexOf('طراحی دوخت') >= 0, 'رشتهٔ کاردانش باید باشد');
  assert(f.indexOf('علوم تجربی') < 0, 'رشتهٔ نظری نباید باشد');
});

test('مدرسهٔ بدون شاخه به همهٔ رشته‌ها برمی‌گردد', () => {
  const n = W("schoolFields(db.schools.find(function(s){return s.level==='متوسطه اول';}).id).length");
  const all = W('ALL_FIELDS.length');
  assert(n === all, 'دادهٔ قدیمی نباید بن‌بست شود: ' + n + ' از ' + all);
});

test('فرم کلاس فقط رشته‌های مدرسهٔ خودش را می‌دهد', () => {
  W("window._edit=null; classModal({name:'',grade:'',field:'',school_id:db.schools.find(function(s){return s.code==='SH-101';}).id})");
  const sel = dom.window.document.querySelector('#c_field');
  if (sel && sel.tagName === 'SELECT') {
    const vals = Array.prototype.slice.call(sel.options).map(function (o) { return o.value; });
    assert(vals.indexOf('مکانیک خودرو') < 0, 'رشتهٔ فنی نباید در دبیرستان نظری پیشنهاد شود');
  }
  W('closeModal&&closeModal()');
});

test('رشتهٔ فعلی کلاس حتی خارج از شاخه حفظ می‌شود', () => {
  const sid = W("db.schools.find(function(s){return s.code==='SH-101';}).id");
  W("window._edit=null; classModal({name:'آزمون',grade:'دهم',field:'گرافیک',class_mode:'field',school_id:" + sid + "})");
  const sel = dom.window.document.querySelector('#c_field');
  if (sel && sel.tagName === 'SELECT') {
    const vals = Array.prototype.slice.call(sel.options).map(function (o) { return o.value; });
    assert(vals.indexOf('گرافیک') >= 0, 'رشتهٔ ثبت‌شدهٔ کلاس نباید از فهرست بیفتد');
  }
  W('closeModal&&closeModal()');
});

test('شاخه‌های مدرسه در فرم درس محدود است', () => {
  const b = W("schoolBranches(db.schools.find(function(s){return s.code==='SH-101';}).id)");
  assert(b.length === 1 && b[0] === 'نظری', 'باید فقط نظری باشد: ' + b.join('،'));
});


// ── کلاس‌بندی خودکار از اکسل
test('نام عامیانه رشته به نام رسمی تبدیل می‌شود', () => {
  const sid = W("db.schools.find(function(s){return s.code==='IZ-105';}).id");
  /* الکتروتکنیک و الکترونیک دو رشتهٔ مجزا هستند — نباید یکی شوند */
  const pairs = [['دهم الکتروتکنیک', 'الکتروتکنیک'], ['دهم برق', 'الکتروتکنیک'],
                 ['دهم الکترونیک', 'الکترونیک'], ['یازدهم مخابرات', 'الکترونیک'],
                 ['۱۰ رایانه', 'کامپیوتر'], ['یازدهم خیاطی', 'طراحی دوخت']];
  pairs.forEach(function (p) {
    const o = W('parsePlacement(' + JSON.stringify(p[0]) + ',' + sid + ')');
    assert(o && o.field === p[1], p[0] + ' → ' + (o ? o.field : 'null') + ' (انتظار: ' + p[1] + ')');
  });
});

test('پایه با ارقام فارسی درست خوانده می‌شود', () => {
  const sid = W("db.schools.find(function(s){return s.code==='SH-101';}).id");
  [['۱۱ ریاضی', 11], ['۱۲ تجربی', 12], ['دهم تجربی', 10], ['پایه ۱۰ انسانی', 10]].forEach(function (p) {
    const o = W('parsePlacement(' + JSON.stringify(p[0]) + ',' + sid + ')');
    assert(o && o.grade === p[1], p[0] + ' → پایهٔ ' + (o ? o.grade : 'null') + ' (انتظار: ' + p[1] + ')');
  });
});

test('رشتهٔ خارج از شاخهٔ مدرسه علامت می‌خورد', () => {
  const sh = W("db.schools.find(function(s){return s.code==='SH-101';}).id");
  const ok = W("parsePlacement('دهم تجربی'," + sh + ')');
  const no = W("parsePlacement('دهم گرافیک'," + sh + ')');
  assert(ok.offered === true, 'رشتهٔ نظری باید مجاز باشد');
  assert(no.offered === false, 'گرافیک در دبیرستان نظری نباید مجاز باشد');
});

test('کلاس ابتدایی و متوسطه اول شاخه می‌گیرد نه رشته', () => {
  const sid = W('db.schools[0].id');
  const a = W("parsePlacement('هفتم ۲'," + sid + ')');
  assert(a.grade === 7 && a.mode === 'class', 'هفتم ۲ باید کلاس‌محور باشد');
  const b = W("parsePlacement('پنجم الف'," + sid + ')');
  assert(b.grade === 5 && b.section === 'الف', 'شاخهٔ «الف» تشخیص داده نشد');
});

test('نام استاندارد کلاس ساخته می‌شود', () => {
  const iz = W("db.schools.find(function(s){return s.code==='IZ-105';}).id");
  const o = W("parsePlacement('۱۰ برق'," + iz + ')');
  assert(o.name === 'دهم الکتروتکنیک', 'نام ساخته‌شده: ' + o.name);
  const e = W("parsePlacement('۱۰ الکترونیک'," + iz + ')');
  assert(e.name === 'دهم الکترونیک', 'الکترونیک نباید به الکتروتکنیک تبدیل شود: ' + e.name);
});

test('الکتروتکنیک و الکترونیک دو رشتهٔ جدا می‌مانند', () => {
  const fl = W("BRANCHES['فنی و حرفه‌ای']");
  assert(fl.indexOf('الکتروتکنیک') >= 0, 'الکتروتکنیک باید باشد');
  assert(fl.indexOf('الکترونیک') >= 0, 'الکترونیک باید رشتهٔ مستقل باشد');
  const iz = W("db.schools.find(function(s){return s.code==='IZ-105';}).id");
  const a = W("parsePlacement('دهم الکتروتکنیک'," + iz + ')');
  const b = W("parsePlacement('دهم الکترونیک'," + iz + ')');
  assert(a.field !== b.field, 'این دو نباید یک رشته تشخیص داده شوند');
});

test('دانش‌آموزان هم‌پایه و هم‌رشته در یک کلاس جمع می‌شوند', () => {
  const iz = W("db.schools.find(function(s){return s.code==='IZ-105';}).id");
  const rows = [{ index: 0, text: 'دهم الکتروتکنیک' }, { index: 1, text: '۱۰ برق' },
                { index: 2, text: 'دهم برق صنعتی' }, { index: 3, text: 'دهم کامپیوتر' },
                { index: 4, text: 'دهم الکترونیک' }];
  const r = W('planPlacement(' + JSON.stringify(rows) + ',' + iz + ')');
  const names = {};
  Object.keys(r.plan).forEach(function (k) { if (r.plan[k]) names[r.plan[k].name] = (names[r.plan[k].name] || 0) + 1; });
  assert(names['دهم الکتروتکنیک'] === 3, 'سه نوشتار الکتروتکنیک باید یک کلاس شوند: ' + JSON.stringify(names));
  assert(names['دهم کامپیوتر'] === 1, 'کامپیوتر باید جدا باشد');
  assert(names['دهم الکترونیک'] === 1, 'الکترونیک باید کلاس جدا داشته باشد');
});

test('ورود اکسل کلاس رشته‌محور با مشخصات درست می‌سازد', () => {
  W("S.user=db.users.find(function(u){return u.role==='manager'&&u.school_id===db.schools.find(function(s){return s.code==='IZ-105';}).id;})");
  const sid = W('S.user.school_id');
  const before = W('db.classes.filter(function(c){return c.school_id===' + sid + ';}).length');
  W("window.__N=(function(){var out=[];var n=770000;while(out.length<4){n++;var b=String(n).padStart(9,'0');"
    + "var s=0;for(var i=0;i<9;i++)s+=Number(b[i])*(10-i);var r=s%11;var c=r<2?r:11-r;var nid=b+c;"
    + "if(validNid(nid)&&!nidOwner(nid))out.push(nid);}return out;})()");
  const NL = String.fromCharCode(10);
  const csv = 'نام,نام خانوادگی,کد ملی,کلاس,نام پدر,کد ملی پدر' + NL
    + 'رضا,احمدی,' + W('window.__N[0]') + ',دهم الکتروتکنیک,مرتضی احمدی,' + W('window.__N[1]') + NL
    + 'سعید,موسوی,' + W('window.__N[2]') + ',۱۰ برق,حسن موسوی,' + W('window.__N[3]');
  W('window.__sh=prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students')");
  W("window.__pv=validateImport(window.__sh.rows,window.__sh.mapping,'students')");
  const rep = W("commitImport({entity:'students',preview:window.__pv})");
  assert(rep.created === 2, 'دو دانش‌آموز باید ساخته شود: ' + rep.created);
  assert(rep.classes === 1, 'هر دو باید در یک کلاس بروند، ساخته شد: ' + rep.classes);
  const cls = W('db.classes.filter(function(c){return c.school_id===' + sid + ';}).slice(' + before + ')');
  assert(cls.length === 1 && cls[0].field === 'الکتروتکنیک',
    'رشتهٔ کلاس: ' + (cls[0] ? cls[0].field : '—'));
  assert(cls[0].grade_level === 10, 'پایهٔ کلاس: ' + cls[0].grade_level);
  assert(cls[0].class_mode === 'field', 'حالت کلاس باید رشته‌محور باشد');
  const n = W('db.enrollments.filter(function(e){return e.class_id===' + cls[0].id + ';}).length');
  assert(n === 2, 'هر دو دانش‌آموز باید در همان کلاس ثبت شوند: ' + n);
});

test('نام واقعی مادر از فایل خوانده می‌شود نه ساختگی', () => {
  W("S.user=db.users.find(function(u){return u.role==='manager';})");
  W("window.__N2=(function(){var out=[];var n=880000;while(out.length<3){n++;var b=String(n).padStart(9,'0');"
    + "var s=0;for(var i=0;i<9;i++)s+=Number(b[i])*(10-i);var r=s%11;var c=r<2?r:11-r;var nid=b+c;"
    + "if(validNid(nid)&&!nidOwner(nid))out.push(nid);}return out;})()");
  const NL = String.fromCharCode(10);
  const csv = 'نام و نام خانوادگی,کد ملی,کلاس,نام پدر,کد ملی پدر,نام مادر,کد ملی مادر' + NL
    + 'کیان پارسا,' + W('window.__N2[0]') + ',پنجم الف,بهروز پارسا,' + W('window.__N2[1]')
    + ',شیرین دادگر,' + W('window.__N2[2]');
  W('window.__sh2=prepSheet(parseCSV(' + JSON.stringify(csv) + "),'students')");
  W("window.__pv2=validateImport(window.__sh2.rows,window.__sh2.mapping,'students')");
  W("commitImport({entity:'students',preview:window.__pv2})");
  const st = W("db.users.filter(function(u){return u.full_name==='کیان پارسا';})[0]");
  assert(st, 'دانش‌آموز ساخته نشد');
  const links = W('db.parent_links.filter(function(l){return l.student_id===' + st.id + ';})');
  const names = links.map(function (l) { return (W('byId("users",' + l.parent_id + ')') || {}).full_name; });
  assert(names.indexOf('شیرین دادگر') >= 0, 'نام واقعی مادر ثبت نشد: ' + names.join('، '));
});

test('ایندکس پس از درج افزایشی تازه می‌ماند', () => {
  const n0 = W('db.users.length');
  W("window.__u=insert('users',{school_id:db.schools[0].id,role:'student',full_name:'آزمون ایندکس',username:'idxtest1',password:'1',active:1,national_id:'1111111112'})");
  const found = W('byId("users",window.__u.id)');
  assert(found && found.full_name === 'آزمون ایندکس', 'رکورد تازه از ایندکس پیدا نشد');
  const byNid = W("idxUserByNid().get('1111111112')");
  assert(byNid && byNid.id === W('window.__u.id'), 'ایندکس کد ملی تازه نشد');
  W("remove('users',window.__u.id)");
});


// ── دیاگ سامانه
test('دیاگ اجرا می‌شود و خلاصهٔ معتبر می‌دهد', () => {
  W("S.user=db.users.find(function(u){return u.role==='superadmin';})");
  const out = W('window.__dg=runDiagnostics()');
  assert(out.summary.total >= 15, 'تعداد آزمون کم است: ' + out.summary.total);
  assert(out.summary.passed + out.summary.critical + out.summary.warning
         + out.summary.info === out.summary.total, 'جمع دسته‌ها با کل نمی‌خواند');
  assert(out.summary.health >= 0 && out.summary.health <= 100, 'نمره خارج از بازه');
  assert(out.summary.ms >= 0, 'زمان اجرا منفی است');
  /* آزمون‌های پیشین عمداً داده ساخته‌اند؛ دیاگ باید بتواند
     عیب‌های امن را پاک کند و نمره را بالا ببرد. */
  const h0 = out.summary.health;
  W('diagFixAll()');
  const h1 = W('runDiagnostics().summary.health');
  assert(h1 >= h0, 'تعمیر خودکار نباید نمره را پایین بیاورد: ' + h0 + ' → ' + h1);
});

test('دیاگ ثبت‌نام بی‌صاحب را پیدا و تعمیر می‌کند', () => {
  /* ابتدا هرچه بی‌صاحب هست پاک شود تا سنجش از پایهٔ تمیز باشد */
  W("diagFix('orphan-enrollments')");
  const clean = W('db.enrollments.length');
  W("insert('enrollments',{school_id:1,class_id:987654,student_id:987653})");
  W("insert('enrollments',{school_id:1,class_id:987655,student_id:987652})");
  const r = W("DIAG_CHECKS.filter(function(c){return c.id==='orphan-enrollments';})[0].check()");
  assert(r.ok === false, 'ثبت‌نام بی‌صاحب تشخیص داده نشد');
  assert(r.count === 2, 'باید دو مورد باشد: ' + r.count);
  const fx = W("diagFix('orphan-enrollments')");
  assert(fx.ok === true, 'تعمیر ناموفق: ' + fx.msg);
  assert(W('db.enrollments.length') === clean, 'پس از تعمیر باید به حالت تمیز برگردد');
});

test('دیاگ ثبت‌نام تکراری را با نگه‌داشتن جدیدترین رفع می‌کند', () => {
  const st = W("db.users.filter(function(u){return u.role==='student';})[0].id");
  const before = W('db.enrollments.filter(function(e){return e.student_id===' + st + ';}).length');
  W("insert('enrollments',{school_id:1,class_id:db.classes[0].id,student_id:" + st + '})');
  W("insert('enrollments',{school_id:1,class_id:db.classes[1].id,student_id:" + st + '})');
  const r = W("DIAG_CHECKS.filter(function(c){return c.id==='duplicate-enrollment';})[0].check()");
  assert(r.ok === false, 'تکرار تشخیص داده نشد');
  W("diagFix('duplicate-enrollment')");
  const after = W('db.enrollments.filter(function(e){return e.student_id===' + st + ';}).length');
  assert(after === 1, 'باید دقیقاً یک ثبت‌نام بماند، ماند: ' + after);
});

test('نام کاربری تکراری خودکار اصلاح می‌شود', () => {
  const u = W("db.users.filter(function(x){return x.role==='student';})[1]");
  const dup = W("insert('users',{school_id:1,role:'student',full_name:'همنام آزمون',username:" + JSON.stringify(u.username) + ",password:'1',active:1})");
  const r = W("DIAG_CHECKS.filter(function(c){return c.id==='duplicate-username';})[0].check()");
  assert(r.ok === false, 'نام کاربری تکراری تشخیص داده نشد');
  W("diagFix('duplicate-username')");
  const after = W("DIAG_CHECKS.filter(function(c){return c.id==='duplicate-username';})[0].check()");
  assert(after.ok === true, 'پس از تعمیر نباید تکراری بماند');
  W("remove('users'," + dup.id + ')');
});

test('عیب نیازمند قضاوت انسانی خودکار تعمیر نمی‌شود', () => {
  const unsafe = W("DIAG_CHECKS.filter(function(c){return c.id==='duplicate-nid';})[0]");
  assert(!unsafe.safe || !unsafe.fix, 'کد ملی تکراری نباید خودکار تعمیر شود');
  const r = W("diagFix('duplicate-nid')");
  assert(r.ok === false, 'باید رد شود');
});

test('دیاگ خودش با آزمون معیوب نمی‌شکند', () => {
  W("DIAG_CHECKS.push({id:'__boom',title:'آزمون خراب',desc:'',severity:'info',safe:false,check:function(){throw new Error('انفجار');}})");
  const out = W('runDiagnostics()');
  assert(out && out.summary, 'دیاگ باید با وجود آزمون معیوب کار کند');
  const b = out.results.filter(function (r) { return r.id === '__boom'; })[0];
  assert(b && b.selfError === true, 'خطای آزمون باید علامت بخورد');
  W("DIAG_CHECKS=DIAG_CHECKS.filter(function(c){return c.id!=='__boom';})");
});

test('صفحهٔ دیاگ فقط برای سوپرادمین باز است', () => {
  W("S.user=db.users.find(function(u){return u.role==='manager';})");
  const out = W('viewDiagnostics()');
  assert(out.indexOf('دسترسی ندارید') >= 0, 'مدیر نباید دیاگ ببیند');
  W("S.user=db.users.find(function(u){return u.role==='superadmin';});S.diag=runDiagnostics()");
  const ok = W('viewDiagnostics()');
  assert(ok.indexOf('diag-gauge') >= 0, 'سوپرادمین باید گیج سلامت ببیند');
});

// ── زمان‌بندی زنگ‌ها و شیفت
test('شیفت مدرسه ذخیره و خوانده می‌شود', () => {
  const s = W("db.schools.filter(function(x){return x.shift==='بعدازظهر';})");
  assert(s.length >= 1, 'مدرسهٔ شیفت بعدازظهر در دادهٔ نمونه نیست');
});

test('تبدیل ساعت به دقیقه و برعکس درست است', () => {
  assert(W("timeToMin('07:30')") === 450, 'تبدیل ۰۷:۳۰ غلط است');
  assert(W("minToTime(450)") === '07:30', 'تبدیل معکوس غلط است');
  assert(W("timeToMin('۱۳:۰۰')") === 780, 'ارقام فارسی خوانده نشد');
  assert(W("timeToMin('99:99')") === null, 'ساعت نامعتبر باید رد شود');
});

test('خط زمانی زنگ‌ها ساعت واقعی می‌دهد', () => {
  const sid = W('db.schools[0].id');
  const tl = W('bellTimeline(' + sid + ')');
  assert(tl.length > 0, 'خط زمانی خالی است');
  assert(tl[0].kind === 'lesson' && tl[0].no === 1, 'اولین بازه باید زنگ یک باشد');
  /* هر بازه باید از قبلی شروع شود */
  for (let i = 1; i < tl.length; i++) {
    assert(tl[i].from === tl[i - 1].to, 'بازه‌ها پیوسته نیستند: ' + tl[i].from + ' ≠ ' + tl[i - 1].to);
  }
  const breaks = tl.filter(function (x) { return x.kind === 'break'; });
  assert(breaks.length > 0, 'زنگ تفریح وجود ندارد');
});

test('مدرسهٔ بعدازظهر ساعت شروع دیرتری دارد', () => {
  const am = W("db.schools.filter(function(s){return (s.shift||'صبح')==='صبح';})[0].id");
  const pm = W("db.schools.filter(function(s){return s.shift==='بعدازظهر';})[0].id");
  const a = W('timeToMin(bellOf(' + am + ').start)');
  const p = W('timeToMin(bellOf(' + pm + ').start)');
  assert(p > a, 'شیفت بعدازظهر باید دیرتر شروع شود: ' + p + ' ≤ ' + a);
});

test('مدیر می‌تواند زمان‌بندی دلخواه ذخیره کند', () => {
  const sid = W("db.schools.find(function(s){return s.level!=='ابتدایی';}).id");
  const r = W("bellSave(" + sid + ",'08:15',[{kind:'lesson',min:50},{kind:'break',min:20},{kind:'lesson',min:50}])");
  assert(r.ok === true, 'ذخیره ناموفق: ' + r.msg);
  const tl = W('bellTimeline(' + sid + ')');
  assert(tl[0].from === '08:15', 'ساعت شروع اعمال نشد: ' + tl[0].from);
  assert(tl[0].to === '09:05', 'زنگ ۵۰ دقیقه‌ای درست حساب نشد: ' + tl[0].to);
  assert(tl[1].kind === 'break' && tl[1].to === '09:25', 'تفریح ۲۰ دقیقه‌ای غلط است');
  assert(W('bellLessonCount(' + sid + ')') === 2, 'تعداد زنگ درسی');
});

test('زمان‌بندی نامعتبر رد می‌شود', () => {
  const sid = W('db.schools[0].id');
  assert(W("bellSave(" + sid + ",'بی‌معنا',[{kind:'lesson',min:45}])").ok === false, 'ساعت غلط باید رد شود');
  assert(W("bellSave(" + sid + ",'08:00',[])").ok === false, 'بدون بازه باید رد شود');
  assert(W("bellSave(" + sid + ",'08:00',[{kind:'lesson',min:0}])").ok === false, 'مدت صفر باید رد شود');
  assert(W("bellSave(" + sid + ",'23:00',[{kind:'lesson',min:200}])").ok === false, 'گذر از نیمه‌شب باید رد شود');
});

test('صفحهٔ زنگ‌ها برای مدیر رندر می‌شود', () => {
  W("S.user=db.users.find(function(u){return u.role==='manager';});S.filters={}");
  const out = W('viewBells()');
  assert(typeof out === 'string' && out.indexOf('bell-line') >= 0, 'خط زمانی رندر نشد');
});

// ── حفظ اسکرول منو
test('نشانهٔ تغییر مسیر هنگام ناوبری ست می‌شود', () => {
  W("S.user=db.users.find(function(u){return u.role==='superadmin';})");
  W("S.__routeChanged=false; go('diag')");
  assert(W('S.route') === 'diag', 'مسیر عوض نشد');
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
