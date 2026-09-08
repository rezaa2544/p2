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
  /* R92: مرگِ زودهنگامِ کشف‌کننده (پورت اشغال/حافظه — قبل از چاپِ چکِ موردِ انتظار و خطِ خلاصه) → retry یک‌بار، بعد env-failِ صریح. هرگز «زنده ماند»ِ کاذب. */
  const completed = (o) => /بررسی — /.test(o || '');
  execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
  let r = runOnce();
  if (r.status !== 0 && !killRe.test(r.stdout) && !completed(r.stdout)) {
    const r2 = runOnce();
    if (r2.status === 0 || killRe.test(r2.stdout) || completed(r2.stdout)) r = r2;
  }
  if (r.status !== 0 && !killRe.test(r.stdout) && !completed(r.stdout)) {
    envFails++;
    chk(false, tag + ' — خطای محیطی: چکِ موردِ انتظار هرگز چاپ نشد (مرگِ زودهنگامِ تست — پورت/حافظه) — نه کشته و نه زنده شمرده شد');
    return;
  }
  chk(r.status !== 0 && killRe.test(r.stdout), tag);
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
