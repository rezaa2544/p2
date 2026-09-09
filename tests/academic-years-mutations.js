#!/usr/bin/env node
/**
 * تست‌های جهشی فاز ۰.۲ — هم‌زمانی دو سال تحصیلی
 *  YM1 — نادیده گرفتن override سال عملیاتی → AY1
 *  YM2 — خراب شدن مُهر سال پیش‌ثبت‌نام → AY2
 *  YM3 — ذخیرهٔ همیشه-null سال عملیاتی → AY3
 *  YM4 — برداشتن pattern فرمت سال در سرور → AY6
 *  YM5 — از کار افتادن فیلتر سال کارت سابقه → AY5
 *
 * اجرا:  node tests/academic-years-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, envFails = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

function mutate(file, from, to, suite, killRe, tag) {
  const f = path.join(ROOT, file);
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  fs.writeFileSync(f, bad, 'utf8');
  try {
    const runOnce = () => spawnSync('node', [path.join(ROOT, suite)], { cwd: ROOT, encoding: 'utf8' });
    const completed = (o) => /سال تحصیلی \(academic-years\): /.test(o || '');
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
    let r = runOnce();
    if (r.status !== 0 && !killRe.test(r.stdout) && !completed(r.stdout)) {
      const r2 = runOnce();
      if (r2.status === 0 || killRe.test(r2.stdout) || completed(r2.stdout)) r = r2;
    }
    if (r.status !== 0 && !killRe.test(r.stdout) && !completed(r.stdout)) {
      envFails++;
      chk(false, tag + ' — خطای محیطی: چکِ موردِ انتظار هرگز چاپ نشد — نه کشته و نه زنده شمرده شد');
      return;
    }
    chk(r.status !== 0 && killRe.test(r.stdout), tag);
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
  }
}

mutate('src/js/39-school-year.js',
  'if(typeof t === \'string\' && YEAR_CODE_RE.test(t)) return t;',
  'if(false) return t; /* YM1 */',
  'tests/academic-years.js', /❌ AY1/, 'YM1 نادیده گرفتن override سال عملیاتی');

mutate('src/js/39-school-year.js',
  'year_code: nextYearCode(activeYearOf(sid)), student_id: null,',
  'year_code: \'0000-0000\', student_id: null, /* YM2 */',
  'tests/academic-years.js', /❌ AY2/, 'YM2 خراب شدن مُهر سال پیش‌ثبت‌نام');

mutate('src/js/19-actions-admin.js',
  'active_year_code:((typeof YEAR_CODE_RE!==\'undefined\'&&YEAR_CODE_RE.test(V(\'m_active_year\')))?V(\'m_active_year\'):null),',
  'active_year_code:null, /* YM3 */',
  'tests/academic-years.js', /❌ AY3/, 'YM3 ذخیرهٔ همیشه-null سال عملیاتی');

mutate('server/validate.js',
  'return { type: \'string\', pattern: YEAR_CODE_PATTERN, min: 9, max: 9 };',
  'return { type: \'string\', max: 9 }; /* YM4 */',
  'tests/academic-years.js', /❌ AY6/, 'YM4 برداشتن pattern فرمت سال در سرور');

mutate('src/js/45-teacher-tools.js',
  'var shown = fy ? rows.filter(function(r){ return r.year === fy; }) : rows;',
  'var shown = rows; /* YM5 */',
  'tests/academic-years.js', /❌ AY5/, 'YM5 از کار افتادن فیلتر سال کارت سابقه');

execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
console.log(`جهش‌های سال تحصیلی: ${pass}/${pass + fail} کشته` + (envFails ? ` (${envFails} خطای محیطی)` : ''));
process.exit(fail || envFails ? 1 : 0);
