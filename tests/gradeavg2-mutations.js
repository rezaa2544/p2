#!/usr/bin/env node
/**
 * تست‌های جهشیِ مقایسهٔ نمره با میانگین کلاس (بند ۴.۹)
 *  M1 — برداشتنِ محاسبهٔ زمینه (17-student-record) → G3/G4 باید شکست بخورند
 *  M2 — آستانهٔ ۲ نفر به ۱ (04-queries)               → G6 باید شکست بخورد
 *  M3 — جمعِ نمره به شمارشِ ردیف (04-queries)         → G1 باید شکست بخورد
 *
 * اجرا:  node tests/gradeavg2-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('gavg-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */


const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, envFails = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

let lastFile = null;
function mutate(file, from, to, run, killRe, tag) {
  const f = path.join(ROOT, file);
  if (lastFile && lastFile !== f) kit.clear(lastFile); /* فقط جهشِ جاری فعال */
  lastFile = f;
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  kit.mutant(f, bad); /* کپی جدا؛ سورس اصلی دست‌نخورده */
  {
  const runOnce = () => spawnSync('node', [path.join(ROOT, 'tests/gradeavg2.js')], { cwd: ROOT, encoding: 'utf8', env: kit.env() });
  /* R92: مرگِ زودهنگامِ کشف‌کننده (پورت اشغال/حافظه — قبل از چاپِ چکِ موردِ انتظار و خطِ خلاصه) → retry یک‌بار، بعد env-failِ صریح. هرگز «زنده ماند»ِ کاذب. */
  const completed = (o) => /بررسی — /.test(o || '');
  execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() });
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
  }
}

mutate('src/js/17-student-record.js',
  "S.__clsCtx=(typeof classScoreContext==='function'&&_cid)?classScoreContext(_cid.id):{};",
  "S.__clsCtx={};",
  null, /❌ G3|❌ G4/, 'M1 برداشتنِ زمینهٔ میانگین');

mutate('src/js/04-queries.js',
  'if(cnt<2) return;',
  'if(cnt<1) return;',
  null, /❌ G6/, 'M2 آستانهٔ ۲ نفر → ۱');

mutate('src/js/04-queries.js',
  'sum+=g.score;',
  'sum+=1;',
  null, /❌ G1/, 'M3 جمعِ نمره → شمارشِ ردیف');

/* خطِّ پایه (بدون env — سورس‌های اصلی) */
const base = spawnSync('node', [path.join(ROOT, 'tests/gradeavg2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(base.status === 0, 'خطِّ پایهٔ gradeavg2 سبز است');

console.log(`\ngradeavg2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
