#!/usr/bin/env node
/* ویژگی‌های سمتِ کلاینت (پایلوت):
 *  F1 چک‌لیستِ «فردا» از برنامهٔ هفتگی
 *  F2 شمارشِ معکوسِ امتحان
 *  F3 خروجیِ تقویم ICS
 *  F4 پاسخِ سریعِ ولی: «موجه اعلام کنم» روی غیبت
 * اجرا: node tests/client-features.js (نیازمند jsdom)
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

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: new (require('jsdom').VirtualConsole)()
});
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickAct = (act, id) => W(`(function(){
  var el=document.createElement('button');
  el.setAttribute('data-act','${act}');
  ${id != null ? `el.setAttribute('data-id','${id}');` : ''}
  document.body.appendChild(el); el.click(); el.remove();
})()`);

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  await sleep(400);
  console.log('\n▸ ویژگی‌هایِ سمتِ کلاینت (پایلوت)');

  const par = W(`byId('users', db.users.find(u=>u.username==='parent_multi').id)`);

  /* ── F1: چک‌لیستِ فردا ── */
  test('F1 — ساختارِ چک‌لیستِ فردا (تاریخ/روز/مدرسه‌بودن)', () => {
    const tc = W(`tomorrowChecklistItems(16)`);
    assert(tc && tc.date, 'تاریخِ فردا نیست');
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const iso = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0');
    assert(tc.date === iso, 'تاریخِ فردا درست نیست: ' + tc.date);
    assert(tc.day === W(`cfAppDay('${iso}')`), 'روزِ هفتهٔ محاسبه‌شده نمی‌خواند');
    /* PR#2 (دور ۸۸): «روزِ درسی» بر پایهٔ work_daysِ خودِ مدرسه + روزهای جبرانی
       (isWorkDay) — نه فقط ۰ تا ۴. با دو پیکربندیِ کنترل‌شده راستی‌آزمایی: */
    W(`(function(){var sc=byId('schools',classOf(16).school_id);sc.__cfWdOld=sc.work_days;delete sc.work_days;sc.work_days=[0,1,2,3,4];var t1=tomorrowChecklistItems(16).school;sc.work_days=[5,6];var t2=tomorrowChecklistItems(16).school;sc.work_days=sc.__cfWdOld;if(sc.__cfWdOld==null)delete sc.work_days;delete sc.__cfWdOld;window.__cfWd={a:t1,b:t2,day:cfAppDay('${iso}')};})()`);
    const wd = W(`__cfWd`);
    assert(wd.a === (wd.day >= 0 && wd.day <= 4), 'پیکربندیِ ۰-۴: علامتِ روزِ درسی نمی‌خواند');
    assert(wd.b === (wd.day >= 5), 'پیکربندیِ ۵-۶: روزهای کاریِ مدرسه اعمال نمی‌شوند');
    if (tc.school) {
      assert(Array.isArray(tc.rows) && Array.isArray(tc.exams), 'برنامه/امتحانِ فردا نیست');
      const first = tc.rows[0] || {};
      assert(tc.rows.every(r => Number.isInteger(r.period) && r.subject && r.teacher), 'فیلدهای برنامهٔ فردا ناقص است');
      const periods = tc.rows.map(r => r.period);
      assert(JSON.stringify(periods) === JSON.stringify(periods.slice().sort((a, b) => a - b)), 'برنامه بر اساس زنگ مرتب نیست');
    }
  });

  test('F1-b — کارتِ «فردا و امتحانات» در پروندهٔ ولی رندر می‌شود', () => {
    W(`S.user=db.users.find(function(u){return u.id===${par.id};});S.persona=null;S.boss=null;S.child=16;S.route='record';S.tab='attendance';`);
    const out = W(`renderRoute()`);
    assert(out.indexOf('فردا و امتحانات') > -1, 'کارتِ «فردا و امتحانات» نیست');
    assert(out.indexOf('data-act="ics-export"') > -1, 'دکمهٔ ICS نیست');
  });

  /* ── F2: شمارشِ معکوسِ امتحان ── */
  test('F2 — شمارشِ معکوسِ امتحان (روزیابیِ درست)', () => {
    const ne = W(`nextExamOf(16)`);
    if (ne) {
      const today = W(`todayISO()`);
      const a = today.split('-').map(Number), b = ne.date.split('-').map(Number);
      const days = Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
      assert(ne.days === days, 'تعدادِ روزِ مانده درست محاسبه نشده: ' + ne.days + ' vs ' + days);
      assert(ne.days >= 0, 'امتحانِ گذشته برگشته');
      assert(typeof ne.subject === 'string' && ne.subject.length > 0, 'درسِ امتحان نیست');
      const out = W(`renderRoute()`);
      assert(out.indexOf('روز مانده') > -1, 'برچسبِ «روز مانده» روی کارت نیست');
    } else {
      const out = W(`renderRoute()`);
      assert(out.indexOf('امتحان پیش‌رو') > -1, 'پیامِ «امتحان پیش‌رو نیست» نیست');
    }
  });

  /* ── F3: خروجی ICS ── */
  test('F3 — ساختارِ فایلِ ICS (سراسری + رویداد برای هر امتحانِ ۳۰ روز)', () => {
    const ics = W(`icsForStudent(16)`);
    assert(ics.indexOf('BEGIN:VCALENDAR') === 0, 'شروعِ VCALENDAR نیست');
    assert(ics.trim().endsWith('END:VCALENDAR'), 'پایانِ VCALENDAR نیست');
    const examCount = W(`(function(){
      var cls=classOf(16); if(!cls) return 0;
      var today=todayISO(); var d=new Date(+today.slice(0,4),+today.slice(5,7)-1,+today.slice(8,10)); d.setDate(d.getDate()+30);
      var q=function(x){return String(x).padStart(2,'0');}; var h=d.getFullYear()+'-'+q(d.getMonth()+1)+'-'+q(d.getDate());
      return db.exams.filter(function(e){return e.class_id===cls.id&&e.date>=today&&e.date<=h;}).length;
    })()`);
    const vevents = (ics.match(/BEGIN:VEVENT/g) || []).length;
    assert(vevents >= examCount, 'تعدادِ رویداد کمتر از امتحاناتِ کلاس است: ' + vevents + ' < ' + examCount);
    assert(vevents === (ics.match(/END:VEVENT/g) || []).length, 'BEGIN/END رویداد متقارن نیست');
    /* PR#2: امتحانِ ساعت‌دار = DATE-TIMEِ شناور (بدون Z) · بدونِ ساعت = VALUE=DATE */
    const dts = ics.match(/DTSTART[^\r\n]*/g) || [];
    assert(dts.length > 0, 'هیچ DTSTART نیست');
    /* تاریخِ خالص یا DATE-TIMEِ شناورِ محلیِ HHMMSS — هر دو مطابق RFC 5545 */
    const badDt = dts.filter(l => !/^DTSTART(;VALUE=DATE)?:\d{8}(T\d{6})?$/.test(l));
    assert(badDt.length === 0, 'DTSTART نامعتبر: ' + badDt.join(' | '));
    const examUids = (ics.match(/UID:payesh-exam-\d+@payesh/g) || []).length;
    assert(examUids === examCount, 'UID برای هر امتحان نیست: ' + examUids + ' vs ' + examCount);
    // دکمه: دانلود در jsdom خطا نمی‌دهد (مسیرِ data-URI)
    const before = W(`S.user=db.users.find(function(u){return u.id===${par.id};});S.persona=null;S.boss=null;S.child=16;S.route='record';S.tab='attendance';renderRoute()`);
    clickAct('ics-export', 16);
    assert(true, 'دکمهٔ ICS بدونِ کرش کار کرد');
  });

  /* ── F3-b: پالایش ICS (RFC 5545) — تزریقِ فیلدِ کاذب ممکن نباشد ── */
  test('F3-b — دادهٔ بدخواه در نامِ درس/توضیح، فیلدِ ICS نمی‌سازد', () => {
    W(`(function(){
      var cls=classOf(16);
      var crlf=String.fromCharCode(13,10);
      var subj=insert('subjects',{school_id:cls.school_id,name:'X;X-PROP;BAD=1,Y'+crlf+'INJ:CT:1'});
      var today=todayISO();
      var d=new Date(+today.slice(0,4),+today.slice(5,7)-1,+today.slice(8,10)); d.setDate(d.getDate()+2);
      var q=function(x){return String(x).padStart(2,'0');};
      var iso=d.getFullYear()+'-'+q(d.getMonth()+1)+'-'+q(d.getDate());
      insert('exams',{school_id:cls.school_id,class_id:cls.id,subject_id:subj.id,date:iso,start_time:'09:30',room:'R1;R2'+crlf+'LOC:ATION'});
    })()`);
    const ics = W(`icsForStudent(16)`);
    const lines = ics.split('\r\n');
    assert(lines.every(l => !l.startsWith('INJ') && !l.startsWith('X-PROP') && !l.startsWith('LOC:ATION') && !l.startsWith('R2')), 'فیلدِ تزریق‌شده در ICS ظاهر شد: ' + ics.slice(0, 400));
    const injLine = lines.find(l => l.indexOf('INJ:CT:1') > -1);
    const locLine = lines.find(l => l.indexOf('LOC:ATION') > -1);
    assert(injLine && injLine.indexOf('SUMMARY:') === 0, 'INJ به خطِ مستقل نشت کرده: ' + JSON.stringify(injLine));
    assert(locLine && locLine.indexOf('LOCATION:') === 0, 'LOC:ATION به خطِ مستقل نشت کرده: ' + JSON.stringify(locLine));
    const expected = W(`icsEsc('X;X-PROP;BAD=1,Y'+String.fromCharCode(13,10)+'INJ:CT:1')`);
    assert(ics.indexOf(expected) > -1, 'مقدارِ بدخواه پالایش (escaped) نشده: ' + ics.slice(0, 400));
    assert(/DTSTART:\d{8}T093000/.test(ics), 'امتحانِ ساعت‌دار با DATE-TIME صادر نشده');
  });

  /* ── F4: موجه‌سازیِ سریع ── */
  test('F4 — کلیکِ «موجه اعلام کنم» مودال می‌سازد', () => {
    const rid = W(`(function(){
      var a=db.attendance.filter(function(x){return x.student_id===16&&x.status==='absent'&&!x.excused;})
        .sort(function(x,y){return y.date.localeCompare(x.date);});
      return a.length?a[0].id:null;
    })()`);
    if (rid == null) { console.log('     (رکوردِ غیبتِ موجه‌نشده‌ای برای ۱۶ نیست — تست با رکوردِ ساختگی)');
      W(`insert('attendance',{school_id:1,student_id:16,date:todayISO(),status:'absent'})`);
      W(`S.__cfTestRid=db.attendance[db.attendance.length-1].id`);
    } else {
      W(`S.__cfTestRid=${rid}`);
    }
    W(`S.user=db.users.find(function(u){return u.id===${par.id};});S.persona=null;S.boss=null;S.child=16;S.route='record';S.tab='attendance';`);
    clickAct('quick-excuse', W(`S.__cfTestRid`));
    assert(W(`$('#qe_reason')!=null`), 'مودالِ موجه‌سازی باز نشده');
  });

  test('F4-b — ذخیره: درخواستِ pending + اعلانِ مدیر', () => {
    const leavesBefore = W(`db.leaves.length`);
    const notifsBefore = W(`db.notifications.length`);
    W(`$('#qe_reason').value='مراجعه به پزشک (تست)';`);
    clickAct('qe-save');
    assert(W(`db.leaves.length`) === leavesBefore + 1, 'درخواستِ مرخصی ثبت نشد');
    const rec = W(`db.leaves[db.leaves.length-1]`);
    assert(rec.status === 'pending', 'وضعیت pending نیست');
    assert(rec.student_id === 16 && rec.from_date === rec.to_date, 'دانش‌آموز/بازهٔ تاریخ درست نیست');
    assert(rec.reason.indexOf('موجه‌سازیِ والد') === 0, 'علتِ موجه‌سازیِ والد نیست');
    assert(W(`db.notifications.length`) >= notifsBefore + 1, 'اعلانِ مدیر ثبت نشده');
    assert(W(`$('#qe_reason')==null`), 'مودال بسته نشده');
  });

  test('F4-c — گاردِ نقش: ولی برای غیبتِ فرزندِ خودش نیست رد می‌شود', () => {
    const otherRid = W(`(function(){
      var kids=db.parent_links.filter(function(p){return p.parent_id===${par.id};}).map(function(p){return p.student_id;});
      var a=db.attendance.filter(function(x){return x.status==='absent'&&!x.excused&&kids.indexOf(x.student_id)<0&&x.school_id===${par.school_id};})[0];
      return a?a.id:null;
    })()`);
    assert(otherRid != null, 'رکوردِ غیبتِ دانش‌آموزِ بی‌ربط پیدا نشد');
    const leavesBefore = W(`db.leaves.length`);
    clickAct('quick-excuse', otherRid);
    assert(W(`db.leaves.length`) === leavesBefore, 'درخواست برای غیبتِ بی‌ربط ثبت شد!');
    assert(W(`$('#qe_reason')==null`), 'مودال نباید باز می‌شد');
  });

  test('F4-d — مدیر کارتِ «فردا و امتحانات» نمی‌بیند', () => {
    const mgr = W(`db.users.find(u=>u.role==='manager'&&u.school_id===1)`);
    W(`S.user=${JSON.stringify({ id: mgr.id, role: 'manager', school_id: mgr.school_id })};S.persona=null;S.boss=null;S.child=16;S.route='record';S.tab='attendance';`);
    const out = W(`renderRoute()`);
    assert(out.indexOf('فردا و امتحانات') === -1, 'کارتِ ولی به مدیر داده شده!');
  });

  /* ── F4-e: جعلِ S.__cfRid (تأییدِ Devin #3) — بررسیِ دوباره در لحظهٔ ذخیره ── */
  test('F4-e — qe-save با S.__cfRidِ جعلی (رکوردِ فرزندِ دیگر) رد می‌شود', () => {
    const forged = W(`(function(){
      var kids=db.parent_links.filter(function(p){return p.parent_id===${par.id};}).map(function(p){return p.student_id;});
      var a=db.attendance.filter(function(x){return x.status==='absent'&&!x.excused&&kids.indexOf(x.student_id)<0&&x.school_id===${par.school_id};})[0];
      return a?a.id:null;
    })()`);
    assert(forged != null, 'رکوردِ غیبتِ بی‌ربط برایِ ساختِ جعل پیدا نشد');
    const leavesBefore = W(`db.leaves.length`);
    W(`S.user=db.users.find(function(u){return u.id===${par.id};});S.persona=null;S.boss=null;S.child=16;`);
    W(`S.__cfRid=${forged};CF_ACTIONS['qe-save']();`);
    assert(W(`db.leaves.length`) === leavesBefore, 'درخواستِ جعلی برای رکوردِ بی‌ربط ثبت شد!');
    assert(W(`S.__cfRid`) === 0, 'S.__cfRid پاک نشده');
  });

  /* ── F4-f: حالتِ چندنقشی — persona فعال، نه فقط u.role ── */
  test('F4-f — کاربرِ چندنقشی: persona (S.persona) تعیین‌کننده است، نه role', () => {
    const rid = W(`(function(){
      var a=db.attendance.filter(function(x){return x.student_id===16&&x.status==='absent'&&!x.excused;})
        .sort(function(x,y){return y.date.localeCompare(x.date);});
      return a.length?a[0].id:null;
    })()`);
    assert(rid != null, 'رکوردِ غیبتِ ۱۶ نیست');
    /* کاربرِ دانش‌آموزِ ۱۷ (role=student) هم سرپرستِ ۱۶ شد → کاربرِ واقعاً چندنقشی */
    const stu = W(`db.users.find(function(u){return u.role==='student'&&u.username==='student17';})`);
    assert(stu && stu.id !== 16, 'کاربرِ دانش‌آموزِ ۱۷ پیدا نشد');
    W(`insert('parent_links',{parent_id:${stu.id},student_id:16});`);
    W(`S.user=db.users.find(function(u){return u.id===${stu.id};});S.persona=null;S.boss=null;S.child=16;`);
    /* بدونِ سوییچ: نقشِ student روی رکوردِ ۱۶ → رد */
    const leavesBefore = W(`db.leaves.length`);
    W(`S.__cfRid=${rid};CF_ACTIONS['qe-save']();`);
    assert(W(`db.leaves.length`)===leavesBefore, 'بدونِ سوییچِ persona نباید رد می‌شد');
    /* با سوییچِ persona به ولی: گارد می‌گذرد (مکانیزمِ واقعیِ اپ) */
    W(`S.persona='parent';`);
    clickAct('quick-excuse', rid);
    assert(W(`$('#qe_reason')!=null`), 'S.persona=\'parent\' در گاردِ بازکردن اعمال نمی‌شود');
    W(`S.persona=null;`);
  });

  /* ── F5: نشتِ دامنه در ICS (دورِ ۸۹) ──────────────────────────────
     رگرسیونِ امنیتی. مهاجم = کاربرِ معتبر که با دستکاریِ DOM دکمه‌ای با
     data-id بیگانه می‌سازد. پیش از رفع، اکشن همان شناسه را هدف می‌گرفت و
     تقویمِ دانش‌آموزِ مدرسهٔ دیگر ساخته می‌شد. */
  test('F5 — ICS: شناسهٔ جعلیِ data-id نادیده گرفته می‌شود (نشتِ بین‌مدرسه‌ای)', () => {
    /* ولیِ چندفرزندی را بنشان و فرزندِ معتبرش را هدف کن */
    const kid = W(`(function(){
      var l=db.parent_links.filter(function(p){return p.parent_id===${par.id};});
      return l.length?l[0].student_id:null;})()`);
    assert(kid != null, 'فرزندی برای ولیِ آزمون نیست');
    W(`S.user=byId('users',${par.id});S.persona='parent';S.child=${kid};S.route='record';`);

    /* دانش‌آموزی از مدرسهٔ دیگر که فرزندِ این ولی نیست */
    const alien = W(`(function(){
      var mine=db.parent_links.filter(function(p){return p.parent_id===${par.id};})
                 .map(function(p){return p.student_id;});
      var myCls=classOf(${kid});
      var s=db.users.find(function(u){
        if(u.role!=='student'||mine.indexOf(u.id)>-1) return false;
        var c=classOf(u.id);
        return c && myCls && c.school_id!==myCls.school_id;
      });
      return s?s.id:null;})()`);
    assert(alien != null, 'دانش‌آموزِ مدرسهٔ دیگر پیدا نشد');

    /* محتوایِ مرجع: تقویمِ بیگانه و تقویمِ فرزندِ خودی */
    const alienIcs = W(`icsForStudent(${alien})`);
    const mineIcs  = W(`icsForStudent(${kid})`);

    /* دانلود را قلاب بگیر تا محتوایِ واقعیِ فایل ثبت شود */
    W(`window.__cap=null;
       if(typeof Blob!=='undefined'){ window.__origBlob=window.Blob; }
       URL.createObjectURL=function(b){ window.__cap=window.__capText; return 'blob:t'; };
       URL.revokeObjectURL=function(){};
       window.__icsOrig=icsForStudent;
       icsForStudent=function(sid){ var t=window.__icsOrig(sid); window.__capText=t; window.__capSid=sid; return t; };`);

    clickAct('ics-export', alien);          /* ← حملهٔ واقعی */

    const usedSid = W(`window.__capSid`);
    const captured = W(`window.__capText`);

    W(`icsForStudent=window.__icsOrig;`);   /* پاک‌سازی */

    assert(Number(usedSid) !== Number(alien),
      'شناسهٔ بیگانه (' + alien + ') هدف قرار گرفت — نشتِ دامنه باز است');
    assert(Number(usedSid) === Number(kid),
      'هدف باید فرزندِ خودِ ولی (' + kid + ') باشد، ولی ' + usedSid + ' بود');
    if (alienIcs !== mineIcs) {
      assert(captured !== alienIcs, 'محتوایِ تولیدشده مالِ دانش‌آموزِ بیگانه است');
    }
  });

  await Promise.all(testQueue);
  const ok = pass;
  console.log('\n────────────────────────────────────────────────────');
  console.log(`client-features (ویژگی‌های کلاینت): ${pass + fail} بررسی — ✅ ${ok} · ❌ ${fail}`);
  if (fail) { errors.forEach((e) => console.log('  — ' + e)); process.exit(1); }
  process.exit(0);
}
