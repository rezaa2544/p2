#!/usr/bin/env node
/**
 * جهش‌سنجیِ شاخصِ کم‌برخوردار (دور ۷۹ بند ۶ — ۲.۳)
 *  - M1 پیش‌فاصلهٔ معکوس (district = کم‌برخوردار)      → U2 باید شکست بخورد
 *  - M2 آرایهٔ _up خفه (همه false)                       → U3 باید شکست بخورد
 *  - M3 شمارشِ سربرگِ صفر                                → U3 باید شکست بخورد
 *  - M4 بجِ ردیفی با سیگنالِ عملکردی (به‌جای ساختاری)    → U4 باید شکست بخورد
 *
 * اجرا:  node tests/underpriv2-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let ok = 0, bad = 0, envFails = 0;
function chk(cond, msg) {
  if (cond) { ok++; console.log('  ✅ ' + msg); }
  else { bad++; console.log('  ❌ ' + msg); }
}

function mutate(file, from, to, killRe, tag) {
  const f = path.join(ROOT, file);
  const orig = fs.readFileSync(f, 'utf8');
  const badSrc = orig.replace(from, to);
  if (badSrc === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  fs.writeFileSync(f, badSrc, 'utf8');
  try {
  const runOnce = () => spawnSync('node', [path.join(ROOT, 'tests/underpriv2.js')], { cwd: ROOT, encoding: 'utf8' });
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
  chk(r.status !== 0 && killRe.test(r.stdout), tag + ' کشته شد (' + killRe + ')');
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
  }
}

mutate('src/js/24-edu-office.js',
  "return !!(s && s.area_kind==='village');",
  "return !!(s && s.area_kind!=='village');",
  /❌ U1|❌ U2/, 'M1 پیش‌فاصلهٔ معکوس (district = کم‌برخوردار)');

mutate('src/js/24-edu-office.js',
  'const _up=rows.map(r=>schoolIsUnderprivileged(r.s));',
  'const _up=rows.map(()=>false);',
  /❌ U3|❌ U5/, 'M2 آرایهٔ _up خفه (همه false)');

mutate('src/js/24-edu-office.js',
  'const upN=_up.filter(Boolean).length;',
  'const upN=0;',
  /❌ U3/, 'M3 شمارشِ سربرگِ صفر');

mutate('src/js/24-edu-office.js',
  '${_up[rows.indexOf(r)]?\'<span class="badge b-purple"',
  '${_sig[rows.indexOf(r)].length?\'<span class="badge b-purple"',
  /❌ U4/, 'M4 بجِ ردیفی با سیگنالِ عملکردی (به‌جای ساختاری)');

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const base = spawnSync('node', [path.join(ROOT, 'tests/underpriv2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(base.status === 0, 'خطِّ پایهٔ underpriv2 سبز است');

console.log('\nunderpriv2-mutations: ' + (ok + bad) + ' بررسی — ✅ ' + ok + ' · ❌ ' + bad);
process.exit(bad ? 1 : 0);
