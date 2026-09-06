#!/usr/bin/env node
/**
 * تستِ واقعیِ مسیرِ دوازدهم↔مشاور (بند ۵.۲ — دور ۷۱)
 *
 *  K0 — بوت بدون خطا
 *  K1 — isTwelfthGrader: دوازدهم بله، دهم نه
 *  K2 — دانش‌آموزِ دوازدهم پیام می‌فرستد؛ رشته ساخته می‌شود
 *  K3 — گاردها: نهمی رد، متنِ کوتاه/بلند رد، دانش‌آموزِ دیگر رد،
 *       ولیِ بیگانه رد، نقشِ غیرمجاز رد
 *  K4 — پاسخِ مشاور (مدرسهٔ خودش) می‌شود؛ مشاورِ مدرسهٔ دیگر رد
 *  K5 — تبِ «مشاور» در پروندهٔ دوازدهم هست و پیام دیده می‌شود؛
 *       پروندهٔ دهمی تب ندارد
 *  K6 — صندوقِ مشاور: رشته با شمارنده + باز کردن + پاسخ
 *  K7 — canAction: دبیر نمی‌تواند بفرستد/پاسخ دهد
 *  K8 — پاک‌سازی
 *
 * اجرا:  node tests/cmsg2.js   (بعد از node build.js)
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let seq = Promise.resolve();
const results = [];
function test(name, fn) {
  const next = seq.then(async () => {
    await fn();
    results.push([name, true]);
    console.log('  ✅ ' + name);
  }).catch(e => {
    results.push([name, false]);
    console.log('  ❌ ' + name + ' — ' + e.message);
  });
  seq = next;
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: new VirtualConsole().on('jsdomError', e => {
    if (String(e.message).includes('Could not parse CSS')) return;
    console.log('   ⚠ jsdom:', e.message);
  })
});
const win = dom.window;
const W = expr => win.eval(expr);
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

setTimeout(async () => {
  const root = () => win.document.getElementById('root');
  const doc = () => win.document;

  /* سناریوی کنترل‌شده: دانش‌آموزِ دوازدهم + نهم + والد + مشاوران */
  const ctx = W(`(function(){
    var cls12 = db.classes.find(c=>Number(gradeFromName(c.name))===12);
    var e = db.enrollments.find(x=>x.class_id===cls12.id);
    var s12 = byId('users', e.student_id);
    var cls9 = db.classes.find(c=>Number(gradeFromName(c.name))===9);
    var s9 = null;
    if(cls9){ var e9=db.enrollments.find(x=>x.class_id===cls9.id); if(e9)s9=byId('users',e9.student_id); }
    var cous1 = db.users.find(u=>u.role==='counselor'&&u.school_id===s12.school_id);
    var cous2 = db.users.find(u=>u.role==='counselor'&&u.school_id!==s12.school_id);
    var par = db.parent_links.find(p=>p.student_id===s12.id);
    var parU = par ? byId('users',par.parent_id) : null;
    return {s12:s12.id, s12school:s12.school_id, s9:s9?s9.id:null,
      cous1:cous1?cous1.id:null, cous2:cous2?cous2.id:null,
      parU:parU?parU.id:null};
  })()`);
  assert(ctx && ctx.s12, 'سناریو ساخته نشد');

  test('K0 بوت بدون خطا', async () => {
    await sleep(400);
    assert(root().innerHTML.length > 1000, 'ریشه خالی است');
  });

  test('K1 isTwelfthGrader', () => {
    assert(W(`isTwelfthGrader(${ctx.s12})`) === true, 'دوازدهم شناسایی نشد');
    if(ctx.s9) assert(W(`isTwelfthGrader(${ctx.s9})`) === false, 'نهمی دوازدهم شناخته شد!');
    assert(W(`isTwelfthGrader(999999)`) === false, 'شناسهٔ ناموجود');
  });

  test('K2 دانش‌آموزِ دوازدهم پیام می‌فرستد', () => {
    const r = W(`(function(){
      var st=byId('users',${ctx.s12});
      return counselorMsgSend(${ctx.s12},st,'سلام، دربارهٔ کنکور سؤال دارم');
    })()`);
    assert(r.ok === true, 'ارسال شکست: ' + r.msg);
    const th = W(`counselorThread(${ctx.s12}).map(m=>m.author_role+':'+m.body)`);
    assert(th.some(x => x.indexOf('کنکور') > -1), 'پیام در رشته نیست');
  });

  test('K3 گاردهای ساختاری', () => {
    /* نهمی */
    if(ctx.s9){
      const r9 = W(`counselorMsgSend(${ctx.s9},byId('users',${ctx.s9}),'سلام')`);
      assert(r9.ok === false && r9.msg.indexOf('دوازدهم') > -1, 'نهمی رد نشد');
    }
    /* کوتاه */
    const rShort = W(`counselorMsgSend(${ctx.s12},byId('users',${ctx.s12}),'دو')`);
    assert(rShort.ok === false, 'متنِ کوتاه رد نشد');
    /* بلند */
    const longBody = 'ب'.repeat(501);
    const rLong = W(`counselorMsgSend(${ctx.s12},byId('users',${ctx.s12}),${JSON.stringify(longBody)})`);
    assert(rLong.ok === false, 'متنِ بلند رد نشد');
    /* دانش‌آموزِ دیگر برای s12 بنویسد */
    const other = W(`(function(){
      var s=db.users.find(u=>u.role==='student'&&u.id!==${ctx.s12}&&u.school_id===${ctx.s12school});
      return s?s.id:0;
    })()`);
    if(other){
      const rO = W(`counselorMsgSend(${ctx.s12},byId('users',${other}),'پیامِ جعلی')`);
      assert(rO.ok === false, 'دانش‌آموزِ دیگر نوشت!');
    }
    /* ولیِ بیگانه */
    const stranger = W(`db.users.find(u=>u.role==='parent'&&!(db.parent_links.some(p=>p.parent_id===u.id&&p.student_id===${ctx.s12}))).id`);
    if(stranger){
      const rP = W(`counselorMsgSend(${ctx.s12},byId('users',${stranger}),'پیامِ بیگانه')`);
      assert(rP.ok === false, 'ولیِ بیگانه نوشت!');
    }
    /* نقشِ دبیر */
    const t = W(`db.users.find(u=>u.role==='teacher'&&u.school_id===${ctx.s12school}).id`);
    const rT = W(`counselorMsgSend(${ctx.s12},byId('users',${t}),'پیامِ دبیر')`);
    assert(rT.ok === false, 'دبیر نوشت!');
  });

  test('K4 پاسخِ مشاور + مرزِ بین‌مدرسه', () => {
    const r1 = W(`counselorMsgSend(${ctx.s12},byId('users',${ctx.cous1}),'در دفترم بیا — مشاورهٔ کنکور')`);
    assert(r1.ok === true, 'پاسخِ مشاور شکست: ' + r1.msg);
    if(ctx.cous2){
      const r2 = W(`counselorMsgSend(${ctx.s12},byId('users',${ctx.cous2}),'پاسخِ بیگانه')`);
      assert(r2.ok === false, 'مشاورِ مدرسهٔ دیگر نوشت!');
    }
    /* ولیِ واقعی می‌تواند بنویسد */
    if(ctx.parU){
      const r3 = W(`counselorMsgSend(${ctx.s12},byId('users',${ctx.parU}),'مرسی از پیگیری شما')`);
      assert(r3.ok === true, 'ولیِ واقعی نوشت: ' + r3.msg);
    }
  });

  test('K5 تبِ «مشاور» در پروندهٔ دوازدهم', () => {
    const m1 = W(`db.users.find(u=>u.role==='manager'&&u.school_id===${ctx.s12school}).id`);
    W(`(function(){
      S.user=byId('users',${m1});S.persona=null;S.boss=null;
      S.child=${ctx.s12};S.filters={};S.route='record';S.tab='counsel';render();
    })()`);
    const r = root().innerHTML;
    assert(r.indexOf('مسیرِ ساختاریافتهٔ گفت‌وگو با مشاور') > -1, 'کارتِ مسیر نیست');
    assert(r.indexOf('کنکور') > -1, 'پیامِ نمونه دیده نمی‌شود');
    /* دهمی: تب ندارد */
    const s10 = W(`(function(){
      var c=db.classes.find(c=>Number(gradeFromName(c.name))===10);
      var e=db.enrollments.find(x=>x.class_id===c.id);
      return byId('users',e.student_id).id;
    })()`);
    W(`(function(){
      S.user=byId('users',${m1});S.persona=null;S.boss=null;
      S.child=${s10};S.filters={};S.route='record';S.tab='counsel';render();
    })()`);
    const r10 = root().innerHTML;
    assert(r10.indexOf('مسیرِ ساختاریافتهٔ گفت‌وگو با مشاور') === -1, 'دهمی مسیر دوازدهم را دید!');
  });

  test('K6 صندوقِ مشاور: فهرست + باز کردن + پاسخ', async () => {
    const cous = ctx.cous1;
    W(`(function(){
      S.user=byId('users',${cous});S.persona=null;S.boss=null;
      S.filters={};S.route='cqueue';render();
    })()`);
    let r = root().innerHTML;
    assert(r.indexOf('مسیرِ دوازدهم‌ها') > -1, 'بخشِ دوازدهم‌ها نیست');
    const stName = W(`byId('users',${ctx.s12}).full_name`);
    assert(r.indexOf(stName) > -1, 'دانش‌آموز در صندوق نیست');
    /* باز کردنِ رشته */
    W(`(function(){S.filters.cmsg_stu=${ctx.s12};render();})()`);
    r = root().innerHTML;
    assert(r.indexOf('کنکور') > -1, 'رشته باز نشد');
    assert(doc().querySelector('[data-act="counselor-msg-reply"][data-sid="' + ctx.s12 + '"]'), 'دکمهٔ پاسخ نیست');
    /* پاسخ از UI */
    doc().querySelector('#cmsg_body').value = 'بفرمایید پنجشنبه ساعت ۱۱';
    doc().querySelector('[data-act="counselor-msg-reply"]').click();
    await sleep(150);
    const th = W(`counselorThread(${ctx.s12}).map(m=>m.author_role)`);
    assert(th[th.length-1] === 'counselor', 'پاسخِ UI ثبت نشد');
  });

  test('K7 canAction', () => {
    const t = W(`db.users.find(u=>u.role==='teacher'&&u.school_id===${ctx.s12school}).id`);
    assert(W(`canAction('counselor-msg-send','teacher')`) === false, 'دبیر: send');
    assert(W(`canAction('counselor-msg-reply','teacher')`) === false, 'دبیر: reply');
    assert(W(`canAction('counselor-msg-send','student')`) === true, 'دانش‌آموز: send');
    assert(W(`canAction('counselor-msg-send','parent')`) === true, 'ولی: send');
    assert(W(`canAction('counselor-msg-reply','counselor')`) === true, 'مشاور: reply');
    void t;
  });

  test('K8 پاک‌سازی', () => {
    W(`(function(){
      db.counselor_msgs.slice().filter(function(m){return m.student_id===${ctx.s12};})
        .forEach(function(m){remove('counselor_msgs',m.id);});
    })()`);
    assert(W(`counselorThread(${ctx.s12}).length`) === 0, 'رشته پاک نشد');
  });

  await seq;
  await sleep(100);
  const bad = results.filter(r => !r[1]).length;
  console.log(`\ncmsg2 (مسیرِ دوازدهم↔مشاور): ${results.length} بررسی — ✅ ${results.length - bad} · ❌ ${bad}`);
  process.exit(bad ? 1 : 0);
}, 300);
