#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — نمرهٔ عملی/کارگاهی + کارآموزی (بند ۴.۲)
   هر جهش باید tests/workshop2.js را بشکاند؛ وگرنه تست بی‌اثر است.
   ═══════════════════════════════════════════════════════════════════ */
const { execSync } = require('child_process');
const fs = require('fs');

const FILES = {
  'src/js/17-student-record.js': fs.readFileSync('src/js/17-student-record.js', 'utf8'),
  'src/js/13-grades.js': fs.readFileSync('src/js/13-grades.js', 'utf8'),
  'src/js/19-actions.js': fs.readFileSync('src/js/19-actions.js', 'utf8'),
};

const MUTS = [
  {
    file: 'src/js/17-student-record.js',
    name: 'M1 گاردِ سالِ آخر در کارتِ کارآموزی خاموش شود',
    bad: "  if(!isFinalYearStudent(sid))return '';",
    mut: "  if(false)return '';",
    expectFail: 'کارت نباید برای سالِ غیرآخر باشد',
  },
  {
    file: 'src/js/13-grades.js',
    name: 'M2 «دبیرِ مربوطه» گم شود (هر دبیری تأیید کند)',
    bad: "  return (db.schedule||[]).some(function(s){return s.class_id===cls.id&&s.teacher_id===u.id;});",
    mut: "  return true;",
    expectFail: 'دبیرِ غیرمربوطه نباید تأیید کند',
  },
  {
    file: 'src/js/13-grades.js',
    name: 'M3 جمعِ «تأییدشده» همهٔ ردیف‌ها را بشمارد',
    bad: "    if(r.status==='approved')approved+=h;",
    mut: "    approved+=h;",
    expectFail: 'با وجودِ ردیفِ درانتظار، تأییدشده باید کمتر از مجموع باشد',
  },
  {
    file: 'src/js/19-actions.js',
    name: 'M4 نوعِ نمره هرگز «عملی» ذخیره نشود',
    bad: "    const gkind=V('g_kind')==='practical'?'practical':'theory';",
    mut: "    const gkind='theory';",
    expectFail: 'نوعِ نمره «عملی» ذخیره نشد',
  },
];

let killed = 0;
for (const m of MUTS) {
  const src = FILES[m.file];
  if (src.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
  fs.writeFileSync(m.file, src.replace(m.bad, m.mut));
  execSync('node build.js', { stdio: 'pipe' });
  let out = '', crashed = false;
  try { execSync('node tests/workshop2.js', { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out)) crashed = true;
  }
  const killedThis = crashed ? (m.crashOK === true) : (/❌/.test(out) && out.includes(m.expectFail));
  for (const f of Object.keys(FILES)) fs.writeFileSync(f, FILES[f]);
  console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' : 'زنده ماند! (خطا: ' + (out.split('\n').find(l => l.includes('❌')) || out.slice(0, 120)) + ')'}`);
  if (killedThis) killed++;
}

/* بازبینیِ خطِ پایه (بدون جهش) */
execSync('node build.js', { stdio: 'pipe' });
try {
  execSync('node tests/workshop2.js', { stdio: 'pipe' });
  console.log('  ✅ خطِ پایه (بدون جهش) سبز است');
} catch (e) {
  console.log('  ❌ خطِ پایه شکست — جهش‌ها را دوباره بررسی کنید');
}
console.log(`\nworkshop2-mutations: ${killed}/${MUTS.length} جهش کشته شد ${killed === MUTS.length ? '✅' : '❌'}`);
process.exit(killed === MUTS.length ? 0 : 1);
