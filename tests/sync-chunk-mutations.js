#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   sync-chunk-mutations.js — جهش‌مندیِ chunking (دور ۱۰۰، نقصِ ۱)
   ─────────────────────────────────────────────────────────────
   M1 تکه‌بندی خاموش (تکهٔ غول‌پیکر) ← C1 باید قرمز شود
   M2 تقسیمِ ۴۱۳ خاموش ← C2 باید قرمز شود (حلقهٔ ۴۱۳ برمی‌گردد)
   M3 نگاشتِ oversized خاموش ← C3 باید قرمز شود (failed به‌جای rejected)
   M4 به‌روزرسانیِ پیشرفت خاموش ← C4 باید قرمز شود
   M5 ثبتِ oversized_op در کدهایِ مرده پاک شود ← C3 باید قرمز شود
   ───────────────────────────────────────────────────────────── */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و index.html هرگز
   بازنویسی نمی‌شود — بازگردانیِ دستی و rebuildِ پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('sch-mut-');
const ROOT = path.join(__dirname, '..');
kit.remapBuildOutputs();


const SUITE = 'tests/sync-chunk.js';
const FILE = 'src/js/27-sync.js';
const MUTS = [
  { bad: 'for(let i=0;i<batch.length;i+=SYNC_CHUNK)',
    mut: 'for(let i=0;i<batch.length;i+=1000000)',
    name: 'M1 تکه‌بندی خاموش شد (یک POSTِ غول‌پیکر)', expectFail: 'C1' },
  { bad: 'if(is413Results(res) && chunk.length > 1){ splitPush(pend, chunk); continue; }',
    mut: 'if(false){ splitPush(pend, chunk); continue; }',
    name: 'M2 تقسیمِ ۴۱۳ خاموش شد (حلقهٔ ابدی برمی‌گردد)', expectFail: 'C2' },
  { bad: "code:'oversized_op'",
    mut: "code:'http_413'",
    name: 'M3 تک‌opِ بزرگ dead-letter نشد (failedِ ابدی)', expectFail: 'C3' },
  { bad: 'SYNC.progress = { done: out.length, total: total };',
    mut: 'SYNC.progress = null;',
    name: 'M4 پیشرفت به‌روز نشد (بج خالی)', expectFail: 'C4' },
  { bad: '  oversized_op: 1\n};',
    mut: '  oversized_op: 0\n};',
    name: 'M5 کدِ مردهٔ oversized_op پاک شد', expectFail: 'C3' },
];

let killed = 0, envFails = 0;
for (const m of MUTS) {
  const src0 = fs.readFileSync(FILE, 'utf8');
  if (src0.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد در ${FILE}`); continue; }
  kit.mutant(path.join(ROOT, FILE), src0.replace(m.bad, m.mut)); /* نخستین رخداد */
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
let backGreen = false, finalOut = '';
try {
  finalOut = execSync('node --max-old-space-size=1500 ' + SUITE, { stdio: 'pipe' }).toString();
  backGreen = /sync-chunk: \d+\/\d+  ✅/.test(finalOut);
} catch (e) { finalOut = String(e.stdout || '') + String(e.stderr || ''); }
console.log(`\nجهش: ${killed}/${MUTS.length} کشته · خطِ پایه: ${backGreen ? 'سبز ✅' : 'قرمز ❌'} · خطایِ محیطی: ${envFails}`);
if (!backGreen || killed !== MUTS.length) {
  console.log('خروجیِ اجرای پایانی:');
  console.log(finalOut.split('\n').slice(-14).join('\n'));
}
const pass = killed === MUTS.length && backGreen && envFails === 0;
console.log(pass ? 'همهٔ جهش‌ها کشته شدند ✅' : 'جهش‌مندی ناقص ❌');
process.exit(pass ? 0 : 1);
