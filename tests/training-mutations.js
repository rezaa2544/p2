#!/usr/bin/env node
/**
 * جهش‌های بند B.2 فرناز (چت۱) — منطقِ ثبت و صدورِ گواهی دوره:
 *
 *  M1 — حذفِ گاردِ فقط-مدیر در saveTrainingCourse → T6 باید شکست بخورد
 *  M2 — حذفِ ماشهٔ صدور گواهی در تکمیل → T3 باید شکست بخورد
 *
 * اجرا: node tests/training-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('trn-mut-');
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
    const r = spawnSync('node', [path.join(ROOT, 'tests/training2.js')], { cwd: ROOT, encoding: 'utf8', env: kit.env() });
    const out = r.stdout || r.stderr || '';
    chk(r.status !== 0 && killRe.test(out), tag + ' کشته شد');
  }
}

mutate('src/js/70-training.js',
  `if (role !== 'manager' && role !== 'superadmin') return { ok: false, msg: 'فقط مدیر مدرسه می‌تواند دوره ثبت کند' };`,
  '',
  /❌ T6/, 'M1 حذف گارد فقط-مدیر');
mutate('src/js/70-training.js',
  `if (rec.status === 'completed'){`,
  'if (false){',
  /❌ T3/, 'M2 حذف ماشهٔ صدور گواهی');

/* خطِّ پایه (بدون env — سورس‌های اصلی) */
const b = spawnSync('node', [path.join(ROOT, 'tests/training2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b.status === 0, 'خطِّ پایهٔ training2 سبز است');
const total = pass + fail;
console.log(`جهش‌های دوره‌های آموزشی: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);
