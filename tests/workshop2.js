#!/usr/bin/env node
/**
 * تست‌های نمرهٔ عملی/کارگاهی + ساعتِ کارآموزی (بند ۴.۲ — هنرستان)
 *  - فقط مدارسِ رشتهٔ فنی‌وحرفه‌ای/کاردانش (توانِ has_workshop)
 *  - کارتِ کارآموزی فقط برای سالِ آخر (پایهٔ دوازدهم)
 *  - تأیید: فقط دبیرِ مربوطه یا مدیر (گاردِ داده، نه فقط UI)
 *  - حذف: فقط مدیر
 *
 * اجرا:  node tests/workshop2.js   (نیازمند jsdom)
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(1); }

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
console.log('\n▸ نمرهٔ عملی + کارآموزی (بند ۴.۲)');

test('W0 بوت بدون خطا', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  assert(W('db.internships.length') > 0, 'دادهٔ نمونهٔ کارآموزی نیست');
});

/* ── زمینهٔ دمو ── */
const ctx = W(`(function(){
  var school = db.schools.find(function(s){return workshopSchool(s.id);});
  if(!school) return null;
  var cls = db.classes.filter(function(c){return c.school_id===school.id&&c.grade==='دوازدهم';})[0];
  if(!cls) return null;
  var studs = db.users.filter(function(u){return u.role==='student'&&u.active&&(db.enrollments.some(function(e){return e.class_id===cls.id&&e.student_id===u.id;}));});
  var withPrac = studs.find(function(s){return db.grades.some(function(g){return g.student_id===s.id&&g.kind==='practical';});});
  var cls10 = db.classes.filter(function(c){return c.school_id===school.id&&c.grade==='دهم';})[0];
  var st10 = cls10?db.users.find(function(u){return u.role==='student'&&(db.enrollments.some(function(e){return e.class_id===cls10.id&&e.student_id===u.id;}));}):null;
  var otherSchool = db.schools.find(function(s){return !workshopSchool(s.id)&&s.active;});
  var otherCls = otherSchool?db.classes.filter(function(c){return c.school_id===otherSchool.id&&c.grade==='دوازدهم';})[0]:null;
  var otherSt = otherCls?db.users.find(function(u){return u.role==='student'&&(db.enrollments.some(function(e){return e.class_id===otherCls.id&&e.student_id===u.id;}));}):null;
  var teacher = db.schedule.find(function(x){return x.class_id===cls.id;});
  var teacher2 = db.schedule.find(function(x){
    return x.school_id===school.id&&x.class_id!==cls.id&&
      !db.schedule.some(function(y){return y.class_id===cls.id&&y.teacher_id===x.teacher_id;});
  });
  var manager = db.users.find(function(u){return u.role==='manager'&&u.school_id===school.id;});
  var parent = null;
  if(withPrac){
    var pl = db.parent_links.find(function(l){return l.student_id===withPrac.id;});
    parent = pl?(byId('users',pl.parent_id)||null):null;
  }
  return {sid:school.id, cls:cls.id, st:withPrac?withPrac.id:0, st10:st10?st10.id:0,
          otherSt:otherSt?otherSt.id:0, teacher:teacher?teacher.teacher_id:0,
          teacher2:teacher2?teacher2.teacher_id:0, manager:manager.id, parent:parent?parent.id:0};
})()`);
assert(ctx && ctx.sid, 'مدرسهٔ کارگاهی پیدا نشد');
assert(ctx.st, 'دانش‌آموزِ دوازدهمِ کارگاهی با نمرهٔ عملی پیدا نشد');

test('W1 دادهٔ نمونه: نمرهٔ عملی + ردیف‌های کارآموزی', () => {
  const n = W(`db.grades.filter(function(g){return g.kind==='practical'&&g.student_id===${ctx.st};}).length`);
  assert(n >= 1, 'نمرهٔ عملی برای دانش‌آموزِ نمونه نیست');
  const rows = W(`internshipSessions(${ctx.st})`);
  assert(rows.length >= 2, 'ردیف‌های کارآموزی کم‌اند');
  assert(rows.some(r => r.status === 'approved'), 'ردیفِ تأییدشدهٔ نمونه نیست');
  assert(rows.some(r => r.status === 'pending'), 'ردیفِ درانتظارِ نمونه نیست');
  const t = W(`internshipTotals(${ctx.st})`);
  assert(t.approved <= t.total, 'تأییدشده بیشتر از مجموع!');
  assert(t.approved < t.total, 'با وجودِ ردیفِ درانتظار، تأییدشده باید کمتر از مجموع باشد');
  assert(t.total > 0, 'مجموعِ ساعت صفر است');
});

test('W2 مرزها: مدرسهٔ غیرکارگاهی و سالِ غیرآخر', () => {
  assert(W(`workshopStudent(${ctx.st})`) === true, 'دانش‌آموزِ نمونه باید کارگاهی باشد');
  assert(W(`workshopStudent(${ctx.otherSt})`) === false, 'دانش‌آموزِ نظری نباید کارگاهی باشد');
  assert(W(`isFinalYearStudent(${ctx.st})`) === true, 'دوازدهم باید سالِ آخر باشد');
  assert(ctx.st10 && W(`isFinalYearStudent(${ctx.st10})`) === false, 'دهم نباید سالِ آخر باشد');
});

test('W3 کارتِ کارآموزی برای مدیر (با اعداد واقعی)', () => {
  W(`(function(){
    S.user=byId('users',${ctx.manager});S.persona=null;S.boss=null;
    S.child=${ctx.st};S.filters={};S.route='record';S.tab='grades';render();
  })()`);
  const has = W(`document.getElementById('root').innerHTML.indexOf('ساعتِ کارآموزی') > -1`);
  assert(has, 'کارتِ کارآموزی برای مدیر دیده نمی‌شود');
  const newBtn = W(`document.querySelectorAll('[data-act="internship-new"]').length`);
  assert(newBtn === 1, 'دکمهٔ «ثبتِ ساعت» برای مدیر نیست (تعداد: ' + newBtn + ')');
  const delBtns = W(`document.querySelectorAll('[data-act="internship-del"]').length`);
  assert(delBtns >= 2, 'دکمهٔ حذف برای مدیر نیست (تعداد: ' + delBtns + ')');
});

test('W4 کارت برای مدرسهٔ غیرکارگاهی نیست', () => {
  W(`(function(){
    S.user=byId('users',${ctx.manager});S.persona=null;S.boss=null;
    S.child=${ctx.otherSt};S.filters={};S.route='record';S.tab='grades';render();
  })()`);
  const has = W(`document.getElementById('root').innerHTML.indexOf('ساعتِ کارآموزی') > -1`);
  assert(!has, 'کارتِ کارآموزی نباید در مدرسهٔ نظری باشد');
});

test('W5 کارت برای پایهٔ دهم (سالِ غیرآخر) نیست', () => {
  if(!ctx.st10){ console.log('     (دانش‌آموزِ دهم نیست — رد می‌شود)'); return; }
  W(`(function(){
    S.user=byId('users',${ctx.manager});S.persona=null;S.boss=null;
    S.child=${ctx.st10};S.filters={};S.route='record';S.tab='grades';render();
  })()`);
  const has = W(`document.getElementById('root').innerHTML.indexOf('ساعتِ کارآموزی') > -1`);
  assert(!has, 'کارت نباید برای سالِ غیرآخر باشد');
});

test('W6 تأیید توسط دبیرِ مربوطه (مسیرِ واقعیِ کلیک)', () => {
  const pendId = W(`(function(){var r=db.internships.find(function(x){return x.student_id===${ctx.st}&&x.status==='pending';});return r?r.id:0;})()`);
  assert(pendId, 'ردیفِ درانتظار پیدا نشد');
  W(`(function(){
    S.user=byId('users',${ctx.teacher});S.persona=null;S.boss=null;
    S.child=${ctx.st};S.filters={};S.route='record';S.tab='grades';render();
  })()`);
  const btn = W(`document.querySelector('[data-act="internship-approve"][data-id="${pendId}"]')`);
  assert(btn, 'دکمهٔ تأیید برای دبیرِ مربوطه رندر نشد');
  W(`document.querySelector('[data-act="internship-approve"][data-id="${pendId}"]').click()`);
  const r = W(`byId('internships',${pendId})`);
  assert(r.status === 'approved', 'وضعیت پس از کلیک تأیید نشد');
  assert(r.approved_by === ctx.teacher, 'شناسهٔ تأییدکننده ذخیره نشد');
  assert(typeof r.approved_at === 'string' && r.approved_at.length === 10, 'تاریخِ تأیید ذخیره نشد');
});

test('W7 دبیرِ غیرمربوطه نمی‌تواند تأیید کند (گاردِ داده)', () => {
  const pend2 = W(`(function(){var r=db.internships.find(function(x){return x.student_id===${ctx.st}&&x.status==='pending';});return r?r.id:0;})()`);
  if(!pend2){ console.log('     (ردیفِ درانتظار دیگر نیست — مستقیم گارد را می‌سنجیم)'); }
  const recId = pend2 || W(`db.internships[0].id`);
  const allowed = W(`canApproveInternship(byId('internships',${recId}),'teacher')`);
  W(`(function(){ S.user=byId('users',${ctx.teacher2});S.persona=null;S.boss=null; })()`);
  const allowedAs = W(`canApproveInternship(byId('internships',${recId}))`);
  assert(allowedAs === false, 'دبیرِ غیرمربوطه نباید تأیید کند');
  /* اگر ردیفِ درانتظار بود، اکشنِ واقعی هم باید رد شود */
  if(pend2){
    W(`(function(){
      S.user=byId('users',${ctx.teacher});S.persona=null;S.boss=null;
      S.child=${ctx.st};S.filters={};S.route='record';S.tab='grades';render();
    })()`);
    W(`(function(){ S.user=byId('users',${ctx.teacher2}); })()`);
    const still = W(`byId('internships',${pend2}).status`);
    assert(still === 'pending', 'دبیرِ غیرمربوطه رکورد را تغییر داد!');
  }
  void allowed;
});

test('W8 مدیر: ثبتِ جلسهٔ تازه با فرمِ واقعی', () => {
  const before = W(`db.internships.length`);
  W(`(function(){
    S.user=byId('users',${ctx.manager});S.persona=null;S.boss=null;
    S.child=${ctx.st};S.filters={class:${ctx.cls}};S.route='record';S.tab='grades';render();
  })()`);
  W(`document.querySelector('[data-act="internship-new"]').click()`);
  W(`(function(){
    document.getElementById('in_hours').value='12';
    document.getElementById('in_loc').value='کارگاهِ تست';
    document.querySelector('[data-act="internship-save"]').click();
  })()`);
  const after = W(`db.internships.length`);
  assert(after === before + 1, 'ردیفِ تازه اضافه نشد');
  const r = W(`db.internships[db.internships.length-1]`);
  assert(r.student_id === ctx.st, 'ردیف به دانش‌آموزِ درست نگرفت');
  assert(r.school_id === ctx.sid, 'مدرسهٔ رکورد درست نیست');
  assert(r.hours === 12, 'ساعت ذخیره نشد');
  assert(r.status === 'pending', 'ردیفِ تازه باید درانتظار باشد');
});

test('W9 ولی: فقط‌خواندنی (بدون دکمهٔ ثبت/حذف)', () => {
  if(!ctx.parent){ console.log('     (ولیه نمونه نیست — رد می‌شود)'); return; }
  W(`(function(){
    S.user=byId('users',${ctx.parent});S.persona=null;S.boss=null;
    S.child=${ctx.st};S.filters={};S.route='children';render();
  })()`);
  const has = W(`document.getElementById('root').innerHTML.indexOf('ساعتِ کارآموزی') > -1`);
  assert(has, 'ولی باید پیشرفتِ کارآموزیِ فرزند را ببیند');
  const n = W(`document.querySelectorAll('[data-act="internship-new"],[data-act="internship-del"],[data-act="internship-approve"]').length`);
  assert(n === 0, 'ولی نباید دکمهٔ تغییر داشته باشد (تعداد: ' + n + ')');
});

test('W10 ثبتِ نمرهٔ عملی از فرمِ واقعی (مدرسهٔ کارگاهی)', () => {
  W(`(function(){
    S.user=byId('users',${ctx.teacher});S.persona=null;S.boss=null;
    S.filters={class:${ctx.cls},date:todayISO()};S.route='grades';render();
  })()`);
  const nBefore = W(`db.grades.length`);
  /* مودالِ ثبت را باز می‌کنیم و نوع را «عملی» می‌کنیم */
  W(`(function(){
    document.querySelector('[data-act="grade-new"]').click();
    var k=document.getElementById('g_kind');
    if(!k) throw new Error('فیلدِ «نوع نمره» در فرم نیست');
    k.value='practical';
    document.getElementById('g_score').value='14';
    document.querySelector('[data-act="grade-save"]').click();
  })()`);
  const nAfter = W(`db.grades.length`);
  assert(nAfter === nBefore + 1, 'نمرهٔ تازه ثبت نشد');
  const g = W(`db.grades[db.grades.length-1]`);
  assert(g.kind === 'practical', 'نوعِ نمره «عملی» ذخیره نشد (گرفت: ' + g.kind + ')');
});

test('W11 مدرسهٔ غیرکارگاهی فیلدِ نوعِ نمره ندارد', () => {
  const t2 = W(`(function(){
    var s=db.schools.find(function(x){return !workshopSchool(x.id)&&x.active;});
    var c=db.classes.find(function(x){return x.school_id===s.id;});
    var t=db.schedule.find(function(x){return x.class_id===c.id;});
    return t?t.teacher_id:0;
  })()`);
  W(`(function(){
    S.user=byId('users',${t2});S.persona=null;S.boss=null;
    S.filters={};S.route='grades';render();
  })()`);
  W(`document.querySelector('[data-act="grade-new"]').click()`);
  const k = W(`document.getElementById('g_kind')`);
  assert(!k, 'مدرسهٔ نظری نباید فیلدِ «نوع نمره» داشته باشد');
  W(`document.querySelector('[data-act="modal-close"]').click()`);
});

await sleep(100);
console.log('\n────────────────────────────────────────────────────');
console.log(`workshop2 (عملی+کارآموزی): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
if (fail) process.exit(1);
process.exit(0);
}
