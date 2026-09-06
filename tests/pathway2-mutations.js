#!/usr/bin/env node
/**
 * تست‌های جهشیِ مسیرهای ادامهٔ تحصیل (بند ۵.۱)
 *  M1 — برداشتنِ گاردِ پایهٔ نهم → P1
 *  M2 — حذفِ بازنمایهٔ «نه جایگزینِ مشاوره» → P3
 *  M3 — خالی‌کردنِ دروس تخصصی → P2/P5
 *
 * اجرا:  node tests/pathway2-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

function mutate(file, from, to, suite, killRe, tag) {
  const f = path.join(ROOT, file);
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  fs.writeFileSync(f, bad, 'utf8');
  try {
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
    const r = spawnSync('node', [path.join(ROOT, suite)], { cwd: ROOT, encoding: 'utf8' });
    chk(r.status !== 0 && killRe.test(r.stdout), tag + ' کشته شد');
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
  }
}

mutate('src/js/26-curriculum.js',
  'if(g !== 9) return \'\';',
  'if(g !== 10) return \'\';',
  'tests/pathway2.js', /❌ P1/, 'M1 برداشتنِ گاردِ پایهٔ نهم');

mutate('src/js/26-curriculum.js',
  'این صفحه جایگزینِ مشاورهٔ تخصصی نیست.',
  '',
  'tests/pathway2.js', /❌ P3/, 'M2 حذفِ بازنمایهٔ «نه جایگزینِ مشاوره»');

mutate('src/js/26-curriculum.js',
  "return arr.map(function(b){ return b[0]; });",
  "return [];",
  'tests/pathway2.js', /❌ (P2|P5)/, 'M3 خالی‌کردنِ دروس تخصصی');

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const b2 = spawnSync('node', [path.join(ROOT, 'tests/pathway2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ pathway2 سبز است');

console.log(`\npathway2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
