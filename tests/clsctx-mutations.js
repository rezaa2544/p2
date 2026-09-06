#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — کشِ classScoreContext (دور 85، W3)
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
    bad: 'if(cached && cached.ver===ver) return cached.ctx;',
    mut: 'if(cached) return cached.ctx;',
    expectFail: 'تغییرِ نمره: زمینه بازمحاسبه شد',
  },
  {
    file: 'src/js/04-queries.js',
    name: 'M2 کش هرگز استفاده نشود (همیشه بازمحاسبه)',
    bad: 'if(cached && cached.ver===ver) return cached.ctx;',
    mut: 'if(false) return cached.ctx;',
    expectFail: 'کش فعال: فراخوانیِ دوم همان شیء',
  },
  {
    file: 'src/js/03-persistence.js',
    name: 'M3 نسخهٔ داده هرگز زیاد نشود',
    bad: '    _DATA_VER++;',
    mut: '    /* _DATA_VER++; */',
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
  try { execSync('node tests/clsctx.js', { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
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
  finalOut = execSync('node tests/clsctx.js', { stdio: 'pipe' }).toString();
  backGreen = finalOut.includes('همه سبز');
} catch (e) { finalOut = String(e.stdout || ''); }
console.log(`\nجهش: ${killed}/${MUTS.length} کشته` + (killed === MUTS.length && backGreen ? ' ✅ (سبزِ پایانی)' : ' ⚠️'));
if (killed !== MUTS.length || !backGreen) {
  console.log('خروجیِ اجرای پایانی:');
  console.log(finalOut.split('\n').slice(-10).join('\n'));
}
process.exit(killed === MUTS.length && backGreen ? 0 : 1);
