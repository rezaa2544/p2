#!/usr/bin/env node
/**
 * کارتِ امتیازیِ محدودهٔ اداره (بند D.2)
 *  R1  ساختارِ پنج‌بُعدی و کلیدها
 *  R2  مالی = فقط درصد؛ هیچ مبلغی (۶ رقم+) در خروجیِ چاپی/صفحه نیست
 *  R3  رشد: جهتِ نمره با جهتِ تغییرِ میانگین هم‌خوان است (دادهٔ کنترل‌شده)
 *  R4  بُعدِ بی‌داده (رضایتِ اولیا) null است و در میانگینِ کل نمی‌آید
 *  R5  قلابِ رضایتِ اولیا زنده است: با تزریقِ منبعِ داده پُر می‌شود
 *  R6  روت/اکشن فقط برای اداره و سوپرادمین
 *  R7  خروجیِ چاپی: عنوان + پنج بُعد + دکمهٔ چاپ + یادداشتِ تجمیعی
 *  R8  همهٔ ورودی‌ها esc می‌شوند (XSSِ نامِ اداره در نسخهٔ چاپی)
 *  R9  ادارهٔ بی‌مدرسه: وضعیتِ تهی، بدون کرش
 *  R10 ماژول فقط می‌خواند (نگهبانِ ساختاری: هیچ insert/update/remove)
 *
 * اجرا:  node tests/officescore2.js
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

/* ارقامِ ۶رقم به بالا — هم ASCII هم فارسی (مبالغِ شهریه از این جنس‌اند) */
const BIG_NUM = /[0-9]{6,}|[۰-۹]{6,}/;

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(400);
console.log('\n▸ کارتِ امتیازیِ محدوده (D.2)');

const EO = W(`db.users.find(u=>u.role==='edu_office').id`);
const SA = W(`db.users.find(u=>u.role==='superadmin').id`);
const asUser = (id, route) => W(`S.user=byId('users',${id});S.persona=null;S.boss=null;S.route='${route}';S.filters={};S.page=1;render()`);
const scOf = (id) => W(`(function(){var u=byId('users',${id});return officeScorecard(officeOf(u),officeScopeSchools(officeOf(u)));})()`);
const printOf = (id) => W(`(function(){var u=byId('users',${id});return officeScorecardPrintHTML(officeScorecard(officeOf(u),officeScopeSchools(officeOf(u))));})()`);

/* ── R1 ───────────────────────────────────────────────────────────── */
test('R1 — کارت پنج بُعدِ درست دارد و محدوده مدرسه دارد', () => {
  const sc = scOf(EO);
  assert(sc.schools > 0, 'اداره هیچ مدرسه‌ای در محدوده ندارد');
  assert(sc.dims.length === 5, 'تعداد ابعاد ۵ نیست: ' + sc.dims.length);
  const keys = sc.dims.map((d) => d.key).join(',');
  assert(keys === 'finance,process,growth,parent,manage', 'کلیدها/ترتیب غلط است: ' + keys);
  assert(sc.dims.every((d) => typeof d.title === 'string' && d.title.length > 1), 'عنوانِ بُعد خالی است');
});

/* ── R2 ───────────────────────────────────────────────────────────── */
test('R2 — بُعدِ مالی فقط درصد است: هیچ مبلغی در خروجی نیست', () => {
  const ph = printOf(EO);
  const m = ph.match(BIG_NUM);
  assert(!m, 'عددِ بزرگ (مبلغ) در خروجیِ چاپی پیدا شد: ' + (m && m[0]));
  assert(!/تومان|ریال/.test(ph), 'واحدِ پول در خروجیِ چاپی پیدا شد');
  const sc = scOf(EO);
  const fin = sc.dims[0];
  assert(fin.parts.every((p) => /٪$/.test(p[1])), 'جزئیاتِ مالی باید درصدی باشد: ' + JSON.stringify(fin.parts));
  assert(/درصدِ تجمیعی/.test(fin.note), 'یادداشتِ محرمانگیِ مالی نیست');
  /* صفحه هم نباید مبلغی نشان دهد */
  W(`S.user=byId('users',${EO});S.persona=null;S.boss=null;S.route='officescore';S.filters={}`);
  const page = W(`viewOfficeScore()`);
  const m2 = page.match(BIG_NUM);
  assert(!m2, 'عددِ بزرگ (مبلغ) در صفحه پیدا شد: ' + (m2 && m2[0]));
});

/* ── R3 ───────────────────────────────────────────────────────────── */
test('R3 — رشد: جهتِ امتیاز با جهتِ تغییرِ میانگین هم‌خوان است', () => {
  /* مدرسهٔ موقت با دو نوبتِ کنترل‌شده؛ در پایان کاملاً پاک می‌شود */
  const sch = W(`insert('schools',{name:'مدرسهٔ آزمونِ کارتِ امتیازی',code:'SCT1',level:'متوسطه اول',gender:'پسرانه',active:true,capacity:80,province_id:1,county_id:1,district_id:1,area_kind:'district'})`);
  const sid = sch.id;
  try {
    W(`insert('grades',{school_id:${sid},student_id:16,class_id:1,subject_id:1,teacher_id:4,term:'نوبت اول',exam_type:'کلاسی',score:10,max_score:20,created_at:'2026-06-01'});
       insert('grades',{school_id:${sid},student_id:16,class_id:1,subject_id:1,teacher_id:4,term:'نوبت دوم',exam_type:'کلاسی',score:18,max_score:20,created_at:'2026-08-01'})`);
    const up = W(`(function(){var s=byId('schools',${sid});return officeScorecard(officeOf(byId('users',${EO})),[s]).dims[2];})()`);
    assert(up.score !== null, 'امتیازِ رشد محاسبه نشد');
    assert(up.score > 50, 'میانگین رشد کرده ولی امتیاز بالای ۵۰ نیست: ' + up.score);
    assert(up.label === 'روبه‌رشد', 'برچسب باید «روبه‌رشد» باشد: ' + up.label);

    /* جهتِ معکوس: نوبتِ دوم پایین‌تر */
    const gids = W(`db.grades.filter(g=>g.school_id===${sid}).map(g=>g.id)`);
    gids.forEach((id) => W(`remove('grades',${id})`));
    W(`insert('grades',{school_id:${sid},student_id:16,class_id:1,subject_id:1,teacher_id:4,term:'نوبت اول',exam_type:'کلاسی',score:18,max_score:20,created_at:'2026-06-01'});
       insert('grades',{school_id:${sid},student_id:16,class_id:1,subject_id:1,teacher_id:4,term:'نوبت دوم',exam_type:'کلاسی',score:10,max_score:20,created_at:'2026-08-01'})`);
    const down = W(`(function(){var s=byId('schools',${sid});return officeScorecard(officeOf(byId('users',${EO})),[s]).dims[2];})()`);
    assert(down.score < 50, 'میانگین افت کرده ولی امتیاز زیر ۵۰ نیست: ' + down.score);
    assert(down.label === 'نزولی', 'برچسب باید «نزولی» باشد: ' + down.label);
  } finally {
    const gids = W(`db.grades.filter(g=>g.school_id===${sid}).map(g=>g.id)`);
    gids.forEach((id) => W(`remove('grades',${id})`));
    W(`remove('schools',${sid})`);
  }
  assert(W(`db.schools.filter(s=>s.code==='SCT1').length`) === 0, 'پاک‌سازیِ مدرسهٔ آزمون انجام نشد');
});

/* ── R4 ───────────────────────────────────────────────────────────── */
test('R4 — بُعدِ بی‌داده null است و در میانگینِ کل نمی‌آید (صفرِ ساختگی نه)', () => {
  const sc = scOf(EO);
  const parent = sc.dims.find((d) => d.key === 'parent');
  assert(parent.score === null, 'بُعدِ رضایت باید تهی باشد: ' + parent.score);
  assert(parent.band === 'none', 'باندِ بُعدِ بی‌داده باید none باشد: ' + parent.band);
  const have = sc.dims.filter((d) => d.score !== null);
  const expect = Math.round(have.reduce((a, d) => a + d.score, 0) / have.length);
  assert(sc.total === expect, `نمرهٔ کل باید میانگینِ فقط ابعادِ دارای داده باشد: ${sc.total} ≠ ${expect}`);
  assert(sc.available === have.length, 'شمارِ ابعادِ دارای داده غلط است');
  assert(sc.missing.indexOf('parent') > -1, 'بُعدِ بی‌داده در فهرستِ missing نیست');
  const ph = printOf(EO);
  assert(/داده‌ای نیست|بی‌داده/.test(ph), 'خروجیِ چاپی بی‌داده‌بودن را اعلام نمی‌کند');
});

/* ── R5 ───────────────────────────────────────────────────────────── */
test('R5 — قلابِ رضایتِ اولیا زنده است (با منبعِ داده پُر می‌شود)', () => {
  const sc = scOf(EO);
  const sid = W(`officeScopeSchools(officeOf(byId('users',${EO})))[0].id`);
  W(`db.parent_surveys=[{id:9001,school_id:${sid},score:80},{id:9002,school_id:${sid},score:60}]`);
  try {
    const v = W(`parentSatisfactionScore((function(){var ids={};ids[${sid}]=1;return ids;})())`);
    assert(v === 70, 'میانگینِ نظرسنجی باید ۷۰ باشد: ' + v);
    const sc2 = scOf(EO);
    const p2 = sc2.dims.find((d) => d.key === 'parent');
    assert(p2.score === 70, 'بُعدِ رضایت از قلاب پُر نشد: ' + p2.score);
    assert(p2.band === 'warn', 'باندِ ۷۰ باید warn باشد: ' + p2.band);
    assert(sc2.available === sc.available + 1, 'با پُر شدنِ بُعد، شمارِ ابعاد باید یکی بیشتر شود');
  } finally {
    W(`delete db.parent_surveys`);
  }
  assert(W(`typeof db.parent_surveys`) === 'undefined', 'پاک‌سازیِ منبعِ آزمون انجام نشد');
});

/* ── R6 ───────────────────────────────────────────────────────────── */
test('R6 — روت و اکشنِ چاپ فقط برای اداره و سوپرادمین', () => {
  const allowed = W(`['edu_office','superadmin','manager','teacher','student','parent','counselor','driver'].filter(function(r){return canRoute('officescore',r);}).join(',')`);
  assert(allowed === 'edu_office,superadmin', 'دسترسیِ روت غلط است: ' + allowed);
  const roles = W(`(ACTION_ROLES['office-score-print']||[]).join(',')`);
  assert(roles === 'edu_office,superadmin', 'نقش‌هایِ اکشن غلط است: ' + roles);
  assert(W(`canAction('office-score-print','teacher')`) === false, 'دبیر نباید بتواند چاپ کند');
  assert(W(`canAction('office-score-print','edu_office')`) === true, 'اداره باید بتواند چاپ کند');
  assert(W(`canAction('office-score-print','superadmin')`) === true, 'سوپرادمین باید بتواند چاپ کند');
});

/* ── R7 ───────────────────────────────────────────────────────────── */
test('R7 — خروجیِ چاپی کامل و مستقل است (عنوان، ۵ بُعد، دکمه، یادداشت)', () => {
  const ph = printOf(EO);
  const titles = W(`[SC_DIM_TITLES.finance,SC_DIM_TITLES.process,SC_DIM_TITLES.growth,SC_DIM_TITLES.parent,SC_DIM_TITLES.manage]`);
  titles.forEach((t) => assert(ph.indexOf(t) > -1, 'بُعد در خروجیِ چاپی نیست: ' + t));
  const name = W(`officeOf(byId('users',${EO})).name`);
  assert(ph.indexOf(name) > -1, 'نامِ اداره در خروجیِ چاپی نیست');
  assert(/window\.print\(\)/.test(ph), 'دکمهٔ چاپ نیست');
  assert(/تجمیعی/.test(ph), 'یادداشتِ «فقط تجمیعی» در چاپ نیست');
  assert(/<html lang="fa" dir="rtl">/.test(ph), 'سندِ چاپ RTL نیست');
});

/* ── R8 ───────────────────────────────────────────────────────────── */
test('R8 — نامِ اداره escape می‌شود (XSS در نسخهٔ چاپی و صفحه)', () => {
  const oid = W(`officeOf(byId('users',${EO})).id`);
  const orig = W(`byId('offices',${oid}).name`);
  W(`byId('offices',${oid}).name='<img src=x onerror="window.__xss=1">'`);
  try {
    const ph = printOf(EO);
    assert(!/<img/i.test(ph), 'تگِ خام در خروجیِ چاپی ماند — esc اعمال نشده');
    assert(/&lt;img|\u003cimg/.test(ph) || ph.indexOf('<img') === -1, 'خروجی باید escape‌شده باشد');
    W(`S.user=byId('users',${EO});S.route='officescore';S.filters={}`);
    const page = W(`viewOfficeScore()`);
    assert(!/<img/i.test(page), 'تگِ خام در صفحه ماند');
  } finally {
    W(`byId('offices',${oid}).name=${JSON.stringify(orig)}`);
  }
  assert(W(`byId('offices',${oid}).name`) === orig, 'نامِ اداره بازگردانده نشد');
});

/* ── R9 ───────────────────────────────────────────────────────────── */
test('R9 — ادارهٔ بی‌مدرسه: وضعیتِ تهی و بدون کرش', () => {
  const sc = W(`officeScorecard({id:99999,name:'ادارهٔ خیالی',level:'district',province_id:98765,county_id:null,district_id:null},[])`);
  assert(sc.schools === 0, 'شمارِ مدارس باید صفر باشد');
  assert(sc.dims.every((d) => d.score === null), 'هیچ بُعدی نباید نمره بگیرد');
  assert(sc.total === null, 'نمرهٔ کل باید تهی باشد: ' + sc.total);
  assert(sc.band === 'none', 'باند باید none باشد');
  W(`S.user=byId('users',${SA});S.persona=null;S.boss=null;S.route='officescore';S.filters=[];S.filters={}`);
  const oid = W(`officeOf(byId('users',${SA}))?(officeOf(byId('users',${SA})).id):null`);
  assert(oid === null, 'سوپرادمین نباید اداره داشته باشد');
  const scAll = W(`officeScorecard(null,db.schools.slice())`);
  assert(scAll.schools === W(`db.schools.length`), 'برای سوپرادمین همهٔ مدارس باید دیده شوند');
});

/* ── R10 ──────────────────────────────────────────────────────────── */
test('R10 — ماژول فقط می‌خواند (هیچ نوشتنِ مستقیم ندارد)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/js/69-office-scorecard.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')     /* توضیحاتِ بلوکی */
    .replace(/(^|[^:])\/\/.*$/gm, '$1');  /* توضیحاتِ خطی */
  const bad = src.match(/\b(insert|update|remove|applyOp|batchWrites)\s*\(/g) || [];
  assert(bad.length === 0, 'فراخوانیِ نوشتن در ماژول پیدا شد: ' + bad.join(', '));
  assert(/officeScorecard\s*\(/.test(src), 'تابعِ اصلی در ماژول نیست');
});

await __seq;   /* همهٔ آزمون‌ها زنجیره‌ای اجرا می‌شوند — پیش از جمع‌بندی صبر کن */

console.log(`\nبررسی — ${pass + fail} مورد: ✅ ${pass} · ❌ ${fail}` + (fail ? '' : '  —  بدون خطا ✅'));
if (errors.length) console.log('خطاها:\n' + errors.join('\n'));
if (consoleErrors.length) {
  console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
  consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
}
dom.window.close();
process.exit(fail ? 1 : 0);
}
