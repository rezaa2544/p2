#!/usr/bin/env node
/**
 * تست‌های امتحاناتِ تجدیدی (بند ۶.۱)
 *  - فقط مدیر + دامنهٔ مدرسه
 *  - ثبتِ درسِ تجدیدی → وضعیتِ برنامه‌ریزی‌شده؛ نمرهٔ نهایی = اصلی
 *  - ثبتِ نمرهٔ مجدد → انجام‌شده؛ نمرهٔ نهایی = مجدد
 *  - نمرهٔ بیرون از ۰-۲۰ رد می‌شود
 *  - کارتِ فقط‌خواندنی در تبِ کارنامهٔ پرونده
 *
 * اجرا:  node tests/reexam2.js   (نیازمند jsdom)
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
// hardening: rebuild base index.html (a previously crashed mutation suite may have left a mutated build)
try { require('child_process').execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
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
const asRole = (uid, route) => W(`(function(){
  S.user=byId('users',${uid});S.persona=null;S.boss=null;
  S.filters={};S.route=${JSON.stringify(route)};S.tab='';render();
})()`);

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(400);
console.log('\n▸ امتحاناتِ تجدیدی (بند ۶.۱)');

test('R0 بوت بدون خطا', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  assert(W('db.reexams.length') >= 2, 'دادهٔ نمونهٔ reexams نیست');
});

const ctx = W(`(function(){
  var m1=db.users.find(function(u){return u.role==='manager'&&u.school_id===1&&u.active;});
  var m2=db.users.find(function(u){return u.role==='manager'&&u.school_id===2&&u.active;});
  var t1=db.users.find(function(u){return u.role==='teacher'&&u.school_id===1&&u.active;});
  var done=db.reexams.find(function(r){return r.status==='done';});
  var sched=db.reexams.find(function(r){return r.status==='scheduled';});
  return {m1:m1.id,m2:m2.id,t1:t1.id,done:done?done.id:0,sched:sched?sched.id:0};
})()`);
assert(ctx.done && ctx.sched, 'رکوردهای نمونه نیست');

test('R1 نمرهٔ نهایی: انجام‌شده = مجدد، برنامه‌ریزی‌شده = اصلی', () => {
  const d = W(`byId('reexams',${ctx.done})`);
  assert(W(`reexamFinalScore(byId('reexams',${ctx.done}))`) === d.new_score, 'نمرهٔ نهاییِ انجام‌شده ≠ نمرهٔ مجدد');
  const s = W(`byId('reexams',${ctx.sched})`);
  assert(W(`reexamFinalScore(byId('reexams',${ctx.sched}))`) === s.original_score, 'نمرهٔ نهاییِ برنامه‌ریزی‌شده ≠ اصلی');
});

test('R2 صفحهٔ مدیر: رکوردها + فقط مدرسهٔ خود', () => {
  /* رکوردِ موقتیِ مدرسهٔ ۲ برای سنجشِ دامنه */
  const st2 = W(`db.users.find(function(u){return u.role==='student'&&u.school_id===2&&u.active;}).id`);
  assert(!!st2, 'دانش‌آموزِ مدرسهٔ ۲ در دمو نیست');
  const otherStu = W(`byId('users',${st2}).full_name`);
  W(`insert('reexams',{school_id:2,student_id:${st2},subject_id:1,original_score:7,exam_date:'2026-09-20',new_score:null,status:'scheduled',created_at:'2026-09-06',updated_at:'2026-09-06'})`);
  const tmpId = W(`db.reexams[db.reexams.length-1].id`);
  asRole(ctx.m1, 'reexams');
  const root = W(`document.getElementById('root').innerHTML`);
  assert(root.indexOf('data-act="reexam-new"') > -1, 'صفحهٔ reexams رندر نشد');
  const myStu = W(`(function(){var r=byId('reexams',${ctx.done});return byId('users',r.student_id).full_name;})()`);
  assert(root.indexOf(myStu) > -1, 'رکوردِ مدرسهٔ ۱ نیست');
  assert(root.indexOf(otherStu) === -1, 'دامنهٔ مدرسه نگه داشته نشد (دانش‌آموزِ مدرسهٔ ۲ دیده شد)');
  W(`remove('reexams',${tmpId})`);
});

test('R3 ثبتِ تازه (فرم): وضعیت = برنامه‌ریزی‌شده', () => {
  const before = W(`db.reexams.length`);
  const sid = W(`db.users.find(function(u){return u.role==='student'&&u.school_id===1&&u.active;}).id`);
  const subid = W(`db.subjects[0].id`);
  asRole(ctx.m1, 'reexams');
  W(`document.querySelector('[data-act="reexam-new"]').click()`);
  W(`(function(){
    document.getElementById('rx_student').value=${JSON.stringify(String(sid))};
    document.getElementById('rx_subject').value=${JSON.stringify(String(subid))};
    document.getElementById('rx_orig').value='10';
    document.getElementById('rx_date').value='2026-09-20';
    document.querySelector('[data-act="reexam-save"]').click();
  })()`);
  assert(W(`db.reexams.length`) === before + 1, 'رکورد ساخته نشد');
  const r = W(`db.reexams[db.reexams.length-1]`);
  assert(r.status === 'scheduled', 'وضعیتِ اولیه درست نیست');
  assert(r.original_score === 10 && r.exam_date === '2026-09-20', 'مقادیر ذخیره نشدند');
  const lastId = W(`db.reexams[db.reexams.length-1].id`);
  assert(W(`reexamFinalScore(byId('reexams',${lastId}))`) === 10, 'نمرهٔ نهاییِ اولیه ≠ اصلی');
});

test('R4 ثبتِ نمرهٔ مجدد (فرم): انجام‌شده + نهایی = مجدد', () => {
  const r0 = W(`byId('reexams',${ctx.sched})`);
  assert(r0.status === 'scheduled', 'رکوردِ نمونه دیگر scheduled نیست');
  asRole(ctx.m1, 'reexams');
  W(`document.querySelector('[data-act="reexam-score"][data-id="${ctx.sched}"]').click()`);
  W(`(function(){
    document.getElementById('rx_new').value='17';
    document.querySelector('[data-act="reexam-score-save"]').click();
  })()`);
  const r1 = W(`byId('reexams',${ctx.sched})`);
  assert(r1.status === 'done', 'وضعیت انجام‌شده نشد');
  assert(r1.new_score === 17, 'نمرهٔ مجدد ذخیره نشد');
  assert(r1.updated_at === W(`todayISO()`), 'تاریخِ به‌روزرسانی تازه نشد');
});

test('R5 نمرهٔ بیرون از محدوده رد می‌شود', () => {
  asRole(ctx.m1, 'reexams');
  W(`document.querySelector('[data-act="reexam-score"][data-id="${ctx.done}"]').click()`);
  W(`(function(){
    document.getElementById('rx_new').value='25';
    document.querySelector('[data-act="reexam-score-save"]').click();
  })()`);
  const r = W(`byId('reexams',${ctx.done})`);
  assert(r.new_score !== 25, 'نمرهٔ ۲۵ پذیرفته شد!');
  W(`(function(){document.querySelector('[data-act="modal-close"]').click ? document.querySelector('[data-act="modal-close"]').click() : null;})();`);
});

test('R6 دبیر: منو و اکشن مسدود', () => {
  assert(W(`canRoute('reexams','teacher')`) === false, 'دبیر نباید مسیر داشته باشد');
  assert(W(`canAction('reexam-save','teacher')`) === false, 'دبیر reexam-save ندارد');
  assert(W(`canAction('reexam-score-save','teacher')`) === false, 'دبیر reexam-score-save ندارد');
});

test('R7 کارتِ پرونده: دانش‌آموزِ دارای رکورد می‌بیند، بقیه نه', () => {
  const withRec = W(`byId('reexams',${ctx.done}).student_id`);
  const noRec = W(`(function(){
    var ids=db.reexams.map(function(r){return r.student_id;});
    return db.users.find(function(u){return u.role==='student'&&u.school_id===1&&!ids.some(function(x){return x===u.id;});}).id;
  })()`);
  W(`(function(){S.user=byId('users',${ctx.m1});S.persona=null;S.boss=null;S.child=${withRec};S.filters={};S.route='record';S.tab='grades';render();})()`);
  const card = W(`reexamCard(${withRec})`);
  assert(card !== '', 'کارتِ تجدیدی برای دانش‌آموزِ دارای رکورد ساخته نشد');
  const has = W(`document.getElementById('root').innerHTML.indexOf(${JSON.stringify(String(card))}) > -1`);
  assert(has, 'کارتِ تجدیدی در تبِ کارنامهٔ پرونده نیست');
  assert(W(`reexamCard(${noRec})`) === '', 'کارت برای دانش‌آموزِ بدونِ رکورد ساخته شد');
});

await sleep(100);
console.log('\n────────────────────────────────────────────────────');
console.log(`reexam2 (تجدیدی): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
// hardening: rebuild base index.html (a previously crashed mutation suite may have left a mutated build)
try { require('child_process').execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
if (fail) process.exit(1);
process.exit(0);
}
