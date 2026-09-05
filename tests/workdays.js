#!/usr/bin/env node

/**
 * سئوتِ روزهای کاری (دور ۶۵):
 *  - پیش‌فرض شنبه تا سه‌شنبه (چهارشنبه خاموش)
 *  - چهارشنبه برای مدرسهٔ پنج‌روزه روز کاری است
 *  - روز جبرانی: جمعهٔ ثبت‌شده به‌عنوان روز کاری، با برنامهٔ شنبه
 *  - مودال مدرسه: ۷ چک‌باکس + ذخیره در school-save
 *
 * اجرا:  node tests/workdays.js   (نیازمند jsdom)
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
const testQueue = [];
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) {
      fail++; errors.push(`${name}: ${e.message}`);
      console.log(`  ❌ ${name}\n     ${e.message}`);
      resolve(); return;
    }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; errors.push(`${name}: ${e.message}`); console.log(`  ❌ ${name}\n     ${e.message}`); }
    ).then(resolve);
  }));
  __seq = p;
  testQueue.push(p);
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

console.log('\n▸ روزهای کاری (دور ۶۵)');

/* ۲۰۲۶-۰۹-۰۵ شنبه · ۲۰۲۶-۰۹-۰۳ پنجشنبه (ایندکسِ ۵ — روزِ اختیاری) · ۲۰۶-۰۹-۱۱ جمعه */
const THU = "new Date('2026-09-03T09:05:00')";
const FRI = "new Date('2026-09-11T10:00:00')";
const SAT = "new Date('2026-09-05T09:05:00')";

test('W1 — پیش‌فرض: شنبه تا سه‌شنبه + DAYS_FULL هفت‌عضو', () => {
  assert(W(`DAYS_FULL.length`) === 7, 'DAYS_FULL باید ۷ روز داشته باشد');
  /* مدرسهٔ ۴ (MM-104) کارکردِ work_days ندارد؟ در دادهٔ همه ۴ روز است؛
     یک مدرسهٔ ساختگیِ بدونِ فیلد می‌سازیم تا پیش‌فرض تست شود */
  const sc = W(`(function(){
    var s=insert('schools',{name:'مدرسهٔ پیش‌فرض',code:'WF-901',city:'x',level:'متوسطه اول',type:'عادی',gender:'پسرانه',shift:'صبح',capacity:100,active:1});
    return s.id;})()`);
  assert(JSON.stringify(W(`workDaysOf(${sc})`)) === '[0,1,2,3,4]', 'پیش‌فرض باید شنبه تا چهارشنبه باشد');
  /* پنجشنبه (روزِ اختیاری) برای مدرسهٔ ۵ روزه = تعطیل */
  const th = W(`currentSlot(${sc},${THU})`);
  assert(th.kind === 'holiday', 'پنجشنبه برای مدرسهٔ ۵ روزه باید تعطیل باشد');
  /* و برای SH-101 (شش‌روزهٔ دمو) = روز کاری */
  const th2 = W(`currentSlot(1,${THU})`);
  assert(th2.kind === 'lesson', 'پنجشنبه برای SH-101 باید زنگ درسی باشد (kind=' + th2.kind + ')');
});

test('W2 — isWorkDay: پنجشنبه برای مدرسهٔ ۵ روزه خاموش، برای SH-101 روشن', () => {
  const th4 = W(`isWorkDay(4, '2026-09-03', new Date('2026-09-03T09:00:00'))`);
  assert(th4 === false, 'پنجشنبه برای مدرسهٔ ۵ روزه نباید روز کاری باشد');
  const th1 = W(`isWorkDay(1, '2026-09-03', new Date('2026-09-03T09:00:00'))`);
  assert(th1 === true, 'پنجشنبه برای SH-101 باید روز کاری باشد');
  const sat = W(`isWorkDay(4, daysAgoISO(0))`);
  assert(sat === true, 'شنبه (امروز) باید روز کاری باشد');
});

test('W3 — روز جبرانی: جمعهٔ ثبت‌شده روز کاری می‌شود + برنامهٔ شنبه', () => {
  const info = W(`(function(){
    var mk=(db.makeup_classes||[])[0];
    if(!mk) return null;
    return {sid:mk.school_id, date:mk.date};
  })()`);
  assert(info, 'دموی روز جبرانی در دادهٔ نمونه نیست');
  const t = `new Date('${info.date}T09:05:00')`;
  const slot = W(`currentSlot(${info.sid},${t})`);
  assert(slot.kind !== 'holiday', 'روزِ جبرانی نباید «روز تعطیل» باشد (kind=' + slot.kind + ')');
  assert(slot.kind === 'lesson', 'روز جبرانی باید زنگ درسی نشان دهد (kind=' + slot.kind + ')');
  assert(slot.schedDay === 0, 'برنامهٔ شنبه باید اعمال شود (schedDay=' + slot.schedDay + ')');
  /* همون تاریخ برای مدرسهٔ بدونِ جبرانی = تعطیل */
  const other = W(`db.schools.find(s=>s.id!==${info.sid}&&s.id!==1).id`);
  const slot2 = W(`currentSlot(${other},${t})`);
  assert(slot2.kind === 'holiday', 'همان جمعه برای مدرسهٔ دیگر باید تعطیل باشد');
});

test('W4 — مودالِ مدرسه: ۷ چک‌باکس روز + ذخیره با school-save', () => {
  /* school-save فقط برای سوپرادمین باز است (جدولِ مجوزها) */
  const sup = W(`db.users.find(u=>u.role==='superadmin').id`);
  W(`S.user=byId('users',${sup});S.persona=null;S.boss=null;`);
  /* مودالِ مدرسهٔ ۱ (شش‌روزه) — باید ۶ تیک داشته باشد */
  W(`schoolModal(byId('schools',1))`);
  /* دمو جغرافیا ندارد؛ برای عبور از اعتبارسنجیِ school-save، استان/شهرستان بگذار */
  W(`(function(){
    var pv=db.provinces[0];
    var cy=db.counties.find(c=>c.province_id===pv.id)||db.counties[0];
    document.getElementById('m_prov').value=String(pv.id);
    document.getElementById('m_county').value=String(cy.id);
  })()`);
  let n = W(`document.querySelectorAll('.m-wd:checked').length`);
  assert(n === 6, 'مدرسهٔ شش‌روزه باید ۶ چک‌باکس روشن داشته باشد (n=' + n + ')');
  /* چک‌باکسِ پنجشنبه را خاموش می‌کنیم و با کلیکِ واقعی ذخیره می‌کنیم */
  W(`document.querySelectorAll('.m-wd')[5].checked=false;`);
  W(`document.querySelector('[data-act="school-save"]').click()`);
  const wd = W(`byId('schools',1).work_days`);
  assert(JSON.stringify(wd) === '[0,1,2,3,4]', 'ذخیرهٔ school-save باید work_days را به‌روز کند (wd=' + JSON.stringify(wd) + ')');
  /* پنجشنبهٔ SH-101 حالا تعطیل می‌شود */
  const th = W(`currentSlot(1,${THU})`);
  assert(th.kind === 'holiday', 'پس از خاموش‌کردنِ پنجشنبه، باید تعطیل شود');
  /* برگردان: ۵ روز دوباره (مودالِ تازه + کلیکِ واقعی) */
  W(`schoolModal(byId('schools',1))`);
  W(`(function(){
    var pv=db.provinces[0];
    var cy=db.counties.find(c=>c.province_id===pv.id)||db.counties[0];
    document.getElementById('m_prov').value=String(pv.id);
    document.getElementById('m_county').value=String(cy.id);
  })()`);
  W(`document.querySelectorAll('.m-wd')[5].checked=true;document.querySelector('[data-act="school-save"]').click()`);
  assert(JSON.stringify(W(`byId('schools',1).work_days`)) === '[0,1,2,3,4,5]', 'برگردانِ شش‌روزه');
});

test('W5 — افزودن/حذف روز جبرانی از صفحهٔ زنگ‌ها', () => {
  const mgr = W(`db.users.find(u=>u.role==='manager'&&u.school_id===3).id`);
  W(`S.user=byId('users',${mgr});S.persona=null;S.boss=null;S.route='bells';S.filters={};render()`);
  let h = W(`document.querySelector('.main').innerHTML`);
  assert(h.indexOf('روزهای جبرانی') > -1, 'بخشِ روزهای جبرانی نیست');
  const before = W(`(db.makeup_classes||[]).filter(m=>m.school_id===3).length`);
  const date = W(`addDaysISO(todayISO(),14)`);
  W(`document.getElementById('m_mk_date').value='${date}'`);
  W(`document.querySelector('[data-act="makeup-add"]').click()`);
  let n = W(`(db.makeup_classes||[]).filter(m=>m.school_id===3&&m.date==='${date}').length`);
  assert(n === 1, 'افزودن روز جبرانی ثبت نشد');
  n = W(`(db.makeup_classes||[]).filter(m=>m.school_id===3).length`);
  assert(n === before + 1, 'تعداد جبرانی‌ها یکی بیشتر شد');
  /* تکرار همان تاریخ رد می‌شود */
  W(`document.querySelector('[data-act="makeup-add"]').click()`);
  n = W(`(db.makeup_classes||[]).filter(m=>m.school_id===3&&m.date==='${date}').length`);
  assert(n === 1, 'تکرارِ تاریخ باید رد شود');
  /* حذف با کلیکِ واقعی */
  const mkId = W(`(db.makeup_classes||[]).filter(m=>m.school_id===3&&m.date==='${date}')[0].id`);
  W(`document.querySelector('[data-act="makeup-del"][data-id="${mkId}"]').click()`);
  n = W(`(db.makeup_classes||[]).filter(m=>m.school_id===3).length`);
  assert(n === before, 'حذف روز جبرانی کار نکرد');
});

test('W6 — پیش‌گزینشِ خودکارِ حضور در روزِ غیرکاری خاموش می‌ماند', () => {
  /* پنجشنبه برای مدرسهٔ ۵ روزه: bellAutoClass نباید کلاس برگرداند */
  const mgr = W(`db.users.find(u=>u.role==='manager'&&u.school_id===4).id`);
  W(`S.user=byId('users',${mgr});S.persona=null;S.boss=null;`);
  const t = W(`teacherNowClass(db.users.find(u=>u.role==='teacher'&&u.school_id===4).id,4,${THU})`);
  assert(t === null, 'در روزِ غیرکاری، کلاسِ جاریِ دبیر نباید تشخیص داده شود');
});

await Promise.all(testQueue);
const total = pass + fail;
console.log('\n' + '─'.repeat(52));
console.log(`روزهای کاری: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
if (consoleErrors.length) {
  console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
  consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
}
console.log('─'.repeat(52) + '\n');
dom.window.close();
process.exit(fail ? 1 : 0);
}
