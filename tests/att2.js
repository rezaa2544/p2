#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   حالت‌های زمان‌دار غیاب (بند 15.1):
   ۱) محاسبهٔ دقیقه از ساعت (attTimeFields/attDaySpan)
   ۲) رابط دبیر: دکمهٔ خروج + مودال زمان → پیش‌نویس با فیلد
   ۳) ثبت نهایی: فیلدها واقعاً در رکورد نوشته می‌شوند
   ۴) موجه‌سازی پس از ثبت: فقط مدیر؛ ردپا روی رکورد
   ۵) الگوی خروج مکرر در patternFlagged/patternCheck
   ۶) پیامک خروج: kind 'exit' در صف + کلیدِ خاموش = پیامِ ساخت‌نشده

   اجرا:  node tests/att2.js   (نیازمند jsdom)
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

  console.log('\n▸ حالت‌های زمان‌دار غیاب (15.1)');

  /* ── زمینهٔ مشترک ─────────────────────────────────────────── */
  const ctx = W(`(function(){
    var sch = db.schools.filter(function(s){return s.active;})[0];
    var sid = sch.id;
    var teacher = db.users.find(function(u){
      return u.role==='teacher' && u.school_id===sid && (u.status||'active')==='active';});
    var cls = db.classes.filter(function(c){return c.school_id===sid;})[0];
    var students = db.enrollments.filter(function(e){return e.class_id===cls.id;})
      .map(function(e){return byId('users',e.student_id);});
    var manager = db.users.find(function(u){return u.role==='manager' && u.school_id===sid;});
    return {sid:sid, teacher:teacher.id, cls:cls.id, students:students.map(s=>s.id), manager:manager.id};
  })()`);
  assert(ctx.sid, 'مدرسهٔ فعال پیدا نشد');
  assert(ctx.teacher, 'دبیر پیدا نشد');
  assert(ctx.manager, 'مدیر پیدا نشد');
  assert(ctx.students.length >= 2, 'دانش‌آموزِ کافی نیست');

  let stId = null;   /* دانش‌آموزِ کلیک‌شده در T2 — در T3/T6 استفاده می‌شود */

  /* یک روز کاریِ آینده (شنبه) برای محاسبه‌های زمان */
  const span = W(`(function(){
    var t = new Date();
    while(true){
      t = new Date(t.getTime() + 86400000);
      var day = (t.getDay()+1)%7;
      var wd = workDaysOf(${ctx.sid});
      if(wd.indexOf(day) > -1) break;
    }
    var iso = t.toISOString().slice(0,10);
    return attDaySpan(${ctx.sid}, iso);
  })()`);
  assert(span && span.firstFrom != null && span.lastTo > span.firstFrom,
    'بازهٔ روز از برنامهٔ زنگ ساخته نشد');

  /* ── ۱) محاسبهٔ دقیقه از ساعت ─────────────────────────────── */
  test('T1 دقیقهٔ تأخیر از ساعت (مستقیم از زنگ مدرسه)', () => {
    const r = W(`(function(){
      var f = attTimeFields(${ctx.sid}, '2026-01-01', 'late', '08:30');
      var f2 = attTimeFields(${ctx.sid}, '2026-01-01', 'early_exit', '10:00');
      var f0 = attTimeFields(${ctx.sid}, '2026-01-01', 'late', '00:00');
      var fb = attTimeFields(${ctx.sid}, '2026-01-01', 'late', 'نامعتبر');
      return {f, f2, f0, fb,
              expLate: Math.max(0, timeToMin('08:30') - ${span.firstFrom}),
              expExit: Math.max(0, ${span.lastTo} - timeToMin('10:00'))};
    })()`);
    assert(r.f.late_at === '08:30', 'ساعتِ تأخیر ذخیره نشد');
    assert(r.f.late_minutes === r.expLate && r.expLate > 0,
      'تأخیرِ دقیقه‌ای محاسبه نشد (گرفت: ' + r.f.late_minutes + ' انتظار: ' + r.expLate + ')');
    assert(r.f2.exit_at === '10:00', 'ساعتِ خروج ذخیره نشد');
    assert(r.f2.exit_minutes === r.expExit && r.expExit > 0,
      'دقیقهٔ خروج محاسبه نشد (گرفت: ' + r.f2.exit_minutes + ' انتظار: ' + r.expExit + ')');
    assert(r.f0.late_minutes === 0, 'زمانِ پیش از شروع باید صفر دقیقه باشد');
    assert(Object.keys(r.fb).length === 0, 'ساعتِ نامعتبر نباید فیلد بسازد');
  });

  /* ── ۲) رابطِ دبیر: خروج + مودالِ زمان ────────────────────── */
  test('T2 رابط: دکمهٔ خروج + مودالِ ساعت (دبیر)', () => {
    W(`(function(){
      S.user=byId('users',${ctx.teacher});S.persona=null;S.boss=null;
      S.filters={class:${ctx.cls},date:todayISO()};S.route='attendance';render();
    })()`);
    const n = W(`document.querySelectorAll('[data-act="att-set"][data-s="early_exit"]').length`);
    assert(n >= 2, 'دکمهٔ «خروج» در جدول نیست (تعداد: ' + n + ')');
    const hasExempt = W(`document.querySelectorAll('[data-act="att-exempt"]').length`);
    assert(hasExempt === 0, 'دبیر نباید دکمهٔ موجه‌سازی ببیند');

    /* کلیکِ واقعی روی دکمهٔ خروجِ نخستین دانش‌آموز */
    stId = Number(W(`document.querySelector('[data-act="att-set"][data-s="early_exit"]').dataset.id`));
    W(`(function(){
      document.querySelector('[data-act="att-set"][data-s="early_exit"]').click();
    })()`);
    const modal = W(`(function(){
      var t=document.getElementById('att_time');
      return t ? {id:t.id, value:t.value, hasSave:!!document.querySelector('[data-act="att-time-save"]')} : null;
    })()`);
    assert(modal, 'مودالِ ساعت باز نشد');
    assert(/^\d{2}:\d{2}$/.test(modal.value), 'ساعتِ پیش‌فرضِ مودال درست نیست (' + modal.value + ')');

    /* ساعت بگذار و ثبت کن */
    W(`(function(){
      document.getElementById('att_time').value='10:15';
      document.querySelector('[data-act="att-time-save"]').click();
    })()`);
    assert(stId, 'شناسهٔ دانش‌آموزِ کلیک‌شده گرفته نشد');
    const dr = W(`(function(){
      var m=attDraftGet(${ctx.cls},todayISO());
      var f=attDraftFields(${ctx.cls},todayISO());
      return {mark:m[${stId}], fields:f[${stId}],
              expExit:attExitMinutes(${ctx.sid},todayISO(),'10:15')};
    })()`);
    assert(dr.mark === 'early_exit', 'پیش‌نویسِ خروج ثبت نشد (' + dr.mark + ')');
    assert(dr.fields && dr.fields.exit_at === '10:15', 'فیلدِ ساعت در پیش‌نویس نیست');
    assert(dr.fields && dr.fields.exit_minutes === dr.expExit,
      'دقیقهٔ خروج در پیش‌نویس درست نیست');
  });

  /* ── ۳) مرور و ثبت نهایی: فیلدها در رکورد + پیامک خروج ──── */
  test('T3 ثبت نهایی: فیلدها در رکورد واقعاً نوشته می‌شوند + پیامک', () => {
    /* اطلاع‌رسانی مدرسه روشن می‌شود تا مسیرِ پیامک هم سنجیده شود */
    W(`(function(){
      var sc=byId('schools',${ctx.sid});
      update('schools',sc.id,{notify_rules:{enabled:true,autoSend:false,graceMinutes:20,dailyCap:300,bulkWarn:50,
        kinds:{absence:true,late:true,exit:true,grade:false,event:true,pattern:true,daily:false,bus_on:true,bus_off:true}}});
    })()`);
    const beforeQ = W(`(db.notify_queue||[]).filter(function(q){return q.kind==='exit';}).length`);
    /* رکوردِ امروزِ همان دانش‌آموز را بردار تا ثبت از مسیرِ INSERT برود
       (با remove() از لایهٔ داده — spliceِ مستقیم ایندکس را قدیمی می‌کند) */
    W(`(function(){
      var rec=(db.attendance||[]).find(function(a){
        return a.student_id===${stId}&&a.date===todayISO();});
      if(rec)remove('attendance',rec.id);
    })()`);
    W(`(function(){
      S.user=byId('users',${ctx.teacher});S.persona=null;S.boss=null;
      S.filters={class:${ctx.cls},date:todayISO()};S.route='attendance';render();
      document.querySelector('[data-act="att-review"]').click();
    })()`);
    const revText = W(`(function(){
      var m=document.querySelector('.modal');
      return m ? m.textContent : '';
    })()`);
    assert(revText.indexOf('خروج از کلاس') > -1, 'خلاصهٔ مرور «خروج» را نشان نمی‌دهد');

    W(`(function(){
      document.querySelector('[data-act="att-commit"]').click();
    })()`);
    const rec = W(`(function(){
      return (db.attendance||[]).find(function(a){
        return a.student_id===${stId} && a.date===todayISO();}) || null;
    })()`);
    assert(rec, 'رکوردِ حضور ساخته نشد');
    assert(rec.status === 'early_exit', 'وضعیتِ رکورد درست نیست (' + rec.status + ')');
    assert(rec.exit_at === '10:15', 'ساعتِ خروج در رکوردِ ثبت‌شده نیست');
    assert(typeof rec.exit_minutes === 'number' && rec.exit_minutes > 0,
      'دقیقهٔ خروج در رکوردِ ثبت‌شده نیست');
    const afterQ = W(`(function(){
      return (db.notify_queue||[]).filter(function(q){
        return q.kind==='exit' && q.student_id===${stId} && q.source_ref===${rec.id};}).length;
    })()`);
    assert(afterQ >= 1, 'پیامکِ خروج به صفِ اولیا نشست');
  });

  /* ── ) موجه‌سازی پس از ثبت: فقط مدیر + ردپا ─────────────── */
  test('T4 موجه‌سازی: گاردِ نقش + اثر روی رکورد', () => {
    /* یک رکوردِ غیابِ ثبت‌شدهٔ هفتهٔ اخیر پیدا کن */
    const abs = W(`(function(){
      var from=daysAgoISO(14);
      return (db.attendance||[]).filter(function(a){
        return a.school_id===${ctx.sid} && a.status==='absent' && !a.excused && a.date>=from;})[0] || null;
    })()`);
    assert(abs, 'رکوردِ غیابِ قابل موجه‌سازی پیدا نشد');
    const recId = abs.id, stuName = abs.student_id;

    W(`(function(){
      var clsRow=(db.attendance||[]).find(function(a){return a.id===${recId};});
      S.user=byId('users',${ctx.manager});S.persona=null;S.boss=null;
      S.filters={class:clsRow.class_id,date:clsRow.date};S.route='attendance';render();
    })()`);
    const btns = W(`document.querySelectorAll('[data-act="att-exempt"]').length`);
    assert(btns >= 1, 'دکمهٔ «موجه‌سازی» برای مدیر نیست');
    const thisOne = W(`(function(){
      var b=document.querySelector('[data-act="att-exempt"][data-id="${recId}"]');
      if(!b) return false;
      b.click();
      return !!document.querySelector('[data-act="att-exempt-confirm"]');
    })()`);
    assert(thisOne, 'مودالِ موجه‌سازی برای همان رکورد باز نشد');

    W(`(function(){
      document.getElementById('att_exempt_reason').value='مرخصی کتبی ولی';
      document.querySelector('[data-act="att-exempt-confirm"]').click();
    })()`);
    const after = W(`byId('attendance',${recId})`);
    assert(after && after.excused === true, 'موجه‌سازی روی رکورد اعمال نشد');
    assert(after && after.justified_by === ctx.manager, 'ردپایِ موجه‌کننده در رکورد نیست');
    assert(after && after.note === 'مرخصی کتبی ولی', 'دلیل موجه‌سازی در رکورد نیست');
    assert(after && after.status === 'absent', 'موجه‌سازی نباید وضعیتِ اصلی را عوض کند');

    /* حالا دبیر را بگذار: دکمهٔ موجه‌سازی نباید دیده شود */
    W(`(function(){
      var rec=byId('attendance',${recId});
      S.user=byId('users',${ctx.teacher});S.persona=null;S.boss=null;
      S.filters={class:rec.class_id,date:rec.date};
      S.route='attendance';render();
    })()`);
    const tBtns = W(`document.querySelectorAll('[data-act="att-exempt"]').length`);
    assert(tBtns === 0, 'دبیر نباید دکمهٔ موجه‌سازی ببیند (تعداد: ' + tBtns + ')');
  });

  /* ── ۵) الگوی خروج مکرر ─────────────────────────────────── */
  test('T5 الگوی خروج مکرر در patternFlagged و patternCheck', () => {
    const stId2 = ctx.students[1];
    W(`(function(){
      var sid=${ctx.sid};
      var cls=${ctx.cls};
      for(var i=1;i<=3;i++){
        var d=new Date(Date.now() - i*86400000).toISOString().slice(0,10);
        var old=(db.attendance||[]).filter(function(a){
          return a.student_id===${stId2} && a.date===d;});
        old.forEach(function(x){db.attendance.splice(db.attendance.indexOf(x),1);});
        insert('attendance',{school_id:sid,class_id:cls,student_id:${stId2},date:d,
          status:'early_exit',exit_at:'11:40',exit_minutes:20,note:null});
      }
    })()`);
    const chk = W(`patternCheck(${stId2},30)`);
    assert(chk.exits.count === 3, 'patternCheck خروج‌ها را نمی‌شمارد (گرفت: ' + chk.exits.count + ')');
    assert(chk.exits.totalMinutes === 60, 'مجموعِ دقیقهٔ خروج درست نیست');
    const flagged = W(`(patternFlagged(${ctx.sid},30)||[]).find(function(r){return r.user.id===${stId2};})`);
    assert(flagged, 'دانش‌آموزِ پرخرج در فهرستِ الگوها نیست');
    const bExit = (flagged.breaches || []).find(function(b){ return b.key === 'exits'; });
    assert(bExit, 'الگوی خروج مکرر شناسایی نشد');
    assert(bExit.count === 3 && bExit.totalMinutes === 60, 'مقادیرِ نقضِ خروج درست نیستند');
  });

  /* ── ) کلیدِ خاموشِ پیامکِ خروج ────────────────────────── */
  test('T6 خاموش‌بودنِ kind:exit → پیامِ خروج ساخته نمی‌شود', () => {
    W(`(function(){
      var sc=byId('schools',${ctx.sid});
      update('schools',sc.id,{notify_rules:{enabled:true,autoSend:false,graceMinutes:20,dailyCap:300,bulkWarn:50,
        kinds:{absence:true,late:true,exit:false,grade:false,event:true,pattern:true,daily:false,bus_on:true,bus_off:true}}});
    })()`);
    const stId3 = ctx.students.filter(function(x){ return x !== stId; })[0];
    W(`(function(){
      S.user=byId('users',${ctx.teacher});S.persona=null;S.boss=null;
      S.filters={class:${ctx.cls},date:todayISO()};
      var f=attTimeFields(${ctx.sid},todayISO(),'early_exit','10:30');
      attDraftSet(${ctx.cls},todayISO(),${stId3},'early_exit',f);
      var b=document.createElement('button');
      b.setAttribute('data-act','att-commit');
      document.body.appendChild(b); b.click(); b.remove();
    })()`);
    const q = W(`(function(){
      return (db.notify_queue||[]).filter(function(x){
        return x.kind==='exit' && x.student_id===${stId3};}).length;
    })()`);
    assert(q === 0, 'با خاموش‌بودنِ کلید، پیامکِ خروج نباید ساخته شود');
  });

  await Promise.all(testQueue);
  const total = pass + fail;
  console.log('\n' + '─'.repeat(52));
  console.log(`حالت‌های زمان‌دار: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (consoleErrors.length) {
    console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
    consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
  }
  /* ⚠️ برنامه زمان‌سنجِ تکرارِ صف دارد که پروسه را ~۴۵ ثانیه نگه می‌دارد؛
     نتیجه همین حالا چاپ شد ⇒ خروج صریح */
  process.exit(fail || consoleErrors.length ? 1 : 0);
}
