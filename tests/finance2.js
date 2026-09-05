#!/usr/bin/env node

/**
 * تست‌های تکمیل مالی (دور ۶۴):
 *  - صدور صورتحساب از طرح (issueTuition) + برنامهٔ اقساط
 *  - یادآوری خودکارِ اقساط (tuitionReminders) —멪
 *  - بخشیدنِ قسط (waiveInstallment)
 *  - تبِ بدهکاران
 *  - موتورِ ادغام‌شدهٔ یادآور (پنجرهٔ ۷ روزه + ضداسپم + خلاصهٔ مدیر + رسیدِ تسویه)
 *  - دادهٔ نمونه
 *
 * اجرا:  node tests/finance2.js   (نیازمند jsdom)
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
const testQueue = [];
let __seq = Promise.resolve();
function test(name, fn) {
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
    ).then(resolve);
  }));
  __seq = p;
  testQueue.push(p);
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

console.log('\n▸ تکمیل‌های مالی (دور ۶۴)');

test('بوت بدون خطا', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  assert(W('db.schools.length') > 0);
});

/* ── یک دانش‌آموزِ فعال + طرحِ فعالِ هم‌مدرسه ── */
test('issueTuition — صدور + برنامهٔ اقساط طبق طرح', () => {
  const ctx = W(`(function(){
    var st=db.users.find(u=>u.role==="student"&&u.active);
    var pl=db.tuition_plans.filter(p=>p.active&&p.school_id===st.school_id)[0];
    if(!st||!pl)return null;
    return {sid:st.id, pl:pl, school:st.school_id};
  })()`);
  assert(ctx, 'دانش‌آموز یا طرحِ فعال پیدا نشد');
  // تصفیهٔ صورتحساب‌های بازِ قبلیِ همین دانش‌آموز
  W(`db.tuitions.filter(t=>t.student_id===${ctx.sid}).forEach(t=>db.tuitions.splice(db.tuitions.indexOf(t),1));1`);
  W(`db.installments.filter(i=>db.tuitions.some(t=>t.student_id===${ctx.sid})).length;1`);

  const r = W(`issueTuition(${ctx.sid},${ctx.pl.id},1000)`);
  assert(r.ok, 'صدور شکست خورد: ' + r.msg);
  const t = W(`db.tuitions.find(x=>x.id===${r.tuition})`);
  assert(t.payable === ctx.pl.amount - 1000, 'payable = amount - discount');
  assert(t.status === 'open');
  const insts = W(`db.installments.filter(i=>i.tuition_id===${r.tuition})`);
  assert(insts.length === ctx.pl.installments, 'تعداد قسط');
  const sum = insts.reduce((a, b) => a + b.amount, 0);
  assert(sum === t.payable, 'جمع اقساط ≠ قابل پرداخت (sum=' + sum + ' payable=' + t.payable + ')');
  assert(insts[0].due_date === ctx.pl.first_due, 'سررسیدِ قسطِ اول = first_due');
  if (insts.length >= 2) {
    const due2 = W(`addDaysISO("${ctx.pl.first_due}",${ctx.pl.interval_days})`);
    assert(insts[1].due_date === due2, 'فاصلهٔ اقساط = interval_days');
  }
  assert(insts.every(i => i.status === 'pending'));
  global.__ctx = ctx;
});

test('issueTuition — دانش‌آموزی که صورتحسابِ باز دارد رد می‌شود', () => {
  const ctx = global.__ctx;
  const r = W(`issueTuition(${ctx.sid},${ctx.pl.id},0)`);
  assert(!r.ok, 'باید رد شود');
  assert(String(r.msg).includes('باز'), 'پیام باید دلیل «صورتحسابِ باز» را بگوید');
});

test('issueTuition — طرحِ غیرفعال رد می‌شود', () => {
  const ctx = global.__ctx;
  const r = W(`(function(){
    var p=db.tuition_plans.find(x=>x.id===${ctx.pl.id});
    var was=p.active; p.active=false;
    var st=db.users.find(u=>u.role==="student"&&u.active&&u.school_id===${ctx.pl.school_id}&&!db.tuitions.some(t=>t.student_id===u.id&&t.status!=="settled"));
    if(!st)return {ok:false,msg:'no-student'};
    var r2=issueTuition(st.id,${ctx.pl.id},0);
    p.active=was; return r2;
  })()`);
  assert(r && r.msg !== 'no-student', 'دانش‌آموزِ بدونِ بدهی پیدا نشد');
  assert(!r.ok, 'طرحِ غیرفعال باید رد شود');
});

test('tuitionReminders —멪: اجرا دوباره تکرار نمی‌کند', () => {
  // یک قسطِ سررسیدِ گذشته بسازیم
  const mk = W(`(function(){
    var st=db.users.find(u=>u.role==="student"&&u.active);
    var t=insert("tuitions",{school_id:st.school_id,student_id:st.id,plan_id:null,class_id:null,total:10000,discount:0,payable:10000,paid:0,status:"open"});
    var i=insert("installments",{tuition_id:t.id,school_id:st.school_id,student_id:st.id,seq:1,due_date:"2020-01-01",amount:10000,paid_amount:0,status:"pending",method:null,ref_id:null,paid_at:null});
    return {t:t.id,i:i.id};
  })()`);
  const ref = 'tr_' + mk.i;
  const r1 = W('tuitionReminders()');
  const n1 = W(`db.notifications.filter(n=>n.ref==="${ref}").length`);
  assert(n1 >= 1, 'یادآوری برای قسطِ تازه ساخته نشد');
  assert(r1.made >= 1);
  const r2 = W('tuitionReminders()');
  const n2 = W(`db.notifications.filter(n=>n.ref==="${ref}").length`);
  assert(n2 === n1, 'اجرای دوباره اعلان تکراری ساخت (n1=' + n1 + ' n2=' + n2 + ')');
  assert(r2.skipped >= 1, 'اجرای دوم باید skipped گزارش دهد');
});

test('waiveInstallment — بدهی کم می‌شود + وضعیت recalc + گاردِ دوباره', () => {
  const mk = W(`(function(){
    var st=db.users.find(u=>u.role==="student"&&u.active);
    var t=insert("tuitions",{school_id:st.school_id,student_id:st.id,plan_id:null,class_id:null,total:5000,discount:0,payable:5000,paid:2000,status:"partial"});
    var i=insert("installments",{tuition_id:t.id,school_id:st.school_id,student_id:st.id,seq:1,due_date:"2020-01-01",amount:5000,paid_amount:2000,status:"partial",method:null,ref_id:null,paid_at:null});
    return {t:t.id,i:i.id};
  })()`);
  const w = W(`waiveInstallment(${mk.i})`);
  assert(w.ok, 'بخشیدن شکست خورد: ' + w.msg);
  const i = W(`db.installments.find(x=>x.id===${mk.i})`);
  assert(i.status === 'canceled', 'وضعیتِ قسط باید canceled شود');
  const t = W(`db.tuitions.find(x=>x.id===${mk.t})`);
  assert(t.payable === 2000, 'payable باید ۳۰۰۰ شود (payable=' + t.payable + ')');
  assert(t.status === 'settled', 'paid>=payable → settled');
  const w2 = W(`waiveInstallment(${mk.i})`);
  assert(!w2.ok, 'بخشیدنِ دوباره باید رد شود');
});

test('تبِ بدهکاران — لیست + مجموع + فیلترِ کلاس', () => {
  W('S.user=db.users.find(u=>u.role==="manager");S.persona=null;S.boss=null;S.filters={};S.tab="debtors";S.route="tuition";render()');
  const h = W('document.body.innerHTML');
  assert(h.includes('گزارش بدهکاران'), 'تیترِ تب نیست');
  assert(h.includes('data-f="debtclass"'), 'فیلترِ کلاس نیست');
  assert(h.includes('data-act="remind-due"'), 'دکمهٔ ارسال یادآوری نیست');
  assert(h.includes('data-act="tuition-new"'), 'دکمهٔ صدور صورتحساب نیست');
});

test('تبِ بدهکاران — فیلترِ کلاس کار می‌کند', () => {
  const cid = W(`(function(){var m=db.users.find(u=>u.role==="manager");var t=db.tuitions.filter(x=>x.school_id===m.school_id&&x.payable>x.paid&&x.class_id);return t.length?t[0].class_id:null;})()`);
  assert(cid !== null, 'بدهکارِ دارای کلاس پیدا نشد');
  W('S.filters={debtclass:"' + cid + '"};S.tab="debtors";render()');
  const h = W('document.body.innerHTML');
  assert(h.includes('value="' + cid + '" selected'), 'فیلتر اعمال نشده');
  W('S.filters={};render()');
});

/* ═══════════ بخشِ دوم: موتورِ ادغام‌شدهٔ یادآور (پنجره/مهلت/خلاصه/رسید) ═══════════ */
test('adF1 — قسطِ معوق: اعلان برای دانش‌آموز + ولی + ثبتِ reminded_at', () => {
  const ctx = W(`(function(){
    var sid=db.schools[0].id;
    var st=insert('users',{school_id:sid,role:'student',full_name:'دانش‌آموز مالی',username:'fin_stu_'+Date.now(),active:1});
    var cl=insert('classes',{school_id:sid,name:'کلاس مالی',grade:'دهم'});
    insert('enrollments',{student_id:st.id,class_id:cl.id});
    var par=insert('users',{school_id:sid,role:'parent',full_name:'ولی مالی',username:'fin_par_'+Date.now(),active:1});
    insert('parent_links',{parent_id:par.id,student_id:st.id,relation:'پدر'});
    var plan=insert('tuition_plans',{school_id:sid,title:'طرح مالی آزمون',amount:100000000,installments:4,first_due:daysAgoISO(60),interval_days:45,active:1});
    var t=insert('tuitions',{school_id:sid,student_id:st.id,plan_id:plan.id,class_id:cl.id,total:100000000,discount:0,payable:100000000,paid:0,status:'open'});
    var i1=insert('installments',{tuition_id:t.id,school_id:sid,student_id:st.id,seq:1,due_date:daysAgoISO(2),amount:25000000,paid_amount:0,status:'pending'});
    var i2=insert('installments',{tuition_id:t.id,school_id:sid,student_id:st.id,seq:2,due_date:daysAgoISO(-5),amount:25000000,paid_amount:0,status:'pending'});
    var i3=insert('installments',{tuition_id:t.id,school_id:sid,student_id:st.id,seq:3,due_date:daysAgoISO(-40),amount:25000000,paid_amount:0,status:'pending'});
    return {sid:sid,st:st.id,cl:cl.id,par:par.id,plan:plan.id,t:t.id,i1:i1.id,i2:i2.id,i3:i3.id};
  })()`);
  global.__finctx = ctx;
  const r = W('tuitionReminders()');
  assert(r.made >= 1, 'هیچ یادآوری ساخته نشد');
  const n1 = W(`db.notifications.filter(n=>n.ref==='tr_'+${ctx.i1}).length`);
  assert(n1 >= 2, 'اعلان هم برای دانش‌آموز و هم برای ولی لازم است (n1=' + n1 + ')');
  assert(W(`byId('installments',${ctx.i1}).reminded_at`) === W('todayISO()'), 'reminded_at ثبت نشد');
  const n3 = W(`db.notifications.filter(n=>n.ref==='tr_'+${ctx.i3}).length`);
  assert(n3 === 0, 'قسطِ ۴۰ روزِ پیشِ رو نباید یادآور بگیرد');
});

test('adF2 — پنجرهٔ ۷ روزه: قسطِ ۵ روزِ پیشِ رو یادآور می‌گیرد', () => {
  const ctx = global.__finctx;
  W('tuitionReminders()');
  const n2 = W(`db.notifications.filter(n=>n.ref==='tr_'+${ctx.i2}).length`);
  assert(n2 >= 1, 'قسطِ ۵ روزِ پیشِ رو یادآور نگرفت');
});

test('adF3 — ضداسپم: اجرای دوبارهٔ همان روز، اعلانِ تازه نمی‌سازد', () => {
  const ctx = global.__finctx;
  const before = W('db.notifications.length');
  const r = W('tuitionReminders()');
  const after = W('db.notifications.length');
  assert(after === before, 'اجرای دوباره اعلان ساخت (before=' + before + ' after=' + after + ')');
  assert(r.skipped >= 1, 'اجرای دوم باید skipped گزارش دهد');
});

test('adF4 — خلاصهٔ روزانه مدیر: هر مدرسه هر روز حداکثر یک', () => {
  const mgr = W(`db.users.find(u=>u.school_id===${global.__finctx.sid}&&u.role==='manager').id`);
  W('tuitionReminders()');
  const n1 = W(`db.notifications.filter(n=>n.type==='tuition_due_summary'&&n.user_id===${mgr}).length`);
  assert(n1 === 1, 'باید دقیقاً یک خلاصهٔ روزانه باشد (n1=' + n1 + ')');
  W('tuitionReminders()');
  const n2 = W(`db.notifications.filter(n=>n.type==='tuition_due_summary'&&n.user_id===${mgr}).length`);
  assert(n2 === 1, 'خلاصه تکرار شد (n2=' + n2 + ')');
});

test('adF5 — دکمهٔ «ارسال یادآوری»: دستی هم کار می‌کند و تکرار نمی‌شود', () => {
  const ctx = global.__finctx;
  const mk = W(`(function(){
    var t=byId('tuitions',${ctx.t});
    var i4=insert('installments',{tuition_id:t.id,school_id:${ctx.sid},student_id:${ctx.st},seq:4,due_date:daysAgoISO(1),amount:25000000,paid_amount:0,status:'pending'});
    return i4.id;})()`);
  W(`S.user=db.users.find(u=>u.school_id===${ctx.sid}&&u.role==='manager');S.persona=null;S.boss=null;S.route='tuition';S.tab='dash';S.filters={};S.page=1;render()`);
  const h0 = W(`document.querySelector('.main').innerHTML`);
  assert(h0.indexOf('remind-due') > -1, 'دکمهٔ ارسال یادآوری نیست');
  W(`document.querySelector('[data-act="remind-due"]').click()`);
  const n1 = W(`db.notifications.filter(n=>n.ref==='tr_'+${mk}).length`);
  assert(n1 >= 2, 'یادآوریِ دستی ساخته نشد');
  W(`document.querySelector('[data-act="remind-due"]').click()`);
  const n2 = W(`db.notifications.filter(n=>n.ref==='tr_'+${mk}).length`);
  assert(n2 === n1, 'دکمهٔ دوباره اعلان تکراری ساخت');
});

test('adF6 — تبِ بدهکاران: بدهکارِ آزمون در فهرست + فیلترِ کلاس', () => {
  const ctx = global.__finctx;
  W(`S.user=db.users.find(u=>u.school_id===${ctx.sid}&&u.role==='manager');S.persona=null;S.boss=null;S.route='tuition';S.tab='debtors';S.filters={};S.page=1;render()`);
  let h = W(`document.querySelector('.main').innerHTML`);
  assert(h.indexOf('دانش‌آموز مالی') > -1, 'بدهکارِ آزمون در فهرست نیست');
  assert(h.indexOf('data-f="debtclass"') > -1, 'فیلترِ کلاس نیست');
  W(`S.filters={debtclass:'${ctx.cl}'};render()`);
  const rows = W(`document.querySelectorAll('.main table tbody tr').length`);
  h = W(`document.querySelector('.main').innerHTML`);
  assert(h.indexOf('دانش‌آموز مالی') > -1, 'بعد از فیلتر، بدهکارِ کلاسِ انتخابی نیست');
  assert(rows === 1, 'فیلترِ کلاس باید فقط بدهکارِ همان کلاس را نشان دهد (rows=' + rows + ')');
  W(`S.filters={};render()`);
});

test('adF7 — رسیدِ تسویهٔ کامل: برای صورتحسابِ تسویه‌شده دکمه می‌سازد', () => {
  const ctx = global.__finctx;
  W(`db.installments.filter(i=>i.tuition_id===${ctx.t}).forEach(i=>i.status='paid');
     update('tuitions',${ctx.t},{paid:100000000,status:'settled'});
     S.route='tuition';S.tab='students';S.filters={};S.page=1;render()`);
  const h = W(`document.querySelector('.main').innerHTML`);
  assert(h.indexOf('receipt-tuition') > -1, 'دکمهٔ رسیدِ تسویه در تبِ شهریه نیست');
});

test('adF8 — واحد: پنجرهٔ زمان و مهلت، مستقیم روی منطق', () => {
  assert(W(`installmentNeedsReminder({status:'pending',due_date:daysAgoISO(2)})`) === 'overdue', 'قسطِ دِروز باید معوق');
  assert(W(`installmentNeedsReminder({status:'pending',due_date:daysAgoISO(-5)})`) === 'due', 'قسطِ ۵ روزِ پیشِ رو باید «رسیده»');
  assert(W(`installmentNeedsReminder({status:'pending',due_date:daysAgoISO(-40)})`) === null, 'قسطِ دور (۴۰ روز) نباید یادآور بگیرد');
  assert(W(`installmentNeedsReminder({status:'paid',due_date:daysAgoISO(2)})`) === null, 'قسطِ پرداخت‌شده نباید یادآور بگیرد');
  assert(W(`installmentNeedsReminder({status:'pending',due_date:daysAgoISO(2),reminded_at:todayISO()})`) === null, 'یادآورِ امروزِ دیگری نباید تکرار شود');
  assert(W(`installmentNeedsReminder({status:'pending',due_date:daysAgoISO(2),reminded_at:daysAgoISO(10)})!==null`) === true, 'پس از ۱۰ روز می‌توان دوباره یاداور کرد');
});

test('دادهٔ نمونه — حداقل یک قسطِ بخشیده‌شده (canceled) وجود دارد', () => {
  const n = W('db.installments.filter(i=>i.status==="canceled").length');
  assert(n >= 1, 'در دادهٔ نمونه قسطِ canceled نیست');
});

test('دادهٔ نمونه — اعلان‌های یادآوریِ شهری (ref tr_) ساخته شده‌اند', () => {
  const n = W('db.notifications.filter(n=>n.ref&&n.ref.indexOf("tr_")===0).length');
  assert(n >= 1, 'در بوت یادآوری ساخته نشده');
});

await Promise.all(testQueue);
const total = pass + fail;
console.log('\n' + '─'.repeat(52));
console.log(`تست مالی: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
if (consoleErrors.length) {
  console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
  consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
}
console.log('─'.repeat(52) + '\n');
dom.window.close();
process.exit(fail ? 1 : 0);
}
