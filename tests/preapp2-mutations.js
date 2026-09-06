#!/usr/bin/env node
/**
 * تست‌های جهشیِ قیف پیش‌ثبت‌نام (بند ۴.۴)
 *  M1 — برداشتنِ دامنهٔ مدرسه در viewPreapps  →  P2 باید شکست بخورد
 *  M2 — برداشتنِ نگهبانِ مرحلهٔ آخر (پرش/عقب) →  P4 باید شکست بخورد
 *  M3 — برداشتنِ preapps از WRITE_PERMS مدیر (سرور) →  A1 باید شکست بخورد
 *
 * اجرا:  node tests/preapp2-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

function restore(p) { /* backup handled inline per mutation */ }

/* M1 — دامنهٔ مدرسه */
{
  const f = path.join(ROOT, 'src/js/61-preapp.js');
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace('function(r){return r.school_id===u.school_id;}', 'function(r){return true;}');
  chk(bad !== orig, 'M1 جهشِ دامنهٔ مدرسه اعمال شد');
  if (bad !== orig) {
    fs.writeFileSync(f, bad, 'utf8');
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
    const r = spawnSync('node', [path.join(ROOT, 'tests/preapp2.js')], { cwd: ROOT, encoding: 'utf8' });
    fs.writeFileSync(f, orig, 'utf8');
    chk(r.status !== 0 && r.stdout.indexOf('P2') > -1 && /❌ P2/.test(r.stdout), 'M1 کشته شد (P2 شکست خورد)');
  }
}

/* M2 — نگهبانِ مرحلهٔ آخر در اکشن (19-actions.js) */
{
  const f = path.join(ROOT, 'src/js/19-actions.js');
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace('if(i<0||i>=PREAPP_STAGES.length-1){toast','if(i<0){toast');
  chk(bad !== orig, 'M2 جهشِ نگهبانِ اکشنِ مرحلهٔ آخر اعمال شد');
  if (bad !== orig) {
    fs.writeFileSync(f, bad, 'utf8');
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
    const r = spawnSync('node', [path.join(ROOT, 'tests/preapp2.js')], { cwd: ROOT, encoding: 'utf8' });
    fs.writeFileSync(f, orig, 'utf8');
    chk(r.status !== 0 && /❌ P4/.test(r.stdout), 'M2 کشته شد (P4 شکست خورد)');
  }
}

/* M3 — WRITE_PERMS سرور: preapps از مدیر */
{
  const f = path.join(ROOT, 'server/sync.js');
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace("'preapps','scholarships'", "'scholarships'");
  chk(bad !== orig, 'M3 جهشِ WRITE_PERMS سرور اعمال شد');
  if (bad !== orig) {
    fs.writeFileSync(f, bad, 'utf8');
    const r = spawnSync('node', [path.join(ROOT, 'tests/preapp3.js')], { cwd: ROOT, encoding: 'utf8' });
    fs.writeFileSync(f, orig, 'utf8');
    chk(r.status !== 0 && /❌ A1 مدیر/.test(r.stdout), 'M3 کشته شد (A1 شکست خورد)');
  }
}

/* بازسازیِ نهایی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const base2 = spawnSync('node', [path.join(ROOT, 'tests/preapp2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(base2.status === 0, 'خطِّ پایهٔ preapp2 سبز است');
const base3 = spawnSync('node', [path.join(ROOT, 'tests/preapp3.js')], { cwd: ROOT, encoding: 'utf8' });
chk(base3.status === 0, 'خطِّ پایهٔ preapp3 سبز است');

console.log(`\npreapp2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
