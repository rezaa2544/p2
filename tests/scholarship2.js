#!/usr/bin/env node
/**
 * تست‌های کمک‌هزینه و بورسیه (بند ۲.۴)
 *  - فقط مدیر + دامنهٔ مدرسهٔ خود
 *  - چرخهٔ وضعیت: درخواست‌شده → بررسی → تأیید/رد (جابه‌جاییِ نامجاز مسدود)
 *  - ثبتِ تازه از «درخواست‌شده» شروع می‌شود
 *  - نشانِ فقط‌خواندنی در پروندهٔ دانش‌آموز
 *
 * اجرا:  node tests/scholarship2.js   (نیازمند jsdom)
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
console.log('\n▸ کمک‌هزینه و بورسیه (بند ۲.۴)');

test('S0 بوت بدون خطا', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  assert(W('db.scholarships.length') >= 4, 'دادهٔ نمونهٔ scholarships نیست');
});

const ctx = W(`(function(){
  var m1=db.users.find(function(u){return u.role==='manager'&&u.school_id===1&&u.active;});
  var m2=db.users.find(function(u){return u.role==='manager'&&u.school_id===2&&u.active;});
  var t1=db.users.find(function(u){return u.role==='teacher'&&u.school_id===1&&u.active;});
  var req=db.scholarships.find(function(r){return r.school_id===1&&r.status==='requested';});
  var rev=db.scholarships.find(function(r){return r.school_id===1&&r.status==='review';});
  var other=db.scholarships.find(function(r){return r.school_id!==1;});
  return {m1:m1.id,m2:m2.id,t1:t1.id,req:req?req.id:0,rev:rev?rev.id:0,other:other?other.id:0};
})()`);
assert(ctx.req && ctx.rev, 'رکوردهای نمونهٔ requested/review نیست');

test('S1 صفحهٔ مدیر: شمارنده + فقط رکوردهای مدرسهٔ خود', () => {
  asRole(ctx.m1, 'scholarships');
  const root = W(`document.getElementById('root').innerHTML`);
  assert(root.indexOf('data-act="scholar-new"') > -1, 'صفحهٔ scholarships رندر نشد');
  const mine = W(`db.scholarships.filter(function(r){return r.school_id===1;}).length`);
  const all = W(`db.scholarships.length`);
  assert(all > mine, 'زمینهٔ تست: رکوردِ مدرسهٔ دیگر لازم است');
  const otherName = W(`(function(){var s=byId('scholarships',${ctx.other});var r=s?byId('users',s.student_id):null;return r?r.full_name:'';})()`);
  assert(root.indexOf(otherName) === -1, 'رکوردِ مدرسهٔ دیگر در صفحهٔ مدیرِ مدرسهٔ ۱ است!');
});

test('S2 مدیرِ مدرسهٔ دیگر: فقط رکوردهای خودش', () => {
  asRole(ctx.m2, 'scholarships');
  const root = W(`document.getElementById('root').innerHTML`);
  const mineName = W(`(function(){var s=byId('scholarships',${ctx.other});var r=s?byId('users',s.student_id):null;return r?r.full_name:'';})()`);
  assert(root.indexOf(mineName) > -1, 'رکوردِ مدرسهٔ ۲ نیست');
  const otherName = W(`(function(){var s=byId('scholarships',${ctx.req});var r=s?byId('users',s.student_id):null;return r?r.full_name:'';})()`);
  assert(root.indexOf(otherName) === -1, 'دامنهٔ مدرسه نگه داشته نشد');
});

test('S3 جابه‌جاییِ مجاز (کلیکِ واقعی): requested → review', () => {
  asRole(ctx.m1, 'scholarships');
  const before = W(`byId('scholarships',${ctx.req})`);
  assert(before.status === 'requested', 'رکوردِ نمونه دیگر requested نیست');
  const btn = W(`document.querySelector('[data-act="scholar-set"][data-id="${ctx.req}"][data-to="review"]')`);
  assert(btn, 'دکمهٔ «→ در حال بررسی» نیست');
  W(`document.querySelector('[data-act="scholar-set"][data-id="${ctx.req}"][data-to="review"]').click()`);
  const after = W(`byId('scholarships',${ctx.req})`);
  assert(after.status === 'review', 'وضعیت تغییر نکرد (گرفت: ' + after.status + ')');
  assert(after.updated_at === W(`todayISO()`), 'تاریخِ به‌روزرسانی تازه نشد');
});

test('S4 جابه‌جاییِ نامجاز: بدونِ دکمه + اکشنِ مستقیم هم مسدود', () => {
  asRole(ctx.m1, 'scholarships');
  /* دکمهٔ بازگشت به requested نباید باشد */
  const n = W(`(function(){var x=document.querySelectorAll('[data-act="scholar-set"][data-id="${ctx.rev}"]');var f=0;x.forEach(function(b){if(b.dataset.to==='requested')f++;});return f;})()`);
  assert(n === 0, 'دکمهٔ نامجازِ بازگشت به requested رندر شد');
  /* کلیکِ مصنوعیِ مستقیم: review → requested باید رد شود */
  const st = W(`byId('scholarships',${ctx.rev}).status`);
  W(`(function(){
    var b=document.createElement('button');
    b.setAttribute('data-act','scholar-set');
    b.setAttribute('data-id','${ctx.rev}');
    b.setAttribute('data-to','requested');
    document.body.appendChild(b);b.click();b.remove();
  })()`);
  const st2 = W(`byId('scholarships',${ctx.rev}).status`);
  assert(st2 === st && st2 === 'review', 'جابه‌جاییِ نامجاز اعمال شد!');
  const toasts = W(`Array.from(document.querySelectorAll('#toasts .toast')).map(function(d){return d.textContent;})`);
  assert(toasts.some(function(x){return x.indexOf('مجاز') > -1;}), 'ردِ صریح (توست) نبود');
});

test('S5 دبیر: منو و اکشن مسدود', () => {
  assert(W(`canRoute('scholarships','teacher')`) === false, 'دبیر نباید مسیر داشته باشد');
  assert(W(`canAction('scholar-save','teacher')`) === false, 'دبیر scholar-save ندارد');
  assert(W(`canAction('scholar-set','teacher')`) === false, 'دبیر scholar-set ندارد');
});

test('S6 ثبتِ تازه (فرمِ واقعی): وضعیتِ اولیه = درخواست‌شده', () => {
  const before = W(`db.scholarships.length`);
  const sid = W(`db.users.find(function(u){return u.role==='student'&&u.school_id===1&&u.active;}).id`);
  asRole(ctx.m1, 'scholarships');
  W(`document.querySelector('[data-act="scholar-new"]').click()`);
  W(`(function(){
    document.getElementById('sc_student').value=${JSON.stringify(String(sid))};
    document.getElementById('sc_note').value='تست: بررسیِ انجمن';
    document.querySelector('[data-act="scholar-save"]').click();
  })()`);
  assert(W(`db.scholarships.length`) === before + 1, 'رکورد ساخته نشد');
  const r = W(`db.scholarships[db.scholarships.length-1]`);
  assert(r.status === 'requested', 'وضعیتِ اولیه درست نیست: ' + r.status);
  assert(r.student_id === sid && r.school_id === 1, 'دانش‌آموز/مدرسهٔ رکورد درست نیست');
  assert(r.note.indexOf('تست') > -1, 'یادداشت ذخیره نشد');
});

test('S7 نشان در پرونده: دانش‌آموزِ دارای رکورد می‌بیند، بقیه نمی‌بینند', () => {
  const withRec = W(`db.scholarships[${ctx.rev}].student_id`);
  const noRec = W(`(function(){
    var ids=db.scholarships.map(function(r){return r.student_id;});
    return db.users.find(function(u){return u.role==='student'&&u.school_id===1&&!ids.some(function(x){return x===u.id;});}).id;
  })()`);
  W(`(function(){S.user=byId('users',${ctx.m1});S.persona=null;S.boss=null;S.child=${withRec};S.filters={};S.route='record';S.tab='profile';render();})()`);
  const r1 = W(`(function(){return document.getElementById('root').innerHTML.indexOf(scholarshipBadge(${withRec}))>-1;})()`);
  assert(r1, 'نشان در پروندهٔ دانش‌آموزِ دارای رکورد نیست');
  W(`(function(){S.user=byId('users',${ctx.m1});S.persona=null;S.boss=null;S.child=${noRec};S.filters={};S.route='record';S.tab='profile';render();})()`);
  assert(W(`scholarshipBadge(${noRec})`) === '', 'نشان برای دانش‌آموزِ بدونِ رکورد ساخته شد');
});

await sleep(100);
console.log('\n────────────────────────────────────────────────────');
console.log(`scholarship2 (کمک‌هزینه): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
// hardening: rebuild base index.html (a previously crashed mutation suite may have left a mutated build)
try { require('child_process').execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
if (fail) process.exit(1);
process.exit(0);
}
