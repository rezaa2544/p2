#!/usr/bin/env node
/**
 * تست‌های گزارش عمومی قابل انتشار (C.3 فرناز)
 *  - فقط مدیر + فقط مدرسهٔ خود؛ سه شاخص تجمیعی؛ بدون دادهٔ حساس؛ چاپ + CSV
 *
 * اجرا:  node tests/pubrep.js   (نیازمند jsdom)
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
// hardening: rebuild base index.html (a previously crashed mutation suite may have left a mutated build)
try { require('child_process').execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); resolve(); return; }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
    ).then(resolve);
  }));
  __seq = p;
}
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

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
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const asUser = (uid, route) => W(`(function(){
  S.user=byId('users',${uid});S.persona=null;S.boss=null;
  S.filters={};S.route=${JSON.stringify(route)};S.tab='';render();
})()`);

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(400);
console.log('\n▸ گزارش عمومی قابل انتشار (C.3 فرناز)');

test('P0 بوت بدون خطا', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
});

const ctx = W(`(function(){
  var sup=db.users.find(function(u){return u.role==='superadmin';});
  var m6=db.users.find(function(u){return u.role==='manager'&&u.school_id===6;});
  var t6=db.users.find(function(u){return u.role==='teacher'&&u.school_id===6;});
  var s6=db.users.find(function(u){return u.role==='student'&&u.school_id===6;});
  return {sup:sup.id,m6:m6.id,t6:t6.id,sname:s6.full_name};
})()`);
assert(ctx.sup && ctx.m6 && ctx.t6, 'کاربر نمونه نیست');

test('P1 دکمه‌ها فقط برای مدیر', () => {
  asUser(ctx.m6, 'dashboard');
  let h = W(`document.getElementById('root').innerHTML`);
  assert(h.indexOf('data-act="pubrep-print"') > -1, 'دکمهٔ چاپ برای مدیر نیست');
  assert(h.indexOf('data-act="pubrep-csv"') > -1, 'دکمهٔ CSV برای مدیر نیست');
  asUser(ctx.sup, 'dashboard');
  h = W(`document.getElementById('root').innerHTML`);
  assert(h.indexOf('pubrep-print') < 0, 'سوپرادمین نباید دکمه ببیند!');
});

test('P2 محاسبهٔ سه شاخص درست است', () => {
  const sid = W(`insert('schools',{name:'موقت',code:'TMP-PR'}).id`);
  try {
    W(`insert('attendance',{school_id:${sid},student_id:1,date:'2026-09-01',status:'present'})`);
    W(`insert('attendance',{school_id:${sid},student_id:1,date:'2026-09-02',status:'present'})`);
    W(`insert('attendance',{school_id:${sid},student_id:2,date:'2026-09-02',status:'present'})`);
    W(`insert('attendance',{school_id:${sid},student_id:2,date:'2026-09-03',status:'absent'})`);
    W(`insert('grades',{school_id:${sid},student_id:1,score:18})`);
    W(`insert('grades',{school_id:${sid},student_id:2,score:14})`);
    W(`insert('calendar',{school_id:${sid},date:'2026-09-05',title:'رویداد ۱'})`);
    W(`insert('calendar',{school_id:${sid},date:'2026-09-06',title:'رویداد ۲'})`);
    W(`insert('calendar',{school_id:${sid},date:'2026-09-07',title:'رویداد ۳'})`);
    const st = JSON.parse(W(`JSON.stringify(publicStats(${sid}))`));
    assert(st.att === 75, 'نرخ حضور باید ۷۵ باشد (هست: ' + st.att + ')');
    assert(st.avg === 16, 'میانگین باید ۱۶ باشد (هست: ' + st.avg + ')');
    assert(st.events === 3, 'رویداد باید ۳ باشد (هست: ' + st.events + ')');
  } finally {
    W(`db.attendance=db.attendance.filter(function(x){return x.school_id!==${sid};});`
      + `db.grades=db.grades.filter(function(x){return x.school_id!==${sid};});`
      + `db.calendar=db.calendar.filter(function(x){return x.school_id!==${sid};});`
      + `remove('schools',${sid});`);
  }
});

test('P3 مدرسهٔ بدون داده صفر می‌دهد نه خطا', () => {
  const sid = W(`insert('schools',{name:'موقت۲',code:'TMP-PR2'}).id`);
  try {
    const st = JSON.parse(W(`JSON.stringify(publicStats(${sid}))`));
    assert(st.att === 0 && st.avg === 0 && st.events === 0, 'خروجی تهی باید صفر باشد');
  } finally {
    W(`remove('schools',${sid})`);
  }
});

test('P4 چاپ: سه شاخص + بدون نام دانش‌آموز', () => {
  asUser(ctx.m6, 'dashboard');
  W(`window.open=function(){window.__pw={h:''};return {document:{write:function(s){window.__pw.h+=s;},close:function(){}}};};`);
  W(`document.querySelector('[data-act="pubrep-print"]').click()`);
  const p = W(`window.__pw ? window.__pw.h : ''`);
  assert(p.indexOf('گزارش عمومی مدرسه') > -1, 'عنوان گزارش نیست');
  assert(p.indexOf('نرخ حضور') > -1 && p.indexOf('میانگین نمرات') > -1 && p.indexOf('تعداد رویدادها') > -1, 'هر سه شاخص نیستند');
  assert(p.indexOf('بدون دادهٔ حساس') > -1, 'سلب مسئولیت نیست');
  assert(p.indexOf(ctx.sname) < 0, 'نام دانش‌آموز لو رفت!');
});

test('P5 خروجی CSV سه سطر درست دارد', () => {
  asUser(ctx.m6, 'dashboard');
  W(`downloadCSV=function(f,h,r){window.__csv={f:f,h:h,r:r};return true;};`);
  W(`document.querySelector('[data-act="pubrep-csv"]').click()`);
  const c = JSON.parse(W(`JSON.stringify(window.__csv||null)`));
  assert(c && c.f.indexOf('payesh-public-') === 0, 'نام فایل درست نیست');
  assert(JSON.stringify(c.h) === JSON.stringify(['شاخص', 'مقدار']), 'سرستون‌ها درست نیستند');
  assert(c.r.length === 3, 'باید ۳ سطر باشد');
  assert(c.r[0][0] === 'نرخ حضور (٪)' && c.r[1][0] === 'میانگین نمرات (از ۲۰)' && c.r[2][0] === 'تعداد رویدادها', 'برچسب سطرها درست نیستند');
});

test('P6 غیرمدیر از اکشن رد می‌شود (هر دو لایه)', () => {
  W(`S.user=byId('users',${ctx.t6});`);
  /* لایهٔ بیرونی (هندلر) جدا از لایهٔ درونی سنجیده می‌شود: pubrepPrint استاب می‌خورد */
  W(`window.__realPubrep=pubrepPrint;window.__inner=false;pubrepPrint=function(){window.__inner=true;};`);
  W(`coreActions(null,{},null,'pubrep-print',null)['pubrep-print']();`);
  assert(W(`window.__inner`) === false, 'هندلر چاپ دبیر را به تابع رساند!');
  W(`pubrepPrint=window.__realPubrep;`);
  W(`downloadCSV=function(){window.__csv2=true;return true;};`);
  W(`coreActions(null,{},null,'pubrep-csv',null)['pubrep-csv']();`);
  assert(W(`window.__csv2||false`) === false, 'CSV برای دبیر ساخته شد!');
});

test('P7 دامنه: دادهٔ مدرسهٔ دیگر در آمار نیست', () => {
  const sid = W(`insert('schools',{name:'موقت۳',code:'TMP-PR3'}).id`);
  try {
    W(`insert('attendance',{school_id:${sid},student_id:1,date:'2026-09-01',status:'present'})`);
    W(`insert('attendance',{school_id:${sid},student_id:1,date:'2026-09-02',status:'present'})`);
    const before = JSON.parse(W(`JSON.stringify(publicStats(${sid}))`));
    /* آلودگی سنگین (۱۰۰ غیبت بیگانه) تا گردکردن نتواند جهش را ماسک کند */
    W(`for(var i=0;i<100;i++)insert('attendance',{school_id:99,student_id:1,date:'2026-09-05',status:'absent'});`);
    W(`insert('calendar',{school_id:99,date:'2026-09-05',title:'بیگانه'})`);
    const after = JSON.parse(W(`JSON.stringify(publicStats(${sid}))`));
    W(`db.attendance=db.attendance.filter(function(x){return x.school_id!==99;});db.calendar=db.calendar.filter(function(x){return x.school_id!==99;});`);
    assert(before.att === 100, 'پیش‌فرض آلوده است');
    assert(JSON.stringify(before) === JSON.stringify(after), 'دامنهٔ مدرسه نگه داشته نشد!');
  } finally {
    W(`db.attendance=db.attendance.filter(function(x){return x.school_id!==${sid};});remove('schools',${sid});`);
  }
});

test('P8 لایهٔ درونی: فراخوانی مستقیم pubrepPrint دبیر را رد می‌کند', () => {
  W(`S.user=byId('users',${ctx.t6});`);
  W(`window.__opened=false;window.open=function(){window.__opened=true;return {document:{write:function(){},close:function(){}}};};`);
  W(`pubrepPrint();`);
  assert(W(`window.__opened`) === false, 'لایهٔ درونی دبیر را رد نکرد!');
});

await sleep(100);
console.log('\n────────────────────────────────────────────────────');
console.log(`pubrep (گزارش عمومی): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
// hardening: rebuild base index.html (a previously crashed mutation suite may have left a mutated build)
try { require('child_process').execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
if (fail) process.exit(1);
process.exit(0);
}
