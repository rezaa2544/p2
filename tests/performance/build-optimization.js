#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/performance/build-optimization.js — آزمونِ بهینه‌سازیِ build (Wave 24)
   -------------------------------------------------------------------
   پوشش KPI-1 (اندازهٔ index.html < 1.8MB) و KPI-2 (build < 70ms):

   بخش A — درستیِ کوچک‌ساز (tools/minify-source.js):
     A1..A12 واحدهای معناشناسی: کامنت/رشته/تمپلیت/regex/تقسیم/ASI
     A13 هر ۹۴+ ماژولِ strip شده همچنان پارسِ معتبرِ JS است (new Function)
     A14 رشته‌ها و تمپلیت‌های سورس بایت‌به‌بایت در خروجی حفظ می‌شوند
     A15 قطعیت (deterministic): دو بار strip = خروجی یکسان

   بخش B — کشِ افزایشیِ build:
     B1 تغییرِ ماژول → خروجی نو (کشِ کهنه سرو نمی‌شود)
     B2 برگرداندنِ ماژول → خروجی برمی‌گردد (بیت‌به‌بیت با --check)
     B3 کشِ خراب/غایب → build همچنان خروجیِ درست می‌دهد
     B4 PAYESH_BUILD_NO_CACHE=1 → همان خروجیِ مسیرِ کش‌دار

   بخش C — گیت‌های KPI:
     C1 اندازهٔ index.html < 1.8MB
     C2 زمانِ build (میانهٔ ۵ اجرایِ گرم) < 70ms

   موتانت‌گارد (سبز جعلی ممنوع):
     M1 اگر strip عملاً هیچ کاری نکند (خروجی=ورودی) → کوچک‌سازی مرده → قرمز
     M2 اگر کامنتِ حاویِ نشانگر به خروجی درز کند → قرمز
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const { stripJs, stripCss } = require(path.join(ROOT, 'tools', 'minify-source.js'));

let pass = 0, fail = 0;
const T = (ok, name, detail) => {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};

console.log('▸ Wave 24 — بهینه‌سازیِ build (KPI-1/KPI-2)');

/* ── بخش A: معناشناسیِ کوچک‌ساز ── */
const eq = (inp, exp, name) => {
  const got = stripJs(inp);
  T(got === exp, name, got !== exp ? 'got=' + JSON.stringify(got) : '');
};
eq('var a=1; // c\nvar b=2;', 'var a=1;\nvar b=2;\n', 'A1 کامنتِ خطی حذف');
eq('a=b/*x*/+c;', 'a=b +c;\n', 'A2 کامنتِ بلوکی → فاصله (توکن‌ها نمی‌چسبند)');
eq('var s="a//b"; u=1;', 'var s="a//b"; u=1;\n', 'A3 // داخلِ رشته دست‌نخورده');
eq('var h=`<div>\n  keep\n</div>`;', 'var h=`<div>\n  keep\n</div>`;\n', 'A4 تورفتگیِ داخلِ تمپلیت حفظ');
eq('  x = y / z / w;', 'x = y / z / w;\n', 'A5 تقسیم regex پنداشته نمی‌شود');
eq('return /x|y/.test(t);', 'return /x|y/.test(t);\n', 'A6 regex پس از return');
eq('r = /ab\\/c/g.test(s);', 'r = /ab\\/c/g.test(s);\n', 'A7 اسلشِ escape داخل regex');
eq('var t=`a ${b?"}":"{"} c`;', 'var t=`a ${b?"}":"{"} c`;\n', 'A8 آکولاد داخلِ رشتهٔ ${} — عمق خراب نمی‌شود');
eq('if(a){\n  /* c */\n  b();\n}\n', 'if(a){\nb();\n}\n', 'A9 خطِ فقط-کامنت به‌کل حذف');
eq('a = 1\n\n\nb = 2\n', 'a = 1\nb = 2\n', 'A10 خطوطِ خالی حذف؛ newlineِ کد حفظ (ASI امن)');
eq("x = 'it\\'s';", "x = 'it\\'s';\n", 'A11 escape داخل رشتهٔ تک‌کوت');
eq('var q = `${a}/${b}`;', 'var q = `${a}/${b}`;\n', 'A12 اسلش میانِ دو ${} تقسیم/regex پنداشته نمی‌شود');

/* A13 + A15: همهٔ ماژول‌های واقعی */
const ORDER = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/js/_order.json'), 'utf8'));
let parseFails = [], nondet = 0;
for (const f of ORDER) {
  const src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  const m1 = stripJs(src);
  try { new Function(m1); } catch (e) { parseFails.push(f + ': ' + e.message); }
  if (stripJs(src) !== m1) nondet++;
}
T(parseFails.length === 0, `A13 هر ${ORDER.length} ماژولِ strip شده پارسِ معتبر است`, parseFails.slice(0, 3).join(' | '));
T(nondet === 0, 'A15 خروجیِ strip قطعی (deterministic) است');

/* A14: متن‌های template literal حفظ می‌شوند — نمونهٔ حساس: متن‌های فارسیِ UI */
const routerSrc = fs.readFileSync(path.join(ROOT, 'src/js/05-router.js'), 'utf8');
const strippedRouter = stripJs(routerSrc);
const uiStrings = routerSrc.match(/'[^'\\\n]{4,}'/g) || [];
const missing = uiStrings.filter((s) => !strippedRouter.includes(s));
T(missing.length === 0, `A14 همهٔ ${uiStrings.length} رشتهٔ literal ماژولِ نمونه در خروجی حفظ شده`, missing.slice(0, 2).join(','));

/* ── بخش B: کشِ افزایشی ── */
const routerPath = path.join(ROOT, 'src/js/05-router.js');
const backup = fs.readFileSync(routerPath);
const build = () => execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'pipe' });
const readIndex = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
try {
  build(); /* حالتِ پایه + کشِ گرم */
  const base = readIndex();

  fs.writeFileSync(routerPath, backup.toString('utf8') + '\nvar __w24_probe = 42;\n');
  build();
  T(readIndex().includes('__w24_probe'), 'B1 تغییرِ ماژول در خروجی دیده می‌شود (کشِ کهنه سرو نمی‌شود)');

  fs.writeFileSync(routerPath, backup);
  build();
  T(readIndex() === base, 'B2 برگرداندنِ ماژول → خروجی بیت‌به‌بیت برمی‌گردد');

  /* B3: کشِ خراب */
  const metaP = path.join(ROOT, '.build-cache.meta.json');
  if (fs.existsSync(metaP)) fs.writeFileSync(metaP, '{corrupt!!!');
  build();
  T(readIndex() === base, 'B3 کشِ خراب → بازساختِ کامل، خروجیِ درست');

  /* B4: بدونِ کش */
  execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'pipe', env: { ...process.env, PAYESH_BUILD_NO_CACHE: '1' } });
  T(readIndex() === base, 'B4 مسیرِ بدونِ کش = همان خروجی');
} finally {
  fs.writeFileSync(routerPath, backup);
  build(); /* بازگشت به حالتِ سالم برای گیت‌های بعدی */
}

/* ── بخش C: گیت‌های KPI ── */
const size = fs.statSync(path.join(ROOT, 'index.html')).size;
T(size < 1.8 * 1024 * 1024, `C1 اندازهٔ index.html = ${size.toLocaleString('en')}B < 1.8MB`);

const times = [];
for (let i = 0; i < 5; i++) {
  const t0 = process.hrtime.bigint();
  build();
  times.push(Number(process.hrtime.bigint() - t0) / 1e6);
}
const med = times.sort((a, b) => a - b)[2];
T(med < 70, `C2 build (میانهٔ ۵ اجرا) = ${med.toFixed(1)}ms < 70ms`, times.map((t) => t.toFixed(0)).join(','));

/* ── موتانت‌گاردها ── */
const sample = fs.readFileSync(path.join(ROOT, 'src/js/00-data-layer.js'), 'utf8');
T(stripJs(sample).length < sample.length * 0.95, 'M1 کوچک‌سازی واقعاً اثر دارد (نه no-op)');
T(!stripJs('var a=1; /* W24_MUT_MARKER */').includes('W24_MUT_MARKER'), 'M2 کامنت به خروجی درز نمی‌کند');
T(!stripCss('.x{color:red}/* W24_MUT_MARKER */').includes('W24_MUT_MARKER'), 'M3 کامنتِ CSS به خروجی درز نمی‌کند');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
T(idx.includes('data:font/woff2;base64,'), 'M4 فونتِ جاسازی‌شده در خروجیِ کوچک‌شده حفظ است');
T(idx.includes('function render('), 'M5 نقاطِ ورودِ ساختاری حفظ‌اند (توکن‌ها تغییر نام نداده‌اند)');

console.log(`\nbuild-optimization: ${pass} سبز / ${fail} قرمز ${fail ? '❌' : '✅'}`);
process.exit(fail ? 1 : 0);
