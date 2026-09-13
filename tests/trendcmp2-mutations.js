#!/usr/bin/env node
/**
 * دور ۷۹ بند  — جهش‌های پوشِ میانگین کلاس (بند ۴.۹) — پایش
 *
 *  M1 — ارتفاعِ تیک از normِ خودِ دانش‌آموز (به‌جای میانگین کلاس) → G2
 *  M2 — لِجِند حذف شود → G2
 *  M3 — classScoreContext عضویتِ درس را نادیده بگیرد → G4
 *  M4 — آستانهٔ ۲ نفر به ۳ شود (تیکِ تک‌نفره ساخته شود) → G3
 *
 * اجرا: node tests/trendcmp2-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('tc2-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, envFails = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

let lastFile = null;
function mutate(file, from, to, killRe, tag) {
  const f = path.join(ROOT, file);
  if (lastFile && lastFile !== f) kit.clear(lastFile); /* فقط جهشِ جاری فعال */
  lastFile = f;
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  kit.mutant(f, bad); /* کپی جدا؛ سورس اصلی دست‌نخورده */
  {
  const runOnce = () => spawnSync('node', [path.join(ROOT, 'tests/trendcmp2.js')], { cwd: ROOT, encoding: 'utf8', env: kit.env() });
  const outOf = (x) => x.stdout || x.stderr || '';
  /* R92: مرگِ زودهنگامِ کشف‌کننده (پورت اشغال/حافظه — قبل از چاپِ چکِ موردِ انتظار و خطِ خلاصه) → retry یک‌بار، بعد env-failِ صریح. هرگز «زنده ماند»ِ کاذب. */
  const completed = (o) => /بررسی — /.test(o || '');
  execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() });
  let r = runOnce();
  if (r.status !== 0 && !killRe.test(outOf(r)) && !completed(outOf(r))) {
    const r2 = runOnce();
    if (r2.status === 0 || killRe.test(outOf(r2)) || completed(outOf(r2))) r = r2;
  }
  if (r.status !== 0 && !killRe.test(outOf(r)) && !completed(outOf(r))) {
    envFails++;
    chk(false, tag + ' — خطای محیطی: چکِ موردِ انتظار هرگز چاپ نشد (مرگِ زودهنگامِ تست — پورت/حافظه) — نه کشته و نه زنده شمرده شد');
    return;
  }
  chk(r.status !== 0 && killRe.test(outOf(r)), tag + ' کشته شد');
  }
}

mutate('src/js/17-student-record.js',
  "((cAvg / 20) * 100).toFixed(1)",
  "(p.norm / 20 * 100).toFixed(1)",
  /❌ G2/, 'M1 تیک با ارتفاعِ نمرهٔ خودِ دانش‌آموز');
mutate('src/js/17-student-record.js',
  "  var tickLegend = hasTick",
  "  var tickLegend = '' ; void hasTick",
  /❌ G2/, 'M2 لِجِندِ میانگین کلاس حذف');
mutate('src/js/04-queries.js',
  "      if(!ids[g.student_id]) return;",
  "      if(false) return; /* جهش: عضویت نادیده گرفته شد */",
  /❌ G4/, 'M3 نادیده‌گرفتنِ عضویتِ درس در میانگین');
mutate('src/js/04-queries.js',
  "    if(cnt<2) return;",
  "    if(cnt<3) return;",
  /❌ G4/, 'M4 آستانهٔ ۲ نفر به ۳ (گروهِ ۲ نفرهٔ G4 میانگین نمی‌سازد)');

/* خطِّ پایه (بدون env — سورس‌های اصلی) */
const b2 = spawnSync('node', [path.join(ROOT, 'tests/trendcmp2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ trendcmp2 سبز است');

console.log(`\ntrendcmp2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
