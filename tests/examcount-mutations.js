#!/usr/bin/env node
/* E.2 فرناز — تست جهش: node tests/examcount-mutations.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const MUTS = [
  { id: 'M1', file: 'src/js/08-dashboard.js', from: 'if(!best||x.date<best.date', to: 'if(!best||x.date>best.date',
    expectFail: 'T2 nearest wins', why: 'نزدیک‌ترین→دورترین' },
  { id: 'M2', file: 'src/js/08-dashboard.js', from: 'if(nx.days<=2)examReminderSend(sid,nx);', to: 'if(nx.days<=-1)examReminderSend(sid,nx);',
    expectFail: 'T6a sms queued once', why: 'پنجرهٔ یادآوری بسته شد' },
  { id: 'M3', file: 'src/js/08-dashboard.js', from: "if(!dup&&typeof notifyRequest==='function'){", to: "if(true&&typeof notifyRequest==='function'){",
    expectFail: 'T7a sms still once', why: 'ضدتکرار پیامک حذف شد' },
  { id: 'M4', file: 'src/js/08-dashboard.js', from: 'if(!Store.get(examRemindKey(ex.id))){', to: 'if(true){',
    expectFail: 'T7b in-app still once each', why: 'ضدتکرار اعلان حذف شد' },
  { id: 'M5', file: 'src/js/08-dashboard.js', from: 'if(x.class_id!==cls.id||!x.date||x.date<iso)return;', to: 'if(x.class_id!==cls.id||!x.date)return;',
    expectFail: 'T5 past exam ignored', why: 'فیلتر گذشته حذف شد' },
];

function build() { execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'pipe' }); }
function runSuite() {
  try { return execFileSync('node', ['tests/examcount.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
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
console.log('examcount-mutations: ' + killed + '/' + MUTS.length + ' killed');
process.exit(killed === MUTS.length ? 0 : 1);
