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

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, envFails = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

function mutate(file, from, to, suite, killRe, tag) {
  const f = path.join(ROOT, file);
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  fs.writeFileSync(f, bad, 'utf8');
  const runOnce = () => spawnSync('node', [path.join(ROOT, suite)], { cwd: ROOT, encoding: 'utf8' });
  /* R92: مرگِ زودهنگامِ کشف‌کننده (پورت اشغال/حافظه — قبل از چاپِ چکِ موردِ انتظار و خطِ خلاصه)
     → retry یک‌بار، بعد env-failِ صریح. هرگز «زنده ماند»ِ کاذب. */
  const completed = (out) => /بررسی — /.test(out || '');
  try {
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
    chk(r.status !== 0 && killRe.test(r.stdout), tag + ' کشته شد');
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
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

mutate('server/sync.js',
  "'assoc_minutes','summer_classes','dorm_rooms'",
  "'assoc_minutes','dorm_rooms'",
  'tests/summer3.js', /❌ B1/, 'M3 برداشتنِ summer_classes از WRITE_PERMS');

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const b2 = spawnSync('node', [path.join(ROOT, 'tests/summer2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ summer2 سبز است');
const b3 = spawnSync('node', [path.join(ROOT, 'tests/summer3.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b3.status === 0, 'خطِّ پایهٔ summer3 سبز است');

console.log(`\nsummer2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
