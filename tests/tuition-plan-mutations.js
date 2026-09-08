#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   tuition-plan-mutations.js — جهش‌مندیِ تفکیک (دور ۱۰۰، نقصِ ۳)
   ─────────────────────────────────────────────────────────────
   M1 نامِ گرداننده برگردد به plan-save (سایه برمی‌گردد) ← T1
   M2 دکمهٔ مودال برگردد به plan-save (دیسپچِ اشتباه) ← T3
   M3 نقشِ مدیر از جدول پاک شود ← T2
   M4 نقشِ دبیر به جدول اضافه شود (گسترشِ ناروا) ← T2
   ───────────────────────────────────────────────────────────── */
const { execSync } = require('child_process');
const fs = require('fs');

const SUITE = 'tests/tuition-plan.js';
const MUTS = [
  { file: 'src/js/20-communication-finance.js',
    bad: "  'tuition-plan-save'(){", mut: "  'plan-save'(){",
    name: 'M1 سایه برگشت (گرداننده plan-save شد)', expectFail: 'T1' },
  { file: 'src/js/20-communication-finance.js',
    bad: "`,'tuition-plan-save'))", mut: "`,'plan-save'))",
    name: 'M2 دکمهٔ مودال به دیسپچِ اشتباه رفت', expectFail: 'T3' },
  { file: 'src/js/30-authz.js',
    bad: "  'tuition-plan-save': ['manager','superadmin'],",
    mut: "  'tuition-plan-save': ['superadmin'],",
    name: 'M3 مدیر از نقش‌ها افتاد', expectFail: 'T2' },
  { file: 'src/js/30-authz.js',
    bad: "  'tuition-plan-save': ['manager','superadmin'],",
    mut: "  'tuition-plan-save': ['manager','superadmin','teacher'],",
    name: 'M4 دبیر ناروا مجاز شد', expectFail: 'T2' },
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
  backGreen = /tuition-plan: \d+\/\d+  ✅/.test(finalOut);
} catch (e) { finalOut = String(e.stdout || '') + String(e.stderr || ''); }
console.log(`\nجهش: ${killed}/${MUTS.length} کشته · خطِ پایه: ${backGreen ? 'سبز ✅' : 'قرمز ❌'} · خطایِ محیطی: ${envFails}`);
if (!backGreen || killed !== MUTS.length) {
  console.log('خروجیِ اجرای پایانی:');
  console.log(finalOut.split('\n').slice(-14).join('\n'));
}
const pass = killed === MUTS.length && backGreen && envFails === 0;
console.log(pass ? 'همهٔ جهش‌ها کشته شدند ✅' : 'جهش‌مندی ناقص ❌');
process.exit(pass ? 0 : 1);
