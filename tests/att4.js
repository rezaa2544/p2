#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   دور ۷۷ — بازطراحیِ حضور و غیابِ دبیر
   ۱) وضعیتِ پایه فقط حاضر/غایب؛ تاخیر و خروج = رویداد (فیلد)
   ۲) شروعِ بدونِ حالتِ فعال + دکمه‌هایِ فشردهٔ موبایلی
   ۳) تاخیر روی غایب: بدون مودال و بدون تبدیل (فقط فیلدها)
   ۴) قفلِ سه‌گزینهٔ دیگر هنگامِ تایمرِ خروج
   ۵) گزارشِ پایین: ویرایش/حذف/موجهِ رویدادها
   ۶) قاعدهٔ ۳۰٪: مجموعِ تأخیر+خروج > ۳۰٪ زنگ ⇒ غیبت
   ۷) موجهِ یکپارچه (دبیر+مدیر) با پنجرهٔ زمانیِ قابل تنظیم:
      حذف از پرونده + لغو پیامِ معلق + پیامِ توضیحی با دلیل

   اجرا:  node tests/att4.js   (نیازمند jsdom)
   ═══════════════════════════════════════════════════════════════════ */
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

  console.log('\n▸ دور ۷۷ — رویدادِ تاخیر/خروج، ۳۰٪، موجهِ یکپارچه');

  const ctx = W(`(function(){
    var sch = db.schools.filter(function(s){return s.active;})[0];
    var sid = sch.id;
    var teacher = db.users.find(function(u){
      return u.role==='teacher' && u.school_id===sid && (u.status||'active')==='active';});
    var manager = db.users.find(function(u){
      return u.role==='manager' && u.school_id===sid && (u.status||'active')==='active';});
    var cls = db.classes.filter(function(c){return c.school_id===sid;})[0];
    var students = db.enrollments.filter(function(e){return e.class_id===cls.id;})
      .map(function(e){return byId('users',e.student_id);});
    return {sid:sid, teacher:teacher.id, manager:manager.id, cls:cls.id,
            students:students.map(s=>s.id)};
  })()`);
  assert(ctx.sid, 'مدرسهٔ فعال پیدا نشد');
  assert(ctx.teacher, 'دبیر پیدا نشد');
  assert(ctx.manager, 'مدیر پیدا نشد');
  assert(ctx.students.length >= 6, 'دانش‌آموزِ کافی نیست');

  const teacherOn = (extra) => W(`(function(){
    S.user=byId('users',${ctx.teacher});S.persona=null;S.boss=null;
    S.filters={class:${ctx.cls},date:todayISO()};S.route='attendance';render();
    ${extra||''}
  })()`);
  const managerOn = (extra) => W(`(function(){
    S.user=byId('users',${ctx.manager});S.persona=null;S.boss=null;
    S.filters={class:${ctx.cls},date:todayISO()};S.route='attendance';render();
    ${extra||''}
  })()`);

  const freshStudent = (i) => Number(W(`(function(){
    var cands=[${ctx.students.slice(0, 6).join(',')},0,0,0,0,0];
    var s=cands[${i}]||cands[0];
    (db.attendance||[]).forEach(function(a){
      if(a.student_id===s&&a.date===todayISO())remove('attendance',a.id);});
    (db.notify_queue||[]).slice().forEach(function(q){
      if(q.student_id===s)remove('notify_queue',q.id);});
    return s;
  })()`));

  /* ── ۱) شروعِ کلاس: هیچ دکمه‌ای حالتِ فعال ندارد ─────────── */
  test('T1 شروع: پیش از هر تیکی، هیچ دکمه‌ای فعال نیست + گزارشِ خالی', () => {
    teacherOn();
    const r = W(`({
      active: document.querySelectorAll('.att-btn.on-present, .att-btn.on-absent, .att-btn.on-late, .att-btn.on-early_exit').length,
      btns: document.querySelectorAll('.att-btn').length,
      report: !!document.querySelector('.att-report'),
      todayRec: (db.attendance||[]).filter(function(a){return a.date===todayISO();}).length
    })`);
    assert(r.btns >= 6, 'دکمه‌هایِ سطر وجود ندارند (' + r.btns + ')');
    assert(r.active === 0, 'پیش از ثبت، دکمه‌ای حالتِ فعال نشان می‌دهد (' + r.active + ')');
    assert(!r.report, 'گزارشِ رویدادها باید خالی/پنهان بود');
    assert(r.todayRec === 0, 'دادهٔ دمو هنوز امروز را پیش‌ثبت کرده (' + r.todayRec + ')');
  });

  /* ── ۲) تاخیر روی غایب: خودکار، بدون مودال و بدون تبدیل ─── */
  test('T2 غایب + تاخیر: بدون مودال، بدون تبدیل، فقط فیلدهایِ رویداد', () => {
    const st = freshStudent(0);
    W(`S.attNow=null`);
    W(`insert('attendance',{school_id:${ctx.sid},class_id:${ctx.cls},student_id:${st},
      date:todayISO(),status:'absent',note:null,taken_at:new Date(Date.now()-10*60000).toISOString()})`);
    teacherOn(`document.querySelector('[data-act="att-set"][data-id="${st}"][data-s="late"]').click();`);
    const r = W(`(function(){
      var m=attDraftGet(${ctx.cls},todayISO());
      var e=(attDraftEvents(${ctx.cls},todayISO())[${st}]||{});
      var rec=(db.attendance||[]).find(function(a){return a.student_id===${st}&&a.date===todayISO();});
      return {mark:m[${st}], f:e.late||null, modal:!!document.getElementById('att_time'),
              recStatus:rec?rec.status:null};
    })()`);
    assert(!r.modal, 'مودالِ ساعت باز شد — غیبتِ موجود باید خودکار می‌شد');
    assert(!r.mark, 'وضعیتِ پایه نباید علامت بخورد (اتوماتِ تبدیل حذف شد: ' + r.mark + ')');
    assert(r.f, 'رویدادِ تاخیر در پیش‌نویس نیست');
    assert(r.f.late_minutes >= 9 && r.f.late_minutes <= 11,
      'دقیقهٔ تاخیر (~۱۰) درست نیست (گرفت: ' + r.f.late_minutes + ')');
    assert(r.recStatus === 'absent', 'رکورد باید هنوز غایب بماند (' + r.recStatus + ')');
    /* رویداد باید در گزارشِ پایینِ لیست نوشته شده باشد */
    const rep = W(`(document.querySelector('.att-report')||{}).textContent||''`);
    assert(rep.indexOf('تأخیر') > -1, 'گزارشِ پایین رویدادِ تاخیر را نشان نمی‌دهد');
  });

  /* ── ) تاخیر روی حاضر/ثبت‌نشده: مودالِ ساعت، فقط فیلدها ── */
  test('T3 تاخیر بدونِ غیبت: مودالِ ساعت + رویداد (وضعیت دست‌نخورده)', () => {
    const st = freshStudent(1);
    W(`S.attNow=null`);
    teacherOn(`document.querySelector('[data-act="att-set"][data-id="${st}"][data-s="late"]').click();`);
    const m = W(`({modal:!!document.getElementById('att_time')})`);
    assert(m.modal, 'مودالِ ساعت باز نشد (مسیرِ 15.1)');
    W(`(function(){
      document.getElementById('att_time').value='08:20';
      document.querySelector('[data-act="att-time-save"]').click();
    })()`);
    const r = W(`(function(){
      var m=attDraftGet(${ctx.cls},todayISO());
      var e=(attDraftEvents(${ctx.cls},todayISO())[${st}]||{});
      var span=attDaySpan(${ctx.sid},todayISO());
      var exp=span&&span.firstFrom!=null?Math.max(0,timeToMin('08:20')-span.firstFrom):null;
      return {mark:m[${st}], f:e.late||null, exp:exp};
    })()`);
    assert(!r.mark, 'وضعیتِ پایه نباید علامت بخورد (تأخیر رویداد است)');
    assert(r.f && r.f.late_at === '08:20', 'ساعتِ تاخیر ثبت نشد');
    assert(r.f && r.exp != null && r.f.late_minutes === r.exp,
      'دقیقهٔ تاخیر از برنامهٔ زنگ محاسبه نشد (گرفت: ' + (r.f&&r.f.late_minutes)
      + ' انتظار: ' + r.exp + ')');
  });

  /* ── ۴) تایمرِ خروج: سه گزینهٔ دیگر قفل می‌شوند ─────────── */
  test('T4 تایمر فعال: حاضر/غایب/تاخیر قفل (disabled + گارد)', () => {
    const st = freshStudent(2);
    W(`S.attNow=null`);
    teacherOn(`attTimerStart(${ctx.cls},todayISO(),${st});render();`);
    const r = W(`(function(){
      var p=document.querySelector('[data-act="att-set"][data-id="${st}"][data-s="present"]');
      var a=document.querySelector('[data-act="att-set"][data-id="${st}"][data-s="absent"]');
      var l=document.querySelector('[data-act="att-set"][data-id="${st}"][data-s="late"]');
      var x=document.querySelector('[data-act="att-set"][data-id="${st}"][data-s="early_exit"]');
      return {pd:p.hasAttribute('disabled'), ad:a.hasAttribute('disabled'),
              ld:l.hasAttribute('disabled'),
              xLabel:x.textContent,
              xDisabled:x.hasAttribute('disabled')};
    })()`);
    assert(r.pd && r.ad && r.ld, 'هنگامِ تایمر، گزینه‌هایِ حاضر/غایب/تاخیر قفل نیستند');
    assert(!r.xDisabled, 'دکمهٔ توقف خروج نباید قفل باشد');
    assert(r.xLabel.indexOf('توقف') > -1, 'دکمهٔ دوم باید «توقف» باشد: ' + r.xLabel);
    /* حتی اگر کلیک شود، گارد اجازهٔ علامت نمی‌دهد */
    W(`(function(){
      var b=document.querySelector('[data-act="att-set"][data-id="${st}"][data-s="present"]');
      b.removeAttribute('disabled'); b.click();
    })()`);
    const m = W(`attDraftGet(${ctx.cls},todayISO())[${st}]||null`);
    assert(!m, 'گاردِ قفلِ تایمر کار نکرد — وضعیت علامت خورد (' + m + ')');
    /* توقف و پاک‌سازی */
    W(`attTimerStop(${ctx.cls},todayISO(),${st});attDraftClear(${ctx.cls},todayISO())`);
  });

  /* ── ۵) گزارشِ پایین: ویرایش و حذفِ رویدادِ ثبت‌شده ─────── */
  test('T5 گزارش: ویرایشِ رویداد (مودال) + حذف (تأیید) — هر دو با ثبتِ قطعی', () => {
    const st = freshStudent(3);
    W(`S.attNow=null`);
    W(`insert('attendance',{school_id:${ctx.sid},class_id:${ctx.cls},student_id:${st},
      date:todayISO(),status:'present',late_at:'08:20',late_minutes:50,note:null,taken_at:new Date().toISOString()})`);
    /* (الف) رویداد در گزارش دیده می‌شود + ویرایش */
    teacherOn();
    let rep = W(`(function(){
      var t=document.querySelector('.att-report');
      var row=t&&t.querySelector('tr[data-st="${st}"]')||null;
      return {rep:!!t, row:row?row.textContent:null};
    })()`);
    assert(rep.rep && rep.row && rep.row.indexOf('تأخیر') > -1, 'رویدادِ ثبت‌شده در گزارش نیست');
    teacherOn(`document.querySelector('[data-act="att-event-edit"][data-id="${st}"][data-w="late"]').click();`);
    assert(W(`!!document.getElementById('att_evt_time')`), 'مودالِ ویرایش باز نشد');
    W(`(function(){
      /* ۰۷:۳۵ = ۵ دقیقه — زیرِ ۳۰٪ زنگ تا وضعیتِ پایه باقی بماند */
      document.getElementById('att_evt_time').value='07:35';
      document.querySelector('[data-act="att-event-edit-save"]').click();
    })()`);
    teacherOn(`document.querySelector('[data-act="att-review"]').click();`);
    W(`document.querySelector('[data-act="att-commit"]').click()`);
    let rec = W(`(db.attendance||[]).find(function(a){return a.student_id===${st}&&a.date===todayISO();})`);
    assert(rec && rec.late_at === '07:35', 'ویرایش در رکورد اعمال نشد (late_at: ' + (rec&&rec.late_at) + ')');
    assert(rec && rec.late_minutes === 5, 'دقیقهٔ تازه درست محاسبه نشد (گرفت: ' + (rec&&rec.late_minutes) + ')');
    assert(rec && rec.status === 'present', 'وضعیتِ پایه نباید با ویرایشِ رویداد عوض شود (' + rec.status + ')');
    /* (ب) حذف */
    teacherOn(`document.querySelector('[data-act="att-event-del"][data-id="${st}"][data-w="late"]').click();`);
    assert(W(`!!document.querySelector('[data-act="ask-ok"]')`), 'مودالِ تأییدِ حذف باز نشد');
    W(`document.querySelector('[data-act="ask-ok"]').click()`);
    teacherOn(`document.querySelector('[data-act="att-review"]').click();`);
    W(`document.querySelector('[data-act="att-commit"]').click()`);
    rec = W(`(db.attendance||[]).find(function(a){return a.student_id===${st}&&a.date===todayISO();})`);
    assert(rec, 'رکورد بعد از حذفِ رویداد باید بماند');
    assert(!rec.late_at && (rec.late_minutes == null || rec.late_minutes === null),
      'فیلدهایِ رویداد از رکورد پاک نشدند (late_at: ' + rec.late_at + ')');
    assert(rec.status === 'present', 'حذفِ رویداد وضعیتِ پایه را عوض کرد (' + rec.status + ')');
  });

  /* ── ۶) قاعدهٔ ۳۰٪: مجموع > ۳۰٪ زنگ ⇒ غیبت در ثبت ───────── */
  test('T6 قاعدهٔ ۳۰٪: تأخیر ۱۰ + خروج ۲۰ (بیش از ۳۰٪ زنگ ۴۵) ⇒ غیبت', () => {
    const st = freshStudent(4);
    W(`S.attNow=null`);
    W(`(function(){
      attDraftEvent(${ctx.cls},todayISO(),${st},'late',{late_at:'07:50',late_minutes:10});
      attDraftEvent(${ctx.cls},todayISO(),${st},'exit',{exit_at:'08:20',exit_return_at:'08:40',exit_minutes:20,note:null});
    })()`);
    teacherOn(`document.querySelector('[data-act="att-review"]').click();`);
    W(`document.querySelector('[data-act="att-commit"]').click()`);
    const rec = W(`(db.attendance||[]).find(function(a){return a.student_id===${st}&&a.date===todayISO();})`);
    assert(rec, 'رکورد ساخته نشد');
    assert(rec.status === 'absent', 'قاعدهٔ ۳۰٪: رکورد باید غایب باشد (گرفت: ' + rec.status + ')');
    assert(rec.note && rec.note.indexOf('۳۰٪') > -1, 'دلیلِ ۳۰٪ در یادداشت نیست: ' + rec.note);
    assert(rec.late_minutes === 10 && rec.exit_minutes === 20, 'فیلدهایِ رویداد در رکورد نیستند');
    /* زیرمجموعه: مجموعِ کمتر از ۳۰٪ نباید غایب کند */
    const st2 = freshStudent(5);
    W(`(function(){
      attDraftEvent(${ctx.cls},todayISO(),${st2},'late',{late_at:'07:35',late_minutes:5});
      attDraftEvent(${ctx.cls},todayISO(),${st2},'exit',{exit_at:'08:20',exit_return_at:'08:25',exit_minutes:5,note:null});
    })()`);
    teacherOn(`document.querySelector('[data-act="att-review"]').click();`);
    W(`document.querySelector('[data-act="att-commit"]').click()`);
    const rec2 = W(`(db.attendance||[]).find(function(a){return a.student_id===${st2}&&a.date===todayISO();})`);
    assert(rec2 && rec2.status === 'present', 'زیرِ ۳۰٪ نباید غایب شود (گرفت: ' + (rec2&&rec2.status) + ')');
  });

  /* ── ۷) موجهِ درونِ پنجره: پرونده + لغو پیامِ معلق ──────── */
  test('T7 موجه (دبیر، درونِ پنجره): پرونده خالی می‌شود + پیامِ معلق لغو', () => {
    const st = freshStudent(0);
    const recId = W(`insert('attendance',{school_id:${ctx.sid},class_id:${ctx.cls},student_id:${st},
      date:todayISO(),status:'present',late_at:'08:00',late_minutes:30,note:null,taken_at:new Date().toISOString()}).id`);
    /* پیامِ معلقِ سازندهٔ دبیر */
    W(`insert('notify_queue',{school_id:${ctx.sid},kind:'late',student_id:${st},class_id:${ctx.cls},
      source_ref:${recId},status:'pending',created_by:${ctx.teacher},
      created_at:new Date().toISOString(),decided_at:null,student_name:'x',date_fa:'x',body:'x'})`);
    /* زنگِ ۰۸:۰۰ = ۷:۳۰–۰۸:۱۵؛ پنجره تا ۰۸:۳۰ — الان را ۰۸:۲۰ می‌گیریم */
    const nowStr = W(`(function(){
      var b=new Date(todayISO()+'T12:00:00');b.setHours(8,20,0,0);return b.toISOString();
    })()`);
    W(`S.attNow='${nowStr}'`);
    teacherOn(`document.querySelector('[data-act="att-excuse-event"][data-id="${st}"][data-w="late"]').click();`);
    assert(W(`!!document.getElementById('att_exc_evt_reason')`), 'مودالِ موجه باز نشد');
    W(`(function(){
      document.getElementById('att_exc_evt_reason').value='مرخصی کتبی ولی';
      document.querySelector('[data-act="att-excuse-event-confirm"]').click();
    })()`);
    const rec = W(`byId('attendance',${recId})`);
    assert(rec.late_excused === true, 'موجه روی رکورد اعمال نشد');
    assert(rec.late_excuse_reason === 'مرخصی کتبی ولی', 'دلیلِ موجه ذخیره نشد');
    assert(rec.late_excused_by === ctx.teacher, 'ردپایِ موجه‌کننده نیست');
    const q = W(`(db.notify_queue||[]).filter(function(x){return x.source_ref===${recId}&&x.kind==='late'&&x.status==='pending';}).length`);
    assert(q === 0, 'پیامِ معلق لغو نشد');
    /* پرونده: ردیفِ امروز نباید توضیحِ رویدادِ موجه را داشته باشد
       (رکوردهایِ تاریخیِ دمو بی‌رابطه‌اند — فقط ردیفِ امروز را می‌سنجیم) */
    teacherOn();
    const chk = W(`(function(){
      var h=''; S.tab='attendance'; h=viewRecord(${st});
      var today=jalali(todayISO());
      var i=h.indexOf(today);
      var row=(i>-1)?h.slice(i, h.indexOf('</tr>',i)):'(ردیفِ امروز نیست)';
      return {today:today, row:row};
    })()`);
    assert(chk.today && chk.row.indexOf('ردیفِ امروز نیست') === -1, 'ردیفِ امروز در پرونده نیست');
    assert(chk.row.indexOf('تأخیر: ساعت') === -1, 'رویدادِ موجه‌شده هنوز در پرونده نوشته شده: ' + chk.row.slice(0,120));
  });

  /* ── ) موجهِ بیرونِ پنجره: مسدود ──────────────────────── */
  test('T8 موجه (دبیر، بیرونِ پنجره): مسدود + رکورد دست‌نخورده', () => {
    const st = freshStudent(1);
    const recId = W(`insert('attendance',{school_id:${ctx.sid},class_id:${ctx.cls},student_id:${st},
      date:todayISO(),status:'present',late_at:'08:00',late_minutes:30,note:null,taken_at:new Date().toISOString()}).id`);
    const nowStr = W(`(function(){
      var b=new Date(todayISO()+'T12:00:00');b.setHours(12,0,0,0);return b.toISOString();
    })()`);
    W(`S.attNow='${nowStr}'`);
    teacherOn(`document.querySelector('[data-act="att-excuse-event"][data-id="${st}"][data-w="late"]').click();`);
    assert(W(`!!document.getElementById('att_exc_evt_reason')`), 'مودالِ موجه باز نشد');
    const wTxt = W(`(document.querySelector('.modal')||{}).textContent||''`);
    assert(wTxt.indexOf('بسته') > -1, 'مودال باید پنجرهٔ بسته را بگوید: ' + wTxt.slice(0, 120));
    W(`(function(){
      document.getElementById('att_exc_evt_reason').value='دیر شد';
      document.querySelector('[data-act="att-excuse-event-confirm"]').click();
    })()`);
    const rec = W(`byId('attendance',${recId})`);
    assert(!rec.late_excused, 'موجهِ بیرونِ پنجره اعمال شد!');
    assert(!rec.late_excuse_reason, 'دلیلِ موجهِ نامعتبر ذخیره شد');
    W(`S.attNow=null`);
  });

  /* ── ۹) پیامِ توضیحی وقتی SMS رفته باشد ───────────────── */
  test('T9 SMS رفته + موجه ⇒ پیامِ توضیحیِ جدید با دلیل به صف', () => {
    const st = freshStudent(2);
    const recId = W(`insert('attendance',{school_id:${ctx.sid},class_id:${ctx.cls},student_id:${st},
      date:todayISO(),status:'present',late_at:'08:00',late_minutes:30,note:null,taken_at:new Date().toISOString()}).id`);
    W(`insert('notify_queue',{school_id:${ctx.sid},kind:'late',student_id:${st},class_id:${ctx.cls},
      source_ref:${recId},status:'sent',created_by:${ctx.teacher},
      created_at:new Date(Date.now()-30*60000).toISOString(),
      decided_at:new Date(Date.now()-25*60000).toISOString(),student_name:'x',date_fa:'x',body:'x'})`);
    const nowStr = W(`(function(){
      var b=new Date(todayISO()+'T12:00:00');b.setHours(8,25,0,0);return b.toISOString();
    })()`);
    W(`S.attNow='${nowStr}'`);
    teacherOn(`document.querySelector('[data-act="att-excuse-event"][data-id="${st}"][data-w="late"]').click();`);
    W(`(function(){
      document.getElementById('att_exc_evt_reason').value='مسمومیت غذایی';
      document.querySelector('[data-act="att-excuse-event-confirm"]').click();
    })()`);
    const rec = W(`byId('attendance',${recId})`);
    assert(rec.late_excused === true, 'موجه اعمال نشد');
    const ev = W(`(db.notify_queue||[]).filter(function(x){
        return x.kind==='event'&&x.source_ref===${recId};})`);
    assert(ev.length >= 1, 'پیامِ توضیحیِ جدید ساخته نشد');
    assert(ev[0].body && ev[0].body.indexOf('مسمومیت غذایی') > -1, 'دلیل در پیامِ توضیحی نیست');
    assert(ev[0].body && ev[0].body.indexOf('موجه') > -1, 'پیام باید «موجه شدن» را بگوید');
    W(`S.attNow=null`);
  });

  /* ── ۱۰) موجهِ یکپارچهٔ مدیر: رکورد + رویدادهایش ────────── */
  test('T10 مدیر: موجه‌سازی رکوردِ غایب + رویدادِ تاخیر (یکپارچه) + حذف از پرونده', () => {
    const st = freshStudent(3);
    const recId = W(`insert('attendance',{school_id:${ctx.sid},class_id:${ctx.cls},student_id:${st},
      date:todayISO(),status:'absent',late_at:'08:00',late_minutes:30,note:null,
      taken_at:new Date().toISOString()}).id`);
    managerOn(`document.querySelector('[data-act="att-exempt"][data-id="${recId}"]').click();`);
    assert(W(`!!document.getElementById('att_exempt_reason')`), 'مودالِ موجهٔ مدیر باز نشد');
    W(`(function(){
      document.getElementById('att_exempt_reason').value='هماهنگی کتبی با ولی';
      document.querySelector('[data-act="att-exempt-confirm"]').click();
    })()`);
    const rec = W(`byId('attendance',${recId})`);
    assert(rec.excused === true, 'موجهٔ رکورد اعمال نشد');
    assert(rec.justified_by === ctx.manager, 'ردپایِ مدیر نیست');
    assert(rec.late_excused === true, 'رویدادِ تاخیرِ هم‌رکورد موجه نشد (یکپارچگی)');
    /* پرونده: کلِ رکورد (موجه) حذف شده — تاریخِ امروز در جدول نیست */
    const chk = W(`(function(){
      var h=''; S.tab='attendance'; h=viewRecord(${st});
      var today=jalali(todayISO());
      return {today:today, shown:h.indexOf(today)>-1};
    })()`);
    assert(chk.today, 'تاریخِ جلالی امروز ساخته نشد');
    assert(!chk.shown, 'رکوردِ موجه‌شده هنوز در پرونده نمایش داده می‌شود');
  });

  /* ── ۱۱) موجهِ رکوردِ حاضر + رویداد: فقط رویداد موجه می‌شود ─── */
  test('T11 رکوردِ حاضر + رویداد: موجه فقط رویداد است (رکورد از پرونده نمی‌رود)', () => {
    const st = freshStudent(4);
    W(`S.attNow=null`);
    const recId = W(`insert('attendance',{school_id:${ctx.sid},class_id:${ctx.cls},student_id:${st},
      date:todayISO(),status:'present',late_at:'08:00',late_minutes:30,note:null,
      taken_at:new Date().toISOString()}).id`);
    managerOn(`document.querySelector('[data-act="att-exempt"][data-id="${recId}"]').click();`);
    W(`(function(){
      document.getElementById('att_exempt_reason').value='دعوت هیئت معارفه';
      document.querySelector('[data-act="att-exempt-confirm"]').click();
    })()`);
    const rec = W(`byId('attendance',${recId})`);
    assert(rec.late_excused === true, 'رویدادِ تاخیر موجه نشد');
    assert(!rec.excused, 'رکوردِ حاضر نباید excused شود (حذفِ نادرست از پرونده)');
    const chk = W(`(function(){
      var h=''; S.tab='attendance'; h=viewRecord(${st});
      var today=jalali(todayISO());
      return {shown:h.indexOf(today)>-1};
    })()`);
    assert(chk.shown, 'رکوردِ حاضر باید در پرونده بماند');
  });

  await sleep(200);
  const jsErr = consoleErrors.filter(e => !/Could not parse CSS|not implemented/i.test(e));
  assert(jsErr.length === 0, 'خطای JS در کنسول: ' + jsErr.slice(0, 3).join(' | '));

  const total = pass + fail;
  console.log('\nدور ۷۷ (رویداد/۳۰٪/موجهِ یکپارچه): ' + pass + '/' + total + ' موفق' +
    (fail ? '  — با خطا ❌' : '  —  بدون خطا ✅'));
  if (fail) { process.exit(1); }
}
