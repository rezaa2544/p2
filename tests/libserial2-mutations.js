#!/usr/bin/env node
/**
 * تست‌های جهشیِ شمارهٔ سریال کتاب (بند ۶.۳)
 *  M1 — برداشتنِ گاردِ یکتاییِ libAddBook → L2
 *  M2 — نذخیره‌شدنِ سریال در رکورد (libAddBook) → L1
 *  M3 — برداشتنِ گاردِ یکتاییِ libSetSerial → L4
 *
 * اجرا:  node tests/libserial2-mutations.js
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

mutate('src/js/54-library.js',
  "if(serial && db.lib_books.some(function(x){ return x.school_id===u.school_id && x.serial===serial; }))\n    return {ok:false, msg:'این شمارهٔ سریال برای کتاب دیگری در همین مدرسه ثبت شده است'};",
  "if(false){}",
  'tests/libserial2.js', /❌ L2/, 'M1 برداشتنِ گاردِ یکتاییِ libAddBook');

mutate('src/js/54-library.js',
  '    serial: serial,\n    created_at: new Date().toISOString()\n  };\n  return {ok:true, rec: add(\'lib_books\', rec)};',
  '    created_at: new Date().toISOString()\n  };\n  return {ok:true, rec: add(\'lib_books\', rec)};',
  'tests/libserial2.js', /❌ L1/, 'M2 نذخیره‌شدنِ سریال');

mutate('src/js/54-library.js',
  "if(serial && db.lib_books.some(function(x){ return x.school_id===b.school_id && x.serial===serial && x.id!==bookId; }))\n    return {ok:false, msg:'این شمارهٔ سریال برای کتاب دیگری در همین مدرسه ثبت شده است'};",
  "if(false){}",
  'tests/libserial2.js', /❌ L4/, 'M3 برداشتنِ گاردِ یکتاییِ libSetSerial');

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const b2 = spawnSync('node', [path.join(ROOT, 'tests/libserial2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ libserial2 سبز است');

console.log(`\nlibserial2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
