#!/usr/bin/env node
/**
 * E.1 — نمرهٔ عملی/کارگاهی هنرستان: فیلدهای تئوری/عملی (grades)
 *  - فیلدهای تازه: theoretical_score / practical_score / is_vocational
 *  - نمرهٔ نهایی (score) = میانگینِ قسمت‌هایِ پرشده
 *  - سازگاریِ عقب: رکوردِ واحدِ kind=practical (بند ۴.۲) دست‌نخورده
 *  - نما: ستون‌های تئوری/عملی فقط کلاسِ کارگاهی
 *  - کارنامه: نمایشِ جداگانه (چِپِ پرونده + کارنامهٔ A4)
 *
 * اجرا:  node tests/vocational-grades.js   (نیازمند jsdom)
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
console.log('\n▸ E.1 — نمره‌های تئوری/عملی هنرستان');

test('V0 بوت بدون خطا', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
});

/* ── زمینه دمو ── */
const ctx = W(`(function(){
  var school = db.schools.find(function(s){return workshopSchool(s.id);});
  if(!school) return null;
  var cls = db.classes.filter(function(c){return c.school_id===school.id&&c.grade==='دوازدهم';})[0];
  if(!cls) return null;
  var combined = db.grades.find(function(g){return g.is_vocational===true&&g.theoretical_score!=null&&g.practical_score!=null;});
  if(!combined) return null;
  var studs = db.users.filter(function(u){return u.role==='student'&&u.active&&(db.enrollments.some(function(e){return e.class_id===cls.id&&e.student_id===u.id;}));});
  var teacher = db.schedule.find(function(x){return x.class_id===cls.id;});
  var manager = db.users.find(function(u){return u.role==='manager'&&u.school_id===school.id;});
  var pl = db.parent_links.find(function(l){return l.student_id===combined.student_id;});
  var parent = pl?(byId('users',pl.parent_id)||null):null;
  var otherSchool = db.schools.find(function(s){return !workshopSchool(s.id)&&s.active;});
  var otherCls = otherSchool?db.classes.filter(function(c){return c.school_id===otherSchool.id&&c.grade==='دوازدهم';})[0]:null;
  var otherSt = otherCls?db.users.find(function(u){return u.role==='student'&&u.active&&(db.enrollments.some(function(e){return e.class_id===otherCls.id&&e.student_id===u.id;}));}):null;
  var otherT = otherCls?db.schedule.find(function(x){return x.class_id===otherCls.id;}):null;
  return {sid:school.id, cls:cls.id, cstudent:combined.student_id, csubject:combined.subject_id,
          st:studs[0]?studs[0].id:0, teacher:teacher?teacher.teacher_id:0, manager:manager.id,
          parent:parent?parent.id:0, otherSt:otherSt?otherSt.id:0, otherT:otherT?otherT.teacher_id:0};
})()`);
assert(ctx && ctx.sid, 'زمینهٔ دمو (مدرسهٔ کارگاهی + نمرهٔ ترکیبی) پیدا نشد');

test('V1 دادهٔ نمونه: نمرهٔ ترکیبی تئوری/عملی با score = میانگین', () => {
  const g = W(`db.grades.find(function(g){return g.is_vocational===true&&g.theoretical_score!=null&&g.practical_score!=null;})`);
  assert(g, 'رکوردِ ترکیبی در دادهٔ نمونه نیست');
  assert(g.theoretical_score === 15 && g.practical_score === 17, 'قسمت‌های نمونه درست نیستند');
  assert(g.score === 16, 'score باید میانگین (۱۵+۱۷)/۲ = ۱۶ باشد (گرفت: ' + g.score + ')');
  assert(g.kind === 'theory', 'رکوردِ ترکیبی باید kind=theory باشد');
});

test('V2 vocationalParts: تفسیرِ قسمت‌ها + سازگاریِ رکوردِ کهنهٔ practical', () => {
  const c = W(`(function(){var g=db.grades.find(function(g){return g.is_vocational===true&&g.theoretical_score!=null;});var v=vocationalParts(g);return {t:v.theory,p:v.practice};})()`);
  assert(c.t === 15 && c.p === 17, 'vocationalParts روی رکوردِ ترکیبی درست کار نمی‌کند');
  const leg = W(`(function(){var g=db.grades.find(function(g){return g.kind==='practical';});var v=vocationalParts(g);return {t:v.theory,p:v.practice,s:g.score};})()`);
  assert(leg.t === null, 'رکوردِ کهنهٔ practical نباید قسمتِ تئوری داشته باشد');
  assert(leg.p === leg.s, 'نمرهٔ عملیِ رکوردِ کهنه باید همان score باشد');
  const plain = W(`(function(){var g=db.grades.find(function(g){return !g.kind||g.kind==='theory';});return vocationalParts(g);})()`);
  assert(plain === null, 'رکوردِ معمولی نباید قسمت داشته باشد');
});

test('V3 مودال: مدرسهٔ کارگاهی فیلدهای تئوری/عملی + toggle دارد', () => {
  W(`(function(){S.user=byId('users',${ctx.teacher});S.persona=null;S.boss=null;S.filters={class:${ctx.cls}};S.route='grades';render();})()`);
  W(`document.querySelector('[data-act="grade-new"]').click()`);
  assert(W(`!!document.getElementById('g_theory')`), 'فیلدِ «نمرهٔ تئوری» در فرم نیست');
  assert(W(`!!document.getElementById('g_practical')`), 'فیلدِ «نمرهٔ عملی» در فرم نیست');
  assert(W(`!!document.getElementById('g_kind')`), 'فیلدِ «نوع نمره» در فرم نیست');
  /* نوعِ پیش‌فرض «تئوری» است ⇒ قسمت‌ها دیده می‌شوند، فیلدِ نمره پنهان */
  assert(W(`document.getElementById('g_parts_wrap').style.display !== 'none'`), 'قسمت‌ها در نوعِ تئوری باید دیده شوند');
  assert(W(`document.getElementById('g_score_field').style.display === 'none'`), 'فیلدِ «نمره» در نوعِ تئوری باید پنهان باشد');
  /* toggle: عملی ⇒ برعکس */
  W(`(function(){var k=document.getElementById('g_kind');k.value='practical';k.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert(W(`document.getElementById('g_score_field').style.display !== 'none'`), 'فیلدِ «نمره» در نوعِ عملی باید دیده شود');
  assert(W(`document.getElementById('g_parts_wrap').style.display === 'none'`), 'قسمت‌ها در نوعِ عملی باید پنهان باشند');
  W(`document.querySelector('[data-act="modal-close"]').click()`);
});

test('V4 مودال: مدرسهٔ غیرکارگاهی فیلدهای تازه ندارد', () => {
  W(`(function(){S.user=byId('users',${ctx.otherT});S.persona=null;S.boss=null;S.filters={};S.route='grades';render();})()`);
  W(`document.querySelector('[data-act="grade-new"]').click()`);
  assert(!W(`document.getElementById('g_theory')`), 'مدرسهٔ نظری نباید «نمرهٔ تئوری» داشته باشد');
  assert(!W(`document.getElementById('g_practical')`), 'مدرسهٔ نظری نباید «نمرهٔ عملی» داشته باشد');
  assert(W(`!!document.getElementById('g_score')`), 'مدرسهٔ نظری باید فیلدِ «نمره» داشته باشد');
  W(`document.querySelector('[data-act="modal-close"]').click()`);
});

test('V5 ثبتِ ترکیبی از فرمِ واقعی (کلیک): parts + score = میانگین', () => {
  const nBefore = W(`db.grades.length`);
  W(`(function(){S.user=byId('users',${ctx.teacher});S.persona=null;S.boss=null;S.filters={class:${ctx.cls}};S.route='grades';render();})()`);
  W(`(function(){
    document.querySelector('[data-act="grade-new"]').click();
    var st=document.getElementById('g_st');
    for(var i=0;i<st.options.length;i++){ if(Number(st.options[i].value)===${ctx.st}) { st.value=String(${ctx.st}); break; } }
    document.getElementById('g_theory').value='14';
    document.getElementById('g_practical').value='16';
    document.querySelector('[data-act="grade-save"]').click();
  })()`);
  const nAfter = W(`db.grades.length`);
  assert(nAfter === nBefore + 1, 'نمرهٔ تازه ثبت نشد');
  const g = W(`db.grades[db.grades.length-1]`);
  assert(g.is_vocational === true, 'is_vocational ذخیره نشد');
  assert(g.theoretical_score === 14 && g.practical_score === 16, 'قسمت‌ها درست ذخیره نشدند');
  assert(g.score === 15, 'score باید (۱۴+۱۶)/۲ = ۱۵ باشد (گرفت: ' + g.score + ')');
});

test('V6 ثبتِ فقط‌تئوری: score = همان تئوری', () => {
  const nBefore = W(`db.grades.length`);
  W(`(function(){S.user=byId('users',${ctx.teacher});S.persona=null;S.boss=null;S.filters={class:${ctx.cls}};S.route='grades';render();})()`);
  W(`(function(){
    document.querySelector('[data-act="grade-new"]').click();
    var st=document.getElementById('g_st');
    for(var i=0;i<st.options.length;i++){ if(Number(st.options[i].value)===${ctx.st}) { st.value=String(${ctx.st}); break; } }
    document.getElementById('g_theory').value='18';
    document.querySelector('[data-act="grade-save"]').click();
  })()`);
  const nAfter = W(`db.grades.length`);
  assert(nAfter === nBefore + 1, 'نمرهٔ تازه ثبت نشد');
  const g = W(`db.grades[db.grades.length-1]`);
  assert(g.theoretical_score === 18 && g.practical_score === null, 'فقط‌تئوری درست ذخیره نشد');
  assert(g.score === 18, 'score بدونِ قسمتِ عملی باید همان تئوری باشد (گرفت: ' + g.score + ')');
});

test('V7 اعتبارسنجی: هر دو قسمت خالی ⇒ رد', () => {
  const nBefore = W(`db.grades.length`);
  W(`(function(){S.user=byId('users',${ctx.teacher});S.persona=null;S.boss=null;S.filters={class:${ctx.cls}};S.route='grades';render();})()`);
  W(`(function(){
    document.querySelector('[data-act="grade-new"]').click();
    document.getElementById('g_theory').value='';
    document.getElementById('g_practical').value='';
    document.querySelector('[data-act="grade-save"]').click();
  })()`);
  const nAfter = W(`db.grades.length`);
  assert(nAfter === nBefore, 'با هر دو قسمتِ خالی نباید رکوردی ساخته شود');
  const toastShown = W(`(function(){var ts=document.querySelectorAll('#toasts .toast.err');var t=ts[ts.length-1];return t&&/تئوری|عملی/.test(t.textContent);})()`);
  assert(toastShown, 'پیامِ هشدارِ «حداقل یکی از قسمت‌ها» نمایش داده نشد');
});

test('V8 اعتبارسنجی: مقدار بیش از ۲۰ ⇒ رد', () => {
  const nBefore = W(`db.grades.length`);
  W(`(function(){
    document.querySelector('[data-act="modal-close"]').click();
    document.querySelector('[data-act="grade-new"]').click();
    document.getElementById('g_theory').value='25';
    document.querySelector('[data-act="grade-save"]').click();
  })()`);
  const nAfter = W(`db.grades.length`);
  assert(nAfter === nBefore, 'نمرهٔ ۲۵ نباید ثبت شود');
});

test('V9 رکوردِ واحدِ کارگاهی (بند ۴.۲) با فیلدهای تازه هم‌پیکر می‌شود', () => {
  const nBefore = W(`db.grades.length`);
  W(`(function(){S.user=byId('users',${ctx.teacher});S.persona=null;S.boss=null;S.filters={class:${ctx.cls}};S.route='grades';render();})()`);
  W(`(function(){
    document.querySelector('[data-act="modal-close"]').click();
    document.querySelector('[data-act="grade-new"]').click();
    var k=document.getElementById('g_kind');
    k.value='practical';
    k.dispatchEvent(new Event('change',{bubbles:true}));
    document.getElementById('g_score').value='12';
    document.querySelector('[data-act="grade-save"]').click();
  })()`);
  const nAfter = W(`db.grades.length`);
  assert(nAfter === nBefore + 1, 'نمرهٔ کارگاهیِ واحد ثبت نشد');
  const g = W(`db.grades[db.grades.length-1]`);
  assert(g.kind === 'practical', 'نوع «عملی» ذخیره نشد');
  assert(g.practical_score === 12 && g.theoretical_score === null, 'فیلدهای تازه روی رکوردِ واحد پر نشدند');
  assert(g.score === 12 && g.is_vocational === true, 'score/is_vocational رکوردِ واحد درست نیست');
});

test('V10 نما: کلاسِ کارگاهی ستون‌های تئوری/عملی دارد؛ کلاسِ نظری نه', () => {
  W(`(function(){S.user=byId('users',${ctx.manager});S.persona=null;S.boss=null;S.filters={class:${ctx.cls}};S.route='grades';render();})()`);
  let h = W(`document.getElementById('root').innerHTML`);
  assert(h.indexOf('<th>تئوری</th>') > -1 && h.indexOf('<th>عملی</th>') > -1, 'ستون‌های تئوری/عملی در کلاسِ کارگاهی نیستند');
  const otherCls = W(`(function(){var s=db.schools.find(function(s){return !workshopSchool(s.id)&&s.active;});return db.classes.filter(function(c){return c.school_id===s.id;})[0].id;})()`);
  W(`(function(){S.user=byId('users',${ctx.manager});S.filters={class:${otherCls}};S.route='grades';render();})()`);
  h = W(`document.getElementById('root').innerHTML`);
  assert(h.indexOf('<th>تئوری</th>') === -1, 'ستون‌های تئوری/عملی نباید در کلاسِ نظری باشند');
});

test('V11 کارنامهٔ پرونده: نمایشِ جداگانهٔ تئوری/عملی (دانش‌آموز و ولی)', () => {
  W(`(function(){S.user=byId('users',${ctx.cstudent});S.persona=null;S.boss=null;S.child=0;S.filters={};S.route='record';S.tab='grades';render();})()`);
  let h = W(`document.getElementById('root').innerHTML`);
  assert(h.indexOf('تئوری') > -1 && h.indexOf('عملی') > -1, 'کارنامهٔ دانش‌آموزِ کارگاهی قسمت‌ها را نشان نمی‌دهد');
  if (ctx.parent) {
    W(`(function(){S.user=byId('users',${ctx.parent});S.persona=null;S.boss=null;S.child=${ctx.cstudent};S.filters={};S.route='record';S.tab='grades';render();})()`);
    h = W(`document.getElementById('root').innerHTML`);
    assert(h.indexOf('تئوری') > -1, 'ولی باید قسمت‌های تئوری/عملی فرزند را ببیند');
  }
});

test('V12 کارنامهٔ A4: ستون‌های تئوری/عملی فقط برای دانش‌آموزِ کارگاهی', () => {
  const voc = W(`(function(){var r=reportCardCert(${ctx.cstudent},'نوبت اول');return r.ok?r.body:'';})()`);
  assert(voc.indexOf('نمرهٔ تئوری') > -1 && voc.indexOf('نمرهٔ عملی') > -1, 'کارنامهٔ A4ِ کارگاهی ستون‌های تازه ندارد');
  if (ctx.otherSt) {
    const plain = W(`(function(){var r=reportCardCert(${ctx.otherSt},'');return r.ok?r.body:'';})()`);
    if (plain) assert(plain.indexOf('نمرهٔ تئوری') === -1, 'کارنامهٔ A4ِ نظری نباید ستون‌های تازه داشته باشد');
  }
});

test('V13 ویرایشِ رکوردِ ترکیبی: تغییرِ تئوری ⇒ score تازه می‌شود', () => {
  const gid = W(`db.grades.find(function(g){return g.is_vocational===true&&g.theoretical_score===15;}).id`);
  W(`(function(){S.user=byId('users',${ctx.manager});S.persona=null;S.boss=null;S.filters={class:${ctx.cls}};S.route='grades';render();})()`);
  W(`(function(){
    document.querySelector('[data-act="grade-edit"][data-id="${gid}"]').click();
    document.getElementById('g_theory').value='16';
    document.querySelector('[data-act="grade-save"]').click();
  })()`);
  const g = W(`byId('grades',${gid})`);
  assert(g.theoretical_score === 16, 'تغییرِ تئوری ذخیره نشد');
  assert(g.score === 16.5, 'score باید (۱۶+۱۷)/۲ = ۱۶٫۵ شود (گرفت: ' + g.score + ')');
});

await sleep(100);
console.log('\n────────────────────────────────────────────────────');
console.log(`vocational-grades (E.1 تئوری/عملی): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
if (fail) process.exit(1);
process.exit(0);
}
