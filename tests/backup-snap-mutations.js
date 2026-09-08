#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   backup-snap-mutations.js — جهش‌مندیِ پشتیبان (دور ۱۰۰، نقصِ ۵)
   ─────────────────────────────────────────────────────────────
   M1 پذیرشِ اسنپ‌شات در validate خاموش ← S1 (برگشتِ متنِ نقص)
   M2 بازپخش با applyOpِ خام (بی‌اسنپ‌شات) ← S2 (رکوردِ A گم می‌شود)
   M3 رداکشنِ رمز در اسنپ‌شات خاموش ← S3 (نشتِ رمز)
   M4 نسخه برگردد به ۲ ← S1
   M5 بررسیِ شکلِ اسنپ‌شات خاموش ← S5 (فایلِ خراب پذیرفته می‌شود)
   ───────────────────────────────────────────────────────────── */
const { execSync } = require('child_process');
const fs = require('fs');

const SUITE = 'tests/backup-snap.js';
const FILE = 'src/js/38-plans-backup.js';
const MUTS = [
  { bad: "    if(o && o.t==='snap'){",
    mut: '    if(false){',
    name: 'M1 اسنپ‌شات رد شد (برگشتِ نقص)', expectFail: 'S1' },
  { bad: '    applyLog();',
    mut: '    log.forEach(function(o){ applyOp(o, false); });',
    name: 'M2 بازپخشِ خام برگشت (اسنپ‌شات نادیده گرفته شد)', expectFail: 'S2' },
  { bad: "      if(op && op.t==='snap' && op.db && Array.isArray(op.db.users)){",
    mut: '      if(false){',
    name: 'M3 رمز در اسنپ‌شات ماند (نشت)', expectFail: 'S3' },
  { bad: '    version: 3,',
    mut: '    version: 2,',
    name: 'M4 نسخه ۲ ماند', expectFail: 'S1' },
  { bad: "      if(!o.db || typeof o.db !== 'object')",
    mut: '      if(false)',
    name: 'M5 اسنپ‌شاتِ ناقص پذیرفته شد', expectFail: 'S5' },
];

let killed = 0, envFails = 0;
for (const m of MUTS) {
  const src0 = fs.readFileSync(FILE, 'utf8');
  if (src0.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد در ${FILE}`); continue; }
  fs.writeFileSync(FILE, src0.replace(m.bad, m.mut));
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
  fs.writeFileSync(FILE, src0);
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
  backGreen = /backup-snap: \d+\/\d+  ✅/.test(finalOut);
} catch (e) { finalOut = String(e.stdout || '') + String(e.stderr || ''); }
console.log(`\nجهش: ${killed}/${MUTS.length} کشته · خطِ پایه: ${backGreen ? 'سبز ✅' : 'قرمز ❌'} · خطایِ محیطی: ${envFails}`);
if (!backGreen || killed !== MUTS.length) {
  console.log('خروجیِ اجرای پایانی:');
  console.log(finalOut.split('\n').slice(-14).join('\n'));
}
const pass = killed === MUTS.length && backGreen && envFails === 0;
console.log(pass ? 'همهٔ جهش‌ها کشته شدند ✅' : 'جهش‌مندی ناقص ❌');
process.exit(pass ? 0 : 1);
