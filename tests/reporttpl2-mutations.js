#!/usr/bin/env node
/**
 * جهش‌سنجیِ قالبِ کارنامه (دور ۷۹ بند  — ۴.۳)
 *  - M1 نادیده‌گرفتنِ tpl (همیشه classic)        → T2 باید شکست بخورد
 *  - M2 لیستِ دروسِ compact خالی                 → T2 باید شکست بخورد
 *  - M3 اکشنِ چاپ tpl را نمی‌فرستد               → T5 باید شکست بخورد
 *  - M4 رتبهٔ کلاس از compact حذف                 → T2 باید شکست بخورد
 *
 * اجرا:  node tests/reporttpl2-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا (mutant-kit)؛ سورس اصلی
   هرگز بازنویسی نمی‌شود — بازگردانی حذف شد (clear نگاشت). */
const { session } = require('./helpers/mutant-kit');
const kit = session('rtp2-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */
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
  const mcopy = kit.mutant(f, badSrc); /* کپیِ جدا؛ سورس اصلی دست‌نخورده */
  try { fs.chmodSync(mcopy, fs.statSync(f).mode); } catch (_) {}
  const runOnce = () => spawnSync('node', [path.join(ROOT, 'tests/reporttpl2.js')], { cwd: ROOT, encoding: 'utf8', env: kit.env() });
  /* R92: مرگِ زودهنگامِ کشف‌کننده (پورت اشغال/حافظه — قبل از چاپِ چکِ موردِ انتظار و خطِ خلاصه) → retry یک‌بار، بعد env-failِ صریح. هرگز «زنده ماند»ِ کاذب. */
  const completed = (o) => /بررسی — /.test(o || '');
  try {
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() }); /* build در سایه */
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
    kit.clear(f); /* نقشهٔ خالی؛ پاک‌سازیِ واقعی در exit */
  }
}

mutate('src/js/33-forms-sms.js',
  "var body = (tpl === 'compact') ? bodyCompact : bodyClassic;",
  "var body = bodyClassic;",
  /❌ T2/, 'M1 نادیده‌گرفتنِ tpl (همیشه classic)');

mutate('src/js/33-forms-sms.js',
  "    + '<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:7px\">'\n    + rows.map(function(r){",
  "    + '<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:7px\">'\n    + [].map(function(r){",
  /❌ T2/, 'M2 لیستِ دروسِ compact خالی');

mutate('src/js/19-actions-core.js',
  "const d=reportCardCert(sid,V('cert_term'),V('cert_tpl')||'classic');",
  "const d=reportCardCert(sid,V('cert_term'));",
  /❌ T5/, 'M3 اکشنِ چاپ tpl را نمی‌فرستد');

mutate('src/js/33-forms-sms.js',
  "    + '</div>'\n    + '<div class=\"meta\" style=\"margin-top:10px;gap:22px\">'\n    + '<span>معدلِ وزنی: <b style=\"font-size:13px\">' + fa(gpa) + '</b> از ۲۰</span>'\n    + (rank != null ? '<span>رتبهٔ کلاس: <b>' + fa(rank) + '</b> از ' + fa(inClass) + '</span>' : '')",
  "    + '</div>'\n    + '<div class=\"meta\" style=\"margin-top:10px;gap:22px\">'\n    + '<span>معدلِ وزنی: <b style=\"font-size:13px\">' + fa(gpa) + '</b> از ۲۰</span>'\n    + ''",
  /❌ T2/, 'M4 رتبهٔ کلاس از compact حذف');

/* خطِّ پایه — سورس‌ها و index.html اصلی دست‌نخورده‌اند (بدون rebuild) */
const base = spawnSync('node', [path.join(ROOT, 'tests/reporttpl2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(base.status === 0, 'خطِّ پایهٔ reporttpl2 سبز است');

console.log('\nreporttpl2-mutations: ' + (ok + bad) + ' بررسی — ✅ ' + ok + ' · ❌ ' + bad);
process.exit(bad ? 1 : 0);
