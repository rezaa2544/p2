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
const path = require('path');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('tp-mut-');
const ROOT = path.join(__dirname, '..');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

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
    if (out.trim() === '') {
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
let backGreen = false, finalOut = '';
try {
  finalOut = execSync('node --max-old-space-size=1500 ' + SUITE, { stdio: 'pipe' }).toString(); /* پایه: بدون env */
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
