#!/usr/bin/env node
/**
 * جهش‌های بند B.1 فرناز (چت۱) — منطقِ ثبت و نمایشِ حضور کادر:
 *
 *  M1 — حذفِ گاردِ فقط-مدیر در markStaffAttendance → S4 باید شکست بخورد
 *  M2 — حذفِ فیلترِ ماه در staffAttMonthRecs (خلاصه همهٔ ماه‌ها) → S7 باید شکست بخورد
 *
 * اجرا: node tests/staffatt-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

function mutate(file, from, to, killRe, tag) {
  const f = path.join(ROOT, file);
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  fs.writeFileSync(f, bad, 'utf8');
  try {
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
    const r = spawnSync('node', [path.join(ROOT, 'tests/staffatt2.js')], { cwd: ROOT, encoding: 'utf8' });
    const out = r.stdout || r.stderr || '';
    chk(r.status !== 0 && killRe.test(out), tag + ' کشته شد');
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
  }
}

mutate('src/js/69-staff-attendance.js',
  `if (role !== 'manager' && role !== 'superadmin') return { ok: false, msg: 'فقط مدیر مدرسه می‌تواند حضور کادر را ثبت کند' };`,
  '',
  /❌ S4/, 'M1 حذف گارد فقط-مدیر');
mutate('src/js/69-staff-attendance.js',
  'if (j[0] !== jy || j[1] !== jm) continue;',
  '',
  /❌ S7/, 'M2 حذف فیلتر ماه');

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const b = spawnSync('node', [path.join(ROOT, 'tests/staffatt2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b.status === 0, 'خطِّ پایهٔ staffatt2 سبز است');
const total = pass + fail;
console.log(`جهش‌های حضور کادر: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);
