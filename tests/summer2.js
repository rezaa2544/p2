#!/usr/bin/env node
/**
 * E.8 — تست‌های کلاینت کلاس‌های تابستانی
 *  - جدول summer_classes با فیلدهای جدید
 *  - جدول summer_enrollments برای ثبت‌نام/انصراف
 *  - نمای مدیر، نمای دبیر، کارت دانش‌آموز/ولی و ثبت حضور
 *
 * اجرا: node tests/summer2.js
 */
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
try { child_process.execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch {}
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let pass = 0, fail = 0;
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    try { Promise.resolve(fn()).then(() => { pass++; console.log('  ✅ ' + name); }, e => { fail++; console.log('  ❌ ' + name + '\n     ' + e.message); }).then(resolve); }
    catch (e) { fail++; console.log('  ❌ ' + name + '\n     ' + e.message); resolve(); }
  }));
  __seq = p;
}
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
const consoleErrors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  virtualConsole: new (require('jsdom').VirtualConsole)().on('jsdomError', e => consoleErrors.push(e.message)).on('error', m => consoleErrors.push(String(m))),
});
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const asUser = (uid, route) => W(`(function(){S.user=byId('users',${uid});S.persona=null;S.boss=null;S.filters={};S.route=${JSON.stringify(route)};S.tab='';render();})()`);

main().catch(e => { console.error(e); process.exit(1); });
async function main(){
await sleep(500);
console.log('\n▸ E.8 — کلاس‌های تابستانی');

const ctx = W(`(function(){
  var sc=db.summer_classes.find(function(s){return s.title&&summerActiveEnrollments(s.id).length>0;});
  var m1=db.users.find(function(u){return u.role==='manager'&&u.school_id===1&&u.active;});
  var t1=db.users.find(function(u){return u.role==='teacher'&&u.id===sc.teacher_id;});
  var st1=byId('users', summerActiveEnrollments(sc.id)[0].student_id);
  var p1=db.parent_links.map(function(l){return {l:l,p:byId('users',l.parent_id)}}).find(function(x){return x.l.student_id===st1.id&&x.p&&x.p.active;});
  return {sc:sc.id,m1:m1.id,t1:t1.id,st1:st1.id,p1:p1.p.id};
})()`);

test('U0 بوت بدون خطا + seed دو جدولی', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0,2).join(' | '));
  assert(W('db.summer_classes.length') >= 2, 'summer_classes نمونه ندارد');
  assert(W('db.summer_enrollments.length') >= 5, 'summer_enrollments نمونه ندارد');
});

test('U1 مدیر همه کلاس‌های مدرسه را می‌بیند و کلاس مدرسه دیگر نشت نمی‌کند', () => {
  W(`insert('summer_classes',{school_id:2,title:'نشت تابستان',name:'نشت تابستان',subject:'ریاضی',teacher_id:null,start_date:'2026-06-01',end_date:'',schedule:{saturday:'8-10'},capacity:10,status:'planned',created_at:todayISO(),updated_at:todayISO()})`);
  const tmp = W(`db.summer_classes[db.summer_classes.length-1].id`);
  asUser(ctx.m1, 'summerclasses');
  const root = W(`document.getElementById('root').innerHTML`);
  assert(root.indexOf('summer-new') > -1, 'دکمه ایجاد مدیر نیست');
  assert(root.indexOf('نشت تابستان') === -1, 'کلاس مدرسه دیگر دیده شد');
  W(`remove('summer_classes',${tmp})`);
});

test('U2 ایجاد کلاس با فیلدهای جدید و schedule JSON', () => {
  const before = W(`db.summer_classes.length`);
  asUser(ctx.m1, 'summerclasses');
  W(`document.querySelector('[data-act="summer-new"]').click()`);
  W(`(function(){
    document.getElementById('su_title').value='هنر تابستانی';
    document.getElementById('su_subject').value='هنر';
    document.getElementById('su_teacher').value=String(${ctx.t1});
    document.getElementById('su_start').value='2026-06-20';
    document.getElementById('su_end').value='2026-07-20';
    document.getElementById('su_cap').value='2';
    document.getElementById('su_status').value='planned';
    document.getElementById('su_schedule').value=JSON.stringify({monday:'08:00-10:00',wednesday:'08:00-10:00'});
    document.querySelector('[data-act="summer-save"]').click();
  })()`);
  assert(W(`db.summer_classes.length`) === before + 1, 'کلاس ساخته نشد');
  const sc = W(`db.summer_classes[db.summer_classes.length-1]`);
  assert(sc.title === 'هنر تابستانی' && sc.subject === 'هنر', 'فیلدهای title/subject ذخیره نشد');
  assert(sc.capacity === 2 && sc.status === 'planned', 'ظرفیت/وضعیت ذخیره نشد');
  assert(sc.schedule && sc.schedule.monday === '08:00-10:00', 'schedule JSON ذخیره نشد');
});

test('U3 ویرایش کلاس', () => {
  const id = W(`db.summer_classes[db.summer_classes.length-1].id`);
  asUser(ctx.m1, 'summerclasses');
  W(`document.querySelector('[data-act="summer-edit"][data-id="${id}"]').click()`);
  W(`document.getElementById('su_status').value='active';document.getElementById('su_cap').value='3';document.querySelector('[data-act="summer-save"]').click()`);
  const sc = W(`byId('summer_classes',${id})`);
  assert(sc.status === 'active' && sc.capacity === 3, 'ویرایش اعمال نشد');
});

test('U4 ثبت‌نام با summer_enrollments + کنترل ظرفیت', () => {
  const id = W(`db.summer_classes[db.summer_classes.length-1].id`);
  const a = W(`db.users.filter(function(u){return u.role==='student'&&u.school_id===1&&u.active;})[0].id`);
  const b = W(`db.users.filter(function(u){return u.role==='student'&&u.school_id===1&&u.active;})[1].id`);
  const c = W(`db.users.filter(function(u){return u.role==='student'&&u.school_id===1&&u.active;})[2].id`);
  asUser(ctx.m1, 'summerclasses');
  W(`document.querySelector('[data-act="summer-students"][data-id="${id}"]').click()`);
  W(`Array.from(document.querySelectorAll('.su-chk')).forEach(function(x){x.checked=[${a},${b},${c}].indexOf(Number(x.value))>-1;});document.querySelector('[data-act="summer-students-save"]').click()`);
  assert(W(`summerActiveEnrollments(${id}).length`) === 3, 'سه ثبت‌نام فعال ساخته نشد');
  W(`document.querySelector('[data-act="summer-edit"][data-id="${id}"]').click();document.getElementById('su_cap').value='2';document.querySelector('[data-act="summer-save"]').click()`);
  W(`document.querySelector('[data-act="summer-students"][data-id="${id}"]').click();Array.from(document.querySelectorAll('.su-chk')).slice(0,3).forEach(function(x){x.checked=true;});document.querySelector('[data-act="summer-students-save"]').click()`);
  assert(W(`summerActiveEnrollments(${id}).length`) === 3, 'ظرفیت نباید ثبت‌نام موجود را خراب کند');
  assert(W(`((document.getElementById('toasts')||{}).innerHTML||'').indexOf('ظرفیت')>-1`), 'هشدار ظرفیت نمایش داده نشد');
  W(`(function(){var b=document.querySelector('[data-act="modal-close"]');if(b)b.click();})();`);
});

test('U5 دبیر فقط کلاس خودش را می‌بیند و حضور ثبت می‌کند', () => {
  const other = W(`(function(){var t=db.users.find(function(u){return u.role==='teacher'&&u.school_id===1&&u.id!==${ctx.t1};});return insert('summer_classes',{school_id:1,title:'کلاس دبیر دیگر',name:'کلاس دبیر دیگر',subject:'ورزش',teacher_id:t.id,start_date:'2026-06-25',end_date:'',schedule:{saturday:'10-12'},capacity:10,status:'planned',created_at:todayISO(),updated_at:todayISO()}).id;})()`);
  asUser(ctx.t1, 'dashboard');
  const root = W(`document.getElementById('root').innerHTML`);
  assert(root.indexOf('summer-att') > -1, 'دکمه حضور دبیر نیست');
  assert(root.indexOf('summer-new') === -1, 'دبیر نباید ایجاد ببیند');
  assert(root.indexOf('کلاس دبیر دیگر') === -1, 'دبیر کلاس همکار را دید');
  W(`document.querySelector('[data-act="summer-att"][data-id="${ctx.sc}"]').click()`);
  const eid = W(`summerActiveEnrollments(${ctx.sc})[0].id`);
  W(`document.getElementById('su_att_date').value='2026-06-22';document.getElementById('su_att_'+${eid}).value='absent';document.querySelector('[data-act="summer-att-save"]').click()`);
  assert(W(`byId('summer_enrollments',${eid}).attendance['2026-06-22']`) === 'absent', 'حضور دبیر ذخیره نشد');
});

test('U6 دانش‌آموز و ولی کارت کلاس‌های تابستانی من را در داشبورد می‌بینند', () => {
  asUser(ctx.st1, 'dashboard');
  let root = W(`document.getElementById('root').innerHTML`);
  assert(root.indexOf('کلاس‌های تابستانی من') > -1, 'کارت دانش‌آموز نیست');
  asUser(ctx.p1, 'dashboard');
  root = W(`document.getElementById('root').innerHTML`);
  assert(root.indexOf('کلاس‌های تابستانی من') > -1, 'کارت ولی نیست');
});

await __seq;
await sleep(100);
console.log('\n────────────────────────────────────────────────────');
console.log(`summer2 (E.8): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
try { child_process.execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch {}
process.exit(fail ? 1 : 0);
}
