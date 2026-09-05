#!/usr/bin/env node

/**
 * تست‌های تکمیل مالی (دور ۶۴):
 *  - صدور صورتحساب از طرح (issueTuition) + برنامهٔ اقساط
 *  - یادآوری خودکارِ اقساط (tuitionReminders) —멪
 *  - بخشیدنِ قسط (waiveInstallment)
 *  - تبِ بدهکاران
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
