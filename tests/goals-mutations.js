#!/usr/bin/env node
/* E.3 فرناز — تست جهش: node tests/goals-mutations.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const MUTS = [
  { id: 'M1', file: 'src/js/17-student-record.js', from: 'v=Number(v); return isNaN(v)?null:v;', to: 'return null;',
    expectFail: 'T3a goal legend', why: 'خواندن هدف حذف شد' },
  { id: 'M2', file: 'src/js/19-actions-core.js', from: 'Store.set(goalKey(sid,sub),String(v));', to: 'void(0);',
    expectFail: 'T2 goal saved via action', why: 'ذخیرهٔ هدف حذف شد' },
  { id: 'M3', file: 'src/js/19-actions-core.js', from: "||!goalViewerOk(sid)){toast('فقط خود دانش‌آموز", to: "||false){toast('فقط خود دانش‌آموز",
    expectFail: 'T7 ownership guard', why: 'گارد مالکیت اکشن حذف شد' },
  { id: 'M4', file: 'src/js/17-student-record.js', from: '? goalGet(sid, goalSub) : null;', to: '? goalGet(sid, goalSub) : goalGet(sid, goalSub);',
    expectFail: 'T5b manager: no ticks/legend', why: 'گیت نمایش برای دیگران برداشته شد' },
  { id: 'M5', file: 'src/js/19-actions-core.js', from: 'if(v<0||v>20){toast', to: 'if(false){toast',
    expectFail: 'T8 invalid rejected', why: 'اعتبارسنجی بازه حذف شد' },
];

function build() { execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'pipe' }); }
function runSuite() {
  try { return execFileSync('node', ['tests/goals.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { return (e.stdout || '') + (e.stderr || ''); }
}
let killed = 0;
for (const m of MUTS) {
  const p = path.join(ROOT, m.file);
  const orig = fs.readFileSync(p, 'utf8');
  if (!orig.includes(m.from)) { console.log('  FAIL ' + m.id + ' — anchor not found'); continue; }
  try {
    fs.writeFileSync(p, orig.replace(m.from, m.to));
    build();
    const out = runSuite();
    const dead = out.includes('FAIL ' + m.expectFail);
    if (dead) { killed++; console.log('  PASS ' + m.id + ' killed by «' + m.expectFail + '» (' + m.why + ')'); }
    else console.log('  FAIL ' + m.id + ' SURVIVED (' + m.why + ') — expected FAIL «' + m.expectFail + '»');
  } finally {
    fs.writeFileSync(p, orig);
  }
}
build();
console.log('goals-mutations: ' + killed + '/' + MUTS.length + ' killed');
process.exit(killed === MUTS.length ? 0 : 1);
