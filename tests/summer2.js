#!/usr/bin/env node
/**
 * تست‌های کلاس‌های تابستانی (بند ۶.۴)
 *  - فقط مدیر + دامنهٔ مدرسه
 *  - ثبت (نام/دبیر/تاریخ‌ها) + مدیریتِ دانش‌آموزان + حذف
 *  - حدِ ۱۵ نفر در هر کلاس
 *
 * اجرا:  node tests/summer2.js   (نیازمند jsdom)
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(1); }

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
console.log('\n▸ کلاس‌های تابستانی (بند ۶.۴)');

test('U0 بوت بدون خطا + دادهٔ نمونه', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  assert(W('db.summer_classes.length') >= 2, 'دادهٔ نمونهٔ summer_classes نیست');
});

const ctx = W(`(function(){
  var s1=db.summer_classes.find(function(s){return s.student_ids.length>0;});
  var m1=db.users.find(function(u){return u.role==='manager'&&u.school_id===1;});
  var t1=db.users.find(function(u){return u.role==='teacher'&&u.school_id===1;});
  var st1=db.users.find(function(u){return u.role==='student'&&u.school_id===1;});
  return {s1:s1.id,m1:m1.id,t1:t1.id,st1:st1.id};
})()`);
assert(ctx.s1, 'کلاسِ نمونه نیست');

test('U1 صفحهٔ مدیر: کارت‌ها + آمار + فقط مدرسهٔ خود', () => {
  /* رکوردِ موقتیِ مدرسهٔ دیگر */
  W(`insert('summer_classes',{school_id:2,name:'بیگانه',teacher_id:1,student_ids:[],start_date:'2026-06-15',end_date:'',note:'',created_at:'2026-06-01',updated_at:'2026-06-01'})`);
  const tmpId = W(`db.summer_classes[db.summer_classes.length-1].id`);
  asUser(ctx.m1, 'summerclasses');
  const root = W(`document.getElementById('root').innerHTML`);
  assert(root.indexOf('data-act="summer-new"') > -1, 'صفحه رندر نشد');
  assert(root.indexOf('بیگانه') === -1, 'دامنهٔ مدرسه نگه داشته نشد');
  assert(root.indexOf('دبیر:') > -1, 'نامِ دبیر نیست');
  W(`remove('summer_classes',${tmpId})`);
});

test('U2 ثبتِ کلاسِ تازه (فرم)', () => {
  const before = W(`db.summer_classes.length`);
  asUser(ctx.m1, 'summerclasses');
  W(`document.querySelector('[data-act="summer-new"]').click()`);
  W(`(function(){
    document.getElementById('su_name').value='فیزیک تابستان — تست';
    document.getElementById('su_teacher').value=${JSON.stringify(String(ctx.t1))};
    document.getElementById('su_start').value='2026-06-25';
    document.getElementById('su_end').value='2026-07-20';
    document.getElementById('su_note').value='پنج‌شنبه‌ها';
    document.querySelector('[data-act="summer-save"]').click();
  })()`);
  assert(W(`db.summer_classes.length`) === before + 1, 'رکورد ساخته نشد');
  const s = W(`db.summer_classes[db.summer_classes.length-1]`);
  assert(s.name === 'فیزیک تابستان — تست', 'نام ذخیره نشد');
  assert(s.teacher_id === ctx.t1, 'دبیر ذخیره نشد');
  assert(s.start_date === '2026-06-25' && s.end_date === '2026-07-20', 'تاریخ‌ها ذخیره نشدند');
  assert(Array.isArray(s.student_ids) && s.student_ids.length === 0, 'دانش‌آموزانِ اولیه باید خالی باشد');
});

test('U3 مدیریتِ دانش‌آموزان: افزودن و برداشتن', () => {
  const sId = W(`db.summer_classes[db.summer_classes.length-1].id`);
  const stA = W(`db.users.filter(function(u){return u.role==='student'&&u.school_id===1;})[0].id`);
  const stB = W(`db.users.filter(function(u){return u.role==='student'&&u.school_id===1;})[1].id`);
  asUser(ctx.m1, 'summerclasses');
  W(`document.querySelector('[data-act="summer-students"][data-id="${sId}"]').click()`);
  W(`(function(){
    var chks=Array.from(document.querySelectorAll('.su-chk'));
    chks.forEach(function(c){c.checked = (c.value===${JSON.stringify(String(stA))}||c.value===${JSON.stringify(String(stB))});});
    document.querySelector('[data-act="summer-students-save"]').click();
  })()`);
  let s = W(`byId('summer_classes',${sId})`);
  assert(s.student_ids.length === 2, 'دو دانش‌آموز انتخاب نشد');
  assert(s.student_ids.indexOf(stA) > -1 && s.student_ids.indexOf(stB) > -1, 'دانش‌آموزها ذخیره نشدند');
  /* حالا یکی را بردار */
  W(`document.querySelector('[data-act="summer-students"][data-id="${sId}"]').click()`);
  W(`(function(){
    var c=Array.from(document.querySelectorAll('.su-chk')).find(function(x){return x.value===${JSON.stringify(String(stB))};});
    c.checked=false;
    document.querySelector('[data-act="summer-students-save"]').click();
  })()`);
  s = W(`byId('summer_classes',${sId})`);
  assert(s.student_ids.length === 1 && s.student_ids[0] === stA, 'دانش‌آموز حذف نشد');
});

test('U4 حدِ ۱۵ نفر رد می‌شود (اثرِ toast)', () => {
  const sId = W(`db.summer_classes[db.summer_classes.length-1].id`);
  asUser(ctx.m1, 'summerclasses');
  W(`document.querySelector('[data-act="summer-students"][data-id="${sId}"]').click()`);
  const before = W(`byId('summer_classes',${sId}).student_ids.length`);
  W(`(function(){
    Array.from(document.querySelectorAll('.su-chk')).slice(0,16).forEach(function(c){c.checked=true;});
    document.querySelector('[data-act="summer-students-save"]').click();
  })()`);
  assert(W(`byId('summer_classes',${sId}).student_ids.length`) === before, 'بیش از ۱۵ نفر ذخیره شد!');
  const toasts = W(`(document.getElementById('toasts')||{}).innerHTML||''`);
  assert(toasts.indexOf('۱۵') > -1, 'هشدارِ حد نمایش داده نشد');
  W(`(function(){var b=document.querySelector('[data-act="modal-close"]');if(b)b.click();})();`);
});

test('U5 حذفِ کلاس', () => {
  const sId = W(`db.summer_classes[db.summer_classes.length-1].id`);
  asUser(ctx.m1, 'summerclasses');
  W(`document.querySelector('[data-act="summer-del"][data-id="${sId}"]').click()`);
  W(`document.querySelector('[data-act="summer-del-ok"]').click()`);
  assert(!W(`byId('summer_classes',${sId})`), 'کلاس حذف نشد');
});

test('U6 دبیر: بدونِ مسیر و بدونِ اکشن', () => {
  assert(W(`canRoute('summerclasses','teacher')`) === false, 'دبیر مسیر دارد!');
  assert(W(`canAction('summer-save','teacher')`) === false, 'دبیر summer-save دارد!');
  assert(W(`canAction('summer-students-save','teacher')`) === false, 'دبیر summer-students-save دارد!');
});

await sleep(100);
console.log('\n────────────────────────────────────────────────────');
console.log(`summer2 (کلاس تابستانی): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
// hardening: rebuild base index.html (a previously crashed mutation suite may have left a mutated build)
try { require('child_process').execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
if (fail) process.exit(1);
process.exit(0);
}
