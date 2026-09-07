#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — کشِ classScoreContext (فاز ۲ بند ۲)
   هر جهش باید tests/clsctx.js را بشکند؛ وگرنه تست بی‌اثر است.
   ═══════════════════════════════════════════════════════════════════ */
const { execSync } = require('child_process');
const fs = require('fs');

const FILES = {
  'src/js/03-persistence.js': fs.readFileSync('src/js/03-persistence.js', 'utf8'),
  'src/js/04-queries.js': fs.readFileSync('src/js/04-queries.js', 'utf8'),
};

const MUTS = [
  {
    file: 'src/js/04-queries.js',
    name: 'M1 کش هرگز باطل نشود (بدونِ چکِ نسخه)',
    bad: 'if(hit && hit.ver===ver) return hit.ctx;',
    mut: 'if(hit) return hit.ctx;',
    expectFail: 'تغییرِ نمره: زمینه بازمحاسبه شد',
  },
  {
    file: 'src/js/04-queries.js',
    name: 'M2 کش هرگز استفاده نشود (همیشه بازمحاسبه)',
    bad: 'if(hit && hit.ver===ver) return hit.ctx;',
    mut: 'if(false) return hit.ctx;',
    expectFail: 'کش فعال: فراخوانیِ دوم همان شیء',
  },
  {
    file: 'src/js/03-persistence.js',
    name: 'M3 نسخهٔ داده هرگز زیاد نشود',
    bad: '    _GRADE_CACHE_VERSION++;',
    mut: '    /* _GRADE_CACHE_VERSION++; */',
    expectFail: 'تغییرِ نمره: زمینه بازمحاسبه شد',
  },
];

let killed = 0;
for (const m of MUTS) {
  const src = FILES[m.file];
  if (src.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
  fs.writeFileSync(m.file, src.replace(m.bad, m.mut));
  execSync('node build.js', { stdio: 'pipe' });
  let out = '', crashed = false;
  const __r89cmd = 'node tests/clsctx.js';
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
  finalOut = execSync('node tests/clsctx.js', { stdio: 'pipe' }).toString();
  backGreen = finalOut.includes('همه سبز');
} catch (e) { finalOut = String(e.stdout || ''); }
console.log(`\nجهش: ${killed}/${MUTS.length} کشته` + (killed === MUTS.length && backGreen ? ' ✅ (سبزِ پایانی)' : ' ⚠️'));
if (killed !== MUTS.length || !backGreen) {
  console.log('خروجیِ اجرای پایانی:');
  console.log(finalOut.split('\n').slice(-10).join('\n'));
}
process.exit(killed === MUTS.length && backGreen ? 0 : 1);
