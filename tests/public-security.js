#!/usr/bin/env node
/**
 * تست‌های امنیتی C.3 — گزارش عمومی مدرسه (بدون ورود)
 *  - پروجکشن: فقط کلیدهای تجمیعی، بدون رکورد کاربر و بدون PII
 *  - پرچم public_goals: پیش‌فرض مخفی، انتشار فقط با رضایت مدیر
 *  - دادهٔ واقعی سرور: موفقیت/شکست واکشی + پیام تهی
 *
 * اجرا:  node tests/public-security.js   (نیازمند jsdom)
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
const asOut = () => W(`(function(){
  S.user=null;S.persona=null;S.boss=null;S.filters={};S.route='dashboard';S.tab='';render();
})()`);
const pubText = () => W(`document.querySelector('#pub-report').textContent`);
const pubHTML = () => W(`document.querySelector('#pub-report').innerHTML`);

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(400);
console.log('\n▸ امنیت گزارش عمومی (C.3 — اصلاحات ۱ تا ۳)');

test('S1 پروجکشن فقط کلیدهای مجاز دارد (بدون users/جزئیات)', () => {
  asOut();
  const keys = W(`Object.keys(publicReportData(1)).sort().join(',')`);
  assert(keys === 'city,classes,goals,level,meetings,name,sid,students,teachers',
    'کلیدهای پروجکشن عوض شده: ' + keys);
  const mkeys = W(`Object.keys(publicReportData(1).meetings[0]).sort().join(',')`);
  assert(mkeys === 'key,label,last,n', 'کلیدهای جلسه عوض شده: ' + mkeys);
  assert(W(`typeof publicReportData(1).users`) === 'undefined', 'users در پروجکشن نشت کرد!');
});

test('S2 پیش‌فرض مخفی: بومِ بدون پرچم منتشر نمی‌شود', () => {
  asOut();
  W(`update('schools',1,{boom_goals:'محرمانه-پیشفرض',public_goals:0});S.filters.pubschool='1';render()`);
  assert(W(`publicReportData(1).goals`) === '', 'پروجکشن باید goals خالی بدهد');
  assert(!pubText().includes('محرمانه-پیشفرض'), 'بوم بدون پرچم در HTML نمایش داده شد!');
  assert(!pubText().includes('برنامه ویژه'), 'بخش بوم نباید ساخته شود');
});

test('S3 انتشار فقط با پرچم مدیر', () => {
  asOut();
  W(`update('schools',1,{public_goals:1});S.filters.pubschool='1';render()`);
  assert(pubText().includes('محرمانه-پیشفرض'), 'با پرچم=۱ باید نمایش داده شود');
  W(`update('schools',1,{public_goals:0,boom_goals:''});render()`);
  assert(!pubText().includes('محرمانه-پیشفرض'), 'پس از برداشتن پرچم باید پنهان شود');
});

test('S4 خروجی HTML گریخته است (بدون تزریق)', () => {
  asOut();
  const orig = W(`byId('schools',1).name`);
  W(`update('schools',1,{name:'<img src=x onerror=alert(1)>'});S.filters.pubschool='1';render()`);
  assert(pubHTML().includes('&lt;img'), 'نام مدرسه گریخته نشد!');
  assert(!pubHTML().includes('<img src=x'), 'تزریق HTML در گزارش عمومی!');
  W(`update('schools',1,{name:${JSON.stringify(orig)}});render()`);
});

test('S5 بدون مدرسهٔ فعال: پیام «داده‌ای برای نمایش وجود ندارد»', () => {
  asOut();
  W(`db.schools.forEach(s=>{s._a=s.active;s.active=0});render()`);
  assert(W(`document.getElementById('pub-report')?1:0`) === 1, 'کانتینر گزارش باید بماند');
  assert(pubText().includes('داده‌ای برای نمایش وجود ندارد'), 'پیام تهی نمایش داده نشد!');
  W(`db.schools.forEach(s=>{s.active=s._a;delete s._a});render()`);
  assert(!pubText().includes('داده‌ای برای نمایش وجود ندارد'), 'پس از بازیابی نباید پیام تهی بماند');
});

test('S6 حالت سروری: دادهٔ واقعی سرور جایگزین محلی می‌شود', async () => {
  asOut();
  W(`window._origGet=Api.get;DATA_MODE='server';
     Api.get=function(p){return (p||'').indexOf('public-report')>-1
       ? Promise.resolve({ok:true,report:{sid:1,name:'مدرسهٔ سروری',level:'ابتدایی',city:'تهران',
           students:11,teachers:2,classes:3,meetings:[{key:'assoc',n:4,last:'1403-02-01'}],goals:''}})
       : Promise.reject(new Error('stub-offline'));};
     S.filters.pubschool='1';render();`);
  await sleep(250);
  assert(pubText().includes('مدرسهٔ سروری'), 'دادهٔ سرور جایگزین نشد!');
  assert(!pubText().includes('دادهٔ محلی'), 'در موفقیت نباید یادداشت محلی باشد');
  W(`Api.get=window._origGet;DATA_MODE='local';render()`);
  await sleep(100);
});

test('S7 قطع سرور: دادهٔ محلی + یادداشت «دادهٔ محلی»', async () => {
  asOut();
  const localName = W(`byId('schools',1).name`);
  W(`window._origGet=Api.get;DATA_MODE='server';
     Api.get=function(){return Promise.reject(new Error('stub-down'));};
     S.filters.pubschool='1';render();`);
  await sleep(250);
  assert(pubText().includes('دادهٔ محلی'), 'یادداشت آفلاین نمایش داده نشد!');
  assert(pubText().includes(localName), 'دادهٔ محلی باید سر جایش بماند!');
  W(`Api.get=window._origGet;DATA_MODE='local';render()`);
  await sleep(100);
  assert(!pubText().includes('دادهٔ محلی'), 'پس از بازگشت به محلی نباید یادداشت بماند');
});

test('S8 واجدشرایطی پل سرور: فقط خروج‌کرده + حالت سروری', () => {
  asOut();
  W(`DATA_MODE='local';render()`);
  assert(W(`pubReportEligible()`) === false, 'در حالت محلی نباید واجد باشد');
  W(`(function(){S.user=db.users.find(function(u){return u.role==='manager';});render();})()`);
  assert(W(`typeof pubReportEligible==='function'&&S.user?pubReportEligible():false`) === false,
    'در حالت ورودکرده نباید واجد باشد');
  asOut();
});

/* ── سمت سرور: اندپوینت /api/public-report (بدون jsdom) ── */

test('S9 سرور: فقط کلیدهای تجمیعی + شمارش درست', async () => {
  const { createPublicReport } = require('../server/public-report.js');
  const store = {
    schools: [{ id: 1, name: 'الف', level: 'ابتدایی', city: 'x', active: 1, public_goals: 1, boom_goals: 'G' }],
    users: [
      { id: 1, role: 'student', school_id: 1, full_name: 'PII-NAME', phone: 'PII-PHONE', national_id: 'PII-NID' },
      { id: 2, role: 'teacher', school_id: 1, full_name: 'T' }
    ],
    classes: [{ id: 1, school_id: 1 }],
    assoc_minutes: [{ id: 1, school_id: 1, meeting_date: '1403-01-01' }],
    counties: []
  };
  let got = null;
  const api = createPublicReport({ store, sendJson: (res, c, j) => { got = j; } });
  await api.apiPublicReport({ url: '/api/public-report?school_id=1', method: 'GET' }, {});
  assert(got && got.ok === true, 'پاسخ ok نیست');
  assert(Object.keys(got.report).sort().join(',') === 'city,classes,goals,level,meetings,name,sid,students,teachers',
    'کلیدهای گزارش سرور نامجاز است');
  assert(got.report.students === 1 && got.report.teachers === 1 && got.report.classes === 1, 'شمارش غلط است');
  const s = JSON.stringify(got);
  assert(!/PII-/.test(s), 'PII از سرور نشت کرد!');
});

test('S10 سرور: گیت public_goals + فالبک + تهی', async () => {
  const { createPublicReport } = require('../server/public-report.js');
  const store = { schools: [{ id: 1, name: 'الف', active: 1, public_goals: 0, boom_goals: 'SECRET' }],
    users: [], classes: [], assoc_minutes: [], counties: [] };
  let got = null;
  const api = createPublicReport({ store, sendJson: (res, c, j) => { got = j; } });
  await api.apiPublicReport({ url: '/api/public-report?school_id=1', method: 'GET' }, {});
  assert(got.report.goals === '', 'سرور بدون پرچم باید goals خالی بدهد');
  await api.apiPublicReport({ url: '/api/public-report?school_id=999', method: 'GET' }, {});
  assert(got.report.sid === 1, 'شناسهٔ نامعتبر باید به اول برگردد');
  const apiE = createPublicReport({ store: { schools: [] }, sendJson: (res, c, j) => { got = j; } });
  await apiE.apiPublicReport({ url: '/api/public-report', method: 'GET' }, {});
  assert(got.report === null && Array.isArray(got.schools), 'استور تهی باید report:null بدهد');
});

await __seq;
const total = pass + fail;
console.log(`امنیت گزارش عمومی: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
dom.window.close();
process.exit(fail ? 1 : 0);
}
