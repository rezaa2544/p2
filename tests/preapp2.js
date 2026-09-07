#!/usr/bin/env node
/**
 * تست‌های قیف پیش‌ثبت‌نامِ رقابتی (بند ۴.۴ — مدارس غیردولتی)
 *  - چهار مرحله: تماس → بازدید → آزمون → ثبت‌نامِ قطعی
 *  - فقط مدیر؛ دامنهٔ مدرسهٔ خود (ردیفِ مدرسهٔ دیگر نمی‌بیند)
 *  - جدا از ثبت‌نامِ رسمی — هیچ تبدیلِ خودکاری نیست
 *  - فقط «مرحلهٔ بعدی» — پرش یا عقب‌رفتنی نیست
 *
 * اجرا:  node tests/preapp2.js   (نیازمند jsdom)
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
const errors = [];
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) { fail++; errors.push(`${name}: ${e.message}`); console.log(`  ❌ ${name}\n     ${e.message}`); resolve(); return; }
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
await sleep(400);
console.log('\n▸ قیف پیش‌ثبت‌نام (بند ۴.۴)');

test('P0 بوت بدون خطا', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  assert(W('db.preapps.length') >= 4, 'دادهٔ نمونهٔ preapps نیست');
});

const ctx = W(`(function(){
  var m1=db.users.find(function(u){return u.role==='manager'&&u.school_id===1;});
  var m2=db.users.find(function(u){return u.role==='manager'&&u.school_id===2;});
  var t1=db.users.find(function(u){return u.role==='teacher'&&u.school_id===1;});
  var contact=db.preapps.find(function(r){return r.school_id===1&&r.stage==='contact';});
  var enrolled=db.preapps.find(function(r){return r.stage==='enrolled';});
  return {m1:m1.id,m2:m2.id,t1:t1.id,contact:contact?contact.id:0,enrolled:enrolled?enrolled.id:0};
})()`);
assert(ctx.contact, 'ردیفِ تماسِ نمونه نیست');

test('P1 صفحهٔ مدیر: قیف + ردیف‌های مدرسهٔ خود', () => {
  W(`(function(){
    S.user=byId('users',${ctx.m1});S.persona=null;S.boss=null;
    S.filters={};S.route='preapps';S.tab='';render();
  })()`);
  const root = W(`document.getElementById('root').innerHTML`);
  assert(root.indexOf('data-act="preapp-new"') > -1, 'صفحهٔ preapps رندر نشد (دکمهٔ ثبتِ تازه نیست)');
  assert(root.indexOf('بازدید از مدرسه') > -1, 'عنوانِ مرحلهٔ بازدید نیست');
  assert(root.indexOf('ثبت‌نامِ قطعی') > -1, 'عنوانِ مرحلهٔ قطعی نیست');
  /* مدرسهٔ ۱ فقط دو ردیف خودش را می‌بیند (contact + visit) */
  const names = W(`db.preapps.filter(function(r){return r.school_id===1;}).map(function(r){return r.name;})`);
  names.forEach((n) => assert(root.indexOf(n) > -1, 'ردیفِ «' + n + '» رندر نشد'));
  const total1 = W(`db.preapps.filter(function(r){return r.school_id===1;}).length`);
  const totalAll = W(`db.preapps.length`);
  const other = W(`db.preapps.filter(function(r){return r.school_id!==1;})[0].name`);
  assert(root.indexOf(other) === -1, 'ردیفِ مدرسهٔ دیگر در صفحهٔ مدیرِ مدرسهٔ ۱ است!');
  assert(totalAll > total1, 'زمینهٔ تست: باید ردیفِ مدرسهٔ دیگر هم باشد');
});

test('P2 مدیرِ مدرسهٔ دیگر: فقط ردیفِ خودش', () => {
  W(`(function(){
    S.user=byId('users',${ctx.m2});S.persona=null;S.boss=null;
    S.filters={};S.route='preapps';S.tab='';render();
  })()`);
  const root = W(`document.getElementById('root').innerHTML`);
  const mine = W(`db.preapps.filter(function(r){return r.school_id===2;})[0].name`);
  assert(root.indexOf(mine) > -1, 'ردیفِ مدرسهٔ ۲ نیست');
  const other = W(`db.preapps.filter(function(r){return r.school_id===1;})[0].name`);
  assert(root.indexOf(other) === -1, 'دامنهٔ مدرسه نگه داشته نشد');
});

test('P3 پیشرفتِ مرحله (کلیکِ واقعی): contact → visit + تاریخِ تازه', () => {
  W(`(function(){
    S.user=byId('users',${ctx.m1});S.persona=null;S.boss=null;
    S.filters={};S.route='preapps';S.tab='';render();
  })()`);
  const btn = W(`document.querySelector('[data-act="preapp-next"][data-id="${ctx.contact}"]')`);
  assert(btn, 'دکمهٔ «مرحلهٔ بعدی» نیست');
  W(`document.querySelector('[data-act="preapp-next"][data-id="${ctx.contact}"]').click()`);
  const r = W(`byId('preapps',${ctx.contact})`);
  assert(r.stage === 'visit', 'مرحله تغییر نکرد (گرفت: ' + r.stage + ')');
  const today = W(`todayISO()`);
  assert(r.stage_at === today, 'تاریخِ تغییرِ مرحله تازه نشد');
});

test('P4 مرحلهٔ آخر: دکمهٔ بعدی نیست + اکشنِ مستقیم هم رد می‌شود', () => {
  W(`(function(){
    S.user=byId('users',${ctx.m1});S.persona=null;S.boss=null;
    S.filters={};S.route='preapps';S.tab='';render();
  })()`);
  const n = W(`(function(){var x=document.querySelectorAll('[data-act="preapp-next"]');var found=0;x.forEach(function(b){if(b.dataset.id==='${ctx.enrolled}')found++;});return found;})()`);
  assert(n === 0, 'ردیفِ «ثبت‌نامِ قطعی» نباید دکمهٔ بعدی داشته باشد');
  /* لایهٔ دوم: حتی یک کلیکِ مستقیمِ روی اکشن هم نباید مرحلهٔ آخر را عوض کند */
  const st = W(`byId('preapps',${ctx.enrolled}).stage`);
  W(`(function(){
    var b=document.createElement('button');
    b.setAttribute('data-act','preapp-next');
    b.setAttribute('data-id','${ctx.enrolled}');
    document.body.appendChild(b);b.click();b.remove();
  })()`);
  const st2 = W(`byId('preapps',${ctx.enrolled}).stage`);
  assert(st2 === st && st2 === 'enrolled', 'مرحلهٔ آخر با اکشنِ مستقیم تغییر کرد!');
  const toasts = W(`Array.from(document.querySelectorAll('#toasts .toast')).map(function(d){return d.textContent;})`);
  assert(toasts.some(function(x){return x.indexOf('آخرین مرحله') > -1;}), 'اکشنِ مستقیم به‌صراحت رد نشد (پیام «آخرین مرحله» نیست)');
});

test('P5 دبیر: منو و اکشن مسدود', () => {
  assert(W(`canRoute('preapps','teacher')`) === false, 'دبیر نباید مسیرِ preapps داشته باشد');
  assert(W(`canAction('preapp-save','teacher')`) === false, 'دبیر نباید preapp-save داشته باشد');
  assert(W(`canAction('preapp-next','teacher')`) === false, 'دبیر نباید preapp-next داشته باشد');
});

test('P6 مدیر: ثبتِ پیش‌ثبت‌نامِ تازه (فرمِ واقعی)', () => {
  const before = W(`db.preapps.length`);
  W(`(function(){
    S.user=byId('users',${ctx.m1});S.persona=null;S.boss=null;
    S.filters={};S.route='preapps';S.tab='';render();
  })()`);
  W(`document.querySelector('[data-act="preapp-new"]').click()`);
  W(`(function(){
    document.getElementById('pa_name').value='داوطلبِ تست';
    document.getElementById('pa_phone').value='09120000000';
    document.getElementById('pa_note').value='از راهِ معرفی';
    document.querySelector('[data-act="preapp-save"]').click();
  })()`);
  const after = W(`db.preapps.length`);
  assert(after === before + 1, 'ردیفِ تازه ساخته نشد');
  const r = W(`db.preapps[db.preapps.length-1]`);
  assert(r.name === 'داوطلبِ تست', 'نام ذخیره نشد');
  assert(r.stage === 'contact', 'ردیفِ تازه باید از «تماسِ اولیه» شروع شود');
  assert(r.school_id === 1, 'مدرسهٔ رکورد درست نیست');
});

test('P7 جدا از ثبت‌نامِ رسمی: تبدیلِ خودکار نیست', () => {
  const enrBefore = W(`db.enrollments.length`);
  W(`(function(){
    S.user=byId('users',${ctx.m1});S.persona=null;S.boss=null;
    S.filters={};S.route='preapps';S.tab='';render();
  })()`);
  const anyNext = W(`document.querySelector('[data-act="preapp-next"]')`);
  if(anyNext) W(`document.querySelector('[data-act="preapp-next"]').click()`);
  const enrAfter = W(`db.enrollments.length`);
  assert(enrAfter === enrBefore, 'جابه‌جاییِ قیف نباید enrollments را تغییر دهد');
});

await sleep(100);
console.log('\n────────────────────────────────────────────────────');
console.log(`preapp2 (قیف پیش‌ثبت‌نام): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
// hardening: rebuild base index.html (a previously crashed mutation suite may have left a mutated build)
try { require('child_process').execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
if (fail) process.exit(1);
process.exit(0);
}
