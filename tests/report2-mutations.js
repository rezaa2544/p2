#!/usr/bin/env node
/**
 * تست‌های جهشیِ کارنامهٔ چاپ‌شونده (بند ۴.۳)
 *  M1 — خالی‌کردنِ میانگینِ کلاس (ستونِ کلاس همیشه «—») → R2
 *  M2 — قفلِ رتبه روی ۱ (حذفِ شمارشِ هم‌کلاسی‌ها) → R3
 *  M3 — نادیده‌گرفتنِ فیلترِ نوبت → R4
 *
 * اجرا:  node tests/report2-mutations.js
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

mutate('src/js/33-forms-sms.js',
  'if(!kidsSet[g.student_id]) return;',
  'return;',
  'tests/report2.js', /❌ R2/, 'M1 خالی‌کردنِ میانگینِ کلاس');

mutate('src/js/33-forms-sms.js',
  'rank = above + 1;',
  'rank = 1;',
  'tests/report2.js', /❌ R3/, 'M2 قفلِ رتبه روی ۱');

mutate('src/js/33-forms-sms.js',
  'var list = db.grades.filter(function(g){ return g.student_id===sid && (!term || g.term===term); });',
  'var list = db.grades.filter(function(g){ return g.student_id===sid; });',
  'tests/report2.js', /❌ R4/, 'M3 نادیده‌گرفتنِ فیلترِ نوبت');

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const b2 = spawnSync('node', [path.join(ROOT, 'tests/report2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ report2 سبز است');

console.log(`\nreport2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
