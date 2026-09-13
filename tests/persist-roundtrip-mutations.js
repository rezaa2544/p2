#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   persist-roundtrip-mutations.js — جهش‌مندیِ ماندگاری (دور ۱۰۰، نقصِ ۲)
   ─────────────────────────────────────────────────────────────
   هر جهش یک نقطهٔ رفع را به باگِ اصلی برمی‌گرداند (insert→add) و
   سئوت باید دقیقاً در همان بخش قرمز شود (op در دفترچه/صف نیست +
   رکورد پس از بوت گم می‌شود).
   M1 مهمان · M2 کتاب · M3 امانت · M4 تجهیز · M5 سیدا · M6 دوجو · M7 گواهی
   ───────────────────────────────────────────────────────────── */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('prt-mut-');
const ROOT = path.join(__dirname, '..');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const SUITE = 'tests/persist-roundtrip.js';
const MUTS = [
  { file: 'src/js/53-visitors.js', bad: "insert('visitors', rec)", mut: "add('visitors', rec)",
    name: 'M1 مهمان به add برگشت', expectFail: 'P1' },
  { file: 'src/js/54-library.js', bad: "insert('lib_books', rec)", mut: "add('lib_books', rec)",
    name: 'M2 کتاب به add برگشت', expectFail: 'P2' },
  { file: 'src/js/54-library.js', bad: "insert('lib_loans', rec)", mut: "add('lib_loans', rec)",
    name: 'M3 امانت به add برگشت', expectFail: 'P3' },
  { file: 'src/js/55-assets.js', bad: "insert('assets', rec)", mut: "add('assets', rec)",
    name: 'M4 تجهیز به add برگشت', expectFail: 'P4' },
  { file: 'src/js/56-sida-diff.js', bad: "insert('sedascores', rec)", mut: "add('sedascores', rec)",
    name: 'M5 سیدا به add برگشت', expectFail: 'P5' },
  { file: 'src/js/52-dojo.js', bad: "insert('dojo_types', {", mut: "add('dojo_types', {",
    name: 'M6 دوجو به add برگشت', expectFail: 'P6' },
  { file: 'src/js/33-forms-sms.js', bad: "insert('certificates', {", mut: "add('certificates', {",
    name: 'M7 گواهی به add برگشت', expectFail: 'P7' },
];

let killed = 0, prevFile = null, envFails = 0;
for (const m of MUTS) {
  const abs = path.join(ROOT, m.file);
  if (prevFile && prevFile !== abs) kit.clear(prevFile); /* فقط جهشِ جاری فعال */
  prevFile = abs;
  const src0 = fs.readFileSync(abs, 'utf8');
  if (src0.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد در ${m.file}`); continue; }
  kit.mutant(abs, src0.replace(m.bad, m.mut)); /* کپی جدا؛ سورس اصلی دست‌نخورده */
  execSync('node build.js', { stdio: 'pipe', env: kit.env(), cwd: ROOT });
  let out = '', crashed = false;
  const cmd = 'node --max-old-space-size=1500 ' + SUITE;
  try { execSync(cmd, { stdio: 'pipe', env: kit.env(), cwd: ROOT }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (out.trim() === '') { /* R89: خروجیِ خالی = کشته‌شدنِ محیطی — یک retry */
      try { execSync(cmd, { stdio: 'pipe', env: kit.env(), cwd: ROOT }); out = 'PASSED (no failure)'; }
      catch (e2) { out = String(e2.stdout || '') + String(e2.stderr || ''); }
    }
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
  }
  if (crashed) {
    envFails++;
    console.log(`  ⚠️ ${m.name} — خطایِ محیطی (کرش/بی‌خروجی)، نه «زنده ماندن»`);
    continue;
  }
  const killedThis = /❌/.test(out) && out.includes(m.expectFail);
  console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' : 'زنده ماند! (خطا: ' + ((out.split('\n').find(l => l.includes('❌')) || out.slice(0, 140))) + ')'}`);
  if (killedThis) killed++;
}
/* بازبینیِ خطِ پایه (بدون جهش) */
let backGreen = false, finalOut = '';
try {
  finalOut = execSync('node --max-old-space-size=1500 ' + SUITE, { stdio: 'pipe' }).toString(); /* پایه: بدون env */
  backGreen = finalOut.includes('بدون خطا');
} catch (e) { finalOut = String(e.stdout || '') + String(e.stderr || ''); }
console.log(`\nجهش: ${killed}/${MUTS.length} کشته · خطِ پایه: ${backGreen ? 'سبز ✅' : 'قرمز ❌'} · خطایِ محیطی: ${envFails}`);
if (!backGreen || killed !== MUTS.length) {
  console.log('خروجیِ اجرای پایانی:');
  console.log(finalOut.split('\n').slice(-14).join('\n'));
}
const pass = killed === MUTS.length && backGreen && envFails === 0;
console.log(pass ? 'همهٔ جهش‌ها کشته شدند ✅' : 'جهش‌مندی ناقص ❌');
process.exit(pass ? 0 : 1);
