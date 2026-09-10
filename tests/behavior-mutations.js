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

const ROOT = path.join(__dirname, '..');
const NODE = process.execPath;
let pass = 0, fail = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

function mutate(file, from, to, killRe, tag) {
  const f = path.join(ROOT, file);
  const orig = fs.readFileSync(f, 'utf8');
  if (orig.indexOf(from) < 0) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  fs.writeFileSync(f, orig.replace(from, to), 'utf8');
  try {
    execFileSync(NODE, ['build.js'], { cwd: ROOT, stdio: 'ignore' });
    const r = spawnSync(NODE, [path.join(ROOT, 'tests/behavior2.js')], { cwd: ROOT, encoding: 'utf8' });
    const done = /سوئیت رفتار ۲:/.test(r.stdout || '');
    chk(done && r.status !== 0 && killRe.test(r.stdout || ''), tag + ' کشته شد');
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
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

/* بازسازی + خطِّ پایه */
execFileSync(NODE, ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const fin = spawnSync(NODE, [path.join(ROOT, 'tests/behavior2.js')], { cwd: ROOT, encoding: 'utf8' });
const green = fin.status === 0 && /بدون خطا ✅/.test(fin.stdout || '');
console.log(`\nbehavior-mutations: ${pass}/4 کشته؛ سبزِ نهایی: ${green ? '✅' : '❌'}`);
process.exit(pass === 4 && green ? 0 : 1);
