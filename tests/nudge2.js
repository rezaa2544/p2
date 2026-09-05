#!/usr/bin/env node

/**
 * سئوتِ یادآوری به دبیر (دور ۶۵ بند N2):
 *  - کارتِ مدیر: کلاس‌های ثبت‌نشدهٔ زنگِ جاری + دکمهٔ یادآوری
 *  - گاردها: فقط زنگِ جاری · ضداسپم · کلاسِ کامل ثبت‌شده
 *  - بنرِ دبیر + پاسخ‌ها (ok-now با پیش‌گزینشِ کلاس)
 *  - لایهٔ سوم: رکوردِ صفِ پیامک ۵ دقیقه بعد با source_ref یکتا
 *
 * اجرا:  node tests/nudge2.js   (نیازمند jsdom)
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

console.log('\n▸ یادآوری به دبیر (دور ۶۵)');

/* ۲۰۲۶-۰۹-۰۵ شنبه ۰۹:۰۵ = زنگ ۲ (۸:۲۵–۰۹:۱۰) — کلاس ۱ دبیر ۶ */
const P2 = "new Date('2026-09-05T09:05:00')";

test('N1 — دادهٔ پایه: کلاسی در زنگ ۲ که هنوز کامل ثبت نشده', () => {
  /* دانش‌آموزِ تازه در کلاس ۱ بدونِ حضورِ امروز → کلاس ۱ ناقص می‌شود */
  const mk = W(`(function(){
    var st=insert('users',{school_id:1,role:'student',full_name:'فرزند نادل',username:'nudge_stu_'+Date.now(),active:1});
    insert('enrollments',{student_id:st.id,class_id:1});
    return st.id;})()`);
  global.__nstu = mk;
  const done = W(`classAttDone(1, todayISO())`);
  assert(done === false, 'کلاس ۱ باید ناقص باشد (دانش‌آموزِ تازه)');
  const list = W(`unattendedClasses(1,${P2})`);
  assert(list.some(c=>c.classId===1), 'کلاس ۱ در فهرستِ ثبت‌نشده نیست');
  const c1 = list.find(c=>c.classId===1);
  assert(c1.teacherId === 6, 'دبیرِ کلاس ۱ در زنگ ۲ باید ۶ باشد');
  global.__nlist = list.length;
});

test('N2 — یادآوری: رکورد + اعلان برای دبیر', () => {
  const r = W(`nudgeTeacher({schoolId:1,classId:1,teacherId:6,period:2,dateISO:todayISO(),by:1,now:${P2}})`);
  assert(r.ok, 'یادآوری شکست خورد: ' + r.msg);
  const nu = W(`byId('nudges',${r.nudge})`);
  assert(nu.status === 'pending', 'وضعیتِ یادآور باید pending باشد');
  const n = W(`db.notifications.filter(x=>x.type==='attendance_nudge'&&x.user_id===6).length`);
  assert(n >= 1, 'اعلان برای دبیر ساخته نشد');
  global.__nu = r.nudge;
});

test('N3 — گاردها: تکرارِ در انتظار رد می‌شود + زنگِ غیرجاری رد می‌شود', () => {
  const r2 = W(`nudgeTeacher({schoolId:1,classId:1,teacherId:6,period:2,dateISO:todayISO(),by:1,now:${P2}})`);
  assert(!r2.ok, 'تکرارِ یادآورِ در انتظار نباید اجازه داشته باشد');
  const r3 = W(`nudgeTeacher({schoolId:1,classId:1,teacherId:6,period:3,dateISO:todayISO(),by:1,now:${P2}})`);
  assert(!r3.ok, 'زنگِ غیرجاری (زنگ ۳ در حالی که زنگ ۲ است) باید رد شود');
});

test('N4 — بنرِ دبیر: نمایش + دکمهٔ «حالا ثبت می‌کنم» با پیش‌گزینشِ کلاس', () => {
  W(`S.user=byId('users',6);S.persona=null;S.boss=null;S.bellNow=${P2};S.route='attendance';S.filters={};S.page=1;render()`);
  const h = W(`document.querySelector('.main').innerHTML`);
  assert(h.indexOf('مدیر یادآوری کرد') > -1, 'بنرِ دبیر نیست');
  assert(h.indexOf('حالا ثبت می‌کنم') > -1, 'دکمهٔ ثبتِ فوری نیست');
  /* کلیک: پیش‌گزینشِ کلاس ۱ در فیلتر + پاسخِ replied */
  W(`document.querySelector('[data-act="nudge-reply"][data-r="ok-now"]').click()`);
  assert(W(`S.filters.class`) === 1, 'کلاس پیش‌گزینش نشد (میان‌برِ دبیر)');
  const nu = W(`byId('nudges',${global.__nu})`);
  assert(nu.status === 'replied' && nu.reply === 'ok-now', 'پاسخ ثبت نشد');
});

test('N5 — کارتِ مدیر: کلاسِ ناقص با دکمهٔ یادآوری + وضعیت', () => {
  /* کلاس ۱ هنوز ناقص است (فرزندِ نادل)؛ بنرِ قبلی پاسخ داده شد → دکمهٔ یادآوری دوباره */
  const mgr = W(`db.users.find(u=>u.role==='manager'&&u.school_id===1).id`);
  W(`S.user=byId('users',${mgr});S.persona=null;S.boss=null;S.bellNow=${P2};S.route='attendance';S.filters={};S.page=1;render()`);
  let h = W(`document.querySelector('.main').innerHTML`);
  assert(h.indexOf('کلاس ثبت نشده') > -1, 'کارتِ مدیر نیست');
  /* کلاسِ ۱ را کامل می‌کنیم → باید از فهرست برود */
  W(`insert('attendance',{school_id:1,class_id:1,student_id:${global.__nstu},date:todayISO(),status:'present'})`);
  W(`render()`);
  h = W(`document.querySelector('.main').innerHTML`);
  /* اگر کلاس ۱ تنها کلاسِ ناقص بود، حالا «همهٔ کلاس‌ها ثبت شده» */
  const unatt = W(`unattendedClasses(1,${P2}).filter(c=>c.classId===1).length`);
  assert(unatt === 0, 'کلاس ۱ بعد از ثبتِ کامل نباید در فهرست باشد');
});

test('N6 — مهلتِ ۱۰ دقیقه: بعد از پاسخِ ۳ دقیقهٔ پیش، یادآوریِ دوباره رد می‌شود', () => {
  /* کلاس ۲ را ناقص می‌کنیم تا گاردِ ضداسپم روی همان کلاس تست شود */
  const mk2 = W(`(function(){
    var row=db.schedule.filter(r=>r.school_id===1&&r.day===0&&Number(r.period)===2)[1];
    var st=insert('users',{school_id:1,role:'student',full_name:'فرزند نادل ۲',username:'nudge_stu2_'+Date.now(),active:1});
    insert('enrollments',{student_id:st.id,class_id:row.class_id});
    return {cls:row.class_id, t:row.teacher_id, st:st.id};})()`);
  global.__n2 = mk2;
  const r1 = W(`nudgeTeacher({schoolId:1,classId:${mk2.cls},teacherId:${mk2.t},period:2,dateISO:todayISO(),by:1,now:${P2}})`);
  assert(r1.ok, 'یادآورِ نخست شکست خورد: ' + r1.msg);
  /* پاسخ + برگرداندنِ ساعت به ۳ دقیقهٔ پیش */
  W(`nudgeReply(${r1.nudge},'later')`);
  W(`(function(){var n=byId('nudges',${r1.nudge});var d=new Date(Date.parse(n.created_at)-3*60000);n.created_at=d.toISOString();})()`);
  const r2 = W(`nudgeTeacher({schoolId:1,classId:${mk2.cls},teacherId:${mk2.t},period:2,dateISO:todayISO(),by:1,now:${P2}})`);
  assert(!r2.ok, 'در مهلتِ ۱۰ دقیقهٔ ضداسپم نباید دوباره یادآوری شود');
  /* ۱۱ دقیقهٔ پیش → دوباره مجاز */
  W(`(function(){var n=byId('nudges',${r1.nudge});var d=new Date(Date.parse(n.created_at)-8*60000);n.created_at=d.toISOString();})()`);
  const r3 = W(`nudgeTeacher({schoolId:1,classId:${mk2.cls},teacherId:${mk2.t},period:2,dateISO:todayISO(),by:1,now:${P2}})`);
  assert(r3.ok, 'بعد از ۱۱ دقیقه باید دوباره یادآوری شود');
});

test('N7 — لایهٔ پیامک: ۵ دقیقه بعد رکوردِ صف + بدون تکرار', () => {
  const nu = W(`(function(){
    var l=(db.nudges||[]).filter(n=>n.class_id===${global.__n2.cls}&&n.status==='pending');
    return l[l.length-1].id;})()`);
  /* ۶ دقیقه برمی‌گردانیم و تیک می‌زنیم */
  W(`(function(){var n=byId('nudges',${nu});var d=new Date(Date.parse(n.created_at)-6*60000);n.created_at=d.toISOString();})()`);
  W(`_nudgeTickAt=0;nudgeTick()`);
  let n1 = W(`(db.teacher_sms||[]).filter(x=>x.source_ref==='nudge_${nu}').length`);
  assert(n1 === 1, 'رکوردِ صفِ پیامک ساخته نشد');
  assert(W(`byId('nudges',${nu}).sms_sent`) === 1, 'sms_sent ثبت نشد');
  /* تکرار تیک = بدون تکرارِ رکورد */
  W(`_nudgeTickAt=0;nudgeTick()`);
  n1 = W(`(db.teacher_sms||[]).filter(x=>x.source_ref==='nudge_${nu}').length`);
  assert(n1 === 1, 'رکوردِ پیامک تکرار شد');
  /* پیامک برای یادآورِ تازه (کمتر از ۵ دقیقه) نمی‌رود */
  const fresh = W(`(function(){
    var l=(db.nudges||[]).filter(n=>n.class_id===${global.__n2.cls}&&n.status==='pending'&&n.sms_sent===0);
    return l.length?l[l.length-1].id:0;})()`);
  if(fresh){
    W(`_nudgeTickAt=0;nudgeTick()`);
    assert(W(`(db.teacher_sms||[]).filter(x=>x.source_ref==='nudge_${fresh}').length`) === 0, 'یادآورِ تازه‌تر از ۵ دقیقه نباید پیامک بگیرد');
  }
});

test('N8 — گاردِ در انتظار: ۱۱ دقیقهٔ پیش ولی هنوز pending → رد می‌شود', () => {
  /* نوسازِ کلاس ۲: یادآورِ قدیمی (۱۱ دقیقه) اما pending */
  const nu = W(`(function(){
    var l=(db.nudges||[]).filter(n=>n.class_id===${global.__n2.cls}&&n.status==='pending');
    return l[l.length-1].id;})()`);
  W(`(function(){var n=byId('nudges',${nu});var d=new Date(Date.parse(n.created_at)-11*60000);n.created_at=d.toISOString();n.sms_sent=0;})()`);
  const r = W(`nudgeTeacher({schoolId:1,classId:${global.__n2.cls},teacherId:${global.__n2.t},period:2,dateISO:todayISO(),by:1,now:${P2}})`);
  assert(!r.ok, 'یادآورِ pendingِ قدیمی نباید تکرار شود (گاردِ در انتظار)');
});

test('N9 — لایهٔ پیامک: رکوردِ موجود بدونِ sms_sent → تکرار نمی‌شود', () => {
  const nu = W(`(function(){
    var l=(db.nudges||[]).filter(n=>n.class_id===${global.__n2.cls}&&n.status==='pending');
    var n=l[l.length-1];
    var d=new Date(Date.parse(n.created_at)-6*60000);n.created_at=d.toISOString();
    n.sms_sent=0;
    (db.teacher_sms||[]).some(x=>x.source_ref==='nudge_'+n.id);
    return n.id;})()`);
  /* اگر رکوردِ پیامک نباشد، این بار ساخته می‌شود؛ دوباره ۶ دقیقه + تیک → باز هم یک */
  W(`_nudgeTickAt=0;nudgeTick()`);
  let c = W(`(db.teacher_sms||[]).filter(x=>x.source_ref==='nudge_${nu}').length`);
  assert(c === 1, 'رکورد ساخته نشد (c=' + c + ')');
  W(`(function(){var n=byId('nudges',${nu});n.sms_sent=0;var d=new Date(Date.parse(n.created_at)-6*60000);n.created_at=d.toISOString();})()`);
  W(`_nudgeTickAt=0;nudgeTick()`);
  c = W(`(db.teacher_sms||[]).filter(x=>x.source_ref==='nudge_${nu}').length`);
  assert(c === 1, 'رکوردِ موجود بدونِ sms_sent تکرار شد (c=' + c + ')');
});

await Promise.all(testQueue);
const total = pass + fail;
console.log('\n' + '─'.repeat(52));
console.log(`یادآوری دبیر: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
if (consoleErrors.length) {
  console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
  consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
}
console.log('─'.repeat(52) + '\n');
dom.window.close();
process.exit(fail ? 1 : 0);
}
