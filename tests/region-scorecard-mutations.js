#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   region-scorecard-mutations.js — بند د.۲: آزمون جهشِ کارت امتیازی
   ───────────────────────────────────────────────────────────────────
   M1  «داده ناکافی» صفر شود        ⇒ باید با ❌ R7 کشته شود
   M2  حذف فیلتر دامنهٔ اداره        ⇒ باید با ❌ R10a کشته شود
   M3  وارونگی مرتب‌سازی امتیازها    ⇒ باید با ❌ R9 کشته شود
   M4  حذف بازنرمال‌سازی وزن‌ها       ⇒ باید با ❌ R8 کشته شود
   اجرا:  node tests/region-scorecard-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SUITE = path.join(ROOT, 'tests', 'region-scorecard.js');
const F = path.join(ROOT, 'src', 'js', '74-region-tools.js');

let pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 260) : '')); }
}

console.log('▸ خطِّ پایه');
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const base = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8' });
chk('خطِّ پایهٔ region-scorecard سبز است', base.status === 0, (base.stdout || '').slice(-200));
if (base.status !== 0) { console.log((base.stdout || '') + (base.stderr || '')); process.exit(1); }

function mutate(find, replace, killRe, tag) {
  const orig = fs.readFileSync(F, 'utf8');
  try {
    if (!orig.includes(find)) { chk(tag + ' (جهش پیدا نشد)', false); return; }
    fs.writeFileSync(F, orig.replace(find, replace), 'utf8');
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
    const r = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    const out = (r.stdout || '') + (r.stderr || '');
    chk(tag + ' کشته شد', r.status !== 0 && killRe.test(out), out.slice(-260).replace(/\n/g, ' '));
  } finally {
    fs.writeFileSync(F, orig, 'utf8');
  }
}

console.log('\n▸ جهش‌ها');
mutate(
  `if(!wsum) return { s: s, dims: dims, score: null, band: 'nodata', reason: '', missing: RSCORE_DIMS.map(function(d){ return d[1]; }) };`,
  `if(!wsum) return { s: s, dims: dims, score: 0, band: 'red', reason: '', missing: [] };`,
  /❌ R7/, 'M1 ناکافی→صفر');

mutate(
  `const schools = officeScopeSchools(o, S.filters);
  const rows = regionScoreRows(schools);`,
  `const schools = db.schools.slice();
  const rows = regionScoreRows(schools);`,
  /❌ R10a/, 'M2 حذف فیلتر دامنه');

mutate(
  `return b.score - a.score;`,
  `return a.score - b.score;`,
  /❌ R9/, 'M3 وارونگی مرتب‌سازی');

mutate(
  `const score = Math.round(sum / wsum * 10) / 10;`,
  `const score = Math.round(sum * 10) / 10;`,
  /❌ R8/, 'M4 حذف بازنرمال‌سازی');

/* بازسازی نهایی + بازگشت به خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const fin = spawnSync('node', [SUITE], { cwd: ROOT, encoding: 'utf8' });
chk('پس از بازگردانی، خطِّ پایه دوباره سبز است', fin.status === 0);

const total = pass + fail;
console.log('────────────────────────────────────────────────────');
console.log(`جهش‌های د.۲: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);
