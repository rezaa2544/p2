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

let killed = 0, envFails = 0;
for (const m of MUTS) {
  const src0 = fs.readFileSync(m.file, 'utf8');
  if (src0.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد در ${m.file}`); continue; }
  fs.writeFileSync(m.file, src0.replace(m.bad, m.mut));
  execSync('node build.js', { stdio: 'pipe' });
  let out = '', crashed = false;
  const cmd = 'node --max-old-space-size=1500 ' + SUITE;
  try { execSync(cmd, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (out.trim() === '') { /* R89: خروجیِ خالی = کشته‌شدنِ محیطی — یک retry */
      try { execSync(cmd, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
      catch (e2) { out = String(e2.stdout || '') + String(e2.stderr || ''); }
    }
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
  }
  fs.writeFileSync(m.file, src0); /* بازگردانیِ فوری — حتی اگر جهش زنده ماند */
  if (crashed) {
    envFails++;
    console.log(`  ⚠️ ${m.name} — خطایِ محیطی (کرش/بی‌خروجی)، نه «زنده ماندن»`);
    continue;
  }
  const killedThis = /❌/.test(out) && out.includes(m.expectFail);
  console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' : 'زنده ماند! (خطا: ' + ((out.split('\n').find(l => l.includes('❌')) || out.slice(0, 140))) + ')'}`);
  if (killedThis) killed++;
}
execSync('node build.js', { stdio: 'pipe' });
/* بازبینیِ خطِ پایه (بدون جهش) */
let backGreen = false, finalOut = '';
try {
  finalOut = execSync('node --max-old-space-size=1500 ' + SUITE, { stdio: 'pipe' }).toString();
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
