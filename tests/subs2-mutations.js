#!/usr/bin/env node
/* تستِ جهش‌مندی برای اشتراکِ فرزندبه‌فرزند */
const { execSync } = require('child_process');
const fs = require('fs');

const FILES = {
  'src/js/23-subscription.js': fs.readFileSync('src/js/23-subscription.js', 'utf8'),
  'src/js/07-shell.js': fs.readFileSync('src/js/07-shell.js', 'utf8'),
};

const MUTS = [
  {
    file: 'src/js/23-subscription.js',
    name: 'M1 گویزِ student_id در studentSubOf',
    bad: "    if(!isLegacy && Number(row.student_id)!==studentId) return;\n",
    mut: "    if(false) return;\n",
    expectFail: 'منقضی',
  },
  {
    file: 'src/js/23-subscription.js',
    name: 'M2 مسیرِ هم‌ولی در effectiveParentAccess',
    bad: "    if(found && found.payerId!==parentId)",
    mut: "    if(found && found.payerId===parentId)",
    expectFail: 'دسترسی',
  },
  {
    file: 'src/js/23-subscription.js',
    name: 'M3 student_id در ساختِ تستِ رایگان',
    bad: "best = insert('parent_subscriptions',{user_id:asParent,student_id:studentId,plan:'trial',amount:0,status:'trial',",
    mut: "best = insert('parent_subscriptions',{user_id:asParent,student_id:null,plan:'trial',amount:0,status:'trial',",
    expectFail: 'تست باید برای همان فرزند ساخته شود',
  },
  {
    file: 'src/js/07-shell.js',
    name: 'M4 گاردِ فرزندبه‌فرزند در رندر',
    bad: "  if(activePersona()==='parent'&&free.indexOf(S.route)<0&&S.child",
    mut: "  if(activePersona()==='parent'&&free.indexOf(S.route)<0&&false",
    expectFail: 'فرزندِ منقضی باید قفل شود',
  },
];

let killed = 0;
for (const m of MUTS) {
  const src = FILES[m.file];
  if (src.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
  fs.writeFileSync(m.file, src.replace(m.bad, m.mut));
  execSync('node build.js', { stdio: 'pipe' });
  let out = '', crashed = false;
  const __r89cmd = 'node tests/subs2.js';
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
const out = execSync('node tests/subs2.js', { stdio: 'pipe' }).toString();
console.log(out.split('\n').find(l => l.includes('موفق')));
console.log(killed === MUTS.length ? `همهٔ ${MUTS.length} جهش کشته شدند ✅` : `فقط ${killed}/${MUTS.length} جهش کشته شد ❌`);
process.exit(killed === MUTS.length ? 0 : 1);
