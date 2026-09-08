#!/usr/bin/env node
/* E.5 فرناز — تست جهش: node tests/excuse-mutations.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const MUTS = [
  { id: 'M1', file: 'src/js/20-communication-finance.js', from: "ref:'att_'+rec.id", to: 'ref:null',
    expectFail: 'T10 notif created once with ref', why: 'ارجاع اعلان به رکورد حذف شد' },
  { id: 'M2', file: 'src/js/20-communication-finance.js', from: 'if(absencePendingFor(rec))', to: 'if(false)',
    expectFail: 'T4 pending: badge, no button', why: 'بج انتظار حذف شد' },
  { id: 'M3', file: 'src/js/66-client-features.js', from: "if(dup){ S.__cfRid=0; closeModal(); toast('برای این غیبت قبلاً درخواست ثبت شده", to: "if(false){ S.__cfRid=0; closeModal(); toast('برای این غیبت قبلاً درخواست ثبت شده",
    expectFail: 'T8 no duplicate request', why: 'ضدتکرار ذخیره حذف شد' },
  { id: 'M4', file: 'src/js/20-communication-finance.js', from: "if(!u||u.role!=='parent')return '';", to: "if(false)return '';",
    expectFail: 'T12 gate tested directly', why: 'گیت ولی برداشته شد' },
  { id: 'M5', file: 'src/js/66-client-features.js', from: "status:'pending',created_at:todayISO()});", to: "status:'pending',created_at:todayISO()});update('attendance',rec.id,{status:'excused'});",
    expectFail: 'T7c status NOT changed by parent', why: 'ولی مستقیم وضعیت را عوض کرد (نقض اصل)' },
];

function build() { execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'pipe' }); }
function runSuite() {
  try { return execFileSync('node', ['tests/excuse.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
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
console.log('excuse-mutations: ' + killed + '/' + MUTS.length + ' killed');
process.exit(killed === MUTS.length ? 0 : 1);
