#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   teacher-eval-mutations.js — بند ب.۳: آزمون جهشِ ارزشیابی ناشناس
   ───────────────────────────────────────────────────────────────────
   هر جهش یک حفرهٔ ناشناسی/امنیتی واقعی است؛ سوئیتِ رفتاری باید آن
   را بکُشد (اجرا قرمز شود)، وگرنه نگهبان ناقص است.

   M1  تزریق created_by به درج       ⇒ باید با ❌ E4 کشته شود
   M2  حذف گارد مدرسهٔ ثبت (IDOR)    ⇒ باید با ❌ E5 کشته شود
   M3  حذف بررسی کامل بودن معیارها   ⇒ باید با ❌ E3 کشته شود
   اجرا:  node tests/teacher-eval-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا (mutant-kit)؛ سورس اصلی
   هرگز بازنویسی نمی‌شود — بازگردانی حذف شد (clear نگاشت). */
const { session } = require('./helpers/mutant-kit');
const kit = session('teal-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */
const SUITE = path.join(ROOT, 'tests', 'teacher-eval.js');
const F = path.join(ROOT, 'src', 'js', '73-teacher-eval.js');

let pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  —  ' + extra : '')); }
}

/* خط پایه: سوئیت رفتاری باید سبز باشد */
console.log('▸ خطِّ پایه');
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const base = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8' });
chk('خطِّ پایهٔ teacher-eval سبز است', base.status === 0, (base.stdout || '').slice(-200));
if (base.status !== 0) { console.log((base.stdout || '') + (base.stderr || '')); process.exit(1); }

function mutate(find, replace, killRe, tag) {
  const orig = fs.readFileSync(F, 'utf8');
  try {
    if (!orig.includes(find)) { chk(tag + ' (جهش پیدا نشد)', false); return; }
    const mcopy = kit.mutant(F, orig.replace(find, replace)); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
    try { fs.chmodSync(mcopy, fs.statSync(F).mode); } catch (_) {}
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() }); /* build در سایه */
    const r = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 120000, env: kit.env() });
    const out = (r.stdout || '') + (r.stderr || '');
    chk(tag + ' کشته شد', r.status !== 0 && killRe.test(out), out.slice(-260).replace(/\n/g, ' '));
  } finally {
    kit.clear(F); /* نقشهٔ خالی؛ پاک‌سازیِ واقعی در exit */
  }
}

console.log('\n▸ جهش‌ها');
mutate(
  `criteria: rates, feedback: fb, created_at: todayISO()`,
  `criteria: rates, feedback: fb, created_at: todayISO(), created_by: u.id`,
  /❌ E4/, 'M1 تزریق هویت در درج');

mutate(
  `if(!tevalTeacherAllowed(u, tid)){ toast('این دبیر در مدرسهٔ شما نیست', 'err'); return; }`,
  `/* گارد عضویت حذف شد */`,
  /❌ E5/, 'M2 حذف گارد عضویت دبیر (IDOR)');

mutate(
  `if(missing){ toast(`,
  `if(false){ toast(`,
  /❌ E3/, 'M3 حذف بررسی کامل بودن معیارها');

/* بازسازی نهایی + بازگشت به خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const fin = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8' });
chk('پس از بازگردانی، خطِّ پایه دوباره سبز است', fin.status === 0);

const total = pass + fail;
console.log('────────────────────────────────────────────────────');
console.log(`جهش‌های ب.۳: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);
