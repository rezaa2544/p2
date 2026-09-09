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
    const r = spawnSync(NODE, [path.join(ROOT, 'tests/assets2.js')], { cwd: ROOT, encoding: 'utf8' });
    const done = /سئوت اموال ۲:/.test(r.stdout || '');
    chk(done && r.status !== 0 && killRe.test(r.stdout || ''), tag + ' کشته شد');
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
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

mutate('server/sync.js',
  '      if(!me || me.asset_staff !== 1) return false;',
  '      if(false){}',
  /❌ S1/, 'M3 برداشتنِ گاردِ پرچم در inScope');

mutate('src/js/55-assets.js',
  '        + (isMgr ? \'<button class="btn ghost sm" data-act="as-del" data-id="\' + a.id + \'">حذف</button>\' : \'\')',
  '        + \'<button class="btn ghost sm" data-act="as-del" data-id="\' + a.id + \'">حذف</button>\'',
  /❌ B3/, 'M4 نمایشِ دکمهٔ حذف به تحویلدار');

/* بازسازی + خطِّ پایه */
execFileSync(NODE, ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const fin = spawnSync(NODE, [path.join(ROOT, 'tests/assets2.js')], { cwd: ROOT, encoding: 'utf8' });
const green = fin.status === 0 && /بدون خطا ✅/.test(fin.stdout || '');
console.log(`\nassets-mutations: ${pass}/4 کشته؛ سبزِ نهایی: ${green ? '✅' : '❌'}`);
process.exit(pass === 4 && green ? 0 : 1);
