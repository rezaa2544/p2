#!/usr/bin/env node
/**
 * تست‌های صورت‌جلسهٔ انجمن (بند ۶.۲)
 *  - فقط مدیر + فقط مدرسهٔ دولتیِ خود
 *  - ثبت (تاریخ/حاضرین/مصوبات) + بایگانی/برگرداندن + حذف
 *  - چاپِ رسمی (محتوایِ پنجرهٔ چاپ)
 *  - رکوردِ مدرسهٔ دیگر نمایش داده نمی‌شود
 *
 * اجرا:  node tests/assocmin2.js   (نیازمند jsdom)
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(1); }

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
const asMgr = (uid, route) => W(`(function(){
  S.user=byId('users',${uid});S.persona=null;S.boss=null;
  S.filters={};S.route=${JSON.stringify(route)};S.tab='';render();
})()`);

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(400);
console.log('\n▸ صورت‌جلسهٔ انجمن (بند ۶.۲)');

test('A0 بوت بدون خطا + دادهٔ نمونه', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  assert(W('db.assoc_minutes.length') >= 2, 'دادهٔ نمونهٔ assoc_minutes نیست');
});

const ctx = W(`(function(){
  var m6=db.users.find(function(u){return u.role==='manager'&&u.school_id===6;});
  var m1=db.users.find(function(u){return u.role==='manager'&&u.school_id===1;});
  var t6=db.users.find(function(u){return u.role==='teacher'&&u.school_id===6;});
  var arch=db.assoc_minutes.find(function(m){return m.archived===true;});
  var act=db.assoc_minutes.find(function(m){return m.archived===false;});
  return {m6:m6.id,m1:m1.id,t6:t6.id,arch:arch.id,act:act.id};
})()`);
assert(ctx.arch && ctx.act, 'رکوردهای نمونه نیست');

test('A1 صفحهٔ مدیرِ مدرسهٔ ۶: جدول + فقط رکوردهای مدرسهٔ خود', () => {
  /* رکوردِ موقتیِ مدرسهٔ دیگر برای سنجشِ دامنه */
  W(`insert('assoc_minutes',{school_id:99,meeting_date:'2026-08-01',attendees:'بیگانه',resolutions:'بیگانه',archived:false,created_at:'2026-08-01',updated_at:'2026-08-01'})`);
  const tmpId = W(`db.assoc_minutes[db.assoc_minutes.length-1].id`);
  asMgr(ctx.m6, 'association');
  const root = W(`document.getElementById('root').innerHTML`);
  assert(root.indexOf('data-act="assoc-min-new"') > -1, 'بخشِ صورت‌جلسه رندر نشد');
  assert((root.match(/assoc-min-print/g) || []).length === 2, 'دو رکوردِ مدرسهٔ ۶ نیست');
  assert(root.indexOf('بیگانه') === -1, 'دامنهٔ مدرسه نگه داشته نشد');
  assert(root.indexOf('بایگانی‌شده') > -1, 'بجِ بایگانی نیست');
  W(`remove('assoc_minutes',${tmpId})`);
});

test('A2 مدیرِ مدرسهٔ دارای شهریه: صفحه «قابل‌اعمال نیست»', () => {
  asMgr(ctx.m1, 'association');
  const root = W(`document.getElementById('root').innerHTML`);
  assert(root.indexOf('data-act="assoc-min-new"') === -1, 'مدیرِ مدرسهٔ شهریه‌دار نباید فرم ببیند');
});

test('A3 ثبتِ صورت‌جلسهٔ تازه (فرم)', () => {
  const before = W(`db.assoc_minutes.length`);
  asMgr(ctx.m6, 'association');
  W(`document.querySelector('[data-act="assoc-min-new"]').click()`);
  W(`(function(){
    document.getElementById('am_date').value='2026-09-10';
    document.getElementById('am_att').value='آقای کریمی — رئیس انجمن\\nسرکار خانم موسوی';
    document.getElementById('am_res').value='تصویبِ خریدِ کتاب\\nتعیینِ تاریخِ جلسهٔ بعد';
    document.querySelector('[data-act="assoc-min-save"]').click();
  })()`);
  assert(W(`db.assoc_minutes.length`) === before + 1, 'رکورد ساخته نشد');
  const m = W(`db.assoc_minutes[db.assoc_minutes.length-1]`);
  assert(m.meeting_date === '2026-09-10', 'تاریخ ذخیره نشد');
  assert(String(m.attendees).indexOf('کریمی') > -1, 'حاضرین ذخیره نشد');
  assert(String(m.resolutions).indexOf('خریدِ کتاب') > -1, 'مصوبات ذخیره نشد');
  assert(m.archived === false, 'وضعیتِ اولیه باید «فعال» باشد');
  assert(m.school_id === 6, 'school_id ذخیره نشد');
});

test('A4 بایگانی/برگرداندن (روی رکوردِ بایگانی‌شدهٔ دمو)', () => {
  asMgr(ctx.m6, 'association');
  W(`document.querySelector('[data-act="assoc-min-toggle"][data-id="${ctx.arch}"]').click()`);
  let m = W(`byId('assoc_minutes',${ctx.arch})`);
  assert(m.archived === false, 'باید «فعال» می‌شد');
  W(`document.querySelector('[data-act="assoc-min-toggle"][data-id="${ctx.arch}"]').click()`);
  m = W(`byId('assoc_minutes',${ctx.arch})`);
  assert(m.archived === true, 'باید دوباره «بایگانی‌شده» می‌شد');
  assert(m.updated_at === W(`todayISO()`), 'updated_at به‌روز نشد');
});

test('A5 ثبتِ بدونِ حاضرین رد می‌شود', () => {
  const before = W(`db.assoc_minutes.length`);
  asMgr(ctx.m6, 'association');
  W(`document.querySelector('[data-act="assoc-min-new"]').click()`);
  W(`(function(){
    document.getElementById('am_date').value='2026-09-11';
    document.getElementById('am_att').value='   ';
    document.getElementById('am_res').value='';
    document.querySelector('[data-act="assoc-min-save"]').click();
  })()`);
  assert(W(`db.assoc_minutes.length`) === before, 'رکوردِ بی‌حاضر ثبت شد!');
  W(`(function(){var b=document.querySelector('[data-act="modal-close"]');if(b)b.click();})();`);
});

test('A6 دبیر: بدونِ مسیر و بدونِ اکشن', () => {
  assert(W(`canAction('assoc-min-save','teacher')`) === false, 'دبیر assoc-min-save دارد!');
  assert(W(`canAction('assoc-min-toggle','teacher')`) === false, 'دبیر assoc-min-toggle دارد!');
  assert(W(`canAction('assoc-min-del','teacher')`) === false, 'دبیر assoc-min-del دارد!');
});

test('A7 چاپ: محتوایِ رسمیِ پنجرهٔ چاپ', () => {
  asMgr(ctx.m6, 'association');
  W(`window.open=function(){window.__pw={h:''};return {document:{write:function(s){window.__pw.h+=s;},close:function(){}}};};`);
  W(`document.querySelector('[data-act="assoc-min-print"][data-id="${ctx.act}"]').click()`);
  const p = W(`window.__pw ? window.__pw.h : ''`);
  assert(p.indexOf('صورت‌جلسه') > -1, 'عنوانِ صورت‌جلسه در خروجیِ چاپ نیست');
  assert(p.indexOf('حاضرین در جلسه') > -1 && p.indexOf('مصوبات جلسه') > -1, 'بخش‌ها کامل نیستند');
  assert(p.indexOf('رئیسِ جلسه') > -1, 'جدولِ امضا نیست');
  assert(p.indexOf('window.print()') > -1, 'دکمهٔ چاپِ پنجره نیست');
});

await sleep(100);
console.log('\n────────────────────────────────────────────────────');
console.log(`assocmin2 (صورت‌جلسه): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
// hardening: rebuild base index.html (a previously crashed mutation suite may have left a mutated build)
try { require('child_process').execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
if (fail) process.exit(1);
process.exit(0);
}
