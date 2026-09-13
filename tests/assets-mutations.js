#!/usr/bin/env node
/**
 * تست‌های جهشیِ اموال ۲ (E.5)
 *  M1 — تحویلدارِ همیشه-مجاز (assetStaffCan) → B2
 *  M2 — برداشتنِ اعتبارسنجیِ شمار در assetSetStatus → B2
 *  M3 — برداشتنِ گاردِ پرچم در inScope → S1
 *  M4 — نمایشِ دکمهٔ حذف به تحویلدار → B3
 *
 * اجرا:  node tests/assets-mutations.js   (با همان نودی که سئوت را سبز می‌کند)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('ast-mut-');
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
    const r = spawnSync(NODE, [path.join(ROOT, 'tests/assets2.js')], { cwd: ROOT, encoding: 'utf8', env: kit.env() });
    const done = /سئوت اموال ۲:/.test(r.stdout || '');
    chk(done && r.status !== 0 && killRe.test(r.stdout || ''), tag + ' کشته شد');
  }
}

mutate('src/js/55-assets.js',
  '  return role === \'teacher\' && u.asset_staff === 1 && !!u.school_id;',
  '  return true;',
  /❌ B2/, 'M1 تحویلدارِ همیشه-مجاز');

mutate('src/js/55-assets.js',
  '    if(!(total >= 1)) return {ok:false, msg:\'تعدادِ کل باید دست‌کم ۱ باشد\'};\n    if(!(usable >= 0) || usable > total) return {ok:false, msg:\'شمارِ قابل‌استفاده باید بین ۰ و تعدادِ کل باشد\'};',
  '    if(!(total >= 1)) return {ok:false, msg:\'تعدادِ کل باید دست‌کم ۱ باشد\'};\n    if(false){}',
  /❌ B2/, 'M2 برداشتنِ اعتبارسنجیِ شمار');

mutate('server/policy.js',
  '      if (!me || me.asset_staff !== 1) return false;',
  '      if(false){}',
  /❌ S1/, 'M3 برداشتنِ گاردِ پرچم در inScope');

mutate('src/js/55-assets.js',
  '        + (isMgr ? \'<button class="btn ghost sm" data-act="as-del" data-id="\' + a.id + \'">حذف</button>\' : \'\')',
  '        + \'<button class="btn ghost sm" data-act="as-del" data-id="\' + a.id + \'">حذف</button>\'',
  /❌ B3/, 'M4 نمایشِ دکمهٔ حذف به تحویلدار');

/* خطِّ پایه (بدون env — سورس‌های اصلی) */
const fin = spawnSync(NODE, [path.join(ROOT, 'tests/assets2.js')], { cwd: ROOT, encoding: 'utf8' });
const green = fin.status === 0 && /بدون خطا ✅/.test(fin.stdout || '');
console.log(`\nassets-mutations: ${pass}/4 کشته؛ سبزِ نهایی: ${green ? '✅' : '❌'}`);
process.exit(pass === 4 && green ? 0 : 1);
