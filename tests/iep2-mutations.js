#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — IEP (بند ۲.۲)
   هر جهش باید tests/iep2.js را بشکاند؛ وگرنه تست بی‌اثر است.
   ═══════════════════════════════════════════════════════════════════ */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('iep2-mut-');
const ROOT = path.join(__dirname, '..');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const FILES = {
  'src/js/17-student-record.js': fs.readFileSync('src/js/17-student-record.js', 'utf8'),
  'src/js/19-actions-core.js': fs.readFileSync('src/js/19-actions-core.js', 'utf8'),
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
    file: 'src/js/19-actions-core.js',
    name: 'M3 تاریخِ به‌روزرسانی در IEP ذخیره نشود',
    bad: "     update('users',sid,{iep_notes:V('iep_notes'),iep_staff:V('iep_staff'),iep_updated:todayISO()});",
    mut: "     update('users',sid,{iep_notes:V('iep_notes'),iep_staff:V('iep_staff')});",
    expectFail: 'تاریخِ به‌روزرسانی تازه نشد',
  },
];

let killed = 0, prevFile = null;
for (const m of MUTS) {
  const abs = path.join(ROOT, m.file);
  if (prevFile && prevFile !== abs) kit.clear(prevFile); /* فقط جهشِ جاری فعال */
  prevFile = abs;
  const src = FILES[m.file];
  if (src.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
  kit.mutant(abs, src.replace(m.bad, m.mut)); /* کپی جدا؛ سورس اصلی دست‌نخورده */
  execSync('node build.js', { stdio: 'pipe', env: kit.env(), cwd: ROOT });
  let out = '', crashed = false;
  const __r89cmd = 'node tests/iep2.js';
  try { execSync(__r89cmd, { stdio: 'pipe', env: kit.env(), cwd: ROOT }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (out.trim() === '') { /* R89: empty output = process killed (env/memory) — retry once */
      try { execSync(__r89cmd, { stdio: 'pipe', env: kit.env(), cwd: ROOT }); out = 'PASSED (no failure)'; }
      catch (e2) { out = String(e2.stdout || '') + String(e2.stderr || ''); }
    }
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
    if (out.trim() === '') out = '\u274c \u062e\u0637\u0627: \u0641\u0631\u0622\u06cc\u0646\u062f \u0628\u062f\u0648\u0646 \u062e\u0631\u0648\u062c\u06cc \u06a9\u0634\u062a\u0647 \u0634\u062f (\u0645\u062d\u06cc\u0637) \u2014 \u00ab\u0632\u0646\u062f\u0647 \u0645\u0627\u0646\u062f\u0646\u00bb \u062c\u0647\u0634 \u0646\u06cc\u0633\u062a';
  }
  const killedThis = crashed ? (m.crashOK === true) : (/❌/.test(out) && out.includes(m.expectFail));
  console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' : 'زنده ماند! (خطا: ' + (out.split('\n').find(l => l.includes('❌')) || out.slice(0, 120)) + ')'}`);
  if (killedThis) killed++;
}

try {
  execSync('node tests/iep2.js', { stdio: 'pipe' });
  console.log('  ✅ خطِ پایه (بدون جهش) سبز است');
} catch (e) {
  console.log('  ❌ خطِ پایه شکست — جهش‌ها را دوباره بررسی کنید');
}
console.log(`\niep2-mutations: ${killed}/${MUTS.length} جهش کشته شد ${killed === MUTS.length ? '✅' : '❌'}`);
process.exit(killed === MUTS.length ? 0 : 1);
