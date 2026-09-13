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
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('lib-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const ROOT = path.join(__dirname, '..');
const NODE = process.execPath;
let pass = 0, fail = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

let lastFile = null;
function mutate(file, from, to, killRe, tag) {
  const f = path.join(ROOT, file);
  if (lastFile && lastFile !== f) kit.clear(lastFile); /* فقط جهشِ جاری فعال */
  lastFile = f;
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  kit.mutant(f, bad); /* کپی جدا؛ سورس اصلی دست‌نخورده */
  {
    execFileSync(NODE, ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() });
    const r = spawnSync(NODE, [path.join(ROOT, 'tests/library2.js')], { cwd: ROOT, encoding: 'utf8', env: kit.env() });
    const done = /سئوت کتابخانه ۲:/.test(r.stdout || '');
    chk(done && r.status !== 0 && killRe.test(r.stdout || ''), tag + ' کشته شد');
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

mutate('server/policy.js',
  '      if (!me || me.lib_staff !== 1) return false;',
  '      if(false){}',
  /❌ S1/, 'M3 برداشتنِ گاردِ پرچم در inScope');

mutate('src/js/54-library.js',
  "  if(role === 'student') return viewLibraryStudent();",
  '  if(false){}',
  /❌ B4/, 'M4 برداشتنِ نمای دانش‌آموز');

/* خطِّ پایه (بدون env — سورس‌های اصلی) */
const fin = spawnSync(NODE, [path.join(ROOT, 'tests/library2.js')], { cwd: ROOT, encoding: 'utf8' });
const green = fin.status === 0 && /بدون خطا ✅/.test(fin.stdout || '');
console.log(`\nlibrary-mutations: ${pass}/4 کشته؛ سبزِ نهایی: ${green ? '✅' : '❌'}`);
process.exit(pass === 4 && green ? 0 : 1);
