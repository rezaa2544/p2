#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   deadletter-mutations.js — جهش‌مندیِ dead-letter (دور ۸۵, P0-2)
   ─────────────────────────────────────────────────────────────
   M1: طبقه‌بندیِ ردِّ پایدار خاموش شود → op خراب «failed» می‌ماند
       و دوباره ارسال می‌شود (D5b باید شکست بخورد)
   M2: raw:true حذف شود → ردِّ 403 کل دسته exception می‌شود و opها
       «failed» می‌مانند (D6 باید شکست بخورد)
   ───────────────────────────────────────────────────────────── */
const { execSync } = require('child_process');
const fs = require('fs');

const MUTS = [
  {
    file: 'src/js/27-sync.js', suite: 'tests/deadletter.js',
    bad: 'else if(SYNC_DEAD_CODES[r.code]){',
    mut: 'else if(false){',
    name: 'M1 dead-letter خاموش شد (op خراب «failed» می‌ماند و دوباره ارسال می‌شود)',
    expectFail: 'D3'
  },
  {
    file: 'src/js/27-sync.js', suite: 'tests/deadletter.js',
    bad: "      raw   : true\n    });",
    mut: "      raw   : false\n    });",
    name: 'M2 raw:true حذف شد (بدنهٔ ۲۰۰/۴۰۳ بدونِ status خراب می‌شود)',
    expectFail: 'D2'
  }
];

let killed = 0;
for (const m of MUTS) {
  const src0 = fs.readFileSync(m.file, 'utf8');
  const n = src0.indexOf(m.bad);
  if (n < 0) { console.log('  ❌ ' + m.name + ': الگوی اصلی پیدا نشد در ' + m.file); continue; }
  fs.writeFileSync(m.file, src0.replace(m.bad, m.mut, 1));
  execSync('node build.js', { stdio: 'pipe' });
  let out = '', crashed = false;
  try { execSync('node --max-old-space-size=1500 ' + m.suite, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out)) crashed = true;
  }
  const failed = /❌/.test(out);
  const firstFail = (out.split('\n').find(l => l.includes('❌')) || '').trim();
  const killedThis = crashed ? (m.crashOK === true) : (failed && firstFail.includes(m.expectFail));
  fs.writeFileSync(m.file, src0);
  console.log('  ' + (killedThis ? '✅' : '❌') + ' ' + m.name + ' — ' + (killedThis ? 'کشته شد' : 'زنده ماند! (خروجی: ' + firstFail + ')'));
  if (killedThis) killed++;
}
execSync('node build.js', { stdio: 'pipe' });
console.log('\nبازبینیِ خطِ پایه (بدون جهش):');
const o = execSync('node --max-old-space-size=1500 tests/deadletter.js', { stdio: 'pipe' }).toString();
console.log('  deadletter: ' + (o.split('\n').find(l => l.includes('/18')) || o.slice(-120)).trim());
console.log(killed === MUTS.length ? 'همهٔ ' + MUTS.length + ' جهش کشته شدند ✅' : 'فقط ' + killed + '/' + MUTS.length + ' جهش کشته شد ❌');
process.exit(killed === MUTS.length ? 0 : 1);
