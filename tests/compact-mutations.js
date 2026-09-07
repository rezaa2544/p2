#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — فشردنِ دفترچه (AD 85.1)
   هر جهش باید tests/compact.js را بشکاند؛ وگرنه تست بی‌اثر است.
   ═══════════════════════════════════════════════════════════════════ */
const { execSync } = require('child_process');
const fs = require('fs');

const FILES = {
  'src/js/03-persistence.js': fs.readFileSync('src/js/03-persistence.js', 'utf8'),
};

const MUTS = [
  {
    file: 'src/js/03-persistence.js',
    name: 'M1 اسنپ‌شات در بازپخش اعمال نشود (دستگاهِ تازه وضعیتِ قدیمی را نبیند)',
    bad: "if(e.t==='snap'){ applySnapshot(e); continue; }",
    mut: "if(e.t==='snap'){ /* mutation: no snapshot */ continue; }",
    expectFail: 'بازیابی: dbِ دستگاهِ تازه با dbِ دستگاهِ قدیمی بیت‌به‌بیت است',
  },
  {
    file: 'src/js/03-persistence.js',
    name: 'M2 فشردن هرگز اجرا نشود (log بی‌پایان بماند)',
    bad: 'function compactLogIfNeeded(){',
    mut: 'function compactLogIfNeeded(){ return false;',
    expectFail: 'فشرده‌سازی: دفترچه به «اسنپ‌شات + tail» تبدیل شد',
  },
  {
    file: 'src/js/03-persistence.js',
    name: 'M3 بازسازیِ حالتِ nextId از اسنپ‌شات حذف شود (idهایِ مصرف‌شده دوباره استفاده شوند)',
    bad: 'if(e.ids[c2]>(ids[c2]||0)) ids[c2]=e.ids[c2];',
    mut: 'if(false) ids[c2]=e.ids[c2];',
    expectFail: 'nextIdِ grades همگام است',
  },
  {
    file: 'src/js/03-persistence.js',
    name: 'M4 گاردِ «فقط اگر کوچک می‌کند» بی‌اثر شود (برآوردِ همیشه‌بزرگ)',
    bad: 'var est = _DB_BYTES + COMPACT_KEEP*avg;',
    mut: 'var est = 100000000000;',
    expectFail: 'فشرده‌سازی: دفترچه به «اسنپ‌شات + tail» تبدیل شد',
  },
];

let killed = 0;
for (const m of MUTS) {
  const src = FILES[m.file];
  if (src.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
  fs.writeFileSync(m.file, src.replace(m.bad, m.mut));
  execSync('node build.js', { stdio: 'pipe' });
  let out = '', crashed = false;
  const __r89cmd = 'node tests/compact.js';
  try { execSync(__r89cmd, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (out.trim() === '') { /* R89: empty output = process killed (env/memory) — retry once */
      try { execSync(__r89cmd, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
      catch (e2) { out = String(e2.stdout || '') + String(e2.stderr || ''); }
    }
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
    if (out.trim() === '') out = '\u274c \u062e\u0637\u0627: \u0641\u0631\u0622\u06cc\u0646\u062f \u0628\u062f\u0648\u0646 \u062e\u0631\u0648\u062c\u06cc \u06a9\u0634\u062a\u0647 \u0634\u062f (\u0645\u062d\u06cc\u0637) \u2014 \u00ab\u0632\u0646\u062f\u0647 \u0645\u0627\u0646\u062f\u0646\u00bb \u062c\u0647\u0634 \u0646\u06cc\u0633\u062a';
  }
  const killedThis = crashed ? (m.crashOK === true) : (/❌/.test(out) && out.includes(m.expectFail));
  for (const f of Object.keys(FILES)) fs.writeFileSync(f, FILES[f]);
  console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' : 'زنده ماند! (خطا: ' + (out.split('\n').find(l => l.includes('❌')) || out.slice(0, 120)) + ')'}`);
  if (killedThis) killed++;
}
execSync('node build.js', { stdio: 'pipe' });
let finalOut = '', backGreen = false;
try {
  finalOut = execSync('node tests/compact.js', { stdio: 'pipe' }).toString();
  backGreen = finalOut.includes('بدون خطا');
} catch (e) {
  finalOut = String(e.stdout || '');
}
console.log(`\nجهش: ${killed}/${MUTS.length} کشته` + (killed === MUTS.length && backGreen ? ' ✅ (سبزِ پایانی)' : ' ⚠️'));
if (killed !== MUTS.length || !backGreen) {
  console.log('خروجیِ اجرای پایانی:');
  console.log(finalOut.split('\n').slice(-12).join('\n'));
}
process.exit(killed === MUTS.length && backGreen ? 0 : 1);
