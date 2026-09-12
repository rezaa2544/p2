#!/usr/bin/env node
/* E.4 فرناز — تست جهش: node tests/ics-mutations.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('ics-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const MUTS = [
  { id: 'M1', file: 'src/js/20-communication-finance.js', from: "if(end)L.push('DTEND:'+end);", to: "if(false)L.push('DTEND:'+end);",
    expectFail: 'T2c DTEND = +90min', why: 'پایان امتحان حذف شد' },
  { id: 'M2', file: 'src/js/20-communication-finance.js', from: 'return c?list.filter(function(e){return e.class_id===c.id;}):[];', to: 'return list;',
    expectFail: 'T1a fixtures in scope (+seed tolerated)', why: 'دامنهٔ کلاس دانش‌آموز برداشته شد' },
  { id: 'M3', file: 'src/js/20-communication-finance.js', from: 'if(len+bl>75', to: 'if(false&&len+bl>75',
    expectFail: 'T5a fold: no line >75 bytes', why: 'تاشدن خط حذف شد' },
  { id: 'M4', file: 'src/js/20-communication-finance.js', from: 'e.school_id===u.school_id&&e.date&&e.date>=todayISO()', to: 'e.school_id===u.school_id&&e.date',
    expectFail: 'T10 past excluded', why: 'فیلتر گذشته برداشته شد' },
  { id: 'M5', file: 'src/js/20-communication-finance.js', from: "'UID:payesh-exam-'+ex.id", to: "'UID:x-'+ex.id",
    expectFail: 'T2a exam UID', why: 'طرح UID عوض شد' },
];

function build() { execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'pipe', env: kit.env() }); } /* build در سایه */
function runSuite() {
  try { return execFileSync('node', ['tests/ics.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: kit.env() }); }
  catch (e) { return (e.stdout || '') + (e.stderr || ''); }
}
let killed = 0, prevFile = null;
for (const m of MUTS) {
  const p = path.join(ROOT, m.file);
  if (prevFile && prevFile !== p) kit.clear(prevFile); /* فقط جهشِ جاری فعال */
  prevFile = p;
  const orig = fs.readFileSync(p, 'utf8');
  if (!orig.includes(m.from)) { console.log('  FAIL ' + m.id + ' — anchor not found'); continue; }
  {
    kit.mutant(p, orig.replace(m.from, m.to)); /* کپی جدا؛ سورس اصلی دست‌نخورده */
    build();
    const out = runSuite();
    const dead = out.includes('FAIL ' + m.expectFail);
    if (dead) { killed++; console.log('  PASS ' + m.id + ' killed by «' + m.expectFail + '» (' + m.why + ')'); }
    else console.log('  FAIL ' + m.id + ' SURVIVED (' + m.why + ') — expected FAIL «' + m.expectFail + '»');
  } /* بدون بازگردانی — سورس هرگز جهش نگرفت */
}
console.log('ics-mutations: ' + killed + '/' + MUTS.length + ' killed');
process.exit(killed === MUTS.length ? 0 : 1);
