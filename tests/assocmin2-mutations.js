#!/usr/bin/env node
/**
 * تست‌های جهشیِ صورت‌جلسهٔ انجمن (بند ۶.۲)
 *  M1 — برداشتنِ دامنهٔ مدرسه در assocMinutes → A1
 *  M2 — ثابت‌کردنِ archived:true در toggle → A4
 *  M3 — برداشتنِ assoc_minutes از WRITE_PERMS (سرور) → B1
 *
 * اجرا:  node tests/assocmin2-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('am2-mut-');
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

mutate('src/js/60-association.js',
  'function(m){return m.school_id===schoolId;}',
  'function(m){return true;}',
  'tests/assocmin2.js', /❌ A1/, 'M1 برداشتنِ دامنهٔ مدرسه');

mutate('src/js/19-actions-core.js',
  "update('assoc_minutes',m.id,{archived:!m.archived,updated_at:todayISO()});",
  "update('assoc_minutes',m.id,{archived:true,updated_at:todayISO()});",
  'tests/assocmin2.js', /❌ A4/, 'M2 ثابت‌کردنِ archived:true');

/* R96 P0-1: WRITE_PERMSِ literal دیگر نیست — دروازهٔ نقش = canOp در fieldGate.
   جهش = خاموش‌کردنِ دروازه برایِ assoc_minutes → B3 (دبیر → رد) باید بپارَد. */
mutate('server/sync.js',
  "if(!exc && !canOp(s.role, op.c, op.t)) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };",
  "if(!exc && !canOp(s.role, op.c, op.t) || (op.c === 'assoc_minutes' && s.role === 'manager')) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };",
  'tests/assocmin3.js', /❌ B1/, 'M3 برداشتنِ مجوزِ assoc_minutes از fieldGate (manager)');

/* خطِّ پایه (بدون env — سورس‌های اصلی) */
const b2 = spawnSync('node', [path.join(ROOT, 'tests/assocmin2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ assocmin2 سبز است');
const b3 = spawnSync('node', [path.join(ROOT, 'tests/assocmin3.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b3.status === 0, 'خطِّ پایهٔ assocmin3 سبز است');

console.log(`\nassocmin2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
