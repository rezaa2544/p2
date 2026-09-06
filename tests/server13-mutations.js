#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   server13-mutations.js — جهش‌مندیِ fail-fastِ TLS (دور 85, P1-4)
   ─────────────────────────────────────────────────────────────
   M1: گاردِ production خاموش شود → سرور با self-signed بالا می‌آید
       (T1 باید شکست بخورد)
   ───────────────────────────────────────────────────────────── */
const { execSync } = require('child_process');
const fs = require('fs');

const MUTS = [
  {
    file: 'server/index.js', suite: 'tests/server13.js',
    bad: "  if(process.env.PAYESH_ENV === 'production'){",
    mut: '  if(false){',
    name: 'M1 fail-fastِ production خاموش شد',
    expectFail: 'T1'
  }
];

let killed = 0;
for (const m of MUTS) {
  const src0 = fs.readFileSync(m.file, 'utf8');
  const n = src0.indexOf(m.bad);
  if (n < 0) { console.log('  ❌ ' + m.name + ': الگوی اصلی پیدا نشد در ' + m.file); continue; }
  fs.writeFileSync(m.file, src0.replace(m.bad, m.mut, 1));
  let out = '', crashed = false;
  try { execSync('node --max-old-space-size=1500 ' + m.suite, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out)) crashed = true;
  }
  const failed = /❌/.test(out);
  const firstFail = (out.split('\n').find(l => l.includes('❌')) || '').trim();
  const killedThis = crashed ? (m.crashOK === true) : (failed && firstFail.includes(m.expectFail));
  fs.writeFileSync(m.file, src0);
  console.log('  ' + (killedThis ? '✅' : '❌') + ' ' + m.name + ' — ' + (killedThis ? 'کشته شد' : 'زنده ماند! (خروجی: ' + firstFail + ')'));
  if (killedThis) killed++;
}
console.log('\nبازبینیِ خطِ پایه (بدون جهش):');
const o = execSync('node --max-old-space-size=1500 tests/server13.js', { stdio: 'pipe' }).toString();
console.log('  server13: ' + (o.split('\n').find(l => l.includes('/9')) || o.slice(-120)).trim());
console.log(killed === MUTS.length ? 'همهٔ ' + MUTS.length + ' جهش کشته شد ✅' : 'فقط ' + killed + '/' + MUTS.length + ' جهش کشته شد ❌');
process.exit(killed === MUTS.length ? 0 : 1);
