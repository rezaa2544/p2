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

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, envFails = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

function mutate(file, from, to, suite, killRe, tag, noBuild) {
  const f = path.join(ROOT, file);
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  fs.writeFileSync(f, bad, 'utf8');
  try {
  const runOnce = () => spawnSync('node', [path.join(ROOT, suite)], { cwd: ROOT, encoding: 'utf8' });
  /* R92: مرگِ زودهنگامِ کشف‌کننده (پورت اشغال/حافظه — قبل از چاپِ چکِ موردِ انتظار و خطِ خلاصه) → retry یک‌بار، بعد env-failِ صریح. هرگز «زنده ماند»ِ کاذب. */
  const completed = (o) => /بررسی — /.test(o || '');
  
  if (!noBuild) execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
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
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
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

mutate('server/sync.js',
  "counselor  : ['counselor_refs','messages','counselor_msgs'],",
  "counselor  : ['counselor_refs','messages'],",
  'tests/cmsg3.js', /❌ S5/, 'M4 حذفِ مجوزِ مشاور از WRITE_PERMS (سرور)', true);

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const b2 = spawnSync('node', [path.join(ROOT, 'tests/cmsg2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ cmsg2 سبز است');
const b3 = spawnSync('node', [path.join(ROOT, 'tests/cmsg3.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b3.status === 0, 'خطِّ پایهٔ cmsg3 سبز است');

console.log(`\ncmsg2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
