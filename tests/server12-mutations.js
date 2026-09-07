#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   server12-mutations.js — جهش‌مندیِ سفیدفهرستِ leaves (دور 85, P0-1)
   ─────────────────────────────────────────────────────────────
   M1: insِ والد با هر statusِ مجازی → S2 باید شکست بخورد
   M2: updِ statusِ والد آزاد شود → S4 باید شکست بخورد
   هر جهش: جایگزینی در server/sync.js، اجرای tests/server12.js،
   بررسیِ شکست، بازگشتِ فایل، و بازبینیِ خطِ پایه در پایان.
   ───────────────────────────────────────────────────────────── */
const { execSync } = require('child_process');
const fs = require('fs');

const MUTS = [
  {
    file: 'server/sync.js', suite: 'tests/server12.js',
    bad: 'const allowed = isMgr ? fa.ins.managerRoles : fa.ins.defaultRoles;',
    mut: 'const allowed = isMgr ? fa.ins.managerRoles : [\'pending\', \'approved\', \'rejected\'];',
    name: 'M1 insِ والد با statusِ جعلی آزاد شد',
    expectFail: 'S2'
  },
  {
    file: 'server/sync.js', suite: 'tests/server12.js',
    bad: 'if(!isMgr || fa.upd.statusValues.indexOf(d.status) === -1)',
    mut: 'if(false || fa.upd.statusValues.indexOf(d.status) === -1)',
    name: 'M2 updِ statusِ والد آزاد شد',
    expectFail: 'S4'
  }
];

let killed = 0;
for (const m of MUTS) {
  const src0 = fs.readFileSync(m.file, 'utf8');
  const n = src0.indexOf(m.bad);
  if (n < 0) { console.log('  ❌ ' + m.name + ': الگوی اصلی پیدا نشد در ' + m.file); continue; }
  fs.writeFileSync(m.file, src0.replace(m.bad, m.mut, 1));
  let out = '', crashed = false;
  const __r89cmd = 'node --max-old-space-size=1500 ' + m.suite;
  try { execSync(__r89cmd, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (out.trim() === '') { /* R89: empty output = process killed (env/memory) — retry once */
      try { execSync(__r89cmd, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
      catch (e2) { out = String(e2.stdout || '') + String(e2.stderr || ''); }
    }
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
    if (out.trim() === '') out = '\u274c \u062e\u0637\u0627: \u0641\u0631\u0622\u06cc\u0646\u062f \u0628\u062f\u0648\u0646 \u062e\u0631\u0648\u062c\u06cc \u06a9\u0634\u062a\u0647 \u0634\u062f (\u0645\u062d\u06cc\u0637) \u2014 \u00ab\u0632\u0646\u062f\u0647 \u0645\u0627\u0646\u062f\u0646\u00bb \u062c\u0647\u0634 \u0646\u06cc\u0633\u062a';
  }
  const failed = /❌/.test(out);
  const firstFail = (out.split('\n').find(l => l.includes('❌')) || '').trim();
  const killedThis = crashed ? (m.crashOK === true) : (failed && firstFail.includes(m.expectFail));
  fs.writeFileSync(m.file, src0);
  console.log('  ' + (killedThis ? '✅' : '❌') + ' ' + m.name + ' — ' + (killedThis ? 'کشته شد' : 'زنده ماند! (خروجی: ' + firstFail + ')'));
  if (killedThis) killed++;
}
console.log('\nبازبینیِ خطِ پایه (بدون جهش):');
const o = execSync('node --max-old-space-size=1500 tests/server12.js', { stdio: 'pipe' }).toString();
console.log('  server12: ' + (o.split('\n').find(l => l.includes('/18')) || o.slice(-120)).trim());
console.log(killed === MUTS.length ? 'همهٔ ' + MUTS.length + ' جهش کشته شدند ✅' : 'فقط ' + killed + '/' + MUTS.length + ' جهش کشته شد ❌');
process.exit(killed === MUTS.length ? 0 : 1);
