#!/usr/bin/env node
/* G.2 فرناز — تست جهش: node tests/tickets-mutations.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const MUTS = [
  { id: 'M1', file: 'src/js/09-schools.js', from: '.filter(t=>isSuper||t.school_id===u.school_id)', to: '.filter(t=>true)',
    expectFail: 'T1b manager not other school', why: 'دامنهٔ مدرسه برداشته شد' },
  { id: 'M2', file: 'src/js/19-actions-admin.js', from: "if(!title){toast('عنوان درخواست الزامی است','err');return;}", to: "if(false){toast('عنوان درخواست الزامی است','err');return;}",
    expectFail: 'T7 empty title rejected', why: 'الزام عنوان حذف شد' },
  { id: 'M3', file: 'src/js/19-actions-admin.js', from: 'if(!t||!TICKET_ST[s]){toast', to: 'if(!t){toast',
    expectFail: 'T10 bad status rejected', why: 'اعتبارسنجی وضعیت حذف شد' },
  { id: 'M4', file: 'src/js/19-actions-admin.js', from: '{status:s,updated_at:todayISO()}', to: '{status:s}',
    expectFail: 'T9b updated bumped', why: 'به‌روزرسانی تاریخ حذف شد' },
  { id: 'M5', file: 'src/js/09-schools.js', from: "if(!u||(u.role!=='manager'&&u.role!=='superadmin'))return", to: 'if(false)return',
    expectFail: 'T4 teacher blocked', why: 'گیت نقش نما برداشته شد' },
];

function build() { execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'pipe' }); }
function runSuite() {
  try { return execFileSync('node', ['tests/tickets.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
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
console.log('tickets-mutations: ' + killed + '/' + MUTS.length + ' killed');
process.exit(killed === MUTS.length ? 0 : 1);
