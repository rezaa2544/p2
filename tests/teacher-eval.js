#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   teacher-eval.js — بند ب.۳: ارزشیابی ناشناس معلم (رفتاری)
   ───────────────────────────────────────────────────────────────────
   E1  معیارهای پنج‌گانهٔ ثابت
   E2  فرم دانش‌آموز: ناشناسی + معیارها + بازخورد
   E3  ثبت ناقص (معیارِ بی‌امتیاز) رد می‌شود
   E4  رکورد ذخیره‌شده هیچ فیلد هویتی ندارد (مهم‌ترین آزمون)
   E5  گارد دامنه: دبیرِ مدرسهٔ دیگر رد می‌شود (IDOR)
   E6  ولی از طریقِ فرزندانِ خود ارزشیابی می‌کند
   E7  نمای مدیر تجمیعی است و نام پاسخ‌دهنده ندارد
   E8  evalAggregate خالص: میانگین‌ها درست
   E9  دبیر به روت دسترسی ندارد
   E10 بازخوردِ شاملِ اسکریپت فرار می‌کند (XSS)
   E11 بازخوردِ بلند به ۵۰۰ نویسه بریده می‌شود
   E12 مدلِ مجوز: فقط دانش‌آموز/ولی می‌نویسند؛ ویرایش/حذف ندارد
   اجرا:  node tests/teacher-eval.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const MODEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz', 'model.json'), 'utf8'));

let pass = 0, fail = 0;
const errors = [];
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) { fail++; errors.push(name + ': ' + e.message); console.log(`  ❌ ${name}\n     ${e.message}`); resolve(); return; }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; errors.push(name + ': ' + e.message); console.log(`  ❌ ${name}\n     ${e.message}`); }
    ).then(resolve);
  }));
  __seq = p;
}
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

/* فرمِ مصنوعی برای صدا زدن مستقیمِ اکشن (خارج از رندر) */
function ensureForm(tid, fb) {
  W(`(function(){
    var t=document.getElementById('ev_teacher')||document.createElement('select');
    t.id='ev_teacher';
    if(!t.querySelector('option[value=\"${tid}\"]')){var o=document.createElement('option');o.value='${tid}';o.textContent='t';t.appendChild(o);}
    t.value='${tid}';if(!t.parentNode)document.body.appendChild(t);
    var b=document.getElementById('ev_feedback')||document.createElement('textarea');
    b.id='ev_feedback';b.value=${JSON.stringify(fb || '')};if(!b.parentNode)document.body.appendChild(b);else b.value=${JSON.stringify(fb || '')};
  })()`);
}

const consoleErrors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  virtualConsole: new (require('jsdom').VirtualConsole)()
    .on('jsdomError', (e) => consoleErrors.push(e.message))
    .on('error', (m) => consoleErrors.push(String(m))),
});
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mainHtml = () => (win.document.querySelector('.main') || {}).innerHTML || '';

/* فیلدهای هویتیِ ممنوع — حتی یکی از این‌ها در رکورد = شکستِ ناشناسی */
const IDENTITY_KEYS = ['created_by','author','author_id','user_id','student_id','parent_id',
  'respondent','respondent_id','by','uid','national_id','phone','username','full_name'];

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  await sleep(600);
  console.log('\n▸ ب.۳ — ارزشیابی ناشناس معلم');

  /* ── E1 ── */
  test('E1 معیارهای پنج‌گانهٔ ثابت', () => {
    const c = W('TEVAL_CRITERIA');
    assert(Array.isArray(c) && c.length === 5, 'تعداد معیارها: ' + (c || []).length);
    const keys = c.map(x => x[0]);
    ['mastery','behavior','discipline','feedback','fairness'].forEach(k =>
      assert(keys.indexOf(k) > -1, 'معیار ' + k + ' نیست'));
    assert(c.every(x => x[1] && x[1].length > 2), 'برچسب فارسی ناقص');
  });

  /* ── E2 ── */
  let STU;
  test('E2 فرم دانش‌آموز: دبیران + نشانهٔ ناشناسی', () => {
    STU = W(`db.users.find(u=>u.role==='student').id`);
    W(`S.user=byId('users',${STU});S.route='teacheval';S.filters={};render()`);
    const h = mainHtml();
    assert(h.indexOf('کاملاً ناشناس') > -1, 'نشانهٔ ناشناسی نیست');
    assert(W(`tevalTeachersFor(byId('users',${STU})).length`) > 0, 'دبیری پیدا نشد');
    assert(h.indexOf('data-act="eval-rate"') > -1, 'ستاره‌های امتیاز نیست');
    assert(h.indexOf('data-act="eval-save"') > -1, 'دکمهٔ ثبت نیست');
  });

  /* ── E3 ── */
  test('E3 ثبت ناقص رد می‌شود', () => {
    const before = W('db.teacher_evaluations.length');
    const tid = W(`tevalTeachersFor(byId('users',${STU}))[0].id`);
    W(`S.filters._teval={tid:${tid},rates:{mastery:5,behavior:4}};0`);
    ensureForm(tid, '');
    W(`TEVAL_ACTIONS['eval-save']()`);
    assert(W('db.teacher_evaluations.length') === before, 'رکورد ناقص ثبت شد');
  });

  /* ── E4 (مهم‌ترین) ── */
  test('E4 رکورد ذخیره‌شده هیچ فیلد هویتی ندارد', () => {
    const before = W('db.teacher_evaluations.length');
    const tid = W(`tevalTeachersFor(byId('users',${STU}))[0].id`);
    W(`S.filters._teval={tid:${tid},rates:{mastery:5,behavior:4,discipline:5,feedback:3,fairness:4},fb:''};0`);
    ensureForm(tid, '');
    W(`TEVAL_ACTIONS['eval-save']()`);
    assert(W('db.teacher_evaluations.length') === before + 1, 'رکورد ثبت نشد');
    const rec = W(`db.teacher_evaluations[db.teacher_evaluations.length-1]`);
    const keys = Object.keys(rec);
    IDENTITY_KEYS.forEach(k => assert(keys.indexOf(k) < 0, 'فیلد هویتی ' + k + ' در رکورد است'));
    assert(rec.teacher_id === tid, 'teacher_id نادرست');
    assert(rec.school_id === W(`byId('users',${STU}).school_id`), 'school_id نادرست');
    assert(rec.criteria && rec.criteria.mastery === 5, 'معیارها ذخیره نشد');
    assert(typeof rec.created_at === 'string' && rec.created_at.length >= 10, 'created_at نیست');
  });

  /* ── E5 ── */
  test('E5 گارد دامنه: دبیرِ بیرونِ مدارسِ پاسخ‌دهنده رد می‌شود', () => {
    /* شناسهٔ ناموجود = به‌طور قطع بیرون دامنه (حملهٔ دستکاریِ پارامتر) */
    const FAKE = 99999999;
    const before = W('db.teacher_evaluations.length');
    W(`S.filters._teval={tid:${FAKE},rates:{mastery:5,behavior:4,discipline:5,feedback:3,fairness:4},fb:''};0`);
    ensureForm(FAKE, '');
    W(`TEVAL_ACTIONS['eval-save']()`);
    assert(W('db.teacher_evaluations.length') === before, 'ثبت برای دبیر خارج دامنه انجام شد (IDOR)');
    assert(!W(`tevalTeacherAllowed(byId('users',${STU}),${FAKE})`), 'tevalTeacherAllowed درست کار نمی‌کند');
    /* دبیر واقعیِ بیرون دامنه هم (اگر در داده هست) اجازه نمی‌گیرد */
    const other = W(`(function(){
      var sids=tevalSchoolIdsFor(byId('users',${STU}));
      var t=db.users.find(u=>u.role==='teacher'&&sids.indexOf(u.school_id)<0
        &&!db.teacher_schools.some(x=>x.teacher_id===u.id&&sids.indexOf(x.school_id)>-1&&x.active));
      return t?t.id:0;})()`);
    if (other) assert(!W(`tevalTeacherAllowed(byId('users',${STU}),${other})`), 'دبیر بیرون دامنه مجاز شناخته شد');
  });

  /* ── E6 ── */
  test('E6 ولی از راه فرزندان ارزشیابی می‌کند', () => {
    const P = W(`db.users.find(u=>u.role==='parent'&&db.parent_links.some(l=>l.parent_id===u.id)).id`);
    assert(W(`tevalSchoolIdsFor(byId('users',${P})).length`) > 0, 'مدارس فرزند پیدا نشد');
    assert(W(`tevalTeachersFor(byId('users',${P})).length`) > 0, 'دبیر برای ولی پیدا نشد');
    const tid = W(`tevalTeachersFor(byId('users',${P}))[0].id`);
    const before = W('db.teacher_evaluations.length');
    W(`S.user=byId('users',${P});S.filters._teval={tid:${tid},rates:{mastery:4,behavior:4,discipline:4,feedback:4,fairness:4},fb:'خوب'};0`);
    ensureForm(tid, 'خوب');
    W(`TEVAL_ACTIONS['eval-save']()`);
    assert(W('db.teacher_evaluations.length') === before + 1, 'ارزشیابی ولی ثبت نشد');
    const rec = W(`db.teacher_evaluations[db.teacher_evaluations.length-1]`);
    assert(IDENTITY_KEYS.every(k => !(k in rec)), 'رکوردِ ولی فیلد هویتی دارد');
  });

  /* ── E7 ── */
  test('E7 نمای مدیر تجمیعی است و نام پاسخ‌دهنده ندارد', () => {
    const resp = W(`byId('users',${STU}).full_name`);
    const M = W(`db.users.find(u=>u.role==='manager'&&db.teacher_evaluations.some(e=>e.school_id===u.school_id)).id`);
    W(`S.user=byId('users',${M});S.route='teacheval';S.filters={};render()`);
    const h = mainHtml();
    assert(h.indexOf('نتیجهٔ تجمیعی') > -1, 'نمای تجمیعی نیست');
    assert(h.indexOf(resp) < 0, 'نام پاسخ‌دهنده در نمای مدیر دیده شد');
    assert(h.indexOf('data-act="eval-save"') < 0, 'مدیر نباید فرم ثبت ببیند');
  });

  /* ── E8 ── */
  test('E8 evalAggregate خالص: میانگین درست', () => {
    const agg = W(`(function(){
      db.__bk=db.teacher_evaluations;
      db.teacher_evaluations=[
        {school_id:1,teacher_id:4,criteria:{mastery:4,behavior:2,discipline:3,feedback:5,fairness:1},feedback:'',created_at:'2026-09-01'},
        {school_id:1,teacher_id:4,criteria:{mastery:2,behavior:4,discipline:5,feedback:3,fairness:5},feedback:'ف',created_at:'2026-09-02'}];
      var r=evalAggregate([1]); db.teacher_evaluations=db.__bk; return r;})()`);
    const row = agg['4'];
    assert(row && row.n === 2, 'شمارش نادرست');
    assert(row.avgs.mastery === 3 && row.avgs.behavior === 3 && row.avgs.discipline === 4
      && row.avgs.feedback === 4 && row.avgs.fairness === 3, 'میانگین معیارها نادرست: ' + JSON.stringify(row.avgs));
    assert(row.overall === 3.4, 'میانگین کل نادرست: ' + row.overall);
    assert(row.feedbacks.length === 1 && row.feedbacks[0].text === 'ف', 'بازخورد آزاد جمع نشد');
  });

  /* ── E9 ── */
  test('E9 دبیر به روت دسترسی ندارد', () => {
    const T = W(`db.users.find(u=>u.role==='teacher').id`);
    W(`S.user=byId('users',${T});S.route='teacheval';S.filters={};render()`);
    assert(mainHtml().indexOf('دسترسی مجاز نیست') > -1, 'دبیر روت را دید');
    assert(!W(`canRoute('teacheval','teacher')`), 'canRoute برای دبیر باز است');
  });

  /* ── E10 ── */
  test('E10 فرارِ اسکریپت در بازخورد (XSS)', () => {
    const evil = '<script>window.__x=1</script>';
    const before = W('db.teacher_evaluations.length');
    const tid = W(`tevalTeachersFor(byId('users',${STU}))[0].id`);
    W(`S.user=byId('users',${STU});S.filters._teval={tid:${tid},rates:{mastery:5,behavior:5,discipline:5,feedback:5,fairness:5},fb:''};0`);
    ensureForm(tid, evil);
    W(`TEVAL_ACTIONS['eval-save']()`);
    assert(W('db.teacher_evaluations.length') === before + 1, 'رکورد ثبت نشد');
    const M = W(`db.users.find(u=>u.role==='manager'&&db.teacher_evaluations.some(e=>e.school_id===u.school_id)).id`);
    W(`S.user=byId('users',${M});S.route='teacheval';S.filters={};render()`);
    const h = mainHtml();
    assert(h.indexOf('<script>window.__x=1</script>') < 0, 'اسکریپت خام رندر شد');
    assert(!win.__x, 'اسکریپت اجرا شد');
    assert(h.indexOf('&lt;script&gt;') > -1, 'متن فرار‌شده نمایش داده نشد');
  });

  /* ── E11 ── */
  test('E11 برش بازخورد به ۵۰۰ نویسه', () => {
    const tid = W(`tevalTeachersFor(byId('users',${STU}))[0].id`);
    W(`S.user=byId('users',${STU});S.filters._teval={tid:${tid},rates:{mastery:1,behavior:1,discipline:1,feedback:1,fairness:1},fb:''};0`);
    ensureForm(tid, 'ا'.repeat(600));
    W(`TEVAL_ACTIONS['eval-save']()`);
    const rec = W(`db.teacher_evaluations[db.teacher_evaluations.length-1]`);
    assert(String(rec.feedback).length === 500, 'بازخورد بریده نشد: ' + String(rec.feedback).length);
  });

  /* ── E12 ── */
  test('E12 مدل مجوز: فقط دانش‌آموز/ولی؛ بدون ویرایش و حذف', () => {
    const def = MODEL.collections.teacher_evaluations;
    assert(def, 'مجموعه در مدل نیست');
    assert(JSON.stringify(def.ins.slice().sort()) === JSON.stringify(['parent','student']), 'نقش‌های درج: ' + def.ins);
    assert((def.upd || []).length === 0, 'ویرایش باز است — ناشناسی را می‌شکند');
    assert((def.del || []).length === 0, 'حذف باز است — ناشناسی را می‌شکند');
    IDENTITY_KEYS.forEach(k => assert(def.fields.indexOf(k) < 0, 'فیلد هویتی ' + k + ' در مدل تعریف شده'));
  });

  await __seq;
  const total = pass + fail;
  console.log('────────────────────────────────────────────────────');
  console.log(`ارزشیابی ناشناس معلم: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
  process.exit(fail ? 1 : 0);
}
