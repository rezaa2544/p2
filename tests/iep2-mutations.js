#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — IEP (بند ۲.۲)
   هر جهش باید tests/iep2.js را بشکاند؛ وگرنه تست بی‌اثر است.
   ═══════════════════════════════════════════════════════════════════ */
const { execSync } = require('child_process');
const fs = require('fs');

const FILES = {
  'src/js/17-student-record.js': fs.readFileSync('src/js/17-student-record.js', 'utf8'),
  'src/js/19-actions.js': fs.readFileSync('src/js/19-actions.js', 'utf8'),
};

const MUTS = [
  {
    file: 'src/js/17-student-record.js',
    name: 'M1 گاردِ has_iep از کارتِ IEP بیفتد',
    bad: "  var iepOn=!(!school||!(typeof hasCap==='function')||!hasCap(school.id,'has_iep'));",
    mut: "  var iepOn=true;",
    expectFail: 'کارتِ IEP نباید در مدرسهٔ بدون این توان باشد',
  },
  {
    file: 'src/js/17-student-record.js',
    name: 'M2 گاردِ نقش از ویرایشِ IEP بیفتد (همه دکمه ببینند)',
    bad: "  var canEdit=persona==='manager'||persona==='superadmin'||persona==='teacher';",
    mut: "  var canEdit=true;",
    expectFail: 'دانش‌آموز نباید دکمهٔ ویرایش داشته باشد',
  },
  {
    file: 'src/js/19-actions.js',
    name: 'M3 تاریخِ به‌روزرسانی در IEP ذخیره نشود',
    bad: "     update('users',sid,{iep_notes:V('iep_notes'),iep_staff:V('iep_staff'),iep_updated:todayISO()});",
    mut: "     update('users',sid,{iep_notes:V('iep_notes'),iep_staff:V('iep_staff')});",
    expectFail: 'تاریخِ به‌روزرسانی تازه نشد',
  },
];

let killed = 0;
for (const m of MUTS) {
  const src = FILES[m.file];
  if (src.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
  fs.writeFileSync(m.file, src.replace(m.bad, m.mut));
  execSync('node build.js', { stdio: 'pipe' });
  let out = '', crashed = false;
  try { execSync('node tests/iep2.js', { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
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
try {
  execSync('node tests/iep2.js', { stdio: 'pipe' });
  console.log('  ✅ خطِ پایه (بدون جهش) سبز است');
} catch (e) {
  console.log('  ❌ خطِ پایه شکست — جهش‌ها را دوباره بررسی کنید');
}
console.log(`\niep2-mutations: ${killed}/${MUTS.length} جهش کشته شد ${killed === MUTS.length ? '✅' : '❌'}`);
process.exit(killed === MUTS.length ? 0 : 1);
