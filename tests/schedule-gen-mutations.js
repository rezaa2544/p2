#!/usr/bin/env node
/**
 * تست‌های جهشیِ زمان‌بند (E.6)
 *  M1 — برداشتنِ کنترلِ مشغولیِ دبیر → G2
 *  M2 — برداشتنِ کنترلِ اشغالیِ کلاس → G1
 *  M3 — نادیده‌گرفتنِ تخصص (همیشه اولین دبیر) → G1
 *  M4 — برداشتنِ کم‌شدنِ پوششِ فعلی → G3
 *  M5 — ازکارانداختنِ پس‌گرد → G4
 *
 * اجرا:  node tests/schedule-gen-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const NODE = process.execPath;
let pass = 0, fail = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

function mutate(from, to, killRe, tag) {
  const f = path.join(ROOT, 'src/js/74-schedgen.js');
  const orig = fs.readFileSync(f, 'utf8');
  if (orig.indexOf(from) < 0) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  fs.writeFileSync(f, orig.replace(from, to), 'utf8');
  try {
    execFileSync(NODE, ['build.js'], { cwd: ROOT, stdio: 'ignore' });
    const r = spawnSync(NODE, [path.join(ROOT, 'tests/schedule-gen.js')], { cwd: ROOT, encoding: 'utf8' });
    const done = /سوئیت زمان‌بند:/.test(r.stdout || '');
    chk(done && r.status !== 0 && killRe.test(r.stdout || ''), tag + ' کشته شد');
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
  }
}

mutate("if(teacherId != null && teacherBusy[teacherId + '|' + d + '|' + p]) return false;",
  'if(false){}',
  /❌ G2/, 'M1 برداشتنِ کنترلِ مشغولیِ دبیر');

mutate("if(classBusy[classId + '|' + d + '|' + p]) return false;",
  'if(false){}',
  /❌ G1/, 'M2 برداشتنِ کنترلِ اشغالیِ کلاس');

mutate('return cands.length ? cands[0] : null;',
  'return teachers.length ? teachers[0].id : null;',
  /❌ G1/, 'M3 نادیده‌گرفتنِ تخصص');

mutate("h = Math.max(0, h - (covered[cls.id + '|' + sub.id] || 0));",
  'h = Math.max(0, h);',
  /❌ G3/, 'M4 برداشتنِ کم‌شدنِ پوشش');

mutate('function displace(classId, teacherId, subId){\n    for(',
  'function displace(classId, teacherId, subId){\n    return null;\n    for(',
  /❌ G4/, 'M5 ازکارانداختنِ پس‌گرد');

/* بازسازی + خطِّ پایه */
execFileSync(NODE, ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const fin = spawnSync(NODE, [path.join(ROOT, 'tests/schedule-gen.js')], { cwd: ROOT, encoding: 'utf8' });
const green = fin.status === 0 && /بدون خطا ✅/.test(fin.stdout || '');
console.log(`\nschedule-gen-mutations: ${pass}/5 کشته؛ سبزِ نهایی: ${green ? '✅' : '❌'}`);
process.exit(pass === 5 && green ? 0 : 1);
