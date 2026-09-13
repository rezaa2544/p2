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
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('sch2-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, envFails = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

let lastFile = null;
function mutate(file, from, to, suite, killRe, tag) {
  const f = path.join(ROOT, file);
  if (lastFile && lastFile !== f) kit.clear(lastFile); /* فقط جهشِ جاری فعال */
  lastFile = f;
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  kit.mutant(f, bad); /* کپی جدا؛ سورس اصلی دست‌نخورده */
  {
  const runOnce = () => spawnSync('node', [path.join(ROOT, suite)], { cwd: ROOT, encoding: 'utf8', env: kit.env() });
  /* R92: مرگِ زودهنگامِ کشف‌کننده (پورت اشغال/حافظه — قبل از چاپِ چکِ موردِ انتظار و خطِ خلاصه) → retry یک‌بار، بعد env-failِ صریح. هرگز «زنده ماند»ِ کاذب. */
  const completed = (o) => /بررسی — /.test(o || '');
  
  execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() });
  let r = runOnce();
  if (r.status !== 0 && !killRe.test(r.stdout) && !completed(r.stdout)) {
    const r2 = runOnce();
    if (r2.status === 0 || killRe.test(r2.stdout) || completed(r2.stdout)) r = r2;
  }
  if (r.status !== 0 && !killRe.test(r.stdout) && !completed(r.stdout)) {
    envFails++;
    chk(false, tag + ' — خطای محیطی: چکِ موردِ انتظار هرگز چاپ نشد (مرگِ زودهنگامِ تست — پورت/حافظه) — نه کشته و نه زنده شمرده شد');
    return;
  }
  chk(r.status !== 0 && killRe.test(r.stdout), tag);
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

/* R96 P0-1: WRITE_PERMSِ literal منسوخ — دروازه = canOp در fieldGate */
mutate('server/sync.js',
  "if(!exc && !canOp(s.role, op.c, op.t)) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };",
  "if(!exc && !canOp(s.role, op.c, op.t) || (op.c === 'scholarships' && s.role === 'manager')) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };",
  'tests/scholarship3.js', /❌ B1/, 'M3 برداشتنِ scholarships از fieldGate (manager)');

/* خطِّ پایه (بدون env — سورس‌های اصلی) */
const b2 = spawnSync('node', [path.join(ROOT, 'tests/scholarship2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ scholarship2 سبز است');
const b3 = spawnSync('node', [path.join(ROOT, 'tests/scholarship3.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b3.status === 0, 'خطِّ پایهٔ scholarship3 سبز است');

console.log(`\nscholarship2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
