#!/usr/bin/env node
/**
 * تست‌های جهشیِ کارتِ امتیازیِ محدوده (بند D.2)
 *  M1 — بُعدِ بی‌داده به‌جای null نمرهٔ ۵۰ بگیرد            → R4
 *  M2 — حذفِ esc از نامِ اداره در نسخهٔ چاپی (XSS)          → R8
 *  M3 — افشایِ مبلغ در بُعدِ مالی                            → R2
 *  M4 — میانگینِ کل روی همهٔ ابعاد (با null) حساب شود        → R4
 *  M5 — برچسبِ رشد همیشه «روبه‌رشد»                          → R3
 *
 * اجرا:  node tests/officescore2-mutations.js
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
    /* R92: مرگِ زودهنگامِ کشف‌کننده (پورت/حافظه) → retry یک‌بار، بعد env-failِ صریح */
    const completed = (o) => /بررسی — /.test(o || '');
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

const F = 'src/js/69-office-scorecard.js';
const S = 'tests/officescore2.js';

mutate(F,
  'var score = parentSatisfactionScore(schoolIds);',
  'var score = 50;',
  S, /❌ R4/, 'M1 بُعدِ بی‌داده نمرهٔ ساختگی بگیرد');

mutate(F,
  "'<title>کارتِ امتیازی — ' + esc(sc.office_name) + '</title>'",
  "'<title>کارتِ امتیازی — ' + sc.office_name + '</title>'",
  S, /❌ R8/, 'M2 حذفِ esc از نامِ اداره در چاپ');

mutate(F,
  "if(col !== null){ scores.push(col); parts.push(['نرخِ وصولِ شهریه', fa(Math.round(col)) + '٪']); }",
  "if(col !== null){ scores.push(col); parts.push(['نرخِ وصولِ شهریه', fa(Math.round(col)) + '٪']); parts.push(['جمعِ قابل‌وصول', fa(Math.round(payable))]); }",
  S, /❌ R2/, 'M3 افشایِ مبلغ در بُعدِ مالی');

mutate(F,
  'var total = have.length ? Math.round(scAvg(have, function(d){ return d.score; })) : null;',
  'var total = Math.round(scAvg(dims, function(d){ return d.score || 0; })) || 0;',
  S, /❌ R4/, 'M4 میانگینِ کل با ابعادِ بی‌داده');

mutate(F,
  "label = delta > 0.3 ? 'روبه‌رشد' : (delta < -0.3 ? 'نزولی' : 'تقریباً ثابت');",
  "label = 'روبه‌رشد';",
  S, /❌ R3/, 'M5 برچسبِ رشد همیشه روبه‌رشد');

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const b2 = spawnSync('node', [path.join(ROOT, S)], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ officescore2 سبز است');

console.log(`\nofficescore2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}` + (envFails ? ` · خطای محیطی: ${envFails}` : ''));
process.exit(fail ? 1 : 0);
