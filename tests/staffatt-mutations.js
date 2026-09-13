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
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('sat-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

let lastFile = null;
function mutate(file, from, to, killRe, tag) {
  const f = path.join(ROOT, file);
  if (lastFile && lastFile !== f) kit.clear(lastFile); /* فقط جهشِ جاری فعال */
  lastFile = f;
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  kit.mutant(f, bad); /* کپی جدا؛ سورس اصلی دست‌نخورده */
  {
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() });
    const r = spawnSync('node', [path.join(ROOT, 'tests/staffatt2.js')], { cwd: ROOT, encoding: 'utf8', env: kit.env() });
    const out = r.stdout || r.stderr || '';
    chk(r.status !== 0 && killRe.test(out), tag + ' کشته شد');
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

/* خطِّ پایه (بدون env — سورس‌های اصلی) */
const b = spawnSync('node', [path.join(ROOT, 'tests/staffatt2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b.status === 0, 'خطِّ پایهٔ staffatt2 سبز است');
const total = pass + fail;
console.log(`جهش‌های حضور کادر: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);
