#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   genp12-mutations.js — جهش‌مندیِ رفعِ تداخل (دور ۱۰۰، نقصِ ۶)
   ─────────────────────────────────────────────────────────────
   M1 بوت سال‌گذشته را صدا نمی‌زند ← G2 (برگشتِ متنِ نقص)
   M2 بازیابی سال‌گذشته را بازتولید نمی‌کند ← G4
   M3 نامِ 45 برگردد به generateP12 ← G1 (سایه دوباره)
   M4 همانِ M3 ولی با سئوتِ run.js ← نگهبانِ یکتایی می‌گیردش
   ───────────────────────────────────────────────────────────── */
const { execSync } = require('child_process');
const fs = require('fs');

const SUITE = 'tests/genp12.js';
const MUTS = [
  { file: 'src/js/24-edu-office.js',
    bad: "  if(typeof generatePriorYear==='function') generatePriorYear();",
    mut: '  if(false) generatePriorYear();',
    name: 'M1 بوت: سال‌گذشته صدا زده نشد', expectFail: 'G2' },
  { file: 'src/js/38-plans-backup.js',
    bad: "    if(typeof generatePriorYear === 'function') generatePriorYear();",
    mut: '    if(false) generatePriorYear();',
    name: 'M2 بازیابی: سال‌گذشته بازتولید نشد', expectFail: 'G4' },
  { file: 'src/js/45-teacher-tools.js',
    bad: 'function generatePriorYear(){',
    mut: 'function generateP12(){',
    name: 'M3 تداخل برگشت (دو generateP12)', expectFail: 'G1' },
  { file: 'src/js/45-teacher-tools.js', suite: 'tests/run.js',
    bad: 'function generatePriorYear(){',
    mut: 'function generateP12(){',
    name: 'M4 نگهبانِ یکتاییِ run.js تداخل را می‌گیرد', expectFail: 'یکتا' },
];

let killed = 0, envFails = 0;
for (const m of MUTS) {
  const suite = m.suite || SUITE;
  const src0 = fs.readFileSync(m.file, 'utf8');
  if (src0.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد در ${m.file}`); continue; }
  fs.writeFileSync(m.file, src0.replace(m.bad, m.mut));
  execSync('node build.js', { stdio: 'pipe' });
  let out = '', crashed = false;
  const cmd = 'node --max-old-space-size=1500 ' + suite;
  try { execSync(cmd, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (out.trim() === '') {
      try { execSync(cmd, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
      catch (e2) { out = String(e2.stdout || '') + String(e2.stderr || ''); }
    }
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
  }
  fs.writeFileSync(m.file, src0);
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
let backGreen = false, finalOut = '';
try {
  finalOut = execSync('node --max-old-space-size=1500 ' + SUITE, { stdio: 'pipe' }).toString();
  backGreen = /genp12: \d+\/\d+  ✅/.test(finalOut);
} catch (e) { finalOut = String(e.stdout || '') + String(e.stderr || ''); }
console.log(`\nجهش: ${killed}/${MUTS.length} کشته · خطِ پایه: ${backGreen ? 'سبز ✅' : 'قرمز ❌'} · خطایِ محیطی: ${envFails}`);
if (!backGreen || killed !== MUTS.length) {
  console.log('خروجیِ اجرای پایانی:');
  console.log(finalOut.split('\n').slice(-14).join('\n'));
}
const pass = killed === MUTS.length && backGreen && envFails === 0;
console.log(pass ? 'همهٔ جهش‌ها کشته شدند ✅' : 'جهش‌مندی ناقص ❌');
process.exit(pass ? 0 : 1);
