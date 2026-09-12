#!/usr/bin/env node
/**
 * تست‌های جهشیِ مسیرِ دوازدهم↔مشاور (بند ۵.۲)
 *  M1 — برداشتنِ گاردِ دوازدهم بودن → K3
 *  M2 — برداشتنِ گاردِ «فرزندِ خودت» از ولی → K3
 *  M3 — برداشتنِ گاردِ بین‌مدرسه‌ایِ مشاور → K4
 *  M4 — حذفِ counselor_msgs از WRITE_PERMSِ مشاور (سرور) → S5
 *
 * اجرا:  node tests/cmsg2-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('cmsg-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */


const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, envFails = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

let lastFile = null;
function mutate(file, from, to, suite, killRe, tag, noBuild) {
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
  
  if (!noBuild) execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() });
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

mutate('src/js/47-counselor.js',
  "if(!isTwelfthGrader(studentId))return {ok:false,msg:'این مسیر برای دانش‌آموزانِ دوازدهم است'};",
  "if(false)return {ok:false,msg:'این مسیر برای دانش‌آموزانِ دوازدهم است'};",
  'tests/cmsg2.js', /❌ K3/, 'M1 برداشتنِ گاردِ دوازدهم بودن');

mutate('src/js/47-counselor.js',
  'if(kids.indexOf(studentId)<0)return {ok:false,msg:\'این دانش‌آموز از فرزندان شما نیست\'};',
  'if(false)return {ok:false,msg:\'این دانش‌آموز از فرزندان شما نیست\'};',
  'tests/cmsg2.js', /❌ K3/, 'M2 برداشتنِ گاردِ فرزندِ خودت');

mutate('src/js/47-counselor.js',
  "if(authorUser.school_id&&authorUser.school_id!==st.school_id)return {ok:false,msg:'فقط در رشته‌های مدرسهٔ خودتان پاسخ می‌دهید'};",
  "if(false)return {ok:false,msg:'فقط در رشته‌های مدرسهٔ خودتان پاسخ می‌دهید'};",
  'tests/cmsg2.js', /❌ K4/, 'M3 برداشتنِ گاردِ بین‌مدرسه‌ایِ مشاور');

/* R96 P0-1: WRITE_PERMSِ literal دیگر نیست — دروازهٔ نقش = canOp در fieldGate.
   جهش = مسدودکردنِ مشاور روی counselor_msgs → S5 (پاسخِ مشاور ۲۰) باید بپارَد. */
mutate('server/sync.js',
  "if(!exc && !canOp(s.role, op.c, op.t)) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };",
  "if(!exc && !canOp(s.role, op.c, op.t) || (op.c === 'counselor_msgs' && s.role === 'counselor')) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };",
  'tests/cmsg3.js', /❌ S5/, 'M4 حذفِ مجوزِ مشاور از fieldGate (سرور)', true);

/* خطِّ پایه (بدون env — سورس‌های اصلی) */
const b2 = spawnSync('node', [path.join(ROOT, 'tests/cmsg2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ cmsg2 سبز است');
const b3 = spawnSync('node', [path.join(ROOT, 'tests/cmsg3.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b3.status === 0, 'خطِّ پایهٔ cmsg3 سبز است');

console.log(`\ncmsg2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
