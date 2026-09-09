#!/usr/bin/env node
/**
 * تست‌های جهشیِ کتابخانه ۲ (E.4)
 *  M1 — کتابدارِ همیشه-مجاز (libStaffCan) → B3
 *  M2 — برداشتنِ سقفِ نسخه در libLend → B2
 *  M3 — برداشتنِ گاردِ پرچم در inScope → S1
 *  M4 — برداشتنِ نمای دانش‌آموز → B4
 *
 * اجرا:  node tests/library-mutations.js   (با همان نودی که سئوت را سبز می‌کند)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const NODE = process.execPath;
let pass = 0, fail = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

function mutate(file, from, to, killRe, tag) {
  const f = path.join(ROOT, file);
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  fs.writeFileSync(f, bad, 'utf8');
  try {
    execFileSync(NODE, ['build.js'], { cwd: ROOT, stdio: 'ignore' });
    const r = spawnSync(NODE, [path.join(ROOT, 'tests/library2.js')], { cwd: ROOT, encoding: 'utf8' });
    const done = /سئوت کتابخانه ۲:/.test(r.stdout || '');
    chk(done && r.status !== 0 && killRe.test(r.stdout || ''), tag + ' کشته شد');
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
  }
}

mutate('src/js/54-library.js',
  '  return role === \'teacher\' && u.lib_staff === 1 && !!u.school_id;',
  '  return true;',
  /❌ B3/, 'M1 کتابدارِ همیشه-مجاز');

mutate('src/js/54-library.js',
  '  if(libAvail(bookId) < 1) return {ok:false, msg:\'موجودیِ این کتاب تمام شده است\'};',
  '  if(false){}',
  /❌ B2/, 'M2 برداشتنِ سقفِ نسخه');

mutate('server/sync.js',
  '      if(!me || me.lib_staff !== 1) return false;',
  '      if(false){}',
  /❌ S1/, 'M3 برداشتنِ گاردِ پرچم در inScope');

mutate('src/js/54-library.js',
  "  if(role === 'student') return viewLibraryStudent();",
  '  if(false){}',
  /❌ B4/, 'M4 برداشتنِ نمای دانش‌آموز');

/* بازسازی + خطِّ پایه */
execFileSync(NODE, ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const fin = spawnSync(NODE, [path.join(ROOT, 'tests/library2.js')], { cwd: ROOT, encoding: 'utf8' });
const green = fin.status === 0 && /بدون خطا ✅/.test(fin.stdout || '');
console.log(`\nlibrary-mutations: ${pass}/4 کشته؛ سبزِ نهایی: ${green ? '✅' : '❌'}`);
process.exit(pass === 4 && green ? 0 : 1);
