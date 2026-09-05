#!/usr/bin/env node
/**
 * سئوتِ انجمن اولیا و مربیان — کمک داوطلبانه (دور ۶۵ بند ۵)
 *  - منو: فقط مدرسهٔ دولتی (بدون شهریه)؛ آینه‌ی مستقیم با شهریه
 *  - صفحه: آمار + جدول + ثبت تراکنش با کلیک واقعی
 *  - گاردِ دسترسی: مدیر/سوپرادمین + مدرسهٔ دولتی
 *
 * اجرا:  node tests/association2.js
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
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) { fail++; errors.push(name + ': ' + e.message); console.log(`  ❌ ${name}\n     ${e.message}`); resolve(); return; }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; errors.push(name + ': ' + e.message); console.log(`  ❌ ${name}\n     ${e.message}`); }
    ).then(resolve);
  }));
  __seq = p;
}
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

const consoleErrors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
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
console.log('\n▸ انجمن و کمک‌ها (دور ۶۵)');
const mgr6 = W(`db.users.find(u=>u.role==='manager'&&u.school_id===6).id`);
const mgr1 = W(`db.users.find(u=>u.role==='manager'&&u.school_id===1).id`);
const setMgr = (id) => `S.user=byId('users',${id});S.persona=null;S.boss=null;`;

test('A1 — منو: دولتی=انجمن، غیردولتی=شهریه (آینهٔ مستقیم)', () => {
  const n6 = W(`${setMgr(mgr6)} navFor(S.user).map(g=>g[1].map(i=>i[0]).join(',')).join('|')`);
  const n1 = W(`${setMgr(mgr1)} navFor(S.user).map(g=>g[1].map(i=>i[0]).join(',')).join('|')`);
  assert(n6.indexOf('association') > -1, 'مدیرِ مدرسهٔ دولتی «انجمن» را نمی‌بیند');
  assert(n6.indexOf('tuition') === -1, 'مدیرِ مدرسهٔ دولتی «شهریه» را می‌بیند');
  assert(n1.indexOf('tuition') > -1, 'مدیرِ مدرسهٔ غیردولتی «شهریه» را نمی‌بیند');
  assert(n1.indexOf('association') === -1, 'مدیرِ مدرسهٔ غیردولتی «انجمن» را می‌بیند');
});

test('A2 — صفحه: آمار و جدول تراکنش‌های کمک مردمی', () => {
  W(`${setMgr(mgr6)} S.route='association';S.filters={};S.page=1;render()`);
  const h = W(`document.querySelector('.main').innerHTML`);
  assert(h.indexOf('انجمن اولیا و مربیان') > -1, 'عنوان صفحه نیست');
  const inText = (n) => W(`document.querySelector('.main').textContent.indexOf(rial(${n})) > -1`);
  assert(inText(60000000), 'جمع کمک‌ها (۶۰ میلیون) درست نیست');
  assert(inText(24000000), 'جمع هزینه‌ها (۲۴ میلیون) درست نیست');
  assert(inText(36000000), 'مانده (۳۶ میلیون) درست نیست');
  assert(h.indexOf('خرید کتاب دانش‌خانه') > -1, 'جدول تراکنش نیست');
  /* شهریه نباید در این صفحه آمارش بیاید */
  assert(h.indexOf('دریافت قسط') === -1, 'تراکنشِ شهریه در صفحهٔ انجمن افتاده');
});

test('A3 — ثبت تراکنش با کلیکِ واقعی: آمار به‌روز می‌شود', () => {
  W(`${setMgr(mgr6)} S.route='association';S.filters={};S.page=1;render()`);
  W(`document.querySelector('#a-asoc').value='ولیٔ دانش‌آموز ۳';`);
  W(`document.querySelector('#a-akind').value='income';`);
  W(`document.querySelector('#a-aamt').value='10000000';`);
  W(`document.querySelector('#a-anote').value='اردوی پاییزی';`);
  W(`document.querySelector('[data-act="assoc-add"]').click()`);
  const h = W(`document.querySelector('.main').innerHTML`);
  assert(h.indexOf('ولیٔ دانش‌آموز ۳ — اردوی پاییزی') > -1, 'تراکنشِ تازه در جدول نیست');
  assert(W(`document.querySelector('.main').textContent.indexOf(rial(70000000)) > -1`), 'جمع کمک‌ها بعد از ثبت به‌روز نشد (۷۰ میلیون)');
  assert(W(`db.transactions.filter(t=>t.school_id===6&&t.category==='کمک مردمی').length`) === 5, 'رکورد در جدولِ transactions نیست');
});

test('A4 — ثبت بدونِ مبلغِ معتبر: رد می‌شود', () => {
  W(`${setMgr(mgr6)} S.route='association';S.filters={};S.page=1;render()`);
  W(`document.querySelector('#a-asoc').value='آزمون';`);
  W(`document.querySelector('#a-aamt').value='';`);
  W(`document.querySelector('[data-act="assoc-add"]').click()`);
  assert(W(`db.transactions.filter(t=>t.school_id===6&&t.category==='کمک مردمی').length`) === 5, 'تراکنشِ بی‌مبلغ ثبت شد!');
});

test('A5 — گاردِ مدرسهٔ غیردولتی: دسترسی مستقیم = «قابل‌اعمال نیست»', () => {
  W(`${setMgr(mgr1)} S.route='association';S.filters={};S.page=1;render()`);
  const h = W(`document.querySelector('.main').innerHTML`);
  assert(h.indexOf('قابل‌اعمال نیست') > -1, 'گاردِ مدرسهٔ غیردولتی کار نمی‌کند');
  assert(h.indexOf('anjam') === -1, 'محتوای صفحه برای غیردولتی رندر شد');
});

test('A6 — دسترسی: معلم رد، مدیر و سوپرادمین قبول', () => {
  const t6 = W(`db.users.find(u=>u.role==='teacher'&&u.school_id===6).id`);
  assert(W(`${setMgr(t6)} canRoute('association')`) === false, 'معلم به انجمن دسترسی دارد!');
  assert(W(`${setMgr(mgr6)} canRoute('association')`) === true, 'مدیر به انجمن دسترسی ندارد');
  const sa = W(`db.users.find(u=>u.role==='superadmin').id`);
  assert(W(`${setMgr(sa)} canRoute('association')`) === true, 'سوپرادمین به انجمن دسترسی ندارد');
});

await __seq;
const total = pass + fail;
console.log('\n' + '─'.repeat(52));
console.log(`انجمن: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
if (consoleErrors.length) {
  console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
  consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
}
console.log('─'.repeat(52) + '\n');
dom.window.close();
process.exit(fail ? 1 : 0);
}
