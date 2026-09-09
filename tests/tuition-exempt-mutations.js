#!/usr/bin/env node
/**
 * جهش‌های بند A.2 فرناز (چت۱) — منطقِ حساسِ مالیِ فرزندبه‌فرزند:
 *
 *  M1 — حذفِ سقفِ تخفیفِ شهریه (Math.min با plan.amount) → T7 باید شکست بخورد
 *  M2 — حذفِ فیلترِ student_id در studentSubOf (اشتراکِ یکی به دیگری نشت کند) → T4 باید شکست بخورد
 *
 * اجرا: node tests/tuition-exempt-mutations.js
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
    const r = spawnSync('node', [path.join(ROOT, 'tests/tuition-exempt.js')], { cwd: ROOT, encoding: 'utf8' });
    const out = r.stdout || r.stderr || '';
    chk(r.status !== 0 && killRe.test(out), tag + ' کشته شد');
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
  }
}

mutate('src/js/20-communication-finance.js',
  'discount = Math.max(0, Math.min(Number(discount)||0, plan.amount));',
  'discount = Math.max(0, Number(discount)||0);',
  /❌ T7/, 'M1 حذف سقف تخفیف');
mutate('src/js/23-subscription.js',
  'if(!isLegacy && Number(row.student_id)!==studentId) return;',
  'if(false) return;',
  /❌ T4/, 'M2 نشت اشتراک بین فرزندان');

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const b = spawnSync('node', [path.join(ROOT, 'tests/tuition-exempt.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b.status === 0, 'خطِّ پایهٔ tuition-exempt سبز است');
const total = pass + fail;
console.log(`جهش‌های معافیت/شاهد: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);
