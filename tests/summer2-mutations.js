#!/usr/bin/env node
/**
 * تست‌های جهشیِ کلاس‌های تابستانی (بند ۶.۴)
 *  M1 — برداشتنِ دامنهٔ مدرسه در summerOf → U1
 *  M2 — نذخیره‌شدنِ student_ids در summer-students-save → U3
 *  M3 — برداشتنِ summer_classes از WRITE_PERMS (سرور) → B1
 *
 * اجرا:  node tests/summer2-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('sum2-mut-');
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
  const runOnce = () => spawnSync('node', [path.join(ROOT, suite)], { cwd: ROOT, encoding: 'utf8', env: kit.env() });
  /* R92: مرگِ زودهنگامِ کشف‌کننده (پورت اشغال/حافظه — قبل از چاپِ چکِ موردِ انتظار و خطِ خلاصه)
     → retry یک‌بار، بعد env-failِ صریح. هرگز «زنده ماند»ِ کاذب. */
  const completed = (out) => /بررسی — /.test(out || '');
  {
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
    chk(r.status !== 0 && killRe.test(r.stdout), tag + ' کشته شد');
  }
}

mutate('src/js/64-summer-classes.js',
  'function(s){return s.school_id===schoolId;}',
  'function(s){return true;}',
  'tests/summer2.js', /❌ U1/, 'M1 برداشتنِ دامنهٔ مدرسه');

mutate('src/js/19-actions-core.js',
  "update('summer_classes',sc.id,{student_ids:sel,updated_at:todayISO()});",
  "update('summer_classes',sc.id,{updated_at:todayISO()});",
  'tests/summer2.js', /❌ U3/, 'M2 نذخیره‌شدنِ student_ids');

/* R96 P0-1: WRITE_PERMSِ literal منسوخ — دروازه = canOp در fieldGate */
mutate('server/sync.js',
  "if(!exc && !canOp(s.role, op.c, op.t)) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };",
  "if(!exc && !canOp(s.role, op.c, op.t) || (op.c === 'summer_classes' && s.role === 'manager')) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };",
  'tests/summer3.js', /❌ B1/, 'M3 برداشتنِ summer_classes از fieldGate (manager)');

/* خطِّ پایه (بدون env — سورس‌های اصلی) */
const b2 = spawnSync('node', [path.join(ROOT, 'tests/summer2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ summer2 سبز است');
const b3 = spawnSync('node', [path.join(ROOT, 'tests/summer3.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b3.status === 0, 'خطِّ پایهٔ summer3 سبز است');

console.log(`\nsummer2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
