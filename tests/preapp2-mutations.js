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

/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ هم‌جوارِ جدا (mutant-kit)؛
   سورس اصلی هرگز بازنویسی نمی‌شود — restore/بازگردانیِ درجا حذف شد. */
const { session } = require('./helpers/mutant-kit');
const kit = session('pap2-');kit.remapBuildOutputs(); /* index.html/.build-cache.* → سایه؛ خروجیِ build اصلی دست نمی‌خورد */
let pass = 0, fail = 0, envFails = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

/* restore درجا حذف شد: هر جهش کپیِ خودش را دارد (kit) */

/* M1 — دامنهٔ مدرسه */
{
  const f = path.join(ROOT, 'src/js/61-preapp.js');
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace('function(r){return r.school_id===u.school_id;}', 'function(r){return true;}');
  chk(bad !== orig, 'M1 جهشِ دامنهٔ مدرسه اعمال شد');
  if (bad !== orig) {
    const mcopy = kit.mutant(f, bad); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
    try { fs.chmodSync(mcopy, fs.statSync(f).mode); } catch (_) {}
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() });
    const runOnce = () => spawnSync('node', [path.join(ROOT, 'tests/preapp2.js')], { cwd: ROOT, encoding: 'utf8', env: kit.env() });
  /* R92: مرگِ زودهنگامِ کشف‌کننده (پورت اشغال/حافظه — قبل از چاپِ چکِ موردِ انتظار و خطِ خلاصه) → retry یک‌بار، بعد env-failِ صریح. هرگز «زنده ماند»ِ کاذب. */
    const completed = (o) => /بررسی — /.test(o || '');
    let r = runOnce();
    if (r.status !== 0 && !/❌ P2/.test(r.stdout) && !completed(r.stdout)) {
      const r2 = runOnce();
      if (r2.status === 0 || /❌ P2/.test(r2.stdout) || completed(r2.stdout)) r = r2;
    }
    kit.clear(f);
    if (r.status !== 0 && !/❌ P2/.test(r.stdout) && !completed(r.stdout)) {
      envFails++;
      chk(false, 'M1 — خطای محیطی: چکِ موردِ انتظار هرگز چاپ نشد (مرگِ زودهنگامِ تست — پورت/حافظه) — نه کشته و نه زنده شمرده شد');
      return;
    }
    chk(r.status !== 0 && r.stdout.indexOf('P2') > -1 && /❌ P2/.test(r.stdout), 'M1 کشته شد (P2 شکست خورد)');
  }
}

/* M2 — نگهبانِ مرحلهٔ آخر در اکشن (19-actions-core.js) */
{
  const f = path.join(ROOT, 'src/js/19-actions-core.js');
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace('if(i<0||i>=PREAPP_STAGES.length-1){toast','if(i<0){toast');
  chk(bad !== orig, 'M2 جهشِ نگهبانِ اکشنِ مرحلهٔ آخر اعمال شد');
  if (bad !== orig) {
    const mcopy = kit.mutant(f, bad); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
    try { fs.chmodSync(mcopy, fs.statSync(f).mode); } catch (_) {}
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() });
    const runOnce = () => spawnSync('node', [path.join(ROOT, 'tests/preapp2.js')], { cwd: ROOT, encoding: 'utf8', env: kit.env() });
  /* R92: مرگِ زودهنگامِ کشف‌کننده (پورت اشغال/حافظه — قبل از چاپِ چکِ موردِ انتظار و خطِ خلاصه) → retry یک‌بار، بعد env-failِ صریح. هرگز «زنده ماند»ِ کاذب. */
    const completed = (o) => /بررسی — /.test(o || '');
    let r = runOnce();
    if (r.status !== 0 && !/❌ P4/.test(r.stdout) && !completed(r.stdout)) {
      const r2 = runOnce();
      if (r2.status === 0 || /❌ P4/.test(r2.stdout) || completed(r2.stdout)) r = r2;
    }
    kit.clear(f);
    if (r.status !== 0 && !/❌ P4/.test(r.stdout) && !completed(r.stdout)) {
      envFails++;
      chk(false, 'M2 — خطای محیطی: چکِ موردِ انتظار هرگز چاپ نشد (مرگِ زودهنگامِ تست — پورت/حافظه) — نه کشته و نه زنده شمرده شد');
      return;
    }
    chk(r.status !== 0 && /❌ P4/.test(r.stdout), 'M2 کشته شد (P4 شکست خورد)');
  }
}

/* M3 — مجوزِ preappsِ مدیر (R96 P0-1: WRITE_PERMSِ literal منسوخ شد؛
   دروازه = canOp در fieldGate) — مسدودکردنِ مدیر → A1 باید بپارَد */
{
  const f = path.join(ROOT, 'server/sync.js');
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(
    "if(!exc && !canOp(s.role, op.c, op.t)) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };",
    "if(!exc && !canOp(s.role, op.c, op.t) || (op.c === 'preapps' && s.role === 'manager')) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };");
  chk(bad !== orig, 'M3 جهشِ fieldGate سرور اعمال شد (preapps/manager)');
  if (bad !== orig) {
    const mcopy = kit.mutant(f, bad); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
    try { fs.chmodSync(mcopy, fs.statSync(f).mode); } catch (_) {}
    const runOnce = () => spawnSync('node', [path.join(ROOT, 'tests/preapp3.js')], { cwd: ROOT, encoding: 'utf8', env: kit.env() });
  /* R92: مرگِ زودهنگامِ کشف‌کننده (پورت اشغال/حافظه — قبل از چاپِ چکِ موردِ انتظار و خطِ خلاصه) → retry یک‌بار، بعد env-failِ صریح. هرگز «زنده ماند»ِ کاذب. */
    const completed = (o) => /بررسی — /.test(o || '');
    let r = runOnce();
    if (r.status !== 0 && !/❌ A1 مدیر/.test(r.stdout) && !completed(r.stdout)) {
      const r2 = runOnce();
      if (r2.status === 0 || /❌ A1 مدیر/.test(r2.stdout) || completed(r2.stdout)) r = r2;
    }
    kit.clear(f);
    if (r.status !== 0 && !/❌ A1 مدیر/.test(r.stdout) && !completed(r.stdout)) {
      envFails++;
      chk(false, 'M3 — خطای محیطی: چکِ موردِ انتظار هرگز چاپ نشد (مرگِ زودهنگامِ تست — پورت/حافظه) — نه کشته و نه زنده شمرده شد');
      return;
    }
    chk(r.status !== 0 && /❌ A1 مدیر/.test(r.stdout), 'M3 کشته شد (A1 شکست خورد)');
  }
}

/* خطِّ پایه — سورس‌ها هرگز لمس نشدند و خروجیِ build سایه بود؛
   بازسازیِ نهایی حذف شد (baseline روی buildِ commit‌شدهٔ repo) */
const base2 = spawnSync('node', [path.join(ROOT, 'tests/preapp2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(base2.status === 0, 'خطِّ پایهٔ preapp2 سبز است');
const base3 = spawnSync('node', [path.join(ROOT, 'tests/preapp3.js')], { cwd: ROOT, encoding: 'utf8' });
chk(base3.status === 0, 'خطِّ پایهٔ preapp3 سبز است');

console.log(`\npreapp2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
