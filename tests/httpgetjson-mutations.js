#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   httpgetjson-mutations.js — جهش‌مندیِ قراردادِ httpGetJson (دور 85, P1-2)
   ─────────────────────────────────────────────────────────────
   M1: پرچمِ networkError حذف شود (H5 باید شکست بخورد)
   M2: guardِ JSONِ خراب حذف شود (H4 باید شکست بخورد)
   M3: علامتِ مهلت (timedOut) حذف شود (H6 باید شکست بخورد)
   ───────────────────────────────────────────────────────────── */
const { execSync } = require('child_process');
const fs = require('fs');

const MUTS = [
  {
    file: 'src/js/00-data-layer.js', suite: 'tests/httpgetjson.js',
    bad: 'networkError: !timedOut, timedOut: !!timedOut });',
    mut: 'timedOut: !!timedOut });',
    name: 'M1 پرچمِ networkError حذف شد',
    expectFail: 'H5'
  },
  {
    file: 'src/js/00-data-layer.js', suite: 'tests/httpgetjson.js',
    bad: "data:null, error:'bad_json' };",
    mut: "data:{}, error:null };",
    name: 'M2 guardِ JSONِ خراب حذف شد',
    expectFail: 'H4'
  },
  {
    file: 'src/js/00-data-layer.js', suite: 'tests/httpgetjson.js',
    bad: 'if(ctl) to = setTimeout(function(){ timedOut = true; try{ ctl.abort(); }catch(e){} }, timeoutMs || 6000);',
    mut: 'if(ctl) to = setTimeout(function(){ try{ ctl.abort(); }catch(e){} }, timeoutMs || 6000);',
    name: 'M3 علامتِ مهلت (timedOut) حذف شد',
    expectFail: 'H6'
  }
];

let killed = 0;
for (const m of MUTS) {
  const src0 = fs.readFileSync(m.file, 'utf8');
  const n = src0.indexOf(m.bad);
  if (n < 0) { console.log('  ❌ ' + m.name + ': الگوی اصلی پیدا نشد در ' + m.file); continue; }
  fs.writeFileSync(m.file, src0.replace(m.bad, m.mut, 1));
  execSync('node build.js', { stdio: 'pipe' });
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
execSync('node build.js', { stdio: 'pipe' });
console.log('\nبازبینیِ خطِ پایه (بدون جهش):');
const o = execSync('node --max-old-space-size=1500 tests/httpgetjson.js', { stdio: 'pipe' }).toString();
console.log('  httpgetjson: ' + (o.split('\n').find(l => l.includes('/10')) || o.slice(-120)).trim());
console.log(killed === MUTS.length ? 'همهٔ ' + MUTS.length + ' جهش کشته شدند ✅' : 'فقط ' + killed + '/' + MUTS.length + ' جهش کشته شد ❌');
process.exit(killed === MUTS.length ? 0 : 1);
