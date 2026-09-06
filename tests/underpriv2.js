#!/usr/bin/env node
/**
 * سئوتِ شاخصِ صریحِ کم‌برخوردار (دور ۷۹ بند ۶ — مورد ۲.۳ نقشه)
 *  - rule: کم‌برخوردار = area_kind==='village' (ساختاری، نه عملکردی)
 *  - بجِ ردیفی 🟤 + شمارشِ سربرگ + فیلترِ «فقط کم‌برخوردار» (data-f=ounder)
 *  - استقلالِ ساختاری: نمرهٔ بالا بج را نمی‌برد؛ فیلترِ ترکیبی درست می‌بندد
 *  - پاک‌سازی = آخرین تست زنجیر (درسِ دور ۷۹ بند ۴)
 *
 * اجرا:  node tests/underpriv2.js
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
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
dom.window.addEventListener('error', (e) => { if (!/Could not parse CSS/.test(e.message)) { fail++; errors.push('window.onerror: ' + e.message); } });
const W = (s) => dom.window.eval(s);

/* نشانه‌های فارسی با کدپوینتِ صریح (ضدِ افتِ کاراکتر) */
const UP = String.fromCharCode(0x6A9, 0x645, 0x200C, 0x628, 0x631, 0x62E, 0x648, 0x631, 0x62F, 0x627, 0x631); /* کم‌برخوردار */

/* مدرسهٔ هدف: ۴ (در دمو district است) — پاک‌سازی U6 آن را برمی‌گرداند */
const TARGET = 4;

let SA = 0;
let ORIG_GRADES = null;
test('U0 — بوتِ بدون خطا + شناساییِ سوپرادمین', async () => {
  assert(W(`typeof render==='function' && typeof schoolIsUnderprivileged==='function'`), 'تابع‌ها تعریف نشده‌اند');
  /* صبر تا دمو نه‌تنها موجود، بلکه _پایدار_ باشد: generate() ممکن است db
     را دوباره جایگزین کند — تا دو نمونهٔ ۱۰۰ms‌فاصله یکی نباشند، تغییر
     داده می‌شود و از بین می‌رود. */
  const t0 = Date.now();
  let ref = null, stable = 0;
  while (Date.now() - t0 < 6000) {
    const cur = W(`(()=>{try{return (db&&db.users&&db.users.length)?db:null}catch(e){return null}})()`);
    if (cur && cur === ref) { stable++; if (stable >= 1) break; }
    else { ref = cur; stable = 0; }
    await new Promise(r => setTimeout(r, 100));
  }
  assert(ref !== null, 'دمو آماده نشد');
  SA = W(`db.users.find(u=>u.role==='superadmin').id`);
  assert(SA, 'سوپرادمین نیست');
  assert(W(`db.schools.find(s=>s.id===${TARGET}).area_kind`) === 'district', 'پیش‌فرضِ دمو باید district باشد');
});

const go = (flt) => W(`S.user=byId('users',${SA});S.persona=null;S.boss=null;S.route='officeschools';S.filters=${flt};S.page=1;render()`);

test('U1 — rule: ساختاری، نه عملکردی', () => {
  assert(W(`schoolIsUnderprivileged({area_kind:'village'})`) === true, 'village باید کم‌برخوردار باشد');
  assert(W(`schoolIsUnderprivileged({area_kind:'district'})`) === false, 'district کم‌برخوردار نیست');
  assert(W(`schoolIsUnderprivileged({})`) === false, 'حالتِ خالی: خیر');
  assert(W(`schoolIsUnderprivileged(undefined)`) === false, 'undefined: بدون خطا خیر');
});

test('U2 — دموِ سالم: هیچ بجِ کم‌برخوردار نیست', () => {
  go('{}');
  const h = W(`document.querySelector('.main').innerHTML`);
  assert(h.indexOf(UP) === -1, 'در دموی سالم (همه district) بج/شمارشِ کم‌برخوردار نباید باشد');
});

test('U3 — تغییرِ واقعی: مدرسهٔ ۴ روستایی می‌شود → بجِ ردیفی + شمارشِ سربرگ', async () => {
  ORIG_GRADES = W(`JSON.stringify(db.grades.filter(g=>g.school_id===${TARGET}||g.school_id===1).map(g=>[g.id,g.score,g.max_score]))`);
  W(`db.schools.find(s=>s.id===${TARGET}).area_kind='village'`);
  await new Promise(r => setTimeout(r, 150)); /* اطمینان از پایانِ هر جایگزینیِ احتمالیِ db */
  assert(W(`db.schools.find(s=>s.id===${TARGET}).area_kind`) === 'village', 'db بعد از تغییر جایگزین شد (بوت ناپایدار)');
  go('{}');
  const h = W(`document.querySelector('.main').innerHTML`);
  const name4 = W(`db.schools.find(s=>s.id===${TARGET}).name`);
  const i4 = h.indexOf(name4);
    assert(i4 > -1, 'مدرسهٔ ۴ در فهرست نیست');
  assert(h.slice(i4, i4 + 1200).indexOf(UP) > -1, 'بجِ کم‌برخوردار روی ردیفِ مدرسهٔ ۴ نیست');
  assert(h.indexOf(W(`fa(1)`) + ' ' + UP) > -1, 'شمارشِ سربرگ (۱ ' + UP + ') نیست');
  const name1 = W(`db.schools.find(s=>s.id===1).name`);
  const i1 = h.indexOf(name1);
  assert(h.slice(i1, i1 + 1200).indexOf(UP) === -1, 'مدرسهٔ شهریِ سالم بجِ کم‌برخوردار گرفت!');
});

test('U4 — استقلالِ ساختاری: میانگینِ ۲۰ نمی‌تواند بج را ببرد', () => {
  /* همهٔ نمراتِ مدرسهٔ ۴ را واقعاً ۲۰ می‌کنیم */
  W(`(function(){var gs=db.grades.filter(g=>g.school_id===${TARGET});gs.forEach(g=>{g.score=20;g.max_score=20;});return gs.length;})()`);
  go('{}');
  const h = W(`document.querySelector('.main').innerHTML`);
  const name4 = W(`db.schools.find(s=>s.id===${TARGET}).name`);
  const i4 = h.indexOf(name4);
  assert(h.slice(i4, i4 + 1200).indexOf(UP) > -1, 'با میانگینِ ۲۰، بجِ ساختاریِ کم‌برخوردار افتاد!');
  const sig = W(`(function(){var r=perSchoolRows(db.schools.filter(s=>s.id===${TARGET}))[0];return JSON.stringify(schoolSupportSignals(r));})()`);
  assert(sig.indexOf(String.fromCharCode(0x631, 0x648, 0x633, 0x62A, 0x627, 0x6CC, 0x6CC)) > -1,
    'سیگنالِ روستایی باید همچنان در سیگنال‌هایِ نیازمندی باشد: ' + sig);
  /* نیمهٔ منفی: مدرسهٔ شهریِ (district) با میانگینِ پایین «نیازمندِ عتِمَام»
     است — ولی کم‌برخوردار نیست: بجِ 🟠 دارد، بجِ 🟤 نباید داشته باشد */
  W(`(function(){db.grades.filter(g=>g.school_id===1).forEach(g=>{g.score=5;g.max_score=20;});})()`);
  go('{}');
  const h4 = W(`document.querySelector('.main').innerHTML`);
  const name1b = W(`db.schools.find(s=>s.id===1).name`);
  const i1b = h4.indexOf(name1b);
  assert(i1b > -1, 'ردیفِ مدرسهٔ ۱ نیست');
  const row1 = h4.slice(i1b, i1b + 1200);
    assert(row1.indexOf('🟠') > -1, 'میانگینِ ۵ باید بجِ نیازمندی می‌زد');
  assert(row1.indexOf(UP) === -1, 'مدرسهٔ شهری (با هر میانگینی) بجِ کم‌برخوردار گرفت — شاخص ساختاری، عملکردی شده است!');
});

test('U5 — فیلترِ «فقط کم‌برخوردار» + ترکیب با «فقط نیازمند»', () => {
  go(`{ounder:'1'}`);
  const h = W(`document.querySelector('.main').innerHTML`);
  const name4 = W(`db.schools.find(s=>s.id===${TARGET}).name`);
  const name1 = W(`db.schools.find(s=>s.id===1).name`);
  assert(h.indexOf(name4) > -1, 'مدرسهٔ کم‌برخوردار در فیلتر نیست');
  assert(h.indexOf(name1) === -1, 'مدرسهٔ شهری در فیلترِ «فقط کم‌برخوردار» مانده!');
  /* ترکیب: هر مدرسهٔ روستایی همیشه سیگنالِ ساختاریِ «مدرسهٔ روستایی» را در
     سیگنال‌هایِ دور ۶۵ دارد، پس با onesup هم می‌ماند؛ ولی مدرسهٔ شهریِ سالم
     (بدونِ سیگنال) با onesup خارج می‌شود — هر دو شرطِ فیلترِ ترکیبی صحت دارد */
  go(`{ounder:'1',onesup:'1'}`);
  const h2 = W(`document.querySelector('.main').innerHTML`);
  assert(h2.indexOf(name4) > -1, 'مدرسهٔ روستاییِ ترکیب (روستایی + سیگنالِ روستایی) بیرون رفته!');
  assert(h2.indexOf(name1) === -1, 'مدرسهٔ شهریِ سالم در فیلترِ ترکیبی مانده!');
});

test('U6 — پاک‌سازی: دمو برمی‌گردد + قراردادِ دور ۶۵ سالم', () => {
  assert(ORIG_GRADES, 'ذخیرهٔ نمراتِ اصلی گم شده');
  W(`(function(){var m=${ORIG_GRADES};m.forEach(function(x){var g=db.grades.find(function(y){return y.id===x[0];});if(g){g.score=x[1];g.max_score=x[2];}});})()`);
  W(`db.schools.find(s=>s.id===${TARGET}).area_kind='district'`);
  go('{}');
  const h = W(`document.querySelector('.main').innerHTML`);
  assert(h.indexOf(UP) === -1, 'پس از پاک‌سازی، بج/شمارشِ کم‌برخوردار هنوز هست!');
  assert(h.indexOf('بدون موردِ ویژه') > -1, 'سربرگِ «بدون موردِ ویژه» برگشته نیست (دور ۶۵)');
});

__seq.then(() => {
  console.log('\n────────────────────────────────────────────────────');
  console.log(`underpriv2 (شاخصِ کم‌برخوردار): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
  if (errors.length) { console.log('\nخطاها:'); errors.slice(0, 10).forEach(e => console.log(' •', e)); }
  console.log('────────────────────────────────────────────────────');
  process.exit(fail ? 1 : 0);
});
