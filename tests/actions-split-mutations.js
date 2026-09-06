#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — شکستنِ A در 19-actions.js (دور 85، W3)
   هر جهش باید tests/actions-split.js را بشکند؛ وگرنه تست بی‌اثر است.
   ═══════════════════════════════════════════════════════════════════ */
const { execSync } = require('child_process');
const fs = require('fs');

const FILES = {
  'src/js/19-actions.js': fs.readFileSync('src/js/19-actions.js', 'utf8'),
  'src/js/48-bus-service.js': fs.readFileSync('src/js/48-bus-service.js', 'utf8'),
};

const MUTS = [
  {
    file: 'src/js/19-actions.js',
    name: 'M1 زنجیرهٔ dispatchِ BUS_ACTIONS حذف شود',
    bad: '  else if(typeof BUS_ACTIONS!==\'undefined\'&&BUS_ACTIONS[a]){e.preventDefault();BUS_ACTIONS[a](el,id);}',
    mut: '  /* BUS_ACTIONS dispatch removed */',
    expectFail: 'bus: دکمهٔ «مسیر جدید»',
  },
  {
    file: 'src/js/19-actions.js',
    name: 'M2 زنجیرهٔ dispatchِ VCLASS_ACTIONS حذف شود',
    bad: '  else if(typeof VCLASS_ACTIONS!==\'undefined\'&&VCLASS_ACTIONS[a]){e.preventDefault();VCLASS_ACTIONS[a](el,id);}',
    mut: '  /* VCLASS_ACTIONS dispatch removed */',
    expectFail: 'vclass: دکمهٔ «نشست جدید»',
  },
  {
    file: 'src/js/48-bus-service.js',
    name: 'M3 نامِ یک اکشن در BUS_ACTIONS خراب شود',
    bad: "'bus-route-new'(el,id){",
    mut: "'bus-route-newx'(el,id){",
    expectFail: 'BUS_ACTIONS دقیقاً ۱۶ اکشنِ bus',
  },
];

let killed = 0;
for (const m of MUTS) {
  const src = FILES[m.file];
  if (src.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
  fs.writeFileSync(m.file, src.replace(m.bad, m.mut));
  execSync('node build.js', { stdio: 'pipe' });
  let out = '', crashed = false;
  try { execSync('node tests/actions-split.js', { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
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
  finalOut = execSync('node tests/actions-split.js', { stdio: 'pipe' }).toString();
  backGreen = finalOut.includes('همه سبز');
} catch (e) { finalOut = String(e.stdout || ''); }
console.log(`\nجهش: ${killed}/${MUTS.length} کشته` + (killed === MUTS.length && backGreen ? ' ✅ (سبزِ پایانی)' : ' ⚠️'));
if (killed !== MUTS.length || !backGreen) {
  console.log('خروجیِ اجرای پایانی:');
  console.log(finalOut.split('\n').slice(-10).join('\n'));
}
process.exit(killed === MUTS.length && backGreen ? 0 : 1);
