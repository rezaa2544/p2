#!/usr/bin/env node
/**
 * تست‌های شمارهٔ سریال کتاب (بند ۶.۳ — یکپارچه با کتابخانه)
 *  - سریال اختیاری، در هر مدرسه یکتا
 *  - ثبت با فرمِ کتابِ جدید + مودالِ جدا برای ویرایش
 *  - تکراریِ هم‌مدرسه رد می‌شود؛ مدرسهٔ دیگر آزاد است
 *  - بجِ امانت، سریالِ کپی را نشان می‌دهد
 *  - فقط مدیر
 *
 * اجرا:  node tests/libserial2.js   (نیازمند jsdom)
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(1); }

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

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(400);
console.log('\n▸ شمارهٔ سریال کتاب (بند ۶.۳)');

test('L0 بوت بدون خطا + سریال در دادهٔ نمونه', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  const has = W(`db.lib_books.some(function(b){return b.serial;})`);
  assert(has, 'هیچ کتابِ نمونهٔ سریال‌دار نیست');
});

const ctx = W(`(function(){
  var b1=db.lib_books.find(function(b){return b.serial==='SN-K10-001';});
  var b2=db.lib_books.find(function(b){return b.serial==='SN-LIT-114';});
  var m1=db.users.find(function(u){return u.role==='manager'&&u.school_id===b1.school_id;});
  var m2=db.users.find(function(u){return u.role==='manager'&&u.school_id!==b1.school_id;});
  var t1=db.users.find(function(u){return u.role==='teacher'&&u.school_id===b1.school_id;});
  return {b1:b1.id,b2:b2.id,school:b1.school_id,m1:m1.id,m2:m2.id,t1:t1.id};
})()`);
assert(ctx.b1 && ctx.b2, 'کتاب‌های نمونه نیست');

const asUser = (uid, route) => W(`(function(){
  S.user=byId('users',${uid});S.persona=null;S.boss=null;
  S.filters={};S.route=${JSON.stringify(route||'library')};S.tab='';render();
})()`);

test('L1 کتابِ تازه با سریال (تابع) ذخیره می‌شود', () => {
  asUser(ctx.m1);
  const before = W(`db.lib_books.length`);
  const r = W(`libAddBook('کتابِ تست سریال','تست','TT-01','SN-TT-001')`);
  assert(r.ok === true, 'libAddBook خطا داد: ' + (r.msg || ''));
  assert(W(`db.lib_books.length`) === before + 1, 'رکورد ساخته نشد');
  const nb = W(`db.lib_books[db.lib_books.length-1]`);
  assert(nb.serial === 'SN-TT-001', 'سریال ذخیره نشد');
  W(`remove('lib_books',${nb.id})`);
});

test('L2 سریالِ تکراری در همان مدرسه رد می‌شود', () => {
  asUser(ctx.m1);
  const before = W(`db.lib_books.length`);
  const r = W(`libAddBook('تکراری','تست','TT-02','SN-LIT-114')`);
  assert(r.ok === false, 'سریالِ تکراری پذیرفته شد!');
  assert(W(`db.lib_books.length`) === before, 'رکوردِ تکراری ساخته شد!');
});

test('L3 همان سریال در مدرسهٔ دیگر آزاد است', () => {
  asUser(ctx.m2);
  const before = W(`db.lib_books.length`);
  const r = W(`libAddBook('مدرسهٔ دیگر','تست','TT-03','SN-LIT-114')`);
  assert(r.ok === true, 'مدرسهٔ دیگر مجاز نیست: ' + (r.msg || ''));
  const nb = W(`db.lib_books[db.lib_books.length-1]`);
  assert(nb.serial === 'SN-LIT-114', 'سریال ذخیره نشد');
  W(`remove('lib_books',${nb.id})`);
});

test('L4 مودالِ سریال: تغییر + ردِ تکراری (اثرِ toast)', () => {
  asUser(ctx.m1);
  W(`document.querySelector('[data-act="lib-serial"][data-id="${ctx.b2}"]').click()`);
  W(`(function(){
    document.getElementById('lib_ser2').value='SN-LIT-200';
    document.querySelector('[data-act="lib-serial-save"]').click();
  })()`);
  assert(W(`byId('lib_books',${ctx.b2}).serial`) === 'SN-LIT-200', 'سریال ویرایش نشد');
  /* حالا سریالِ تکراری از همان مودال */
  W(`document.querySelector('[data-act="lib-serial"][data-id="${ctx.b2}"]').click()`);
  W(`(function(){
    document.getElementById('lib_ser2').value='SN-K10-001';
    document.querySelector('[data-act="lib-serial-save"]').click();
  })()`);
  assert(W(`byId('lib_books',${ctx.b2}).serial`) === 'SN-LIT-200', 'سریالِ تکراری پذیرفته شد!');
  const toasts = W(`(document.getElementById('toasts')||{}).innerHTML||''`);
  assert(toasts.indexOf('کتاب دیگری') > -1, 'هشدارِ تکراریِ سریال نمایش داده نشد');
  W(`(function(){var b=document.querySelector('[data-act="modal-close"]');if(b)b.click();})();`);
});

test('L5 بجِ امانت سریالِ کپی را نشان می‌دهد', () => {
  const loaned = W(`(function(){
    var l=db.lib_loans.filter(function(x){return !x.returned_at&&byId('lib_books',x.book_id).serial;})[0];
    return l?byId('lib_books',l.book_id).serial:null;
  })()`);
  assert(!!loaned, 'امانتِ فعالِ کتابِ سریال‌دار در دمو نیست');
  asUser(ctx.m1);
  const root = W(`document.getElementById('root').innerHTML`);
  assert(root.indexOf('(سریال: ' + loaned + ')') > -1, 'سریال در بجِ امانت نیست');
});

test('L6 دبیر: ثبت/ویرایش سریال مسدود', () => {
  asUser(ctx.t1);
  const r1 = W(`libAddBook('دبیر','تست','TT-04','SN-T-1')`);
  assert(r1.ok === false, 'دبیر کتابِ سریال‌دار ساخت!');
  const r2 = W(`libSetSerial(${ctx.b1},'SN-HACK')`);
  assert(r2.ok === false, 'دبیر سریال ویرایش کرد!');
  assert(W(`byId('lib_books',${ctx.b1}).serial`) === 'SN-K10-001', 'سریالِ دمو دست‌خورد');
});

await sleep(100);
console.log('\n────────────────────────────────────────────────────');
console.log(`libserial2 (سریال کتاب): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
if (fail) process.exit(1);
process.exit(0);
}
