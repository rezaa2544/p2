#!/usr/bin/env node
/**
 * تست‌های جهشیِ رفتار ۲ (E.3)
 *  M1 — تحویلِ همیشه-مجازِ کلاس (dojoCanQuickAward) → B2
 *  M2 — برداشتنِ دروازهٔ ابتدایی/مدل → B2
 *  M3 — نمایشِ دکمهٔ حذف به دبیر → B3
 *  M4 — امتیازِ ۹۹ به‌جای دلتای مدل → B1
 *
 * اجرا:  node tests/behavior-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('bhv-mut-');
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
  if (orig.indexOf(from) < 0) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  kit.mutant(f, orig.replace(from, to)); /* کپی جدا */
  {
    execFileSync(NODE, ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() });
    const r = spawnSync(NODE, [path.join(ROOT, 'tests/behavior2.js')], { cwd: ROOT, encoding: 'utf8', env: kit.env() });
    const done = /سوئیت رفتار ۲:/.test(r.stdout || '');
    chk(done && r.status !== 0 && killRe.test(r.stdout || ''), tag + ' کشته شد');
  }
}

mutate('src/js/52-dojo.js',
  '  return (typeof visibleClasses === \'function\')\n    ? visibleClasses().some(function(x){ return x.id === c.id; })\n    : false;',
  '  return true;',
  /❌ B2/, 'M1 تحویلِ همیشه-مجازِ کلاس');

mutate('src/js/52-dojo.js',
  '  if(!dojoAvailableForStudent(sid)) return false;',
  '  if(false){}',
  /❌ B2/, 'M2 برداشتنِ دروازهٔ ابتدایی/مدل');

mutate('src/js/14-discipline.js',
  '${_isMgr?` <button class="icon-btn danger" data-act="disc-del" data-id="${escAttr(d.id)}">🗑️</button>`:\'\'}',
  ' <button class="icon-btn danger" data-act="disc-del" data-id="${escAttr(d.id)}">🗑️</button>',
  /❌ B3/, 'M3 نمایشِ دکمهٔ حذف به دبیر');

mutate('src/js/52-dojo.js',
  '    kind: \'positive\', title: title, description: \'امتیازِ سریع از صفحهٔ حضور\',\n    points: pts, date: todayISO()',
  '    kind: \'positive\', title: title, description: \'امتیازِ سریع از صفحهٔ حضور\',\n    points: 99, date: todayISO()',
  /❌ B1/, 'M4 امتیازِ ۹۹ به‌جای دلتا');

/* خطِّ پایه (بدون env — سورس‌های اصلی) */
const fin = spawnSync(NODE, [path.join(ROOT, 'tests/behavior2.js')], { cwd: ROOT, encoding: 'utf8' });
const green = fin.status === 0 && /بدون خطا ✅/.test(fin.stdout || '');
console.log(`\nbehavior-mutations: ${pass}/4 کشته؛ سبزِ نهایی: ${green ? '✅' : '❌'}`);
process.exit(pass === 4 && green ? 0 : 1);
