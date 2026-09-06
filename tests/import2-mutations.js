#!/usr/bin/env node
/**
 * جهش‌سنجیِ ورودِ اطلاعات از فایل (دور ۸۱ بند ۱)
 *  M1 — برداشتنِ جایگزینیِ شمارهٔ پدر ← I6
 *  M2 — برداشتنِ تشخیصِ کد ملیِ تکراری ← I8b
 *  M3 — برداشتنِ الزامِ نام ← I8
 *
 * اجرا:  node tests/import2-mutations.js
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

mutate('src/js/34-excel-import.js',
  "if(!data.phone && data.father_phone) data.phone = data.father_phone;",
  "if(false) data.phone = data.father_phone;",
  'tests/import2.js', /❌ I6 /, 'M1 برداشتنِ جایگزینیِ شمارهٔ پدر');

mutate('src/js/34-excel-import.js',
  "else if(seen[nid] && entity !== 'grades' && entity !== 'attendance') errors.push('کد ملی در همین فایل تکراری است');",
  "else if(false) errors.push('کد ملی در همین فایل تکراری است');",
  'tests/import2.js', /❌ I8b /, 'M2 برداشتنِ تشخیصِ کد ملیِ تکراری');

mutate('src/js/34-excel-import.js',
  "data.full_name.length < 3) errors.push('نام و نام خانوادگی الزامی است');",
  "data.full_name.length < 0) errors.push('نام و نام خانوادگی الزامی است');",
  'tests/import2.js', /❌ I8 — /, 'M3 برداشتنِ الزامِ نام');

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const b2 = spawnSync('node', [path.join(ROOT, 'tests/import2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ import2 سبز است');

console.log(`\nimport2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
