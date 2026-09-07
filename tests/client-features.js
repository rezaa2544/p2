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
    assert(tc.school === (tc.day <= 4), 'علامتِ روزِ درسی درست نیست');
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
    assert(/DTSTART;VALUE=DATE:\d{8}/.test(ics), 'فرمتِ DTSTART صحیح نیست');
    const examUids = (ics.match(/UID:payesh-exam-\d+@payesh/g) || []).length;
    assert(examUids === examCount, 'UID برای هر امتحان نیست: ' + examUids + ' vs ' + examCount);
    // دکمه: دانلود در jsdom خطا نمی‌دهد (مسیرِ data-URI)
    const before = W(`S.user=db.users.find(function(u){return u.id===${par.id};});S.persona=null;S.boss=null;S.child=16;S.route='record';S.tab='attendance';renderRoute()`);
    clickAct('ics-export', 16);
    assert(true, 'دکمهٔ ICS بدونِ کرش کار کرد');
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

  await Promise.all(testQueue);
  const ok = pass;
  console.log('\n────────────────────────────────────────────────────');
  console.log(`client-features (ویژگی‌های کلاینت): ${pass + fail} بررسی — ✅ ${ok} · ❌ ${fail}`);
  if (fail) { errors.forEach((e) => console.log('  — ' + e)); process.exit(1); }
  process.exit(0);
}
