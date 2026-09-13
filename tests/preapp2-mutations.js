#!/usr/bin/env node
/**
 * تست‌های جهشیِ قیف پیش‌ثبت‌نام (بند ۴.۴)
 *  M1 — برداشتنِ دامنهٔ مدرسه در viewPreapps  →  P2 باید شکست بخورد
 *  M2 — برداشتنِ نگهبانِ مرحلهٔ آخر (پرش/عقب) →  P4 باید شکست بخورد
 *  M3 — مسدودکردنِ مدیر برای preapps (fieldGate) →  A1 باید شکست بخورد
 *
 * ─────────────────────────────────────────────────────────────
 * BH-mut فاز ۲ / چت ۸ دور ۵ (الگوی امن p06/p11): جهش در کپیِ جدا
 * (mutant-kit) + build در سایه؛ سورس اصلی هرگز بازنویسی نمی‌شود —
 * rebuildِ پایانیِ رویِ دیسک حذف شد.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { session } = require('./helpers/mutant-kit');
const kit = session('preapp2-mut-');
const ROOT = path.join(__dirname, '..');
kit.remapBuildOutputs();

let pass = 0, fail = 0, envFails = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }
function buildShadow() {
  try { execSync(process.execPath + ' build.js', { stdio: 'pipe', cwd: ROOT, env: kit.env(), timeout: 240000 }); return true; }
  catch (e) { return false; }
}
const runOnce = (suite) => spawnSync(process.execPath, [suite], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 300000, env: kit.env() });
const runPlain = (suite) => spawnSync(process.execPath, [suite], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 300000 });
/* R92: مرگِ زودهنگام (پورت/حافظه — قبل از چاپِ چکِ مورد انتظار) → retry یک‌بار،
   بعد env-failِ صریح. هرگز «زنده ماند»ِ کاذب. */
const completed = (o) => /بررسی — /.test(o || '');

/* M1 — دامنهٔ مدرسه */
{
  const f = path.join(ROOT, 'src/js/61-preapp.js');
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace('function(r){return r.school_id===u.school_id;}', 'function(r){return true;}');
  chk(bad !== orig, 'M1 جهشِ دامنهٔ مدرسه اعمال شد');
  if (bad !== orig) {
    const copy = kit.mutant(f, bad); /* کپیِ جدا */
    if (!buildShadow()) { envFails++; chk(false, 'M1 — build در سایه شکست (خطای محیطی)'); }
    else {
      let r = runOnce('tests/preapp2.js');
      if (r.status !== 0 && !/❌ P2/.test(r.stdout) && !completed(r.stdout)) r = runOnce('tests/preapp2.js');
      if (r.status !== 0 && !/❌ P2/.test(r.stdout) && !completed(r.stdout)) {
        envFails++;
        chk(false, 'M1 — خطای محیطی: چکِ مورد انتظار هرگز چاپ نشد — نه کشته و نه زنده شمرده شد');
      } else chk(r.status !== 0 && /❌ P2/.test(r.stdout), 'M1 کشته شد (P2 شکست خورد)');
    }
    kit.clear(f);
    try { fs.unlinkSync(copy); } catch (_) { /* بهترین تلاش */ }
  }
}

/* M2 — نگهبانِ مرحلهٔ آخر در اکشن (19-actions-core.js) */
{
  const f = path.join(ROOT, 'src/js/19-actions-core.js');
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace('if(i<0||i>=PREAPP_STAGES.length-1){toast', 'if(i<0){toast');
  chk(bad !== orig, 'M2 جهشِ نگهبانِ اکشنِ مرحلهٔ آخر اعمال شد');
  if (bad !== orig) {
    const copy = kit.mutant(f, bad); /* کپیِ جدا */
    if (!buildShadow()) { envFails++; chk(false, 'M2 — build در سایه شکست (خطای محیطی)'); }
    else {
      let r = runOnce('tests/preapp2.js');
      if (r.status !== 0 && !/❌ P4/.test(r.stdout) && !completed(r.stdout)) r = runOnce('tests/preapp2.js');
      if (r.status !== 0 && !/❌ P4/.test(r.stdout) && !completed(r.stdout)) {
        envFails++;
        chk(false, 'M2 — خطای محیطی: چکِ مورد انتظار هرگز چاپ نشد — نه کشته و نه زنده شمرده شد');
      } else chk(r.status !== 0 && /❌ P4/.test(r.stdout), 'M2 کشته شد (P4 شکست خورد)');
    }
    kit.clear(f);
    try { fs.unlinkSync(copy); } catch (_) { /* بهترین تلاش */ }
  }
}

/* M3 — مجوزِ preappsِ مدیر (R96: دروازه = canOp در fieldGate) — مسدودکردنِ مدیر → A1 باید بپارَد */
{
  const f = path.join(ROOT, 'server/sync.js');
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(
    "if(!exc && !canOp(s.role, op.c, op.t)) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };",
    "if(!exc && !canOp(s.role, op.c, op.t) || (op.c === 'preapps' && s.role === 'manager')) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };");
  chk(bad !== orig, 'M3 جهشِ fieldGate سرور اعمال شد (preapps/manager)');
  if (bad !== orig) {
    const copy = kit.mutant(f, bad); /* کپیِ جدا — بدونِ build (سوئیت server را مستقیم require می‌کند) */
    let r = runOnce('tests/preapp3.js');
    if (r.status !== 0 && !/❌ A1 مدیر/.test(r.stdout) && !completed(r.stdout)) r = runOnce('tests/preapp3.js');
    if (r.status !== 0 && !/❌ A1 مدیر/.test(r.stdout) && !completed(r.stdout)) {
      envFails++;
      chk(false, 'M3 — خطای محیطی: چکِ مورد انتظار هرگز چاپ نشد — نه کشته و نه زنده شمرده شد');
    } else chk(r.status !== 0 && /❌ A1 مدیر/.test(r.stdout), 'M3 کشته شد (A1 شکست خورد)');
    kit.clear(f);
    try { fs.unlinkSync(copy); } catch (_) { /* بهترین تلاش */ }
  }
}

kit.sweepStrays(); /* جارویِ سایه‌هایِ بازمانده پیش ازِ خطِّ پایه */
/* خطِّ پایه (بدون env، بدون جهش) — R97: یک retry برای هرکدام */
let base2 = runPlain('tests/preapp2.js');
if (base2.status !== 0) base2 = runPlain('tests/preapp2.js');
chk(base2.status === 0, 'خطِّ پایهٔ preapp2 سبز است');
let base3 = runPlain('tests/preapp3.js');
if (base3.status !== 0) base3 = runPlain('tests/preapp3.js');
chk(base3.status === 0, 'خطِّ پایهٔ preapp3 سبز است');

console.log(`\npreapp2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail} (env-fails=${envFails})`);
process.exit(fail ? 1 : 0);
