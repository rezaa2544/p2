#!/usr/bin/env node

/**
 * سئوتِ زنگِ زنده (دور ۶۵):
 *  - کارتِ زندهٔ ولی: زنگِ جاری + کلاس + اسم دبیر + حضورِ امروز
 *  - همیشه رایگان (حتی فرزندِ اشتراکِ منقضی)
 *  - بدونِ برنامهٔ زنگ: ساعتِ خیالی نشان داده نمی‌شود
 *  - تیکِ زنده: بروزرسانیِ جزئی بدونِ رندرِ کامل
 *
 * اجرا:  node tests/bell2.js   (نیازمند jsdom)
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

console.log('\n▸ زنگِ زنده (دور ۶۵)');

/* ۲۰۲-۰۹-۵ شنبه است: زنگ ۱ = ۰۷:۳۰–۰۸:۱۵ · تفریح · زنگ ۲ = ۸:۲۵–۰۹:۱۰ */
/* REF = newest demo school day (Sat–Wed) that is NOT a virtual day for any
   school (the demo generates virtual-day rows on recent dates, incl. today).
   The bell pattern is the same every school day, so 09:05/10:00 hit the same
   bells on any of them — REF must not be a calendar constant (it would rot). */
const REF = W(`(function(){
  for(let back=0; back<5; back++){
    var d=new Date(); d.setDate(d.getDate()-back);
    var w=d.getDay(); if(!(w===0||w===1||w===2||w===3||w===6)) continue;
    var p=function(n){return String(n).padStart(2,'0');};
    var iso=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
    var modes=(db.attendance_modes||[]).filter(function(m){return m.date===iso;});
    if(modes.length===0) return iso;
  }
  return todayISO();
})()`);
const T_P2 = "new Date('" + REF + "T09:05:00')";
const T_P3 = "new Date('" + REF + "T10:00:00')";
const T_FRI = "new Date('2026-09-11T10:00:00')"; /* fixed Friday — always Friday */
/* schedule day of REF (app: Sat=0..Fri=6) — the bell pattern is the same every school day, but the demo assigns different teachers per weekday */
const REFDAY = W(`(function(){
  var p='${REF}'.split('-');
  var w=new Date(+p[0], +p[1]-1, +p[2]).getDay();
  return (w+1)%7;
})()`);
const TODAY_OK_FOR_LIVE_TICK = W(`(function(){
  var w=new Date().getDay(); if(!(w===0||w===1||w===2||w===3||w===6)) return false;
  return !(db.attendance_modes||[]).some(function(m){return m.date===todayISO()&&m.school_id===1;});
})()`);

test('B1 — کارتِ ولی: هر سه فرزند + اسم دبیرِ زنگِ جاری', () => {
  const who = W(`(function(){
    var par=db.users.find(u=>u.username==='parent_multi');
    var kids=db.parent_links.filter(p=>p.parent_id===par.id).map(p=>p.student_id);
    return {par:par.id, kids:kids,
      names:kids.map(k=>byId('users',k).full_name),
      t6:(function(){var c=classOf(16);
        var r=db.schedule.filter(function(x){return c&&x.class_id===c.id&&x.day===${REFDAY}&&Number(x.period)===2;})[0];
        return r?(byId('users',r.teacher_id)||{}).full_name:null;})(),
      c16:(classOf(16)||{}).name};
  })()`);
  W(`S.user=byId('users',${who.par});S.persona=null;S.boss=null;`);
  const htmlCard = W(`familyBellCards(${T_P2})`);
  assert(htmlCard.indexOf('data-bell-live="family"') > -1, 'ریشهٔ زنده نیست');
  assert(htmlCard.indexOf(who.names[0]) > -1, 'فرزندِ اول نیست');
  assert(htmlCard.indexOf(who.names[1]) > -1, 'فرزندِ دوم نیست');
  assert(htmlCard.indexOf(who.names[2]) > -1, 'فرزندِ سوم نیست');
  assert(htmlCard.indexOf(who.c16) > -1, 'کلاسِ فرزند نیست');
  assert(htmlCard.indexOf(who.t6) > -1, 'اسم دبیرِ زنگِ جاری نیست (بندِ «ولی اسم دبیر رو ببینه»)');
  assert(htmlCard.indexOf('همیشه رایگان') > -1, 'برچسبِ رایگان نیست');
});

test('B2 — اسم دبیر با عوضِ زنگ عوض می‌شود', () => {
  const n2 = W(`(function(){
    var c=(classOf(16)||{}).id;
    var r=db.schedule.filter(x=>x.class_id===c&&x.day===${REFDAY}&&Number(x.period)===2)[0];
    return r?byId('users',r.teacher_id).full_name:null;})()`);
  const n3 = W(`(function(){
    var c=(classOf(16)||{}).id;
    var r=db.schedule.filter(x=>x.class_id===c&&x.day===${REFDAY}&&Number(x.period)===3)[0];
    return r?byId('users',r.teacher_id).full_name:null;})()`);
  assert(n2 && n3 && n2 !== n3, 'دبیرهای زنگ ۲ و ۳ در دادهٔ نمونه فرق دارند');
  const s2 = W(`childNowStatus(16,${T_P2})`);
  assert(s2.teacherName === n2, 'دبیرِ زنگ ۲ درست نیست');
  const s3 = W(`childNowStatus(16,${T_P3})`);
  assert(s3.teacherName === n3, 'دبیرِ زنگ ۳ درست نیست');
});

test('B3 — حضورِ امروز: سه وضعیت + ثبت‌نشده', () => {
  /* فرزندِ ۱۶ در دادهٔ نمونه امروز «دیر» ثبت شده */
  W(`(function(){var a=db.attendance.filter(x=>x.student_id===16&&x.date==='${REF}');if(a[0]){a[0].status='late';}else{insert('attendance',{school_id:1,student_id:16,date:'${REF}',status:'late'});}})()`);
  const a16 = W(`(function(){var a=db.attendance.filter(x=>x.student_id===16&&x.date==='${REF}')[0];return a?a.status:null;})()`);
  assert(a16 === 'late', 'پیش‌فرضِ دادهٔ نمونه: فرزندِ ۱۶ دیر کرده');
  const c16 = W(`familyBellCardHTML(childNowStatus(16,${T_P2}))`);
  assert(c16.indexOf('⏰ دیر') > -1, 'وضعیتِ دیر نمایش داده نشده');
  /* ساختِ دو فرزندِ جدید: حاضر و ثبت‌نشده */
  const mk = W(`(function(){
    var sid=db.schools[0].id;
    var st=insert('users',{school_id:sid,role:'student',full_name:'فرزند تست حاضر',username:'bell_ok_'+Date.now(),active:1});
    var st2=insert('users',{school_id:sid,role:'student',full_name:'فرزند تست ثبت‌نشده',username:'bell_none_'+Date.now(),active:1});
    insert('attendance',{school_id:sid,student_id:st.id,date:'${REF}',status:'present'});
    return {st:st.id,st2:st2.id};})()`);
  const cok = W(`familyBellCardHTML(childNowStatus(${mk.st},${T_P2}))`);
  assert(cok.indexOf('✅ حاضر') > -1, 'وضعیتِ حاضر نمایش داده نشده');
  const cnone = W(`familyBellCardHTML(childNowStatus(${mk.st2},${T_P2}))`);
  assert(cnone.indexOf('ثبت نشده') > -1, 'وضعیتِ ثبت‌نشده نمایش داده نشده');
});

test('B4 — مدرسهٔ بدونِ برنامهٔ زنگ: ساعتِ خیالی نمی‌دهد', () => {
  const mk = W(`(function(){
    var noschool=db.schools.find(s=>!(db.bell_schedules||[]).some(b=>b.school_id===s.id));
    if(!noschool) return null;
    var st=insert('users',{school_id:noschool.id,role:'student',full_name:'فرزند بدونِ زنگ',username:'bell_ns_'+Date.now(),active:1});
    var par=insert('users',{school_id:noschool.id,role:'parent',full_name:'ولی بدونِ زنگ',username:'bell_nsp_'+Date.now(),active:1});
    insert('parent_links',{parent_id:par.id,student_id:st.id,relation:'مادر'});
    return {par:par.id,st:st.id};})()`);
  assert(mk, 'مدرسهٔ بدونِ برنامهٔ زنگ پیدا نشد');
  W(`S.user=byId('users',${mk.par});S.persona=null;S.boss=null;`);
  const h = W(`familyBellCards(${T_P2})`);
  assert(h.indexOf('فرزند بدونِ زنگ') > -1, 'کارتِ فرزند نیست');
  assert(h.indexOf('ثبت نکرده') > -1, 'پیامِ «برنامهٔ زنگ ثبت نشده» نیست');
  assert(h.indexOf('زنگ ۱') === -1 && h.indexOf('07:30') === -1 && h.indexOf('۷:۳۰') === -1, 'ساعتِ خیالیِ پیش‌فرض نشان داده شده!');
});

test('B5 — جمعه (روزِ غیردرسی): «امروز روز درسی نیست»', () => {
  W(`S.user=byId('users',${W(`db.users.find(u=>u.username==='parent_multi').id`)});S.persona=null;S.boss=null;`);
  const h = W(`familyBellCards(${T_FRI})`);
  assert(h.indexOf('روز درسی نیست') > -1, 'پیامِ تعطیلی نیست');
});

test('B6 — خودِ دانش‌آموز هم کارتِ زنده می‌بیند', () => {
  W(`S.user=byId('users',16);S.persona=null;S.boss=null;`);
  const h = W(`familyBellCards(${T_P2})`);
  assert(h.indexOf('data-bell-live="family"') > -1, 'کارت برای دانش‌آموز ساخته نشده');
  assert(h.indexOf((W(`byId('users',16).full_name`))) > -1, 'نامِ دانش‌آموز نیست');
  W(`S.user=null;`);
});

test('B7 — تیکِ زنده: تغییرِ حضور، بدونِ رندرِ کامل، به DOM می‌رسد', () => {
  if(!TODAY_OK_FOR_LIVE_TICK){ console.log('     (skipped: today is not a clean school day for school 1 — the live tick follows the real clock)'); return; }
  /* ولی و فرزندِ تازه (یک‌فرزند) تا آزمون به دادهٔ نمونه وابسته نباشد */
  const mk = W(`(function(){
    var sid=db.schools[0].id;
    var st=insert('users',{school_id:sid,role:'student',full_name:'فرزند تیک زنده',username:'bell_tick_'+Date.now(),active:1});
    var par=insert('users',{school_id:sid,role:'parent',full_name:'ولی تیک زنده',username:'bell_tickp_'+Date.now(),active:1});
    insert('parent_links',{parent_id:par.id,student_id:st.id,relation:'پدر'});
    insert('attendance',{school_id:sid,student_id:st.id,date:todayISO(),status:'late'});
    return {par:par.id,st:st.id};})()`);
  W(`S.user=byId('users',${mk.par});S.persona=null;S.boss=null;S.route='dashboard';S.tab='';S.filters={};S.page=1;render()`);
  const root = W(`document.querySelector('[data-bell-live="family"]')`);
  assert(root, 'ریشهٔ زنده در DOM نیست');
  assert(root.innerHTML.indexOf('⏰ دیر') > -1, 'حضورِ اولیه (دیر) در DOM نیست');
  /* حضور را عوض می‌کنیم و فقط تیک می‌زنیم (نه render) */
  W(`db.attendance.filter(a=>a.student_id===${mk.st}&&a.date===todayISO()).forEach(a=>a.status='absent');bellLiveTick()`);
  const after = W(`document.querySelector('[data-bell-live="family"]').innerHTML`);
  assert(after.indexOf('❌ غایب') > -1, 'تیکِ زنده DOM را به‌روز نکرده');
  assert(after.indexOf('⏰ دیر') === -1, 'وضعیتِ قدیمی هنوز در DOM است');
});

test('B8 — رایگان بودن: فرزندِ اشتراکِ منقضی هم روی کارتِ زنده است', () => {
  const info = W(`(function(){
    var par=db.users.find(u=>u.username==='parent_multi');
    var subs=(db.parent_subscriptions||[]).filter(s=>s.user_id===par.id);
    var expired=subs.find(s=>s.status==='expired');
    if(!expired) return null;
    return {kid:expired.student_id, name:byId('users',expired.student_id).full_name};
  })()`);
  assert(info, 'فرزندِ منقضی‌اشته در دادهٔ نمونه پیدا نشد');
  const par = W(`db.users.find(u=>u.username==='parent_multi').id`);
  W(`S.user=byId('users',${par});S.persona=null;S.boss=null;`);
  const h = W(`familyBellCards(${T_P2})`);
  assert(h.indexOf(info.name) > -1, 'فرزندِ منقضی از کارتِ زنده حذف شده — کارت باید رایگان بماند');
});

await Promise.all(testQueue);
const total = pass + fail;
console.log('\n' + '─'.repeat(52));
console.log(`زنگ زنده: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
if (consoleErrors.length) {
  console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
  consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
}
console.log('─'.repeat(52) + '\n');
dom.window.close();
process.exit(fail ? 1 : 0);
}
