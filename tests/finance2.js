#!/usr/bin/env node
/**
 * سئوت مالی/شهریه — دور ۶۴ بند ۱
 *
 * - موتورِ یادآور خودکار اقساط (پنجرهٔ ۷ روزه + مهلتِ ضداسپم)
 * - خلاصهٔ روزانهٔ مدیر (هر روز حداکثر یک)
 * - یادآوری دستی + تبِ بدهکاران
 * - رسیدِ تسویهٔ کامل
 *
 * اجرا: node tests/finance2.js
 */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — سئوت رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const vc = new VirtualConsole();
vc.on('jsdomError', () => {});
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const win = dom.window;
const W = (e) => win.eval(e);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const sec = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); }
  catch (e) { results.push({ name, ok: false, detail: String(e.message || e), ms: Date.now() - t0 }); }
};
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

/* ورود: شماره + کد + کد ملی (جریانِ بدونِ رمز) */
const loginByPhone = (un) => W(`(function(){
  var u=db.users.find(x=>x.username===${JSON.stringify(un)});
  if(!u) return 'no-user';
  document.getElementById('lpn').value=u.phone;
  document.getElementById('lnid').value=u.national_id;
  document.getElementById('lcode').value=SmsPanel.sendCode(u.phone);
  document.querySelector('[data-act="login"]').click();
  return S.user&&S.user.id===u.id?'ok':'fail';})()`);

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  await sleep(900);
  /* دادهٔ آزمون: مدرسهٔ ۱، یک دانش‌آموز + ولی + اقساط در وضعیت‌های مختلف */
  const ctx = await W(`(function(){
    var sid=db.schools[0].id;
    var st=insert('users',{school_id:sid,role:'student',full_name:'دانش‌آموز مالی',username:'fin_stu_'+Date.now(),active:1});
    var cl=insert('classes',{school_id:sid,name:'کلاس مالی',grade:'دهم'});
    insert('enrollments',{student_id:st.id,class_id:cl.id});
    var par=insert('users',{school_id:sid,role:'parent',full_name:'ولی مالی',username:'fin_par_'+Date.now(),active:1});
    insert('parent_links',{parent_id:par.id,student_id:st.id,relation:'پدر'});
    var plan=insert('tuition_plans',{school_id:sid,title:'طرح مالی آزمون',amount:100000000,installments:4,first_due:daysAgoISO(60),interval_days:45,active:1});
    var t=insert('tuitions',{school_id:sid,student_id:st.id,plan_id:plan.id,class_id:cl.id,total:100000000,discount:0,payable:100000000,paid:0,status:'open'});
    var i1=insert('installments',{tuition_id:t.id,school_id:sid,student_id:st.id,seq:1,due_date:daysAgoISO(2),amount:9900000000,paid_amount:0,status:'pending'});
    var i2=insert('installments',{tuition_id:t.id,school_id:sid,student_id:st.id,seq:2,due_date:daysAgoISO(2),amount:25000000,paid_amount:25000000,status:'paid'});
    var i3=insert('installments',{tuition_id:t.id,school_id:sid,student_id:st.id,seq:3,due_date:addDaysISO(todayISO(),5),amount:25000000,paid_amount:0,status:'pending'});
    var i4=insert('installments',{tuition_id:t.id,school_id:sid,student_id:st.id,seq:4,due_date:addDaysISO(todayISO(),20),amount:25000000,paid_amount:0,status:'pending'});
    return JSON.stringify({sid:sid,st:st.id,cl:cl.id,par:par.id,plan:plan.id,t:t.id,i1:i1.id,i2:i2.id,i3:i3.id,i4:i4.id});
  })()`);
  const c = JSON.parse(ctx);

  const mgr = W(`(function(){var u=db.users.find(x=>x.school_id===${c.sid}&&x.role==='manager');return u?u.id:0;})()`);

  await sec('F1 یادآور: قسطِ معوق برای دانش‌آموز + ولی اعلان می‌سازد و گارد را می‌زند', async () => {
    const r = W(`runTuitionReminders()`);
    const n1 = W(`db.notifications.filter(n=>n.user_id===${c.st}&&n.type==='tuition_due'&&n.title.indexOf('سررسید گذشته')>-1).length`);
    const n2 = W(`db.notifications.filter(n=>n.user_id===${c.par}&&n.type==='tuition_due'&&n.title.indexOf('سررسید گذشته')>-1).length`);
    assert(n1 >= 1, 'اعلانِ معوق به دانش‌آموز نرسید');
    assert(n2 >= 1, 'اعلانِ معوق به ولی نرسید');
    assert(W(`byId('installments',${c.i1}).reminded_at===todayISO()`) === true, 'reminded_at ثبت نشد');
    /* قسطِ دوردست (۲۰ روز) نباید یادآوری بگیرد */
    assert(W(`byId('installments',${c.i4}).reminded_at`) == null, 'قسطِ دوردست بی‌جهت یادآوری گرفت');
  });

  await sec('F2 یادآور: پنجرهٔ ۷ روزه — قسطِ ۵ روزِ پیشِ رو هم یادآور می‌گیرد', async () => {
    assert(W(`byId('installments',${c.i3}).reminded_at`) !== null, 'قسطِ در_آستانهٔ سررسید یادآور نگرفت');
  });

  await sec('F3 ضداسپم: اجرای دوبارهٔ همان روز، اعلانِ تازه نمی‌سازد', async () => {
    const before = W(`db.notifications.length`);
    W(`runTuitionReminders()`);
    const after = W(`db.notifications.length`);
    assert(after === before, 'اجرای تکراری اعلانِ تکراری ساخت (' + (after - before) + ' اعلان)');
  });

  await sec('F4 خلاصهٔ روزانهٔ مدیر: هر مدرسه هر روز حداکثر یک', async () => {
    const n = W(`db.notifications.filter(n=>n.user_id===${mgr}&&n.type==='tuition_due_summary'&&n.created_at===todayISO()).length`);
    assert(n === 1, 'خلاصهٔ مدیر: ' + n + ' (باید دقیقاً ۱ باشد)');
    W(`runTuitionReminders()`);
    const n2 = W(`db.notifications.filter(n=>n.user_id===${mgr}&&n.type==='tuition_due_summary'&&n.created_at===todayISO()).length`);
    assert(n2 === 1, 'خلاصهٔ مدیر تکرار شد');
  });

  /* ورود مدیر برای رابط */
  loginByPhone('manager1');

  await sec('F5 یادآوری دستی: اکشن روی بدهکار + مهلتِ ضداسپم در همان روز', async () => {
    /* قسطِ معوقِ تست قبلاً یادآوری شده ⇒ همان روز دوباره نمی‌شود */
    const before = W(`db.notifications.length`);
    W(`(function(){var el=document.createElement('button');el.setAttribute('data-act','remind-inst-stu');el.setAttribute('data-id','${c.st}');document.body.appendChild(el);el.dispatchEvent(new MouseEvent('click',{bubbles:true}));el.remove();})()`);
    const after = W(`db.notifications.length`);
    assert(after === before, 'یادآوری تکراریِ همان روز ساخت');
  });

  await sec('F6 تبِ بدهکاران: فهرستِ کامل با فیلترِ کلاس', async () => {
    W(`S.route='tuition';S.tab='debtors';S.filters={dclass:'',dq:''};render()`);
    const html1 = W(`document.querySelector('.main').innerHTML`);
    assert(html1.indexOf('بدهکاران') > -1, 'تبِ بدهکاران رندر نشد');
    assert(html1.indexOf('دانش‌آموز مالی') > -1, 'بدهکارِ آزمون در فهرست نیست');
    W(`S.filters={dclass:'${c.cl}',dq:''};render()`);
    const html2 = W(`document.querySelector('.main').innerHTML`);
    assert(html2.indexOf('دانش‌آموز مالی') > -1, 'فیلترِ کلاس درست کار نکرد');
  });

  await sec('F7 رسیدِ تسویهٔ کامل: برای صورتحسابِ تسویه‌شده دکمه می‌سازد', async () => {
    assert(typeof W(`printTuitionReceipt`) === 'function', 'printTuitionReceipt تعریف نشده');
    /* صورتحساب را تسویه کن */
    W(`(function(){var ins=db.installments.filter(i=>i.tuition_id===${c.t});
      ins.forEach(function(i){update('installments',i.id,{paid_amount:i.amount,status:'paid',method:'cash',ref_id:'RC-TEST',paid_at:todayISO()});});
      var s=ins.reduce(function(a,b){return a+b.paid_amount;},0);
      update('tuitions',${c.t},{paid:s,status:'settled'});})()`);
    W(`S.route='tuition';S.tab='students';S.filters={};S.page=1;render()`);
    const h = W(`document.querySelector('.main').innerHTML`);
    assert(h.indexOf('receipt-tuition') > -1, 'دکمهٔ رسیدِ تسویه در تبِ شهریه نیست');
  });

  await sec('F8 یادآور: واحد — پنجرهٔ زمان و مهلت، مستقیم روی منطق', () => {
    assert(W(`installmentNeedsReminder({status:'pending',due_date:daysAgoISO(2)})`)==='overdue','قسطِ دِروز باید معوق');
    assert(W(`installmentNeedsReminder({status:'pending',due_date:daysAgoISO(-5)})`)==='due','قسطِ ۵ روزِ پیشِ رو باید «رسیده»');
    assert(W(`installmentNeedsReminder({status:'pending',due_date:daysAgoISO(-40)})`)===null,'قسطِ دور (۴۰ روز) نباید یادآور بگیرد');
    assert(W(`installmentNeedsReminder({status:'paid',due_date:daysAgoISO(2)})`)===null,'قسطِ پرداخت‌شده نباید یادآور بگیرد');
    assert(W(`installmentNeedsReminder({status:'pending',due_date:daysAgoISO(2),reminded_at:todayISO()})`)===null,'یادآورِ امروزِ دیگری نباید تکرار شود');
    assert(W(`installmentNeedsReminder({status:'pending',due_date:daysAgoISO(2),reminded_at:daysAgoISO(10)})!==null`)===true,'پس از ۱۰ روز می‌توان دوباره یاداور کرد');
  });

  /* پاک‌سازی */
  W(`(function(){
    remove('installments',${c.i1});remove('installments',${c.i2});remove('installments',${c.i3});remove('installments',${c.i4});
    remove('tuitions',${c.t});
    db.notifications=db.notifications.filter(n=>!(n.user_id===${c.st}||n.user_id===${c.par}));
    remove('parent_links',db.parent_links.find(l=>l.student_id===${c.st}).id);
    remove('users',${c.st});remove('users',${c.par});
    remove('classes',${c.cl});remove('tuition_plans',${c.plan});
    S.user=null;render();
  })()`);

  const ok = results.filter((r) => r.ok).length;
  console.log('─'.repeat(60));
  for (const r of results) {
    console.log((r.ok ? '  ✅ ' : '  ❌ ') + r.name + (r.detail ? '\n     ' + r.detail : ''));
  }
  console.log('─'.repeat(60));
  console.log(`سئوت مالی (دور ۶۴): ${ok}/${results.length} — ${ok === results.length ? 'سبز ✅' : 'قرمز 🔴'}`);
  process.exit(ok === results.length ? 0 : 1);
}
