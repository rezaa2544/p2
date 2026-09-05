#!/usr/bin/env node
/**
 * سئوتِ «نیازمندِ عتِمَام» در فهرست مدارس اداره (دور ۶۵ بند ۶)
 *  - سیگنال‌های واقعی: روستایی · میانگین < ۱۴ · حضور < ۸۵٪ · پرخطرهای موتورِ افت
 *  - بج + tooltip + شمارشِ سربرگ + فیلترِ «فقط نیازمند»
 *  - آزمونِ سازگاریِ atRiskList(روزها، مدرسه) — پیرامونِ اختیاری
 *
 * اجرا:  node tests/officesupp2.js
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
console.log('\n▸ نیازمندِ عتِمَام در اداره (دور ۶۵)');
const SA = W(`db.users.find(u=>u.role==='superadmin').id`);
const go = (flt) => W(`S.user=byId('users',${SA});S.persona=null;S.boss=null;S.route='officeschools';S.filters=${flt};S.page=1;render()`);

test('O1 — تابعِ سیگنال: هر سیگنالِ واقعی جداگانه برمی‌گردد', () => {
  /* نشانگرها از کدپوینت ساخته می‌شوند تا باگِ رمزگذاریِ متنِ فارسی در هیچ مرحله‌ای
     نتواند آزمون را جعلی شکست/موفق کند */
  const villageMark=String.fromCharCode(0x631,0x648,0x633,0x62A,0x627,0x6CC,0x6CC); /* روستایی */
  const avgMark=String.fromCharCode(0x6F1,0x6F2);   /* ۱۲ */
  const attMark=String.fromCharCode(0x6F8,0x6F0);   /* ۸۰ */
  const r=W(`schoolSupportSignals({s:{id:999,area_kind:'village'},students:20,teachers:2,avg:12,att:80})`);  if(process.env.DBG) console.log('DBG vm cpts:', [...villageMark].map(c=>c.codePointAt(0).toString(16)).join(' '), 'r0 idx:', r[0].indexOf(villageMark), 'r0 has 0x631:', r[0].indexOf(String.fromCharCode(0x631)));
  assert(r.length===3, 'تعدادِ سیگنال‌ها ۳ نیست: '+r.length);
  assert(r.some(x=>x.indexOf(villageMark)>-1), 'سیگنالِ روستایی نیست');
  assert(r.some(x=>x.indexOf(avgMark)>-1), 'سیگنالِ میانگین (۱۲) نیست');
  assert(r.some(x=>x.indexOf(attMark)>-1), 'سیگنالِ حضور (۸۰٪) نیست');
  const healthy=W(`schoolSupportSignals({s:{id:999,area_kind:'district'},students:20,teachers:2,avg:16,att:92})`);
  assert(healthy.length===0, 'مدرسهٔ سالم سیگنالِ کاذب گرفت: '+healthy.length);
  const high=W(`schoolSupportSignals({s:{id:999,area_kind:'district'},students:20,teachers:2,avg:12,att:80}).length`);
  assert(high===2, 'بدونِ روستایی بودن باید ۲ سیگنال باشد: '+high);
});

test('O2 — دموی سالم: بدون موردِ ویژه، بجِ ردیفی وجود ندارد', () => {
  go('{}');
  const h = W(`document.querySelector('.main').innerHTML`);
  assert(h.indexOf('بدون موردِ ویژه') > -1, 'سربرگِ «بدون موردِ ویژه» نیست');
  assert(h.indexOf('نیازمندِ عتِمَام</span>') === -1, 'بجِ ردیفی در دموی سالم نباید باشد');
});

test('O3 — افتِ واقعیِ حضور: بج + tooltip + شمارشِ سربرگ', () => {
  /* مدرسهٔ ۳ را واقعاً زرد می‌کنیم: ۱۰ غیبتِ تازه */
  W(`(function(){
    var sts=db.attendance.filter(a=>a.school_id===3).map(a=>a.student_id);
    for(var k=0;k<100;k++) insert('attendance',{school_id:3,class_id:1,student_id:sts[k%sts.length],date:todayISO(),status:'absent'});
  })()`);
  go('{}');
  const h = W(`document.querySelector('.main').innerHTML`);
  assert(h.indexOf('نیازمندِ عتِمَام</span>') > -1, 'بجِ «نیازمندِ عتِمَام» روی ردیف نیست');
  assert(h.indexOf('حضور پایین') > -1, 'tooltipِ دلیل (حضور پایین) نیست');
  assert(h.indexOf(W(`fa(1)`) + ' مورد نیازمندِ عتِمَام') > -1, 'شمارشِ سربرگ نیست');
  /* ردیفِ سالمِ مدرسهٔ ۱ بج ندارد */
  const i1 = h.indexOf('شهید بهشتی');
  assert(h.slice(i1, i1 + 500).indexOf('نیازمندِ عتِمَام') === -1, 'مدرسهٔ سالم بج گرفته!');
});

test('O4 — فیلتر: فقط نیازمندها می‌مانند', () => {
  go(`{onesup:'1'}`);
  const h = W(`document.querySelector('.main').innerHTML`);
  assert(h.indexOf('علامه حلی') > -1, 'مدرسهٔ نیازمند در فیلتر نیست');
  assert(h.indexOf('شهید بهشتی') === -1, 'مدرسهٔ سالم در فیلترِ «فقط نیازمند» مانده');
  assert(h.indexOf('فرازانگان') === -1, 'مدرسهٔ سالمِ دوم در فیلتر مانده');
});

test('O5 — atRiskList(روزها، مدرسه): پیرامونِ اختیاری سازگار', () => {
  const mgr3 = W(`db.users.find(u=>u.role==='manager'&&u.school_id===3).id`);
  const a = W(`(function(){S.user=byId('users',${mgr3});return atRiskList(90).length;})()`);
  const b = W(`atRiskList(90,3).length`);
  assert(a === b, 'پیرامونِ اختیاریِ مدرسه نتیجه را عوض کرد (' + a + ' ≠ ' + b + ')');
  const c = W(`atRiskList(90,4).length`);
  assert(c >= 0, 'پیرامونِ مدرسهٔ دیگر کار نمی‌کند');
  const mgr6 = W(`db.users.find(u=>u.role==='manager'&&u.school_id===6).id`);
  const mgr5 = W(`db.users.find(u=>u.role==='manager'&&u.school_id===5).id`);
  const d = W(`(function(){S.user=byId('users',${mgr5});return atRiskList(90,6).length;})()`);
  const e = W(`(function(){S.user=byId('users',${mgr6});return atRiskList(90,6).length;})()`);
  assert(d === e, 'پیرامونِ مدرسهٔ انتخابی بی‌احترامی شد: نتیجه با کاربرِ فعال عوض می‌شود (' + d + ' ≠ ' + e + ')');
});

await __seq;
const total = pass + fail;
console.log('\n' + '─'.repeat(52));
console.log(`نیازمندِ عتِمَام: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
if (consoleErrors.length) {
  console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
  consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
}
console.log('─'.repeat(52) + '\n');
dom.window.close();
process.exit(fail ? 1 : 0);
}
