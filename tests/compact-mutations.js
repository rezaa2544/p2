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
  try { execSync('node tests/compact.js', { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out)) crashed = true;
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
