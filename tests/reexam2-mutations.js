#!/usr/bin/env node
/**
 * تست‌های جهشیِ امتحاناتِ تجدیدی (بند ۶.۱)
 *  M1 — برداشتنِ دامنهٔ مدرسه در viewReexams → R2 باید شکست بخورد
 *  M2 — برداشتنِ تغییرِ وضعیت به «انجام‌شده» (reexam-score-save) → R4
 *  M3 — برداشتنِ reexams از WRITE_PERMS مدیر (سرور) → B1
 *
 * اجرا:  node tests/reexam2-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, envFails = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

function mutate(file, from, to, suite, killRe, tag) {
  const f = path.join(ROOT, file);
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  fs.writeFileSync(f, bad, 'utf8');
  try {
  const runOnce = () => spawnSync('node', [path.join(ROOT, suite)], { cwd: ROOT, encoding: 'utf8' });
  /* R92: مرگِ زودهنگامِ کشف‌کننده (پورت اشغال/حافظه — قبل از چاپِ چکِ موردِ انتظار و خطِ خلاصه) → retry یک‌بار، بعد env-failِ صریح. هرگز «زنده ماند»ِ کاذب. */
  const completed = (o) => /بررسی — /.test(o || '');
  
  execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
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

mutate('src/js/63-reexam.js',
  'function(r){return r.school_id===u.school_id;}',
  'function(r){return true;}',
  'tests/reexam2.js', /❌ R2/, 'M1 برداشتنِ دامنهٔ مدرسه');

mutate('src/js/19-actions-core.js',
  "update('reexams',sid,{new_score:n,status:'done',updated_at:todayISO()});",
  "update('reexams',sid,{new_score:n,status:'scheduled',updated_at:todayISO()});",
  'tests/reexam2.js', /❌ R4/, 'M2 برداشتنِ وضعیتِ انجام‌شده');

mutate('server/sync.js',
  "'reexams','assoc_minutes'",
  "'assoc_minutes'",
  'tests/reexam3.js', /❌ B1/, 'M3 برداشتنِ reexams از WRITE_PERMS');

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const b2 = spawnSync('node', [path.join(ROOT, 'tests/reexam2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ reexam2 سبز است');
const b3 = spawnSync('node', [path.join(ROOT, 'tests/reexam3.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b3.status === 0, 'خطِّ پایهٔ reexam3 سبز است');

console.log(`\nreexam2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
