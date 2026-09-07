#!/usr/bin/env node
/**
 * تست‌های جهشیِ کمک‌هزینه (بند ۲.۴)
 *  M1 — برداشتنِ دامنهٔ مدرسه در viewScholarships → S1/S2 باید شکست بخورند
 *  M2 — برداشتنِ گاردِ جابه‌جاییِ نامجاز (scholar-set) → S4 باید شکست بخورد
 *  M3 — برداشتنِ scholarships از WRITE_PERMS مدیر (سرور) → B1 باید شکست بخورد
 *
 * اجرا:  node tests/scholarship2-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

function mutate(file, from, to, suite, killRe, tag) {
  const f = path.join(ROOT, file);
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  fs.writeFileSync(f, bad, 'utf8');
  try {
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
    const r = spawnSync('node', [path.join(ROOT, suite)], { cwd: ROOT, encoding: 'utf8' });
    chk(r.status !== 0 && killRe.test(r.stdout), tag + ' کشته شد');
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
  }
}

mutate('src/js/62-scholarship.js',
  'function(r){return r.school_id===u.school_id;}',
  'function(r){return true;}',
  'tests/scholarship2.js', /❌ S1|❌ S2/, 'M1 برداشتنِ دامنهٔ مدرسه');

mutate('src/js/19-actions-core.js',
  "if(!to||!allowed){toast('این جابه‌جایی مجاز نیست','err');return;}",
  "if(!to){toast('این جابه‌جایی مجاز نیست','err');return;}",
  'tests/scholarship2.js', /❌ S4/, 'M2 برداشتنِ گاردِ جابه‌جاییِ نامجاز');

mutate('server/sync.js',
  "'scholarships','reexams'",
  "'reexams'",
  'tests/scholarship3.js', /❌ B1/, 'M3 برداشتنِ scholarships از WRITE_PERMS');

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const b2 = spawnSync('node', [path.join(ROOT, 'tests/scholarship2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ scholarship2 سبز است');
const b3 = spawnSync('node', [path.join(ROOT, 'tests/scholarship3.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b3.status === 0, 'خطِّ پایهٔ scholarship3 سبز است');

console.log(`\nscholarship2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
