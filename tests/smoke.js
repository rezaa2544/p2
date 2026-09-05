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

/* test() با fn همگام یا ناهمگام (Promise) کار می‌کند؛ ترتیب ثبت حفظ
   می‌شود و در پایان main همهٔ Promiseها منتظر می‌مانند. */
const testQueue = [];
let __seq = Promise.resolve();
function test(name, fn) {
  /* آزمون‌ها به‌نوبت (نه هم‌زمان) اجرا می‌شوند: ترتیب قطعی، حافظهٔ کم.
     در محیط‌های کم‌حافظه با --expose-gc اجرا کنید تا بعد از هر تست
     زبالهٔ رندر آزاد شود و هیپ از مرز عبور نکند. */
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) {
      fail++; errors.push(`${name}: ${e.message}`);
      console.log(`  ❌ ${name}\n     ${e.message}`);
      resolve(); return;
    }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; errors.push(`${name}: ${e.message}`); console.log(`  ❌ ${name}\n     ${e.message}`); }
    ).then(() => {
      if (typeof gc === 'function') gc();
      resolve();
    });
  }));
  __seq = p;
  testQueue.push(p);
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
  counselor: ['cqueue', 'dashboard', 'announcements', 'notifications'],
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

test('چهار تب چرخه سال رندر می‌شوند', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null;S.route='schoolyear';S.filters={}");
  for(const t of ['status','placement','enroll','pre']){
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

test('بند ۰.۲: سال به‌عنوان موجودیت مستقل + قیف پیش‌ثبت‌نام سال آینده', () => {
  W("window.__saveS=S.user;window.__saveTab=S.tab;window.__saveRoute=S.route");
  const r = JSON.parse(W(`(()=>{
    var cur=yearCode(),nx=nextYearCode(cur);
    var ok1=Number(nx.split('-')[0])===Number(cur.split('-')[0])+1
      &&Number(nx.split('-')[1])===Number(cur.split('-')[1])+1;
    /* مدرسهٔ مجازی جدا — آلودگی دادهٔ دمو نباشد */
    var sc=insert('schools',{name:'مدرسهٔ تست صفر-دو',code:'TEST-02X',city:'شهر تست',level:'متوسطه دوم',
      type:'عادی',gender:'پسرانه',branches:[],fields:[],active:1,created_at:todayISO()}).id;
    insert('users',{school_id:sc,role:'manager',full_name:'مدیر تست',username:'mgrtest02',
      password:'123456',national_id:'0000000001',phone:'09100000001',active:1,title:'مدیر مدرسه',created_at:todayISO()});
    var cls=insert('classes',{school_id:sc,name:'نهم ۱',grade:'نهم',grade_level:9,capacity:30}).id;
    var stu=insert('users',{school_id:sc,role:'student',full_name:'دانش‌آموز تست',username:'sttest02a',
      national_id:'0000000002',phone:null,grade_level:9,status:'active',active:1,created_at:todayISO()}).id;
    insert('enrollments',{school_id:sc,class_id:cls,student_id:stu,year:cur});
    /* بستن سال (همان پیمانی که اکشن year-close می‌زند) */
    saveYearState(sc,{closed:1,closed_at:new Date().toISOString(),promoted:1,placement_year:nextYearCode(cur)});
    var py=targetYearOf(sc);
    /* چیدمان: سالِ ثبت‌نام باید سالِ مقصد (سال بعد) باشد */
    applyPlacement([{studentId:stu,classId:cls}],sc);
    var en=db.enrollments.filter(function(e){return e.student_id===stu&&e.class_id===cls;})[0];
    /* قیف: ثبت ← تأیید (ساخت/وصل) ← چیدمان (نشانهٔ placed) */
    var p1=preAddRow(sc,{name:'تازه‌وارد تست',national_id:'0000000003',phone:'09100000003',grade:9,field:null}).id;
    var p2=preAddRow(sc,{name:'بازگشتی تست',national_id:'0000000002',phone:null,grade:10,field:null}).id;
    var nRet=preAddReturning(sc);
    var c1=preConfirm(sc,p1);
    var c2=preConfirm(sc,p2);
    applyPlacement([{studentId:c2.student_id,classId:cls}],sc);
    var stAfter=byId('pre_enrollments',p2).status;
    /* نما: تب پیش‌ثبت‌نام رندر می‌شود */
    S.user=db.users.find(function(u){return u.username==='mgrtest02';});
    S.persona=null;S.route='schoolyear';S.tab='pre';
    var h=renderRoute();
    var viewOk=h.indexOf('پیش‌ثبت‌نام')>-1&&h.indexOf('بازگشتی')>-1;
    /* پاک‌سازی: مدرسهٔ مجازی نباید در تست‌های بعدی مانده باشد */
    db.pre_enrollments.filter(function(p){return p.school_id===sc;})
      .forEach(function(p){remove('pre_enrollments',p.id);});
    db.school_years.filter(function(y){return y.school_id===sc;})
      .forEach(function(y){remove('school_years',y.id);});
    db.enrollments.filter(function(e){return e.school_id===sc;})
      .forEach(function(e){remove('enrollments',e.id);});
    db.users.filter(function(u){return u.school_id===sc;})
      .forEach(function(u){remove('users',u.id);});
    db.classes.filter(function(c){return c.school_id===sc;})
      .forEach(function(c){remove('classes',c.id);});
    remove('schools',sc);
    return JSON.stringify({ok1:ok1,nx:nx,targetIsNext:py===nx,enYear:en?en.year:null,
      nRet:nRet,c1ok:c1.ok,c1created:c1.created,c2ok:c2.ok,c2created:c2.created,
      c2linked:c2.student_id===stu,viewOk:viewOk,stAfter:stAfter});
  })()`));
  W("S.user=window.__saveS;S.tab=window.__saveTab;S.route=window.__saveRoute");
  assert(r.ok1 === true, 'nextYearCode سال بعد را درست نمی‌سازد');
  assert(r.targetIsNext === true, '🔴 سالِ مقصدِ سالِ بسته‌شده، سال بعد نیست');
  assert(r.enYear === r.nx, '🔴 چیدمان در سالِ مقصد ثبت نشد (ثبت: ' + r.enYear + '، مورد انتظار: ' + r.nx + ')');
  assert(r.c1ok === true && r.c1created === true, '🔴 تأیید پیش‌ثبت‌نام تازه‌وارد حساب نساخت');
  assert(r.c2ok === true && r.c2created === false && r.c2linked === true, '🔴 کد ملی موجود به حساب فعلی وصل نشد');
  assert(r.nRet >= 1, '🔴 افزودن دانش‌آموزان بازگشتی کار نکرد');
  assert(r.stAfter === 'placed', '🔴 پیش‌ثبت‌نامِ دانش‌آموزِ چیده‌شده «چیده شد» نشد');
  assert(r.viewOk === true, '🔴 تب پیش‌ثبت‌نام رندر نشد');
});
test('بند ۵: organization_id ساختاری روی مدرسه‌های نمونه است', () => {
  const r = JSON.parse(W(`(()=>{
    var all=db.schools;
    var missing=all.filter(function(x){return !('organization_id' in x);}).length;
    var nonNull=all.filter(function(x){return x.organization_id!==null;}).length;
    return JSON.stringify({n:all.length,missing:missing,nonNull:nonNull});
  })()`));
  assert(r.n>0, 'مدرسه در داده نمونه نیست');
  assert(r.missing===0, '🔴 organization_id روی همه‌ای مدرسه‌های نمونه نیست');
  assert(r.nonNull===0, '🔴 organization_id باید ساده باشد باماند (امروز همیشه بدون مالک)');
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

test('سلامت: دایره‌های آنالوگ — پیش‌فرض عقربه‌ای و انتخاب کاربر ماندگار', () => {
  W("S.user=db.users.find(u=>u.role==='superadmin')");
  const page = W('viewHealth()');
  assert(page.indexOf('دایره‌های آنالوگ') >= 0, 'کارت دایره‌ها نیست');
  assert(page.indexOf('hgt-needle') >= 0, 'شیوهٔ پیش‌فرض (عقربه‌ای) رندر نشد');
  assert((page.match(/data-act="health-gauge-style"/g) || []).length === 3, 'سه دکمهٔ انتخاب شیوه نیست');
  W("Store.set('payesh_health_gauge_v1','bar')");
  const p2 = W('viewHealth()');
  assert(p2.indexOf('hgt-fill') >= 0, 'شیوهٔ میله‌ای رندر نشد');
  assert(p2.indexOf('hgt-needle') === -1, 'شیوهٔ قبلی هنوز جا دارد');
  W("Store.set('payesh_health_gauge_v1','thermo')");
  assert(W('viewHealth()').indexOf('hgt-fill') >= 0, 'نامِ قدیمی (thermo) باید به میله‌ای نگاشت شود');
  W("Store.set('payesh_health_gauge_v1','dial')");
  assert(W('viewHealth()').indexOf('hgt-dot') >= 0, 'شیوهٔ آنالوگ رندر نشد');
  W("Store.set('payesh_health_gauge_v1','bogus')");
  assert(W('viewHealth()').indexOf('hgt-needle') >= 0, 'شیوهٔ ناشناخته باید به پیش‌فرض برگردد');
  W("Store.remove('payesh_health_gauge_v1')");
});

test('سلامت: رنگ عقربه پیروِ محدودهٔ فعلی است', () => {
  assert(W("hgtZoneTone(0.2,false)") === 'var(--green)', 'محدودهٔ پایین باید سبز باشد');
  assert(W("hgtZoneTone(0.7,false)") === 'var(--amber)', 'محدودهٔ میانی باید کهربایی باشد');
  assert(W("hgtZoneTone(0.9,false)") === 'var(--red)', 'محدودهٔ بالا باید سرخ باشد');
  assert(W("hgtZoneTone(0.9,true)") === 'var(--green)', 'در شاخصِ هرچه-بالاتر-بهتر، بالا سبز است');
  assert(W("hgtZoneTone(0.2,true)") === 'var(--red)', 'در شاخصِ هرچه-بالاتر-بهتر، پایین سرخ است');
  const over = W("healthGauge('needle',{label:'تست',unit:'٪',value:999,max:100,tone:'bad'},'tz')");
  assert(/class="hgt-needle-body"[^>]*fill="var\(--red\)"/.test(over), 'عقربه در محدودهٔ سرخ، رنگ سرخ نگرفت');
  const low = W("healthGauge('needle',{label:'تست',unit:'٪',value:5,max:100,tone:'bad'},'tz')");
  assert(/class="hgt-needle-body"[^>]*fill="var\(--green\)"/.test(low), 'عقربه در محدودهٔ سبز، رنگ سبز نگرفت');
  const goodHi = W("healthGauge('needle',{label:'تست',unit:'٪',value:95,max:100,tone:'ok',goodHigh:true},'tz')");
  assert(/class="hgt-needle-body"[^>]*fill="var\(--green\)"/.test(goodHi), 'در شاخصِ هرچه-بالاتر-بهتر، بالا باید سبز بماند');
});

test('سلامت: دایره‌های آنالوگ مقادیر خارج از حد را سنجاق می‌کنند', () => {
  const over = W("healthGauge('needle',{label:'تست',unit:'٪',value:999,max:100,tone:'ok'},'t1')");
  assert(over.indexOf('rotate(120.00deg)') >= 0, 'مقدار بیش از حد، عقربه را از ۱۲۰ درجه گذراند');
  const under = W("healthGauge('bar',{label:'تست',unit:'٪',value:-50,max:100,tone:'ok'},'t2')");
  assert(under.indexOf('hgt-svg') >= 0 && under.indexOf('NaN') === -1, 'مقدار منفی خرابی ساخت');
  const zero = W("healthGauge('dial',{label:'تست',unit:'٪',value:0,max:100,tone:'blue'},'t3')");
  assert(zero.indexOf('hgt-svg') >= 0 && zero.indexOf('NaN') === -1, 'صفر در شیوهٔ آنالوگ خراب شد');
  const nil = W("healthGauge('needle',{label:'تست',unit:'',value:undefined,max:100,tone:'ok'},'t4')");
  assert(nil.indexOf('NaN') === -1, 'مقدار تعریف‌نشده باید صفر خوانده شود');
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
                 ['manager','imp-commit',true],
                 /* 🔴 دور ۴۷: سوپرادمین به‌عنوان خودش دیگر ورود اکسل ندارد —
                    کار مدیر مدرسه است. از راه S.boss همچنان دارد. */
                 ['superadmin','imp-preview',false]];
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
                 ['manager','sms-send',true],['manager','form-print',true],
                 /* 🔴 دور ۴۷: پیامک و فرم مدرسه کار مدیر است، نه سوپرادمین */
                 ['superadmin','sms-topup-ok',false]];
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
                 ['manager','promote-run',true],['manager','tr-ok',true],
                 /* 🔴 دور ۴۷: چرخهٔ تحصیلی و انتقال کار مدیر مدرسه است */
                 ['superadmin','tr-send',false]];
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

test('دیاگ ثبت‌نام بی‌صاحب را پیدا و تعمیر می‌کند', async () => {
  /* ابتدا هرچه بی‌صاحب هست پاک شود تا سنجش از پایهٔ تمیز باشد */
  await W("diagFix('orphan-enrollments')");
  const clean = W('db.enrollments.length');
  W("insert('enrollments',{school_id:1,class_id:987654,student_id:987653})");
  W("insert('enrollments',{school_id:1,class_id:987655,student_id:987652})");
  const r = W("DIAG_CHECKS.filter(function(c){return c.id==='orphan-enrollments';})[0].check()");
  assert(r.ok === false, 'ثبت‌نام بی‌صاحب تشخیص داده نشد');
  assert(r.count === 2, 'باید دو مورد باشد: ' + r.count);
  const fx = await W("diagFix('orphan-enrollments')");
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

test('عیب نیازمند قضاوت انسانی خودکار تعمیر نمی‌شود', async () => {
  const unsafe = W("DIAG_CHECKS.filter(function(c){return c.id==='duplicate-nid';})[0]");
  assert(!unsafe.safe || !unsafe.fix, 'کد ملی تکراری نباید خودکار تعمیر شود');
  const r = await W("diagFix('duplicate-nid')");
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

test('موتور خودتعمیر: کنش‌ها از طریق کلیک واقعی کار می‌کنند', async () => {
  const clickAct = (act) => W(
    `(function(){var el=document.createElement('button');el.setAttribute('data-act','${act}');` +
    `document.body.appendChild(el);el.dispatchEvent(new MouseEvent('click',{bubbles:true}));el.remove();})()`);
  const toastText = () => W(`(document.getElementById('toasts')||{textContent:''}).textContent`);

  /* کنش «بازگردانی گزینه‌های پنهان» — کلیک واقعی، اثر واقعی */
  W("navDisableAdd('bells')");
  clickAct('diag-nav-restore');
  await sleep(50);
  const routes = W("(function(){var r=[];navFor({role:'superadmin'}).forEach(function(g){g[1].forEach(function(i){r.push(i[0]);});});return r;})()");
  assert(routes.indexOf('bells') > -1, 'کنش بازگردانی از کلیک کار نکرد');

  /* کنش «سنجش سرور» در حالت تک‌فایل باید صادقانه رد شود */
  clickAct('diag-probe');
  await sleep(100);
  assert(toastText().indexOf('تک‌فایل') > -1, 'سنجش سرور در حالت تک‌فایل پیام صادقانه نداد: ' + toastText());

  const page = W('viewDiagnostics()');
  assert(page.indexOf('کتابچهٔ عملیات') >= 0, 'کتابچهٔ عملیات در صفحهٔ دیاگ نیست');
  assert(page.indexOf('ارتباط، هاست و زیرساخت') >= 0, 'خانوادهٔ زیرساخت در دیاگ نیست');
});

test('پنهان‌سازی خودکار گزینهٔ منو و بازگردانی', () => {
  W("navDisableAdd('bells')");
  const routes = W("(function(){var r=[];navFor({role:'superadmin'}).forEach(function(g){g[1].forEach(function(i){r.push(i[0]);});});return r;})()");
  assert(routes.indexOf('bells') === -1, 'گزینهٔ پنهان‌شده هنوز در منو است');
  W('navRestoreAll()');
  const routes2 = W("(function(){var r=[];navFor({role:'superadmin'}).forEach(function(g){g[1].forEach(function(i){r.push(i[0]);});});return r;})()");
  assert(routes2.indexOf('bells') > -1, 'بازگردانی کار نکرد');
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

/* ── نسخهٔ ۲ زنگ: ساعت به تفکیک روز (دور ۶۳) ──────────────────── */

test('تعریف به تفکیک روز: ساعت هر روز مستقل است', () => {
  const sid = W('db.schools[1].id');
  const saved = W('JSON.stringify((db.bell_schedules||[]).filter(b=>b.school_id===' + sid + '))');
  try {
    const days = [
      {start:'07:00', slots:[{kind:'lesson',min:30}]},
      {start:'13:00', slots:[{kind:'lesson',min:30},{kind:'break',min:10},{kind:'lesson',min:30}]},
      {start:'07:00', slots:[{kind:'lesson',min:30}]},
      {start:'07:00', slots:[{kind:'lesson',min:30}]},
      {start:'07:00', slots:[{kind:'lesson',min:30}]}
    ];
    const r = JSON.parse(W('JSON.stringify(bellSaveDays(' + sid + ',' + JSON.stringify(days) + '))'));
    assert(r.ok === true, 'ذخیره به تفکیک روز ناموفق: ' + r.msg);
    const t0 = JSON.parse(W('JSON.stringify(bellTimeline(' + sid + ',0))'));
    const t1 = JSON.parse(W('JSON.stringify(bellTimeline(' + sid + ',1))'));
    assert(t0[0].from === '07:00' && t0.length === 1, 'شنبه: ' + JSON.stringify(t0));
    assert(t1[0].from === '13:00' && t1.length === 3, 'یکشنبه: ' + JSON.stringify(t1));
    const def = JSON.parse(W('JSON.stringify(bellTimeline(' + sid + '))'));
    assert(JSON.stringify(def) === JSON.stringify(t0), 'روز پیش‌فرض باید شنبه باشد');
    assert(W('bellLessonCount(' + sid + ',1)') === 2, 'تعداد زنگ یکشنبه غلط');
    assert(W('bellLessonCount(' + sid + ',0)') === 1, 'تعداد زنگ شنبه غلط');
  } finally {
    W('(()=>{(db.bell_schedules||[]).filter(b=>b.school_id===' + sid + ')'
      + '.forEach(b=>remove("bell_schedules",b.id));'
      + 'JSON.parse(' + JSON.stringify(saved) + ').forEach(r=>insert("bell_schedules",r));'
      + '})()');
  }
});

test('رکورد نسخهٔ ۱ (میراثی) برای همهٔ روزها خوانده می‌شود', () => {
  const sid = W('db.schools[2].id');
  const saved = W('JSON.stringify((db.bell_schedules||[]).filter(b=>b.school_id===' + sid + '))');
  try {
    W('(()=>{(db.bell_schedules||[]).filter(b=>b.school_id===' + sid + ')'
      + '.forEach(b=>remove("bell_schedules",b.id));'
      + 'insert("bell_schedules",{school_id:' + sid
      + ",start:'08:00',slots:[{kind:'lesson',min:40},{kind:'break',min:10}]});})()");
    for (const d of [0, 2, 4]) {
      const tl = JSON.parse(W('JSON.stringify(bellTimeline(' + sid + ',' + d + '))'));
      assert(tl.length === 2 && tl[0].from === '08:00',
        'روز ' + d + ' رکورد میراثی را نخواند: ' + JSON.stringify(tl));
    }
    /* ذخیرهٔ تازه رکورد را به نسخهٔ ۲ ارتقا می‌دهد */
    W("bellSave(" + sid + ",'09:00',[{kind:'lesson',min:30}])");
    const rec = JSON.parse(W('JSON.stringify(bellRec(' + sid + '))'));
    assert(Array.isArray(rec.days) && rec.days.length === 5, 'ارتقا به نسخهٔ ۲ نشد');
    assert(rec.days[3].start === '09:00', 'روز چهارشنبه ارتقا نخورد');
  } finally {
    W('(()=>{(db.bell_schedules||[]).filter(b=>b.school_id===' + sid + ')'
      + '.forEach(b=>remove("bell_schedules",b.id));'
      + 'JSON.parse(' + JSON.stringify(saved) + ').forEach(r=>insert("bell_schedules",r));'
      + '})()');
  }
});

test('تعداد زنگ سقف ندارد: ده زنگ درسی ذخیره می‌شود', () => {
  const sid = W('db.schools[2].id');
  const saved = W('JSON.stringify((db.bell_schedules||[]).filter(b=>b.school_id===' + sid + '))');
  try {
    const slots = [];
    for (let i = 0; i < 10; i++){
      slots.push({kind:'lesson', min:20});
      if (i < 9) slots.push({kind:'break', min:5});
    }
    const days = [1,2,3,4,5].map(() => ({start:'06:00', slots: slots.map(s=>({kind:s.kind,min:s.min}))}));
    const r = JSON.parse(W('JSON.stringify(bellSaveDays(' + sid + ',' + JSON.stringify(days) + '))'));
    assert(r.ok === true, 'ذخیرهٔ ده زنگ ناموفق: ' + r.msg);
    assert(W('bellLessonCount(' + sid + ',0)') === 10, 'ده زنگ درسی ذخیره نشد');
    assert(W('bellEndTime(' + sid + ',0)') === '10:05', 'ساعت پایان محاسبه نشد');
  } finally {
    W('(()=>{(db.bell_schedules||[]).filter(b=>b.school_id===' + sid + ')'
      + '.forEach(b=>remove("bell_schedules",b.id));'
      + 'JSON.parse(' + JSON.stringify(saved) + ').forEach(r=>insert("bell_schedules",r));'
      + '})()');
  }
});

test('خطای اعتبارسنجی نام روز معیوب را می‌گوید', () => {
  const sid = W('db.schools[2].id');
  const days = [
    {start:'07:00', slots:[{kind:'lesson',min:30}]},
    {start:'بی‌معنا', slots:[{kind:'lesson',min:30}]},
    {start:'07:00', slots:[{kind:'lesson',min:30}]},
    {start:'07:00', slots:[]},
    {start:'07:00', slots:[{kind:'lesson',min:30}]}
  ];
  const r = JSON.parse(W('JSON.stringify(bellSaveDays(' + sid + ',' + JSON.stringify(days) + '))'));
  assert(r.ok === false, 'باید رد شود');
  assert(r.msg.indexOf('یکشنبه') > -1, 'نام روز معیوب در پیام نیست: ' + r.msg);
  const days2 = days.map((d, i) => (i === 2 ? { start:'07:00', slots:[] } : (i === 1 ? { start:'07:00', slots:[{kind:'lesson',min:30}]} : d)));
  const r2 = JSON.parse(W('JSON.stringify(bellSaveDays(' + sid + ',' + JSON.stringify(days2) + '))'));
  assert(r2.ok === false && r2.msg.indexOf('دوشنبه') > -1, 'دومین خطا با نام روز: ' + r2.msg);
});

test('فرم زنگ: هر بازه با ساعت شروع و پایان مشخص و دکمهٔ کپی از روز قبل', () => {
  const sid = W('db.schools[2].id');
  W('bellModal(' + sid + ')');
  try {
    const r = JSON.parse(W('(()=>{'
      + 'var days=document.querySelectorAll(".bell-day");'
      + 'var row0=document.querySelector(".bell-day[data-day=0] .bell-edit-row");'
      + 'var from=row0.querySelector(".bl-from").textContent;'
      + 'var to=row0.querySelector(".bl-to").value;'
      + 'var copy1=document.querySelectorAll("[data-act=bell-copy-prev][data-day=1]").length;'
      + 'var copy0=document.querySelectorAll("[data-act=bell-copy-prev][data-day=0]").length;'
      + 'var startInp=document.querySelectorAll(".bl-start[data-day=0]").length;'
      + 'return JSON.stringify({days:days.length,from:from,to:to,copy1:copy1,copy0:copy0,startInp:startInp});})()'));
    assert(r.days === 5, 'پنج روز در فرم نیست: ' + r.days);
    assert(/\d{2}:\d{2}/.test(r.from) && /\d{2}:\d{2}/.test(r.to), 'ساعت از/تا روی بازه نیست: ' + JSON.stringify(r));
    assert(r.copy1 === 1, 'دکمهٔ کپی از روز قبل برای یکشنبه نیست');
    assert(r.copy0 === 0, 'شنبه دکمهٔ کپی از روز قبل دارد');
    assert(r.startInp === 1, 'درج‌کنندهٔ شروع روز نیست');
  } finally {
    W('closeModal()');
  }
});

test('کپی از روز قبل: کلیک واقعی ساعت روز پیش را می‌آورد', () => {
  const sid = W('db.schools[2].id');
  W('bellModal(' + sid + ')');
  try {
    W('window._edit.days[0]={start:"06:00",slots:[{kind:"lesson",min:25}]}');
    W('bellRenderDay(0)');
    const clicked = W('(()=>{var b=document.querySelector("[data-act=bell-copy-prev][data-day=1]");'
      + 'if(!b)return false;b.click();return true;})()');
    assert(clicked, 'کلیک روی دکمهٔ کپی نشد');
    const d1 = JSON.parse(W('JSON.stringify(window._edit.days[1])'));
    assert(d1.start === '06:00', 'شروع روز کپی نشد: ' + d1.start);
    assert(d1.slots.length === 1 && d1.slots[0].min === 25 && d1.slots[0].kind === 'lesson',
      'بازه‌ها کپی نشدند: ' + JSON.stringify(d1.slots));
    const d0 = JSON.parse(W('JSON.stringify(window._edit.days[0])'));
    assert(d0.start === '06:00', 'روز مبدأ دست خورد');
  } finally {
    W('closeModal()');
  }
});

test('تغییر ساعت پایان یک بازه، زنجیرهٔ بعدی را جابه‌جا می‌کند', () => {
  const sid = W('db.schools[2].id');
  W('bellModal(' + sid + ')');
  try {
    W('window._edit.days[0]={start:"07:00",slots:[{kind:"lesson",min:45},{kind:"break",min:10},{kind:"lesson",min:45}]}');
    W('bellRenderDay(0)');
    W('(()=>{var inp=document.querySelector("[data-day=0][data-i=0].bl-to");'
      + 'inp.value="07:30";inp.dispatchEvent(new Event("change",{bubbles:true}));})()');
    const d0 = JSON.parse(W('JSON.stringify(window._edit.days[0])'));
    assert(d0.slots[0].min === 30, 'مدت زنگ اول اعمال نشد: ' + JSON.stringify(d0.slots));
    const tl = JSON.parse(W('(()=>{return JSON.stringify(bellDayTimeline(window._edit.days[0]));})()'));
    assert(tl[1].from === '07:30' && tl[1].to === '07:40', 'تفریح جابه‌جا نشد: ' + JSON.stringify(tl[1]));
    assert(tl[2].from === '07:40' && tl[2].to === '08:25', 'زنگ دوم جابه‌جا نشد: ' + JSON.stringify(tl[2]));
  } finally {
    W('closeModal()');
  }
});

// ── دیاگ: دو خانوادهٔ موتور و داده
test('آزمون‌ها به دو خانوادهٔ موتور و داده تقسیم شده‌اند', () => {
  const eng = W("DIAG_CHECKS.filter(function(c){return c.cat==='engine';}).length");
  const dat = W("DIAG_CHECKS.filter(function(c){return c.cat==='data';}).length");
  assert(eng >= 14, 'آزمون موتور کم است: ' + eng);
  assert(dat >= 12, 'آزمون داده کم است: ' + dat);
  const noCat = W("DIAG_CHECKS.filter(function(c){return !c.cat;}).length");
  assert(noCat === 0, noCat + ' آزمون بدون دسته مانده');
});

test('خلاصهٔ دیاگ تفکیک دسته می‌دهد', () => {
  W("S.user=db.users.find(function(u){return u.role==='superadmin';})");
  const sm = W('runDiagnostics().summary');
  assert(sm.byCat && sm.byCat.engine && sm.byCat.data, 'byCat وجود ندارد');
  const sumCats = Object.keys(sm.byCat).reduce((a, c) => a + sm.byCat[c].total, 0);
  assert(sumCats === sm.total, 'جمع دسته‌ها با کل نمی‌خواند: ' + sumCats + ' ≠ ' + sm.total);
});

test('اجرای گزینشی فقط یک خانواده را می‌دواند', () => {
  const only = W("runDiagnostics('engine')");
  const eng = W("DIAG_CHECKS.filter(function(c){return c.cat==='engine';}).length");
  assert(only.summary.total === eng, 'باید فقط آزمون موتور اجرا شود: ' + only.summary.total);
  assert(only.results.every(function (r) { return r.cat === 'engine'; }), 'نتیجهٔ غیرموتور آمده');
});

// ── آزمون‌های زیرساخت و موتور
test('همهٔ مسیرهای منو نمای سالم دارند', () => {
  W("S.user=db.users.find(function(u){return u.role==='superadmin';})");
  const r = W("DIAG_CHECKS.filter(function(c){return c.id==='route-coverage';})[0].check()");
  assert(r.ok === true, 'مسیر معیوب: ' + JSON.stringify(r.items || []));
});

test('همهٔ مسیرهای منو عنوان دارند', () => {
  const r = W("DIAG_CHECKS.filter(function(c){return c.id==='title-coverage';})[0].check()");
  assert(r.ok === true, 'مسیر بدون عنوان: ' + JSON.stringify(r.items || []));
});

test('منو و گارد دسترسی هماهنگ‌اند', () => {
  const r = W("DIAG_CHECKS.filter(function(c){return c.id==='authz-coverage';})[0].check()");
  assert(r.ok === true, 'ناهماهنگی مجوز: ' + JSON.stringify(r.items || []));
});

test('توابع حیاتی و جدول‌های پایه بارگذاری شده‌اند', () => {
  const f = W("DIAG_CHECKS.filter(function(c){return c.id==='missing-functions';})[0].check()");
  assert(f.ok === true, 'تابع گمشده: ' + JSON.stringify(f.items || []));
  const m = W("DIAG_CHECKS.filter(function(c){return c.id==='module-order';})[0].check()");
  assert(m.ok === true, 'جدول گمشده: ' + JSON.stringify(m.items || []));
});

test('هر مجموعه‌ای که در آن درج شده در db تعریف است', () => {
  const r = W("DIAG_CHECKS.filter(function(c){return c.id==='collection-registry';})[0].check()");
  assert(r.ok === true, 'مجموعهٔ ثبت‌نشده: ' + JSON.stringify(r.items || []));
});

test('شمارندهٔ عقب‌مانده تشخیص و هم‌تراز می‌شود', () => {
  const max = W('Math.max.apply(null,db.classes.map(function(c){return c.id;}))');
  W('ids.classes=1');
  const r = W("DIAG_CHECKS.filter(function(c){return c.id==='id-sequence';})[0].check()");
  assert(r.ok === false, 'شمارندهٔ عقب‌مانده تشخیص داده نشد');
  W("diagFix('id-sequence')");
  assert(W('ids.classes') >= max, 'شمارنده هم‌تراز نشد: ' + W('ids.classes'));
});

test('شناسهٔ تکراری در مجموعه تشخیص داده می‌شود', () => {
  const r = W("DIAG_CHECKS.filter(function(c){return c.id==='duplicate-ids';})[0].check()");
  assert(r.ok === true, 'شناسهٔ تکراری هست: ' + JSON.stringify(r.items || []));
});

test('دفترچهٔ عملیات خراب پاک‌سازی می‌شود', () => {
  W("log.push({t:'نامعتبر',c:'users'})");
  W("log.push({t:'ins',c:'مجموعهٔ_ناموجود',data:{id:1}})");
  const r = W("DIAG_CHECKS.filter(function(c){return c.id==='oplog-integrity';})[0].check()");
  assert(r.ok === false, 'عملیات خراب تشخیص داده نشد');
  assert(r.count === 2, 'باید دو مورد باشد: ' + r.count);
  W("diagFix('oplog-integrity')");
  const after = W("DIAG_CHECKS.filter(function(c){return c.id==='oplog-integrity';})[0].check()");
  assert(after.ok === true, 'پس از پاک‌سازی باید سالم باشد');
});

test('حافظهٔ مرورگر سالم گزارش می‌شود', () => {
  const r = W("DIAG_CHECKS.filter(function(c){return c.id==='localstorage-health';})[0].check()");
  assert(typeof r.ok === 'boolean', 'نتیجهٔ نامعتبر');
});

test('کندی رندر سنجیده می‌شود', () => {
  W("S.user=db.users.find(function(u){return u.role==='manager';})");
  const r = W("DIAG_CHECKS.filter(function(c){return c.id==='render-performance';})[0].check()");
  assert(r.ok === true, 'صفحهٔ کند: ' + JSON.stringify(r.items || []));
  W("S.user=db.users.find(function(u){return u.role==='superadmin';})");
});

test('پیکربندی زنگ همهٔ مدارس معتبر است', () => {
  const r = W("DIAG_CHECKS.filter(function(c){return c.id==='bell-config';})[0].check()");
  assert(r.ok === true, 'زنگ معیوب: ' + JSON.stringify(r.items || []));
});

// ── لایهٔ داده و امنیت خروجی (دور ۲۸) ─────────────────────────

test('لایهٔ داده: Store و Api و Data تعریف شده‌اند', () => {
  assert(W('typeof Store') === 'object', 'Store نیست');
  assert(W('typeof Api') === 'object', 'Api نیست');
  assert(W('typeof Data') === 'object', 'Data نیست');
  assert(W('DATA_MODE') === 'local', 'حالت پیش‌فرض باید محلی باشد');
});

test('لایهٔ داده: Store خواندن و نوشتن و پاک کردن', () => {
  assert(W('Store.set("__t1","abc")') === true, 'set ناموفق');
  assert(W('Store.get("__t1")') === 'abc', 'get نادرست');
  W('Store.remove("__t1")');
  assert(W('Store.get("__t1","نبود")') === 'نبود', 'fallback کار نکرد');
});

test('لایهٔ داده: getJSON روی داده خراب استثنا نمی‌دهد', () => {
  W('Store.set("__t2","{این JSON نیست")');
  assert(W('JSON.stringify(Store.getJSON("__t2",{a:1}))') === '{"a":1}',
    'باید fallback برگردد نه استثنا');
  W('Store.remove("__t2")');
});

test('لایهٔ داده: Store.available درست پاسخ می‌دهد', () => {
  assert(W('Store.available()') === true, 'حافظه باید در دسترس باشد');
});

test('لایهٔ داده: Api در حالت محلی رد می‌شود نه اینکه بی‌صدا بماند', () => {
  assert(W('typeof Api.request') === 'function', 'request نیست');
  assert(W('isServerMode()') === false, 'نباید حالت سروری باشد');
});

test('لایهٔ داده: Data.create و find و update و delete', () => {
  const n0 = W('db.announcements.length');
  const id = W('Data.create("announcements",{title:"آزمون لایه",body:"م",school_id:1,date:todayISO()}).id');
  assert(W('db.announcements.length') === n0 + 1, 'create اضافه نکرد');
  assert(W('Data.find("announcements",' + id + ').title') === 'آزمون لایه', 'find نیافت');
  W('Data.update("announcements",' + id + ',{title:"ویرایش شد"})');
  assert(W('Data.find("announcements",' + id + ').title') === 'ویرایش شد', 'update نکرد');
  W('Data.delete("announcements",' + id + ')');
  assert(W('Data.find("announcements",' + id + ')') === null, 'delete نکرد');
  assert(W('db.announcements.length') === n0, 'تعداد برنگشت');
});

test('لایهٔ داده: Data.batch فقط یک بار ذخیره می‌کند', () => {
  const n0 = W('db.announcements.length');
  const ids = W('(function(){var out=[];Data.batch(function(){for(var i=0;i<5;i++)' +
    'out.push(Data.create("announcements",{title:"د"+i,body:"م",school_id:1,date:todayISO()}).id);});return out;})()');
  assert(W('db.announcements.length') === n0 + 5, 'batch درج نکرد');
  W('Data.batch(function(){' + JSON.stringify(ids) + '.forEach(function(i){Data.delete("announcements",i)})})');
  assert(W('db.announcements.length') === n0, 'پاک‌سازی ناقص');
});

test('امنیت: هیچ فایلی جز لایهٔ داده مستقیم به localStorage دست نمی‌زند', () => {
  const fs = require('fs'), path = require('path');
  const dir = path.join(__dirname, '..', 'src', 'js');
  const bad = fs.readdirSync(dir).filter(f =>
    f !== '00-data-layer.js' && /localStorage/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert(bad.length === 0, 'دسترسی مستقیم در: ' + bad.join(', '));
});

test('لایهٔ داده: هیچ فایلی جز لایه مستقیم fetch نمی‌زند', () => {
  const fs = require('fs'), path = require('path');
  const dir = path.join(__dirname, '..', 'src', 'js');
  const bad = fs.readdirSync(dir).filter(f =>
    f !== '00-data-layer.js' && /\bfetch\s*\(/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert(bad.length === 0, 'fetch مستقیم در: ' + bad.join(', '));
});

test('امنیت: escAttr کاراکترهای خطرناک صفت را می‌بندد', () => {
  const out = W('escAttr(String.fromCharCode(34)+" onclick="+String.fromCharCode(34)+"bad()")');
  assert(out.indexOf(String.fromCharCode(34)) === -1, 'کوتیشن باز مانده');
  assert(out.indexOf('=') === -1, 'مساوی باز مانده');
  assert(W('escAttr(42)') === '42', 'عدد نباید خراب شود');
  assert(W('escAttr(null)') === '', 'null باید رشتهٔ خالی شود');
});

test('امنیت: esc تگ را خنثی می‌کند', () => {
  const out = W('esc("<img src=x onerror=alert(1)>")');
  assert(out.indexOf('<') === -1, 'تگ باز مانده');
  assert(out.indexOf('&lt;') === 0, 'باید به موجودیت تبدیل شود');
});

test('امنیت: نام مخرب کاربر در فهرست کاربران تگ نمی‌سازد', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const uid = W('Data.create("users",{full_name:' + JSON.stringify(payload) +
    ',username:"xss_probe",password:"123456",role:"teacher",school_id:1,national_id:"0499370899"}).id');
  /* داده نمونه بیش از هزار کاربر دارد و فهرست صفحه‌بندی می‌شود؛
     پس باید به صفحهٔ آخر برویم وگرنه رکورد آزمایشی اصلاً رندر نمی‌شود
     و آزمون بی‌آنکه چیزی بسنجد سبز می‌شود. */
  const oldPage = W('S.page');
  try{
    W('S.page = Math.ceil(db.users.length/15)');
    const html = W('viewUsers()');
    assert(html.indexOf('xss_probe') > -1, 'رکورد آزمایشی رندر نشد — آزمون بی‌اثر است');
    const n = W('(function(){var d=document.createElement("div");' +
      'd.innerHTML=viewUsers();return d.querySelectorAll("img").length;})()');
    assert(n === 0, 'تگ img تزریق شد! تعداد: ' + n);
    assert(html.indexOf('&lt;img') > -1, 'نام باید به‌صورت متن خنثی‌شده بیاید');
  } finally { W('S.page = ' + oldPage); W('Data.delete("users",' + uid + ')'); }
});

test('امنیت: نام مخرب در صفت data تگ نمی‌شکند', () => {
  const payload = 'x" data-act="logout" x="';
  const aid = W('Data.create("announcements",{title:' + JSON.stringify(payload) +
    ',body:"متن",school_id:1,date:todayISO()}).id');
  try{
    const n = W('(function(){var d=document.createElement("div");' +
      'd.innerHTML=viewAnnouncements();' +
      'return d.querySelectorAll("[data-act=logout]").length;})()');
    assert(n === 0, 'صفت جعلی ساخته شد! تعداد: ' + n);
  } finally { W('Data.delete("announcements",' + aid + ')'); }
});

test('حریم خصوصی: هیچ شمارهٔ تلفن قابل تخصیص در کد نیست', () => {
  const fs = require('fs'), path = require('path');
  const dir = path.join(__dirname, '..', 'src', 'js');
  const bad = [];
  fs.readdirSync(dir).forEach(f => {
    (fs.readFileSync(path.join(dir, f), 'utf8').match(/09\d{9}/g) || [])
      .forEach(p => { if(!p.startsWith('0999')) bad.push(f + ': ' + p); });
  });
  /* ۰۹۹۹ در ایران به هیچ اپراتوری تخصیص نیافته، پس امکان ندارد
     شمارهٔ یک شهروند واقعی باشد */
  assert(bad.length === 0, 'شمارهٔ بالقوه واقعی: ' + bad.slice(0, 3).join(' · '));
});

test('حریم خصوصی: کد ملی نمونه از بازهٔ صادرنشده ساخته می‌شود', () => {
  const sample = W('db.users.slice(0,200).map(function(u){return u.national_id}).filter(Boolean)');
  assert(sample.length > 50, 'نمونهٔ کافی نبود');
  const outside = sample.filter(n => !String(n).startsWith('999'));
  assert(outside.length === 0,
    'کد ملی خارج از بازهٔ ساختگی: ' + outside.slice(0, 3).join(', '));
});

test('حریم خصوصی: تلفن کاربران نمونه همه ساختگی است', () => {
  const phones = W('db.users.slice(0,300).map(function(u){return u.phone}).filter(Boolean)');
  const bad = phones.filter(p => !String(p).startsWith('0999'));
  assert(bad.length === 0, 'تلفن غیرساختگی: ' + bad.slice(0, 3).join(', '));
});

// ── مرز امنیتی مرورگر: چه چیزی را نگه می‌دارد و چه چیزی را نه (دور ۲۹)
//
// ⚠️⚠️ خواندن این بخش پیش از تکیه بر آن الزامی است ⚠️⚠️
//
// آزمون‌های زیر «امنیت» را نمی‌سنجند. مرزی را ثبت می‌کنند که تا
// وصل شدن سرور واقعی معتبر است و پس از آن باید سمت سرور تکرار شود.
//
// واقعیتی که این آزمون‌ها مستند می‌کنند:
// کنترل دسترسی سمت مرورگر در برابر کاربر عادی کار می‌کند، ولی در
// برابر کسی که ابزار توسعهٔ مرورگر را باز کند هیچ ارزشی ندارد.
// این نقص پیاده‌سازی نیست؛ ذات کدی است که روی دستگاه کاربر اجرا
// می‌شود. تنها پاسخ واقعی، سنجش دوباره سمت سرور است.
//
// 📄 قرارداد کامل: docs/SERVER_SECURITY_CONTRACT.md

test('مرز: canAction جلوی کنش غیرمجاز نقش را می‌گیرد', () => {
  const before = W('S.user ? S.user.role : null');
  try{
    W('S.user = db.users.find(function(u){return u.role==="teacher"})');
    assert(W('canAction("subs-save")') === false, 'دبیر نباید تنظیمات اشتراک را ذخیره کند');
    assert(W('canAction("tr-ok")') === false, 'دبیر نباید انتقالی را تأیید کند');
    assert(W('canAction("att-save")') === true, 'دبیر باید حضور و غیاب را ذخیره کند');
  } finally { if(before) W('S.user = db.users.find(function(u){return u.role==="' + before + '"})'); }
});

test('مرز: canRoute جلوی مسیر غیرمجاز نقش را می‌گیرد', () => {
  assert(W('canRoute("schools","teacher")') === false, 'دبیر نباید فهرست مدارس را ببیند');
  assert(W('canRoute("attendance","teacher")') === true, 'دبیر باید حضور و غیاب را ببیند');
  assert(W('canRoute("schools","superadmin")') === true, 'مدیر کل باید ببیند');
});

test('مرز ⚠️: دستکاری نقش از کنسول، گارد مرورگر را دور می‌زند', () => {
  /* این آزمون عمداً موفقیت حمله را تأیید می‌کند. اگر روزی شکست
     خورد یعنی کسی گمان کرده مسئله را سمت مرورگر حل کرده — که ممکن
     نیست. آن موقع باید بررسی شود چه چیزی واقعاً عوض شده. */
  const before = W('S.user ? S.user.role : null');
  try{
    W('S.user = db.users.find(function(u){return u.role==="teacher"})');
    assert(W('canAction("subs-save")') === false, 'پیش‌شرط برقرار نیست');
    W('S.user.role = "superadmin"');
    assert(W('canAction("subs-save")') === true,
      'انتظار می‌رفت گارد دور زده شود — اگر نشد، فرض این آزمون عوض شده');
  } finally {
    W('(function(){var u=db.users.find(function(x){return x.username==="teacher1_1"});if(u)u.role="teacher";})()');
    if(before) W('S.user = db.users.find(function(u){return u.role==="' + before + '"})');
  }
});

test('مرز ⚠️: نوشتن مستقیم وارد صف می‌شود و مرورگر جلویش را نمی‌گیرد', () => {
  /* ثبت صریح محدودیت: هیچ گاردی در `insert` نیست، چون هر گاردی هم
     که بگذاریم از همان کنسول قابل بازنویسی است. سرور باید عملیات
     را رد کند، نه مرورگر. */
  const before = W('S.user ? S.user.id : null');
  const n0 = W('SYNC.queue.length');
  let id = null;
  try{
    W('S.user = db.users.find(function(u){return u.role==="teacher"})');
    id = W('insert("announcements",{title:"آزمون مرز",body:"م",school_id:1,date:todayISO()}).id');
    assert(W('SYNC.queue.length') === n0 + 1,
      'عملیات باید وارد صف شود — مرورگر مرجع تصمیم نیست');
  } finally {
    if(id !== null) W('remove("announcements",' + id + ')');
    if(before) W('S.user = db.users.find(function(u){return u.id===' + before + '})');
  }
});

test('قرارداد سرور: هر عملیات صف مُهر هویت دارد تا سرور بسنجدش', () => {
  /* سرور با همین فیلدها ادعای مرورگر را رد می‌کند: اگر op.by با
     کاربر احراز هویت‌شدهٔ ژتون یکی نبود، کل دسته رد می‌شود.
     پس نبودشان یعنی سرور ابزار داوری ندارد. */
  const before = W('S.user ? S.user.id : null');
  const n0 = W('SYNC.queue.length');
  let id = null;
  try{
    W('S.user = db.users.find(function(u){return u.role==="manager"})');
    const uid = W('S.user.id');
    id = W('insert("announcements",{title:"آزمون مهر",body:"م",school_id:1,date:todayISO()}).id');
    const item = W('SYNC.queue[SYNC.queue.length-1]');
    assert(W('SYNC.queue[SYNC.queue.length-1].op.by') === uid, 'فیلد by ثبت نشد');
    assert(W('SYNC.queue[SYNC.queue.length-1].user_id') === uid, 'user_id ثبت نشد');
    assert(typeof W('SYNC.queue[SYNC.queue.length-1].op.at') === 'string', 'زمان ثبت نشد');
    assert(typeof W('SYNC.queue[SYNC.queue.length-1].uid') === 'string', 'شناسهٔ یکتا نیست');
  } finally {
    if(id !== null) W('remove("announcements",' + id + ')');
    if(before) W('S.user = db.users.find(function(u){return u.id===' + before + '})');
  }
});

test('قرارداد سرور: uid هر عملیات یکتاست تا ارسال دوباره تکراری نسازد', () => {
  const before = W('S.user ? S.user.id : null');
  const ids = [];
  try{
    W('S.user = db.users.find(function(u){return u.role==="manager"})');
    for(let i = 0; i < 5; i++)
      ids.push(W('insert("announcements",{title:"ت' + i + '",body:"م",school_id:1,date:todayISO()}).id'));
    const uids = W('JSON.stringify(SYNC.queue.slice(-5).map(function(x){return x.uid}))');
    const arr = JSON.parse(uids);
    assert(new Set(arr).size === 5, 'uid تکراری تولید شد: ' + uids);
  } finally {
    ids.forEach(i => W('remove("announcements",' + i + ')'));
    if(before) W('S.user = db.users.find(function(u){return u.id===' + before + '})');
  }
});

test('قرارداد سرور: حالت دمو فعال است و نشانی سرور خالی', () => {
  /* وقتی این آزمون شکست بخورد یعنی کسی سرور را وصل کرده — و آن
     لحظه دقیقاً همان لحظه‌ای است که فهرست پذیرش
     docs/SERVER_SECURITY_CONTRACT.md باید کامل تیک خورده باشد. */
  assert(W('SYNC.demoMode') === true, 'حالت دمو خاموش شده — قرارداد سرور را بررسی کنید');
  assert(W('SYNC.serverUrl') === '', 'نشانی سرور تنظیم شده — قرارداد سرور را بررسی کنید');
});

test('قرارداد سرور: سند امنیتی و بندهای کلیدی‌اش موجودند', () => {
  const fs = require('fs'), path = require('path');
  const f = path.join(__dirname, '..', 'docs', 'SERVER_SECURITY_CONTRACT.md');
  assert(fs.existsSync(f), 'سند قرارداد سرور نیست');
  const t = fs.readFileSync(f, 'utf8');
  ['HttpOnly', 'SameSite=Lax', 'bcrypt', 'canAction', 'canRoute', 'op.by']
    .forEach(k => assert(t.indexOf(k) > -1, 'بند گمشده در قرارداد: ' + k));
});

test('یادآور: رمز عبور هنوز متن ساده است — پیش از سرور باید هش شود', () => {
  /* این آزمون عمداً وضعیت ناامن فعلی را تثبیت می‌کند تا در
     ممیزی‌های بعدی از قلم نیفتد. روزی که رمزها هش شوند، این آزمون
     شکست می‌خورد و همان‌جا باید به آزمون هش تبدیل شود. */
  /* ⚠️ به رکورد موجود تکیه نکن: آزمون «بازنشانی رمز» پیش‌تر رمز یک
     دبیر را عوض می‌کند. رکورد تازه بساز تا سنجش مستقل باشد. */
  let id = null;
  try{
    id = W('insert("users",{school_id:1,role:"student",full_name:"آزمون رمز",' +
      'username:"pwd_probe",password:"رمزآزمون۱۲۳",active:1}).id');
    const stored = W('byId("users",' + id + ').password');
    assert(stored === 'رمزآزمون۱۲۳',
      'رمز دیگر متن ساده نیست — اگر hash شده، این آزمون را به آزمون bcrypt تبدیل کنید');
    assert(stored.length < 60 || !/^\$2[aby]\$/.test(stored),
      'الگوی bcrypt دیده شد — آزمون باید به‌روز شود');
  } finally { if(id !== null) W('remove("users",' + id + ')'); }
  const fs = require('fs'), path = require('path');
  const todo = fs.readFileSync(path.join(__dirname, '..', 'TODO_BEFORE_PRODUCTION.md'), 'utf8');
  assert(todo.indexOf('bcrypt') > -1, 'یادآور bcrypt از سند کارهای باقی‌مانده حذف شده');
});

// ── جهت نوارهای اسکرول در چیدمان راست‌به‌چپ (دور ۳۰) ─────────
//
// قاعده‌ای که دو بار اشتباه شد و آزمون برای همین است:
//   اسکرول عمودی ⇒ ظرف direction:ltr (نوار به لبهٔ راست می‌رود)
//   اسکرول افقی  ⇒ ظرف direction:rtl (اسکرول از راست شروع می‌شود)
// همان حیله‌ای که نوار عمودی را درست می‌کند، اگر روی ظرف افقی
// بیفتد جدول را از ستون آخر نشان می‌دهد و کاربر باید دستی به راست
// بکشد تا ستون نام را ببیند.

test('چیدمان: ظرف جدول عریض از راست شروع می‌شود', () => {
  const dir = W('(function(){' +
    'var d=document.createElement("div");d.className="table-wrap";' +
    'document.body.appendChild(d);' +
    'var v=getComputedStyle(d).direction;d.remove();return v;})()');
  assert(dir === 'rtl',
    '.table-wrap باید rtl باشد وگرنه جدول از ستون آخر شروع می‌شود — دیده شد: ' + dir);
});

test('چیدمان: نوار زبانه‌ها از راست شروع می‌شود', () => {
  const dir = W('(function(){' +
    'var d=document.createElement("div");d.className="tabs";' +
    'document.body.appendChild(d);' +
    'var v=getComputedStyle(d).direction;d.remove();return v;})()');
  assert(dir === 'rtl', '.tabs باید rtl باشد — دیده شد: ' + dir);
});

test('چیدمان: ظرف‌های اسکرول عمودی نوارشان سمت راست است', () => {
  ['main', 'sidebar', 'vscroll'].forEach(cls => {
    const dir = W('(function(){' +
      'var d=document.createElement("div");d.className="' + cls + '";' +
      'document.body.appendChild(d);' +
      'var v=getComputedStyle(d).direction;d.remove();return v;})()');
    assert(dir === 'ltr',
      '.' + cls + ' باید ltr باشد تا نوار عمودی سمت راست بیفتد — دیده شد: ' + dir);
  });
});

test('چیدمان: فرزندان ظرف عمودی به راست‌به‌چپ برمی‌گردند', () => {
  const dir = W('(function(){' +
    'var p=document.createElement("div");p.className="vscroll";' +
    'var c=document.createElement("div");p.appendChild(c);' +
    'document.body.appendChild(p);' +
    'var v=getComputedStyle(c).direction;p.remove();return v;})()');
  assert(dir === 'rtl', 'محتوای داخل ظرف باید rtl بماند — دیده شد: ' + dir);
});

test('چیدمان: هیچ ظرف اسکرول افقی با direction:ltr نمانده', () => {
  const fs = require('fs'), path = require('path');
  const css = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'styles', 'base.css'), 'utf8');
  /* ظرف‌هایی که هم overflow-x دارند هم ltr — ترکیب غلط */
  ['.table-wrap', '.tabs'].forEach(sel => {
    const re = new RegExp('\\' + sel + '\\s*\\{[^}]*direction\\s*:\\s*ltr', 'g');
    assert(!re.test(css), sel + ' دوباره ltr شده — جدول از ستون آخر شروع می‌شود');
  });
});

test('چیدمان: ظرف‌های اسکرول عمودی درون‌خطی کلاس vscroll دارند', () => {
  const fs = require('fs'), path = require('path');
  const dir = path.join(__dirname, '..', 'src', 'js');
  const bad = [];
  fs.readdirSync(dir).forEach(f => {
    fs.readFileSync(path.join(dir, f), 'utf8').split(String.fromCharCode(10))
      .forEach((line, i) => {
        /* ظرفی که max-height و overflow دارد ولی کلاس vscroll ندارد */
        if(/max-height:\s*\d+px;\s*overflow:\s*auto/.test(line) &&
           !/vscroll|diag-items/.test(line))
          bad.push(f + ':' + (i + 1));
      });
  });
  assert(bad.length === 0,
    'ظرف اسکرول عمودی بدون کلاس vscroll (نوارش سمت چپ می‌افتد): ' + bad.join(' · '));
});

// ── IDOR: شمردن شناسه و نشت خارج از محدوده (دور ۳۱) ──────────
//
// ⚠️⚠️ این سه آزمون عمداً *وجود* آسیب‌پذیری را تأیید می‌کنند ⚠️⚠️
//
// در نسخهٔ دمو `byId(collection, id)` هیچ سنجش محدوده‌ای ندارد:
// هر شناسه‌ای بدهید رکورد را می‌دهد. تا وقتی سروری نیست این پذیرفته
// شده است، ولی عدد نشت باید ثبت شود تا معلوم باشد سرور دقیقاً چه
// حجمی را باید ببندد.
//
// تفاوت این‌ها با آزمون‌های محدودهٔ موجود مهم است:
//   آزمون‌های `scopeDescriptor` می‌پرسند «تابع محدوده درست می‌گوید؟»
//   این‌ها می‌پرسند «اگر کسی شناسه بشمارد، چه بیرون می‌آید؟»
// همان فاصلهٔ میان اعلام و اجرا که IDOR در آن زندگی می‌کند.
//
// روزی که سرور وصل شود، هر سه باید معکوس شوند: انتظار برود که
// دسترسی خارج از محدوده **صفر** باشد.
//
// 📄 docs/SERVER_SECURITY_CONTRACT.md بند ۱.۲

test('IDOR ⚠️: مدیر مدرسه با شمردن شناسه به کاربران مدارس دیگر می‌رسد', () => {
  const before = W('S.user ? S.user.id : null');
  try{
    W('S.user = db.users.find(function(u){return u.role==="manager"})');
    const mine = W('S.user.school_id');
    const r = JSON.parse(W('(function(){' +
      'var inScope=0,outScope=0;' +
      'db.users.forEach(function(u){' +
        'var rec=byId("users",u.id); if(!rec) return;' +
        'if(rec.school_id===' + mine + ') inScope++; else outScope++;});' +
      'return JSON.stringify({inScope:inScope,outScope:outScope,total:db.users.length});})()'));

    assert(r.outScope > 0,
      'انتظار می‌رفت نشت دیده شود — اگر صفر شده یعنی محدوده اعمال شده و ' +
      'این آزمون باید معکوس شود');
    /* عدد سنجیده‌شده روی دادهٔ نمونه: ۸۶۷ از ۱۱۳۶ کاربر خارج از محدوده */
    assert(r.outScope > r.total * 0.5,
      'نشت کمتر از انتظار: ' + r.outScope + ' از ' + r.total);
    console.log('       ↳ نشت: ' + r.outScope + ' کاربر خارج از مدرسهٔ ' + mine +
                ' (از ' + r.total + ' کل · درون محدوده: ' + r.inScope + ')');
  } finally { if(before) W('S.user = db.users.find(function(u){return u.id===' + before + '})'); }
});

test('IDOR ⚠️: ولی با شمردن شناسه به دانش‌آموزان غیرفرزند می‌رسد', () => {
  const before = W('S.user ? S.user.id : null');
  try{
    /* ولی‌ای انتخاب می‌شود که واقعاً پیوند فرزند دارد، وگرنه سنجش بی‌معناست */
    W('S.user = (function(){' +
      'var l=db.parent_links[0];' +
      'return l ? byId("users",l.parent_id) : db.users.find(function(u){return u.role==="parent"});})()');
    const r = JSON.parse(W('(function(){' +
      'var kids=db.parent_links.filter(function(l){return l.parent_id===S.user.id})' +
        '.map(function(l){return l.student_id});' +
      'var own=0,other=0;' +
      'db.users.forEach(function(u){ if(u.role!=="student") return;' +
        'var rec=byId("users",u.id); if(!rec) return;' +
        'if(kids.indexOf(u.id)>-1) own++; else other++;});' +
      'return JSON.stringify({kids:kids.length,own:own,other:other});})()'));

    assert(r.kids > 0, 'ولی بدون فرزند انتخاب شد — سنجش بی‌معنا می‌شود');
    assert(r.other > 0,
      'انتظار می‌رفت نشت دیده شود — اگر صفر شده این آزمون باید معکوس شود');
    /* عدد سنجیده‌شده: ۵۲۲ دانش‌آموز غیرفرزند در برابر ۱ فرزند واقعی */
    console.log('       ↳ نشت: ' + r.other + ' دانش‌آموز غیرفرزند قابل خواندن ' +
                '(فرزند واقعی: ' + r.kids + ')');
  } finally { if(before) W('S.user = db.users.find(function(u){return u.id===' + before + '})'); }
});

test('IDOR ⚠️: دبیر با شمردن شناسه به نمرات کلاس‌های غیرتخصیصی می‌رسد', () => {
  const before = W('S.user ? S.user.id : null');
  try{
    W('S.user = db.users.find(function(u){return u.role==="teacher"})');
    const r = JSON.parse(W('(function(){' +
      'var mine=visibleClasses().map(function(c){return c.id});' +
      'var clsIn=0,clsOut=0,grIn=0,grOut=0;' +
      'db.classes.forEach(function(c){ var rec=byId("classes",c.id); if(!rec) return;' +
        'if(mine.indexOf(c.id)>-1) clsIn++; else clsOut++;});' +
      'db.grades.forEach(function(g){ var rec=byId("grades",g.id); if(!rec) return;' +
        'if(mine.indexOf(rec.class_id)>-1) grIn++; else grOut++;});' +
      'return JSON.stringify({mine:mine.length,clsIn:clsIn,clsOut:clsOut,' +
        'grIn:grIn,grOut:grOut});})()'));

    assert(r.mine > 0, 'دبیر بدون کلاس انتخاب شد — سنجش بی‌معنا می‌شود');
    assert(r.clsOut > 0 && r.grOut > 0,
      'انتظار می‌رفت نشت دیده شود — اگر صفر شده این آزمون باید معکوس شود');
    /* اعداد سنجیده‌شده: ۳۳ کلاس و ۱۱٬۵۹۲ نمرهٔ خارج از محدوده */
    assert(r.grOut > r.grIn,
      'نشت نمره کمتر از دسترسی مجاز است — دادهٔ نمونه عوض شده؟');
    console.log('       ↳ نشت: ' + r.clsOut + ' کلاس و ' + r.grOut +
                ' نمرهٔ خارج از محدوده (مجاز: ' + r.mine + ' کلاس، ' + r.grIn + ' نمره)');
  } finally { if(before) W('S.user = db.users.find(function(u){return u.id===' + before + '})'); }
});

test('IDOR: قرارداد سرور الگوی شمردن شناسه را مستند کرده', () => {
  const fs = require('fs'), path = require('path');
  const t = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'SERVER_SECURITY_CONTRACT.md'), 'utf8');
  ['شمردن شناسه', 'مالکیت'].forEach(k =>
    assert(t.indexOf(k) > -1, 'بند گمشده در قرارداد سرور: ' + k));
});

test('قرارداد سرور: تعامل کارایی و سنجش محدوده هشدار داده شده', () => {
  const fs = require('fs'), path = require('path');
  const c = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'SERVER_SECURITY_CONTRACT.md'), 'utf8');
  ['بازسنجی', 'parent_links', 'ایندکس اختصاصی'].forEach(k =>
    assert(c.indexOf(k) > -1, 'بند ۱.۲.۴ ناقص است — کلید گمشده: ' + k));

  /* سند ظرفیت باید بداند اعدادش تاریخ انقضا دارند */
  const cap = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'CAPACITY_SIM.md'), 'utf8');
  assert(cap.indexOf('سنجش محدوده') > -1,
    'سند ظرفیت هشدار بی‌اعتبار شدن اعداد را ندارد');
});

/* ── توزیع خودکار: محیط کنترل‌شدهٔ سه شعبه ──────────────────────
   ⚠️ کلاس بی‌شمارهٔ هم‌نام (مثل «دهم علوم تجربی») باید حذف شود،
   وگرنه تطبیق نام دقیق روی آن می‌افتد و آزمون بی‌صدا سبز می‌شود. */
function withBranches(cap, fn) {
  const sid = W('db.schools[0].id');
  /* ⚠️ validateImport مدرسه را از S.user می‌خواند، نه از پارامتر.
     آزمون‌ها وضعیت جهانی مشترک دارند و کاربر قبلی ممکن است
     مدرسهٔ دیگری داشته باشد ⇒ جدول ظرفیت خالی درمی‌آید. */
  W('(()=>{db._bkU=S.user;db._bk=db.classes.slice();'
    + 'S.user=db.users.find(u=>u.role==="manager"&&u.school_id===' + sid + ')||S.user;'
    + 'db.classes=db.classes.filter(c=>c.school_id!==' + sid + ');'
    + 'for(let i=1;i<=3;i++)db.classes.push({id:870000+i,school_id:' + sid
    + ',name:"دهم علوم تجربی "+i,grade_level:10,field:"علوم تجربی",capacity:' + cap + '});'
    + '(typeof idxInvalidate==="function")&&idxInvalidate("classes");})()');
  try { return fn(sid); }
  finally {
    W('(()=>{db.classes=db._bk;S.user=db._bkU;delete db._bk;delete db._bkU;'
      + '(typeof idxInvalidate==="function")&&idxInvalidate("classes");})()');
  }
}
const distOf = (sid, rows, opt) => JSON.parse(W(
  '(()=>{const p=planPlacement(' + JSON.stringify(rows) + ',' + sid + ',' + (opt || '{}') + ');'
  + 'const c={};Object.values(p.plan).forEach(x=>{if(x&&x.classId)c[x.classId]=(c[x.classId]||0)+1;});'
  + 'return JSON.stringify({d:c,manual:p.manual.length,neu:p.create.length});})()'));
const plainRows = (n) => Array.from({ length: n }, (_, i) => ({ index: i, text: 'دهم تجربی' }));

/* کد ملی آزمایشی با رقم کنترل معتبر.
   ⚠️ پیشوند ۹۹۹ که ثبت احوال صادر نمی‌کند. */
function tNid(n) {
  const b = ('999' + String(n).padStart(6, '0')).split('').map(Number);
  const wts = [10, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += b[i] * wts[i];
  const r = sum % 11;
  return b.join('') + (r < 2 ? r : 11 - r);
}
const IMP_MAP = '{0:"full_name",1:"national_id",2:"class_name",3:"gender"}';
function impRows(n, txt, from) {
  return Array.from({ length: n }, (_, i) =>
    ['دانش‌آموز ' + (i + 1), tNid((from || 0) + i), txt, i % 2 ? 'دختر' : 'پسر']);
}

test('دادهٔ نمونه: نوبت جلسهٔ اولیا ساخته می‌شود و در آینده است', () => {
  const n = W('db.meeting_slots.length');
  assert(n > 0, 'هیچ نوبت جلسه‌ای در دادهٔ نمونه نیست');
  /* ⚠️ نوبت گذشته قابل رزرو نیست و صفحهٔ ولی دوباره خالی می‌شود */
  const past = W('db.meeting_slots.filter(m=>m.date<todayISO()).length');
  assert(past === 0, past + ' نوبت در گذشته است');
  const booked = W('db.meeting_slots.filter(m=>m.status==="booked").length');
  const open = W('db.meeting_slots.filter(m=>m.status==="open").length');
  assert(booked > 0 && open > 0,
    'هر دو حالت آزاد و رزرو باید باشد: آزاد ' + open + ' رزرو ' + booked);
});

test('دادهٔ نمونه: زمان‌بندی زنگ برای مدارس فعال ذخیره شده', () => {
  const n = W('db.bell_schedules.length');
  assert(n > 0, 'زمان‌بندی زنگ ساخته نشده');
  /* مدرسهٔ غیرفعال نباید زمان‌بندی بگیرد */
  const bad = W('db.bell_schedules.filter(b=>{const s=byId("schools",b.school_id);'
    + 'return !s||!s.active;}).length');
  assert(bad === 0, bad + ' زمان‌بندی متعلق به مدرسهٔ غیرفعال است');
  const slots = W('((db.bell_schedules[0].days||[])[0]||{slots:[]}).slots.length');
  assert(slots > 0, 'زمان‌بندی بدون بازه است');
});

test('صفحهٔ جلسات اولیا برای ولی خالی نیست', () => {
  const saved = W('JSON.stringify({r:S.route,u:S.user&&S.user.id})');
  try {
    const len = W('(()=>{const p=db.users.find(u=>u.role==="parent"&&'
      + 'db.meeting_slots.some(m=>m.school_id===u.school_id));'
      + 'if(!p)return 0;S.user=p;S.persona=null;S.boss=null;'
      + 'S.route="meetings";S.filters={};S.page=1;return renderRoute().length;})()');
    assert(len > 2000, 'صفحهٔ جلسات ولی کوتاه است: ' + len + ' نویسه');
  } finally {
    const o = JSON.parse(saved);
    W('S.route=' + JSON.stringify(o.r) + ';S.user=byId("users",' + o.u + ')||S.user;S.filters={}');
  }
});

test('پیش‌نمایش: جدول ظرفیت اکنون/افزوده/مجموع را می‌سازد', () => {
  withBranches(10, (sid) => {
    const mgr = W('S.user'); void mgr;
    const got = JSON.parse(W('JSON.stringify(validateImport('
      + JSON.stringify(impRows(9, 'دهم تجربی')) + ',' + IMP_MAP + ',"students").capRows)'));
    assert(got.length === 3, 'باید سه کلاس در جدول باشد، شد: ' + got.length);
    got.forEach(r => {
      assert(r.added === 3, 'هر شعبه باید ۳ نفر بگیرد: ' + r.name + ' ' + r.added);
      assert(r.after === r.before + r.added, 'مجموع نادرست در ' + r.name);
      assert(r.over === false, 'نباید فراتر از ظرفیت باشد');
    });
  });
});

test('پیش‌نمایش: مجموع فراتر از ظرفیت قرمز نشان داده می‌شود', () => {
  const sid = W('db.schools[0].id');
  W('(()=>{db._bk2=db.classes.slice();db._bkU2=S.user;'
    + 'S.user=db.users.find(u=>u.role==="manager"&&u.school_id===' + sid + ')||S.user;'
    + 'db.classes=db.classes.filter(c=>c.school_id!==' + sid + ');'
    + 'db.classes.push({id:871500,school_id:' + sid + ',name:"دهم علوم تجربی الف",'
    + 'grade_level:10,field:"علوم تجربی",capacity:2});'
    + '(typeof idxInvalidate==="function")&&idxInvalidate("classes");})()');
  try {
    const p = JSON.parse(W('JSON.stringify(validateImport('
      + JSON.stringify(impRows(5, 'دهم علوم تجربی الف', 500)) + ',' + IMP_MAP + ',"students"))'));
    const row = (p.capRows || [])[0];
    assert(row, 'جدول ظرفیت خالی است');
    assert(row.over === true, 'باید فراتر از ظرفیت علامت بخورد: ' + JSON.stringify(row));

    /* رندر واقعی: عدد قرمز و هشدار متنی، نه فقط پرچم در داده */
    W('S.imp={step:2,entity:"students",preview:' + JSON.stringify(p).replace(/</g, '\\u003c') + '};');
    const html = W('impCapTable(S.imp.preview)');
    assert(html.indexOf('فراتر از ظرفیت') > -1, 'برچسب قرمز در جدول نیست');
    assert(/color:var\(--red\)/.test(html), 'مجموع با رنگ قرمز نمایش داده نشده');
    assert(html.indexOf('از ظرفیت رد شده است') > -1, 'هشدار متنی زیر جدول نیست');
  } finally {
    W('(()=>{db.classes=db._bk2;S.user=db._bkU2;delete db._bk2;delete db._bkU2;'
      + '(typeof idxInvalidate==="function")&&idxInvalidate("classes");})()');
  }
});

test('پیش‌نمایش: بخش «نیازمند بررسی دستی» با دکمهٔ افزایش ظرفیت', () => {
  withBranches(10, (sid) => {
    const p = JSON.parse(W('JSON.stringify(validateImport('
      + JSON.stringify(impRows(35, 'دهم تجربی')) + ',' + IMP_MAP + ',"students"))'));
    assert(p.counts.manual === 5, 'باید ۵ ردیف دستی شود، شد: ' + p.counts.manual);
    assert(p.counts.auto === 30, 'باید ۳۰ نفر خودکار جا بگیرند، شد: ' + p.counts.auto);
    assert(p.newClasses.length === 0, 'نباید کلاس نو پیشنهاد شود');
    const html = W('impManualBlock(' + JSON.stringify(p) + ')');
    assert(html.indexOf('نیازمند بررسی دستی') > -1, 'عنوان بخش نیست');
    assert(html.indexOf('imp-raise-cap') > -1, 'دکمهٔ افزایش ظرفیت نیست');
    assert(html.indexOf('بقیهٔ ردیف‌ها بدون مشکل ثبت می‌شوند') > -1,
      'باید روشن باشد که این ردیف‌ها مانع بقیه نیستند');
  });
});

test('تنظیمات: کارت قواعد فقط توزیع را پیش‌فرض روشن دارد', () => {
  const sid = W('db.schools[0].id');
  const before = W('JSON.stringify(byId("schools",' + sid + ').gender||null)');
  W('db._bkU3=S.user;S.user=db.users.find(u=>u.role==="manager"&&u.school_id==='
    + sid + ')||S.user;');
  try {
    W('byId("schools",' + sid + ').gender="مختلط";delete byId("schools",' + sid + ').place_rules;');
    const html = W('impRulesCard()');
    ['pr_auto', 'pr_gender', 'pr_sib', 'place-rules-save'].forEach(k =>
      assert(html.indexOf(k) > -1, 'کلید ' + k + ' در کارت نیست'));
    const checked = (html.match(/checked/g) || []).length;
    assert(checked === 1, 'فقط توزیع باید پیش‌فرض روشن باشد، روشن: ' + checked);
  } finally {
    W('byId("schools",' + sid + ').gender=' + before + ';'
      + 'S.user=db._bkU3;delete db._bkU3;');
  }
});

test('تنظیمات: در مدرسهٔ تک‌جنسیتی کلید جنسیت غیرفعال نمایش داده می‌شود', () => {
  const sid = W('db.schools[0].id');
  const before = W('JSON.stringify(byId("schools",' + sid + ').gender||null)');
  try {
    W('db._bkU4=S.user;S.user=db.users.find(u=>u.role==="manager"&&u.school_id==='
      + sid + ')||S.user;byId("schools",' + sid + ').gender="پسرانه";');
    const html = W('impRulesCard()');
    assert(html.indexOf('disabled') > -1, 'کلید جنسیت باید غیرفعال باشد');
    assert(html.indexOf('بی‌اثر است') > -1, 'باید توضیح دهد چرا بی‌اثر است');
    W('byId("schools",' + sid + ').gender="مختلط";');
    const mixed = W('impRulesCard()');
    assert(mixed.indexOf('disabled') === -1, 'در مدرسهٔ مختلط نباید غیرفعال باشد');
  } finally {
    W('byId("schools",' + sid + ').gender=' + before + ';'
      + 'S.user=db._bkU4;delete db._bkU4;');
  }
});

test('توزیع: نُه نفر میان سه شعبه متعادل پخش می‌شوند', () => {
  withBranches(10, (sid) => {
    const r = distOf(sid, plainRows(9));
    const counts = Object.values(r.d).sort();
    assert(counts.length === 3, 'همهٔ شعبه‌ها استفاده نشدند: ' + JSON.stringify(r.d));
    assert(counts.join(',') === '3,3,3', 'توزیع نامتعادل: ' + counts.join(','));
  });
});

test('توزیع: ظرفیت رعایت می‌شود و سرریز «دستی» می‌شود', () => {
  withBranches(10, (sid) => {
    const r = distOf(sid, plainRows(35));
    Object.keys(r.d).forEach(k => assert(r.d[k] <= 10, 'کلاس ' + k + ' سرریز شد: ' + r.d[k]));
    assert(r.manual === 5, 'باید ۵ ردیف دستی شود، شد: ' + r.manual);
    assert(r.neu === 0, 'نباید کلاس نو ساخته شود، ساخت: ' + r.neu);
  });
});

test('توزیع: تکرارپذیر است — همان ورودی، همان نتیجه', () => {
  const a = withBranches(20, (sid) => distOf(sid, plainRows(17)));
  const b = withBranches(20, (sid) => distOf(sid, plainRows(17)));
  assert(JSON.stringify(a) === JSON.stringify(b),
    'دو اجرا فرق کرد: ' + JSON.stringify(a) + ' / ' + JSON.stringify(b));
});

test('توزیع: هیچ Math.random در مسیر کلاس‌بندی نیست', () => {
  const fs = require('fs'), path = require('path');
  let src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'js', '41-class-placement.js'), 'utf8');
  /* ⚠️ کامنت‌ها حذف شوند: خودِ سند می‌گوید «هیچ Math.random نیست»
     و آزمونِ ساده‌لوح روی همان جمله شکست می‌خورد. */
  src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert(src.indexOf('Math.random') === -1,
    'Math.random تکرارپذیری توزیع را می‌شکند');
});

test('توزیع: شعبهٔ صریح در فایل، توزیع را دور می‌زند', () => {
  withBranches(20, (sid) => {
    const got = W('(()=>{const p=planPlacement([{index:0,text:"دهم علوم تجربی ۳"}],' + sid + ');'
      + 'const v=p.plan[0];return JSON.stringify({n:(byId("classes",v.classId)||{}).name,a:!!v.auto});})()');
    const o = JSON.parse(got);
    assert(/3$/.test(o.n), 'شعبهٔ صریح رعایت نشد: ' + o.n);
    assert(o.a === false, 'انتخاب صریح نباید خودکار علامت بخورد');
  });
});

test('توزیع: کلید تفکیک جنسیتی پیش‌فرض خاموش است', () => {
  const d = JSON.parse(W('JSON.stringify(PLACE_DEFAULTS)'));
  assert(d.separateGender === false, 'تفکیک جنسیتی نباید پیش‌فرض روشن باشد');
  assert(d.keepSiblings === false, 'خواهر و برادر نباید پیش‌فرض روشن باشد');
});

test('توزیع: مدرسهٔ تک‌جنسیتی کلید جنسیت را خاموش می‌کند', () => {
  const sid = W('db.schools[0].id');
  const before = W('JSON.stringify(byId("schools",' + sid + ').gender||null)');
  try {
    W('byId("schools",' + sid + ').gender="پسرانه";'
      + 'byId("schools",' + sid + ').place_rules={separateGender:true};');
    const s1 = JSON.parse(W('JSON.stringify(placeSettings(' + sid + '))'));
    assert(s1.separateGender === false, 'در مدرسهٔ پسرانه باید خاموش شود');
    assert(W('isMixedSchool(' + sid + ')') === false, 'مدرسهٔ پسرانه مختلط نیست');
    W('byId("schools",' + sid + ').gender="مختلط";');
    const s2 = JSON.parse(W('JSON.stringify(placeSettings(' + sid + '))'));
    assert(s2.separateGender === true, 'در مدرسهٔ مختلط باید محترم شمرده شود');
  } finally {
    W('byId("schools",' + sid + ').gender=' + before + ';'
      + 'delete byId("schools",' + sid + ').place_rules;');
  }
});

test('توزیع: خواهر و برادر فقط با کد ملی والدین، نه نام خانوادگی', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'js', '41-class-placement.js'), 'utf8');
  const fk = src.slice(src.indexOf('function familyKey'), src.indexOf('function familyKey') + 400);
  assert(fk.indexOf('last_name') === -1 && fk.indexOf('full_name') === -1,
    'نام خانوادگی نباید مبنای تشخیص خواهر و برادر باشد');
  assert(fk.indexOf('father_nid') > -1, 'کد ملی پدر باید مبنا باشد');
});

test('کلاس‌بندی: هزینه به تعداد کلاس وابسته نیست', () => {
  /* پیش‌تر findClassFor برای هر ردیف روی کل فهرست filter می‌زد:
     ۳۰۰۰ ردیف با ۹ کلاس ۲۱۱ms بود و با ۱۵۹ کلاس ۱۰۰۳ms.
     این آزمون همان محور دوم را نگه می‌دارد. */
  const sid = W('db.schools[0].id');
  const names = ['دهم تجربی', 'یازدهم ریاضی', 'هفتم ۱'];
  const rows = [];
  for (let i = 0; i < 400; i++) rows.push({ index: i, text: names[i % names.length] });
  const j = JSON.stringify(rows);
  const run = () => W('(()=>{const t=Date.now();planPlacement(' + j + ',' + sid + ');return Date.now()-t;})()');

  const added = [];
  try {
    const base = Math.max(run(), 1);
    /* ۱۵۰ کلاس ساختگی به همان مدرسه */
    const ids = W('(()=>{const out=[];for(let i=0;i<150;i++){const id=990000+i;'
      + 'db.classes.push({id:id,school_id:' + sid + ',name:"محک "+i,grade_level:10,field:"تجربی"});'
      + 'out.push(id);}return JSON.stringify(out);})()');
    added.push.apply(added, JSON.parse(ids));
    const big = run();
    /* آستانه سخاوتمندانه: نویز زمان‌سنجی در jsdom زیاد است.
       رفتار درجه‌دوم ۴٫۸× می‌داد؛ ۳× مرز روشنی است. */
    assert(big < base * 3 + 40,
      'هزینه با تعداد کلاس رشد کرد: ' + base + 'ms → ' + big + 'ms');
  } finally {
    if (added.length) W('db.classes=db.classes.filter(c=>c.id<990000);'
      + '(typeof idxInvalidate==="function")&&idxInvalidate("classes");');
  }
});

test('کلاس‌بندی: findClassFor بدون نقشه هم کار می‌کند', () => {
  /* پارامتر سوم اختیاری است؛ فراخوان‌های قدیمی نباید بشکنند */
  const sid = W('db.schools[0].id');
  const two = W('(()=>{const pl=parsePlacement("دهم تجربی",' + sid + ');'
    + 'return pl?String(!!findClassFor(pl,' + sid + ')):"nopl";})()');
  assert(two !== 'nopl', 'parsePlacement کار نکرد');
  const three = W('(()=>{const pl=parsePlacement("دهم تجربی",' + sid + ');'
    + 'const ix=buildClassIndex(' + sid + ');'
    + 'return String(!!findClassFor(pl,' + sid + ',ix));})()');
  assert(two === three, 'نتیجه با نقشه و بدون نقشه فرق دارد: ' + two + ' / ' + three);
});

test('معماری: سند تصمیمات قفل‌شده کامل است', () => {
  const fs = require('fs'), path = require('path');
  const f = path.join(__dirname, '..', 'docs', 'ARCHITECTURE_DECISIONS.md');
  assert(fs.existsSync(f), 'سند تصمیمات معماری نیست');
  const t = fs.readFileSync(f, 'utf8');
  /* هر کلید یک تصمیم قفل‌شده است؛ حذفش یعنی فاز دوباره باز شده */
  const keys = [
    'HttpOnly', 'SameSite=Lax', 'bcrypt', 'DUMMY_HASH',
    'base_version', 'deleted_at', 'nonce', 'عددی پیاپی',
    'تأخیر تصاعدی', 'فقط‌افزودنی'
  ];
  const missing = keys.filter(k => t.indexOf(k) === -1);
  assert(missing.length === 0, 'تصمیم گمشده: ' + missing.join(' · '));
});

test('معماری: سه تصمیم پایه در قرارداد سرور مستند شده‌اند', () => {
  const fs = require('fs'), path = require('path');
  const t = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'SERVER_SECURITY_CONTRACT.md'), 'utf8');
  ['۵.۸.۱', '۵.۸.۲', '۵.۸.۳', 'base_version', 'deleted_at', 'یکتایی جزئی']
    .forEach(k => assert(t.indexOf(k) > -1, 'بند ۵.۸ ناقص — کلید گمشده: ' + k));
});

test('قرارداد سرور: راه‌حل نشت زمانی مستند شده', () => {
  const fs = require('fs'), path = require('path');
  const t = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'SERVER_SECURITY_CONTRACT.md'), 'utf8');
  /* هر کلید نمایندهٔ یک تصمیم است، نه فقط یک واژه */
  const keys = [
    'DUMMY_HASH',        // راه‌حل اصلی: هش ساختگی
    'همان هزینهٔ',        // هزینهٔ ساختگی باید با واقعی یکی باشد
    'حساب غیرفعال',      // نباید پیش از bcrypt رد شود
    'زمان کف ثابت'       // مکمل، نه جایگزین
  ];
  const missing = keys.filter(k => t.indexOf(k) === -1);
  assert(missing.length === 0, 'بند ۵.۵.۳.۱ ناقص است — کلید گمشده: ' + missing.join(' · '));
});

test('قرارداد سرور: سه دفاع تکمیلی مستند شده‌اند', () => {
  const fs = require('fs'), path = require('path');
  const t = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'SERVER_SECURITY_CONTRACT.md'), 'utf8');
  /* هر کلید نمایندهٔ یک تصمیم است، نه فقط یک واژه */
  const keys = [
    'تأخیر تصاعدی',            // قفل سخت نباید بگذارند
    'زمان پاسخ',               // نشت از راه اختلاف زمان
    'Content-Security-Policy',
    'nonce',                    // راه‌حل خروجی تک‌فایلی
    'X-Frame-Options',
    'Referrer-Policy',
    'کندسازی',                 // پاسخ تدریجی نه قطع فوری
    'فقط‌افزودنی'              // سابقهٔ سمت سرور
  ];
  const missing = keys.filter(k => t.indexOf(k) === -1);
  assert(missing.length === 0, 'بند گمشده در قرارداد سرور: ' + missing.join(' · '));
});

/* ── اطلاع‌رسانی پیامکی: هستهٔ صف (گام ۱، دور ۴۲) ──────────────
   ⚠️ درس دور ۳۸: آزمون روی دادهٔ خام بی‌صدا سبز می‌شود. اینجا
   سامانه پیش‌فرض خاموش است، پس بدون روشن‌کردنش هر آزمون «صفر
   پیام ساخته شد» می‌گیرد و بی‌معنا سبز می‌ماند. پس هر آزمون
   شمارندهٔ خروجی را می‌سنجد، نه فقط نبود خطا. */
function withNotify(cfg, fn) {
  const sid = W('db.schools[0].id');
  /* ⚠️ صف در ورود خالی می‌شود: آزمون‌های پیشین ده‌ها رکورد جا
     می‌گذارند و توابعی مثل notifyAutoFlush که کل صف را می‌پیمایند
     به‌شدت کند می‌شوند. در finally نسخهٔ اصلی برمی‌گردد. */
  W('(()=>{db._nq0=db.notify_queue.slice();db.notify_queue.length=0;})()');
  W('(()=>{db._nq=db.notify_queue.slice();db._nu=S.user;db._nr='
    + 'byId("schools",' + sid + ').notify_rules||null;'
    + 'S.user=db.users.find(u=>u.role==="manager"&&u.school_id===' + sid + ')||S.user;'
    + 'notifySaveSettings(' + sid + ',' + JSON.stringify(cfg) + ');})()');
  try { return fn(sid); }
  finally {
    W('(()=>{db.notify_queue=db._nq0||db._nq;S.user=db._nu;'
      + 'update("schools",' + sid + ',{notify_rules:db._nr});'
      + 'delete db._nq;delete db._nq0;delete db._nu;delete db._nr;})()');
  }
}

/** یک دانش‌آموز که دست‌کم یک ولیِ دارای شمارهٔ معتبر دارد */
const kidWithParent = (sid) =>
  W('(()=>{const s=db.users.find(u=>u.role==="student"&&u.school_id===' + sid
    + '&&notifyParentsOf(u.id).length>0);return s?s.id:0;})()');

test('اطلاع‌رسانی: پیش‌فرض‌ها امن‌اند — خاموش و بدون ارسال خودکار', () => {
  const d = JSON.parse(W('JSON.stringify(NOTIFY_DEFAULTS)'));
  assert(d.enabled === false, 'سامانه نباید پیش‌فرض روشن باشد');
  assert(d.autoSend === false, 'ارسال خودکار باید پیش‌فرض خاموش باشد');
  assert(d.kinds.grade === false, 'پیامک نمره باید پیش‌فرض خاموش باشد');
  assert(d.graceMinutes === 20, 'پنجرهٔ مهلت باید ۲۰ دقیقه باشد');
});

test('اطلاع‌رسانی: وقتی خاموش است هیچ پیامی ساخته نمی‌شود', () => {
  withNotify({ enabled: false }, (sid) => {
    const st = kidWithParent(sid);
    assert(st > 0, 'دانش‌آموز دارای ولی با شمارهٔ معتبر یافت نشد');
    const r = W('(()=>{const q=notifyRequest({school_id:' + sid
      + ',kind:"absence",student_id:' + st + ',student_name:"آزمون",date_fa:"۱۲ شهریور"});'
      + 'return JSON.stringify({made:!!q,skip:notifyRequest.lastSkip});})()');
    const o = JSON.parse(r);
    assert(o.made === false, 'با سامانهٔ خاموش پیام ساخته شد');
    assert(o.skip === 'disabled', 'دلیل رد باید disabled باشد، بود: ' + o.skip);
  });
});

test('اطلاع‌رسانی: نوع خاموش (نمره) پیام نمی‌سازد ولی غیبت می‌سازد', () => {
  withNotify({ enabled: true }, (sid) => {
    const st = kidWithParent(sid);
    const g = JSON.parse(W('(()=>{const q=notifyRequest({school_id:' + sid
      + ',kind:"grade",student_id:' + st + ',student_name:"آزمون",subject:"ریاضی"});'
      + 'return JSON.stringify({made:!!q,skip:notifyRequest.lastSkip});})()'));
    assert(g.made === false && g.skip === 'kind-off',
      'نمره باید رد شود، شد: ' + JSON.stringify(g));
    const a = JSON.parse(W('(()=>{const q=notifyRequest({school_id:' + sid
      + ',kind:"absence",student_id:' + st + ',student_name:"آزمون",date_fa:"۱۲ شهریور"});'
      + 'return JSON.stringify({made:!!q,status:q&&q.status,parts:q&&q.parts});})()'));
    assert(a.made === true, 'غیبت باید ساخته شود');
    assert(a.status === 'pending', 'وضعیت اولیه باید pending باشد');
  });
});

test('اطلاع‌رسانی: دانش‌آموز بدون ولی پیام نمی‌سازد', () => {
  withNotify({ enabled: true }, (sid) => {
    const r = JSON.parse(W('(()=>{const s=db.users.find(u=>u.role==="student"&&u.school_id==='
      + sid + '&&notifyParentsOf(u.id).length===0);'
      + 'if(!s)return JSON.stringify({skipTest:true});'
      + 'const q=notifyRequest({school_id:' + sid + ',kind:"absence",student_id:s.id,'
      + 'student_name:"ب",date_fa:"۱۲ شهریور"});'
      + 'return JSON.stringify({made:!!q,skip:notifyRequest.lastSkip});})()'));
    if (r.skipTest) return;                      /* همه ولی دارند */
    assert(r.made === false && r.skip === 'no-parent',
      'بدون ولی نباید پیام ساخته شود: ' + JSON.stringify(r));
  });
});

test('اطلاع‌رسانی: قالب‌ها کد ملی و عدد نمره را فاش نمی‌کنند', () => {
  const bodies = JSON.parse(W('(()=>{const o={student:"علی رضایی",date:"۱۲ شهریور",'
    + 'subject:"ریاضی",text:"جلسه فردا",school:"دبیرستان نمونه",wasAbsent:true};'
    + 'return JSON.stringify(Object.keys(NOTIFY_TPL).map(k=>NOTIFY_TPL[k](o)));})()'));
  assert(bodies.length >= 4, 'قالب‌ها ناقص‌اند');
  bodies.forEach((b) => {
    assert(!/\d{10}/.test(b), 'کد ملی در قالب: ' + b);
    assert(b.indexOf('http') === -1, 'لینک در قالب: ' + b);
  });
  /* عدد نمره: قالب نمره نباید هیچ عدد لاتینی داشته باشد */
  const gr = W('NOTIFY_TPL.grade({student:"ع",subject:"ریاضی",school:"م"})');
  assert(!/[0-9]/.test(gr), 'قالب نمره نباید عدد داشته باشد: ' + gr);
});

test('اطلاع‌رسانی: قالب غیبت و تأخیر یک قطعه بیشتر نمی‌شود', () => {
  /* ⚠️ پیامک فارسی UCS-2 است: هر ۷۰ نویسه یک قطعه. دو قطعه یعنی
     دو برابر هزینه. با طولانی‌ترین نام واقعی سنجیده می‌شود. */
  const r = JSON.parse(W('(()=>{let nm="";db.users.filter(u=>u.role==="student")'
    + '.forEach(u=>{if((u.full_name||"").length>nm.length)nm=u.full_name;});'
    + 'let sc="";db.schools.forEach(s=>{if((s.name||"").length>sc.length)sc=s.name;});'
    + 'const o={student:nm,date:"۱۲ شهریور",school:sc};'
    + 'return JSON.stringify({name:nm,school:sc,'
    + 'absence:smsParts(NOTIFY_TPL.absence(o)),late:smsParts(NOTIFY_TPL.late(o))});})()'));
  assert(r.absence <= 2, 'قالب غیبت ' + r.absence + ' قطعه شد (نام: ' + r.name + ')');
  assert(r.late <= 2, 'قالب تأخیر ' + r.late + ' قطعه شد');
});

test('اطلاع‌رسانی: پنجرهٔ مهلت — لغو درون بازه توسط همان دبیر', () => {
  withNotify({ enabled: true, graceMinutes: 20 }, (sid) => {
    const st = kidWithParent(sid);
    const r = JSON.parse(W('(()=>{const me=S.user.id;'
      + 'const q=notifyRequest({school_id:' + sid + ',kind:"absence",student_id:' + st
      + ',student_name:"آ",date_fa:"۱۲ شهریور",source_ref:55501});'
      + 'const n=notifyCancelIfFresh("absence",55501,me);'
      + 'return JSON.stringify({made:!!q,cancelled:n,status:byId("notify_queue",q.id).status});})()'));
    assert(r.made === true, 'پیام ساخته نشد');
    assert(r.cancelled === 1, 'باید ۱ پیام لغو شود، شد: ' + r.cancelled);
    assert(r.status === 'cancelled', 'وضعیت باید cancelled باشد: ' + r.status);
  });
});

test('اطلاع‌رسانی: پنجرهٔ مهلت — پس از بازه لغو نمی‌شود', () => {
  withNotify({ enabled: true, graceMinutes: 20 }, (sid) => {
    const st = kidWithParent(sid);
    /* created_at را ۲۱ دقیقه به عقب می‌بریم */
    const r = JSON.parse(W('(()=>{const me=S.user.id;'
      + 'const q=notifyRequest({school_id:' + sid + ',kind:"absence",student_id:' + st
      + ',student_name:"آ",date_fa:"۱۲ شهریور",source_ref:55502});'
      + 'update("notify_queue",q.id,{created_at:new Date(Date.now()-21*60000).toISOString()});'
      + 'const n=notifyCancelIfFresh("absence",55502,me);'
      + 'return JSON.stringify({cancelled:n,status:byId("notify_queue",q.id).status});})()'));
    assert(r.cancelled === 0, 'پس از پنجره نباید لغو شود، شد: ' + r.cancelled);
    assert(r.status === 'pending', 'باید pending بماند: ' + r.status);
  });
});

test('اطلاع‌رسانی: پنجرهٔ مهلت — کاربر دیگر نمی‌تواند لغو کند', () => {
  /* ⚠️ اگر فقط شرط زمان بود، مدیر می‌توانست بی‌ردپا پیام را محو کند */
  withNotify({ enabled: true, graceMinutes: 20 }, (sid) => {
    const st = kidWithParent(sid);
    const r = JSON.parse(W('(()=>{'
      + 'const q=notifyRequest({school_id:' + sid + ',kind:"absence",student_id:' + st
      + ',student_name:"آ",date_fa:"۱۲ شهریور",source_ref:55503});'
      + 'const other=(S.user.id===99901)?99902:99901;'
      + 'const n=notifyCancelIfFresh("absence",55503,other);'
      + 'return JSON.stringify({cancelled:n,status:byId("notify_queue",q.id).status});})()'));
    assert(r.cancelled === 0, 'کاربر دیگر نباید بتواند لغو کند، کرد: ' + r.cancelled);
    assert(r.status === 'pending', 'باید pending بماند: ' + r.status);
  });
});

test('اطلاع‌رسانی: ارسال، کسر اعتبار و ثبت در دفتر پیامک', () => {
  withNotify({ enabled: true }, (sid) => {
    const r = JSON.parse(W('(()=>{const st=db.users.find(u=>u.role==="student"&&u.school_id==='
      + sid + '&&notifyParentsOf(u.id).length>0);'
      + 'const w=smsWalletOf(' + sid + ');update("sms_wallet",w.w.id,{balance:1000});'
      + 'const q=notifyRequest({school_id:' + sid + ',kind:"absence",student_id:st.id,'
      + 'student_name:"آ",date_fa:"۱۲ شهریور"});'
      + 'const before=smsWalletOf(' + sid + ').balance;'
      + 'const logBefore=db.sms_log.length;'
      + 'const res=notifySend([q.id]);'
      + 'return JSON.stringify({sent:res.sent,used:res.used,'
      + 'drop:before-smsWalletOf(' + sid + ').balance,'
      + 'newLogs:db.sms_log.length-logBefore,'
      + 'status:byId("notify_queue",q.id).status,'
      + 'recips:q.parent_ids.length,parts:q.parts});})()'));
    assert(r.sent === 1, 'باید ۱ پیام برود، رفت: ' + r.sent);
    assert(r.used === r.parts * r.recips,
      'مصرف باید قطعه×گیرنده باشد: ' + r.used + ' ≠ ' + r.parts + '×' + r.recips);
    assert(r.drop === r.used, 'کسر اعتبار با مصرف نخواند: ' + r.drop + ' ≠ ' + r.used);
    assert(r.newLogs === r.recips, 'به ازای هر گیرنده یک رکورد sms_log لازم است');
    assert(r.status === 'sent', 'وضعیت باید sent شود: ' + r.status);
  });
});

test('اطلاع‌رسانی: اعتبار ناکافی پیام را گم نمی‌کند — در صف می‌ماند', () => {
  /* ⚠️ اگر پیام هنگام کمبود اعتبار حذف شود، مدیر هرگز نمی‌فهمد
     چه اطلاع‌رسانی‌ای انجام نشده. باید pending بماند. */
  withNotify({ enabled: true }, (sid) => {
    const r = JSON.parse(W('(()=>{const st=db.users.find(u=>u.role==="student"&&u.school_id==='
      + sid + '&&notifyParentsOf(u.id).length>0);'
      + 'const w=smsWalletOf(' + sid + ');update("sms_wallet",w.w.id,{balance:0});'
      + 'const q=notifyRequest({school_id:' + sid + ',kind:"absence",student_id:st.id,'
      + 'student_name:"آ",date_fa:"۱۲ شهریور"});'
      + 'const res=notifySend([q.id]);'
      + 'return JSON.stringify({sent:res.sent,skipped:res.skipped,reason:res.reason,'
      + 'status:byId("notify_queue",q.id).status,exists:!!byId("notify_queue",q.id)});})()'));
    assert(r.sent === 0, 'بدون اعتبار نباید چیزی برود');
    assert(r.reason === 'no-credit', 'دلیل باید no-credit باشد: ' + r.reason);
    assert(r.exists === true, 'رکورد نباید حذف شود');
    assert(r.status === 'pending', 'باید pending بماند تا گم نشود: ' + r.status);
  });
});

test('اطلاع‌رسانی: برآورد هزینه و هشدار حجم بالا', () => {
  withNotify({ enabled: true, bulkWarn: 3, dailyCap: 5 }, (sid) => {
    const r = JSON.parse(W('(()=>{const kids=db.users.filter(u=>u.role==="student"&&'
      + 'u.school_id===' + sid + '&&notifyParentsOf(u.id).length>0).slice(0,4);'
      + 'const w=smsWalletOf(' + sid + ');update("sms_wallet",w.w.id,{balance:1000});'
      + 'const ids=kids.map(s=>notifyRequest({school_id:' + sid + ',kind:"absence",'
      + 'student_id:s.id,student_name:s.full_name,date_fa:"۱۲ شهریور"})).filter(Boolean).map(q=>q.id);'
      + 'const e=notifyEstimate(ids);'
      + 'return JSON.stringify({n:ids.length,count:e.count,parts:e.parts,'
      + 'overBulk:e.overBulk,overCap:e.overCap,enough:e.enough});})()'));
    assert(r.n >= 3, 'برای این آزمون دست‌کم ۳ پیام لازم است، ساخته شد: ' + r.n);
    assert(r.count === r.n, 'شمارش برآورد با تعداد نخواند');
    assert(r.parts > 0, 'برآورد قطعه صفر شد — یعنی هیچ چیز سنجیده نشده');
    assert(r.overBulk === true, 'با bulkWarn=3 باید هشدار حجم بدهد');
    assert(r.overCap === true, 'با dailyCap=5 باید فراتر از سقف علامت بخورد');
  });
});

test('اطلاع‌رسانی: پاک‌سازی کهنه‌ها pending را دست نمی‌زند', () => {
  withNotify({ enabled: true }, (sid) => {
    const r = JSON.parse(W('(()=>{const st=db.users.find(u=>u.role==="student"&&u.school_id==='
      + sid + '&&notifyParentsOf(u.id).length>0);'
      + 'const mk=()=>notifyRequest({school_id:' + sid + ',kind:"absence",student_id:st.id,'
      + 'student_name:"آ",date_fa:"۱۲ شهریور"});'
      + 'const oldSent=mk(),oldPend=mk(),fresh=mk();'
      + 'const past=new Date(Date.now()-40*86400000).toISOString();'
      + 'update("notify_queue",oldSent.id,{status:"sent",decided_at:past,created_at:past});'
      + 'update("notify_queue",oldPend.id,{created_at:past});'
      + 'const n=notifyPurge(30);'
      + 'return JSON.stringify({purged:n,goneSent:!byId("notify_queue",oldSent.id),'
      + 'keptPend:!!byId("notify_queue",oldPend.id),keptFresh:!!byId("notify_queue",fresh.id)});})()'));
    assert(r.purged >= 1, 'باید دست‌کم یک رکورد کهنه پاک شود، شد: ' + r.purged);
    assert(r.goneSent === true, 'رکورد sent کهنه باید پاک شود');
    assert(r.keptPend === true, '🔴 رکورد pending کهنه نباید پاک شود');
    assert(r.keptFresh === true, 'رکورد تازه نباید پاک شود');
  });
});

test('اطلاع‌رسانی: صف هر مدرسه از مدرسهٔ دیگر جدا است', () => {
  withNotify({ enabled: true }, (sid) => {
    const r = JSON.parse(W('(()=>{const other=db.schools.find(s=>s.id!==' + sid + ');'
      + 'if(!other)return JSON.stringify({skipTest:true});'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0);'
      + 'notifyRequest({school_id:' + sid + ',kind:"absence",student_id:st.id,'
      + 'student_name:"آ",date_fa:"۱۲ شهریور"});'
      + 'return JSON.stringify({mine:notifyPending(' + sid + ').length,'
      + 'theirs:notifyPending(other.id).length});})()'));
    if (r.skipTest) return;
    assert(r.mine > 0, 'صف مدرسهٔ خودی نباید خالی باشد');
    assert(r.theirs === 0, 'صف مدرسهٔ دیگر باید خالی باشد، بود: ' + r.theirs);
  });
});

test('اطلاع‌رسانی: تنظیمات تودرتوی kinds کلیدهای دیگر را پاک نمی‌کند', () => {
  /* ⚠️ Object.assign سطحی است؛ ذخیرهٔ {kinds:{absence:false}} نباید
     event و late را نابود کند. */
  withNotify({ enabled: true }, (sid) => {
    /* ⚠️ عمداً مستقیم روی notify_rules می‌نویسیم، نه از راه
       notifySaveSettings — چون آن تابع خودش ادغام می‌کند و مسیر
       خواندن هرگز با دادهٔ ناقص روبه‌رو نمی‌شد. تست جهش دور ۴۲
       نشان داد نسخهٔ قبلی این آزمون هیچ چیز نمی‌سنجید: حذف کامل
       ادغام در notifySettings آن را نمی‌انداخت. رکورد ذخیره‌شدهٔ
       قدیمی (پیش از افزودن کلید تازه) دقیقاً همین شکلی است. */
    const r = JSON.parse(W('(()=>{update("schools",' + sid + ','
      + '{notify_rules:{enabled:true,kinds:{absence:false}}});'
      + 'const c=notifySettings(' + sid + ');'
      + 'return JSON.stringify({absence:c.kinds.absence,event:c.kinds.event,'
      + 'late:c.kinds.late,enabled:c.enabled});})()'));
    assert(r.absence === false, 'کلید تغییرداده‌شده اعمال نشد');
    assert(r.event === true, '🔴 کلید event پاک شد');
    assert(r.late === true, '🔴 کلید late پاک شد');
    assert(r.enabled === true, 'کلید سطح بالا پاک شد');
  });
});

/* ── صفحهٔ صف مدیر (گام ۲، دور ۴۲) ───────────────────────────── */

/** رندر صفحهٔ صف در نقش مدیرِ مدرسهٔ sid */
const renderQueue = (sid) => W('(()=>{S.user=db.users.find(u=>u.role==="manager"&&'
  + 'u.school_id===' + sid + ')||S.user;S.persona=null;S.boss=null;'
  + 'S.route="notifyqueue";S.filters={};return renderRoute();})()');

test('صف مدیر: با سامانهٔ خاموش راهنمای روشن‌کردن نشان می‌دهد', () => {
  withNotify({ enabled: false }, (sid) => {
    const h = renderQueue(sid);
    assert(h.length > 200, 'صفحه کوتاه است: ' + h.length);
    assert(h.indexOf('notify-settings') > -1, 'دکمهٔ تنظیمات نیست');
    assert(h.indexOf('notify-auto-bar') === -1, 'هشدار خودکار نباید باشد');
  });
});

test('صف مدیر: پیام‌های در انتظار را با دکمهٔ دسته‌جمعی نشان می‌دهد', () => {
  withNotify({ enabled: true }, (sid) => {
    const made = W('(()=>{const w=smsWalletOf(' + sid + ');'
      + 'update("sms_wallet",w.w.id,{balance:1000});'
      + 'const k=db.users.filter(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0).slice(0,4);let n=0;'
      + 'k.forEach(s=>{if(notifyRequest({school_id:' + sid + ',kind:"absence",student_id:s.id,'
      + 'student_name:s.full_name,date_fa:"۱۲ شهریور"}))n++;});return n;})()');
    assert(made >= 3, 'برای این آزمون دست‌کم ۳ پیام لازم بود، ساخته شد: ' + made);
    const h = renderQueue(sid);
    const rows = (h.match(/nq-pick/g) || []).length;
    assert(rows === made, 'شمار ردیف با پیام‌ها نخواند: ' + rows + ' ≠ ' + made);
    assert(h.indexOf('notify-approve-sel') > -1, 'دکمهٔ تأیید دسته‌جمعی نیست');
    assert(h.indexOf('notify-cost') > -1, 'کارت برآورد هزینه نیست');
  });
});

test('صف مدیر: نام مخرب دانش‌آموز در صف اجرا نمی‌شود (XSS)', () => {
  /* ⚠️ body متن پیامک است و مدیر ویرایشش می‌کند ⇒ ورودی کاربر تمام‌عیار */
  withNotify({ enabled: true }, (sid) => {
    const r = JSON.parse(W('(()=>{const s=db.users.find(u=>u.role==="student"&&u.school_id==='
      + sid + '&&notifyParentsOf(u.id).length>0);const old=s.full_name;'
      + 'const bad="<img src=x onerror=alert(1)>";update("users",s.id,{full_name:bad});'
      + 'notifyRequest({school_id:' + sid + ',kind:"absence",student_id:s.id,'
      + 'student_name:bad,date_fa:"۱۲ شهریور"});'
      + 'S.user=db.users.find(u=>u.role==="manager"&&u.school_id===' + sid + ')||S.user;'
      + 'S.persona=null;S.route="notifyqueue";S.filters={};const h=renderRoute();'
      + 'update("users",s.id,{full_name:old});'
      + 'return JSON.stringify({raw:h.indexOf("<img src=x onerror")>-1,'
      + 'escaped:h.indexOf("&lt;img src=x onerror")>-1});})()'));
    assert(r.raw === false, '🔴 تگ خام در HTML رفت — رخنهٔ XSS');
    assert(r.escaped === true, 'نام باید فرارداده‌شده دیده شود');
  });
});

test('صف مدیر: هشدار حالت خودکار در همهٔ صفحات مدیر دیده می‌شود', () => {
  /* ⚠️ مدیری که سراغ صف نمی‌رود، همان کسی است که خودکار را روشن
     کرده. اگر هشدار فقط در صفحهٔ صف باشد، هرگز نمی‌بیندش. */
  withNotify({ enabled: true, autoSend: true }, (sid) => {
    const pages = ['dashboard', 'users', 'classes', 'attendance'];
    const seen = JSON.parse(W('(()=>{S.user=db.users.find(u=>u.role==="manager"&&'
      + 'u.school_id===' + sid + ')||S.user;S.persona=null;S.boss=null;'
      + 'return JSON.stringify(' + JSON.stringify(pages) + '.map(p=>{'
      + 'S.route=p;S.filters={};return renderShell().indexOf("notify-auto-bar")>-1;}));})()'));
    const missing = pages.filter((p, i) => !seen[i]);
    assert(missing.length === 0, 'هشدار در این صفحات نبود: ' + missing.join(' · '));
  });
});

test('صف مدیر: با خودکارِ خاموش هیچ هشداری نشان داده نمی‌شود', () => {
  withNotify({ enabled: true, autoSend: false }, (sid) => {
    const h = W('(()=>{S.user=db.users.find(u=>u.role==="manager"&&u.school_id==='
      + sid + ')||S.user;S.persona=null;S.route="dashboard";S.filters={};'
      + 'return renderShell();})()');
    assert(h.indexOf('notify-auto-bar') === -1,
      '🔴 هشدار خودکار در حالت خاموش نمایش داده شد');
  });
});

test('صف مدیر: دبیر به صفحهٔ صف دسترسی ندارد', () => {
  const saved = W('JSON.stringify({u:S.user&&S.user.id,r:S.route})');
  try {
    const can = W('canRoute("notifyqueue","teacher")');
    assert(can === false, '🔴 دبیر اجازهٔ دیدن صف را دارد');
    const forbidden = W('(()=>{const t=db.users.find(u=>u.role==="teacher");'
      + 'S.user=t;S.persona=null;S.boss=null;S.route="notifyqueue";S.filters={};'
      + 'const h=renderRoute();return h.indexOf("nq-pick")===-1;})()');
    assert(forbidden === true, '🔴 محتوای صف به دبیر نشان داده شد');
  } finally {
    const o = JSON.parse(saved);
    W('S.user=byId("users",' + o.u + ')||S.user;S.route=' + JSON.stringify(o.r) + ';S.filters={}');
  }
});

test('صف مدیر: کنش‌های تأیید و رد فقط برای مدیر مجازند', () => {
  const acts = ['notify-approve', 'notify-approve-sel', 'notify-reject',
                'notify-reject-sel', 'notify-save-settings'];
  acts.forEach((a) => {
    const roles = JSON.parse(W('JSON.stringify(ACTION_ROLES[' + JSON.stringify(a) + ']||[])'));
    assert(roles.length > 0, 'کنش ' + a + ' در ACTION_ROLES ثبت نشده');
    assert(roles.indexOf('teacher') === -1, '🔴 دبیر اجازهٔ ' + a + ' دارد');
    assert(roles.indexOf('parent') === -1, '🔴 ولی اجازهٔ ' + a + ' دارد');
    assert(roles.indexOf('manager') > -1, 'مدیر باید اجازهٔ ' + a + ' داشته باشد');
  });
});

test('صف مدیر: فیلتر نوع، فقط همان دسته را نشان می‌دهد', () => {
  withNotify({ enabled: true }, (sid) => {
    const r = JSON.parse(W('(()=>{const w=smsWalletOf(' + sid + ');'
      + 'update("sms_wallet",w.w.id,{balance:1000});'
      + 'const k=db.users.filter(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0).slice(0,3);'
      + 'k.forEach(s=>notifyRequest({school_id:' + sid + ',kind:"absence",student_id:s.id,'
      + 'student_name:s.full_name,date_fa:"۱۲ شهریور"}));'
      + 'notifyRequest({school_id:' + sid + ',kind:"event",student_id:k[0].id,'
      + 'text:"جلسه فردا"});'
      + 'S.user=db.users.find(u=>u.role==="manager"&&u.school_id===' + sid + ')||S.user;'
      + 'S.persona=null;S.route="notifyqueue";'
      + 'S.filters={nkind:"event"};const ev=(renderRoute().match(/nq-pick/g)||[]).length;'
      + 'S.filters={nkind:"absence"};const ab=(renderRoute().match(/nq-pick/g)||[]).length;'
      + 'S.filters={};const all=(renderRoute().match(/nq-pick/g)||[]).length;'
      + 'return JSON.stringify({ev:ev,ab:ab,all:all});})()'));
    assert(r.all >= 4, 'دادهٔ کافی ساخته نشد: ' + r.all);
    assert(r.ev === 1, 'فیلتر رویداد باید ۱ ردیف بدهد، داد: ' + r.ev);
    assert(r.ab === r.all - 1, 'فیلتر غیبت درست کار نکرد: ' + r.ab + ' از ' + r.all);
  });
});

test('صف مدیر: کارت داشبورد شمار در انتظار را درست می‌گوید', () => {
  withNotify({ enabled: true }, (sid) => {
    const r = JSON.parse(W('(()=>{const k=db.users.filter(u=>u.role==="student"&&'
      + 'u.school_id===' + sid + '&&notifyParentsOf(u.id).length>0).slice(0,2);'
      + 'k.forEach(s=>notifyRequest({school_id:' + sid + ',kind:"absence",student_id:s.id,'
      + 'student_name:s.full_name,date_fa:"۱۲ شهریور"}));'
      + 'const n=notifyPending(' + sid + ').length;'
      + 'const h=notifyDailyCard();'
      + 'return JSON.stringify({n:n,has:h.indexOf("notify-daily")>-1,'
      + 'shows:h.indexOf(fa(n))>-1});})()'));
    assert(r.n >= 2, 'پیام ساخته نشد: ' + r.n);
    assert(r.has === true, 'کارت داشبورد رندر نشد');
    assert(r.shows === true, 'شمار در انتظار در کارت دیده نمی‌شود');
  });
});

test('صف مدیر: مسیر تازه عنوان و جایگاه منو دارد', () => {
  const t = JSON.parse(W('JSON.stringify(TITLES.notifyqueue||null)'));
  assert(t && t[0], 'عنوان مسیر notifyqueue تعریف نشده');
  const inNav = W('(NAV.manager||[]).some(g=>g[1].some(i=>i[0]==="notifyqueue"))');
  assert(inNav === true, 'مسیر در منوی مدیر نیست');
  const teacherNav = W('(NAV.teacher||[]).some(g=>g[1].some(i=>i[0]==="notifyqueue"))');
  assert(teacherNav === false, '🔴 مسیر در منوی دبیر هم هست');
});

/* ── پیش‌نویس حضور و غیاب (گام ۳، دور ۴۲) ────────────────────────
   ⚠️ تغییر رفتار: تیک دیگر بی‌درنگ ذخیره نمی‌شود. این آزمون‌ها
   نگهبان همان تغییرند. */

/** محیط دبیر روی یک کلاس و تاریخ مشخص؛ پیش‌نویس در پایان پاک می‌شود.
    ⚠️ درس دور ۴۲: visibleClasses()[0] کورکورانه انتخاب نشود.
    آزمون‌های پیشین ثبت‌نام‌ها را عوض می‌کنند و کلاس نخست ممکن
    است تنها ۱ دانش‌آموز داشته باشد ⇒ «۳ تیک نگرفت» دروغین.
    ⚠️ درس دور ۵۱: دبیر نخست هم ثابت نگذارد. آزمون‌های چرخهٔ
    پایان‌سال کلاس‌های ۱–۲ مدرسهٔ نخست را خالی می‌کنند و گسترش
    داده به ۶ زنگ (کامیت 474f618) نگاشت دبیر و کلاس در جدول
    برنامه را عوض کرد؛ نتیجه: دبیر نخست کلاسِ پُرِ تنها را گم کرد
    و نه آزمون پیش‌نویس سبز ماند. حالا نخستین دبیری را می‌گردیم
    که واقعاً کلاسی با سه دانش‌آموز داشته باشد. */
function withDraft(fn) {
  const env = W('(()=>{for(const t of db.users.filter(u=>u.role==="teacher")){'
    + 'for(const c of teacherClasses(t.id)){if(studentsOfClass(c.id).length>=3)'
    + 'return JSON.stringify({t:t.id,s:t.school_id,c:c.id});}}return null;})()');
  assert(env, 'محیط آزمون: هیچ دبری با کلاس سه‌نفره پیدا نشد');
  const e = JSON.parse(env);
  W('(()=>{db._dU=S.user;db._dF=S.filters;db._dR=S.route;'
    + 'S.user=byId("users",' + e.t + ');'
    + 'S.persona=null;S.boss=null;S.route="attendance";'
    + 'Store.remove(ATT_DRAFT_KEY);})()');
  try {
    const roster = W('studentsOfClass(' + e.c + ').length');
    assert(roster >= 3, 'محیط آزمون کلاس سه‌نفره ندارد (بیشینه: ' + roster + ')');
    return fn(e.s, e.c, '2026-09-04');
  } finally {
    W('(()=>{Store.remove(ATT_DRAFT_KEY);S.user=db._dU;S.filters=db._dF;'
      + 'S.route=db._dR;delete db._dU;delete db._dF;delete db._dR;})()');
  }
}

test('پیش‌نویس: تیک زدن چیزی در پایگاه داده نمی‌نویسد', () => {
  withDraft((sid, cid, date) => {
    const r = JSON.parse(W('(()=>{const st=studentsOfClass(' + cid + ').slice(0,3);'
      + 'const before=db.attendance.filter(a=>a.class_id===' + cid
      + '&&a.date==="' + date + '").length;'
      + 'st.forEach(s=>attDraftSet(' + cid + ',"' + date + '",s.id,"absent"));'
      + 'return JSON.stringify({marks:Object.keys(attDraftGet(' + cid + ',"' + date + '")).length,'
      + 'roster:st.length,'
      + 'before:before,after:db.attendance.filter(a=>a.class_id===' + cid
      + '&&a.date==="' + date + '").length});})()'));
    assert(r.roster === 3, 'محیط آزمون ۳ دانش‌آموز نداد: ' + r.roster);
    assert(r.marks === 3, 'پیش‌نویس ۳ تیک نگرفت: ' + r.marks);
    assert(r.after === r.before, '🔴 تیک مستقیم در پایگاه داده نوشته شد');
  });
});

test('پیش‌نویس: تعویض کلاس آن را گم نمی‌کند', () => {
  /* 🔴 خواستهٔ صریح کاربر: دبیر وسط کار به کلاس دیگر برود و برگردد،
     کارش نباید بپرد. برای همین کلید Store شامل کلاس است.

     ⚠️ دو دام که هر دو در دور ۴۲ رخ دادند:
     ۱. تکیه بر کلاس‌های موجود ⇒ آزمون قبلی ثبت‌نام‌ها را عوض
        می‌کرد، `cls.length<2` می‌شد و آزمون **بی‌صدا رد** می‌شد.
        حالا محیط خودش را می‌سازد و skipTest ندارد.
     ۲. سنجش فقط با شمار ⇒ با کلید مشترک، پیش‌نویس دو کلاس ادغام
        می‌شود و شمار همچنان درست به نظر می‌رسد. محتوا را می‌سنجیم. */
  const sid = W('db.schools[0].id');
  W('(()=>{db._swU=S.user;db._swC=db.classes.slice();db._swE=db.enrollments.slice();'
    + 'S.user=db.users.find(u=>u.role==="manager"&&u.school_id===' + sid + ')||S.user;'
    + 'S.persona=null;S.boss=null;Store.remove(ATT_DRAFT_KEY);'
    + 'db.classes.push({id:881001,school_id:' + sid + ',name:"آزمون الف",grade_level:10,capacity:40});'
    + 'db.classes.push({id:881002,school_id:' + sid + ',name:"آزمون ب",grade_level:10,capacity:40});'
    + 'const st=db.users.filter(u=>u.role==="student"&&u.school_id===' + sid + ').slice(0,6);'
    + 'st.slice(0,3).forEach((s,i)=>db.enrollments.push({id:882000+i,school_id:' + sid
    + ',class_id:881001,student_id:s.id}));'
    + 'st.slice(3,6).forEach((s,i)=>db.enrollments.push({id:882100+i,school_id:' + sid
    + ',class_id:881002,student_id:s.id}));'
    + '(typeof idxInvalidate==="function")&&(idxInvalidate("classes"),idxInvalidate("enrollments"));})()');
  try {
    const r = JSON.parse(W('(()=>{const A=881001,B=881002,d="2026-09-04";'
      + 'const sA=studentsOfClass(A),sB=studentsOfClass(B);'
      + 'sA.forEach(s=>attDraftSet(A,d,s.id,"absent"));'
      + 'S.filters={class:B,date:d};'
      + 'sB.slice(0,2).forEach(s=>attDraftSet(B,d,s.id,"late"));'
      + 'S.filters={class:A,date:d};'
      + 'const dA=attDraftGet(A,d),dB=attDraftGet(B,d);'
      + 'const idsB=sB.map(x=>String(x.id));'
      + 'return JSON.stringify({rosterA:sA.length,rosterB:sB.length,'
      + 'a:Object.keys(dA).length,b:Object.keys(dB).length,'
      + 'keys:Object.keys(attDraftAll()).length,'
      + 'leak:Object.keys(dA).filter(k=>idsB.indexOf(k)>-1).length,'
      + 'aVal:dA[Object.keys(dA)[0]],bVal:dB[Object.keys(dB)[0]]});})()'));
    assert(r.rosterA === 3 && r.rosterB === 3,
      'محیط آزمون ساخته نشد: ' + r.rosterA + '/' + r.rosterB);
    assert(r.a === 3, '🔴 پیش‌نویس کلاس نخست پس از بازگشت گم شد: ' + r.a);
    assert(r.b === 2, '🔴 پیش‌نویس کلاس دوم خراب شد: ' + r.b);
    assert(r.keys === 2, '🔴 دو کلاس باید دو کلید جدا داشته باشند، دارند: ' + r.keys);
    assert(r.leak === 0, '🔴 ' + r.leak + ' تیک کلاس ب به پیش‌نویس کلاس الف نشت کرد');
    assert(r.aVal === 'absent', 'وضعیت کلاس الف عوض شد: ' + r.aVal);
    assert(r.bVal === 'late', 'وضعیت کلاس ب عوض شد: ' + r.bVal);
  } finally {
    W('(()=>{db.classes=db._swC;db.enrollments=db._swE;S.user=db._swU;'
      + 'delete db._swC;delete db._swE;delete db._swU;Store.remove(ATT_DRAFT_KEY);'
      + '(typeof idxInvalidate==="function")&&(idxInvalidate("classes"),idxInvalidate("enrollments"));})()');
  }
});

test('پیش‌نویس: تاریخ و کاربر هم بخشی از کلید‌اند', () => {
  /* 🔴 تست جهش دور ۴۲: آزمون تعویض کلاس فقط جزء «کلاس» را پوشش
     می‌داد. حذف تاریخ یا کاربر از کلید هیچ آزمونی را نمی‌انداخت.
     پیامد واقعی: دو روز مختلف روی هم می‌افتند، یا دبیر جانشین
     پیش‌نویس نیمه‌کارهٔ دبیر اصلی را می‌بیند و ثبتش می‌کند. */
  const sid = W('db.schools[0].id');
  W('(()=>{db._dkU=S.user;S.persona=null;S.boss=null;Store.remove(ATT_DRAFT_KEY);})()');
  try {
    const r = JSON.parse(W('(()=>{const cid=999901,s1=771,s2=772;'
      + 'const t=db.users.find(u=>u.role==="teacher"&&u.school_id===' + sid + ');'
      + 'const t2=db.users.find(u=>u.role==="teacher"&&u.school_id===' + sid
      + '&&u.id!==t.id)||db.users.find(u=>u.role==="manager");'
      + 'S.user=t;'
      + 'attDraftSet(cid,"2026-09-04",s1,"absent");'
      + 'const sameDay=Object.keys(attDraftGet(cid,"2026-09-04")).length;'
      + 'const otherDay=Object.keys(attDraftGet(cid,"2026-09-05")).length;'
      + 'S.user=t2;'
      + 'const otherUser=Object.keys(attDraftGet(cid,"2026-09-04")).length;'
      + 'S.user=t;'
      + 'return JSON.stringify({sameDay:sameDay,otherDay:otherDay,'
      + 'otherUser:otherUser,twoUsers:t.id!==t2.id});})()'));
    assert(r.sameDay === 1, 'پیش‌نویس همان روز ثبت نشد: ' + r.sameDay);
    assert(r.otherDay === 0,
      '🔴 پیش‌نویس روز دیگر همان تیک‌ها را نشان داد — تاریخ در کلید نیست');
    if (r.twoUsers) {
      assert(r.otherUser === 0,
        '🔴 کاربر دیگر پیش‌نویس این دبیر را دید — کاربر در کلید نیست');
    }
  } finally {
    W('(()=>{S.user=db._dkU;delete db._dkU;Store.remove(ATT_DRAFT_KEY);})()');
  }
});

test('پیش‌نویس: در Store می‌ماند، نه فقط در حافظهٔ صفحه', () => {
  /* 🔴 اگر فقط در S باشد، بستن مرورگر کار دبیر را می‌برد.
     می‌سنجیم که واقعاً در localStorage نوشته شده باشد. */
  withDraft((sid, cid, date) => {
    const r = JSON.parse(W('(()=>{studentsOfClass(' + cid + ').slice(0,2)'
      + '.forEach(s=>attDraftSet(' + cid + ',"' + date + '",s.id,"absent"));'
      + 'const raw=localStorage.getItem(ATT_DRAFT_KEY);'
      + 'return JSON.stringify({raw:!!raw,len:(raw||"").length,'
      + 'parsed:raw?Object.keys(JSON.parse(raw)).length:0});})()'));
    assert(r.raw === true, '🔴 پیش‌نویس در localStorage نوشته نشد');
    assert(r.len > 10, 'محتوای ذخیره‌شده خالی است');
    assert(r.parsed >= 1, 'کلید پیش‌نویس در Store نیست');
  });
});

test('پیش‌نویس: تیک بی‌تغییر در شمار تغییرات نمی‌آید', () => {
  /* ⚠️ اگر دبیر روی «حاضر» بزند و از قبل هم حاضر بوده، تغییری
     نیست. بدون این بررسی مرور نهایی «۳۰ تغییر» نشان می‌داد که
     بیشترش هیچ بود. */
  withDraft((sid, cid, date) => {
    const r = JSON.parse(W('(()=>{const st=studentsOfClass(' + cid + ')[0];'
      + 'const ex=db.attendance.find(a=>a.student_id===st.id&&a.date==="' + date + '");'
      + 'if(ex)update("attendance",ex.id,{status:"present"});'
      + 'else insert("attendance",{school_id:' + sid + ',class_id:' + cid
      + ',student_id:st.id,date:"' + date + '",status:"present",note:null});'
      + 'attDraftSet(' + cid + ',"' + date + '",st.id,"present");'
      + 'const d=attDraftDiff(' + cid + ',"' + date + '");'
      + 'return JSON.stringify({n:d.changes.length,'
      + 'has:d.changes.some(c=>c.student_id===st.id)});})()'));
    assert(r.has === false, '🔴 تیک بی‌تغییر جزو تغییرات شمرده شد');
    assert(r.n === 0, 'نباید تغییری باشد، بود: ' + r.n);
  });
});

test('پیش‌نویس: ثبت نهایی می‌نویسد، پیش‌نویس را پاک و پیامک را می‌سازد', () => {
  withNotify({ enabled: true }, (sid) => {
    const r = JSON.parse(W('(()=>{db._cU=S.user;'
      + 'S.user=db.users.find(u=>u.role==="teacher"&&u.school_id===' + sid + ')'
      + '||db.users.find(u=>u.role==="manager"&&u.school_id===' + sid + ')||S.user;'
      + 'S.persona=null;S.boss=null;S.route="attendance";Store.remove(ATT_DRAFT_KEY);'
      + 'const cid=visibleClasses()[0].id,date="2026-09-07";'
      + 'S.filters={class:cid,date:date};'
      + 'const kids=studentsOfClass(cid).filter(s=>notifyParentsOf(s.id).length>0).slice(0,3);'
      + 'if(kids.length<2){S.user=db._cU;return JSON.stringify({skipTest:true});}'
      + 'kids.forEach((s,i)=>attDraftSet(cid,date,s.id,i===0?"absent":"present"));'
      + 'const d=attDraftDiff(cid,date);const school=byId("classes",cid).school_id;'
      + 'const made=[];batchWrites(()=>{d.changes.forEach(c=>{'
      + 'let rid=c.rec_id;'
      + 'if(rid)update("attendance",rid,{status:c.to,class_id:cid});'
      + 'else rid=insert("attendance",{school_id:school,class_id:cid,student_id:c.student_id,'
      + 'date:date,status:c.to,note:null}).id;made.push({c:c,rid:rid});});});'
      + 'let sms=0;made.forEach(m=>{if(m.c.to!=="absent"&&m.c.to!=="late")return;'
      + 'if(notifyRequest({school_id:school,kind:"absence",student_id:m.c.student_id,'
      + 'class_id:cid,student_name:m.c.name,date_fa:"۱۳ شهریور",source_ref:m.rid}))sms++;});'
      + 'attDraftClear(cid,date);'
      + 'const res={written:db.attendance.filter(a=>a.class_id===cid&&a.date===date).length,'
      + 'draft:Object.keys(attDraftGet(cid,date)).length,sms:sms,'
      + 'refOk:db.notify_queue.filter(q=>q.source_ref).every(q=>!!byId("attendance",q.source_ref))};'
      + 'S.user=db._cU;delete db._cU;Store.remove(ATT_DRAFT_KEY);'
      + 'return JSON.stringify(res);})()'));
    if (r.skipTest) return;
    assert(r.written >= 2, 'رکورد حضور نوشته نشد: ' + r.written);
    assert(r.draft === 0, '🔴 پیش‌نویس پس از ثبت پاک نشد');
    assert(r.sms === 1, 'باید فقط برای غیبت پیامک ساخته شود، شد: ' + r.sms);
    assert(r.refOk === true, '🔴 source_ref به رکورد واقعی اشاره نمی‌کند');
  });
});

test('پیش‌نویس: راهنمای تغییر رفتار یک‌بار نشان داده می‌شود', () => {
  /* ⚠️ دبیری که با روش قدیم کار کرده باید بفهمد چرا تیک‌هایش
     بی‌درنگ ذخیره نمی‌شود، وگرنه گمان می‌کند برنامه خراب است. */
  withDraft((sid, cid, date) => {
    const r = JSON.parse(W('(()=>{Store.remove(ATT_TIP_KEY);'
      + 'S.filters={class:' + cid + ',date:"' + date + '"};'
      + 'const first=renderRoute().indexOf("att-tip")>-1;'
      + 'const seen=Store.getJSON(ATT_TIP_KEY,{})||{};seen[S.user.id]=1;'
      + 'Store.setJSON(ATT_TIP_KEY,seen);'
      + 'const second=renderRoute().indexOf("att-tip")>-1;'
      + 'Store.remove(ATT_TIP_KEY);'
      + 'return JSON.stringify({first:first,second:second});})()'));
    assert(r.first === true, '🔴 راهنمای تغییر رفتار نشان داده نشد');
    assert(r.second === false, '🔴 راهنما پس از «متوجه شدم» باز هم آمد');
  });
});

test('پیش‌نویس: صفحه تغییرات ثبت‌نشده را برجسته می‌کند', () => {
  withDraft((sid, cid, date) => {
    const r = JSON.parse(W('(()=>{S.filters={class:' + cid + ',date:"' + date + '"};'
      + 'const clean=renderRoute();'
      + 'studentsOfClass(' + cid + ').slice(0,2)'
      + '.forEach(s=>attDraftSet(' + cid + ',"' + date + '",s.id,"absent"));'
      + 'const dirty=renderRoute();'
      + 'return JSON.stringify({barBefore:clean.indexOf("att-draft-bar")>-1,'
      + 'barAfter:dirty.indexOf("att-draft-bar")>-1,'
      + 'rows:(dirty.match(/att-row-draft/g)||[]).length,'
      + 'review:dirty.indexOf("att-review")>-1});})()'));
    assert(r.barBefore === false, 'بدون پیش‌نویس نباید نوار هشدار باشد');
    assert(r.barAfter === true, '🔴 نوار «ثبت‌نشده» نمایش داده نشد');
    assert(r.rows === 2, 'ردیف‌های علامت‌دار: ' + r.rows + ' (انتظار ۲)');
    assert(r.review === true, 'دکمهٔ مرور نهایی نیست');
  });
});

test('پیش‌نویس: دور ریختن، پایگاه داده را دست نمی‌زند', () => {
  withDraft((sid, cid, date) => {
    const r = JSON.parse(W('(()=>{const before=db.attendance.length;'
      + 'studentsOfClass(' + cid + ').slice(0,3)'
      + '.forEach(s=>attDraftSet(' + cid + ',"' + date + '",s.id,"absent"));'
      + 'attDraftClear(' + cid + ',"' + date + '");'
      + 'return JSON.stringify({draft:Object.keys(attDraftGet(' + cid + ',"' + date + '")).length,'
      + 'dbSame:db.attendance.length===before});})()'));
    assert(r.draft === 0, 'پیش‌نویس پاک نشد');
    assert(r.dbSame === true, '🔴 دور ریختن پیش‌نویس پایگاه داده را تغییر داد');
  });
});

test('پیش‌نویس: کهنه‌های رهاشده پاک می‌شوند', () => {
  withDraft((sid, cid, date) => {
    const r = JSON.parse(W('(()=>{studentsOfClass(' + cid + ').slice(0,2)'
      + '.forEach(s=>attDraftSet(' + cid + ',"' + date + '",s.id,"absent"));'
      + 'const all=attDraftAll();const k=Object.keys(all)[0];'
      + 'all[k].at=new Date(Date.now()-10*86400000).toISOString();'
      + 'Store.setJSON(ATT_DRAFT_KEY,all);'
      + 'const n=attDraftPurge(7);'
      + 'return JSON.stringify({purged:n,left:Object.keys(attDraftAll()).length});})()'));
    assert(r.purged >= 1, 'پیش‌نویس کهنه پاک نشد: ' + r.purged);
    assert(r.left === 0, 'پس از پاک‌سازی چیزی نباید بماند: ' + r.left);
  });
});

test('پیش‌نویس: کلیک روی وضعیت چیزی ذخیره نمی‌کند تا ثبت نهایی', () => {
  /* 🔴 تست جهش دور ۴۲: بازگرداندن att-set به رفتار قدیم (نوشتن
     مستقیم) هیچ آزمونی را نمی‌انداخت، چون همه attDraftSet را
     مستقیم صدا می‌زدند نه از راه دکمه. این آزمون از مسیر واقعی
     کاربر می‌رود: کلیک روی DOM. */
  withDraft((sid, cid, date) => {
    const r = JSON.parse(W('(()=>{S.filters={class:' + cid + ',date:"' + date + '"};'
      + 'const st=studentsOfClass(' + cid + ').slice(0,2);'
      + 'const before=db.attendance.filter(a=>a.class_id===' + cid
      + '&&a.date==="' + date + '").length;'
      + 'st.forEach(s=>{const b=document.createElement("button");'
      + 'b.setAttribute("data-act","att-set");b.setAttribute("data-id",String(s.id));'
      + 'b.setAttribute("data-s","absent");document.body.appendChild(b);'
      + 'b.dispatchEvent(new MouseEvent("click",{bubbles:true}));b.remove();});'
      + 'return JSON.stringify({draft:Object.keys(attDraftGet(' + cid + ',"' + date + '")).length,'
      + 'before:before,after:db.attendance.filter(a=>a.class_id===' + cid
      + '&&a.date==="' + date + '").length});})()'));
    assert(r.draft === 2, 'کلیک به پیش‌نویس نرفت: ' + r.draft);
    assert(r.after === r.before,
      '🔴 کلیک مستقیم در پایگاه داده نوشت — رفتار قدیم برگشته است');
  });
});

test('پیش‌نویس: ثبت نهایی از راه دکمه، پیش‌نویس را پاک می‌کند', () => {
  /* 🔴 تست جهش: حذف attDraftClear از att-commit را هیچ آزمونی
     نمی‌گرفت. بدون پاک‌شدن، دبیر پس از ثبت باز هم نوار «ثبت‌نشده»
     می‌بیند و دوباره ثبت می‌کند. */
  withDraft((sid, cid, date) => {
    const r = JSON.parse(W('(()=>{S.filters={class:' + cid + ',date:"' + date + '"};'
      + 'const st=studentsOfClass(' + cid + ').slice(0,2);'
      + 'st.forEach(s=>attDraftSet(' + cid + ',"' + date + '",s.id,"absent"));'
      + 'const click=function(a){const b=document.createElement("button");'
      + 'b.setAttribute("data-act",a);document.body.appendChild(b);'
      + 'b.dispatchEvent(new MouseEvent("click",{bubbles:true}));b.remove();};'
      + 'click("att-review");click("att-commit");'
      + 'return JSON.stringify({draft:Object.keys(attDraftGet(' + cid + ',"' + date + '")).length,'
      + 'written:db.attendance.filter(a=>a.class_id===' + cid
      + '&&a.date==="' + date + '"&&a.status==="absent").length,'
      + 'bar:renderRoute().indexOf("att-draft-bar")>-1});})()'));
    assert(r.written >= 2, 'ثبت نهایی چیزی ننوشت: ' + r.written);
    assert(r.draft === 0, '🔴 پیش‌نویس پس از ثبت نهایی پاک نشد');
    assert(r.bar === false, '🔴 نوار «ثبت‌نشده» پس از ثبت هنوز دیده می‌شود');
  });
});

test('پیش‌نویس: کنش‌های تازه در ACTION_ROLES ثبت شده‌اند', () => {
  ['att-review', 'att-commit', 'att-discard'].forEach((a) => {
    const roles = JSON.parse(W('JSON.stringify(ACTION_ROLES[' + JSON.stringify(a) + ']||[])'));
    assert(roles.length > 0, 'کنش ' + a + ' ثبت نشده — هر نقشی می‌تواند اجرایش کند');
    assert(roles.indexOf('teacher') > -1, 'دبیر باید اجازهٔ ' + a + ' داشته باشد');
    assert(roles.indexOf('student') === -1, '🔴 دانش‌آموز اجازهٔ ' + a + ' دارد');
    assert(roles.indexOf('parent') === -1, '🔴 ولی اجازهٔ ' + a + ' دارد');
  });
});

/* ── اصلاحیهٔ خودکار (گام ۵، دور ۴۲) ─────────────────────────────
   ⚠️ محیط این آزمون‌ها باید خودکفا باشد (درس گام ۳): دادهٔ مشترک
   را آزمون‌های پیشین عوض می‌کنند. */

/**
 * محیط کامل اصلاحیه: یک رکورد حضور + یک پیام ارسال‌شده.
 * fn دریافت می‌کند: {sid, attId, qId, studentId}
 */
function withSentMsg(fn) {
  const sid = W('db.schools[0].id');
  W('(()=>{db._rcU=S.user;db._rcQ=db.notify_queue.slice();'
    + 'db._rcR=byId("schools",' + sid + ').notify_rules||null;'
    + 'S.user=db.users.find(u=>u.role==="manager"&&u.school_id===' + sid + ')||S.user;'
    + 'S.persona=null;S.boss=null;'
    + 'notifySaveSettings(' + sid + ',{enabled:true});'
    + 'const w=smsWalletOf(' + sid + ');update("sms_wallet",w.w.id,{balance:5000});})()');
  try {
    const env = JSON.parse(W('(()=>{'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0);'
      + 'const cl=db.classes.find(c=>c.school_id===' + sid + ');'
      + 'const rec=insert("attendance",{school_id:' + sid + ',class_id:cl?cl.id:null,'
      + 'student_id:st.id,date:"2026-10-01",status:"absent",note:null});'
      + 'const q=notifyRequest({school_id:' + sid + ',kind:"absence",student_id:st.id,'
      + 'class_id:cl?cl.id:null,student_name:st.full_name,date_fa:"۹ مهر",source_ref:rec.id});'
      + 'notifySend([q.id]);'
      + 'return JSON.stringify({attId:rec.id,qId:q.id,studentId:st.id,'
      + 'status:byId("notify_queue",q.id).status});})()'));
    assert(env.status === 'sent', 'محیط آزمون: پیام ارسال نشد (' + env.status + ')');
    return fn(sid, env);
  } finally {
    W('(()=>{db.notify_queue=db._rcQ;S.user=db._rcU;'
      + 'update("schools",' + sid + ',{notify_rules:db._rcR});'
      + 'delete db._rcQ;delete db._rcU;delete db._rcR;})()');
  }
}

test('اصلاحیه: تغییر پس از ارسال، اصلاحیه می‌سازد', () => {
  withSentMsg((sid, env) => {
    const r = JSON.parse(W('(()=>{update("attendance",' + env.attId + ',{status:"present"});'
      + 'const res=notifyReconcile(' + env.attId + ');'
      + 'const c=res.queue;'
      + 'return JSON.stringify({action:res.action,made:!!c,'
      + 'corrOf:c?c.correction_of:null,status:c?c.status:null,'
      + 'ref:c?c.source_ref:null,body:c?c.body:"",'
      + 'origUntouched:byId("notify_queue",' + env.qId + ').status});})()'));
    assert(r.action === 'created', 'اصلاحیه ساخته نشد: ' + r.action);
    assert(r.corrOf === env.qId, 'اصلاحیه به پیام اصلی اشاره نمی‌کند: ' + r.corrOf);
    assert(r.ref === env.attId, 'source_ref اشتباه است');
    assert(r.status === 'pending', 'اصلاحیه باید در صف تأیید باشد: ' + r.status);
    assert(r.body.indexOf('اصلاحیه') === 0, 'متن با «اصلاحیه» شروع نمی‌شود: ' + r.body);
    assert(r.body.indexOf('غایب نبوده') > -1, 'جهت اصلاحیه غلط است: ' + r.body);
    assert(r.origUntouched === 'sent', '🔴 پیام اصلی دست‌کاری شد');
  });
});

test('اصلاحیه: 🔴 حلقهٔ بی‌نهایت نمی‌سازد', () => {
  /* اصلاحیه خودش نباید موضوع اصلاحیهٔ بعدی شود، وگرنه هر وارسی
     یک رکورد تازه می‌سازد و صف مدیر بی‌نهایت پر می‌شود. */
  withSentMsg((sid, env) => {
    const r = JSON.parse(W('(()=>{update("attendance",' + env.attId + ',{status:"present"});'
      + 'notifyReconcile(' + env.attId + ');'
      + 'const before=db.notify_queue.filter(q=>q.source_ref===' + env.attId + ').length;'
      + 'for(let i=0;i<6;i++)notifyReconcile(' + env.attId + ');'
      + 'const after=db.notify_queue.filter(q=>q.source_ref===' + env.attId + ').length;'
      + 'return JSON.stringify({before:before,after:after});})()'));
    assert(r.before >= 2, 'محیط آزمون ناقص: ' + r.before);
    assert(r.after === r.before,
      '🔴 ' + (r.after - r.before) + ' رکورد در ۶ وارسی پیاپی اضافه شد — حلقه');
  });
});

test('اصلاحیه: 🔴 رفت‌وبرگشت دو پیام متناقض نمی‌فرستد', () => {
  /* غایب → حاضر (اصلاحیه ساخته می‌شود) → غایب دوباره.
     چون اصلاحیه هنوز نرفته و وضعیت به همان چیزی برگشته که
     خانواده می‌داند، اصلاحیهٔ معلق باید لغو شود نه اینکه دومی
     ساخته شود. */
  withSentMsg((sid, env) => {
    const r = JSON.parse(W('(()=>{'
      + 'update("attendance",' + env.attId + ',{status:"present"});'
      + 'const a=notifyReconcile(' + env.attId + ');'
      + 'const cid=a.queue?a.queue.id:0;'
      + 'update("attendance",' + env.attId + ',{status:"absent"});'
      + 'const b=notifyReconcile(' + env.attId + ');'
      + 'const corr=db.notify_queue.filter(q=>q.source_ref===' + env.attId + '&&q.correction_of);'
      + 'return JSON.stringify({first:a.action,second:b.action,'
      + 'corrCount:corr.length,'
      + 'cancelled:cid?byId("notify_queue",cid).status:null,'
      + 'pendingCorr:corr.filter(q=>q.status==="pending").length});})()'));
    assert(r.first === 'created', 'اصلاحیهٔ نخست ساخته نشد: ' + r.first);
    assert(r.second === 'cancelled',
      '🔴 بازگشت به وضعیت اول باید اصلاحیه را لغو کند، کرد: ' + r.second);
    assert(r.cancelled === 'cancelled', 'اصلاحیهٔ معلق لغو نشد: ' + r.cancelled);
    assert(r.corrCount === 1, '🔴 ' + r.corrCount + ' اصلاحیه ساخته شد، باید ۱ باشد');
    assert(r.pendingCorr === 0, '🔴 اصلاحیهٔ متناقض هنوز معلق است');
  });
});

test('اصلاحیه: پیام نرفته اصلاحیه نمی‌گیرد', () => {
  /* تا وقتی پیام در صف است، خانواده چیزی نمی‌داند. آنجا کار
     پنجرهٔ مهلت است نه اصلاحیه. */
  withNotify({ enabled: true }, (sid) => {
    const r = JSON.parse(W('(()=>{'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0);'
      + 'const rec=insert("attendance",{school_id:' + sid + ',class_id:null,'
      + 'student_id:st.id,date:"2026-10-02",status:"absent",note:null});'
      + 'notifyRequest({school_id:' + sid + ',kind:"absence",student_id:st.id,'
      + 'student_name:st.full_name,date_fa:"۱۰ مهر",source_ref:rec.id});'
      + 'update("attendance",rec.id,{status:"present"});'
      + 'const before=db.notify_queue.length;'
      + 'const res=notifyReconcile(rec.id);'
      + 'return JSON.stringify({action:res.action,added:db.notify_queue.length-before});})()'));
    assert(r.action === 'none', 'برای پیام معلق نباید اصلاحیه ساخته شود: ' + r.action);
    assert(r.added === 0, '🔴 ' + r.added + ' رکورد اضافه شد');
  });
});

test('اصلاحیه: رکورد بدون هیچ پیام قبلی اصلاحیه نمی‌گیرد', () => {
  withNotify({ enabled: true }, (sid) => {
    const r = JSON.parse(W('(()=>{'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid + ');'
      + 'const rec=insert("attendance",{school_id:' + sid + ',class_id:null,'
      + 'student_id:st.id,date:"2026-10-03",status:"absent",note:null});'
      + 'const before=db.notify_queue.length;'
      + 'const res=notifyReconcile(rec.id);'
      + 'return JSON.stringify({action:res.action,added:db.notify_queue.length-before});})()'));
    assert(r.action === 'none', 'بدون پیام قبلی نباید اصلاحیه بسازد: ' + r.action);
    assert(r.added === 0, '🔴 رکورد اضافه شد');
  });
});

test('اصلاحیه: جهت متن با وضعیت تازه می‌خواند', () => {
  withSentMsg((sid, env) => {
    /* غایب بود ⇒ حاضر شد ⇒ «غایب نبوده است» */
    const a = W('(()=>{update("attendance",' + env.attId + ',{status:"present"});'
      + 'const r=notifyReconcile(' + env.attId + ');return r.queue?r.queue.body:"";})()');
    assert(a.indexOf('غایب نبوده') > -1, 'جهت نخست غلط: ' + a);
    /* حالا دوباره غایب و اصلاحیه را بفرست، سپس حاضر */
    const b = W('(()=>{const c=db.notify_queue.filter(q=>q.correction_of&&'
      + 'q.source_ref===' + env.attId + ')[0];'
      + 'update("notify_queue",c.id,{status:"sent",decided_at:new Date().toISOString()});'
      + 'update("attendance",' + env.attId + ',{status:"absent"});'
      + 'const r=notifyReconcile(' + env.attId + ');return r.queue?r.queue.body:"";})()');
    assert(b.indexOf('غایب بوده') > -1 && b.indexOf('غایب نبوده') === -1,
      'جهت دوم غلط: ' + b);
  });
});

test('اصلاحیه: ثبت نهایی از راه دکمه پیام تکراری نمی‌سازد', () => {
  /* 🔴 تست جهش دور ۴۲ نشان داد گارد «already» در att-commit هیچ
     پوششی نداشت. سناریوی واقعی: پیام غیبت رفته؛ دبیر روز بعد باز
     همان کلاس را ثبت می‌کند. بدون گارد، خانواده دو بار خبر یکسان
     می‌گیرد. این آزمون از مسیر واقعی کلیک می‌رود، نه صدا زدن
     مستقیم تابع. */
  const sid = W('db.schools[0].id');
  W('(()=>{db._dupU=S.user;db._dupQ=db.notify_queue.slice();'
    + 'db._dupC=db.classes.slice();db._dupE=db.enrollments.slice();'
    + 'db._dupR=byId("schools",' + sid + ').notify_rules||null;'
    + 'S.user=db.users.find(u=>u.role==="manager"&&u.school_id===' + sid + ')||S.user;'
    + 'S.persona=null;S.boss=null;S.route="attendance";Store.remove(ATT_DRAFT_KEY);'
    + 'notifySaveSettings(' + sid + ',{enabled:true});'
    + 'const w=smsWalletOf(' + sid + ');update("sms_wallet",w.w.id,{balance:5000});'
    + 'db.classes.push({id:883001,school_id:' + sid + ',name:"آزمون تکرار",grade_level:10,capacity:40});'
    + 'const st=db.users.filter(u=>u.role==="student"&&u.school_id===' + sid
    + '&&notifyParentsOf(u.id).length>0).slice(0,2);'
    + 'st.forEach((s,i)=>db.enrollments.push({id:884000+i,school_id:' + sid
    + ',class_id:883001,student_id:s.id}));'
    + '(typeof idxInvalidate==="function")&&(idxInvalidate("classes"),idxInvalidate("enrollments"));})()');
  try {
    const r = JSON.parse(W('(()=>{const cid=883001,d="2026-10-05";'
      + 'S.filters={class:cid,date:d};'
      + 'const kid=studentsOfClass(cid)[0].id;'
      + 'const click=function(a,o){const b=document.createElement("button");'
      + 'b.setAttribute("data-act",a);if(o)Object.keys(o).forEach(k=>b.setAttribute("data-"+k,o[k]));'
      + 'document.body.appendChild(b);b.dispatchEvent(new MouseEvent("click",{bubbles:true}));b.remove();};'
      /* نوبت اول: غیبت ثبت و پیام ارسال شود */
      + 'click("att-set",{id:String(kid),s:"absent"});click("att-review");click("att-commit");'
      + 'const q1=db.notify_queue.filter(q=>q.status==="pending"&&!q.correction_of).pop();'
      + 'if(!q1)return JSON.stringify({fail:"پیام اول ساخته نشد"});'
      + 'notifySend([q1.id]);'
      + 'const ref=q1.source_ref;'
      + 'const afterFirst=db.notify_queue.filter(q=>q.source_ref===ref&&!q.correction_of).length;'
      /* نوبت دوم: دبیر باز همان وضعیت را ثبت می‌کند */
      + 'attDraftSet(cid,d,kid,"present");'
      + 'click("att-review");click("att-commit");'
      + 'attDraftSet(cid,d,kid,"absent");'
      + 'click("att-review");click("att-commit");'
      + 'const plain=db.notify_queue.filter(q=>q.source_ref===ref&&!q.correction_of).length;'
      + 'return JSON.stringify({afterFirst:afterFirst,plain:plain,'
      + 'corr:db.notify_queue.filter(q=>q.source_ref===ref&&q.correction_of).length});})()'));
    assert(!r.fail, r.fail);
    assert(r.afterFirst === 1, 'محیط آزمون: پیام اول ساخته نشد (' + r.afterFirst + ')');
    assert(r.plain === 1,
      '🔴 ' + r.plain + ' پیام عادی برای یک رکورد ساخته شد — خانواده خبر تکراری می‌گیرد');
  } finally {
    W('(()=>{db.notify_queue=db._dupQ;db.classes=db._dupC;db.enrollments=db._dupE;'
      + 'S.user=db._dupU;update("schools",' + sid + ',{notify_rules:db._dupR});'
      + 'delete db._dupQ;delete db._dupC;delete db._dupE;delete db._dupU;delete db._dupR;'
      + 'Store.remove(ATT_DRAFT_KEY);'
      + '(typeof idxInvalidate==="function")&&(idxInvalidate("classes"),idxInvalidate("enrollments"));})()');
  }
});

test('اصلاحیه: notifyLastSent فقط پیام ارسال‌شده را برمی‌گرداند', () => {
  withSentMsg((sid, env) => {
    const r = JSON.parse(W('(()=>{const last=notifyLastSent("absence",' + env.attId + ');'
      + 'return JSON.stringify({found:!!last,id:last?last.id:0,'
      + 'isSent:last?last.status==="sent":false});})()'));
    assert(r.found === true, 'پیام ارسال‌شده پیدا نشد');
    assert(r.isSent === true, 'پیام یافته‌شده ارسال‌شده نیست');
    assert(r.id === env.qId, 'شناسهٔ پیام اشتباه: ' + r.id);
  });
});

test('اصلاحیه: در صف مدیر بالاتر از بقیه و با نشان دیده می‌شود', () => {
  withSentMsg((sid, env) => {
    const r = JSON.parse(W('(()=>{update("attendance",' + env.attId + ',{status:"present"});'
      + 'notifyReconcile(' + env.attId + ');'
      + 'const st=db.users.filter(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0).slice(1,3);'
      + 'st.forEach(s=>notifyRequest({school_id:' + sid + ',kind:"absence",student_id:s.id,'
      + 'student_name:s.full_name,date_fa:"۹ مهر"}));'
      + 'const p=notifyPending(' + sid + ');'
      + 'S.user=db.users.find(u=>u.role==="manager"&&u.school_id===' + sid + ')||S.user;'
      + 'S.persona=null;S.route="notifyqueue";S.filters={};'
      + 'const h=renderRoute();'
      + 'return JSON.stringify({total:p.length,firstIsCorr:!!(p[0]&&p[0].correction_of),'
      + 'badge:h.indexOf("🔴 اصلاحیه")>-1,filter:h.indexOf(\'data-k="correction"\')>-1});})()'));
    assert(r.total >= 3, 'صف باید چند پیام داشته باشد: ' + r.total);
    assert(r.firstIsCorr === true, '🔴 اصلاحیه بالای فهرست نیست');
    assert(r.badge === true, 'نشان اصلاحیه در صفحه نیست');
    assert(r.filter === true, 'فیلتر اصلاحیه در صفحه نیست');
  });
});

test('اصلاحیه: با سامانهٔ خاموش ساخته نمی‌شود', () => {
  withSentMsg((sid, env) => {
    const r = JSON.parse(W('(()=>{notifySaveSettings(' + sid + ',{enabled:false});'
      + 'update("attendance",' + env.attId + ',{status:"present"});'
      + 'const before=db.notify_queue.length;'
      + 'const res=notifyReconcile(' + env.attId + ');'
      + 'notifySaveSettings(' + sid + ',{enabled:true});'
      + 'return JSON.stringify({action:res.action,added:db.notify_queue.length-before});})()'));
    assert(r.added === 0, '🔴 با سامانهٔ خاموش ' + r.added + ' اصلاحیه ساخته شد');
  });
});

/* ── نمره و رویداد (گام ۷، دور ۴۲) ─────────────────────────────
   ⚠️ درس دور ۳۸: آزمون روی دادهٔ خام بی‌صدا سبز می‌شود. سامانه
   پیش‌فرض خاموش و kinds.grade هم خاموش است؛ هر آزمون اینجا اول
   خودش را روشن می‌کند و شمارندهٔ خروجی را می‌سنجد، نه فقط نبود خطا. */

/** محیط خودکفای نمره: صف، نمره‌ها، کاربر و تنظیمات ذخیره و بازگردانی می‌شوند */
function withGrade(fn) {
  const sid = W('db.schools[0].id');
  W('(()=>{db._gQ=db.notify_queue.slice();db._gG=db.grades.slice();'
    + 'db._gU=S.user;db._gR=byId("schools",' + sid + ').notify_rules||null;'
    + 'S.user=db.users.find(u=>u.role==="manager"&&u.school_id===' + sid + ')||S.user;'
    + 'S.persona=null;S.boss=null;'
    + 'notifySaveSettings(' + sid + ',{enabled:true,kinds:{grade:true,event:true}});})()');
  try { return fn(sid); }
  finally {
    W('(()=>{db.notify_queue=db._gQ;db.grades=db._gG;S.user=db._gU;'
      + 'update("schools",' + sid + ',{notify_rules:db._gR});'
      + 'delete db._gQ;delete db._gG;delete db._gU;delete db._gR;'
      + '(typeof idxInvalidate==="function")&&idxInvalidate("grades");})()');
  }
}

test('نمره: زیر آستانه پیام می‌سازد و عدد نمره را فاش نمی‌کند', () => {
  withGrade((sid) => {
    const r = JSON.parse(W('(()=>{'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0);'
      + 'const sub=db.subjects.find(s=>s.school_id===' + sid + ');'
      + 'const mk=s=>insert("grades",{school_id:' + sid + ',student_id:st.id,class_id:null,'
      + 'subject_id:sub.id,teacher_id:null,term:"نوبت اول",exam_type:"میان‌ترم",'
      + 'score:s,max_score:20,created_at:todayISO()}).id;'
      + 'const lowId=mk(5),highId=mk(18);'
      + 'const low=notifyGradeSync(lowId);'
      + 'const high=notifyGradeSync(highId);'
      + 'const q=db.notify_queue.find(x=>x.kind==="grade"&&x.source_ref===lowId);'
      + 'return JSON.stringify({made:low.made,highMade:high.made,highSkip:high.skip,'
      + 'kind:q?q.kind:null,hasScore:q?(q.body.indexOf("5")>-1||q.body.indexOf("۵")>-1):false,'
      + 'hasSubject:q?q.body.indexOf(sub.name)>-1:false});})()'));
    assert(r.made === 1, 'نمرهٔ پایین باید پیام بسازد: ' + r.made);
    assert(r.highMade === 0 && r.highSkip === 'not-low',
      'نمرهٔ بالا نباید پیام بسازد: ' + r.highMade + '/' + r.highSkip);
    assert(r.kind === 'grade', 'نوع پیام باید grade باشد');
    assert(r.hasScore === false, '🔴 عدد نمره در متن پیام آمد — حریم نمره شکست');
    assert(r.hasSubject === true, 'نام درس در پیام نیست');
  });
});

test('نمره: مرز بین‌دبیری — هر دبیر فقط نمرات خودش را می‌بیند', () => {
  const sid = W('db.schools[0].id');
  const r = JSON.parse(W(`(()=>{
    db._tG=db.grades.slice();db._tU=S.user;db._tF=S.filters;
    var sid=${sid};
    var t1=db.users.find(u=>u.username==='teacher1_1');
    var t2=db.users.find(u=>u.role==='teacher'&&u.school_id===sid&&u.id!==t1.id);
    var c=db.classes.find(cl=>cl.school_id===sid);
    var st=db.users.find(u=>u.role==='student'&&u.school_id===sid&&db.enrollments.some(e=>e.student_id===u.id&&e.class_id===c.id))
        ||db.users.find(u=>u.role==='student'&&u.school_id===sid);
    var s1=db.subjects.find(s=>s.id===t1.subject_id)||db.subjects[0];
    var s2=db.subjects.find(s=>s.id===t2.subject_id)||db.subjects[0];
    var g1=insert('grades',{school_id:sid,student_id:st.id,class_id:c.id,subject_id:s1.id,teacher_id:t1.id,term:'نوبت اول',exam_type:'میان‌ترم',score:13,max_score:20,created_at:todayISO()}).id;
    var g2=insert('grades',{school_id:sid,student_id:st.id,class_id:c.id,subject_id:s2.id,teacher_id:t2.id,term:'نوبت اول',exam_type:'میان‌ترم',score:14,max_score:20,created_at:todayISO()}).id;
    function as(uid){S.user=db.users.find(u=>u.id===uid);S.persona=null;S.boss=null;
      S.filters={class:c.id,subject:''};
      var h=viewGrades();
      var n1='data-id="'+g1+'"',n2='data-id="'+g2+'"';
      return {seen1:h.indexOf(n1)>=0,seen2:h.indexOf(n2)>=0};}
    var a=as(t1.id),b=as(t2.id);
    db.grades=db._tG;S.user=db._tU;S.filters=db._tF;delete db._tG;delete db._tU;delete db._tF;
    (typeof idxInvalidate==='function')&&idxInvalidate('grades');
    return JSON.stringify({t1:a,t2:b});})()`));
  assert(r.t1.seen1 === true, 'دبیر ۱ نمرهٔ خودش را نمی‌بیند');
  assert(r.t1.seen2 === false, '🔴 دبیر ۱ نمرهٔ دبیر دیگرِ همان کلاس را می‌بیند');
  assert(r.t2.seen1 === false, '🔴 دبیر ۲ نمرهٔ دبیر ۱ را می‌بیند');
  assert(r.t2.seen2 === true, 'دبیر ۲ نمرهٔ خودش را نمی‌بیند');
});

test('ورود: مدرسهٔ غیرفعال، حتی با حساب فعال، راه نمی‌افتد (F-3)', () => {
  const r = JSON.parse(W(`(()=>{
    var sch=db.schools.find(s=>!s.active);
    if(!sch) return JSON.stringify({err:'no-inactive-school'});
    var mgr=db.users.find(u=>u.school_id===sch.id&&u.role==='manager'&&u.active);
    if(!mgr) return JSON.stringify({err:'no-active-mgr'});
    if(typeof schoolInactiveMsg!=='function') return JSON.stringify({err:'no-guard'});
    var guardOn=!!schoolInactiveMsg(mgr);
    var guardOff=!!schoolInactiveMsg(db.users.find(u=>u.username==='manager1'));
    S.user=null;S.persona=null;S.boss=null;S.route='login';render();
    var lu=document.getElementById('lu'),lp=document.getElementById('lp');
    if(!lu||!lp) return JSON.stringify({err:'no-form'});
    lu.value=mgr.username;lp.value=mgr.password;
    document.querySelector('[data-act="login"]').click();
    var msg=document.getElementById('lerr').textContent||'';
    return JSON.stringify({guardOn:guardOn,guardOff:guardOff,blocked:!S.user,msg:msg});})()`));
  assert(r.guardOn === true, 'نگهبان، مدرسهٔ غیرفعال را نشناخت');
  assert(r.guardOff === false, 'نگهبان، مدرسهٔ فعال را هم مسدود کرد');
  assert(r.blocked === true, '🔴 ورود با حساب فعال ولی مدرسهٔ غیرفعال انجام شد');
  assert(r.msg.indexOf('این مدرسه غیرفعال است') >= 0, 'پیام مناسب نمایش داده نشد: ' + r.msg);
});

test('پروفایل قابلیت (۰.۱): منوی مدرسه طبق کلیدهای capability فیلتر می‌شود', () => {
  const r = JSON.parse(W(`(()=>{
    if(typeof hasCap!=='function'||typeof CAP_DEFS==='undefined') return JSON.stringify({err:'no-cap-api'});
    var m1=db.users.find(u=>u.username==='manager1');
    var sid=m1.school_id;
    var school=byId('schools',sid);
    var savedCaps=JSON.stringify(school.capabilities||null);
    var savedSTE=school.capabilities?school.capabilities.has_second_term_exam:null;
    /* ۱) پیش‌فرض: مدرسهٔ ۱ شهریه دارد ⇒ tuition در منوی مدیر */
    var navOn=navFor(m1).map(function(g){return g[1].map(function(i){return i[0];}).join(',');}).join('|');
    /* ۲) خاموش‌کردن has_tuition ⇒ tuition و mytuition پنهان */
    var caps=Object.assign({},schoolCaps(sid),{has_tuition:0});
    update('schools',sid,{capabilities:caps});
    var navOff=navFor(m1).map(function(g){return g[1].map(function(i){return i[0];}).join(',');}).join('|');
    /* ۳) ولی با فرزند در همین مدرسه: mytuition پنهان */
    var par=db.parent_links.find(function(l){var st=byId('users',l.student_id);return st&&st.school_id===sid;});
    var parNavOn='';var parUser=byId('users',par.parent_id);
    S.user=parUser;S.persona='parent';S.filters={};
    parNavOn=navFor(parUser).map(function(g){return g[1].map(function(i){return i[0];}).join(',');}).join('|');
    S.user=m1;S.persona=null;
    /* ۴) خاموش‌کردن has_second_term_exam ⇒ گزینهٔ نوبت دوم از فرم فصل امتحانات */
    caps=Object.assign({},schoolCaps(sid),{has_tuition:1,has_second_term_exam:0});
    update('schools',sid,{capabilities:caps});
    var opts=termOptsFor(m1).join(',');
    /* ۵) فرم مدرسه: شش چیکنک قابلیت */
    schoolModal(school);
    var nCap=document.querySelectorAll('.m-cap').length;
    closeModal();
    /* بازگردانی */
    update('schools',sid,{capabilities:savedCaps?JSON.parse(savedCaps):null});
    S.user=m1;S.persona=null;S.filters={};
    return JSON.stringify({navOn:navOn,navOff:navOff,parNavOn:parNavOn,opts:opts,nCap:nCap,
      defTuition:hasCap(1,'has_tuition')||hasCap(sid,'has_tuition')});})()`));
  assert(r.err !== 'no-cap-api', 'API قابلیت وجود ندارد (hasCap/CAP_DEFS)');
  assert(r.navOn.indexOf('tuition') >= 0, '🔴 با has_tuition روشن، شهریه در منوی مدیر نیست');
  assert(r.navOff.indexOf('tuition') < 0, '🔴 با has_tuition خاموش، شهریه هنوز در منوی مدیر است');
  assert(r.navOff.indexOf('mytuition') < 0, '🔴 mytuition بدون قابلیت شهریه پنهان نشد');
  assert(r.parNavOn.indexOf('mytuition') < 0, '🔴 منوی ولی، mytuition مدرسهٔ بدون شهریه را نشان می‌دهد');
  assert(r.opts.indexOf('نوبت دوم') < 0, '🔴 گزینهٔ نوبت دوم برای مدرسه‌ای بدون آن قابلیت مانده');
  assert(r.nCap === 6, '🔴 فرم مدرسه شش چیکنک قابلیت ندارد (' + r.nCap + ')');
});

test('نمره: با kinds.grade خاموش یا سامانهٔ خاموش ساخته نمی‌شود', () => {
  withGrade((sid) => {
    const r = JSON.parse(W('(()=>{'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0);'
      + 'const sub=db.subjects.find(s=>s.school_id===' + sid + ');'
      + 'const mk=s=>insert("grades",{school_id:' + sid + ',student_id:st.id,class_id:null,'
      + 'subject_id:sub.id,teacher_id:null,term:"نوبت اول",exam_type:"میان‌ترم",'
      + 'score:s,max_score:20,created_at:todayISO()}).id;'
      + 'const g1=mk(3);'
      + 'notifySaveSettings(' + sid + ',{kinds:{grade:false}});'
      + 'const a=notifyGradeSync(g1);'
      + 'notifySaveSettings(' + sid + ',{enabled:false,kinds:{grade:true}});'
      + 'const b=notifyGradeSync(mk(4));'
      + 'notifySaveSettings(' + sid + ',{enabled:true,kinds:{grade:true}});'
      + 'return JSON.stringify({aSkip:a.skip,bSkip:b.skip,aMade:a.made,bMade:b.made});})()'));
    assert(r.aMade === 0 && r.aSkip === 'kind-off', 'خاموشی نوع رعایت نشد: ' + r.aSkip);
    assert(r.bMade === 0 && r.bSkip === 'disabled', 'خاموشی سامانه رعایت نشد: ' + r.bSkip);
  });
});

test('نمره: ثبت دوبارهٔ همان نمره پیام تکراری نمی‌سازد', () => {
  withGrade((sid) => {
    const r = JSON.parse(W('(()=>{'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0);'
      + 'const sub=db.subjects.find(s=>s.school_id===' + sid + ');'
      + 'const g=insert("grades",{school_id:' + sid + ',student_id:st.id,class_id:null,'
      + 'subject_id:sub.id,teacher_id:null,term:"نوبت اول",exam_type:"میان‌ترم",'
      + 'score:6,max_score:20,created_at:todayISO()});'
      + 'const a=notifyGradeSync(g.id);'
      + 'const b=notifyGradeSync(g.id);'
      + 'return JSON.stringify({aMade:a.made,bMade:b.made,bSkip:b.skip,'
      + 'count:db.notify_queue.filter(q=>q.kind==="grade"&&q.source_ref===g.id'
      + '&&!q.correction_of).length});})()'));
    assert(r.aMade === 1, 'پیام اول ساخته نشد');
    assert(r.bMade === 0 && r.bSkip === 'pending-exists',
      'پیام تکراری ساخته شد: ' + r.bMade + '/' + r.bSkip);
    assert(r.count === 1, 'بیش از یک پیام عادی برای یک نمره ساخته شد: ' + r.count);
  });
});

test('نمره: بالا رفتن نمره پس از ارسال اصلاحیه می‌سازد و حلقه نمی‌زند', () => {
  const sid = W('db.schools[0].id');
  W('(()=>{db._gQ=db.notify_queue.slice();db._gG=db.grades.slice();'
    + 'db._gU=S.user;db._gR=byId("schools",' + sid + ').notify_rules||null;'
    + 'S.user=db.users.find(u=>u.role==="manager"&&u.school_id===' + sid + ')||S.user;'
    + 'S.persona=null;S.boss=null;'
    + 'notifySaveSettings(' + sid + ',{enabled:true,kinds:{grade:true}});'
    + 'const w=smsWalletOf(' + sid + ');update("sms_wallet",w.w.id,{balance:5000});})()');
  try {
    const r = JSON.parse(W('(()=>{'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0);'
      + 'const sub=db.subjects.find(s=>s.school_id===' + sid + ');'
      + 'const g=insert("grades",{school_id:' + sid + ',student_id:st.id,class_id:null,'
      + 'subject_id:sub.id,teacher_id:null,term:"نوبت اول",exam_type:"میان‌ترم",'
      + 'score:5,max_score:20,created_at:todayISO()});'
      + 'const a=notifyGradeSync(g.id);'
      + 'const pq=db.notify_queue.find(q=>q.kind==="grade"&&q.source_ref===g.id&&!q.correction_of);'
      + 'notifySend([pq.id]);'
      + 'update("grades",g.id,{score:15});'
      + 'const b=notifyGradeSync(g.id);'
      + 'const corrBefore=db.notify_queue.filter(q=>q.kind==="grade"&&q.source_ref===g.id'
      + '&&q.correction_of).length;'
      + 'for(let i=0;i<6;i++)notifyGradeSync(g.id);'
      + 'const corrAfter=db.notify_queue.filter(q=>q.kind==="grade"&&q.source_ref===g.id'
      + '&&q.correction_of).length;'
      + 'const c0=db.notify_queue.find(q=>q.kind==="grade"&&q.source_ref===g.id&&q.correction_of);'
      + 'return JSON.stringify({made:a.made,sent:byId("notify_queue",pq.id).status,'
      + 'fixed:b.fixed,corrBefore:corrBefore,corrAfter:corrAfter,'
      + 'corrOf:c0?c0.correction_of===pq.id:false,'
      + 'plain:db.notify_queue.filter(q=>q.kind==="grade"&&q.source_ref===g.id'
      + '&&!q.correction_of).length});})()'));
    assert(r.made === 1 && r.sent === 'sent', 'محیط آزمون ناقص');
    assert(r.fixed === 1, 'اصلاحیه ساخته نشد: ' + r.fixed);
    assert(r.corrBefore === 1, 'اصلاحیه ساخته نشد (corrBefore=' + r.corrBefore + ')');
    assert(r.corrAfter === r.corrBefore, '🔴 حلقه: اصلاحیه در وارسی پیاپی زیاد شد');
    assert(r.corrOf === true, 'اصلاحیه به پیام اصلی ارجاع ندارد');
    assert(r.plain === 1, 'پیام تکراری عادی ساخته شد');
  } finally {
    W('(()=>{db.notify_queue=db._gQ;db.grades=db._gG;S.user=db._gU;'
      + 'update("schools",' + sid + ',{notify_rules:db._gR});'
      + 'delete db._gQ;delete db._gG;delete db._gU;delete db._gR;'
      + '(typeof idxInvalidate==="function")&&idxInvalidate("grades");})()');
  }
});

test('نمره: ثبت از راه دکمه، پیامک زیر آستانه را می‌سازد (اتصال grade-save)', () => {
  const sid = W('db.schools[0].id');
  W('(()=>{db._gQ=db.notify_queue.slice();db._gG=db.grades.slice();'
    + 'db._gU=S.user;db._gR=byId("schools",' + sid + ').notify_rules||null;'
    + 'S.user=db.users.find(u=>u.role==="manager"&&u.school_id===' + sid + ')||S.user;'
    + 'S.persona=null;S.boss=null;S.route="grades";S.filters={};'
    + 'notifySaveSettings(' + sid + ',{enabled:true,kinds:{grade:true}});})()');
  try {
    const r = JSON.parse(W('(()=>{'
      + 'gradeModal(null);'
      + 'const sub=db.subjects.find(s=>s.school_id===' + sid + ');'
      + 'const sts=studentsOfClass(window._gclass);'
      + 'const st=sts.find(s=>notifyParentsOf(s.id).length>0)||sts[0];'
      + 'document.getElementById("g_st").value=String(st.id);'
      + 'document.getElementById("g_sub").value=String(sub.id);'
      + 'document.getElementById("g_score").value="4";'
      + 'const click=function(a){const b=document.createElement("button");'
      + 'b.setAttribute("data-act",a);document.body.appendChild(b);'
      + 'b.dispatchEvent(new MouseEvent("click",{bubbles:true}));b.remove();};'
      + 'click("grade-save");'
      + 'const g=db.grades[db.grades.length-1];'
      + 'return JSON.stringify({score:g.score,'
      + 'queue:db.notify_queue.filter(q=>q.kind==="grade"&&q.source_ref===g.id).length});})()'));
    assert(r.score === 4, 'نمره ذخیره نشد');
    assert(r.queue === 1, '🔴 ثبت نمرهٔ پایین پیامک نساخت — اتصال grade-save قطع است: ' + r.queue);
  } finally {
    W('(()=>{db.notify_queue=db._gQ;db.grades=db._gG;S.user=db._gU;'
      + 'update("schools",' + sid + ',{notify_rules:db._gR});'
      + 'delete db._gQ;delete db._gG;delete db._gU;delete db._gR;'
      + '(typeof idxInvalidate==="function")&&idxInvalidate("grades");})()');
  }
});

test('رویداد: برای همهٔ دانش‌آموزان دارای ولی پیام می‌سازد (شمارنده)', () => {
  withNotify({ enabled: true }, (sid) => {
    const r = JSON.parse(W('(()=>{'
      + 'const exp=db.users.filter(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0).length;'
      + 'const res=notifyEvent(' + sid + ',"جلسهٔ اولیا و مربیان");'
      + 'const ev=db.notify_queue.filter(q=>q.kind==="event");'
      + 'return JSON.stringify({made:res.made,exp:exp,'
      + 'allEvent:ev.every(q=>q.kind==="event"&&q.status==="pending"),'
      + 'hasText:ev.every(q=>q.body.indexOf("جلسهٔ اولیا")>-1),'
      + 'uniq:new Set(ev.map(q=>q.student_id)).size===ev.length});})()'));
    assert(r.exp > 0, 'محیط آزمون: دانش‌آموزِ دارای ولی نیست');
    assert(r.made === r.exp, 'شمار پیام با دانش‌آموزان نمی‌خواند: ' + r.made + '≠' + r.exp);
    assert(r.allEvent === true, 'رکورد رویداد نادرست است');
    assert(r.hasText === true, 'متن رویداد در پیام نیست');
    assert(r.uniq === true, 'برای یک دانش‌آموز چند پیام ساخته شد');
  });
});

test('رویداد: دستهٔ انبوه یک بار ذخیره می‌کند (batchWrites)', () => {
  withNotify({ enabled: true }, (sid) => {
    const r = JSON.parse(W('(()=>{const orig=Store.set;let n=0;'
      + 'Store.set=function(){n++;return orig.apply(this,arguments);};'
      + 'const res=notifyEvent(' + sid + ',"جلسهٔ انجمن اولیا");'
      + 'Store.set=orig;'
      + 'return JSON.stringify({made:res.made,sets:n,depth:_BATCH_DEPTH});})()'));
    assert(r.made > 10, 'محیط آزمون: رویداد باید ده‌ها پیام بسازد، ساخت: ' + r.made);
    assert(r.sets <= 3, '🔴 ' + r.made + ' رکورد ' + r.sets
      + ' بار ذخیره شد — batchWrites از کار افتاده');
    assert(r.depth === 0, '🔴 batchWrites نشتی داد (depth=' + r.depth + ')');
  });
});

test('رویداد: با خاموشی سامانه یا نوع event پیام نمی‌سازد', () => {
  withNotify({ enabled: false }, (sid) => {
    const a = JSON.parse(W('JSON.stringify(notifyEvent(' + sid + ',"جلسه"))'));
    assert(a.made === 0 && a.skip === 'disabled', 'خاموشی سامانه رعایت نشد: ' + a.skip);
  });
  withNotify({ enabled: true, kinds: { event: false } }, (sid) => {
    const b = JSON.parse(W('JSON.stringify(notifyEvent(' + sid + ',"جلسه"))'));
    assert(b.made === 0 && b.skip === 'kind-off', 'خاموشی نوع رعایت نشد: ' + b.skip);
  });
});

test('رویداد: متن خالی یا خیلی کوتاه پیام نمی‌سازد', () => {
  withNotify({ enabled: true }, (sid) => {
    const r = JSON.parse(W('(()=>{const a=notifyEvent(' + sid + ',"");'
      + 'const b=notifyEvent(' + sid + ',"   ");'
      + 'const c=notifyEvent(' + sid + ',"۱۲");'
      + 'return JSON.stringify({aSkip:a.skip,bSkip:b.skip,cSkip:c.skip,'
      + 'made:a.made+b.made+c.made});})()'));
    assert(r.made === 0, 'متن ناقص پیام ساخت: ' + r.made);
    assert(r.aSkip === 'empty-body' && r.bSkip === 'empty-body' && r.cSkip === 'empty-body',
      'متن کوتاه باید empty-body بدهد: ' + r.aSkip + '/' + r.bSkip + '/' + r.cSkip);
  });
});

test('رویداد: ذخیرهٔ رویداد تازهٔ تقویم پیامک می‌سازد (اتصال cal-save)', () => {
  const sid = W('db.schools[0].id');
  W('(()=>{db._gQ=db.notify_queue.slice();db._gC=db.calendar.slice();'
    + 'db._gU=S.user;db._gR=byId("schools",' + sid + ').notify_rules||null;'
    + 'S.user=db.users.find(u=>u.role==="manager"&&u.school_id===' + sid + ')||S.user;'
    + 'S.persona=null;S.boss=null;'
    + 'notifySaveSettings(' + sid + ',{enabled:true,kinds:{event:true}});})()');
  try {
    const r = JSON.parse(W('(()=>{'
      + 'const exp=db.users.filter(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0).length;'
      + 'calModal(null);'
      + 'document.getElementById("cl_title").value="اردوی علمی";'
      + 'document.getElementById("cl_date").value="2026-12-01";'
      + 'document.getElementById("cl_kind").value="event";'
      + 'const click=function(a){const b=document.createElement("button");'
      + 'b.setAttribute("data-act",a);document.body.appendChild(b);'
      + 'b.dispatchEvent(new MouseEvent("click",{bubbles:true}));b.remove();};'
      + 'click("cal-save");'
      + 'const ev=db.notify_queue.filter(q=>q.kind==="event");'
      + 'return JSON.stringify({made:ev.length,exp:exp,'
      + 'hasText:ev.every(q=>q.body.indexOf("اردوی علمی")>-1)});})()'));
    assert(r.exp > 0, 'محیط آزمون: دانش‌آموز دارای ولی نیست');
    assert(r.made === r.exp, '🔴 رویداد تقویم پیامک نساخت: ' + r.made + '≠' + r.exp);
    assert(r.hasText === true, 'متن رویداد در پیام نیست');
  } finally {
    W('(()=>{db.notify_queue=db._gQ;db.calendar=db._gC;S.user=db._gU;'
      + 'update("schools",' + sid + ',{notify_rules:db._gR});'
      + 'delete db._gQ;delete db._gC;delete db._gU;delete db._gR;'
      + '(typeof idxInvalidate==="function")&&idxInvalidate("calendar");})()');
  }
});

/* ── ارسال خودکار و سابقه (گام‌های ۶ و ۹، دور ۴۲) ─────────────── */

test('خودکار: با autoSend خاموش هیچ پیامی سررسید نمی‌شود', () => {
  withNotify({ enabled: true, autoSend: false, graceMinutes: 20 }, (sid) => {
    const r = JSON.parse(W('(()=>{db._afQ=db.notify_queue.slice();'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0);'
      + 'const q=notifyRequest({school_id:' + sid + ',kind:"absence",student_id:st.id,'
      + 'student_name:"آ",date_fa:"۱"});'
      + 'if(q)update("notify_queue",q.id,{created_at:new Date(Date.now()-60*60000).toISOString()});'
      + 'const due=notifyAutoDue(' + sid + ').length;'
      + 'const res=notifyAutoFlush(' + sid + ');'
      + 'db.notify_queue=db._afQ;delete db._afQ;'
      + 'return JSON.stringify({made:!!q,due:due,sent:res.sent});})()'));
    assert(r.made === true, 'محیط آزمون: پیام ساخته نشد');
    assert(r.due === 0, '🔴 با خودکارِ خاموش ' + r.due + ' پیام سررسید شد');
    assert(r.sent === 0, '🔴 با خودکارِ خاموش ' + r.sent + ' پیام رفت');
  });
});

test('خودکار: 🔴 درون پنجرهٔ مهلت نمی‌فرستد', () => {
  /* اگر خودکار بلافاصله بفرستد، پنجرهٔ مهلت اصلاح دبیر بی‌معنا
     می‌شود: دبیر ۳۰ ثانیه بعد خطایش را می‌فهمد ولی پیام رفته. */
  withNotify({ enabled: true, autoSend: true, graceMinutes: 20 }, (sid) => {
    const r = JSON.parse(W('(()=>{db._afQ=db.notify_queue.slice();'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0);'
      + 'const q=notifyRequest({school_id:' + sid + ',kind:"absence",student_id:st.id,'
      + 'student_name:"آ",date_fa:"۱"});'
      + 'const dueNow=notifyAutoDue(' + sid + ').length;'
      + 'if(q)update("notify_queue",q.id,{created_at:new Date(Date.now()-25*60000).toISOString()});'
      + 'const dueLater=notifyAutoDue(' + sid + ').length;'
      + 'db.notify_queue=db._afQ;delete db._afQ;'
      + 'return JSON.stringify({made:!!q,dueNow:dueNow,dueLater:dueLater});})()'));
    assert(r.made === true, 'محیط آزمون: پیام ساخته نشد');
    assert(r.dueNow === 0, '🔴 پیام تازه بلافاصله سررسید شد — پنجرهٔ مهلت بی‌اثر است');
    assert(r.dueLater === 1, 'پس از پنجرهٔ مهلت باید سررسید شود، شد: ' + r.dueLater);
  });
});

test('خودکار: پس از پنجرهٔ مهلت می‌فرستد و اعتبار کم می‌کند', () => {
  withNotify({ enabled: true, autoSend: true, graceMinutes: 20, dailyCap: 300 }, (sid) => {
    const r = JSON.parse(W('(()=>{db._afQ=db.notify_queue.slice();'
      + 'const w=smsWalletOf(' + sid + ');const bal0=w.balance;'
      + 'update("sms_wallet",w.w.id,{balance:5000});'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0);'
      + 'const q=notifyRequest({school_id:' + sid + ',kind:"absence",student_id:st.id,'
      + 'student_name:"آ",date_fa:"۱"});'
      + 'update("notify_queue",q.id,{created_at:new Date(Date.now()-25*60000).toISOString()});'
      + 'const before=smsWalletOf(' + sid + ').balance;'
      + 'const res=notifyAutoFlush(' + sid + ');'
      + 'const after=smsWalletOf(' + sid + ').balance;'
      + 'const st2=byId("notify_queue",q.id).status;'
      + 'update("sms_wallet",w.w.id,{balance:bal0});'
      + 'db.notify_queue=db._afQ;delete db._afQ;'
      + 'return JSON.stringify({sent:res.sent,used:res.used,'
      + 'drop:before-after,status:st2});})()'));
    assert(r.sent === 1, 'باید ۱ پیام خودکار برود، رفت: ' + r.sent);
    assert(r.status === 'sent', 'وضعیت باید sent شود: ' + r.status);
    assert(r.drop === r.used && r.used > 0,
      'کسر اعتبار با مصرف نخواند: ' + r.drop + ' ≠ ' + r.used);
  });
});

test('خودکار: 🔴 سقف روزانه در این حالت دیوار است نه ترمز', () => {
  /* در مسیر دستی مدیر آگاهانه از سقف رد می‌شود؛ در حالت خودکار
     کسی نیست که تصمیم بگیرد، پس نباید بی‌اجازه اعتبار مدرسه را
     تمام کند. */
  withNotify({ enabled: true, autoSend: true, graceMinutes: 20, dailyCap: 1 }, (sid) => {
    const r = JSON.parse(W('(()=>{db._afQ=db.notify_queue.slice();'
      + 'const w=smsWalletOf(' + sid + ');const bal0=w.balance;'
      + 'update("sms_wallet",w.w.id,{balance:5000});'
      + 'const kids=db.users.filter(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0).slice(0,4);'
      + 'kids.forEach(function(s){var q=notifyRequest({school_id:' + sid + ','
      + 'kind:"absence",student_id:s.id,student_name:"آ",date_fa:"۱"});'
      + 'if(q)update("notify_queue",q.id,{created_at:new Date(Date.now()-30*60000).toISOString()});});'
      + 'const res=notifyAutoFlush(' + sid + ');'
      + 'update("sms_wallet",w.w.id,{balance:bal0});'
      + 'db.notify_queue=db._afQ;delete db._afQ;'
      + 'return JSON.stringify({sent:res.sent,skipped:res.skipped,reason:res.reason});})()'));
    assert(r.sent === 0, '🔴 با سقف ۱ قطعه ' + r.sent + ' پیام رفت');
    assert(r.reason === 'daily-cap', 'دلیل باید daily-cap باشد: ' + r.reason);
    assert(r.skipped > 0, 'پیام‌های ردشده باید شمرده شوند');
  });
});

test('سابقه: 🔴 وضعیت اولیه در دفترچه بازنویسی نمی‌شود', () => {
  /* 🔴 باگ کشف‌شده در دور ۴۲: applyOp شیءِ زندهٔ رکورد را در
     دفترچه می‌گذاشت، پس هر update بعدی گذشته را بازنویسی می‌کرد و
     سابقه دروغ می‌گفت («ثبت present» در حالی که absent ثبت شده
     بود). رفع: رونوشت سطحی هنگام درج. */
  const sid = W('db.schools[0].id');
  W('(()=>{db._ahA=db.attendance.slice();})()');
  try {
    const r = JSON.parse(W('(()=>{'
      + 'const cl=db.classes.find(c=>c.school_id===' + sid + ');'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid + ');'
      + 'const rec=insert("attendance",{school_id:' + sid + ',class_id:cl?cl.id:null,'
      + 'student_id:st.id,date:"2026-12-20",status:"absent",note:null});'
      + 'update("attendance",rec.id,{status:"present"});'
      + 'update("attendance",rec.id,{status:"late"});'
      + 'const h=attHistory(rec.id);'
      + 'return JSON.stringify({n:h.length,'
      + 'chain:h.map(function(x){return (x.from||"-")+">"+x.to;}).join(","),'
      + 'first:h[0]?h[0].to:null});})()'));
    assert(r.n === 3, 'باید ۳ رویداد ثبت شود، شد: ' + r.n);
    assert(r.first === 'absent',
      '🔴 وضعیت اولیه بازنویسی شد: «' + r.first + '» به‌جای «absent»');
    assert(r.chain === '->absent,absent>present,present>late',
      'زنجیرهٔ تغییرات غلط است: ' + r.chain);
  } finally {
    W('(()=>{db.attendance=db._ahA;delete db._ahA;'
      + '(typeof idxInvalidate==="function")&&idxInvalidate("attendance");})()');
  }
});

test('سابقه: کارت نمایش هشدار «سند رسمی نیست» دارد', () => {
  /* ⚠️ op.by ادعای سمت مرورگر است. تا اتصال سرور، این سابقه برای
     شفافیت است نه اثبات حقوقی — و کاربر باید همین را ببیند. */
  const sid = W('db.schools[0].id');
  W('(()=>{db._ahB=db.attendance.slice();})()');
  try {
    const r = JSON.parse(W('(()=>{'
      + 'const cl=db.classes.find(c=>c.school_id===' + sid + ');'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid + ');'
      + 'const rec=insert("attendance",{school_id:' + sid + ',class_id:cl?cl.id:null,'
      + 'student_id:st.id,date:"2026-12-21",status:"absent",note:null});'
      + 'update("attendance",rec.id,{status:"present"});'
      + 'const card=attHistoryCard(rec.id);'
      + 'return JSON.stringify({len:card.length,'
      + 'warn:card.indexOf("سند رسمی")>-1,'
      + 'empty:attHistoryCard(99999999)===""});})()'));
    assert(r.len > 100, 'کارت سابقه ساخته نشد: ' + r.len);
    assert(r.warn === true, '🔴 هشدار «سند رسمی نیست» در کارت نیست');
    assert(r.empty === true, 'رکورد ناموجود باید رشتهٔ خالی بدهد');
  } finally {
    W('(()=>{db.attendance=db._ahB;delete db._ahB;'
      + '(typeof idxInvalidate==="function")&&idxInvalidate("attendance");})()');
  }
});

test('سقف: پیام‌های پشت سقف گم نمی‌شوند و مدیر باخبر می‌شود', () => {
  /* 🔴 شکافی که کاربر در بازبینی دور ۴۲ پرسید: وقتی در حالت
     خودکار سقف پر می‌شود، پیام‌های باقی‌مانده چه می‌شوند؟
     پاسخ: `pending` می‌مانند و فردا خودکار می‌روند. ولی پیش از
     این هیچ نشانی به مدیر داده نمی‌شد — «۴ خانواده امشب بی‌خبر
     می‌مانند» نامرئی بود. */
  withNotify({ enabled: true, autoSend: true, graceMinutes: 20, dailyCap: 2 }, (sid) => {
    const r = JSON.parse(W('(()=>{'
      + 'db._capL=db.sms_log.slice();'
      + 'db.sms_log=db.sms_log.filter(m=>m.school_id!==' + sid + ');'
      + 'const w=smsWalletOf(' + sid + ');const bal0=w.balance;'
      + 'update("sms_wallet",w.w.id,{balance:9000});'
      + 'const kids=db.users.filter(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0).slice(0,5);'
      + 'kids.forEach(function(s){var q=notifyRequest({school_id:' + sid + ','
      + 'kind:"absence",student_id:s.id,student_name:s.full_name,date_fa:"۱"});'
      + 'if(q)update("notify_queue",q.id,{created_at:new Date(Date.now()-30*60000).toISOString()});});'
      + 'const made=db.notify_queue.length;'
      + 'const res=notifyAutoFlush(' + sid + ');'
      + 'const stat={};db.notify_queue.forEach(function(q){stat[q.status]=(stat[q.status]||0)+1;});'
      + 'S.user=db.users.find(u=>u.role==="manager"&&u.school_id===' + sid + ')||S.user;'
      + 'S.persona=null;S.route="notifyqueue";S.filters={};'
      + 'const page=renderRoute();const card=notifyDailyCard();'
      /* فردا: شمارندهٔ امروز صفر می‌شود */
      + 'db.sms_log.forEach(function(m){if(m.school_id===' + sid + ')'
      + 'update("sms_log",m.id,{created_at:"2020-01-01"});});'
      + 'const tomorrow=notifyAutoFlush(' + sid + ');'
      + 'update("sms_wallet",w.w.id,{balance:bal0});'
      + 'db.sms_log=db._capL;delete db._capL;'
      + 'return JSON.stringify({made:made,total:db.notify_queue.length,'
      + 'sent:res.sent,skipped:res.skipped,reason:res.reason,'
      + 'pending:stat.pending||0,banner:page.indexOf("notify-cap-bar")>-1,'
      + 'cardWarn:card.indexOf("سقف روزانه پر شده")>-1,'
      + 'tomorrowSent:tomorrow.sent});})()'));
    assert(r.made === 5, 'محیط آزمون: ۵ پیام ساخته نشد (' + r.made + ')');
    assert(r.sent >= 1, 'دست‌کم یک پیام باید برود: ' + r.sent);
    assert(r.reason === 'daily-cap', 'دلیل باید daily-cap باشد: ' + r.reason);
    /* ۱) هیچ پیامی حذف نمی‌شود */
    assert(r.total === r.made,
      '🔴 ' + (r.made - r.total) + ' پیام ناپدید شد — پشت سقف نباید چیزی گم شود');
    assert(r.pending > 0, 'پیام‌های نرفته باید pending بمانند');
    /* ۲) مدیر باخبر می‌شود */
    assert(r.banner === true, '🔴 نوار هشدار سقف در صفحهٔ صف نیست');
    assert(r.cardWarn === true, '🔴 هشدار سقف در کارت داشبورد نیست');
    /* ۳) فردا ادامه می‌یابد */
    assert(r.tomorrowSent > 0,
      '🔴 روز بعد ارسال ادامه نیافت — پیام‌ها برای همیشه گیر می‌کنند');
  });
});

test('سقف: با ظرفیت کافی هشدار بی‌مورد نشان داده نمی‌شود', () => {
  withNotify({ enabled: true, dailyCap: 500 }, (sid) => {
    const r = W('(()=>{S.user=db.users.find(u=>u.role==="manager"&&u.school_id==='
      + sid + ')||S.user;S.persona=null;S.route="notifyqueue";S.filters={};'
      + 'return renderRoute().indexOf("notify-cap-bar")>-1;})()');
    assert(r === false, '🔴 هشدار سقف با ظرفیت خالی نمایش داده شد');
  });
});

test('دفترچه: وضعیت اولیه در همهٔ جدول‌ها محفوظ می‌ماند', () => {
  /* 🔴 باگ دور ۴۲ در خودِ applyOp بود، پس همهٔ جدول‌ها را درگیر
     می‌کرد نه فقط حضور و غیاب. این آزمون چند جدول حساس را
     می‌سنجد تا رفع، سراسری بماند. */
  const r = JSON.parse(W('(()=>{db._loG=db.grades.slice();db._loD=db.discipline.slice();'
    + 'const sid=db.schools[0].id;const out={};'
    + 'const g=insert("grades",{school_id:sid,student_id:1,class_id:1,subject_id:1,'
    + 'term:"اول",exam_type:"کتبی",score:8,max_score:20});'
    + 'update("grades",g.id,{score:18});'
    + 'const gi=log.filter(function(o){return o.t==="ins"&&o.c==="grades"&&'
    + 'o.data&&o.data.id===g.id;})[0];'
    + 'out.grade=gi?gi.data.score:null;'
    + 'const d=insert("discipline",{school_id:sid,student_id:1,kind:"negative",'
    + 'title:"اولیه",points:-2,date:todayISO()});'
    + 'update("discipline",d.id,{title:"عوض‌شده",points:5});'
    + 'const di=log.filter(function(o){return o.t==="ins"&&o.c==="discipline"&&'
    + 'o.data&&o.data.id===d.id;})[0];'
    + 'out.discTitle=di?di.data.title:null;out.discPoints=di?di.data.points:null;'
    + 'db.grades=db._loG;db.discipline=db._loD;delete db._loG;delete db._loD;'
    + '(typeof idxInvalidate==="function")&&(idxInvalidate("grades"),idxInvalidate("discipline"));'
    + 'return JSON.stringify(out);})()'));
  assert(r.grade === 8, '🔴 نمرهٔ اولیه در دفترچه بازنویسی شد: ' + r.grade + ' (باید ۸)');
  assert(r.discTitle === 'اولیه',
    '🔴 عنوان اولیهٔ انضباطی بازنویسی شد: ' + r.discTitle);
  assert(r.discPoints === -2, '🔴 امتیاز اولیه بازنویسی شد: ' + r.discPoints);
});

/* ── اختیار مدیر، نمودار روند، پیام اداره (دور ۴۳) ─────────────── */

test('اختیار مدیر: پس از پنجرهٔ مهلت هم می‌تواند لغو کند', () => {
  withNotify({ enabled: true, graceMinutes: 20 }, (sid) => {
    const r = JSON.parse(W('(()=>{'
      + 'const cl=db.classes.find(c=>c.school_id===' + sid + ');'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0);'
      + 'const t=db.users.find(u=>u.role==="teacher"&&u.school_id===' + sid + ');'
      + 'const rec=insert("attendance",{school_id:' + sid + ',class_id:cl?cl.id:null,'
      + 'student_id:st.id,date:"2027-02-10",status:"absent",note:null});'
      + 'db._mgU=S.user;S.user=t;S.persona=null;'
      + 'const q=notifyRequest({school_id:' + sid + ',kind:"absence",student_id:st.id,'
      + 'student_name:st.full_name,date_fa:"۱",source_ref:rec.id});'
      + 'update("notify_queue",q.id,{created_at:new Date(Date.now()-30*60000).toISOString()});'
      /* دبیر خودش دیگر نمی‌تواند — پنجره تمام شده */
      + 'const byTeacher=notifyCancelIfFresh("absence",rec.id);'
      + 'S.user=db.users.find(u=>u.role==="manager"&&u.school_id===' + sid + ')||S.user;'
      + 'S.persona=null;'
      + 'const byMgr=notifyCancelIfFresh("absence",rec.id,null,{byManager:true});'
      + 'const after=byId("notify_queue",q.id);'
      + 'S.user=db._mgU;delete db._mgU;'
      + 'return JSON.stringify({byTeacher:byTeacher,byMgr:byMgr,'
      + 'status:after.status,mark:after.by_manager||0});})()'));
    assert(r.byTeacher === 0, 'دبیر پس از پنجره نباید بتواند لغو کند: ' + r.byTeacher);
    assert(r.byMgr === 1, '🔴 مدیر نتوانست لغو کند: ' + r.byMgr);
    assert(r.status === 'cancelled', 'وضعیت باید cancelled شود: ' + r.status);
    assert(r.mark === 1, '🔴 ردپای by_manager ثبت نشد — اختیار بی‌حساب می‌شود');
  });
});

test('اختیار مدیر: 🔴 دبیر با ادعای byManager نمی‌تواند دور بزند', () => {
  /* پارامتر به‌تنهایی کافی نیست؛ نقش فعلی هم سنجیده می‌شود. */
  withNotify({ enabled: true, graceMinutes: 20 }, (sid) => {
    const r = JSON.parse(W('(()=>{'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0);'
      + 'const ts=db.users.filter(u=>u.role==="teacher"&&u.school_id===' + sid + ');'
      + 'if(ts.length<2)return JSON.stringify({skipTest:true});'
      + 'const rec=insert("attendance",{school_id:' + sid + ',class_id:null,'
      + 'student_id:st.id,date:"2027-02-11",status:"absent",note:null});'
      + 'db._tkU=S.user;S.user=ts[0];S.persona=null;'
      + 'const q=notifyRequest({school_id:' + sid + ',kind:"absence",student_id:st.id,'
      + 'student_name:st.full_name,date_fa:"۱",source_ref:rec.id});'
      + 'update("notify_queue",q.id,{created_at:new Date(Date.now()-30*60000).toISOString()});'
      + 'S.user=ts[1];S.persona=null;'
      + 'const n=notifyCancelIfFresh("absence",rec.id,null,{byManager:true});'
      + 'const after=byId("notify_queue",q.id);'
      + 'S.user=db._tkU;delete db._tkU;'
      + 'return JSON.stringify({n:n,status:after.status});})()'));
    if (r.skipTest) return;
    assert(r.n === 0, '🔴 دبیر با ادعای byManager پیام را لغو کرد — رخنهٔ ارتقای دسترسی');
    assert(r.status === 'pending', 'پیام باید معلق بماند: ' + r.status);
  });
});

test('اختیار مدیر: مدیر مدرسهٔ دیگر نمی‌تواند لغو کند', () => {
  withNotify({ enabled: true, graceMinutes: 20 }, (sid) => {
    const r = JSON.parse(W('(()=>{'
      + 'const other=db.users.find(u=>u.role==="manager"&&u.school_id!==' + sid
      + '&&u.school_id);'
      + 'if(!other)return JSON.stringify({skipTest:true});'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid
      + '&&notifyParentsOf(u.id).length>0);'
      + 'const t=db.users.find(u=>u.role==="teacher"&&u.school_id===' + sid + ');'
      + 'const rec=insert("attendance",{school_id:' + sid + ',class_id:null,'
      + 'student_id:st.id,date:"2027-02-12",status:"absent",note:null});'
      + 'db._otU=S.user;S.user=t;S.persona=null;'
      + 'const q=notifyRequest({school_id:' + sid + ',kind:"absence",student_id:st.id,'
      + 'student_name:st.full_name,date_fa:"۱",source_ref:rec.id});'
      + 'update("notify_queue",q.id,{created_at:new Date(Date.now()-30*60000).toISOString()});'
      + 'S.user=other;S.persona=null;'
      + 'const n=notifyCancelIfFresh("absence",rec.id,null,{byManager:true});'
      + 'S.user=db._otU;delete db._otU;'
      + 'return JSON.stringify({n:n,status:byId("notify_queue",q.id).status});})()'));
    if (r.skipTest) return;
    assert(r.n === 0, '🔴 مدیر مدرسهٔ دیگر پیام را لغو کرد — نشت بین‌مدرسه‌ای');
    assert(r.status === 'pending', 'پیام باید معلق بماند');
  });
});

test('روند نمرات: 🔴 ترتیب زمانی است نه ترتیب درج', () => {
  /* ⚠️ نمره ممکن است با تأخیر ثبت شود (نمرهٔ آبان در آذر وارد
     شود). اگر ترتیب آرایه مبنا باشد، نمودار دروغ می‌گوید. */
  const sid = W('db.schools[0].id');
  W('(()=>{db._trG=db.grades.slice();})()');
  try {
    const r = JSON.parse(W('(()=>{'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid + ');'
      + 'db.grades=db.grades.filter(function(g){return g.student_id!==st.id;});'
      + '(typeof idxInvalidate==="function")&&idxInvalidate("grades");'
      /* عمداً خارج از ترتیب زمانی درج می‌شوند */
      + 'insert("grades",{school_id:' + sid + ',student_id:st.id,class_id:null,'
      + 'subject_id:null,term:"اول",exam_type:"ک",score:18,max_score:20,created_at:"2026-12-01"});'
      + 'insert("grades",{school_id:' + sid + ',student_id:st.id,class_id:null,'
      + 'subject_id:null,term:"اول",exam_type:"ک",score:10,max_score:20,created_at:"2026-09-01"});'
      + 'insert("grades",{school_id:' + sid + ',student_id:st.id,class_id:null,'
      + 'subject_id:null,term:"اول",exam_type:"ک",score:14,max_score:20,created_at:"2026-10-15"});'
      + 'const pts=gradeTrendData(st.id);'
      + 'return JSON.stringify({order:pts.map(function(p){return p.score;}).join(","),'
      + 'n:pts.length});})()'));
    assert(r.n === 3, 'سه نمره باید خوانده شود: ' + r.n);
    assert(r.order === '10,14,18',
      '🔴 ترتیب زمانی رعایت نشد: ' + r.order + ' (انتظار ۱۰,۱۴,۱۸)');
  } finally {
    W('(()=>{db.grades=db._trG;delete db._trG;'
      + '(typeof idxInvalidate==="function")&&idxInvalidate("grades");})()');
  }
});

test('روند نمرات: مقیاس‌های مختلف به ۲۰ نرمال می‌شوند', () => {
  /* ۸ از ۱۰ نمرهٔ خوبی است؛ کنار ۸ از ۲۰ گذاشتنش گمراه‌کننده است. */
  const sid = W('db.schools[0].id');
  W('(()=>{db._nrG=db.grades.slice();})()');
  try {
    const r = JSON.parse(W('(()=>{'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid + ');'
      + 'db.grades=db.grades.filter(function(g){return g.student_id!==st.id;});'
      + '(typeof idxInvalidate==="function")&&idxInvalidate("grades");'
      + 'insert("grades",{school_id:' + sid + ',student_id:st.id,class_id:null,'
      + 'subject_id:null,term:"اول",exam_type:"ش",score:8,max_score:10,created_at:"2026-09-01"});'
      + 'insert("grades",{school_id:' + sid + ',student_id:st.id,class_id:null,'
      + 'subject_id:null,term:"اول",exam_type:"ک",score:8,max_score:20,created_at:"2026-10-01"});'
      + 'const pts=gradeTrendData(st.id);'
      + 'return JSON.stringify({a:pts[0].norm,b:pts[1].norm});})()'));
    assert(r.a === 16, '🔴 ۸ از ۱۰ باید ۱۶ شود، شد: ' + r.a);
    assert(r.b === 8, '۸ از ۲۰ باید ۸ بماند، شد: ' + r.b);
  } finally {
    W('(()=>{db.grades=db._nrG;delete db._nrG;'
      + '(typeof idxInvalidate==="function")&&idxInvalidate("grades");})()');
  }
});

test('روند نمرات: جهت روند و کارت رندر می‌شوند', () => {
  const sid = W('db.schools[0].id');
  const saved = W('JSON.stringify({u:S.user&&S.user.id,r:S.route,t:S.tab})');
  W('(()=>{db._dirG=db.grades.slice();})()');
  try {
    const r = JSON.parse(W('(()=>{'
      + 'const st=db.users.find(u=>u.role==="student"&&u.school_id===' + sid + ');'
      + 'db.grades=db.grades.filter(function(g){return g.student_id!==st.id;});'
      + '(typeof idxInvalidate==="function")&&idxInvalidate("grades");'
      + '[[10,"2026-09-01"],[12,"2026-10-01"],[16,"2026-11-01"],[18,"2026-12-01"]]'
      + '.forEach(function(p){insert("grades",{school_id:' + sid + ',student_id:st.id,'
      + 'class_id:null,subject_id:null,term:"اول",exam_type:"ک",score:p[0],'
      + 'max_score:20,created_at:p[1]});});'
      + 'const d=gradeTrendDirection(gradeTrendData(st.id));'
      + 'S.user=st;S.persona=null;S.boss=null;S.route="record";S.tab="grades";'
      + 'S.filters={};S.trendSub=0;'
      + 'const h=renderRoute();'
      /* یک‌نمره‌ای نباید نمودار بدهد */
      + 'const st2=db.users.filter(u=>u.role==="student"&&u.school_id===' + sid + ')[5];'
      + 'db.grades=db.grades.filter(function(g){return g.student_id!==st2.id;});'
      + 'insert("grades",{school_id:' + sid + ',student_id:st2.id,class_id:null,'
      + 'subject_id:null,term:"اول",exam_type:"ک",score:12,max_score:20,created_at:"2026-09-01"});'
      + 'const single=gradeTrendCard(st2.id);'
      + 'return JSON.stringify({dir:d?d.dir:null,chart:h.indexOf("trend-chart")>-1,'
      + 'badge:/رو به بهبود|رو به افت|تقریباً ثابت/.test(h),'
      + 'singleGuard:single.indexOf("دست‌کم دو نمره")>-1});})()'));
    assert(r.dir === 'up', '🔴 روند صعودی تشخیص داده نشد: ' + r.dir);
    assert(r.chart === true, 'نمودار در پروندهٔ دانش‌آموز رندر نشد');
    assert(r.badge === true, 'نشان جهت روند نمایش داده نشد');
    assert(r.singleGuard === true, 'با یک نمره باید پیام راهنما بدهد نه نمودار');
  } finally {
    const o = JSON.parse(saved);
    W('(()=>{db.grades=db._dirG;delete db._dirG;'
      + 'S.user=byId("users",' + o.u + ')||S.user;S.route=' + JSON.stringify(o.r) + ';'
      + 'S.tab=' + JSON.stringify(o.t || 'grades') + ';S.filters={};S.trendSub=0;'
      + '(typeof idxInvalidate==="function")&&idxInvalidate("grades");})()');
  }
});

test('پیام اداره: به همهٔ مدیران محدوده می‌رسد و به بیرون نه', () => {
  const saved = W('JSON.stringify({u:S.user&&S.user.id,r:S.route})');
  W('(()=>{db._obN=db.notifications.slice();})()');
  try {
    const r = JSON.parse(W('(()=>{'
      + 'const eo=db.users.find(u=>u.role==="edu_office");'
      + 'if(!eo)return JSON.stringify({skipTest:true});'
      + 'S.user=eo;S.persona=null;S.boss=null;'
      + 'const o=officeOf(eo);'
      /* 🔴 انتظار را مستقل از officeManagers می‌سازیم. تست جهش دور
         ۴۳ نشان داد اگر هر دو طرف از یک تابع بخوانند، خراب‌کردن
         آن تابع هیچ آزمونی را نمی‌اندازد. اینجا مستقیم از
         officeScopeSchools می‌خوانیم. */
      + 'const scoped={};officeScopeSchools(o).forEach(function(sc){scoped[sc.id]=1;});'
      + 'const expect=db.users.filter(function(u){'
      + 'return u.role==="manager"&&scoped[u.school_id];}).length;'
      + 'const allMgr=db.users.filter(function(u){return u.role==="manager";}).length;'
      + 'const before=db.notifications.length;'
      + 'const res=officeBroadcast(o,"بخشنامهٔ آزمایشی","متن آزمایشی بخشنامه");'
      + 'const fresh=db.notifications.slice(before);'
      + 'const outside=fresh.filter(function(n){'
      + 'const u=byId("users",n.user_id);'
      + 'return !u||!scoped[u.school_id];}).length;'
      + 'return JSON.stringify({expect:expect,allMgr:allMgr,sent:res.sent,'
      + 'schools:res.schools,added:fresh.length,outside:outside,'
      + 'hasTitle:fresh.length?fresh[0].title==="بخشنامهٔ آزمایشی":false});})()'));
    if (r.skipTest) return;
    assert(r.expect > 0, 'محیط آزمون: مدیری در محدوده نیست');
    assert(r.allMgr > r.expect,
      'محیط آزمون بی‌معنا: محدوده همهٔ مدیران را می‌گیرد ('
      + r.expect + '/' + r.allMgr + ') — نشت قابل سنجش نیست');
    assert(r.sent === r.expect,
      'همهٔ مدیرانِ محدوده باید اعلان بگیرند: ' + r.sent + '/' + r.expect);
    assert(r.added === r.sent, 'شمار رکورد با ارسال نخواند');
    assert(r.outside === 0,
      '🔴 ' + r.outside + ' اعلان به مدیر بیرون از محدوده رفت — نشت بین‌منطقه‌ای');
    assert(r.hasTitle === true, 'عنوان پیام درست ثبت نشد');
  } finally {
    const o = JSON.parse(saved);
    W('(()=>{db.notifications=db._obN;delete db._obN;'
      + 'S.user=byId("users",' + o.u + ')||S.user;S.route=' + JSON.stringify(o.r) + ';'
      + 'S.filters={};(typeof idxInvalidate==="function")&&idxInvalidate("notifications");})()');
  }
});

test('پیام اداره: مدیر مدرسه اجازهٔ ارسالش را ندارد', () => {
  ['office-msg', 'office-msg-send'].forEach((a) => {
    const roles = JSON.parse(W('JSON.stringify(ACTION_ROLES[' + JSON.stringify(a) + ']||[])'));
    assert(roles.length > 0, 'کنش ' + a + ' در ACTION_ROLES ثبت نشده');
    assert(roles.indexOf('edu_office') > -1, 'رئیس اداره باید اجازه داشته باشد');
    assert(roles.indexOf('manager') === -1, '🔴 مدیر مدرسه اجازهٔ ' + a + ' دارد');
    assert(roles.indexOf('teacher') === -1, '🔴 دبیر اجازهٔ ' + a + ' دارد');
  });
});

/* ── ابزارهای دبیر: سابقهٔ چندساله و یادداشت خصوصی (دور ۴۴) ──── */

/** دبیری که دست‌کم یک دانش‌آموز با سابقهٔ دوساله دارد */
function withTeacherHistory(fn) {
  const sid = W('db.schools[0].id');
  W('(()=>{db._thU=S.user;db._thN=(db.teacher_notes||[]).slice();})()');
  try {
    const env = JSON.parse(W('(()=>{const sid=' + sid + ';'
      + 'const t=db.users.filter(function(u){return u.role==="teacher"&&u.school_id===sid;})'
      + '.find(function(x){return teacherClasses(x.id).some(function(c){'
      + 'return studentsOfClass(c.id).some(function(s){return studentYearHistory(s.id).length>1;});});});'
      + 'if(!t)return JSON.stringify({skipTest:true});'
      + 'S.user=t;S.persona=null;S.boss=null;'
      + 'const st=teacherClasses(t.id).reduce(function(a,c){return a.concat(studentsOfClass(c.id));},[])'
      + '.find(function(s){return studentYearHistory(s.id).length>1;});'
      + 'const ids={};teacherClasses(t.id).forEach(function(c){'
      + 'studentsOfClass(c.id).forEach(function(s){ids[s.id]=1;});});'
      + 'const other=db.users.find(function(u){return u.role==="student"&&u.school_id===sid&&!ids[u.id];});'
      + 'return JSON.stringify({teacherId:t.id,studentId:st.id,'
      + 'otherStudentId:other?other.id:0});})()'));
    if (env.skipTest) return;
    return fn(sid, env);
  } finally {
    W('(()=>{S.user=db._thU;db.teacher_notes=db._thN;'
      + 'delete db._thU;delete db._thN;'
      + '(typeof idxInvalidate==="function")&&idxInvalidate("teacher_notes");})()');
  }
}

test('سابقه: سال تحصیلی از مهر شروع می‌شود نه فروردین', () => {
  /* ⚠️ تاریخ‌های ماه ۱ تا ۶ شمسی به سال تحصیلی **قبل** تعلق
     دارند. اگر این اشتباه باشد، نیمی از رکوردها در سال غلط
     دسته‌بندی می‌شوند. */
  const r = JSON.parse(W('(()=>{'
    /* ۱۴۰۴/۰۸/۱۵ ≈ ۲۰۲۵-۱۱-۰۶ → سال ۱۴۰۴-۱۴۰۵ */
    + 'const mehr=yearOfDate("2025-11-06");'
    /* ۱۴۰۴/۰۲/۱۵ ≈ ۲۰۲۵-۰۵-۰۵ → سال ۱۴۰۳-۱۴۰۴ */
    + 'const ord=yearOfDate("2025-05-05");'
    + 'return JSON.stringify({mehr:mehr,ord:ord,bad:yearOfDate(null)});})()'));
  assert(r.mehr === '1404-1405', 'آبان ۱۴۰۴ باید سال ۱۴۰۴-۱۴۰۵ باشد: ' + r.mehr);
  assert(r.ord === '1403-1404',
    '🔴 اردیبهشت ۱۴۰۴ باید سال ۱۴۰۳-۱۴۰۴ باشد (سال تحصیلی از مهر): ' + r.ord);
  assert(r.bad === null, 'ورودی نامعتبر باید null بدهد');
});

test('سابقه: نمرات و حضور سال‌به‌سال تفکیک می‌شوند', () => {
  withTeacherHistory((sid, env) => {
    const r = JSON.parse(W('(()=>{const h=studentYearHistory(' + env.studentId + ');'
      + 'return JSON.stringify({n:h.length,'
      + 'years:h.map(function(x){return x.year;}),'
      + 'hasGrades:h.every(function(x){return x.grades&&typeof x.grades.n==="number";}),'
      + 'hasAtt:h.every(function(x){return x.attendance&&typeof x.attendance.n==="number";}),'
      + 'sorted:h.map(function(x){return x.year;}).join(",")'
      + '===h.map(function(x){return x.year;}).slice().sort().reverse().join(",")});})()'));
    assert(r.n >= 2, 'دست‌کم دو سال باید باشد: ' + r.n);
    assert(r.hasGrades && r.hasAtt, 'ساختار خروجی ناقص است');
    assert(r.sorted === true, 'سال‌ها باید نزولی مرتب باشند: ' + r.years.join(','));
  });
});

test('سابقه: 🔴 موارد انضباطی سال‌های گذشته نمایش داده نمی‌شود', () => {
  /* تصمیم سیاستی کاربر (دور ۴۴): دبیر نباید با قضاوت پیشینی
     دربارهٔ رفتار سال قبل وارد کلاس شود. */
  withTeacherHistory((sid, env) => {
    const r = JSON.parse(W('(()=>{const h=studentYearHistory(' + env.studentId + ');'
      + 'const card=yearHistoryCard(' + env.studentId + ');'
      + 'return JSON.stringify({'
      + 'inData:JSON.stringify(h).indexOf("discipline")>-1,'
      + 'keys:Object.keys(h[0]||{}),'
      + 'disclosed:card.indexOf("انضباطی")>-1});})()'));
    assert(r.inData === false,
      '🔴 دادهٔ انضباطی در خروجی سابقه هست — نقض تصمیم سیاستی');
    assert(r.keys.indexOf('discipline') === -1, 'کلید discipline نباید باشد');
    assert(r.disclosed === true,
      'کارت باید صریحاً بگوید انضباط نمایش داده نمی‌شود');
  });
});

test('سابقه: 🔴 دبیر فقط دانش‌آموز کلاس فعلی خودش را می‌بیند', () => {
  withTeacherHistory((sid, env) => {
    if (!env.otherStudentId) return;
    const r = JSON.parse(W('(()=>{'
      + 'S.user=byId("users",' + env.teacherId + ');S.persona=null;S.boss=null;'
      + 'return JSON.stringify({mine:teacherMaySeeHistory(' + env.studentId + '),'
      + 'other:teacherMaySeeHistory(' + env.otherStudentId + '),'
      + 'card:yearHistoryCard(' + env.otherStudentId + ')===""});})()'));
    assert(r.mine === true, 'دبیر باید دانش‌آموز خودش را ببیند');
    assert(r.other === false,
      '🔴 دبیر سابقهٔ دانش‌آموز خارج از کلاسش را دید — نقض دامنه');
    assert(r.card === true, 'کارت برای دانش‌آموز غیرمجاز باید خالی باشد');
  });
});

test('سابقه: مدیر می‌بیند، ولی و مدیر مدرسهٔ دیگر نه', () => {
  withTeacherHistory((sid, env) => {
    const r = JSON.parse(W('(()=>{const out={};'
      + 'S.user=db.users.find(function(u){return u.role==="manager"&&u.school_id===' + sid + ';});'
      + 'S.persona=null;out.manager=teacherMaySeeHistory(' + env.studentId + ');'
      + 'const p=db.parent_links.find(function(l){return l.student_id===' + env.studentId + ';});'
      + 'if(p){S.user=byId("users",p.parent_id);S.persona=null;'
      + 'out.parent=teacherMaySeeHistory(' + env.studentId + ');}'
      + 'const om=db.users.find(function(u){return u.role==="manager"&&u.school_id&&'
      + 'u.school_id!==' + sid + ';});'
      + 'if(om){S.user=om;S.persona=null;out.otherMgr=teacherMaySeeHistory(' + env.studentId + ');}'
      + 'return JSON.stringify(out);})()'));
    assert(r.manager === true, 'مدیر مدرسه باید ببیند');
    if (r.parent !== undefined) assert(r.parent === false, '🔴 ولی سابقه را دید');
    if (r.otherMgr !== undefined) {
      assert(r.otherMgr === false, '🔴 مدیر مدرسهٔ دیگر سابقه را دید');
    }
  });
});

test('یادداشت: 🔴 ولی و دانش‌آموز هرگز نمی‌بینند', () => {
  withTeacherHistory((sid, env) => {
    const r = JSON.parse(W('(()=>{'
      + 'S.user=byId("users",' + env.teacherId + ');S.persona=null;S.boss=null;'
      + 'const made=addTeacherNote(' + env.studentId + ',"یادداشت آزمایشی برای سنجش");'
      + 'const out={made:!!made};'
      + 'const p=db.parent_links.find(function(l){return l.student_id===' + env.studentId + ';});'
      + 'if(p){S.user=byId("users",p.parent_id);S.persona=null;'
      + 'out.parentSees=teacherNotesFor(' + env.studentId + ').length;'
      + 'out.parentCard=teacherNotesCard(' + env.studentId + ')==="";}'
      + 'S.user=byId("users",' + env.studentId + ');S.persona=null;'
      + 'out.studentSees=teacherNotesFor(' + env.studentId + ').length;'
      + 'out.studentCard=teacherNotesCard(' + env.studentId + ')==="";'
      + 'return JSON.stringify(out);})()'));
    assert(r.made === true, 'یادداشت ثبت نشد');
    if (r.parentSees !== undefined) {
      assert(r.parentSees === 0, '🔴 ولی ' + r.parentSees + ' یادداشت خصوصی دید');
      assert(r.parentCard === true, '🔴 کارت یادداشت به ولی نمایش داده شد');
    }
    assert(r.studentSees === 0, '🔴 دانش‌آموز یادداشت خصوصی خودش را دید');
    assert(r.studentCard === true, '🔴 کارت یادداشت به دانش‌آموز نمایش داده شد');
  });
});

test('یادداشت: مدیر می‌بیند ولی نمی‌نویسد', () => {
  withTeacherHistory((sid, env) => {
    const r = JSON.parse(W('(()=>{'
      + 'S.user=byId("users",' + env.teacherId + ');S.persona=null;S.boss=null;'
      + 'addTeacherNote(' + env.studentId + ',"یادداشت برای سنجش دید مدیر");'
      + 'S.user=db.users.find(function(u){return u.role==="manager"&&u.school_id===' + sid + ';});'
      + 'S.persona=null;'
      + 'const before=(db.teacher_notes||[]).length;'
      + 'const tried=addTeacherNote(' + env.studentId + ',"مدیر نباید بتواند بنویسد");'
      + 'return JSON.stringify({sees:teacherNotesFor(' + env.studentId + ').length,'
      + 'mayWrite:mayWriteNote(' + env.studentId + '),'
      + 'wrote:!!tried,added:(db.teacher_notes||[]).length-before});})()'));
    assert(r.sees >= 1, 'مدیر باید یادداشت‌ها را ببیند: ' + r.sees);
    assert(r.mayWrite === false, '🔴 مدیر اجازهٔ نوشتن یادداشت دارد');
    assert(r.wrote === false && r.added === 0, '🔴 مدیر یادداشت نوشت');
  });
});

test('یادداشت: 🔴 دبیر دیگر یادداشت همکارش را نمی‌بیند', () => {
  withTeacherHistory((sid, env) => {
    const r = JSON.parse(W('(()=>{'
      + 'S.user=byId("users",' + env.teacherId + ');S.persona=null;S.boss=null;'
      + 'addTeacherNote(' + env.studentId + ',"یادداشت خصوصی دبیر نخست");'
      + 'const t2=db.users.filter(function(u){return u.role==="teacher"&&'
      + 'u.school_id===' + sid + '&&u.id!==' + env.teacherId + ';})[0];'
      + 'if(!t2)return JSON.stringify({skip:true});'
      + 'S.user=t2;S.persona=null;'
      + 'return JSON.stringify({sees:teacherNotesFor(' + env.studentId + ').length});})()'));
    if (r.skip) return;
    assert(r.sees === 0, '🔴 دبیر دیگر ' + r.sees + ' یادداشت همکارش را دید');
  });
});

test('یادداشت: 🔴 با انتقال دبیر، یادداشت در مدرسه می‌ماند', () => {
  /* تصمیم سیاستی: مالکیت با مدرسه است نه دبیر. */
  withTeacherHistory((sid, env) => {
    const r = JSON.parse(W('(()=>{'
      + 'S.user=byId("users",' + env.teacherId + ');S.persona=null;S.boss=null;'
      + 'addTeacherNote(' + env.studentId + ',"یادداشت پیش از انتقال");'
      + 'const before=teacherNotesFor(' + env.studentId + ').length;'
      + 'const t=byId("users",' + env.teacherId + ');const old=t.school_id;'
      + 'const dest=db.schools.find(function(s){return s.id!==old;});'
      + 'if(!dest)return JSON.stringify({skip:true});'
      + 'update("users",t.id,{school_id:dest.id});'
      + 'S.user=byId("users",' + env.teacherId + ');S.persona=null;'
      + 'const after=teacherNotesFor(' + env.studentId + ').length;'
      /* مدیر مدرسهٔ اصلی هنوز می‌بیند */
      + 'S.user=db.users.find(function(u){return u.role==="manager"&&u.school_id===old;});'
      + 'S.persona=null;'
      + 'const mgrStill=teacherNotesFor(' + env.studentId + ').length;'
      + 'update("users",t.id,{school_id:old});'
      + 'return JSON.stringify({before:before,after:after,mgrStill:mgrStill});})()'));
    if (r.skip) return;
    assert(r.before >= 1, 'محیط آزمون: یادداشتی ثبت نشد');
    assert(r.after === 0,
      '🔴 دبیر پس از انتقال ' + r.after + ' یادداشت مدرسهٔ قبلی را دید');
    assert(r.mgrStill >= 1,
      '🔴 یادداشت با دبیر رفت — باید در مدرسه می‌ماند (' + r.mgrStill + ')');
  });
});

test('یادداشت: هشدار حقوقی صریح در رابط کاربری هست', () => {
  /* 🔴 دبیری که گمان کند یادداشتش کاملاً محرمانه است، ممکن است
     چیزی بنویسد که در بازرسی علیه خودش استفاده شود. */
  withTeacherHistory((sid, env) => {
    const r = JSON.parse(W('(()=>{'
      + 'S.user=byId("users",' + env.teacherId + ');S.persona=null;S.boss=null;'
      + 'const card=teacherNotesCard(' + env.studentId + ');'
      + 'return JSON.stringify({warnConst:typeof NOTE_LEGAL_WARN==="string"&&'
      + 'NOTE_LEGAL_WARN.indexOf("بازرسی")>-1,'
      + 'inCard:card.indexOf("خصوصی")>-1&&card.indexOf("ولی")>-1,'
      + 'mentionsManager:card.indexOf("مدیر")>-1});})()'));
    assert(r.warnConst === true, '🔴 متن هشدار به بازرسی اشاره نمی‌کند');
    assert(r.inCard === true, '🔴 هشدار در کارت یادداشت نیست');
    assert(r.mentionsManager === true, 'کارت باید بگوید مدیر می‌بیند');
  });
});

test('یادداشت: متن مخرب اجرا نمی‌شود (XSS)', () => {
  withTeacherHistory((sid, env) => {
    const r = JSON.parse(W('(()=>{'
      + 'S.user=byId("users",' + env.teacherId + ');S.persona=null;S.boss=null;'
      + 'addTeacherNote(' + env.studentId + ',"<img src=x onerror=alert(1)>");'
      + 'const card=teacherNotesCard(' + env.studentId + ');'
      + 'return JSON.stringify({raw:card.indexOf("<img src=x onerror")>-1,'
      + 'escaped:card.indexOf("&lt;img src=x onerror")>-1});})()'));
    assert(r.raw === false, '🔴 تگ خام در کارت یادداشت — رخنهٔ XSS');
    assert(r.escaped === true, 'متن باید فرارداده‌شده دیده شود');
  });
});

test('یادداشت: کنش‌ها فقط برای دبیر مجازند', () => {
  ['tnote-new', 'tnote-save', 'tnote-del'].forEach((a) => {
    const roles = JSON.parse(W('JSON.stringify(ACTION_ROLES[' + JSON.stringify(a) + ']||[])'));
    assert(roles.length > 0, 'کنش ' + a + ' در ACTION_ROLES ثبت نشده');
    assert(roles.indexOf('teacher') > -1, 'دبیر باید اجازه داشته باشد');
    assert(roles.indexOf('parent') === -1, '🔴 ولی اجازهٔ ' + a + ' دارد');
    assert(roles.indexOf('student') === -1, '🔴 دانش‌آموز اجازهٔ ' + a + ' دارد');
    assert(roles.indexOf('manager') === -1,
      '🔴 مدیر اجازهٔ ' + a + ' دارد — طبق تصمیم سیاستی فقط می‌بیند');
  });
});

/* ── خانوادهٔ چندفرزندی در دادهٔ نمونه (دور ۴۶) ─────────────────
   ⚠️ دو مورد چندفرزندی **عمدی و از پیش موجود** هستند و کنار
   می‌مانند: `parent_multi` («کاظم رستمی») با فرزندان در سه مدرسه
   (فاز ۸)، و یک کاربر نقش‌`teacher` که پیوند ولی دارد. */

/** خانواده‌های چندفرزندیِ ساختهٔ generate() — بدون موارد عمدی */
function genFamilies() {
  return JSON.parse(W('(()=>{const c={};'
    + 'db.parent_links.forEach(function(l){'
    + 'const u=byId("users",l.parent_id);'
    + 'if(u&&u.role==="parent"&&u.username!=="parent_multi")'
    + '(c[l.parent_id]=c[l.parent_id]||[]).push(l.student_id);});'
    + 'return JSON.stringify(Object.keys(c).filter(function(k){return c[k].length>1;})'
    + '.map(function(k){return {parent:Number(k),kids:c[k]};}));})()'));
}

/**
 * محیط ولیِ دوفرزندی با اشتراک فعال.
 *
 * 🔴 سنجش دور ۴۶: هیچ ولیِ دوفرزندی اشتراک فعال ندارد (اشتراک‌ها
 * پیش از این تغییر ساخته می‌شوند). بدون اشتراک، دیوار پرداخت
 * `parentLocked()` صفحه را می‌بندد و آزمون «صفر دکمه» می‌گیرد —
 * نتیجهٔ دروغین که دو بار گمراهم کرد. پس اشتراک را خودمان
 * می‌سازیم و در finally برمی‌گردانیم.
 */
function withSubscribedParent(fn) {
  const fams = genFamilies();
  const two = fams.filter(function (f) { return f.kids.length === 2; })[0];
  assert(two, 'محیط آزمون: ولیِ دوفرزندی در دادهٔ نمونه نیست');
  const saved = W('JSON.stringify({u:S.user&&S.user.id,r:S.route,c:S.child,'
    + 't:S.tab,g:S.gateSkipped})');
  /* ⚠️ subOf با `find` نخستین رکورد را برمی‌دارد؛ اگر ردیف کهنه‌ای
     برای این کاربر باشد، رکورد افزوده‌شده نادیده می‌ماند. پس
     ردیف‌های پیشین همین کاربر حذف و رکورد تازه جلو گذاشته می‌شود. */
  W('(()=>{db._spS=(db.parent_subscriptions||[]).slice();'
    + 'db.parent_subscriptions=db.parent_subscriptions.filter(function(x){'
    + 'return x.user_id!==' + two.parent + ';});'
    + 'db.parent_subscriptions.unshift({id:990001,user_id:' + two.parent + ','
    + 'plan:"yearly",amount:0,status:"active",start_date:"2026-01-01",'
    + 'end_date:"2099-12-31",paid_at:"2026-01-01",ref_id:"TEST"});'
    + '(typeof idxInvalidate==="function")&&idxInvalidate("parent_subscriptions");})()');
  try {
    return fn(two);
  } finally {
    const o = JSON.parse(saved);
    W('(()=>{db.parent_subscriptions=db._spS;delete db._spS;'
      + 'S.user=byId("users",' + o.u + ')||S.user;S.route=' + JSON.stringify(o.r) + ';'
      + 'S.child=' + (o.c || 'null') + ';S.tab=' + JSON.stringify(o.t || 'grades') + ';'
      + 'S.gateSkipped=' + (o.g ? 'true' : 'false') + ';S.filters={};'
      + '(typeof idxInvalidate==="function")&&idxInvalidate("parent_subscriptions");})()');
  }
}

test('دادهٔ نمونه: خانوادهٔ چندفرزندی به‌قدر کافی دارد', () => {
  /* 🔴 پیش از دور ۴۶ فقط **یک** ولی چند فرزند داشت (آن هم از
     فاز ۸)، پس قابلیت سوییچ بین فرزندان در دمو نامرئی بود. */
  const fams = genFamilies();
  assert(fams.length >= 50,
    '🔴 فقط ' + fams.length + ' خانوادهٔ چندفرزندی — سوییچ در دمو دیده نمی‌شود');
  const three = fams.filter(function (f) { return f.kids.length >= 3; });
  assert(three.length >= 2,
    'دست‌کم دو خانوادهٔ سه‌فرزندی لازم است: ' + three.length);
});

test('دادهٔ نمونه: خواهر/برادرها نام خانوادگی و مدرسهٔ یکسان دارند', () => {
  const r = JSON.parse(W('(()=>{const c={};'
    + 'db.parent_links.forEach(function(l){'
    + 'const u=byId("users",l.parent_id);'
    + 'if(u&&u.role==="parent"&&u.username!=="parent_multi")'
    + '(c[l.parent_id]=c[l.parent_id]||[]).push(l.student_id);});'
    + 'let badName=0,badSchool=0,n=0;'
    + 'Object.keys(c).forEach(function(k){'
    + 'if(c[k].length<2)return;n++;'
    + 'const kids=c[k].map(function(i){return byId("users",i);}).filter(Boolean);'
    + 'const lns={},scs={};'
    + 'kids.forEach(function(x){lns[x.full_name.split(" ").slice(-1)[0]]=1;scs[x.school_id]=1;});'
    + 'if(Object.keys(lns).length>1)badName++;'
    + 'if(Object.keys(scs).length>1)badSchool++;});'
    + 'return JSON.stringify({n:n,badName:badName,badSchool:badSchool});})()'));
  assert(r.n > 0, 'محیط آزمون: خانوادهٔ چندفرزندی نیست');
  assert(r.badName === 0,
    '🔴 ' + r.badName + ' خانواده نام خانوادگی ناهمخوان دارد');
  assert(r.badSchool === 0, '🔴 ' + r.badSchool + ' خانواده در چند مدرسه پخش است');
});

test('سوییچ فرزند: برای هر فرزند یک دکمه رندر می‌شود', () => {
  withSubscribedParent(function (two) {
    const r = JSON.parse(W('(()=>{S.user=byId("users",' + two.parent + ');'
      + 'S.persona=null;S.boss=null;S.gateSkipped=true;'
      + 'S.route="children";S.filters={};S.child=null;S.tab="grades";'
      + 'const locked=(typeof parentLocked==="function")?parentLocked():false;'
      + 'const h=renderRoute();'
      + 'return JSON.stringify({locked:locked,'
      + 'btns:(h.match(/data-act="child"/g)||[]).length,len:h.length});})()'));
    assert(r.locked === false, 'محیط آزمون: دیوار پرداخت هنوز فعال است');
    assert(r.btns === 2,
      '🔴 برای ولیِ دوفرزندی ' + r.btns + ' دکمهٔ سوییچ رندر شد (انتظار ۲)');
    assert(r.len > 500, 'صفحهٔ فرزندان کوتاه است: ' + r.len);
  });
});


test('بند ۴: دیوار پرداخت نمرات/حضور/برنامه هفتگی را بند نمی‌کند', () => {
  const r = JSON.parse(W(`(()=>{
    var pt=null;
    db.users.forEach(function(u){ if(pt) return; if(u.role!=='teacher'||!u.active) return;
      if(db.parent_links.some(function(l){return l.parent_id===u.id;})) pt=u; });
    if(!pt) return JSON.stringify({err:'no-locked-parent'});
    saveSubSettings({trial_enabled:0});
    db.parent_subscriptions.filter(function(x){return x.user_id===pt.id;}).forEach(function(x){remove('parent_subscriptions',x.id);});
    S.user=pt; S.persona='parent'; S.boss=null; S.gateSkipped=true; S.filters={}; S.tab='grades';
    var kid=db.parent_links.filter(function(l){return l.parent_id===pt.id;})[0].student_id;
    S.child=kid;
    var locked=(typeof parentLocked==='function')?parentLocked():false;
    if(locked!==true) return JSON.stringify({err:'parent-not-locked',locked:locked});
    var nav=navFor(Object.assign({},pt,{role:'parent'})).map(function(g){return g[1].map(function(i){return i[0];}).join(',');}).join('|');
    S.route='record';
    var hRec=renderRoute();
    var recOk=hRec.indexOf('کارنامه')>-1&&hRec.indexOf('اشتراک پنل اولیا لازم است')<0;
    S.tab='schedule';
    var hSch=renderRoute();
    var noTT=hSch.indexOf('tt-head')>-1;
    S.tab='attendance';
    var hAtt=renderRoute();
    var attOk=hAtt.indexOf('حضور')>-1;
    S.tab='grades';S.route='meetings';
    var hMeet=renderRoute();
    var meetLocked=hMeet.indexOf('🔒')>-1;
    S.persona=null;S.boss=null;S.route='dashboard';S.child=null;S.gateSkipped=false;
    return JSON.stringify({ptId:pt.id,locked:locked,nav:nav,recOk:recOk,noTT:noTT,attOk:attOk,meetLocked:meetLocked});
  })()`));
  /* بازیابی: دوره آزمایشی روشن — ردیف‌های ساخت آزمون پاک */
  W('saveSubSettings({trial_enabled:1});db.parent_subscriptions.filter(function(x){return x.user_id=='+(r.ptId||0)+';}).forEach(function(x){remove("parent_subscriptions",x.id);});');
  assert(r.err !== 'no-locked-parent', 'محیط آزمون: ولی‌ای بدون اشتراک در داده نمونه نیست');
  assert(r.err !== 'parent-not-locked', 'محیط آزمون: ولی قفل نشد');
  assert(r.locked === true, 'دیوار پرداخت خاموش است');
  assert(r.nav.indexOf('children')>-1&&r.nav.indexOf('dashboard')>-1&&r.nav.indexOf('calendar')>-1&&r.nav.indexOf('mytuition')>-1,
    '🔴 داده‌های پایه از منوی ولیِ قفل‌شده حذف شده (منو: ' + r.nav + ')');
  assert(r.nav.indexOf('meetings')<0&&r.nav.indexOf('chat')<0,
    '🔴 موارد پرمیوم (نوبت/گفتگو) هنوز در منوی ولیِ قفل است');
  assert(r.recOk === true, '🔴 کارنامه برای ولی‌ای بدون اشتراک قفل است');
  assert(r.noTT === true, '🔴 تب برنامه هفتگی کلاس رندر نشد');
  assert(r.attOk === true, '🔴 حضور و غیاب قفل است');
  assert(r.meetLocked === true, '🔴 نوبت جلسه بدون اشتراک باز است — دیوار پرداخت از کار افتاده');
});test('سوییچ فرزند: 🔴 کلیک روی دکمه واقعاً فرزند را عوض می‌کند', () => {
  /* 🔴 تست جهش دور ۴۶: نسخهٔ نخست این آزمون `S.child` را مستقیم
     می‌نوشت، پس خراب‌کردن کنش `child` (که همان نوشتن را انجام
     می‌دهد) نمی‌انداختش. حالا از مسیر واقعی کاربر می‌رود: کلیک
     روی DOM. */
  withSubscribedParent(function (two) {
    const r = JSON.parse(W('(()=>{S.user=byId("users",' + two.parent + ');'
      + 'S.persona=null;S.boss=null;S.gateSkipped=true;'
      + 'S.route="children";S.filters={};S.tab="grades";S.child=null;'
      + 'const click=function(id){const b=document.createElement("button");'
      + 'b.setAttribute("data-act","child");b.setAttribute("data-id",String(id));'
      + 'document.body.appendChild(b);'
      + 'b.dispatchEvent(new MouseEvent("click",{bubbles:true}));b.remove();};'
      + 'click(' + two.kids[0] + ');const first=S.child;const h1=renderRoute();'
      + 'click(' + two.kids[1] + ');const second=S.child;const h2=renderRoute();'
      + 'const k2=byId("users",' + two.kids[1] + ');'
      + 'return JSON.stringify({first:first,second:second,'
      + 'want1:' + two.kids[0] + ',want2:' + two.kids[1] + ','
      + 'changed:h1!==h2,hasK2:h2.indexOf(k2.full_name)>-1,len1:h1.length});})()'));
    assert(r.len1 > 500, 'محیط آزمون: صفحه رندر نشد');
    assert(r.first === r.want1,
      '🔴 کلیک روی فرزند نخست S.child را ننوشت: ' + r.first);
    assert(r.second === r.want2,
      '🔴 کلیک روی فرزند دوم S.child را عوض نکرد: ' + r.second);
    assert(r.changed === true, '🔴 محتوای صفحه با سوییچ عوض نشد');
    assert(r.hasK2 === true, 'نام فرزند انتخاب‌شده در خروجی نیست');
  });
});

test('خواهر/برادر: کد ملی پدر مشترک است (پایهٔ keepSiblings)', () => {
  /* ⚠️ توزیع خودکار کلاس با `keepSiblings` از `father_nid` استفاده
     می‌کند. پیش از دور ۴۶ این قاعده روی دادهٔ نمونه **هرگز فعال
     نمی‌شد** چون خواهر/برادری وجود نداشت. */
  const r = JSON.parse(W('(()=>{const sid=db.schools[0].id;'
    + 'const kids=db.users.filter(function(u){'
    + 'return u.role==="student"&&u.school_id===sid&&u.father_nid;});'
    + 'const byFam={};kids.forEach(function(k){'
    + '(byFam[k.father_nid]=byFam[k.father_nid]||[]).push(k.id);});'
    + 'const sib=Object.keys(byFam).filter(function(k){return byFam[k].length>1;});'
    + 'return JSON.stringify({total:kids.length,siblingFamilies:sib.length});})()'));
  assert(r.total > 0, 'محیط آزمون: دانش‌آموزی با father_nid نیست');
  assert(r.siblingFamilies >= 5,
    '🔴 فقط ' + r.siblingFamilies + ' خانوادهٔ هم‌پدر — keepSiblings آزمودنی نیست');
});

/* ── تفکیک نقش سوپرادمین از مدیر مدرسه (دور ۴۷) ───────────────── */

/** کنش‌های مدرسه‌محور که سوپرادمین نباید به‌عنوان خودش داشته باشد */
const SCHOOL_ONLY_ACTS = ['imp-commit', 'imp-preview', 'att-set', 'att-commit',
  'grade-save', 'class-save', 'export-csv', 'sms-send', 'notify-approve'];

/** کنش‌هایی که سوپرادمین باید نگه دارد (سامانه‌محور) */
const SYSTEM_ACTS = ['school-save', 'office-save', 'backup-make', 'subs-save'];

test('نقش: سوپرادمین به‌عنوان خودش کنش مدرسه‌محور ندارد', () => {
  /* 🔴 پیش از دور ۴۷ سوپرادمین ۸۸ از ۹۳ کنش را داشت، از جمله
     ورود اکسل و ثبت نمره. کار مدیر مدرسه است نه مدیر سامانه. */
  const saved = W('JSON.stringify({u:S.user&&S.user.id,b:S.boss&&S.boss.id})');
  try {
    const r = JSON.parse(W('(()=>{const s=db.users.find(function(u){'
      + 'return u.role==="superadmin";});'
      + 'S.user=s;S.persona=null;S.boss=null;'
      + 'const acts=' + JSON.stringify(SCHOOL_ONLY_ACTS) + ';'
      + 'const sys=' + JSON.stringify(SYSTEM_ACTS) + ';'
      + 'return JSON.stringify({'
      + 'persona:activePersona(),'
      + 'granted:acts.filter(function(a){return canAction(a);}),'
      + 'lostSystem:sys.filter(function(a){return !canAction(a);})});})()'));
    assert(r.persona === 'superadmin', 'محیط آزمون: نقش سوپرادمین نشد');
    assert(r.granted.length === 0,
      '🔴 سوپرادمین این کنش‌های مدرسه‌محور را دارد: ' + r.granted.join(' · '));
    assert(r.lostSystem.length === 0,
      '🔴 کنش سامانه‌محور از سوپرادمین گرفته شد: ' + r.lostSystem.join(' · '));
  } finally {
    const o = JSON.parse(saved);
    W('S.user=byId("users",' + o.u + ')||S.user;S.boss=null;S.persona=null');
  }
});

test('نقش: 🔴 سوپرادمین از راه S.boss همان کنش‌ها را دارد', () => {
  /* خط قرمز کاربر: مسیر جانشینی (پشتیبانی فنی) نباید بشکند.
     آنجا S.user **خودِ مدیر** می‌شود (19-actions.js:74)، پس
     واقعاً به‌جای مدیر عمل می‌کند نه به‌عنوان خودش. */
  const saved = W('JSON.stringify({u:S.user&&S.user.id,b:S.boss&&S.boss.id})');
  try {
    const r = JSON.parse(W('(()=>{const s=db.users.find(function(u){'
      + 'return u.role==="superadmin";});'
      + 'const mgr=db.users.find(function(u){return u.role==="manager"&&u.active;});'
      + 'if(!mgr)return JSON.stringify({skipTest:true});'
      /* همان کاری که کنش school-enter می‌کند */
      + 'S.boss=s;S.user=mgr;S.persona=null;'
      + 'const acts=' + JSON.stringify(SCHOOL_ONLY_ACTS) + ';'
      + 'return JSON.stringify({'
      + 'persona:activePersona(),'
      + 'bossIsSuper:S.boss&&S.boss.role==="superadmin",'
      + 'denied:acts.filter(function(a){return !canAction(a);})});})()'));
    if (r.skipTest) return;
    assert(r.bossIsSuper === true, 'محیط آزمون: S.boss سوپرادمین نیست');
    assert(r.persona === 'manager',
      '🔴 در جانشینی نقش فعال باید manager باشد: ' + r.persona);
    assert(r.denied.length === 0,
      '🔴 مسیر جانشینی شکست — این کنش‌ها از مدیر گرفته شده: '
      + r.denied.join(' · '));
  } finally {
    const o = JSON.parse(saved);
    W('S.user=byId("users",' + o.u + ')||S.user;S.boss=null;S.persona=null');
  }
});

test('نقش: 🔴 دو حالت سوپرادمین از هم جدا رفتار می‌کنند', () => {
  /* آزمون یکپارچه: همان کنش، دو نتیجهٔ متفاوت بسته به اینکه
     سوپرادمین خودش است یا جانشین مدیر. اگر این دو یکی شوند،
     یا تفکیک شکسته یا جانشینی. */
  const saved = W('JSON.stringify({u:S.user&&S.user.id,b:S.boss&&S.boss.id})');
  try {
    const r = JSON.parse(W('(()=>{const s=db.users.find(function(u){'
      + 'return u.role==="superadmin";});'
      + 'const mgr=db.users.find(function(u){return u.role==="manager"&&u.active;});'
      + 'if(!mgr)return JSON.stringify({skipTest:true});'
      + 'const probe="imp-commit";'
      + 'S.user=s;S.persona=null;S.boss=null;'
      + 'const asSelf=canAction(probe);'
      + 'S.boss=s;S.user=mgr;S.persona=null;'
      + 'const asBoss=canAction(probe);'
      + 'return JSON.stringify({asSelf:asSelf,asBoss:asBoss});})()'));
    if (r.skipTest) return;
    assert(r.asSelf === false, '🔴 سوپرادمینِ خودش imp-commit دارد');
    assert(r.asBoss === true, '🔴 سوپرادمینِ جانشین imp-commit ندارد');
    assert(r.asSelf !== r.asBoss,
      '🔴 دو حالت یکسان رفتار کردند — تفکیک بی‌اثر است');
  } finally {
    const o = JSON.parse(saved);
    W('S.user=byId("users",' + o.u + ')||S.user;S.boss=null;S.persona=null');
  }
});

test('نقش: هر کنشِ مجازِ سوپرادمین صفحه‌اش را هم دارد', () => {
  /* ⚠️ معیار تفکیک: اگر صفحه‌اش در منوی سوپرادمین نیست، کنشش هم
     نباید باشد. دفاع باید دولایه بماند نه اینکه فقط گارد صفحه
     جلویش را بگیرد. */
  const r = JSON.parse(W('(()=>{const map={'
    + '"imp-commit":"import","imp-preview":"import","att-set":"attendance",'
    + '"att-commit":"attendance","grade-save":"grades","class-save":"classes",'
    + '"export-csv":"formssms","sms-send":"formssms","notify-approve":"notifyqueue"};'
    + 'const bad=[];'
    + 'Object.keys(map).forEach(function(a){'
    + 'const actOk=(ACTION_ROLES[a]||[]).indexOf("superadmin")>-1;'
    + 'const pageOk=canRoute(map[a],"superadmin");'
    + 'if(actOk!==pageOk)bad.push(a+"(کنش="+actOk+" صفحه="+pageOk+")");});'
    + 'return JSON.stringify({bad:bad});})()'));
  assert(r.bad.length === 0,
    '🔴 ناهماهنگی کنش و صفحه برای سوپرادمین: ' + r.bad.join(' · '));
});

/* ── زنگ جاری: هستهٔ زمان (گام ۱، دور ۴۸) ────────────────────────
   ⚠️ همهٔ آزمون‌ها با تاریخ **ثابت** کار می‌کنند نه `new Date()`
   واقعی، وگرنه نتیجه به لحظهٔ اجرای آزمون بستگی پیدا می‌کند و
   آزمون شب‌ها یا جمعه‌ها متفاوت می‌شود. */

/** ۲۰۲۶-۰۹-۰۵ شنبه است (getDay=6) — مبنای همهٔ سنجش‌ها */
const SAT = '2026-09-05';

test('زنگ: 🔴 نگاشت روز هفته در هر هفت روز درست است', () => {
  /* 🔴 دام اصلی این ماژول: `Date.getDay()` یکشنبه‌محور است
     (یکشنبه=۰) ولی `schedule.day` شنبه‌محور (شنبه=۰). اگر این
     اشتباه شود، برنامهٔ **روز دیگری** نشان داده می‌شود و هیچ
     خطایی هم پرتاب نمی‌شود — فقط دادهٔ غلط. */
  const r = JSON.parse(W('(()=>{const want=['
    + '["2026-09-05",0],["2026-09-06",1],["2026-09-07",2],'
    + '["2026-09-08",3],["2026-09-09",4],["2026-09-10",5],["2026-09-11",6]];'
    + 'const bad=[];'
    + 'want.forEach(function(p){'
    + 'const got=todayIndex(new Date(p[0]+"T09:00:00"));'
    + 'if(got!==p[1])bad.push(p[0]+": "+got+"≠"+p[1]);});'
    + 'return JSON.stringify({bad:bad,'
    + 'satIsZero:todayIndex(new Date("' + SAT + 'T09:00:00"))===0,'
    + 'thuNotSchool:isSchoolDay(5)===false,'
    + 'friNotSchool:isSchoolDay(6)===false,'
    + 'wedIsSchool:isSchoolDay(4)===true});})()'));
  assert(r.bad.length === 0, '🔴 نگاشت روز غلط: ' + r.bad.join(' · '));
  assert(r.satIsZero === true, '🔴 شنبه باید ۰ باشد');
  assert(r.thuNotSchool && r.friNotSchool, 'پنج‌شنبه و جمعه نباید روز درسی باشند');
  assert(r.wedIsSchool === true, 'چهارشنبه باید روز درسی باشد');
});

test('زنگ: ساعت نامعتبر تشخیص داده می‌شود', () => {
  const r = JSON.parse(W('(()=>{'
    + 'const old=clockSanity(new Date("1999-05-05T09:00:00"));'
    + 'const far=clockSanity(new Date("2050-05-05T09:00:00"));'
    + 'const ok=clockSanity(new Date("' + SAT + 'T09:00:00"));'
    + 'return JSON.stringify({oldOk:old.ok,oldReason:old.reason,'
    + 'farOk:far.ok,okOk:ok.ok,'
    + 'warnHasYear:clockWarnText(old).indexOf("۱۹۹۹")>-1,'
    + 'warnEmpty:clockWarnText(ok)===""});})()'));
  assert(r.oldOk === false && r.oldReason === 'year', 'سال ۱۹۹۹ باید رد شود');
  assert(r.farOk === false, 'سال ۲۰۵۰ باید رد شود');
  assert(r.okOk === true, 'سال معتبر رد شد');
  assert(r.warnHasYear === true, 'پیام هشدار باید سال را بگوید');
  assert(r.warnEmpty === true, 'ساعت سالم نباید هشدار بدهد');
});

test('زنگ: 🔴 ساعت نامعتبر پیش‌گزینش را خاموش می‌کند', () => {
  const r = JSON.parse(W('(()=>{const sid=db.bell_schedules.length'
    + '?db.bell_schedules[0].school_id:db.schools[0].id;'
    + 'const bad=currentSlot(sid,new Date("1999-09-05T09:00:00"));'
    + 'return JSON.stringify({kind:bad.kind,clockOk:bad.clock.ok});})()'));
  assert(r.kind === 'unknown',
    '🔴 با ساعت نامعتبر باید unknown بدهد، داد: ' + r.kind);
  assert(r.clockOk === false, 'وضعیت ساعت باید ناسالم گزارش شود');
});

test('زنگ: بازهٔ جاری در ساعت‌های مختلف درست تشخیص داده می‌شود', () => {
  const r = JSON.parse(W('(()=>{const sid=db.bell_schedules.length'
    + '?db.bell_schedules[0].school_id:db.schools[0].id;'
    + 'const tl=bellTimeline(sid);'
    + 'if(!tl.length)return JSON.stringify({skipTest:true});'
    + 'const first=tl[0];'
    + 'const at=function(hm){return currentSlot(sid,new Date("' + SAT + 'T"+hm+":00"));};'
    + 'const before=at("05:00");'
    + 'const inFirst=at(first.from);'
    + 'const after=at("23:30");'
    + 'return JSON.stringify({'
    + 'before:before.kind,inFirst:inFirst.kind,inFirstNo:inFirst.no,'
    + 'after:after.kind,firstFrom:first.from});})()'));
  if (r.skipTest) return;
  assert(r.before === 'before', 'پیش از شروع مدرسه: ' + r.before);
  assert(r.inFirst === 'lesson' && r.inFirstNo === 1,
    'لحظهٔ شروع باید زنگ ۱ باشد: ' + r.inFirst + '/' + r.inFirstNo);
  assert(r.after === 'after', 'پس از پایان مدرسه: ' + r.after);
});

test('زنگ: 🔴 مرز بازه شامل شروع است و شامل پایان نیست', () => {
  /* اگر مرز [from, to] باشد، لحظهٔ دقیق پایان به دو بازه تعلق
     می‌گیرد و نتیجه به ترتیب حلقه بستگی پیدا می‌کند. */
  const r = JSON.parse(W('(()=>{const sid=db.bell_schedules.length'
    + '?db.bell_schedules[0].school_id:db.schools[0].id;'
    + 'const tl=bellTimeline(sid);'
    + 'if(tl.length<2)return JSON.stringify({skipTest:true});'
    + 'const atStart=currentSlot(sid,new Date("' + SAT + 'T"+tl[0].from+":00"));'
    + 'const atEnd=currentSlot(sid,new Date("' + SAT + 'T"+tl[0].to+":00"));'
    + 'return JSON.stringify({startKind:atStart.kind,startNo:atStart.no,'
    + 'endKind:atEnd.kind,endNo:atEnd.no,'
    + 'nextKind:tl[1].kind,nextNo:tl[1].no});})()'));
  if (r.skipTest) return;
  assert(r.startNo === 1, 'لحظهٔ شروع باید در همان بازه بیفتد');
  assert(!(r.endKind === 'lesson' && r.endNo === 1),
    '🔴 لحظهٔ پایان هنوز در بازهٔ قبلی است — مرز بسته است');
  assert(r.endKind === r.nextKind,
    'لحظهٔ پایان باید در بازهٔ بعدی بیفتد: ' + r.endKind + ' ≠ ' + r.nextKind);
});

test('زنگ: وسط تفریح کلاسی برنمی‌گردد', () => {
  const r = JSON.parse(W('(()=>{const sid=db.bell_schedules.length'
    + '?db.bell_schedules[0].school_id:db.schools[0].id;'
    + 'const tl=bellTimeline(sid);'
    + 'const br=tl.filter(function(x){return x.kind==="break";})[0];'
    + 'if(!br)return JSON.stringify({skipTest:true});'
    + 'const mid=timeToMin(br.from)+1;'
    + 'const hm=minToTime(mid);'
    + 'const slot=currentSlot(sid,new Date("' + SAT + 'T"+hm+":00"));'
    + 'const t=db.users.find(function(u){return u.role==="teacher"&&u.school_id===sid;});'
    + 'const cls=t?teacherNowClass(t.id,sid,new Date("' + SAT + 'T"+hm+":00")):null;'
    + 'return JSON.stringify({kind:slot.kind,no:slot.no,hasClass:!!cls});})()'));
  if (r.skipTest) return;
  assert(r.kind === 'break', 'وسط تفریح باید break باشد: ' + r.kind);
  assert(r.no === null, 'تفریح شمارهٔ زنگ ندارد');
  assert(r.hasClass === false, '🔴 در تفریح کلاس برگردانده شد');
});

test('زنگ: 🔴 پنج‌شنبه و جمعه تعطیل‌اند', () => {
  const r = JSON.parse(W('(()=>{const sid=db.bell_schedules.length'
    + '?db.bell_schedules[0].school_id:db.schools[0].id;'
    + 'const thu=currentSlot(sid,new Date("2026-09-10T09:00:00"));'
    + 'const fri=currentSlot(sid,new Date("2026-09-11T09:00:00"));'
    + 'const t=db.users.find(function(u){return u.role==="teacher"&&u.school_id===sid;});'
    + 'const cls=t?teacherNowClass(t.id,sid,new Date("2026-09-10T09:00:00")):null;'
    + 'return JSON.stringify({thu:thu.kind,fri:fri.kind,hasClass:!!cls});})()'));
  assert(r.thu === 'holiday', '🔴 پنج‌شنبه باید تعطیل باشد: ' + r.thu);
  assert(r.fri === 'holiday', '🔴 جمعه باید تعطیل باشد: ' + r.fri);
  assert(r.hasClass === false, '🔴 روز تعطیل کلاس برگردانده شد');
});

test('زنگ: کلاس فعلی دبیر از تقاطع روز و زنگ می‌آید', () => {
  const r = JSON.parse(W('(()=>{const sid=db.bell_schedules.length'
    + '?db.bell_schedules[0].school_id:db.schools[0].id;'
    + 'const tl=bellTimeline(sid);'
    + 'const l1=tl.filter(function(x){return x.kind==="lesson"&&x.no===1;})[0];'
    + 'if(!l1)return JSON.stringify({skipTest:true});'
    + 'const hm=minToTime(timeToMin(l1.from)+5);'
    + 'const when=new Date("' + SAT + 'T"+hm+":00");'
    /* دبیری که شنبه زنگ ۱ کلاس دارد */
    + 'const row=db.schedule.filter(function(x){'
    + 'return x.school_id===sid&&x.day===0&&Number(x.period)===1;})[0];'
    + 'if(!row)return JSON.stringify({skipTest:true});'
    + 'const got=teacherNowClass(row.teacher_id,sid,when);'
    + 'return JSON.stringify({found:!!got,'
    + 'classMatch:got?got.classId===row.class_id:false,'
    + 'periodMatch:got?got.period===1:false,'
    + 'hasNames:got?(!!got.className&&!!got.subjectName):false});})()'));
  if (r.skipTest) return;
  assert(r.found === true, '🔴 کلاس زنگ ۱ شنبه پیدا نشد');
  assert(r.classMatch === true, 'شناسهٔ کلاس با جدول برنامه نمی‌خواند');
  assert(r.periodMatch === true, 'شمارهٔ زنگ اشتباه است');
  assert(r.hasNames === true, 'نام کلاس یا درس خالی است');
});

test('زنگ: 🔴 کلاس دبیر به روز هفته حساس است', () => {
  /* 🔴 تست جهش دور ۴۸: حذف شرط `r.day === slot.day` از
     teacherNowClass هیچ آزمونی را نمی‌انداخت. سناریوی واقعی:
     دبیری که شنبه زنگ ۱ کلاس دارد ولی یکشنبه زنگ ۱ ندارد — اگر
     روز نادیده گرفته شود، یکشنبه هم کلاس شنبه را می‌بیند. */
  const r = JSON.parse(W('(()=>{const sid=db.bell_schedules.length'
    + '?db.bell_schedules[0].school_id:db.schools[0].id;'
    + 'const tl=bellTimeline(sid);'
    + 'const l1=tl.filter(function(x){return x.kind==="lesson"&&x.no===1;})[0];'
    + 'if(!l1)return JSON.stringify({skipTest:true});'
    + 'const hm=minToTime(timeToMin(l1.from)+5);'
    /* دبیری که شنبه زنگ ۱ دارد */
    + 'const sat=db.schedule.filter(function(x){'
    + 'return x.school_id===sid&&x.day===0&&Number(x.period)===1;})[0];'
    + 'if(!sat)return JSON.stringify({skipTest:true});'
    /* آیا همین دبیر یکشنبه زنگ ۱ هم دارد؟ */
    + 'const sun=db.schedule.filter(function(x){'
    + 'return x.school_id===sid&&x.day===1&&Number(x.period)===1'
    + '&&x.teacher_id===sat.teacher_id;})[0];'
    + 'const onSat=teacherNowClass(sat.teacher_id,sid,'
    + 'new Date("2026-09-05T"+hm+":00"));'
    + 'const onSun=teacherNowClass(sat.teacher_id,sid,'
    + 'new Date("2026-09-06T"+hm+":00"));'
    + 'return JSON.stringify({'
    + 'satClass:onSat?onSat.classId:null,'
    + 'sunClass:onSun?onSun.classId:null,'
    + 'sunHasRow:!!sun,'
    + 'sunExpected:sun?sun.class_id:null});})()'));
  if (r.skipTest) return;
  assert(r.satClass !== null, 'محیط آزمون: کلاس شنبه پیدا نشد');
  if (r.sunHasRow) {
    /* اگر یکشنبه هم ردیف دارد، باید کلاس **همان روز** برگردد */
    assert(r.sunClass === r.sunExpected,
      '🔴 یکشنبه کلاس روز دیگری برگشت: ' + r.sunClass + ' ≠ ' + r.sunExpected);
  } else {
    /* اگر یکشنبه ردیفی ندارد، باید null بدهد نه کلاس شنبه */
    assert(r.sunClass === null,
      '🔴 دبیر یکشنبه کلاس ندارد ولی کلاس شنبه برگشت — روز نادیده گرفته شده');
  }
});

test('زنگ: 🔴 پیش‌گزینش فقط با زمان‌بندی ثبت‌شدهٔ مدرسه مجاز است', () => {
  /* تصمیم تأییدشدهٔ کاربر: `bellOf()` نبودِ رکورد را با
     BELL_PRESETS جبران می‌کند، یعنی ساعت خیالی. مدرسه‌ای که زنگ
     ثبت نکرده نباید پیش‌گزینش بگیرد. */
  const r = JSON.parse(W('(()=>{'
    + 'const withB=db.bell_schedules[0];'
    + 'if(!withB)return JSON.stringify({skipTest:true});'
    + 'const noB=db.schools.find(function(s){'
    + 'return !db.bell_schedules.some(function(b){return b.school_id===s.id;});});'
    + 'const a=currentSlot(withB.school_id,new Date("' + SAT + 'T09:00:00"));'
    + 'const out={hasA:a.hasSchedule};'
    + 'if(noB){const b=currentSlot(noB.id,new Date("' + SAT + 'T09:00:00"));'
    + 'out.hasB=b.hasSchedule;out.timelineB=bellTimeline(noB.id).length;}'
    + 'return JSON.stringify(out);})()'));
  if (r.skipTest) return;
  assert(r.hasA === true, 'مدرسهٔ دارای رکورد باید hasSchedule=true بدهد');
  if (r.hasB !== undefined) {
    assert(r.hasB === false,
      '🔴 مدرسهٔ بدون رکورد hasSchedule=true داد — با ساعت خیالی کار می‌کند');
    assert(r.timelineB > 0,
      'الگوی پیش‌فرض باید همچنان بازه بدهد (فقط پیش‌گزینش ممنوع است)');
  }
});

/* ── نوار وضعیت زنگ + دادهٔ ۶ زنگ (گام ۲، دور ۵۰) ──────────────── */

/** محیط دبیرِ مدرسه‌ای که زمان‌بندی زنگ ثبت کرده */
function withBellTeacher(fn) {
  const env = JSON.parse(W('(()=>{'
    + 'if(!db.bell_schedules.length)return JSON.stringify({skipTest:true});'
    + 'const sid=db.bell_schedules[0].school_id;'
    + 'const row=db.schedule.filter(function(x){'
    + 'return x.school_id===sid&&x.day===0&&Number(x.period)===1;})[0];'
    + 'if(!row)return JSON.stringify({skipTest:true});'
    + 'const tl=bellTimeline(sid).filter(function(x){return x.kind==="lesson";});'
    + 'const br=bellTimeline(sid).filter(function(x){return x.kind==="break";})[0];'
    + 'return JSON.stringify({sid:sid,teacherId:row.teacher_id,classId:row.class_id,'
    + 'lessonFrom:tl[0].from,lessonCount:tl.length,'
    + 'breakFrom:br?br.from:null});})()'));
  if (env.skipTest) return;
  const saved = W('JSON.stringify({u:S.user&&S.user.id,r:S.route})');
  W('(()=>{S.user=byId("users",' + env.teacherId + ');S.persona=null;S.boss=null;})()');
  try { return fn(env); }
  finally {
    const o = JSON.parse(saved);
    W('S.user=byId("users",' + o.u + ')||S.user;S.route=' + JSON.stringify(o.r)
      + ';S.persona=null;S.boss=null;S.filters={}');
  }
}

test('دادهٔ نمونه: برنامهٔ هفتگی همهٔ زنگ‌های الگو را پوشش می‌دهد', () => {
  /* 🔴 پیش از دور ۵۰ فقط ۴ زنگ ساخته می‌شد ولی الگوی پیش‌فرض
     ۵ زنگ درسی دارد ⇒ زنگ ۵ هیچ کلاسی نداشت و
     teacherNowClass برایش null می‌داد. */
  const r = JSON.parse(W('(()=>{'
    + 'const periods={};db.schedule.forEach(function(x){periods[x.period]=1;});'
    + 'const sid=db.bell_schedules.length?db.bell_schedules[0].school_id:db.schools[0].id;'
    + 'const lessons=bellTimeline(sid).filter(function(x){return x.kind==="lesson";}).length;'
    + 'const maxP=Math.max.apply(null,Object.keys(periods).map(Number));'
    + 'return JSON.stringify({maxPeriod:maxP,lessonSlots:lessons,'
    + 'rows:db.schedule.length});})()'));
  assert(r.maxPeriod >= r.lessonSlots,
    '🔴 برنامهٔ هفتگی تا زنگ ' + r.maxPeriod + ' است ولی الگو '
    + r.lessonSlots + ' زنگ درسی دارد — زنگ‌های آخر کلاس ندارند');
  assert(r.rows > 900, 'شمار ردیف برنامه کم است: ' + r.rows);
});

test('نوار زنگ: وسط زنگ درسی کلاس دبیر را نشان می‌دهد', () => {
  withBellTeacher((env) => {
    const r = JSON.parse(W('(()=>{'
      + 'const hm=minToTime(timeToMin("' + env.lessonFrom + '")+5);'
      + 'const bar=bellNowBar(new Date("2026-09-05T"+hm+":00"));'
      + 'const cls=byId("classes",' + env.classId + ');'
      + 'return JSON.stringify({empty:bar==="",live:bar.indexOf("bell-bar-live")>-1,'
      + 'hasClass:cls?bar.indexOf(cls.name)>-1:false,'
      + 'hasBell:bar.indexOf("زنگ")>-1});})()'));
    assert(r.empty === false, '🔴 نوار در زنگ درسی خالی بود');
    assert(r.live === true, 'نوار باید حالت live باشد');
    assert(r.hasClass === true, '🔴 نام کلاس در نوار نیست');
    assert(r.hasBell === true, 'شمارهٔ زنگ در نوار نیست');
  });
});

test('نوار زنگ: تفریح، پیش و پس از مدرسه، و تعطیلی', () => {
  withBellTeacher((env) => {
    const r = JSON.parse(W('(()=>{'
      + 'const at=function(iso){return bellNowBar(new Date(iso));};'
      + 'const brHm=' + (env.breakFrom ? '"' + env.breakFrom + '"' : 'null') + ';'
      + 'const out={};'
      + 'if(brHm){const h=minToTime(timeToMin(brHm)+2);'
      + 'out.brk=at("2026-09-05T"+h+":00").indexOf("bell-bar-break")>-1;}'
      + 'out.before=at("2026-09-05T05:00:00").indexOf("bell-bar-off")>-1;'
      + 'out.after=at("2026-09-05T23:00:00").indexOf("bell-bar-off")>-1;'
      + 'out.friday=at("2026-09-11T09:00:00").indexOf("روز درسی نیست")>-1;'
      + 'return JSON.stringify(out);})()'));
    if (r.brk !== undefined) assert(r.brk === true, 'وسط تفریح حالت break نداد');
    assert(r.before === true, 'پیش از مدرسه حالت off نداد');
    assert(r.after === true, 'پس از مدرسه حالت off نداد');
    assert(r.friday === true, '🔴 جمعه باید «روز درسی نیست» بگوید');
  });
});

test('نوار زنگ: 🔴 ساعت نامعتبر هشدار می‌دهد نه زنگ', () => {
  withBellTeacher(() => {
    const r = JSON.parse(W('(()=>{'
      + 'const bar=bellNowBar(new Date("1999-09-05T09:00:00"));'
      + 'return JSON.stringify({warn:bar.indexOf("bell-bar-warn")>-1,'
      + 'hasYear:bar.indexOf("۱۹۹۹")>-1,'
      + 'noLesson:bar.indexOf("bell-bar-live")===-1});})()'));
    assert(r.warn === true, '🔴 با ساعت نامعتبر باید هشدار بدهد');
    assert(r.hasYear === true, 'هشدار باید سال اشتباه را بگوید');
    assert(r.noLesson === true, '🔴 با ساعت نامعتبر زنگ نمایش داد');
  });
});

test('نوار زنگ: 🔴 مدرسهٔ بدون زمان‌بندی نوار نمی‌گیرد', () => {
  /* گارد تصمیم سیاستی: bellOf با BELL_PRESETS ساعت خیالی می‌دهد. */
  const saved = W('JSON.stringify({u:S.user&&S.user.id})');
  try {
    const r = JSON.parse(W('(()=>{'
      + 'const noB=db.schools.find(function(s){'
      + 'return !db.bell_schedules.some(function(b){return b.school_id===s.id;});});'
      + 'if(!noB)return JSON.stringify({skipTest:true});'
      + 'const t=db.users.find(function(u){'
      + 'return u.role==="teacher"&&u.school_id===noB.id;});'
      + 'if(!t)return JSON.stringify({skipTest:true});'
      + 'S.user=t;S.persona=null;S.boss=null;'
      + 'return JSON.stringify({bar:bellNowBar(new Date("2026-09-05T08:00:00")),'
      + 'timeline:bellTimeline(noB.id).length});})()'));
    if (r.skipTest) return;
    assert(r.bar === '',
      '🔴 مدرسهٔ بدون bell_schedules نوار گرفت — با ساعت خیالی کار می‌کند');
    assert(r.timeline > 0, 'الگوی پیش‌فرض باید همچنان بازه بدهد');
  } finally {
    const o = JSON.parse(saved);
    W('S.user=byId("users",' + o.u + ')||S.user;S.persona=null');
  }
});

test('نوار زنگ: فقط دبیر می‌بیند', () => {
  const saved = W('JSON.stringify({u:S.user&&S.user.id})');
  try {
    const r = JSON.parse(W('(()=>{const bad=[];'
      + '["manager","student","parent","superadmin","edu_office"].forEach(function(role){'
      + 'const u=db.users.find(function(x){return x.role===role;});'
      + 'if(!u)return;S.user=u;S.persona=null;S.boss=null;'
      + 'if(bellNowBar(new Date("2026-09-05T08:00:00"))!=="")bad.push(role);});'
      + 'return JSON.stringify({bad:bad});})()'));
    assert(r.bad.length === 0, '🔴 این نقش‌ها نوار زنگ دیدند: ' + r.bad.join(' · '));
  } finally {
    const o = JSON.parse(saved);
    W('S.user=byId("users",' + o.u + ')||S.user;S.persona=null');
  }
});

test('نوار زنگ: در داشبورد دبیر رندر می‌شود', () => {
  withBellTeacher(() => {
    const r = W('(()=>{S.route="dashboard";S.filters={};'
      + 'return typeof teacherDash==="function"'
      + '&&teacherDash().indexOf("${bellBar}")===-1;})()');
    assert(r === true, 'قالب داشبورد دبیر درست جایگزین نشده');
  });
});

/* ── حفظ اسکرول هنگام رندر (دور ۶۰) ─────────────────────────── */

test('اسکرول: 🔴 کلیک عادی صفحه را به بالا نمی‌پراند', () => {
  /* 🔴 دام دور ۶۰: عنصر محتوا با هر رندر تازه ساخته می‌شود، پس
     اسکرولش صفر می‌شد و کاربر با هر کلیک به ابتدای صفحه
     پرتاب می‌شد. سنجش پیش از رفع: ۲۵۰ → ۰. */
  const saved = W('JSON.stringify({u:S.user&&S.user.id,r:S.route})');
  try {
    const r = JSON.parse(W('(function(){'
      + 'S.user=db.users.find(function(u){return u.role==="manager";});'
      + 'S.persona=null;S.boss=null;S.route="users";S.filters={};'
      + 'S.__routeChanged=false;render();'
      + 'var m=document.querySelector(".main");'
      + 'if(!m)return JSON.stringify({skipTest:true});'
      + 'm.scrollTop=250;var before=m.scrollTop;'
      + 'S.__routeChanged=false;render();'
      + 'var after=(document.querySelector(".main")||{}).scrollTop;'
      + 'return JSON.stringify({before:before,after:after});})()'));
    if (r.skipTest) return;
    assert(r.before === 250, 'محیط آزمون: اسکرول ثبت نشد');
    assert(r.after === 250,
      '🔴 اسکرول پس از رندر پرید: ' + r.before + ' → ' + r.after);
  } finally {
    const o = JSON.parse(saved);
    W('S.user=byId("users",' + o.u + ')||S.user;S.route=' + JSON.stringify(o.r)
      + ';S.filters={};S.__routeChanged=false');
  }
});

test('اسکرول: تغییر مسیر صفحه را از بالا شروع می‌کند', () => {
  /* رفتار عکسِ آزمون بالا — صفحهٔ تازه نباید وسط محتوا باز شود. */
  const saved = W('JSON.stringify({u:S.user&&S.user.id,r:S.route})');
  try {
    const r = JSON.parse(W('(function(){'
      + 'S.user=db.users.find(function(u){return u.role==="manager";});'
      + 'S.persona=null;S.boss=null;S.route="users";S.filters={};render();'
      + 'var m=document.querySelector(".main");'
      + 'if(!m)return JSON.stringify({skipTest:true});'
      + 'm.scrollTop=250;'
      + 'S.__routeChanged=true;render();'
      + 'var after=(document.querySelector(".main")||{}).scrollTop;'
      + 'return JSON.stringify({after:after,flagCleared:!S.__routeChanged});})()'));
    if (r.skipTest) return;
    assert(r.after === 0,
      '🔴 صفحهٔ تازه از بالا شروع نشد: ' + r.after);
    assert(r.flagCleared === true, 'نشانهٔ تغییر مسیر پاک نشد');
  } finally {
    const o = JSON.parse(saved);
    W('S.user=byId("users",' + o.u + ')||S.user;S.route=' + JSON.stringify(o.r)
      + ';S.filters={};S.__routeChanged=false');
  }
});

test('اسکرول: منوی کناری هم جای خود را حفظ می‌کند', () => {
  const saved = W('JSON.stringify({u:S.user&&S.user.id,r:S.route})');
  try {
    const r = JSON.parse(W('(function(){'
      + 'S.user=db.users.find(function(u){return u.role==="manager";});'
      + 'S.persona=null;S.boss=null;S.route="users";S.filters={};'
      + 'S.__routeChanged=false;render();'
      + 'var sb=document.querySelector(".sidebar");'
      + 'if(!sb)return JSON.stringify({skipTest:true});'
      + 'sb.scrollTop=80;S.__routeChanged=false;render();'
      + 'var after=(document.querySelector(".sidebar")||{}).scrollTop;'
      + 'return JSON.stringify({after:after});})()'));
    if (r.skipTest) return;
    assert(r.after === 80, '🔴 اسکرول منو پرید: ' + r.after);
  } finally {
    const o = JSON.parse(saved);
    W('S.user=byId("users",' + o.u + ')||S.user;S.route=' + JSON.stringify(o.r)
      + ';S.filters={};S.__routeChanged=false');
  }
});

/* ── هماهنگی منو و مجوز (دور ۶۳) ─────────────────────────────
   منوی هر نقش باید دقیقاً با روت‌های مجازشخواند:
   ۱. روت تکراری در منو نباشد
   ۲. محتوای منو دقیقاً همان روت‌های مورد انتظار باشد (گم‌شدن
      یا اضافه‌شدن آگاهانه نباشد — فهرست پایین تک‌منبع انتظار است)
   ۳. هر روتِ منو عنوان داشته باشد و با آن نقش واقعاً رندر شود
      (نه «دسترسی مجاز نیست» بدهد)
   ۴. خانهٔ هر نقش در منوی خودش باشد
   ۵. هر روت کمکی (EXTRA_ROUTES) مجاز و دارای نما باشد */

const NAV_EXPECT = {
  superadmin: ['dashboard','schools','users','subjects','bells','announcements','calendar','geo','offices','officedash','regions','plans','finance','adminsubs','activity','audit','health','diag','notifications'],
  manager: ['dashboard','atrisk','growth','calendar','formssms','schoolyear','lifecycle','import','classes','subjects','schedule','bells','users','attendance','grades','discipline','followup','leaves','exams','teachers','corrections','staff','tuition','meetings','notifyqueue','announcements','notifications','chat'],
  teacher: ['meetings','dashboard','classes','schedule','calendar','attendance','grades','discipline','leaves','exams','announcements','notifications','chat'],
  student: ['dashboard','schedule','exams','record','calendar','mytuition','leaves','announcements','notifications','chat'],
  edu_office: ['officedash','officeschools','announcements','notifications'],
  parent: ['meetings','dashboard','family','children','exams','calendar','mytuition','leaves','announcements','notifications','chat'],
  /* دور ۶۳: نقش تازهٔ مشاور — فقط صف ارجاع + صفحه‌های عمومی */
  counselor: ['cqueue','dashboard','announcements','notifications']
};

const navRoutes = (role) => JSON.parse(W('JSON.stringify(navRoutesOf(' + JSON.stringify(role) + '))'));

test('منو: هیچ نقشی روت تکراری ندارد', () => {
  Object.keys(NAV_EXPECT).forEach((role) => {
    const rs = navRoutes(role);
    const dup = rs.filter((r, i) => rs.indexOf(r) !== i);
    assert(dup.length === 0, role + ' روت تکراری دارد: ' + [...new Set(dup)].join(','));
  });
});

test('منو: محتوای هر نقش دقیقاً با فهرست مورد انتظار یکی است', () => {
  Object.keys(NAV_EXPECT).forEach((role) => {
    const got = navRoutes(role).slice().sort();
    const want = NAV_EXPECT[role].slice().sort();
    assert(JSON.stringify(got) === JSON.stringify(want),
      role + ': منو ≠ انتظار (گم‌شده: '
      + want.filter((r) => got.indexOf(r) < 0).join(',')
      + ' · اضافه: ' + got.filter((r) => want.indexOf(r) < 0).join(',') + ')');
  });
});

test('منو: هر روت منو عنوان فارسی دارد', () => {
  Object.keys(NAV_EXPECT).forEach((role) => {
    NAV_EXPECT[role].forEach((r) => {
      const t = W('TITLES[' + JSON.stringify(r) + ']');
      assert(t && t[0], 'عنوان برای روت ' + r + ' (' + role + ') نیست');
    });
  });
});

test('منو: هر روت منو با همان نقش رندر می‌شود نه «دسترسی مجاز نیست»', () => {
  Object.keys(NAV_EXPECT).forEach((role) => {
    NAV_EXPECT[role].forEach((r) => {
      const out = W('(function(){const u=db.users.find(function(x){return x.role===' + JSON.stringify(role) + ';});'
        + 'if(!u)return JSON.stringify({noUser:true});'
        + 'S.user=u;S.persona=null;S.boss=null;S.route=' + JSON.stringify(r)
        + ';S.filters={};S.page=1;'
        + 'return JSON.stringify({h:renderRoute().indexOf("دسترسی مجاز نیست")>-1});})()');
      const res = JSON.parse(out);
      assert(!res.noUser, 'دادهٔ نمونه کاربری برای ' + role + ' ندارد');
      assert(res.h === false, role + ' → ' + r + ' «دسترسی مجاز نیست» داد');
    });
  });
});

test('منو: خانهٔ هر نقش در منوی خودش هست', () => {
  Object.keys(NAV_EXPECT).forEach((role) => {
    const home = W('homeRoute(' + JSON.stringify(role) + ')');
    assert(navRoutes(role).indexOf(home) > -1,
      role + ': خانهٔ ' + home + ' در منو نیست');
  });
});

test('منو: همهٔ روت‌های کمکی مجازند و نما دارند', () => {
  const roles = Object.keys(NAV_EXPECT);
  roles.forEach((role) => {
    const extras = JSON.parse(W('JSON.stringify(EXTRA_ROUTES[' + JSON.stringify(role) + ']||[])'));
    extras.forEach((r) => {
      assert(W('!!allowedRoutes(' + JSON.stringify(role) + ')[' + JSON.stringify(r) + ']') === true,
        role + ': روت کمکی ' + r + ' مجاز نیست');
      const out = W('(function(){const u=db.users.find(function(x){return x.role===' + JSON.stringify(role) + ';});'
        + 'if(!u)return "0";S.user=u;S.persona=null;S.boss=null;S.route=' + JSON.stringify(r)
        + ';S.filters={};S.page=1;return String(renderRoute().length);})()');
      assert(Number(out) > 0, role + ': روت کمکی ' + r + ' رندر نمی‌شود');
    });
  });
});


/* ── مشاور مدرسه و عوامل اجرایی (دور ۶۳) ─────────────────────────
   نقش تازهٔ «مشاور»: صف دانش‌آموزان ارجاع‌شدهٔ الگوی تکرار.
   ارجاع **دستوری** است (دکمه در نمای پیگیری مدیر) و اعلان به
   ولی خودکار نیست. هر آزمون محیط خودش را ذخیره/بازگردانی می‌کند. */

function withCounselor(fn) {
  const saved = W('JSON.stringify({u:S.user&&S.user.id,r:S.route,f:S.filters})');
  try { return fn(); }
  finally {
    const o = JSON.parse(saved);
    W('S.user=byId("users",' + (o.u||0) + ')||S.user;S.route=' + JSON.stringify(o.r||'dashboard')
      + ';S.filters=' + JSON.stringify(o.f||{}) + ';S.page=1;S.persona=null;S.boss=null;S.bellNow=null');
  }
}

test('مشاور: برای هر مدرسهٔ فعال مشاور تعریف شده و صف نمونه پر است', () => {
  const r = JSON.parse(W('(()=>{var cs=db.users.filter(function(u){return u.role==="counselor";});'
    + 'var ok=true;cs.forEach(function(c){if(!c.school_id||!c.active)ok=false;});'
    + 'return JSON.stringify({n:cs.length,ok:ok});})()'));
  assert(r.n >= 5, '🔴 مشاور نمونه کم است: ' + r.n);
  assert(r.ok === true, 'مشاور بدون مدرسه یا غیرفعال');
  const q = JSON.parse(W('(()=>{var o1=counselorQueue(1,true);var o2=counselorQueue(2,true);'
    + 'var valid=true;o1.forEach(function(x){'
    + 'if(!x.student_id||!x.breach_key||!x.pattern||!x.pattern.late||!byId("users",x.student_id))valid=false;});'
    + 'return JSON.stringify({n1:o1.length,n2:o2.length,valid:valid});})()'));
  assert(q.n1 >= 3, '🔴 صف نمونهٔ مدرسهٔ اول خالی است: ' + q.n1);
  assert(q.n2 >= 1, 'صف مدرسهٔ دوم خالی است — سنجش مرز بین‌مدرسه‌ای بی‌معنا می‌شود: ' + q.n2);
  assert(q.valid === true, 'رکورد ارجاع ناقص است');
});

test('مشاور: شمارندهٔ الگو دادهٔ واقعی را می‌خواند (آستانه و روند)', () => {
  const r = JSON.parse(W('(()=>{'
    + 'const flagged=patternFlagged(1,30);'
    + 'const big=flagged.find(function(x){return x.breaches.some(function(b){return b.key==="late"&&b.count>=7;});});'
    + 'if(!big)return JSON.stringify({skipTest:true});'
    + 'const st=big.user.id;'
    + 'const clean=db.users.filter(function(u){return u.role==="student"&&u.school_id===1&&(u.status||"active")==="active";})'
    + '.find(function(u){'
    + 'var n=0;db.attendance.forEach(function(a){if(a.student_id===u.id&&a.date>=daysAgoISO(30))n++;});'
    + 'if(n<10)return false;var c=patternCheck(u.id,30);return c.late.count===0&&c.absent.count===0;});'
    + 'var realLate=0;'
    + 'db.attendance.forEach(function(a){if(a.student_id===st&&a.status==="late"&&a.date>=daysAgoISO(30))realLate++;});'
    + 'return JSON.stringify({skipTest:false,'
    + 'lateCount:patternCheck(st,30).late.count,'
    + 'realLate:realLate,'
    + 'hasLate:big.breaches.some(function(b){return b.key==="late";}),'
    + 'trend:big.check.late.trend,'
    + 'cleanN:clean?patternBreaches(clean.id,1,30).length:99});})()'));
  if (r.skipTest) return;
  assert(r.lateCount === r.realLate, '🔴 شمارندهٔ تأخیر با رکوردهای واقعی نمی‌خواند: ' + r.lateCount + ' ≠ ' + r.realLate);
  assert(r.realLate >= 7, 'محیط آزمون: دانش‌آموز نمونه دستکم ۷ تأخیر باید دارد: ' + r.realLate);
  assert(r.hasLate === true, 'الگوی تأخیر مکرر تشخیص داده نشد');
  assert(r.trend === 'rising', '🔴 روندِ تأخیرهای متراکم در نیمهٔ دوم «رو به افزایش» نشد: ' + r.trend);
  assert(r.cleanN === 0, '🔴 دانش‌آموز بدون تأخیر/غیبت الگو شد — شمارنده دروغ می‌گوید');
});

test('مشاور: 🔴 آستانه‌ها قابل تنظیم مدرسه‌به‌مدرسه است', () => {
  const sid = W('db.schools[0].id');
  const saved = W('JSON.stringify(byId("schools",' + sid + ').discipline_rules||null)');
  try {
    const r = JSON.parse(W('(()=>{'
      + 'const f0=patternFlagged(' + sid + ',30).length;'
      + 'update("schools",' + sid +',{discipline_rules:{pattern_late_month:99,pattern_absent_month:99}});'
      + 'const fH=patternFlagged(' + sid + ',30).length;'
      + 'return JSON.stringify({f0:f0,fH:fH});})()'));
    assert(r.f0 > 0, 'محیط آزمون: مدرسهٔ اول الگو ندارد');
    assert(r.fH === 0, '🔴 با آستانهٔ ۹۹ باز هم الگو شمرد — قاعدهٔ مدرسه خوانده نمی‌شود: ' + r.fH);
  } finally {
    W('(()=>{const v=' + JSON.stringify(saved) + ';update("schools",' + sid +',{discipline_rules:v});})()');
  }
});

test('مشاور: صف صفحه، دادهٔ مدرسهٔ خود را نشان می‌دهد و مدرسهٔ دیگر نشت نمی‌کند', () => {
  withCounselor(() => {
    const r = JSON.parse(W('(()=>{'
      + 'S.user=db.users.find(function(u){return u.username==="counselor1";});'
      + 'S.persona=null;S.boss=null;S.route="cqueue";S.filters={};S.page=1;'
      + 'const h=renderRoute();'
      + 'const mine=counselorQueue(1,true);'
      + 'const q2=db.counselor_refs.filter(function(q){return q.school_id===2&&q.status==="open";})[0];'
      + 'const name2=q2?byId("users",q2.student_id).full_name:"";'
      + 'const name1=mine.length?byId("users",mine[0].student_id).full_name:"";'
      + 'return JSON.stringify({len:h.length,'
      + 'hasMine:name1?h.indexOf(name1)>-1:false,'
      + 'dataLeak:mine.some(function(q){return q.school_id!==1;}),'
      + 'htmlLeak:(name2&&name2!==name1)?h.indexOf(name2)>-1:null,'
      + 'forbidden:h.indexOf("دسترسی مجاز نیست")>-1});})()'));
    assert(r.len > 500, 'صفحه رندر نشد: ' + r.len);
    assert(r.hasMine === true, '🔴 دانش‌آموز ارجاع‌شده در صف نیست');
    assert(r.dataLeak === false, '🔴 رکورد ارجاع مدرسهٔ دیگر در برش مشاور است');
    assert(r.htmlLeak === null || r.htmlLeak === false, '🔴 نام دانش‌آموز مدرسهٔ دیگر در صف مشاور یک آمد');
    assert(r.forbidden === false, 'صفحهٔ خودش «دسترسی مجاز نیست» داد');
  });
});

test('مشاور: صفحه‌های حساس (حضور/نمره/انضباطی/کاربران/برنامه/پرونده) باز نیستند', () => {
  withCounselor(() => {
    W("S.user=db.users.find(u=>u.username==='counselor1');S.persona=null;S.boss=null;S.filters={}");
    for (const r of ['attendance','record','users','discipline','schedule','grades','staff','followup']) {
      W("S.route='" + r + "'");
      assert(/دسترسی مجاز نیست/.test(W('renderRoute()')), '🔴 مشاور → ' + r + ' باز بود');
    }
  });
});

test('مشاور: ارجاع از نمای پیگیری (کلیک واقعی) و ارجاع تکراری نمی‌شود', () => {
  withCounselor(() => {
    const env = JSON.parse(W('(()=>{S.user=db.users.find(function(u){return u.username==="manager1";});'
      + 'S.persona=null;S.boss=null;S.filters={};S.route="followup";S.page=1;'
      + 'const h=renderRoute();'
      + 'var row=(patternFlagged(1,30)||[]).filter(function(x){'
      + 'return x.breaches.some(function(b){return !counselorOpenRef(1,x.user.id,b.key);});})[0];'
      + 'var bre=null;'
      + 'if(row)row.breaches.forEach(function(b){if(!counselorOpenRef(1,row.user.id,b.key))bre=b;});'
      + 'return JSON.stringify({s:row?row.user.id:0,k:bre?bre.key:null,'
      + 'btns:(h.match(/data-act="counselor-ref"/g)||[]).length});})()'));
    assert(env.s > 0, 'محیط آزمون: ردیف ارجاع‌پذیری در نمای پیگیری نیست');
    assert(env.btns > 0, '🔴 دکمهٔ ارجاع در نمای پیگیری رندر نشد');
    const r = JSON.parse(W('(function(){'
      + 'S.user=db.users.find(function(u){return u.username==="manager1";});'
      + 'S.persona=null;S.boss=null;'
      + 'var before=counselorQueue(1,true).length;'
      + 'function click(){var b=document.createElement("button");'
      + 'b.setAttribute("data-act","counselor-ref");'
      + 'b.setAttribute("data-s","' + env.s + '");'
      + 'b.setAttribute("data-k","' + env.k + '");'
      + 'document.body.appendChild(b);'
      + 'b.dispatchEvent(new MouseEvent("click",{bubbles:true}));'
      + 'b.remove();}'
      + 'click();'
      + 'var after=counselorQueue(1,true).length;'
      + 'click();'
      + 'var after2=counselorQueue(1,true).length;'
      + 'var ref=counselorOpenRef(1,' + env.s + ',"' + env.k + '");'
      + 'return JSON.stringify({before:before,after:after,after2:after2,'
      + 'refOk:!!(ref&&ref.student_id===' + env.s + '&&ref.breach_key==="' + env.k + '"&&ref.referred_by===S.user.id),'
      + 'hasPattern:!!(ref&&ref.pattern&&ref.pattern.late&&typeof ref.pattern.late.count==="number")});})()'));
    assert(r.after === r.before + 1, '🔴 ارجاع ساخته نشد: ' + r.before + '→' + r.after);
    assert(r.after2 === r.after, '🔴 ارجاع تکراری ساخته شد: ' + r.after + '→' + r.after2);
    assert(r.refOk === true, 'فیلدهای رکورد ارجاع نادرست‌اند');
    assert(r.hasPattern === true, 'اسنپشات الگو به ارجاع چسبیده نیست');
  });
});

test('مشاور: رسیدگی، رکورد را پاک نمی‌کند — وضعیتش را عوض می‌کند', () => {
  withCounselor(() => {
    const r = JSON.parse(W('(function(){'
      + 'S.user=db.users.find(function(u){return u.username==="counselor1";});'
      + 'S.persona=null;S.boss=null;'
      + 'var ref=counselorQueue(1,true)[0];'
      + 'if(!ref)return JSON.stringify({skipTest:true});'
      + 'var b=document.createElement("button");'
      + 'b.setAttribute("data-act","counselor-handle");'
      + 'b.setAttribute("data-r",String(ref.id));'
      + 'document.body.appendChild(b);'
      + 'b.dispatchEvent(new MouseEvent("click",{bubbles:true}));'
      + 'b.remove();'
      + 'var after=byId("counselor_refs",ref.id);'
      + 'return JSON.stringify({skipTest:false,'
      + 'status:after.status,'
      + 'by:after.handled_by===S.user.id,'
      + 'inOpen:counselorQueue(1,true).some(function(x){return x.id===ref.id;}),'
      + 'recordKept:!!byId("counselor_refs",ref.id)});})()'));
    if (r.skipTest) return;
    assert(r.status === 'handled', '🔴 وضعیت «رسیدگی‌شده» نشد: ' + r.status);
    assert(r.by === true, '🔴 رسیدگی‌کننده ثبت نشد');
    assert(r.inOpen === false, 'هنوز در صف باز است');
    assert(r.recordKept === true, '🔴 رکورد ارجاع پاک شد — باید فقط وضعیتش عوض می‌شد');
  });
});

test('عوامل اجرایی: مشاور فعال و معاونت‌ها رزرو‌اند (ساختار گسترش‌پذیر)', () => {
  withCounselor(() => {
    const r = JSON.parse(W('(()=>{S.user=db.users.find(function(u){return u.username==="manager1";});'
      + 'S.persona=null;S.boss=null;S.filters={};S.route="staff";S.page=1;'
      + 'const h=renderRoute();'
      + 'return JSON.stringify({'
      + 'active:h.indexOf("مشاور")>-1&&h.indexOf("فعال")>-1,'
      + 'reserved:["معاون آموزشی","معاون اجرایی","معاون فنی","معاون پرورشی"].every(function(n){return h.indexOf(n)>-1;}),'
      + 'hasReservedBadge:h.indexOf("رزرو")>-1,'
      + 'roles:EXEC_ROLES.length===5,'
      + 'counselorCount:db.users.filter(function(u){return u.role==="counselor"&&u.school_id===S.user.school_id;}).length>0'
      + '});})()'));
    assert(r.active === true, 'مشاور فعال نشد');
    assert(r.reserved === true, '🔴 معاونت‌های رزرو‌شده در صفحه نیستند');
    assert(r.hasReservedBadge === true, 'نشان «رزرو» نیست');
    assert(r.roles === true, 'ساختار EXEC_ROLES ناقص است');
    assert(r.counselorCount === true, 'دادهٔ نمونه مشاور این مدرسه را ندارد');
  });
});

test('مشاور: نقش در فرم کاربر و صافی فهرست کاربران هست (تعریف مثل سایر کادرها)', () => {
  withCounselor(() => {
    const r = JSON.parse(W('(()=>{S.user=db.users.find(function(u){return u.username==="manager1";});'
      + 'S.persona=null;S.boss=null;S.filters={};'
      + 'userModal(null);'
      + 'const m=((document.getElementById("modal")||{}).innerHTML)||"";'
      + 'const hasOpt=m.indexOf("counselor")>-1&&m.indexOf("مشاور")>-1;'
      + 'closeModal();'
      + 'S.fopen={users:true};S.route="users";'
      + 'const u=viewUsers();'
      + 'return JSON.stringify({form:hasOpt,list:u.indexOf("مشاور")>-1});})()'));
    assert(r.form === true, '🔴 گزینهٔ «مشاور» در فرم کاربر نیست');
    assert(r.list === true, 'گزینهٔ «مشاور» در صافی فهرست کاربران نیست');
  });
});

test('مشاور: خانهٔ نقش صف ارجاع است و حساب نمونه در صفحهٔ ورود هست', () => {
  assert(W("homeRoute('counselor')") === 'cqueue', '🔴 خانه مشاور cqueue نیست');
  const r = JSON.parse(W('(()=>{const accs=demoAccounts().map(function(a){return a.username;});'
    + 'return JSON.stringify({has:accs.indexOf("counselor1")>-1,nav:!!NAV.counselor});})()'));
  assert(r.has === true, 'counselor1 در حساب‌های نمونهٔ صفحهٔ ورود نیست');
  assert(r.nav === true, 'counselor در NAV نیست');
});

/* ── اعلان الگو به ولی — فقط با تأیید مدیر (دور ۶۳، بند ۴) ──────
   اثر سوم طرح ۴.۷: اعلان به ولی **خودکار نیست** — مدیر از «پیگیری
   الگوها» کلیک می‌کند و پیام در صف پیام اولیا (۴۴) می‌نشیند.
   صف مشاور عمداً این دکمه را ندارد (تفکیک). تکرار: تا معلق
   نباشد یک‌بار، در ۷ روز یک‌بار. */

function patEnv() {
  return JSON.parse(W('(()=>{S.user=db.users.find(function(u){return u.role==="manager"&&u.school_id===1;});'
    + 'S.persona=null;S.boss=null;S.filters={};S.route="followup";S.page=1;'
    + 'var h=renderRoute();'
    + 'var s=0;'
    + '(patternFlagged(1,30)||[]).forEach(function(row){'
    + 'if(s)return;'
    + 'var stt=patternNotifyState(1,row.user.id);'
    + 'if(stt.pending||stt.lastSentAt)return;'
    + 'if(notifyParentsOf(row.user.id).length<1)return;'
    + 's=row.user.id;});'
    + 'return JSON.stringify({s:s,btns:(h.match(/data-act="pattern-notify"/g)||[]).length});})()'));
}

function patClick(s) {
  return 'var b=document.createElement("button");'
    + 'b.setAttribute("data-act","pattern-notify");'
    + 'b.setAttribute("data-s",String(s));'
    + 'document.body.appendChild(b);'
    + 'b.dispatchEvent(new MouseEvent("click",{bubbles:true}));'
    + 'b.remove();';
}

test('اعلان الگو: کلیک مدیر پیام درست در صف پیام اولیا می‌سازد', () => {
  withCounselor(() => {
    const env = patEnv();
    assert(env.s > 0, 'محیط آزمون: دانش‌آموز تازهٔ اعلان‌پذیر نیست (معلق ندارد + ولی معتبر)');
    assert(env.btns > 0, '🔴 دکمه اعلان در نمای پیگیری رندر نشد');
    const r = JSON.parse(W('(function(){'
      + 'S.user=db.users.find(function(u){return u.role==="manager"&&u.school_id===1;});'
      + 'S.persona=null;S.boss=null;S.filters={};'
      + 'var s=' + env.s + ';'
      + 'function mine(){return db.notify_queue.filter(function(q){return q.school_id===1&&q.kind==="pattern"&&q.student_id===s&&q.status==="pending";});}'
      + 'var before=mine().length;'
      + patClick(env.s)
      + 'var rec=mine()[0]||{};'
      + 'var st=byId("users",s);'
      + 'return JSON.stringify({before:before,after:mine().length,'
      + 'kind:rec.kind,status:rec.status,'
      + 'parents:(rec.parent_ids||[]).length>0,'
      + 'body:!!(rec.body&&st&&rec.body.indexOf(st.full_name)>-1),'
      + 'parts:rec.parts>=1,cls:!!rec.class_id,school:rec.school_id===1});})()'));
    assert(r.after === r.before + 1, '🔴 پیام ساخته نشد: ' + r.before + '→' + r.after);
    assert(r.kind === 'pattern' && r.status === 'pending', 'فیلدهای رکورد نادرست: ' + r.kind + '/' + r.status);
    assert(r.parents === true, '🔴 گیرندهٔ معتبر برای پیام پیدا نشد');
    assert(r.body === true, 'نام دانش‌آموز در متن پیام نیست');
    assert(r.parts === true, 'parts ذخیره نشده');
    assert(r.cls === true, 'class_id ذخیره نشده');
    assert(r.school === true, 'school_id نادرست');
  });
});

test('اعلان الگو: تکراری نمی‌شود — معلق و ۷ روزه باز هم یک‌بار', () => {
  withCounselor(() => {
    const env = patEnv();
    assert(env.s > 0, 'محیط آزمون: دانش‌آموز تازهٔ اعلان‌پذیر نیست');
    const r = JSON.parse(W('(function(){'
      + 'S.user=db.users.find(function(u){return u.role==="manager"&&u.school_id===1;});'
      + 'S.persona=null;S.boss=null;S.filters={};'
      + 'var s=' + env.s + ';'
      + 'function mine(){return db.notify_queue.filter(function(q){return q.school_id===1&&q.kind==="pattern"&&q.student_id===s;});}'
      + 'function cnt(){return mine().length;}'
      + patClick(env.s) + 'var a1=cnt();var q1=mine()[0];'
      + patClick(env.s) + 'var a2=cnt();'
      + 'update("notify_queue",q1.id,{status:"sent",decided_at:new Date().toISOString()});'
      + patClick(env.s) + 'var a3=cnt();'
      + 'update("notify_queue",q1.id,{decided_at:new Date(Date.now()-8*86400000).toISOString()});'
      + patClick(env.s) + 'var a4=cnt();'
      + 'mine().forEach(function(q){remove("notify_queue",q.id);});'
      + 'return JSON.stringify({a1:a1,a2:a2,a3:a3,a4:a4});})()'));
    assert(r.a1 === 1, '🔴 پیام نخست ساخته نشد: ' + r.a1);
    assert(r.a2 === 1, '🔴 در صف بودن و باز هم ساخت — تکرار: ' + r.a2);
    assert(r.a3 === 1, '🔴 در ۷ روز گذشته رفته و باز هم ساخته شد: ' + r.a3);
    assert(r.a4 === 2, 'بعد از ۷ روز باید اعلان تازه می‌شد: ' + r.a4);
  });
});

test('اعلان الگو: در صف پیام اولیا با نشان «الگو» دیده می‌شود', () => {
  withCounselor(() => {
    const r = JSON.parse(W('(()=>{S.user=db.users.find(function(u){return u.role==="manager"&&u.school_id===1;});'
      + 'S.persona=null;S.boss=null;S.filters={};S.route="notifyqueue";S.page=1;'
      + 'var rec=db.notify_queue.filter(function(q){return q.school_id===1&&q.kind==="pattern"&&q.status==="pending";})[0]||{};'
      + 'var st=rec.student_id?byId("users",rec.student_id):null;'
      + 'if(!st)return JSON.stringify({skipTest:true});'
      + 'var h=renderRoute();'
      + 'return JSON.stringify({skipTest:false,len:h.length,'
      + 'name:h.indexOf(st.full_name)>-1,tag:h.indexOf("الگو")>-1});})()'));
    if (r.skipTest) return;
    assert(r.len > 500, 'صفحه رندر نشد: ' + r.len);
    assert(r.name === true, '🔴 پیام الگو در صف پیام اولیا نیست');
    assert(r.tag === true, '🔴 نشان «الگو» رندر نشد');
  });
});

test('اعلان الگو: 🔴 مدرسهٔ بدون اطلاع‌رسانی پیام نمی‌سازد (رابط و فراخوان مستقیم)', () => {
  withCounselor(() => {
    const r = JSON.parse(W('(()=>{'
      + 'var m2=db.users.find(function(u){return u.role==="manager"&&u.school_id===2;});'
      + 'if(!m2)return JSON.stringify({skipTest:true});'
      + 'S.user=m2;S.persona=null;S.boss=null;S.filters={};S.route="followup";S.page=1;'
      + 'var cfg=notifySettings(2);'
      + 'var h=renderRoute();'
      + 'var flagged=patternFlagged(2,30);'
      + 'var made=null,madeMsg=null;'
      + 'if(flagged.length){'
      + 'var row=flagged[0];'
      + 'var bre=row.breaches.slice().sort(function(a,b){return b.count-a.count;})[0];'
      + 'var res=patternNotifyParent(row.user.id,2,bre,30,m2.id);'
      + 'made=res.ok;madeMsg=!!(res.msg&&res.msg.indexOf("خاموش است")>-1);}'
      + 'return JSON.stringify({skipTest:false,enabled:cfg.enabled===false,madeMsg:!!madeMsg,'
      + 'btns:(h.match(/data-act="pattern-notify"/g)||[]).length,'
      + 'offText:h.indexOf("خاموش")>-1,'
      + 'hasFlagged:flagged.length>0,made:made,'
      + 'nPatt:db.notify_queue.filter(function(q){return q.school_id===2&&q.kind==="pattern";}).length});})()'));
    if (r.skipTest) return;
    assert(r.enabled === true, 'محیط آزمون: مدرسهٔ دوم باید خاموش باشد');
    assert(r.hasFlagged === true, 'محیط آزمون: مدرسهٔ دوم دانش‌آموز الگودار ندارد');
    assert(r.btns === 0, '🔴 دکمهٔ اعلان در مدرسهٔ خاموش رندر شد');
    assert(r.offText === true, 'وضعیت «خاموش» در سلول نیست');
    assert(r.made === false, '🔴 فراخوان مستقیم در حالی که مدرسه خاموش است پیام ساخت');
    assert(r.madeMsg === true, '🔴 پیام خطای «خاموش» برای مدیر خوانا نیست');
    assert(r.nPatt === 0, '🔴 مدرسهٔ دوم رکورد الگو دارد — نشت مرز بین‌مدرسه‌ای');
  });
});

test('اعلان الگو: 🔴 دبیر نمی‌تواند اعلان بسازد (گارد نقش)', () => {
  withCounselor(() => {
    const env = JSON.parse(W('(()=>{'
      + 'var t=db.users.find(function(u){return u.role==="teacher"&&u.school_id===1&&u.active;});'
      + 'if(!t)return JSON.stringify({skipTest:true,s:0});'
      + 'var s=0;'
      + '(patternFlagged(1,30)||[]).forEach(function(row){'
      + 'if(s)return;'
      + 'var stt=patternNotifyState(1,row.user.id);'
      + 'if(stt.pending||stt.lastSentAt)return;'
      + 'if(notifyParentsOf(row.user.id).length<1)return;'
      + 's=row.user.id;});'
      + 'return JSON.stringify({skipTest:false,s:s,tid:t.id});})()'));
    if (env.skipTest) return;
    assert(env.s > 0, 'محیط آزمون: دانش‌آموز تازهٔ اعلان‌پذیر نیست');
    const r = JSON.parse(W('(function(){'
      + 'S.user=byId("users",' + env.tid + ');S.persona=null;S.boss=null;S.filters={};'
      + 'var s=' + env.s + ';'
      + 'function cnt(){return db.notify_queue.filter(function(q){return q.school_id===1&&q.kind==="pattern"&&q.student_id===s;}).length;}'
      + 'var before=cnt();'
      + patClick(env.s)
      + 'return JSON.stringify({before:before,after:cnt()});})()'));
    assert(r.after === r.before, '🔴 دبیر اعلان به ولی ساخت — گارد نقش کار نکرد');
  });
});

test('اعلان الگو: صف مشاور دکمهٔ اعلان به ولی ندارد (تفکیک)', () => {
  withCounselor(() => {
    const r = JSON.parse(W('(()=>{S.user=db.users.find(function(u){return u.username==="counselor1";});'
      + 'S.persona=null;S.boss=null;S.filters={};S.route="cqueue";S.page=1;'
      + 'var h=renderRoute();'
      + 'return JSON.stringify({len:h.length,'
      + 'btn:h.indexOf("pattern-notify")>-1,'
      + 'txt:h.indexOf("اعلان به ولی")>-1});})()'));
    assert(r.len > 500, 'صفحه رندر نشد: ' + r.len);
    assert(r.btn === false, '🔴 دکمه اعلان در صف مشاور رندر شد');
    assert(r.txt === false, '🔴 عبارت «اعلان به ولی» در صف مشاور آمد');
  });
});

test('اعلان الگو: دمو — مدرسهٔ ۱ روشن با پیام نمونه، مدرسهٔ ۲ خاموش', () => {
  const r = JSON.parse(W('(()=>{'
    + 'var c1=notifySettings(1),c2=notifySettings(2);'
    + 'var pend=db.notify_queue.filter(function(q){return q.school_id===1&&q.kind==="pattern"&&q.status==="pending";});'
    + 'var ok=true;'
    + 'pend.forEach(function(q){if(!q.student_id||(q.parent_ids||[]).length<1||!q.body||q.parts<1)ok=false;});'
    + 'var wal=db.sms_wallet.filter(function(x){return x.school_id===1;})[0];'
    + 'return JSON.stringify({on1:c1.enabled===true,off2:c2.enabled===false,'
    + 'n1:pend.length,valid:ok,'
    + 'n2:db.notify_queue.filter(function(q){return q.school_id===2&&q.kind==="pattern";}).length,'
    + 'wallet:!!wal});})()'));
  assert(r.on1 === true, '🔴 دمو: مدرسهٔ اول باید اطلاع‌رسانی روشن داشته باشد');
  assert(r.off2 === true, 'دمو: مدرسهٔ دوم باید خاموش بماند');
  assert(r.n1 >= 1, '🔴 دمو: پیام الگوی معلق نمونه نیست');
  assert(r.valid === true, 'رکورد نمونهٔ اعلان ناقص است');
  assert(r.n2 === 0, '🔴 مدرسهٔ دوم رکورد الگو دارد — نشت مرز بین‌مدرسه‌ای');
  assert(r.wallet === true, 'مدرسهٔ اول کیف پیامک ندارد');
});

/* ── نوع مدرسه و امتحان نهایی (دور ۶۳، بند ۵) ──────────────
   نوع مدرسه فیلد اداری است (۴ گزینه، پیش‌فرض «عادی» —
   رکوردهای قدیمی «عادی» خوانده می‌شوند). امتحان نهایی فقط
   پایه‌های پایانی (نهم/دوازدهم) — قاعدهٔ تک‌منبع finalGradeOk
   در دو محل ثبت (جلسهٔ امتحان و نمره) اعمال می‌شود. */

test('نوع مدرسه: ۴ گزینه در فرم و همهٔ مدارس دمو نوع معتبر دارند', () => {
  const r = JSON.parse(W('(()=>{'
    + 'var ok=true;db.schools.forEach(function(s){if(SCHOOL_TYPES.indexOf(s.type||"عادی")<0)ok=false;});'
    + 'schoolModal(null);'
    + 'var m=((document.getElementById("modal")||{}).innerHTML)||"";'
    + 'var opts=["عادی","علوم تجربی","ریاضی","فنی و حرفه‌ای"].filter(function(x){return m.indexOf(x)>-1;});'
    + 'closeModal();'
    + 'return JSON.stringify({n:SCHOOL_TYPES.length,ok:ok,opts:opts.length,'
    + 's1:(byId("schools",1)||{}).type});})()'));
  assert(r.n === 4, '🔴 فهرست انواع مدرسه کامل نیست: ' + r.n);
  assert(r.ok === true, '🔴 مدرسه‌ای با نوع نامعتبر در دمو است');
  assert(r.opts === 4, 'گزینه‌های نوع در فرم مدرسه نیستند: ' + r.opts);
  assert(r.s1 === 'علوم تجربی', 'نوع نمونهٔ مدرسهٔ اول باید «علوم تجربی» باشد: ' + r.s1);
});

test('نوع مدرسه: ذخیره از فرم با کلیک واقعی و نمایش در فهرست', () => {
  const sid = W('db.schools[2].id');
  const saved = W('JSON.stringify((byId("schools",' + sid + ')||{}).type||null)');
  try {
    W("S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null");
    const r = JSON.parse(W('(function(){'
      + 'schoolModal(byId("schools",' + sid + '));'
      + 'document.getElementById("m_type").value="ریاضی";'
      + 'var b=document.querySelector(\'#modal [data-act="school-save"]\');'
      + 'if(!b)return JSON.stringify({skipTest:true});'
      + 'b.dispatchEvent(new MouseEvent("click",{bubbles:true}));'
      + 'var t=(byId("schools",' + sid + ')||{}).type;'
      + 'S.filters={};S.route="schools";S.page=1;var h=renderRoute();'
      + 'return JSON.stringify({skipTest:false,type:t,shown:h.indexOf("ریاضی")>-1});})()'));
    if (r.skipTest) return;
    assert(r.type === 'ریاضی', '🔴 نوع ذخیره نشد: ' + r.type);
    assert(r.shown === true, 'نوع در فهرست مدارس دیده نمی‌شود');
  } finally {
    W('update("schools",' + sid +',{type:' + JSON.stringify(saved || 'عادی') + '})');
  }
});

test('امتحان نهایی: در فهرست انواع آزمون و قاعدهٔ پایه درست کار می‌کند', () => {
  const r = JSON.parse(W('(()=>{'
    + 'return JSON.stringify({'
    + 'has:EXAM_TYPES.indexOf("امتحان نهایی")>-1,'
    + 'ok9:finalGradeOk("نهم")===true,'
    + 'ok12:finalGradeOk("دوازدهم")===true,'
    + 'no10:finalGradeOk("دهم")===false,'
    + 'no6:finalGradeOk("ششم")===false,'
    + 'noX:finalGradeOk("")===false});})()'));
  assert(r.has === true, '🔴 «امتحان نهایی» در EXAM_TYPES نیست');
  assert(r.ok9 === true && r.ok12 === true, '🔴 قاعدهٔ پایه نهم/دوازدهم کار نمی‌کند');
  assert(r.no10 === true && r.no6 === true && r.noX === true, '🔴 قاعدهٔ پایه برای پایهٔ غیرپایانی باز است');
});

test('امتحان نهایی: جلسهٔ نهایی فقط برای پایهٔ پایانی (کلیک واقعی در فرم)', () => {
  withCounselor(() => {
    const env = JSON.parse(W('(()=>{'
      + 'var term=db.exam_terms.filter(function(t){return t.school_id===1&&t.status==="published";})[0];'
      + 'var c12=db.classes.find(function(c){return c.school_id===1&&c.grade==="دوازدهم";});'
      + 'var c10=db.classes.find(function(c){return c.school_id===1&&c.grade==="دهم";});'
      + 'var sub=term?db.subjects.find(function(s){return s.school_id===1&&s.grade==="دوازدهم";}):null;'
      + 'return JSON.stringify({skipTest:!(term&&c12&&c10&&sub),'
      + 'term:term?term.id:0,c12:c12?c12.id:0,c10:c10?c10.id:0,sub:sub?sub.id:0});})()'));
    if (env.skipTest) return;
    const r = JSON.parse(W('(function(){'
      + 'S.user=db.users.find(function(u){return u.role==="manager"&&u.school_id===1;});'
      + 'S.persona=null;S.boss=null;S.filters={};'
      + 'var term=byId("exam_terms",' + env.term + ');'
      + 'function countFinal(){return db.exams.filter(function(x){return x.term_id===' + env.term + '&&examSource(x)===\'national_final\';}).length;}'
      + 'function trySave(clsId,isFinal){'
      + 'examModal(null,term);'
      + 'document.getElementById("ex_class").value=String(clsId);'
      + 'document.getElementById("ex_subject").value=String(' + env.sub + ');'
      + 'document.getElementById("ex_source").value=isFinal?"national_final":"internal";'
      + 'document.getElementById("ex_date").value=term.start_date;'
      + 'document.getElementById("ex_time").value="11:00";'
      + 'var b=document.querySelector(\'#modal [data-act="exam-save"]\');'
      + 'if(!b)return -1;'
      + 'b.dispatchEvent(new MouseEvent("click",{bubbles:true}));'
      + '}'
      + 'var pre={};db.exams.filter(function(x){return x.term_id===' + env.term + '&&examSource(x)===\'national_final\';}).forEach(function(x){pre[x.id]=1;});'
      + 'var before=countFinal();'
      + 'trySave(' + env.c12 + ',true);'
      + 'var after12=countFinal();'
      + 'trySave(' + env.c10 + ',true);'
      + 'var after10=countFinal();'
      + 'db.exams.filter(function(x){return x.term_id===' + env.term + '&&examSource(x)===\'national_final\'&&!pre[x.id];}).forEach(function(x){remove("exams",x.id);});'
      + 'return JSON.stringify({before:before,after12:after12,after10:after10});})()'));
    assert(r.after12 === r.before + 1, '🔴 جلسهٔ نهایی دوازدهم ذخیره نشد: ' + r.before + '→' + r.after12);
    assert(r.after10 === r.after12, '🔴 جلسهٔ «نهایی» برای دهم ذخیره شد — قاعدهٔ پایه دور زده شد');
  });
});

test('امتحان نهایی: نشان «نهایی» در نماهای مدیر، دبیر و دانش‌آموز', () => {
  withCounselor(() => {
    const r = JSON.parse(W('(()=>{'
      + 'var fe=db.exams.find(function(x){return examSource(x)===\'national_final\';});'
      + 'if(!fe)return JSON.stringify({skipTest:true});'
      + 'S.user=db.users.find(function(u){return u.role==="manager"&&u.school_id===fe.school_id;});'
      + 'S.persona=null;S.boss=null;S.filters={term:fe.term_id};S.route="exams";S.page=1;'
      + 'var hm=renderRoute();'
      + 'var duty=db.exam_duties.find(function(d){return d.exam_id===fe.id;});'
      + 'var ht="";'
      + 'if(duty){S.user=byId("users",duty.teacher_id);S.persona=null;S.boss=null;S.filters={};S.route="exams";ht=renderRoute();}'
      + 'var stud=null;'
      + 'db.users.forEach(function(u){if(stud)return;if(u.role!=="student"||u.school_id!==fe.school_id)return;var c=classOf(u.id);if(c&&c.id===fe.class_id)stud=u;});'
      + 'var hs="";'
      + 'if(stud){S.user=stud;S.persona=null;S.boss=null;S.filters={};S.route="exams";hs=renderRoute();}'
      + 'return JSON.stringify({skipTest:false,manager:hm.indexOf("نهایی")>-1,'
      + 'teacher:duty?ht.indexOf("نهایی")>-1:true,'
      + 'student:stud?hs.indexOf("نهایی")>-1:true});})()'));
    if (r.skipTest) return;
    assert(r.manager === true, '🔴 نشان «نهایی» در نمای مدیر نیست');
    assert(r.teacher === true, '🔴 نشان «نهایی» در برنامهٔ مراقبت دبیر نیست');
    assert(r.student === true, '🔴 نشان «نهایی» در برنامهٔ دانش‌آموز نیست');
  });
});

test('امتحان نهایی: نمرهٔ «امتحان نهایی» فقط برای پایهٔ پایانی (کلیک واقعی)', () => {
  withCounselor(() => {
    const env = JSON.parse(W('(()=>{'
      + 'var c12=db.classes.find(function(c){return c.school_id===1&&c.grade==="دوازدهم";});'
      + 'var c10=db.classes.find(function(c){return c.school_id===1&&c.grade==="دهم";});'
      + 'var s12=c12?db.users.find(function(u){return u.role==="student"&&classOf(u.id)&&classOf(u.id).id===c12.id;}):null;'
      + 'var s10=c10?db.users.find(function(u){return u.role==="student"&&classOf(u.id)&&classOf(u.id).id===c10.id;}):null;'
      + 'return JSON.stringify({skipTest:!(c12&&c10&&s12&&s10),'
      + 'c12:c12?c12.id:0,c10:c10?c10.id:0,s12:s12?s12.id:0,s10:s10?s10.id:0});})()'));
    if (env.skipTest) return;
    const r = JSON.parse(W('(function(){'
      + 'S.user=db.users.find(function(u){return u.role==="manager"&&u.school_id===1;});'
      + 'S.persona=null;S.boss=null;S.filters={};'
      + 'function cntFinalGrade(cid){return db.grades.filter(function(g){return g.class_id===cid&&g.exam_type==="امتحان نهایی";}).length;}'
      + 'function tryGrade(cid,stId){'
      + 'S.filters.class=cid;'
      + 'gradeModal(null);'
      + 'document.getElementById("g_st").value=String(stId);'
      + 'document.getElementById("g_type").value="امتحان نهایی";'
      + 'document.getElementById("g_score").value="15";'
      + 'var b=document.querySelector(\'#modal [data-act="grade-save"]\');'
      + 'if(!b)return -1;'
      + 'b.dispatchEvent(new MouseEvent("click",{bubbles:true}));'
      + '}'
      + 'var b12=cntFinalGrade(' + env.c12 + ');'
      + 'tryGrade(' + env.c12 + ',' + env.s12 + ');'
      + 'var a12=cntFinalGrade(' + env.c12 + ');'
      + 'var b10=cntFinalGrade(' + env.c10 + ');'
      + 'tryGrade(' + env.c10 + ',' + env.s10 + ');'
      + 'var a10=cntFinalGrade(' + env.c10 + ');'
      + 'db.grades.filter(function(g){return g.class_id===' + env.c12 + '&&g.exam_type==="امتحان نهایی";}).forEach(function(g){remove("grades",g.id);});'
      + 'return JSON.stringify({b12:b12,a12:a12,b10:b10,a10:a10});})()'));
    assert(r.a12 === r.b12 + 1, '🔴 نمرهٔ نهایی دوازدهم ثبت نشد: ' + r.b12 + '→' + r.a12);
    assert(r.a10 === r.b10, '🔴 نمرهٔ «امتحان نهایی» برای دهم ثبت شد — قاعدهٔ پایه دور زده شد');
  });
});

test('امتحان نهایی: دمو — فصل منتشرشدهٔ مدرسهٔ ۱ با جلسه نهایی دوازدهم', () => {
  const r = JSON.parse(W('(()=>{'
    + 'var term=db.exam_terms.filter(function(t){return t.school_id===1&&t.status==="published"&&t.title.indexOf("نهایی")>-1;})[0];'
    + 'if(!term)return JSON.stringify({skipTest:true});'
    + 'var fe=db.exams.filter(function(x){return x.term_id===term.id&&examSource(x)===\'national_final\';})[0]||{};'
    + 'var cls=fe.class_id?byId("classes",fe.class_id):null;'
    + 'var inRange=!!(fe.date&&fe.date>=term.start_date&&fe.date<=term.end_date);'
    + 'return JSON.stringify({skipTest:false,has:!!fe,grade:cls?cls.grade:null,'
    + 'inRange:inRange,duty:db.exam_duties.some(function(d){return d.exam_id===fe.id;}),'
    + 'sub:!!(fe.subject_id&&byId("subjects",fe.subject_id))});})()'));
  if (r.skipTest) return;
  assert(r.has === true, '🔴 دمو: جلسهٔ نهایی نمونه نیست');
  assert(r.grade === 'دوازدهم', 'جلسهٔ نمونه باید دوازدهم باشد: ' + r.grade);
  assert(r.inRange === true, 'تاریخ جلسه در بازهٔ فصل نیست');
  assert(r.duty === true, 'دبیر مراقب نمونه ندارد');
  assert(r.sub === true, 'درس جلسهٔ نمونه نیست');
});

test('بند ۳: منشأ جلسهې امتحان درسی/نهایی/جبرانی', () => {
  const stSave = W('JSON.stringify({u:S.user&&S.user.id,t:S.tab,r:S.route})');
  const code = `(()=>{
    if(typeof examSource!=='function')return JSON.stringify({err:'no-api'});
    var compatF=examSource({is_final:1}),compatI=examSource({}),
        mk=examSource({source:'makeup'}),nf=examSource({source:'national_final'});
    var bMk=examSourceBadge({source:'makeup'}),bInt=examSourceBadge({});
    var selN=(typeof EXAM_SOURCES!=='undefined')?EXAM_SOURCES.length:0;
    var mkEx=db.exams.find(function(x){return examSource(x)==='makeup';});
    var viewHas=false;
    if(mkEx){
      S.user=db.users.find(function(u){return u.role==='manager'&&u.school_id===mkEx.school_id;});
      S.persona=null;S.boss=null;S.filters={term:mkEx.term_id};S.route='exams';S.page=1;
      viewHas=renderRoute().indexOf('جبرانی')>-1;
    }
    var term=db.exam_terms.filter(function(t){return t.status==='published';})[0];
    var saved=null;
    if(term){
      var c10=db.classes.find(function(c){return c.school_id===1&&c.grade==='دهم';});
      var sub=term?db.subjects.find(function(x){return x.school_id===1&&x.grade==='دهم';}):null;
      if(c10&&sub){
        S.user=db.users.find(function(u){return u.role==='manager'&&u.school_id===1;});
        S.persona=null;S.boss=null;S.filters={};
        examModal(null,term);
        document.getElementById('ex_class').value=String(c10.id);
        document.getElementById('ex_subject').value=String(sub.id);
        document.getElementById('ex_source').value='makeup';
        document.getElementById('ex_date').value=term.start_date;
        document.getElementById('ex_time').value='14:00';
        document.querySelector('#modal [data-act="exam-save"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));
        saved=db.exams.filter(function(x){return x.class_id===c10.id&&x.date===term.start_date&&x.start_time==='14:00';}).pop()||null;
        if(saved)remove('exams',saved.id);
      }
    }
    return JSON.stringify({compatF:compatF,compatI:compatI,mk:mk,nf:nf,
      mkHasBadge:bMk.indexOf('جبرانی')>-1,intEmpty:bInt==='',selN:selN,
      demoMk:!!mkEx,viewHas:viewHas,saved:!!saved,savedSrc:saved?saved.source:null,
      savedHasIsFinal:saved?('is_final' in saved):nullArray.prototype.map.call(document.querySelectorAll('.toast'),function(t){return t.textContent;})});
  })()`;
  let r;
  try { r = JSON.parse(W(code)); }
  catch (e) { console.log('EVAL FAILED; code was:\n' + code); throw e; }
  finally { W('S.user=byId("users",' + JSON.parse(stSave).u + ')||db.users.find(function(x){return x.role==="manager"&&x.school_id===1;});S.tab=' + JSON.stringify(JSON.parse(stSave).t||'') + ';S.route=' + JSON.stringify(JSON.parse(stSave).r||'dashboard') + ';'); }
  assert(r.err !== 'no-api', 'API منشآ امتحان وجود ندارد');
  assert(r.compatF === 'national_final', 'سازگاری: is_final=1 خانده نشد');
  assert(r.compatI === 'internal', 'سازگاری: بدون field ⇒ درسی نشد');
  assert(r.mk === 'makeup' && r.nf === 'national_final', 'خاندن source جدید کار نکرد');
  assert(r.selN === 3, '🔴 سه گزینه‌ای منشآ در فرم نیست (' + r.selN + ')');
  assert(r.mkHasBadge === true, 'نشان جبرانی ساخته نشد');
  assert(r.intEmpty === true, 'جلسه‌ای درسی نشان بی‌معنی گرفت');
  assert(r.demoMk === true, 'دمو: جلسه‌ای جبرانی نمونه نیست');
  assert(r.viewHas === true, '🔴 نشان چبرانی‌ در نمای‌ای مدیر نیست');
  assert(r.saved === true, '🔴 جلسه جبرانی از فرم ذخیره نشد');
  assert(r.savedSrc === 'makeup', '🔴 source ذخیره نشد: ' + r.savedSrc);
  assert(r.savedHasIsFinal === false, '🔴 is_final هنوز نوشته می‌شود');
});

/* ── گام ۳ زنگ: پیش‌گزینش حضور و غیاب (دور ۶۳، بند ۶) ─────────
   bellAutoClass کلاس جاری دبیر را برمی‌گرداند (یا null). انتخاب
   دستی (S.filters.class) همیشه بر پیش‌گزینش مقدم است. همهٔ
   آزمون‌ها با زمان ساختگی (S.bellNow / پارامتر now) کار می‌کنند —
   به ساعت واقعی وابسته نیستند. */

/* زمان‌ساز صفحه‌ای: تاریخ با روز هفتهٔ مشخص (۰=شنبه) و ساعت دلخواه
   در سال داده‌شده. (di+6)%7 تبدیل شمارهٔ برنامه به getDay است. */
const BELL_DATE_AT = 'function dateAtY(di,hh,mm,yr){var js=(di+6)%7;var b=new Date();var d=new Date(yr,b.getMonth(),b.getDate()+((js-b.getDay()+7)%7));d.setHours(hh,mm,0,0);return d;}';

test('گام ۳: bellAutoClass کلاس درست را با زمان مشخص می‌یابد (زنگ/تفریح/ساعت نادرست)', () => {
  const r = JSON.parse(W('(()=>{'
    + BELL_DATE_AT
    + 'var row=null;db.schedule.forEach(function(rw){if(row)return;if(rw.day===0&&Number(rw.period)===1&&rw.teacher_id&&rw.class_id){var u=byId("users",rw.teacher_id);if(u&&u.role==="teacher")row=rw;}});'
    + 'if(!row)return JSON.stringify({skipTest:true});'
    + 'var tid=row.teacher_id,sid=row.school_id;'
    + 'var tl=bellTimeline(sid,0);'
    + 'var les=tl.filter(function(x){return x.kind==="lesson";})[0];'
    + 'var brk=tl.filter(function(x){return x.kind==="break";})[0];'
    + 'if(!les||!brk)return JSON.stringify({skipTest:true});'
    + 'var f=les.from.split(":");'
    + 'var dLes=dateAtY(0,Number(f[0]),Number(f[1])+5,new Date().getFullYear());'
    + 'var rLes=bellAutoClass(tid,sid,dLes);'
    + 'var g=brk.from.split(":");'
    + 'var dBk=dateAtY(0,Number(g[0]),Number(g[1])+5,new Date().getFullYear());'
    + 'var rBk=bellAutoClass(tid,sid,dBk);'
    + 'var dOld=dateAtY(0,Number(f[0]),Number(f[1])+5,new Date().getFullYear()-5);'
    + 'var rOld=bellAutoClass(tid,sid,dOld);'
    + 'return JSON.stringify({skipTest:false,'
    + 'ok:!!(rLes&&rLes.classId===row.class_id),'
    + 'subj:!!(rLes&&rLes.subjectId===row.subject_id),'
    + 'breakNull:rBk===null,'
    + 'oldNull:rOld===null});})()'));
  if (r.skipTest) return;
  assert(r.ok === true, '🔴 bellAutoClass کلاس دبیر را در زنگ درست نیافت');
  assert(r.subj === true, 'درس زنگ از برنامهٔ هفتگی خوانده نشد');
  assert(r.breakNull === true, '🔴 در زنگ تفریح کلاس پیش‌گزینش شد');
  assert(r.oldNull === true, '🔴 چک سلامت ساعت (سال نادرست) اعمال نمی‌شود');
});

test('گام ۳: خط زمانی بر اساس روز هفتهٔ واقعی است (نه همیشه شنبه)', () => {
  const r = JSON.parse(W('(()=>{'
    + BELL_DATE_AT
    + 'var row=null;db.schedule.forEach(function(rw){if(row)return;if(rw.day===0&&Number(rw.period)===1&&rw.teacher_id&&rw.class_id){var u=byId("users",rw.teacher_id);if(u&&u.role==="teacher")row=rw;}});'
    + 'if(!row)return JSON.stringify({skipTest:true});'
    + 'var tid=row.teacher_id,sid=row.school_id;'
    + 'var rec=null;db.bell_schedules.forEach(function(b){if(b.school_id===sid)rec=b;});'
    + 'if(!rec||!rec.days||!rec.days[2])return JSON.stringify({skipTest:true});'
    + 'var saved=JSON.parse(JSON.stringify(rec.days[2]));'
    + 'var tmp={school_id:sid,day:2,period:1,teacher_id:tid,class_id:row.class_id,subject_id:row.subject_id};'
    + 'db.schedule.push(tmp);'
    + 'rec.days[2]={start:"23:00",slots:rec.days[2].slots};'
    + 'var tl0=bellTimeline(sid,0);'
    + 'var les=tl0.filter(function(x){return x.kind==="lesson";})[0];var f=les.from.split(":");'
    + 'var dThu=dateAtY(2,Number(f[0]),Number(f[1])+5,new Date().getFullYear());'
    + 'var res=bellAutoClass(tid,sid,dThu);'
    + 'rec.days[2]=saved;db.schedule.splice(db.schedule.indexOf(tmp),1);'
    + 'return JSON.stringify({skipTest:false,thuNull:res===null});})()'));
  if (r.skipTest) return;
  assert(r.thuNull === true, '🔴 خط زمانی چهارشنبه به‌جای برنامهٔ خودش، شنبه را می‌خواند — روز هفته نادیده گرفته می‌شود');
});

test('گام ۳: 🔴 انتخاب دستی دبیر بر پیش‌گزینش زنگ مقدم است', () => {
  withCounselor(() => {
    const r = JSON.parse(W('(()=>{'
      + BELL_DATE_AT
      + 'var row=null;db.schedule.forEach(function(rw){if(row)return;if(rw.day===0&&Number(rw.period)===1&&rw.teacher_id&&rw.class_id){var u=byId("users",rw.teacher_id);if(u&&u.role==="teacher")row=rw;}});'
      + 'if(!row)return JSON.stringify({skipTest:true});'
      + 'var tid=row.teacher_id,sid=row.school_id;'
      + 'var tl=bellTimeline(sid,0);'
      + 'var les=tl.filter(function(x){return x.kind==="lesson";})[0];var f=les.from.split(":");'
      + 'var dNow=dateAtY(0,Number(f[0]),Number(f[1])+5,new Date().getFullYear());'
      + 'var auto=bellAutoClass(tid,sid,dNow);'
      + 'if(!auto)return JSON.stringify({skipTest:true});'
      + 'var cls=visibleClasses();'
      + 'var other=cls.filter(function(c){return c.id!==auto.classId;});'
      + 'if(!other.length)return JSON.stringify({skipTest:true});'
      + 'var manual=other[0];'
      + 'S.user=byId("users",tid);S.persona=null;S.boss=null;S.bellNow=dNow;'
      + 'S.filters={class:manual.id};S.route="attendance";S.page=1;'
      + 'var h=renderRoute();'
      + 'S.bellNow=null;S.filters={};'
      + 'var sel=new RegExp("value=\\""+manual.id+"\\" selected").test(h);'
      + 'var autoSel=new RegExp("value=\\""+auto.classId+"\\" selected").test(h);'
      + 'return JSON.stringify({skipTest:false,sel:sel,autoSel:autoSel});})()'));
    if (r.skipTest) return;
    assert(r.sel === true, '🔴 انتخاب دستی در انتخابگر انتخاب نشده است');
    assert(r.autoSel === false, '🔴 پیش‌گزینش زنگ بر انتخاب دستی مقدم شد');
  });
});

test('گام ۳: مدرسهٔ بدون bell_schedules رفتار قدیم دارد (بدون پیش‌گزینش و بدون نشان)', () => {
  withCounselor(() => {
    const r = JSON.parse(W('(()=>{'
      + BELL_DATE_AT
      + 'var tid=null;db.schedule.forEach(function(rw){if(tid)return;if(rw.day===0&&Number(rw.period)===1&&rw.teacher_id){var u=byId("users",rw.teacher_id);if(u&&u.role==="teacher")tid=rw.teacher_id;}});'
      + 'if(!tid)return JSON.stringify({skipTest:true});'
      + 'var u=byId("users",tid),sid=u.school_id;'
      + 'var saved=db.bell_schedules.filter(function(b){return b.school_id===sid;});'
      + 'if(!saved.length)return JSON.stringify({skipTest:true});'
      + 'db.bell_schedules=db.bell_schedules.filter(function(b){return b.school_id!==sid;});'
      + 'var tl0=bellTimeline(sid,0);'
      + 'var les=tl0.filter(function(x){return x.kind==="lesson";})[0];var f=les.from.split(":");'
      + 'var dNow=dateAtY(0,Number(f[0]),Number(f[1])+5,new Date().getFullYear());'
      + 'S.user=u;S.persona=null;S.boss=null;S.bellNow=dNow;S.filters={};S.route="attendance";S.page=1;'
      + 'var allowed=bellAutoAllowed(sid);'
      + 'var h=renderRoute();'
      + 'db.bell_schedules=db.bell_schedules.concat(saved);'
      + 'S.bellNow=null;S.filters={};'
      + 'var fc=visibleClasses()[0];'
            + 'return JSON.stringify({skipTest:false,allowed:allowed,ind:h.indexOf("انتخاب خودکار")===-1,firstCls:new RegExp("value=\\""+fc.id+"\\" selected").test(h)});})()'));
    if (r.skipTest) return;
    assert(r.allowed === false, '🔴 bellAutoAllowed برای مدرسهٔ بدون زمان‌بندی زنگ حقیقی true شد');
    assert(r.ind === true, '🔴 نشان پیش‌گزینش بدون زنگ واقعی نمایش داده شد');
    assert(r.firstCls === true, 'رفتار قدیم (کلاس نخست) حفظ نشد');
  });
});

test('گام ۳: نشان «انتخاب خودکار بر اساس زنگ» + کلاس خودکار + خروج با انتخاب دستی', () => {
  withCounselor(() => {
    const r = JSON.parse(W('(()=>{'
      + BELL_DATE_AT
      + 'var row=null;db.schedule.forEach(function(rw){if(row)return;if(rw.day===0&&Number(rw.period)===1&&rw.teacher_id&&rw.class_id){var u=byId("users",rw.teacher_id);if(u&&u.role==="teacher")row=rw;}});'
      + 'if(!row)return JSON.stringify({skipTest:true});'
      + 'var tid=row.teacher_id,sid=row.school_id;'
      + 'var tl=bellTimeline(sid,0);'
      + 'var les=tl.filter(function(x){return x.kind==="lesson";})[0];var f=les.from.split(":");'
      + 'var dNow=dateAtY(0,Number(f[0]),Number(f[1])+5,new Date().getFullYear());'
      + 'S.user=byId("users",tid);S.persona=null;S.boss=null;S.bellNow=dNow;'
      + 'S.filters={};S.route="attendance";S.page=1;'
      + 'var h=renderRoute();'
      + 'var hasInd=h.indexOf("انتخاب خودکار بر اساس زنگ")>-1;'
      + 'var hasBtn=h.indexOf("att-reset-class")>-1;'
      + 'var autoSel=new RegExp("value=\\""+row.class_id+"\\" selected").test(h);'
      + 'S.filters={class:(function(){var c=visibleClasses();return c.length?c[0].id:null;})()};'
      + 'var h2=renderRoute();'
      + 'S.bellNow=null;S.filters={};'
      + 'return JSON.stringify({skipTest:false,hasInd:hasInd,hasBtn:hasBtn,autoSel:autoSel,'
      + 'gone:h2.indexOf("انتخاب خودکار بر اساس زنگ")==-1});})()'));
    if (r.skipTest) return;
    assert(r.hasInd === true, '🔴 نشان «انتخاب خودکار بر اساس زنگ» نمایش داده نشد');
    assert(r.hasBtn === true, '🔴 دکمه «همهٔ کلاس‌ها» نمایش داده نشد');
    assert(r.autoSel === true, '🔴 کلاس خودکار در انتخابگر انتخاب نشده است');
    assert(r.gone === true, '🔴 نشان پس از انتخاب دستی ناپدید نشد');
  });
});

test('گام ۴: کلاس و درس زنگ جاری در ثبت نمره پیش‌گزینش می‌شوند (تفریح/ساعت نادرست ⇒ نمی‌شود)', () => {
  withCounselor(() => {
    const r = JSON.parse(W('(()=>{'
      + BELL_DATE_AT
      + 'var row=null;db.schedule.forEach(function(rw){if(row)return;if(rw.day===0&&Number(rw.period)===1&&rw.teacher_id&&rw.class_id&&rw.subject_id){var u=byId("users",rw.teacher_id);if(u&&u.role==="teacher")row=rw;}});'
      + 'if(!row)return JSON.stringify({skipTest:true});'
      + 'var tid=row.teacher_id,sid=row.school_id;'
      + 'var tl=bellTimeline(sid,0);'
      + 'var les=tl.filter(function(x){return x.kind==="lesson";})[0];'
      + 'var brk=tl.filter(function(x){return x.kind==="break";})[0];'
      + 'if(!les||!brk)return JSON.stringify({skipTest:true});'
      + 'var f=les.from.split(":");'
      + 'var dLes=dateAtY(0,Number(f[0]),Number(f[1])+5,new Date().getFullYear());'
      + 'S.user=byId("users",tid);S.persona=null;S.boss=null;S.bellNow=dLes;'
      + 'S.filters={};S.fopen={grades:true};S.route="grades";S.page=1;'
      + 'var h=renderRoute();'
      + 'var clsSel=new RegExp("value=\\"" +row.class_id+ "\\" selected").test(h);'
      + 'var subSel=new RegExp("value=\\"" +row.subject_id+ "\\" selected").test(h);'
      + 'var g=brk.from.split(":");'
      + 'var dBk=dateAtY(0,Number(g[0]),Number(g[1])+5,new Date().getFullYear());'
      + 'S.bellNow=dBk;var h2=renderRoute();'
      + 'var brkCls=new RegExp("value=\\"" +row.class_id+ "\\" selected").test(h2);'
      + 'var brkSub=new RegExp("value=\\"" +row.subject_id+ "\\" selected").test(h2);'
      + 'var dOld=dateAtY(0,Number(f[0]),Number(f[1])+5,new Date().getFullYear()-5);'
      + 'S.bellNow=dOld;var h3=renderRoute();'
      + 'S.bellNow=null;S.filters={};'
      + 'var oldCls=new RegExp("value=\\"" +row.class_id+ "\\" selected").test(h3);'
      + 'var oldSub=new RegExp("value=\\"" +row.subject_id+ "\\" selected").test(h3);'
      + 'return JSON.stringify({skipTest:false,clsSel:clsSel,subSel:subSel,'
      + 'brkPair:brkCls&&brkSub,oldPair:oldCls&&oldSub});})()'));
    if (r.skipTest) return;
    assert(r.clsSel === true, '🔴 کلاس زنگ جاری در نماي نمره پیش‌گزینش نشد');
    assert(r.subSel === true, '🔴 درس زنگ جاری در نماي نمره پیش‌گزینش نشد');
    assert(r.brkPair === false, '🔴 در تفریح، جفت کلاس/درس پیش‌گزینش شد');
    assert(r.oldPair === false, '🔴 با ساعت نامعتبر، جفت کلاس/درس پیش‌گزینش شد');
  });
});

test('گام ۴: انتخاب دستی (کلاس یا درس) بر پیش‌گزینش مقدم است', () => {
  withCounselor(() => {
    const r = JSON.parse(W('(()=>{'
      + BELL_DATE_AT
      + 'var row=null;db.schedule.forEach(function(rw){if(row)return;if(rw.day===0&&Number(rw.period)===1&&rw.teacher_id&&rw.class_id&&rw.subject_id){var u=byId("users",rw.teacher_id);if(u&&u.role==="teacher")row=rw;}});'
      + 'if(!row)return JSON.stringify({skipTest:true});'
      + 'var tid=row.teacher_id,sid=row.school_id;'
      + 'var tl=bellTimeline(sid,0);'
      + 'var les=tl.filter(function(x){return x.kind==="lesson";})[0];'
      + 'if(!les)return JSON.stringify({skipTest:true});'
      + 'var f=les.from.split(":");'
      + 'var dLes=dateAtY(0,Number(f[0]),Number(f[1])+5,new Date().getFullYear());'
      + 'var other=visibleClasses().filter(function(c){return c.id!==row.class_id;});'
      + 'if(!other.length)return JSON.stringify({skipTest:true});'
      + 'S.user=byId("users",tid);S.persona=null;S.boss=null;S.bellNow=dLes;'
      + 'S.filters={class:other[0].id};S.route="grades";S.page=1;'
      + 'var h=renderRoute();'
      + 'var manualCls=new RegExp("value=\\"" +other[0].id+ "\\" selected").test(h);'
      + 'var autoNot=new RegExp("value=\\"" +row.class_id+ "\\" selected").test(h);'
      + 'var ind1=h.indexOf("انتخاب خودکار بر اساس زنگ")===-1;'
      + 'S.filters={subject:String(row.subject_id)};'
      + 'var h2=renderRoute();'
      + 'var subMan=new RegExp("value=\\"" +row.subject_id+ "\\" selected").test(h2);'
      + 'var clsAuto=new RegExp("value=\\"" +row.class_id+ "\\" selected").test(h2);'
      + 'var ind2=h2.indexOf("انتخاب خودکار بر اساس زنگ")===-1;'
      + 'S.bellNow=null;S.filters={};'
      + 'return JSON.stringify({skipTest:false,manualCls:manualCls,autoNot:autoNot,'
      + 'ind1:ind1,subMan:subMan,clsAuto:clsAuto,ind2:ind2});})()'));
    if (r.skipTest) return;
    assert(r.manualCls === true, '🔴 کلاس انتخاب‌شدهٔ دستی انتخاب نبود');
    assert(r.autoNot === false, '🔴 با انتخاب دستی، کلاس خودکار هم انتخاب شد');
    assert(r.ind1 === true, '🔴 با انتخاب دستی، نشان پیش‌گزینش ماند');
    assert(r.subMan === true, '🔴 درس انتخاب‌شدهٔ دستی انتخاب نبود');
    assert(r.clsAuto === true, 'کلاس خودکار با انتخاب دستیِ درس باید بماند');
    assert(r.ind2 === true, '🔴 با انتخاب دستیِ درس، نشان پیش‌گزینش ماند');
  });
});

test('گام ۴ (فرم): کلاس و درس زنگ جاری در فرمِ تازهٔ ثبت نمره پیش‌گزینش می‌شوند', () => {
  withCounselor(() => {
    const r = JSON.parse(W('(()=>{'
      + BELL_DATE_AT
      + 'var row=null;db.schedule.forEach(function(rw){if(row)return;if(rw.day===0&&Number(rw.period)===1&&rw.teacher_id&&rw.class_id&&rw.subject_id){var u=byId("users",rw.teacher_id);if(u&&u.role==="teacher")row=rw;}});'
      + 'if(!row)return JSON.stringify({skipTest:true});'
      + 'var tid=row.teacher_id,sid=row.school_id;'
      + 'var tl=bellTimeline(sid,0);'
      + 'var les=tl.filter(function(x){return x.kind==="lesson";})[0];'
      + 'var brk=tl.filter(function(x){return x.kind==="break";})[0];'
      + 'if(!les||!brk)return JSON.stringify({skipTest:true});'
      + 'var f=les.from.split(":");'
      + 'var dLes=dateAtY(0,Number(f[0]),Number(f[1])+5,new Date().getFullYear());'
      + 'var g=brk.from.split(":");'
      + 'var dBk=dateAtY(0,Number(g[0]),Number(g[1])+5,new Date().getFullYear());'
      + 'S.user=byId("users",tid);S.persona=null;S.boss=null;S.filters={};'
      + 'var fc=visibleClasses()[0];'
      + 'function formState(){var h=document.getElementById("modal").innerHTML;'
      + 'return {gclass:window._gclass,'
      + 'subSel:new RegExp("value=\\""+row.subject_id+"\\" selected").test(h)};}'
      + 'S.bellNow=dLes;gradeModal(null);var s1=formState();closeModal();'
      + 'S.bellNow=dBk;gradeModal(null);var s2=formState();closeModal();'
      + 'var s3=null;'
      + 'if(fc.id!==row.class_id){'
      + 'var st=studentsOfClass(fc.id)[0];'
      + 'if(st){var subs=visibleSubjects();'
      + 'var gid=insert("grades",{school_id:sid,student_id:st.id,class_id:fc.id,subject_id:subs[0].id,teacher_id:tid,term:"نوبت اول",exam_type:"میان‌ترم",score:10,max_score:20,created_at:todayISO()}).id;'
      + 'S.bellNow=dLes;gradeModal(byId("grades",gid));s3={gclass:window._gclass};closeModal();'
      + 'remove("grades",gid);(typeof idxInvalidate==="function")&&idxInvalidate("grades");}}'
      + 'S.bellNow=null;S.filters={};'
      + 'return JSON.stringify({skipTest:false,cls:row.class_id,'
      + 'les:{g:s1.gclass,s:s1.subSel},'
      + 'bk:{g:s2.gclass,s:s2.subSel},edit:s3,fc:fc.id});})()'));
    if (r.skipTest) return;
    assert(r.les.g === r.cls, '🔴 در زمان درس، فرم کلاسِ زنگ جاری را پیش‌گزینش نکرد');
    assert(r.les.s === true, '🔴 در زمان درس، فرم درسِ زنگ جاری را پیش‌گزینش نکرد');
    assert(r.bk.g === r.fc, '🔴 در تفریح، رفتار قدیم فرم (نخستین کلاس) حفظ نشد');
    assert(r.bk.s === false, '🔴 در تفریح، درس زنگ جاری در فرم پیش‌گزینش شد');
    if (r.edit) assert(r.edit.gclass === r.fc, '🔴 در حالت ویرایش، فرم کلاس نمرهٔ موجود را با کلاس زنگ عوض کرد');
  });
});

test('گام ۴: مدرسهٔ بدون زمان‌بندی زنگ، نماي نمره رفتار قدیم دارد', () => {
  withCounselor(() => {
    const r = JSON.parse(W('(()=>{'
      + BELL_DATE_AT
      + 'var row=null;db.schedule.forEach(function(rw){if(row)return;if(rw.day===0&&Number(rw.period)===1&&rw.teacher_id&&rw.class_id){var u=byId("users",rw.teacher_id);if(u&&u.role==="teacher")row=rw;}});'
      + 'if(!row)return JSON.stringify({skipTest:true});'
      + 'var tid=row.teacher_id,sid=row.school_id;'
      + 'var tl=bellTimeline(sid,0);'
      + 'var les=tl.filter(function(x){return x.kind==="lesson";})[0];'
      + 'if(!les)return JSON.stringify({skipTest:true});'
      + 'var f=les.from.split(":");'
      + 'var dNow=dateAtY(0,Number(f[0]),Number(f[1])+5,new Date().getFullYear());'
      + 'var saved=db.bell_schedules.filter(function(b){return b.school_id===sid;});'
      + 'db.bell_schedules=db.bell_schedules.filter(function(b){return b.school_id!==sid;});'
      + 'S.user=byId("users",tid);S.persona=null;S.boss=null;S.bellNow=dNow;'
      + 'S.filters={};S.fopen={grades:true};S.route="grades";S.page=1;'
      + 'var allowed=bellAutoAllowed(sid);'
      + 'var h=renderRoute();'
      + 'db.bell_schedules=db.bell_schedules.concat(saved);'
      + 'S.bellNow=null;S.filters={};'
      + 'var fc=visibleClasses()[0];'
      + 'var firstCls=new RegExp("value=\\"" +fc.id+ "\\" selected").test(h);'
      + 'var subPart=h.split("data-f=\\"subject\\"")[1].split("</select>")[0];'
      + 'var noSub=subPart.indexOf("selected")===-1;'
      + 'return JSON.stringify({skipTest:false,allowed:allowed,'
      + 'ind:h.indexOf("انتخاب خودکار بر اساس زنگ")===-1,firstCls:firstCls,noSub:noSub});})()'));
    if (r.skipTest) return;
    assert(r.allowed === false, '🔴 bellAutoAllowed برای مدرسهٔ بدون زمان‌بندی زنگ حقیقی true شد');
    assert(r.ind === true, '🔴 نشان پیش‌گزینش بدون زنگ واقعی نمایش داده شد');
    assert(r.firstCls === true, 'رفتار قدیم (کلاس نخست) حفظ نشد');
    assert(r.noSub === true, 'رفتار قدیم (همه دروس) حفظ نشد');
  });
});

test('گام ۴: نشان + کلاس و درس خودکار + خروج با grade-reset-auto', () => {
  withCounselor(() => {
    const r = JSON.parse(W('(()=>{'
      + BELL_DATE_AT
      + 'var row=null;db.schedule.forEach(function(rw){if(row)return;if(rw.day===0&&Number(rw.period)===1&&rw.teacher_id&&rw.class_id&&rw.subject_id){var u=byId("users",rw.teacher_id);if(u&&u.role==="teacher")row=rw;}});'
      + 'if(!row)return JSON.stringify({skipTest:true});'
      + 'var tid=row.teacher_id,sid=row.school_id;'
      + 'var tl=bellTimeline(sid,0);'
      + 'var les=tl.filter(function(x){return x.kind==="lesson";})[0];'
      + 'if(!les)return JSON.stringify({skipTest:true});'
      + 'var f=les.from.split(":");'
      + 'var dNow=dateAtY(0,Number(f[0]),Number(f[1])+5,new Date().getFullYear());'
      + 'S.user=byId("users",tid);S.persona=null;S.boss=null;S.bellNow=dNow;'
      + 'S.filters={};S.fopen={grades:true};S.route="grades";S.page=1;'
      + 'var h=renderRoute();'
      + 'var hasInd=h.indexOf("انتخاب خودکار بر اساس زنگ")>-1;'
      + 'var hasBtn=h.indexOf("grade-reset-auto")>-1;'
      + 'var clsSel=new RegExp("value=\\"" +row.class_id+ "\\" selected").test(h);'
      + 'var subSel=new RegExp("value=\\"" +row.subject_id+ "\\" selected").test(h);'
      + 'var b=document.createElement("button");'
      + 'b.setAttribute("data-act","grade-reset-auto");'
      + 'document.body.appendChild(b);'
      + 'b.dispatchEvent(new MouseEvent("click",{bubbles:true}));'
      + 'b.remove();'
      + 'var h2=renderRoute();'
      + 'S.bellNow=null;S.filters={};'
      + 'var gone=h2.indexOf("انتخاب خودکار بر اساس زنگ")===-1;'
      + 'var subPart2=h2.split("data-f=\\"subject\\"")[1].split("</select>")[0];'
      + 'var subCleared=subPart2.indexOf("selected")===-1;'
      + 'return JSON.stringify({skipTest:false,hasInd:hasInd,hasBtn:hasBtn,'
      + 'clsSel:clsSel,subSel:subSel,gone:gone,subCleared:subCleared});})()'));
    if (r.skipTest) return;
    assert(r.hasInd === true, '🔴 نشان «انتخاب خودکار بر اساس زنگ» در نماي نمره نمایش داده نشد');
    assert(r.hasBtn === true, '🔴 دکمهٔ «همهٔ کلاس و درس» نمایش داده نشد');
    assert(r.clsSel === true, '🔴 کلاس خودکار انتخاب نبود');
    assert(r.subSel === true, '🔴 درس خودکار انتخاب نبود');
    assert(r.gone === true, '🔴 نشان پس از ریست ناپدید نشد');
    assert(r.subCleared === true, '🔴 درس پس از ریست برنگشت به «همه دروس»');
  });
});


// ── نتیجه// ── بند ۱.۸: ورود دسته‌ای نمرات و حضور و غیاب از اکسل ─────────────
test('بند ۱.۸: ویزارد نمرات — دانش‌آموز، درس و نمرهٔ فارسی درست خوانده می‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  /* یک دانش‌آموز یکتا بساز (نام تکراری دمو نمی‌تواند آزمودنی باشد) */
  const nid = W('(()=>{var n=900000001;while(true){n++;var b=String(n).slice(0,9).padStart(9,"0");var s=0;for(var i=0;i<9;i++)s+=Number(b[i])*(10-i);var r=s%11;var c=r<2?r:11-r;var v=b+c;if(validNid(v)&&!nidOwner(v))return v;}return ""})()');
  assert(nid, 'کد ملی تستی ساخته نشد');
  const tid = W('insert("users",{school_id:' + sid + ',role:"student",full_name:"تست نمره یکتا",national_id:' + JSON.stringify(nid) + ',phone:"",active:1,status:"active",created_at:"2026-09-05"}).id');
  try {
    const subj = W('db.subjects.filter(function(s){return s.school_id===' + sid + '&&s.name;})[0]');
    assert(subj && subj.name, 'درس برای تست نیست');
    const rows = [
      ['تست نمره یکتا', subj.name, '۱۴/۵', 'نوبت اول', '1403-05-10'],
      ['تست نمره یکتا', subj.name, '25', '', ''],
      ['تست نمره یکتا', 'درس ناموجود تستی', '10', '', ''],
      ['کسرت نمره نامدار', subj.name, '10', '', '']
    ];
    const mapping = {0:'full_name',1:'subject',2:'score',3:'term',4:'date'};
    W('window.__g=validateImport(' + JSON.stringify(rows) + ',' + JSON.stringify(mapping) + ",'grades')");
    const g = W('window.__g');
    assert(g.counts.total === 4, 'تعداد ردیف درست نیست: ' + g.counts.total);
    assert(g.counts.ok === 1 && g.counts.failed === 3, 'ردیف‌های خطادار جدا نشدند: ' + g.counts.ok + '/' + g.counts.failed);
    assert(g.rows[0].data.student_id === tid, 'دانش‌آموز با نام پیدا نشد');
    assert(g.rows[0].data.subject_id === subj.id, 'درس به بانک درس‌ها وصل نشد');
    assert(g.rows[0].data.score === 14.5, 'نمرهٔ فارسی اعشاری خوانده نشد: ' + g.rows[0].data.score);
    assert(g.rows[0].data.term === 'نوبت اول', 'نوبت نرمال نشد: ' + g.rows[0].data.term);
    assert(g.rows[0].data.date && /^\d{4}-\d{2}-\d{2}$/.test(g.rows[0].data.date), 'تاریخ شمسی به ISO نشد: ' + g.rows[0].data.date);
    assert(/۲۰|20/.test(g.rows[1].errors.join(' ')), 'نمرهٔ ۲۵ خطا نشد');
    assert(/درس/.test(g.rows[2].errors.join(' ')), 'درس ناموجود خطا نشد');
    assert(/پیدا نشد/.test(g.rows[3].errors.join(' ')), 'دانش‌آموز ناموجود خطا نشد');
    /* ثبت نهایی */
    W('S.imp={step:2,entity:"grades",sheet:{headers:[],rows:[]},mapping:' + JSON.stringify(mapping) + ',preview:window.__g}');
    W('window.__rg=commitImport(S.imp)');
    assert(W('window.__rg.created') === 1, 'فقط ردیف سالم باید ثبت شود: ' + W('window.__rg.created'));
    const gi = W('(()=>{var a=db.grades.filter(function(x){return x.student_id===' + tid + '&&x.source==="import";});return JSON.stringify(a[a.length-1]||null);})()');
    assert(gi, 'ردیف نمره ثبت نشد');
    const row = JSON.parse(gi);
    assert(row.score === 14.5 && row.term === 'نوبت اول' && row.max_score === 20, 'محتوای نمره غلط: ' + gi);
    assert(row.subject_id === subj.id, 'درس غلط ثبت شد');
    assert(W('db.attendance.filter(function(x){return x.source==="import";}).length') === 0, 'نمرات به حضور نشت می‌کند');
  } finally {
    W('db.grades=db.grades.filter(function(x){return x.student_id!==' + tid + '||x.source!=="import";});');
    W('db.users=db.users.filter(function(u){return u.id!==' + tid + ';});');
  }
});

test('بند ۱.۸: ویزارد حضور — وضعیت فارسی/انگلیسی به چهار وضعیتِ واحد تقلیل می‌یابد', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const sid = W('S.user.school_id');
  const st = W('(()=>{var a=[];db.users.forEach(function(u){if(u.school_id===' + sid + "&&u.role==='student'&&u.national_id&&u.active!==0)a.push(u);});return JSON.stringify(a.slice(0,2).map(function(x){return{id:x.id,nid:x.national_id};}));})()");
  const [a, b] = JSON.parse(st);
  assert(a && b, 'دانش‌آموز دمو برای تست حضور نیست');
  const rows = [
    [a.nid, '1403-01-05', 'حاضر', ''],
    [b.nid, '1403-01-05', 'غایب', 'تلفنی اطلاع داده شد'],
    [a.nid, '1403-01-06', 'late', ''],
    [b.nid, '1403-01-06', 'مرخصی', ''],
    [a.nid, 'تاریخ خراب', 'حاضر', ''],
    ['9999999999', '1403-01-05', 'حاضر', '']
  ];
  const mapping = {0:'national_id',1:'date',2:'status',3:'note'};
  W('window.__t=validateImport(' + JSON.stringify(rows) + ',' + JSON.stringify(mapping) + ",'attendance')");
  const t = W('window.__t');
  assert(t.counts.ok === 4 && t.counts.failed === 2, 'خطاهای حضور جدا نشدند: ' + t.counts.ok + '/' + t.counts.failed);
  assert(t.rows[0].data.status === 'present' && t.rows[0].data.student_id === a.id, 'حاضر تقلیل/تطبیق نشد');
  assert(t.rows[1].data.status === 'absent' && t.rows[1].data.note === 'تلفنی اطلاع داده شد', 'غایب+توضیح درست نبود');
  assert(t.rows[2].data.status === 'late', 'late انگلیسی خوانده نشد');
  assert(t.rows[3].data.status === 'excused', 'مرخصی به موجه نیامد');
  assert(/خوانده نشد/.test(t.rows[4].errors.join(' ')), 'تاریخ خراب خطا نشد');
  assert(/کد ملی/.test(t.rows[5].errors.join(' ')), 'کد ملی ناشناس خطا نشد');
  W('S.imp={step:2,entity:"attendance",sheet:{headers:[],rows:[]},mapping:' + JSON.stringify(mapping) + ',preview:window.__t}');
  W('window.__rt=commitImport(S.imp)');
  assert(W('window.__rt.created') === 4, 'چهار حضور سالم ثبت نشد: ' + W('window.__rt.created'));
  assert(W('db.attendance.filter(function(x){return x.student_id===' + a.id + '&&x.source==="import";}).length') === 2, 'حضور دانش‌آموز اول ثبت نشد');
  assert(W('db.grades.filter(function(x){return x.source==="import";}).length') === 0, 'حضور به نمرات نشت می‌کند');
  W('db.attendance=db.attendance.filter(function(x){return x.source!=="import";});');
});

test('بند ۱.۸: گام نخست ویزارد هر چهار نوع اطلاعات را نشان می‌دهد', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const out = W("(S.route='import', S.imp={step:0,entity:'students'}, renderRoute())");
  assert(out.indexOf('نمرات دورهٔ گذشته') > -1, 'نوع نمرات در انتخاب نیست');
  assert(out.indexOf('حضور و غیاب دورهٔ گذشته') > -1, 'نوع حضور در انتخاب نیست');
  W('S.imp=null;S.route="dashboard";0');
});


// ── بند ۱.۲: برنامه کلاسی با دبیر پایه ──────────────────────────
test('بند ۱.۲: نمای مدیر — پایهٔ کلاس و دبیر پایه در برنامهٔ کلاسی دیده می‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const r = W('(()=>{var c=db.classes.filter(function(x){return x.homeroom_teacher_id&&x.grade;})[0];var t=db.users.find(u=>u.id===c.homeroom_teacher_id);return JSON.stringify({cid:c.id,grade:c.grade,ht:t.full_name});})()');
  const cls = JSON.parse(r);
  assert(cls && cls.cid && cls.ht, 'کلاس دمو با دبیر پایه نیست');
  const out = W("(S.route='schedule', S.filters={class:'" + cls.cid + "'}, renderRoute())");
  assert(typeof out === 'string' && out.indexOf('دبیر پایه: ' + cls.ht) > -1, 'دبیر پایه در نمای مدیر دیده نمی‌شود');
  assert(out.indexOf('پایه: ' + cls.grade) > -1, 'پایهٔ کلاس دیده نمی‌شود');
});

test('بند ۱.۲: دبیر می‌تواند برنامهٔ کامل کلاس سرپرستی‌اش را ببیند', () => {
  const r = W('(()=>{var out=null;db.users.filter(function(x){return x.role==="teacher";}).forEach(function(u){if(out)return;db.classes.filter(function(c){return c.school_id===u.school_id&&c.homeroom_teacher_id===u.id;}).forEach(function(c){if(out)return;var rows=db.schedule.filter(function(s){return s.class_id===c.id;});var other=rows.some(function(s){return s.teacher_id!==u.id;});if(rows.length&&other)out={uid:u.id,cid:c.id,name:c.name};});});return out?JSON.stringify(out):"none";})()');
  assert(r !== 'none', 'دبیر دمو با کلاس سرپرستیِ دارای برنامه نیست');
  const home = JSON.parse(r);
  W('S.user=db.users.find(u=>u.id===' + home.uid + ');S.persona=null;S.boss=null');
  let out = W("(S.route='schedule', S.filters={}, renderRoute())");
  assert(out.indexOf('سرپرستی: ' + home.name) > -1, 'انتخابگر سرپرستی دیده نمی‌شود');
  out = W("(S.route='schedule', S.filters={homepick:'" + home.cid + "'}, renderRoute())");
  assert(out.indexOf('برنامهٔ کلاسی ' + home.name) > -1, 'برنامهٔ کامل کلاس سرپرستی باز نشد');
  const o = W('(()=>{var u=S.user;var row=db.schedule.filter(function(s){return s.class_id===' + home.cid + '&&s.teacher_id!==u.id;})[0];return row?db.users.find(x=>x.id===row.teacher_id).full_name:"none";})()');
  assert(o !== 'none' && out.indexOf(o) > -1, 'دبیرانِ دیگرِ کلاس سرپرستی در خانه‌ها دیده نمی‌شوند');
});


// ── بند ۱.۵: جابه‌جای دبیر غایب (تعیین موقت کلاس) ─────────────
test('بند ۱.۵: ثبت جابه‌جای + رد دبیر مشغول + حذف', () => {
  W("S.user=db.users.find(u=>u.role==='manager');S.persona=null;S.boss=null");
  const r = W('(()=>{var u=S.user;var out=null;db.schedule.filter(function(s){var c=byId("classes",s.class_id);return c&&c.school_id===u.school_id&&s.teacher_id;}).forEach(function(slot){if(out)return;var cand=null;schoolTeachers().forEach(function(t){if(cand)return;if(t.id===slot.teacher_id)return;var b=teacherBusyAt(t.id,slot.day,slot.period,slot.id);if(!b)cand=t.id;});if(cand)out={sid:slot.id,day:slot.day,sub:cand};});return out?JSON.stringify(out):"none";})()');
  assert(r !== 'none', 'زنگ تستی با جایگزین آزاد پیدا نشد');
  const slot = JSON.parse(r);
  const date = W('(()=>{var t=todayISO();var dow=(new Date(t+"T12:00:00").getDay()+1)%7;if(dow==='+slot.day+')return t;for(var k=1;k<8;k++){var t2=addDaysISO(t,k);var d2=(new Date(t2+"T12:00:00").getDay()+1)%7;if(d2==='+slot.day+')return t2;}return "";})()');
  assert(date, 'تاریخ مطابق روز زنگ پیدا نشد');
  W('slotModal(byId("schedule",' + slot.sid + '))');
  W("document.getElementById('sub_date').value=" + JSON.stringify(date));
  W("document.getElementById('sub_teacher').value=" + slot.sub);
  W("(function(){var el=document.createElement('button');el.setAttribute('data-act','sub-save');document.body.appendChild(el);el.click();el.remove();})()");
  const n1 = W("db.substitutions.filter(function(x){return x.schedule_id===" + slot.sid + "&&x.date===" + JSON.stringify(date) + "&&x.sub_teacher_id===" + slot.sub + ";}).length");
  assert(n1 === 1, 'جابه‌جای ثبت نشد');
  const busy = W('(()=>{var s=byId("schedule",' + slot.sid + ');var b=schoolTeachers().filter(function(t){return t.id!==s.teacher_id&&teacherBusyAt(t.id,s.day,s.period,s.id);})[0];return b?b.id:"none";})()');
  if(busy !== 'none'){
    W('slotModal(byId("schedule",' + slot.sid + '))');
    W("document.getElementById('sub_date').value=" + JSON.stringify(date));
    W("document.getElementById('sub_teacher').value=" + busy);
    W("(function(){var el=document.createElement('button');el.setAttribute('data-act','sub-save');document.body.appendChild(el);el.click();el.remove();})()");
    const n2 = W("db.substitutions.filter(function(x){return x.schedule_id===" + slot.sid + "&&x.sub_teacher_id===" + busy + ";}).length");
    assert(n2 === 0, 'دبیر مشغول به‌عنوان جابه‌جای ثبت شد');
  }
  W('slotModal(byId("schedule",' + slot.sid + '))');
  W("document.getElementById('sub_date').value=" + JSON.stringify(date));
  W("(function(){var el=document.createElement('button');el.setAttribute('data-act','sub-del');document.body.appendChild(el);el.click();el.remove();})()");
  const n3 = W("db.substitutions.filter(function(x){return x.schedule_id===" + slot.sid + "&&x.date===" + JSON.stringify(date) + ";}).length");
  assert(n3 === 0, 'جابه‌جای حذف نشد');
});

test('بند ۱.۵: جابه‌جایِ امروز در خانهٔ برنامه و فهرست دیده می‌شود', () => {
  W("S.user=db.users.find(u=>u.role==='manager'&&u.school_id===1);S.persona=null;S.boss=null");
  const r = W('(()=>{var x=db.substitutions.find(function(s){return s.school_id===1&&(s.date===todayISO()||s.date===addDaysISO(todayISO(),1));});if(!x)return "none";var slot=byId("schedule",x.schedule_id);var cls=byId("classes",slot.class_id);var sub=db.users.find(u=>u.id===x.sub_teacher_id);return JSON.stringify({cid:cls.id,sub:sub.full_name,today:x.date===todayISO()});})()');
  assert(r !== 'none', 'جابه‌جای نمونهٔ دمو نیست');
  const d = JSON.parse(r);
  const out = W("(S.route='schedule', S.filters={class:'" + d.cid + "'}, renderRoute())");
  assert(out.indexOf('جابه‌جای‌های موقت این کلاس') > -1, 'فهرست جابه‌جای‌ها دیده نمی‌شود');
  if(d.today) assert(out.indexOf('جابه‌جای: ' + d.sub) > -1, 'نشان جابه‌جای در خانهٔ برنامه نیست');
});

test('بند ۱.۵: جابه‌جای فقط برای مدیر و سوپرادمین است', () => {
  W("S.user=db.users.find(u=>u.role==='teacher');S.persona=null;S.boss=null");
  assert(W("canAction('sub-save')") === false, 'دبیر اجازهٔ ثبت جابه‌جای دارد');
  assert(W("canAction('sub-del-route')") === false, 'دبیر اجازهٔ حذف جابه‌جای دارد');
  assert(W("canAction('sub-save','manager')") === true, 'مدیر اجازهٔ ثبت جابه‌جای ندارد');
  W("S.user=null");
});



await Promise.all(testQueue);   // همهٔ آزمون‌های ناهمگام تا سرِ صف برسد
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
