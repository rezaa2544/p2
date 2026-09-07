#!/usr/bin/env node
/* تستِ جهش‌مندی برای تکمیل‌های مالی — هر جهش باید حداقل یک تست را بکشد */
const { execSync } = require('child_process');
const fs = require('fs');
const P = 'src/js/20-communication-finance.js';
const SRC0 = fs.readFileSync(P, 'utf8');

const MUTS = [
  {
    name: 'M1 گاردِ صورتحسابِ باز (issueTuition)',
    bad: "var open = db.tuitions.filter(function(t){ return t.student_id===st.id && t.status!=='settled'; });",
    mut: "var open = db.tuitions.filter(function(t){ return t.student_id===st.id && t.status!=='open'; });",
    expectFail: 'issueTuition — دانش‌آموزی که صورتحسابِ باز دارد رد می‌شود',
  },
  {
    name: 'M2멪ِ یادآوری (tuitionReminders)',
    bad: "if(db.notifications.some(function(n){ return n.ref==='tr_'+i.id; })){ skipped++; return; }",
    mut: "if(db.notifications.some(function(n){ return n.ref==='xx_'+i.id; })){ skipped++; return; }",
    expectFail: 'tuitionReminders', crashOK: true, // بدون멪 برنامه بی‌حافظه می‌شود
  },
  {
    name: 'M3 کاستنِ بدهی (waiveInstallment)',
    bad: "var payable = Math.max(0, t.payable - remaining);",
    mut: "var payable = Math.max(0, t.payable + remaining);",
    expectFail: 'waiveInstallment', // test name (ASCII)
  },
  {
    name: 'M4 قسطِ آخر (issueTuition schedule)',
    bad: "var amount = (i===n) ? payable-per*(n-1) : per;",
    mut: "var amount = (i===n) ? payable-per*(n-2) : per;",
    expectFail: 'جمع اقساط',
  },
];

let killed = 0;
for (const m of MUTS) {
  const n = SRC0.indexOf(m.bad);
  if (n < 0) { console.log(`  ❌ ${m.name}: الگوی اصلی پیدا نشد`); continue; }
  fs.writeFileSync(P, SRC0.replace(m.bad, m.mut));
  execSync('node build.js', { stdio: 'pipe' });
  let out = '', crashed = false;
  const __r89cmd = 'node tests/finance2.js';
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
  const failed = /❌/.test(out);
  const killedThis = crashed ? (m.crashOK === true) : (failed && out.includes(m.expectFail));
  fs.writeFileSync(P, SRC0);
  console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' + (crashed ? ' (مرگِ فرآیند)' : '') : 'زنده ماند! (خطا: ' + (out.split('\n').find(l => l.includes('❌')) || out.slice(0, 120)) + ')'}`);
  if (killedThis) killed++;
}
execSync('node build.js', { stdio: 'pipe' });
const out = execSync('node tests/finance2.js', { stdio: 'pipe' }).toString();
console.log(out.split('\n').find(l => l.includes('موفق')));
console.log(killed === MUTS.length ? `همهٔ ${MUTS.length} جهش کشته شدند ✅` : `فقط ${killed}/${MUTS.length} جهش کشته شد ❌`);
process.exit(killed === MUTS.length ? 0 : 1);
