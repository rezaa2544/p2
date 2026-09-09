#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   region-scorecard.js — بند د.۲: کارت امتیازی منطقه (رفتاری)
   ───────────────────────────────────────────────────────────────────
   R1  بعد مالی: نرخ اقساط پرداخت‌شده
   R2  بعد داخلی: حضور + اشغال ظرفیت (وزن ۶۰/۴۰)
   R3  بعد رشد: نوبت دوم در برابر نوبت اول
   R4  بعد رضایت: شکایت به ازای دانش‌آموز
   R5  بعد مدیریت: نسبت + نشانه‌های ادارهٔ مدرسه
   R6  آستانه‌های بازه: ۶۰ سبز · ۵۹٫۹ کهربایی · ۳۵ کهربایی · ۳۴٫۹ قرمز
   R7  مدرسهٔ بی‌داده = «داده ناکافی»، نه صفر
   R8  بازنرمال‌سازی وزن‌ها با ابعادِ موجود
   R9  مرتب‌سازی نزولی؛ ناکافی‌ها آخر
   R10 ایزولاسیون دامنه: اداره فقط محدودهٔ خود؛ مدیر/دبیر اصلاً دسترسی ندارند
   R11 خروجی CSV: سرستون‌های ۵ بعد + تعداد ردیف = مدارس محدوده
   اجرا:  node tests/region-scorecard.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
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
    catch (e) { fail++; errors.push(name + ': ' + e.message); console.log(`  ❌ ${name}\n     ${e.message}`); resolve(); return; }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; errors.push(name + ': ' + e.message); console.log(`  ❌ ${name}\n     ${e.message}`); }
    ).then(resolve);
  }));
  __seq = p;
}
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  virtualConsole: new (require('jsdom').VirtualConsole)()
});
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mainHtml = () => (win.document.querySelector('.main') || {}).innerHTML || '';

/* دنیای مصنوعی: مدرسهٔ ۹۰۰۱ با دادهٔ کنترل‌شده */
function synthWorld() {
  W(`(function(){
    db.__bk={users:db.users.slice(),attendance:db.attendance.slice(),grades:db.grades.slice(),
      installments:db.installments.slice(),corrections:db.corrections.slice(),discipline:db.discipline.slice(),
      exam_terms:db.exam_terms.slice(),schools:db.schools.slice()};
    var sid=9001;
    db.schools=db.schools.concat([{id:sid,name:'مدرسه مصنوعی',capacity:100,active:1,county_id:(db.counties[0]||{}).id,level:'دبیرستان'}]);
    var kids=[],i;
    for(i=0;i<10;i++){var k={id:70000+i,role:'student',school_id:sid,full_name:'د'+i,active:1};kids.push(k.id);db.users.push(k);}
    db.users.push({id:71001,role:'teacher',school_id:sid,full_name:'ت مصنوعی',active:1});
    db.users.push({id:71002,role:'manager',school_id:sid,full_name:'م مصنوعی',active:1});
    db.attendance=db.attendance.filter(a=>a.school_id!==sid);
    for(i=0;i<10;i++)db.attendance.push({id:80000+i,school_id:sid,student_id:kids[i%10],date:'2026-09-0'+(1+i%9),status:i<8?'present':'absent'});
    db.installments=db.installments.filter(x=>kids.indexOf(x.student_id)<0);
    for(i=0;i<4;i++)db.installments.push({id:82000+i,student_id:kids[i],school_id:sid,amount:100,paid:i<2,status:i<2?'paid':'open'});
    db.grades=db.grades.filter(g=>g.school_id!==sid);
    for(i=0;i<4;i++)db.grades.push({id:83000+i,school_id:sid,student_id:kids[i],score:14,term:'نوبت اول',date:'2026-01-10'});
    for(i=0;i<4;i++)db.grades.push({id:83100+i,school_id:sid,student_id:kids[i],score:16,term:'نوبت دوم',date:'2026-05-10'});
    db.corrections=db.corrections.filter(c=>c.school_id!==sid);
    db.discipline=db.discipline.filter(d=>d.school_id!==sid);
    db.discipline.push({id:84000,school_id:sid,student_id:kids[0],kind:'negative',title:'ت',points:-1,date:'2026-04-01'});
    db.exam_terms=db.exam_terms.filter(t=>t.school_id!==sid);
    db.exam_terms.push({id:85000,school_id:sid,title:'ت مصنوعی',status:'published',start_date:'2026-01-01',end_date:'2026-01-20'});
  })()`);
}
function restoreWorld() { W(`(function(){var b=db.__bk;if(!b)return;Object.keys(b).forEach(k=>{db[k]=b[k]});db.__bk=null;})()`); }
const IX = () => W(`rscoreIndex()`);
const approx = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 0.11 : eps);

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  await sleep(600);
  console.log('\n▸ د.۲ — کارت امتیازی منطقه');

  /* مدرسهٔ مصنوعی با دادهٔ کنترل‌شده */
  synthWorld();

  test('R1 بعد مالی: ۲ از ۴ قسط = ۵۰', () => {
    const v = W(`dimFinance(9001, rscoreIndex())`);
    assert(v === 50, 'امتیاز مالی: ' + v);
  });

  test('R2 بعد داخلی: حضور ۸۰٪ (وزن .۶) + اشغال ۱۰٪ (وزن .۴) = ۵۲', () => {
    const v = W(`dimInternal({id:9001,capacity:100}, rscoreIndex())`);
    assert(approx(v, 52), 'امتیاز داخلی: ' + v);
  });

  test('R3 بعد رشد: معدل ۱۴ → ۱۶ = ۶۰', () => {
    const v = W(`dimGrowth(9001, rscoreIndex())`);
    assert(v === 60, 'امتیاز رشد: ' + v);
  });

  test('R4 بعد رضایت: ۱ شکایت برای ۱۰ دانش‌آموز = ۸۰', () => {
    const v = W(`dimSatisfaction(9001, rscoreIndex())`);
    assert(v === 80, 'امتیاز رضایت: ' + v);
  });

  test('R5 بعد مدیریت: نسبت ۱۰ + مدیر + فصل منتشرشده (بدون مانور) = ۸۳٫۳', () => {
    const v = W(`dimManagement({id:9001}, rscoreIndex())`);
    assert(approx(v, 83.3), 'امتیاز مدیریت: ' + v);
  });

  test('R6 آستانه‌های بازه روی مرزها', () => {
    /* حضور ۶۰۰/۱۰۰۰ = ۶۰ ⇒ سبز؛ ۵۹۹ ⇒ کهربایی؛ ۳۵۰ ⇒ کهربایی؛ ۳۴۹ ⇒ قرمز */
    const row = (present, total) => W(`(function(){
      db.attendance=db.attendance.filter(a=>a.school_id!==9002);
      for(var i=0;i<${total};i++)db.attendance.push({id:86000+i,school_id:9002,student_id:1,date:'2026-09-01',status:i<${present}?'present':'absent'});
      var r=schoolScoreRow({id:9002,name:'مرز',capacity:0}, rscoreIndex());
      db.attendance=db.attendance.filter(a=>a.school_id!==9002);
      return r;})()`);
    const g = row(600, 1000); assert(g.band === 'green' && g.score === 60, 'مرز ۶۰: ' + JSON.stringify([g.score, g.band]));
    const a1 = row(599, 1000); assert(a1.band === 'amber' && approx(a1.score, 59.9), 'مرز ۵۹٫۹: ' + JSON.stringify([a1.score, a1.band]));
    const a2 = row(350, 1000); assert(a2.band === 'amber' && a2.score === 35, 'مرز ۳۵: ' + JSON.stringify([a2.score, a2.band]));
    const r = row(349, 1000); assert(r.band === 'red' && approx(r.score, 34.9), 'مرز ۳۴٫۹: ' + JSON.stringify([r.score, r.band]));
  });

  test('R7 مدرسهٔ بی‌داده: ناکافی، نه صفر', () => {
    const r = W(`schoolScoreRow({id:9999,name:'خالی',capacity:0}, rscoreIndex())`);
    assert(r.score === null, 'امتیاز باید خالی باشد: ' + r.score);
    assert(r.band === 'nodata', 'بازه: ' + r.band);
    assert(r.missing.length === 5, 'باید ۵ بعد ناکافی باشد: ' + r.missing.length);
    /* مدرسهٔ بی‌دادهٔ واقعی در فهرست مدارس ⇒ ردیفِ ناکافی در CSV صفر نمی‌شود */
    W(`db.schools.push({id:9999,name:'خالی',capacity:0,active:1})`);
    const csv = W(`regionScoreCsvData()`);
    W(`db.schools.splice(db.schools.findIndex(s=>s.id===9999),1)`);
    const emptyRow = csv.rows.find(x => x[0] === 'خالی');
    assert(emptyRow, 'مدرسهٔ بی‌داده در CSV نیست');
    assert(emptyRow[3] === '' && emptyRow[4] === 'داده ناکافی', 'ردیف ناکافی در CSV صفر شد: ' + JSON.stringify([emptyRow[3], emptyRow[4]]));
    assert(emptyRow[5] === '' && emptyRow[9] === '', 'سلول‌های ابعاد باید خالی باشند نه صفر');
  });

  test('R8 بازنرمال‌سازی وزن‌ها: مالی ۵۰ + رضایت ۱۰۰ ⇒ ۷۱٫۴ نه ۲۵', () => {
    /* بدون بازنرمال: ۵۰×.۲ + ۱۰۰×.۱۵ = ۲۵؛ با بازنرمال روی مجموعِ وزن‌های موجود (.۳۵) ⇒ ۷۱٫۴ */
    const r = W(`(function(){
      db.__bk2={users:db.users};
      db.users=db.users.filter(u=>u.school_id!==9003);
      for(var i=0;i<4;i++)db.users.push({id:72000+i,role:'student',school_id:9003,active:1});
      db.installments=db.installments.concat([{id:87000,student_id:72000,amount:1,paid:true,status:'paid'},{id:87001,student_id:72001,amount:1,paid:false,status:'open'}]);
      var row=schoolScoreRow({id:9003,name:'تک‌بعد',capacity:0}, rscoreIndex());
      db.users=db.__bk2.users; db.__bk2=null; db.installments=db.installments.filter(x=>x.id<87000);
      return row;})()`);
    assert(r.dims.finance === 50, 'مالی: ' + r.dims.finance);
    assert(r.dims.satisfaction === 100, 'رضایت: ' + r.dims.satisfaction);
    assert(r.dims.internal === null && r.dims.growth === null && r.dims.management === null, 'ابعادِ دیگر باید ناکافی باشند');
    assert(r.score === 71.4, 'کل باید بازنرمال شود: ' + r.score);
  });

  test('R9 مرتب‌سازی نزولی؛ ناکافی‌ها آخر', () => {
    /* مدارس واقعی دمو + یک مدرسهٔ بی‌داده — امتیازها متفاوت‌اند */
    const rows = W(`regionScoreRows(db.schools.slice().concat([{id:9998,name:'بی‌داده',capacity:0}]))`);
    const scores = rows.map(r => r.score).filter(x => x != null);
    assert(new Set(scores).size >= 2, 'دست‌کم دو امتیاز متمایز لازم است تا آزمون معنا داشته باشد');
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1].score, b = rows[i].score;
      if (a == null) assert(b == null, 'ناکافی قبل از امتیازدار آمد');
      else if (b != null) assert(a >= b, 'ترتیب نزولی شکست: ' + a + ' سپس ' + b);
    }
    assert(rows[rows.length - 1].score == null, 'ناکافی آخر نیست');
  });

  /* بازگردانیِ دنیا باید در صف اجرا شود — نه هنگام ثبتِ آزمون‌ها */
  test('— بازگردانی دنیای دمو —', () => { restoreWorld(); });

  test('R10a نمای اداره فقط محدودهٔ خودش', () => {
    const EO = W(`db.users.find(u=>u.role==='edu_office'&&(byId('offices',u.office_id)||{}).county_id).id`);
    W(`S.user=byId('users',${EO});S.route='regionscore';S.filters={};render()`);
    const h = mainHtml();
    assert(h.indexOf('کارت امتیازی') > -1, 'نما رندر نشد');
    const scope = W(`officeScopeSchools(officeOf(byId('users',${EO})),{}).map(s=>s.name)`);
    const all = W(`db.schools.map(s=>s.name)`);
    scope.forEach(n => assert(h.indexOf(n) > -1, 'مدرسهٔ محدوده نیست: ' + n));
    all.filter(n => scope.indexOf(n) < 0).forEach(n => assert(h.indexOf(n) < 0, 'مدرسهٔ بیرون محدوده دیده شد: ' + n));
  });

  test('R10b سوپرادمین همهٔ مدارس را می‌بیند', () => {
    const SA = W(`db.users.find(u=>u.role==='superadmin').id`);
    W(`S.user=byId('users',${SA});S.route='regionscore';S.filters={};render()`);
    const h = mainHtml();
    const all = W(`db.schools.map(s=>s.name)`);
    all.forEach(n => assert(h.indexOf(n) > -1, 'مدرسه‌ای از دید سوپرادمین پنهان شد: ' + n));
  });

  test('R10c مدیر و دبیر به روت دسترسی ندارند', () => {
    const M = W(`db.users.find(u=>u.role==='manager').id`);
    W(`S.user=byId('users',${M});S.route='regionscore';S.filters={};render()`);
    assert(mainHtml().indexOf('دسترسی مجاز نیست') > -1, 'مدیر روت را دید');
    assert(!W(`canRoute('regionscore','teacher')`), 'دبیر مجاز شناخته شد');
  });

  test('R11 خروجی CSV: سرستون‌های ۵ بعد + ردیف‌ها = مدارس محدوده', () => {
    const SA = W(`db.users.find(u=>u.role==='superadmin').id`);
    W(`S.user=byId('users',${SA});S.filters={};0`);
    const d = W(`regionScoreCsvData()`);
    ['مالی', 'داخلی', 'رشد', 'رضایت', 'مدیریت'].forEach(x => assert(d.headers.indexOf(x) > -1, 'سرستون ' + x + ' نیست'));
    assert(d.headers.indexOf('امتیاز کل') > -1 && d.headers.indexOf('بازه') > -1, 'سرستون امتیاز/بازه نیست');
    assert(d.rows.length === W('db.schools.length'), 'تعداد ردیف ≠ مدارس: ' + d.rows.length);
    d.rows.forEach(r => assert(r.length === d.headers.length, 'طول ردیف ≠ سرستون‌ها'));
  });

  await __seq;
  const total = pass + fail;
  console.log('────────────────────────────────────────────────────');
  console.log(`کارت امتیازی منطقه: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
  process.exit(fail ? 1 : 0);
}
