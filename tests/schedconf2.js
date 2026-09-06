#!/usr/bin/env node
/**
 * تست‌های کنترلِ تداخلِ برنامهٔ هفتگی (بند ۶.۵ نسخهٔ سبک)
 *  - شناساییِ تداخلِ دبیر (سراسری: حتی بین مدرسه) و تداخلِ کلاس
 *  - پیشنهادِ جایِ آزاد (فقط روزهای کاری + کلاس و دبیر آزاد)
 *  - جابه‌جایی از UI با گاردِ لحظهٔ اجرا
 *  - دبیر فقط اطلاع می‌بیند (بدون دکمهٔ جابه‌جایی)
 *
 * اجرا:  node tests/schedconf2.js   (نیازمند jsdom)
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); resolve(); return; }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
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
const asMgr = (uid) => W(`(function(){
  S.user=byId('users',${uid});S.persona=null;S.boss=null;
  S.filters={};S.route='schedule';S.tab='';render();
})()`);

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(400);
console.log('\n▸ کنترلِ تداخلِ برنامه (بند ۶.۵ سبک)');

const ctx = W(`(function(){
  var m1=db.users.find(function(u){return u.role==='manager'&&u.school_id===1;});
  var m2=db.users.find(function(u){return u.role==='manager'&&u.school_id===2;});
  /* دبیرِ تازهٔ بدونِ برنامه (برای اینکه جایِ آزادِ واقعی داشته باشیم) */
  var nt=add('users',{school_id:1,role:'teacher',full_name:'دبیر تست تداخل',national_id:'9990001112220',phone:'09990001112',active:1,created_at:'2026-09-01'});
  var cA=add('classes',{school_id:1,name:'کلاس تست الف',grade:'هشتم'});
  var cB=add('classes',{school_id:1,name:'کلاس تست ب',grade:'هشتم'});
  return {m1:m1.id,m2:m2.id,t:nt.id,cA:cA.id,cB:cB.id,
    sub1:db.subjects[0].id,sub2:db.subjects[1].id};
})()`);

test('C0 بوت بدون خطا + حالتِ بدونِ تداخل', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  assert(W(`scheduleConflicts(1).length`) === 0, 'دمو باید بدونِ تداخل باشد');
  asMgr(ctx.m1);
  const r = W(`document.getElementById('root').innerHTML`);
  assert(r.indexOf('بدون تداخل') > -1, 'نشانِ سبزِ «بدون تداخل» نیست');
});

test('C1 تداخلِ دبیر شناسایی می‌شود (دو کلاس، یک زنگ)', () => {
  const ra = W(`add('schedule',{school_id:1,class_id:${ctx.cA},subject_id:${ctx.sub1},teacher_id:${ctx.t},day:1,period:2}).id`);
  const rb = W(`add('schedule',{school_id:1,class_id:${ctx.cB},subject_id:${ctx.sub2},teacher_id:${ctx.t},day:1,period:2}).id`);
  W(`window.__c1={ra:${ra},rb:${rb}}`);
  const c = W(`scheduleConflicts(1)`);
  const tconf = c.find(x=>x.kind==='teacher'&&x.teacher_id===ctx.t);
  assert(!!tconf, 'تداخلِ دبیر پیدا نشد');
  assert(tconf.rows.length === 2, 'دو زنگِ متداخل نیست');
  asMgr(ctx.m1);
  const r = W(`document.getElementById('root').innerHTML`);
  assert(r.indexOf('تداخل در برنامه') > -1, 'بنرِ تداخل رندر نشد');
  assert(r.indexOf('sched-conf-sug') > -1, 'دکمهٔ پیشنهاد نیست');
});

test('C2 تداخلِ کلاس شناسایی می‌شود (دو درس، یک کلاس، یک زنگ)', () => {
  const rc1 = W(`add('schedule',{school_id:1,class_id:${ctx.cA},subject_id:${ctx.sub1},teacher_id:${ctx.t},day:2,period:4}).id`);
  const rc2 = W(`add('schedule',{school_id:1,class_id:${ctx.cA},subject_id:${ctx.sub2},teacher_id:${ctx.t},day:2,period:4}).id`);
  W(`window.__c2={rc1:${rc1},rc2:${rc2}}`);
  const c = W(`scheduleConflicts(1)`);
  const cconf = c.find(x=>x.kind==='class'&&x.class_id===ctx.cA&&x.day===2&&x.period===4);
  assert(!!cconf, 'تداخلِ کلاس پیدا نشد');
  assert(cconf.rows.length === 2, 'دو درسِ متداخل نیست');
});

test('C3 تداخلِ بین‌مدرسه‌ایِ دبیر هم دیده می‌شود', () => {
  /* دبیرِ تست را به کلاسِ مدرسهٔ ۲ هم می‌رسانیم — در همان روز/زنگِ دیگر */
  const c2cls = W(`db.classes.find(function(c){return c.school_id===2;}).id`);
  const rx = W(`add('schedule',{school_id:2,class_id:${c2cls},subject_id:${ctx.sub1},teacher_id:${ctx.t},day:1,period:3}).id`);
  /* حالا در مدرسهٔ ۱ یک زنگِ هم‌ساعتی با همان زنگِ مدرسهٔ ۲ می‌سازیم */
  const ry = W(`add('schedule',{school_id:1,class_id:${ctx.cB},subject_id:${ctx.sub2},teacher_id:${ctx.t},day:1,period:3}).id`);
  W(`window.__c3={rx:${rx},ry:${ry}}`);
  const c1 = W(`scheduleConflicts(1)`);
  const tconf = c1.find(x=>x.kind==='teacher'&&x.teacher_id===ctx.t&&x.day===1&&x.period===3);
  assert(!!tconf, 'تداخلِ بین‌مدرسه در مدرسهٔ ۱ دیده نشد');
  assert(tconf.rows.length === 2, 'ردیفِ مدرسهٔ ۲ در تداخل نیست');
  const cross = tconf.rows.some(function(x){return x.school_id===2;});
  assert(cross === true, 'ردیفِ مدرسهٔ دیگر در فهرستِ تداخل نیست');
});

test('C4 پیشنهادها معتبرند: روزِ کاری + کلاس و دبیر آزاد + حداکثر ۳', () => {
  const c = W(`scheduleConflicts(1)`);
  const tconf = c.find(x=>x.kind==='teacher'&&x.teacher_id===ctx.t&&x.day===1&&x.period===2);
  assert(!!tconf, 'تداخلِ C1 هنوز هست');
  /* روزِ صفرِ دبیر را با کلاسِ «ب» پُر می‌کنیم تا پیشنهادِ سالم فقط از
     روزهای دیگر بیاید؛ جهشِ M2 (نادیده‌گرفتنِ مشغولیت) در روزِ صفر می‌شکند */
  for (let p = 1; p <= 6; p++) {
    W(`add('schedule',{school_id:1,class_id:${ctx.cB},subject_id:${ctx.sub2},teacher_id:${ctx.t},day:0,period:${p}})`);
  }
  const rowId = tconf.rows[0].id;
  const sugs = W(`suggestSlots(${rowId})`);
  assert(Array.isArray(sugs) && sugs.length > 0, 'برای دبیرِ سبک پیشنهاد باید باشد: ' + JSON.stringify(sugs));
  assert(sugs.length <= 3, 'بیش از ۳ پیشنهاد');
  const workdays = W(`workDaysOf(1)`);
  sugs.forEach(function(g){
    assert(workdays.indexOf(g.day) > -1 && g.day <= 4, 'پیشنهاد روی روزِ غیرکاری/خارجِ جدول: ' + JSON.stringify(g));
    assert(g.period >= 1 && g.period <= 6, 'زنگِ نامعتبر');
    assert(!(g.day === 1 && g.period === 2), 'همان زنگِ متداخل پیشنهاد شد!');
  });
  /* کلاس و دبیر در مقصدها واقعاً آزاد باشند */
  const row = W(`byId('schedule',${rowId})`);
  sugs.forEach(function(g){
    const clsBusy = W(`db.schedule.some(function(x){return x.class_id===${row.class_id}&&x.day===${g.day}&&x.period===${g.period}&&x.id!==${row.id};})`);
    const tBusy = W(`teacherBusyAt(${row.teacher_id},${g.day},${g.period},${row.id})`);
    assert(!clsBusy && !tBusy, 'مقصدِ پیشنهاد پر است: ' + JSON.stringify(g));
  });
});

test('C5 جابه‌جایی از UI: تداخل برطرف + گاردِ لحظهٔ اجرا', () => {
  const c = W(`scheduleConflicts(1)`);
  const tconf = c.find(x=>x.kind==='teacher'&&x.teacher_id===ctx.t&&x.day===1&&x.period===2);
  const rowId = tconf.rows[0].id;
  asMgr(ctx.m1);
  /* دکمهٔ پیشنهاد را بزنیم */
  const btn = W(`(function(){
    var btns=Array.from(document.querySelectorAll('[data-act="sched-conf-sug"]'));
    var b=btns.find(function(x){return x.dataset.sid===String(${rowId});});
    if(!b)return false;
    b.click();
    var d=document.getElementById('conf-sug-'+b.dataset.key.replace(/[^a-z0-9]/gi,'')+'-'+b.dataset.sid);
    return d&&d.style.display!=='none';
  })()`);
  assert(btn === true, 'پنلِ پیشنهاد باز نشد');
  const mv = W(`document.querySelector('[data-act="sched-conf-move"][data-sid="${rowId}"]')`);
  assert(!!mv, 'دکمهٔ جا‌به‌جایی نیست');
  const before = W(`byId('schedule',${rowId})`);
  const tgtDay = W(`Number(document.querySelector('[data-act="sched-conf-move"][data-sid="${rowId}"]').dataset.day)`);
  const tgtPer = W(`Number(document.querySelector('[data-act="sched-conf-move"][data-sid="${rowId}"]').dataset.period)`);
  /* گارد: مقصد را دستی پر کنیم تا جابه‌جایی رد شود */
  const block = W(`add('schedule',{school_id:1,class_id:${ctx.cB},subject_id:${ctx.sub1},teacher_id:${ctx.t},day:${tgtDay},period:${tgtPer}}).id`);
  W(`document.querySelector('[data-act="sched-conf-move"][data-sid="${rowId}"]').click()`);
  const blocked = W(`byId('schedule',${rowId})`);
  assert(blocked.day === before.day && blocked.period === before.period, 'با مقصدِ پر، زنگ جابه‌جا شد!');
  W(`remove('schedule',${block})`);
  W('render()');
  /* حالا واقعی — مقصد را از خودِ دکمهٔ فعلی می‌خوانیم (پیشنهاد ممکن است به‌روز شده باشد) */
  const rDay = W(`Number(document.querySelector('[data-act="sched-conf-move"][data-sid="${rowId}"]').dataset.day)`);
  const rPer = W(`Number(document.querySelector('[data-act="sched-conf-move"][data-sid="${rowId}"]').dataset.period)`);
  W(`document.querySelector('[data-act="sched-conf-move"][data-sid="${rowId}"]').click()`);
  const after = W(`byId('schedule',${rowId})`);
  assert(after.day === rDay && after.period === rPer, 'زنگ به مقصد نرفت: ' + JSON.stringify({rDay, rPer, after: [after.day, after.period]}));
  const c2 = W(`scheduleConflicts(1)`);
  assert(!c2.some(x=>x.kind==='teacher'&&x.teacher_id===ctx.t&&x.day===1&&x.period===2), 'تداخل بعد از جابه‌جایی برطرف نشد');
});

test('C6 دبیر: فقط اطلاع، بدون دکمهٔ جابه‌جایی', () => {
  asMgr(ctx.t);
  const r = W(`document.getElementById('root').innerHTML`);
  assert(r.indexOf('تداخل ساعتی شما') > -1, 'اطلاعیهٔ تداخل برای دبیر نیست');
  assert(r.indexOf('sched-conf-move') === -1, 'دبیر دکمهٔ جابه‌جایی دارد!');
  assert(r.indexOf('sched-conf-sug') === -1, 'دبیر دکمهٔ پیشنهاد دارد!');
});

test('C7 دسترسی: جابه‌جایی فقط مدیر (canAction)', () => {
  assert(W(`canAction('sched-conf-move','teacher')`) === false, 'دبیر sched-conf-move دارد!');
  assert(W(`canAction('sched-conf-move','student')`) === false, 'دانش‌آموز sched-conf-move دارد!');
  assert(W(`canAction('sched-conf-move','manager')`) === true, 'مدیر sched-conf-move ندارد!');
});

test('C8 پاک‌سازی: تداخلِ آزمون پاک شد', () => {
  W(`(function(){
    var t=${ctx.t};
    db.schedule.slice().filter(function(x){return x.teacher_id===t;}).forEach(function(x){remove('schedule',x.id);});
    remove('classes',${ctx.cA});remove('classes',${ctx.cB});
    remove('users',t);
  })()`);
  assert(W(`scheduleConflicts(1).length`) === 0, 'تداخلِ آزمون پاک نشد');
});

await sleep(100);
console.log('\n────────────────────────────────────────────────────');
console.log(`schedconf2 (تداخل برنامه): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
if (fail) process.exit(1);
process.exit(0);
}
