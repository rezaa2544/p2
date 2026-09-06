#!/usr/bin/env node
/**
 * تست‌های برنامهٔ آموزشی فردی (IEP — بند ۲.۲ — مدارس استثنایی)
 *  - فقط در مدرسه‌ای با توانِ has_iep نمایش داده می‌شود
 *  - فیلدهای آزاد (یادداشتِ نیازِ ویژه + کارکنانِ کمکی) — نه فرمِ سفت
 *  - ویرایش: فقط کادر (دبیر/مدیر)؛ دانش‌آموز و ولی فقط‌خواندنی
 *
 * اجرا:  node tests/iep2.js   (نیازمند jsdom)
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const errors = [];
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) { fail++; errors.push(`${name}: ${e.message}`); console.log(`  ❌ ${name}\n     ${e.message}`); resolve(); return; }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; errors.push(`${name}: ${e.message}`); console.log(`  ❌ ${name}\n     ${e.message}`); }
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

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(400);
console.log('\n▸ برنامهٔ آموزشی فردی (IEP — بند ۲.۲)');

const CARD = "document.getElementById('root').innerHTML.indexOf('برنامهٔ آموزشی فردی') > -1";

test('I0 بوت بدون خطا', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
});

const ctx = W(`(function(){
  var st = db.users.find(function(u){return u.role==='student'&&u.iep_notes;});
  if(!st) return null;
  var school = byId('schools', st.school_id);
  var manager = db.users.find(function(u){return u.role==='manager'&&u.school_id===school.id;});
  var teacher = db.schedule.find(function(x){return x.school_id===school.id;});
  var pl = db.parent_links.find(function(l){return l.student_id===st.id;});
  var noIepSchool = db.schools.find(function(s){return s.active&&!(s.capabilities&&s.capabilities.has_iep);});
  var noIepSt = noIepSchool?db.users.find(function(u){return u.role==='student'&&u.school_id===noIepSchool.id;}):null;
  var noIepMgr = noIepSchool?db.users.find(function(u){return u.role==='manager'&&u.school_id===noIepSchool.id;}):null;
  return {st:st.id, sid:school.id, manager:manager.id,
          teacher:teacher?teacher.teacher_id:0,
          parent:pl?(byId('users',pl.parent_id)||{}).id||0:0,
          noIepSt:noIepSt?noIepSt.id:0,
          noIepMgr:noIepMgr?noIepMgr.id:0};
})()`);
assert(ctx && ctx.st, 'دانش‌آموزِ نمونهٔ IEP پیدا نشد');

test('I1 دادهٔ نمونه: یادداشت + کارکنان + تاریخ', () => {
  const r = W(`byId('users',${ctx.st})`);
  assert(typeof r.iep_notes === 'string' && r.iep_notes.length > 10, 'یادداشتِ IEP نیست');
  assert(typeof r.iep_staff === 'string' && r.iep_staff.length > 3, 'کارکنانِ کمکی نیست');
  assert(typeof r.iep_updated === 'string' && r.iep_updated.length === 10, 'تاریخِ به‌روزرسانی نیست');
});

test('I2 کارت در پرونده (مدیر) با متنِ واقعی', () => {
  W(`(function(){
    S.user=byId('users',${ctx.manager});S.persona=null;S.boss=null;
    S.child=${ctx.st};S.filters={};S.route='record';S.tab='profile';render();
  })()`);
  assert(W(CARD), 'کارتِ IEP برای مدیر دیده نمی‌شود');
  const notes = W(`document.getElementById('root').innerHTML`);
  assert(notes.indexOf('مشاور') > -1, 'متنِ کارکنانِ کمکی رندر نشد');
  const btn = W(`document.querySelectorAll('[data-act="iep-edit"]').length`);
  assert(btn === 1, 'دکمهٔ ویرایش برای مدیر نیست (تعداد: ' + btn + ')');
});

test('I3 مدرسهٔ بدون has_iep: کارت نیست', () => {
  if(!ctx.noIepSt||!ctx.noIepMgr){ console.log('     (مدرسهٔ بدون IEP نیست — رد می‌شود)'); return; }
  W(`(function(){
    S.user=byId('users',${ctx.noIepMgr});S.persona=null;S.boss=null;
    S.child=${ctx.noIepSt};S.filters={};S.route='record';S.tab='profile';render();
  })()`);
  assert(!W(CARD), 'کارتِ IEP نباید در مدرسهٔ بدون این توان باشد');
});

test('I4 ویرایش توسط دبیر (مسیرِ واقعی): فیلدها + تاریخ تازه', () => {
  W(`(function(){
    S.user=byId('users',${ctx.teacher});S.persona=null;S.boss=null;
    S.child=${ctx.st};S.filters={};S.route='record';S.tab='profile';render();
  })()`);
  W(`document.querySelector('[data-act="iep-edit"]').click()`);
  const modal = W(`document.getElementById('iep_notes')`);
  assert(modal, 'مودالِ IEP باز نشد');
  W(`(function(){
    document.getElementById('iep_notes').value='یادداشتِ تازهٔ تست — هدف: بهبودِ تمرکز.';
    document.getElementById('iep_staff').value='مشاور (دو بار در هفته)';
    document.querySelector('[data-act="iep-save"]').click();
  })()`);
  const r = W(`byId('users',${ctx.st})`);
  assert(r.iep_notes.indexOf('یادداشتِ تازهٔ تست') === 0, 'یادداشت ذخیره نشد');
  assert(r.iep_staff.indexOf('دو بار در هفته') > -1, 'کارکنان ذخیره نشد');
  const today = W(`todayISO()`);
  assert(r.iep_updated === today, 'تاریخِ به‌روزرسانی تازه نشد (گرفت: ' + r.iep_updated + '، امروز: ' + today + ')');
});

test('I5 دانش‌آموز: کارت هست ولی دکمهٔ ویرایش نیست', () => {
  W(`(function(){
    S.user=byId('users',${ctx.st});S.persona=null;S.boss=null;
    S.filters={};S.route='record';S.tab='profile';render();
  })()`);
  assert(W(CARD), 'دانش‌آموز باید IEP خودش را ببیند');
  const btn = W(`document.querySelectorAll('[data-act="iep-edit"]').length`);
  assert(btn === 0, 'دانش‌آموز نباید دکمهٔ ویرایش داشته باشد (تعداد: ' + btn + ')');
});

test('I6 ولی: فقط‌خواندنی', () => {
  if(!ctx.parent){ console.log('     (ولیِ نمونه نیست — رد می‌شود)'); return; }
  W(`(function(){
    S.user=byId('users',${ctx.parent});S.persona=null;S.boss=null;
    S.child=${ctx.st};S.filters={};S.route='children';render();
  })()`);
  assert(W(CARD), 'ولی باید IEP فرزند را ببیند');
  const btn = W(`document.querySelectorAll('[data-act="iep-edit"]').length`);
  assert(btn === 0, 'ولی نباید دکمهٔ ویرایش داشته باشد');
});

await sleep(100);
console.log('\n────────────────────────────────────────────────────');
console.log(`iep2 (IEP): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
if (fail) process.exit(1);
process.exit(0);
}
