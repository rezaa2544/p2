#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   دور ۷۵ — دو قابلیتِ پنلِ دبیر:
   ۱) «خروج از کلاس» با تایمر: برچسبِ روشن، تایمرِ زنده، توقف و
      ثبتِ دقیقهٔ سپری‌شده؛ ماندگاریِ تایمر با «دور ریختن» و «ثبت»
   ۲) تبدیلِ خودکارِ غیبت به تأخیر: از taken_at (زمانِ حاضر و
      غیاب‌زدن) تا لحظهٔ تبدیل؛ مبنایِ بدونِ taken_at = شروعِ روز
      از برنامهٔ زنگ؛ تأخیرِ بدونِ غیبتِ ازپیش = مودالِ ساعت
   ۳) نمایش: دقیقه در جدولِ دبیر، توضیحِ خودکار در پروندهٔ
      دانش‌آموز، ماندگاریِ taken_at با به‌روزرسانیِ رکورد

   اجرا:  node tests/att3.js   (نیازمند jsdom)
   ═══════════════════════════════════════════════════════════════ */
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
  await sleep(500);

  console.log('\n▸ دور ۷۵ — تایمرِ خروج از کلاس + تبدیلِ خودکارِ تاخیر');

  /* ── زمینهٔ مشترک ─────────────────────────────────────────── */
  const ctx = W(`(function(){
    var sch = db.schools.filter(function(s){return s.active;})[0];
    var sid = sch.id;
    var teacher = db.users.find(function(u){
      return u.role==='teacher' && u.school_id===sid && (u.status||'active')==='active';});
    var cls = db.classes.filter(function(c){return c.school_id===sid;})[0];
    var students = db.enrollments.filter(function(e){return e.class_id===cls.id;})
      .map(function(e){return byId('users',e.student_id);});
    return {sid:sid, teacher:teacher.id, cls:cls.id,
            students:students.map(s=>s.id)};
  })()`);
  assert(ctx.sid, 'مدرسهٔ فعال پیدا نشد');
  assert(ctx.teacher, 'دبیر پیدا نشد');
  assert(ctx.students.length >= 5, 'دانش‌آموزِ کافی نیست');

  const teacherOn = (extra) => W(`(function(){
    S.user=byId('users',${ctx.teacher});S.persona=null;S.boss=null;
    S.filters={class:${ctx.cls},date:todayISO()};S.route='attendance';render();
    ${extra||''}
  })()`);

  /* دانش‌آموزِ iام بدونِ رکوردِ امروز (تازه‌سازیِ امن)
     ⚠️ حتماً remove() از لایهٔ داده — spliceٔ مستقیم، ایندکسِ
        idxAttByClassDate را قدیمی می‌کند و attDraftDiff تغییر را
        نمی‌بیند (دامِ ثبت‌شده در att2.js). */
  const freshStudent = (i) => Number(W(`(function(){
    var cands=[${ctx.students.slice(0, 6).join(',')},0,0,0,0,0];
    var s=cands[${i}]||cands[0];
    (db.attendance||[]).forEach(function(a){
      if(a.student_id===s&&a.date===todayISO())remove('attendance',a.id);});
    return s;
  })()`));

  /* ── ۱) برچسبِ «خروج از کلاس» ───────────────────────────── */
  test('T1 برچسب: ATT_FA و دکمهٔ جدول «خروج از کلاس» است', () => {
    const r = W(`({fa:ATT_FA.early_exit, n:document.querySelectorAll('[data-act="att-set"][data-s="early_exit"]').length})`);
    teacherOn();
    const r2 = W(`({fa:ATT_FA.early_exit,
      first:document.querySelector('[data-act="att-set"][data-s="early_exit"]').textContent})`);
    assert(r2.fa === 'خروج از کلاس', 'برچسبِ ATT_FA درست نیست: ' + r2.fa);
    assert(r2.first.indexOf('خروج از کلاس') > -1, 'دکمهٔ جدول برچسبِ روشن ندارد: ' + r2.first);
  });

  /* ── ۲) تایمر: شروع + توقف + دقیقهٔ سپری‌شده ─────────────── */
  test('T2 تایمر: ضربهٔ نخست شروع (بدون مودال) + ضربهٔ دوم توقف و ثبتِ ۶۵ دقیقه', () => {
    const st = freshStudent(0);
    const sel = () => W(`(function(){
      var b=document.querySelector('[data-act="att-set"][data-id="${st}"][data-s="early_exit"]');
      if(b)b.click();
      return b?b.textContent:null;
    })()`);
    teacherOn();
    const l1 = sel();
    assert(l1 && l1.indexOf('خروج از کلاس') > -1, 'دکمهٔ شروع درست نیست: ' + l1);
    const mid = W(`(function(){
      var m=attTimersGet(${ctx.cls},todayISO());
      return {timer:m[${st}]||null, badge:!!document.querySelector('[data-att-timer]'),
              modal:!!document.getElementById('att_time'),
              mark:attDraftGet(${ctx.cls},todayISO())[${st}]||null};
    })()`);
    assert(!mid.modal, 'مودالِ ساعت باز شد — باید تایمر بود');
    assert(mid.timer, 'شروعِ تایمر در پیش‌نویس نیست');
    assert(mid.badge, 'نشانِ زندهٔ تایمر در جدول نیست');
    assert(!mid.mark, 'پیش از توقف، وضعیت علامت نخورده است');

    /* ۶۵ دقیقه عقب + توقف */
    W(`(function(){
      var all=attDraftAll(); var k=attDraftKey(${ctx.cls},todayISO());
      all[k].timers[${st}]=new Date(Date.now()-65*60000).toISOString();
      Store.setJSON('sms_att_draft_v1',all);
    })()`);
    const l2 = sel();
    assert(l2 && l2.indexOf('توقف') > -1, 'ضربهٔ دوم «توقف» نیست: ' + l2);
    const end = W(`(function(){
      var m=attDraftGet(${ctx.cls},todayISO());
      var e=(attDraftEvents(${ctx.cls},todayISO())[${st}]||{});
      var t=attTimersGet(${ctx.cls},todayISO());
      return {mark:m[${st}], f:e.exit||null, run:!!t[${st}]};
    })()`);
    /* Round 77: exit is an EVENT — base status is NOT marked */
    assert(!end.mark, 'وضعیتِ پایه نباید علامت بخورد (خروج رویداد است: ' + end.mark + ')');
    assert(end.f, 'رویدادِ خروج پس از توقف در پیش‌نویس نیست');
    assert(end.f && end.f.exit_minutes === 65,
      'دقیقهٔ سپری‌شده درست نیست (گرفت: ' + (end.f&&end.f.exit_minutes) + ' انتظار: 65)');
    assert(end.f && /^\d{2}:\d{2}$/.test(end.f.exit_at) && /^\d{2}:\d{2}$/.test(end.f.exit_return_at),
      'ساعت‌های خروج/بازگشت ثبت نشدند');
    assert(end.f && end.f.note && end.f.note.indexOf('خروج از کلاس') > -1, 'توضیح در پیش‌نویس نیست');
    assert(!end.run, 'تایمر پس از توقف فعال است');
  });

  /* ── ۳) ثبتِ نهایی: رکورد + taken_at + پیامک ────────────── */
  test('T3 ثبتِ نهایی: رکورد با بازهٔ خروج + taken_at + پیامکِ خروج', () => {
    W(`(function(){
      var sc=byId('schools',${ctx.sid});
      update('schools',sc.id,{notify_rules:{enabled:true,autoSend:false,graceMinutes:20,dailyCap:300,bulkWarn:50,
        kinds:{absence:true,late:true,exit:true,grade:false,event:true,pattern:true,daily:false,bus_on:true,bus_off:true}}});
    })()`);
    const st = freshStudent(1);
    /* تایمرِ تازهٔ همین دانش‌آموز: شروع، ۴۰ دقیقه عقب، توقف */
    W(`(function(){
      attTimerStart(${ctx.cls},todayISO(),${st});
      var all=attDraftAll(); var k=attDraftKey(${ctx.cls},todayISO());
      all[k].timers[${st}]=new Date(Date.now()-40*60000).toISOString();
      Store.setJSON('sms_att_draft_v1',all);
      attTimerStop(${ctx.cls},todayISO(),${st});
    })()`);
    teacherOn(`document.querySelector('[data-act="att-review"]').click();`);
    const rev = W(`(document.querySelector('.modal')||{}).textContent||''`);
    assert(rev.indexOf('خروج از کلاس') > -1, 'مرور نهایی «خروج از کلاس» را نشان نمی‌دهد');
    W(`document.querySelector('[data-act="att-commit"]').click()`);
    const rec = W(`(db.attendance||[]).find(function(a){return a.student_id===${st}&&a.date===todayISO();})||null`);
    assert(rec, 'رکورد ساخته نشد');
    /* Round 77: 40 minutes > 30% of the bell -> forced ABSENT (30% rule) */
    assert(rec.status === 'absent', 'قاعدهٔ ۳۰٪: رکورد باید غایب باشد (گرفت: ' + rec.status + ')');
    assert(rec.note && rec.note.indexOf('۳۰٪') > -1, 'قاعدهٔ ۳۰٪ در توضیح نیست: ' + rec.note);
    assert(rec.exit_minutes === 40, 'دقیقهٔ تایمر در رکورد درست نیست (گرفت: ' + rec.exit_minutes + ')');
    assert(rec.exit_return_at && /^\d{2}:\d{2}$/.test(rec.exit_return_at), 'ساعتِ بازگشت در رکورد نیست');
    assert(rec.taken_at, 'taken_at در رکوردِ تازه نیست');
    assert(rec.note && rec.note.indexOf('خروج از کلاس') > -1, 'توضیحِ تایمر در رکورد نیست');
    const q = W(`(db.notify_queue||[]).filter(function(x){return x.kind==='exit'&&x.student_id===${st}&&x.source_ref===${rec.id};}).length`);
    assert(q >= 1, 'پیامکِ خروج به صفِ اولیا نشست');
  });

  /* ── ) تایمرِ زنده، «دور ریختن» و «ثبت» را نمی‌برد ─────── */
  test('T4 ماندگاریِ تایمر: با دور ریختن و ثبتِ دیگران زنده می‌ماند', () => {
    const stA = freshStudent(2);      /* تایمرِ او */
    const stB = freshStudent(3);      /* تغییری که ثبت/دورریخته می‌شود */
    W(`attTimerStart(${ctx.cls},todayISO(),${stA})`);
    /* (الف) دور ریختن: تایمر باید بماند */
    teacherOn(`document.querySelector('[data-act="att-set"][data-id="${stB}"][data-s="absent"]').click();`);
    teacherOn(`document.querySelector('[data-act="att-discard"]').click();`);
    W(`document.querySelector('[data-act="ask-ok"]').click()`);
    const afterDiscard = W(`(function(){
      var t=attTimersGet(${ctx.cls},todayISO());
      var m=attDraftGet(${ctx.cls},todayISO());
      return {timer:!!t[${stA}], bMark:m[${stB}]||null};
    })()`);
    assert(afterDiscard.timer, 'دور ریختن، تایمرِ فعال را برد!');
    assert(!afterDiscard.bMark, 'دور ریختن، پیش‌نویس را پاک نکرد');

    /* (ب) ثبتِ نهاییِ تغییریِ دیگر: تایمر باید بماند */
    teacherOn(`document.querySelector('[data-act="att-set"][data-id="${stB}"][data-s="present"]').click();`);
    teacherOn(`document.querySelector('[data-act="att-review"]').click();`);
    W(`document.querySelector('[data-act="att-commit"]').click()`);
    const afterCommit = W(`attTimersGet(${ctx.cls},todayISO())[${stA}]||null`);
    assert(afterCommit, 'ثبتِ نهاییِ تغییریِ دیگر، تایمرِ فعال را برد!');
    /* پاک‌سازی: تایمر را متوقف نکن؛ کلِ پیش‌نویس را پاک می‌کنیم */
    W(`attDraftClear(${ctx.cls},todayISO())`);
  });

  /* ── ۵) تبدیلِ خودکار: غیبتِ ثبت‌شده + «تأخیر» (taken_at) ── */
  test('T5 غیبتِ ثبت‌شده (taken_at ۱۰ دقیقه پیش) + «تأخیر» ⇒ خودکار، ~۱۰ دقیقه', () => {
    const st = freshStudent(0);
    W(`insert('attendance',{school_id:${ctx.sid},class_id:${ctx.cls},student_id:${st},
      date:todayISO(),status:'absent',note:null,taken_at:new Date(Date.now()-10*60000).toISOString()})`);
    teacherOn(`document.querySelector('[data-act="att-set"][data-id="${st}"][data-s="late"]').click();`);
    const r = W(`(function(){
      var m=attDraftGet(${ctx.cls},todayISO());
      var e=(attDraftEvents(${ctx.cls},todayISO())[${st}]||{});
      return {mark:m[${st}], f:e.late||null, modal:!!document.getElementById('att_time')};
    })()`);
    assert(!r.modal, 'مودالِ ساعت باز شد — غیبتِ موجود باید خودکار می‌شد');
    /* Round 77: NO automatic conversion — base status stays absent */
    assert(!r.mark, 'وضعیتِ پایه نباید عوض می‌شد (تبدیلِ خودکار حذف شد: ' + r.mark + ')');
    assert(r.f, 'رویدادِ تأخیر در پیش‌نویس نیست');
    assert(r.f && r.f.late_minutes >= 9 && r.f.late_minutes <= 11,
      'دقیقهٔ تاخیر (~۱۰) درست نیست (گرفت: ' + (r.f&&r.f.late_minutes) + ')');
    assert(r.f && /^\d{2}:\d{2}$/.test(r.f.late_at), 'ساعتِ تأخیر ثبت نشد');
    assert(r.f && r.f.note && r.f.note.indexOf('تأخیر') > -1 && r.f.note.indexOf('دقیقه') > -1,
      'توضیحِ تاخیر در پیش‌نویس نیست');
    /* رکوردِ پایگاه: وضعیتِ غایب دست‌نخورده */
    const recStill = W(`(db.attendance||[]).find(function(a){return a.student_id===${st}&&a.date===todayISO();})`);
    assert(recStill && recStill.status === 'absent', 'رکورد باید هنوز غایب بماند');
  });

  /* ── ۶) بدونِ taken_at ⇒ مبنایِ محاسبه = شروعِ روز از زنگ ── */
  test('T6 غیبتِ بدونِ taken_at ⇒ دقیقه از «شروعِ روز» (برنامهٔ زنگ)', () => {
    const st = freshStudent(1);
    W(`insert('attendance',{school_id:${ctx.sid},class_id:${ctx.cls},student_id:${st},
      date:todayISO(),status:'absent',note:null})`);
    teacherOn(`document.querySelector('[data-act="att-set"][data-id="${st}"][data-s="late"]').click();`);
    const r = W(`(function(){
      var e=(attDraftEvents(${ctx.cls},todayISO())[${st}]||{});
      var f=e.late||null;
      var span=attDaySpan(${ctx.sid},todayISO());
      var exp=null;
      if(span&&span.firstFrom!=null){
        var base=new Date(todayISO()+'T12:00:00');
        base.setHours(Math.floor(span.firstFrom/60),span.firstFrom%60,0,0);
        exp=Math.max(0,Math.floor((Date.now()-base.getTime())/60000));
      }
      return {f:f, exp:exp, modal:!!document.getElementById('att_time')};
    })()`);
    assert(!r.modal, 'مودال باز شد — باید خودکار بود');
    assert(r.f && r.f.late_minutes != null, 'فیلدِ دقیقهٔ تأخیر نیست');
    if(r.exp == null){
      assert(r.f.late_minutes === 0, 'بدونِ برنامهٔ زنگ باید صفر دقیقه می‌شد (گرفت: ' + r.f.late_minutes + ')');
    } else {
      assert(Math.abs(r.f.late_minutes - r.exp) <= 1,
        'دقیقه از مبنایِ «شروعِ روز» درست نیست (گرفت: ' + r.f.late_minutes + ' انتظار: ' + r.exp + ')');
    }
  });

  /* ── ۷) تأخیرِ بدونِ غیبتِ ازپیش ⇒ مودالِ ساعت می‌ماند ─── */
  test('T7 «تأخیر» روی حضورِ ازپیش (نه غیبت) ⇒ مودالِ ساعت (مسیرِ 15.1)', () => {
    const st = freshStudent(2);
    W(`insert('attendance',{school_id:${ctx.sid},class_id:${ctx.cls},student_id:${st},
      date:todayISO(),status:'present',note:null,taken_at:new Date().toISOString()})`);
    teacherOn(`document.querySelector('[data-act="att-set"][data-id="${st}"][data-s="late"]').click();`);
    const r = W(`(function(){
      var m=document.getElementById('att_time');
      return {modal:!!m, val:m?m.value:null};
    })()`);
    assert(r.modal, 'مودالِ ساعت باز نشد — مسیرِ دستیِ 15.1 می‌بایست می‌ماند');
    assert(/^\d{1,2}:\d{2}$/.test(r.val||''), 'ساعتِ پیش‌فرضِ مودال درست نیست (' + r.val + ')');
    W(`closeModal()`);
  });

  /* ── ۸) پروندهٔ دانش‌آموز: توضیحِ خودکار ────────────────── */
  test('T8 پرونده: توضیحِ خودکار برای تأخیر و خروجِ تایمری + اولویتِ یادداشت', () => {
    const st = freshStudent(3);
    W(`(function(){
      var d=new Date(Date.now()-2*86400000).toISOString().slice(0,10);
      var d2=new Date(Date.now()-1*86400000).toISOString().slice(0,10);
      var d3=todayISO();
      insert('attendance',{school_id:${ctx.sid},class_id:${ctx.cls},student_id:${st},
        date:d,status:'late',late_at:'08:20',late_minutes:25,note:null});
      insert('attendance',{school_id:${ctx.sid},class_id:${ctx.cls},student_id:${st},
        date:d2,status:'early_exit',exit_at:'11:05',exit_return_at:'12:10',exit_minutes:65,note:null});
      insert('attendance',{school_id:${ctx.sid},class_id:${ctx.cls},student_id:${st},
        date:d3,status:'early_exit',exit_at:'10:00',exit_minutes:90,note:'تلفنِ ولی: مرخصی'});
    })()`);
    const htmlRec = W(`S.tab='attendance';viewRecord(${st})`);
    assert(htmlRec.indexOf('تأخیر: ساعت ۰۸:۲۰') > -1 || htmlRec.indexOf('تأخیر: ساعت 8:20') > -1,
      'توضیحِ خودکارِ تأخیر در پرونده نیست');
    assert(htmlRec.indexOf('۲۵ دقیقه') > -1 || htmlRec.indexOf('25 دقیقه') > -1,
      'دقیقهٔ تأخیر در پرونده نیست');
    assert(htmlRec.indexOf('خروج از کلاس: ساعت ۱۱:۰۵') > -1 || htmlRec.indexOf('خروج از کلاس: ساعت 11:05') > -1,
      'توضیحِ خروجِ تایمری در پرونده نیست');
    assert(htmlRec.indexOf('تا ۱۲:۱۰') > -1 || htmlRec.indexOf('تا 12:10') > -1,
      'ساعتِ بازگشت در پرونده نیست');
    assert(htmlRec.indexOf('تلفنِ ولی: مرخصی') > -1, 'یادداشتِ دبیر باید بر توضیحِ خودکار مقدم باشد');
  });

  /* ── ۹) taken_at با به‌روزرسانیِ رکورد می‌ماند ──────────── */
  test('T9 taken_at با تغییرِ وضعیتِ بعدی حفظ می‌شود', () => {
    const st = freshStudent(4);
    const t0 = new Date(Date.now() - 30 * 60000).toISOString();
    W(`insert('attendance',{school_id:${ctx.sid},class_id:${ctx.cls},student_id:${st},
      date:todayISO(),status:'absent',note:null,taken_at:'${t0}'})`);
    teacherOn(`document.querySelector('[data-act="att-set"][data-id="${st}"][data-s="present"]').click();`);
    teacherOn(`document.querySelector('[data-act="att-review"]').click();`);
    W(`document.querySelector('[data-act="att-commit"]').click()`);
    const rec = W(`(db.attendance||[]).find(function(a){return a.student_id===${st}&&a.date===todayISO();})||null`);
    assert(rec, 'رکورد نیست');
    assert(rec.status === 'present', 'تغییر به حاضر اعمال نشد');
    assert(rec.taken_at === t0, 'taken_at با به‌روزرسانی عوض شد (گرفت: ' + rec.taken_at + ')');
  });

  await Promise.all(testQueue);
  const total = pass + fail;
  console.log('\n' + '─'.repeat(52));
  console.log(`دور ۷۵ (خروجِ تایمری + تأخیرِ خودکار): ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (consoleErrors.length) {
    console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
    consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
  }
  /* ⚠️ تایمرهایِ فعال زمان‌سنج می‌سازند ⇒ خروجِ صریح */
  process.exit(fail || consoleErrors.length ? 1 : 0);
}
