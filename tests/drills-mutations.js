#!/usr/bin/env node
/**
 * تست‌های جهشی بند B.4 فرناز — مانور ایمنی
 *  MM1 — وارونگی وضعیت سالانه (سبز/قرمز) → D1/D6
 *  MM2 — برداشتنِ گیت مدرسه در ویرایش (IDOR) → D5
 *  MM3 — برداشتنِ قاعدهٔ سرور شمارش → D9
 *
 * اجرا:  node tests/drills-mutations.js
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
    const completed = (o) => /تست مانور ایمنی: /.test(o || '');
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
    let r = runOnce();
    if (r.status !== 0 && !killRe.test(r.stdout) && !completed(r.stdout)) {
      const r2 = runOnce();
      if (r2.status === 0 || killRe.test(r2.stdout) || completed(r2.stdout)) r = r2;
    }
    if (r.status !== 0 && !killRe.test(r.stdout) && !completed(r.stdout)) {
      envFails++;
      chk(false, tag + ' — خطای محیطی: چکِ موردِ انتظار هرگز چاپ نشد — نه کشته و نه زنده شمرده شد');
      return;
    }
    chk(r.status !== 0 && killRe.test(r.stdout), tag);
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
  }
}

mutate('src/js/71-safety-drills.js',
  'return { done: inWin.length > 0, last: inWin.length ? inWin[0].date : null, count: inWin.length };',
  'return { done: !(inWin.length > 0), last: inWin.length ? inWin[0].date : null, count: inWin.length }; /* MM1 */',
  'tests/drills2.js', /❌ D1/, 'MM1 وارونگی وضعیت سالانه');

mutate('src/js/71-safety-drills.js',
  'if(!ex || ex.school_id !== sid) return { ok: false, msg: \'رکورد معتبر نیست\' };',
  'if(!ex) return { ok: false, msg: \'رکورد معتبر نیست\' }; /* MM2 */',
  'tests/drills2.js', /❌ D5/, 'MM2 برداشتنِ گیت مدرسه در ویرایش');

mutate('server/validate.js',
  "if(key === 'participant_count_students' || key === 'participant_count_staff') return { type: 'integer', min: 0, max: 100000 }; /* B.4 فرناز: شمار شرکت‌کننده مانور */",
  "if(false) return { type: 'integer', min: 0, max: 1 }; /* MM3 */",
  'tests/drills2.js', /❌ D9/, 'MM3 برداشتنِ قاعدهٔ سرور');

execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
console.log(`جهش‌های مانور ایمنی: ${pass}/${pass + fail} کشته` + (envFails ? ` (${envFails} خطای محیطی)` : ''));
process.exit(fail || envFails ? 1 : 0);
