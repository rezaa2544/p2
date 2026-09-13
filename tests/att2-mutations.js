#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — حالت‌های زمان‌دار غیاب (بند 15.1)
   هر جهش باید tests/att2.js را بشکاند؛ وگرنه تست بی‌اثر است.
   ═══════════════════════════════════════════════════════════════════ */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
/* BH-mut (الگوی امن p06/p11): جهش در کپیِ جدا + خروجی‌های build در سایه؛
   نه src/js و نه index.html اصلی هرگز بازنویسی نمی‌شوند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('att2-mut-');
const ROOT = path.join(__dirname, '..');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایهٔ tmpdir */

const FILES = {
  'src/js/44-sms-notify.js': fs.readFileSync('src/js/44-sms-notify.js', 'utf8'),
  'src/js/19-actions-core.js': fs.readFileSync('src/js/19-actions-core.js', 'utf8'),
  'src/js/12-attendance.js': fs.readFileSync('src/js/12-attendance.js', 'utf8'),
  'src/js/47-counselor.js': fs.readFileSync('src/js/47-counselor.js', 'utf8'),
};

const MUTS = [
  {
    file: 'src/js/44-sms-notify.js',
    name: 'M1 محاسبهٔ دقیقهٔ تأخیر (attTimeFields) حذف شود',
    bad: '    f.late_minutes = attLateMinutes(schoolId, dateISO, t);\n',
    mut: '    f.late_minutes = 0;\n',
    expectFail: 'تأخیرِ دقیقه‌ای محاسبه نشد',
  },
  {
    file: 'src/js/19-actions-core.js',
    name: 'M2 فیلدهای رویداد از رکوردِ ثبت‌شده (att-commit) حذف شود',
    bad: "if(typeof applyAttEvents==='function')applyAttEvents(evf,evs,null);",
    mut: 'if(false)applyAttEvents(evf,evs,null);',
    expectFail: 'رکورد باید غایب باشد',
  },
  {
    file: 'src/js/47-counselor.js',
    name: 'M3 شمارشِ خروج (رویدادی) در patternFlagged حذف شود',
    bad: '      if(!a.exit_excused){e.exit.push(a.date);e.exitMin+=Number(a.exit_minutes)||0;}',
    mut: '      if(!a.exit_excused){/* mutation: no counting */}',
    expectFail: 'در فهرستِ الگوها نیست',
  },
  {
    file: 'src/js/12-attendance.js',
    name: 'M4 گاردِ نقشِ موجه‌سازی (canExempt) همیشه‌روشن شود',
    bad: "  const canExempt=!!(S.user&&(S.user.role==='manager'||S.user.role==='superadmin'));",
    mut: '  const canExempt=!!(S.user&&true);',
    expectFail: 'دبیر نباید دکمهٔ موجه‌سازی ببیند',
  },
  {
    file: 'src/js/19-actions-core.js',
    name: 'M5 هستهٔ موجهِ یکپارچه (att-exempt-confirm) بی‌اثر شود',
    bad: "?attExcuseCore(rec.id,'record',reason)",
    mut: "?{ok:true,msg:'mutation: no-op'}",
    expectFail: 'موجه‌سازی روی رکورد اعمال نشد',
  },
];

let killed = 0;
for (const m of MUTS) {
  const src = FILES[m.file];
  if (src.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
  kit.mutant(path.join(ROOT, m.file), src.replace(m.bad, m.mut)); /* کپی هم‌جوار */
  execSync('node build.js', { stdio: 'pipe', env: kit.env() }); /* build به سایه */
  let out = '', crashed = false;
  const __r89cmd = 'node tests/att2.js';
  try { execSync(__r89cmd, { stdio: 'pipe', env: kit.env() }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (out.trim() === '') { /* R89: empty output = process killed (env/memory) — retry once */
      try { execSync(__r89cmd, { stdio: 'pipe', env: kit.env() }); out = 'PASSED (no failure)'; }
      catch (e2) { out = String(e2.stdout || '') + String(e2.stderr || ''); }
    }
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
    if (out.trim() === '') out = '\u274c \u062e\u0637\u0627: \u0641\u0631\u0622\u06cc\u0646\u062f \u0628\u062f\u0648\u0646 \u062e\u0631\u0648\u062c\u06cc \u06a9\u0634\u062a\u0647 \u0634\u062f (\u0645\u062d\u06cc\u0637) \u2014 \u00ab\u0632\u0646\u062f\u0647 \u0645\u0627\u0646\u062f\u0646\u00bb \u062c\u0647\u0634 \u0646\u06cc\u0633\u062a';
  }
  const killedThis = crashed ? (m.crashOK === true) : (/❌/.test(out) && out.includes(m.expectFail));
  /* بدونِ بازگردانی — سورس اصلی هرگز جهش نگرفت */
  console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' : 'زنده ماند! (خطا: ' + (out.split('\n').find(l => l.includes('❌')) || out.slice(0, 120)) + ')'}`);
  if (killedThis) killed++;
}
kit.cleanup(); /* stray کپی‌ها پاک شدند؛ درخت از ابتدا بکر بود */
let finalOut = '', backGreen = false;
try {
  finalOut = execSync('node tests/att2.js', { stdio: 'pipe' }).toString(); /* بدونِ env → اصلی */
  backGreen = finalOut.includes('بدون خطا');
} catch (e) {
  finalOut = String(e.stdout || '');
}
console.log(`\nجهش: ${killed}/${MUTS.length} کشته` + (killed === MUTS.length && backGreen ? ' ✅ (سبزِ پایانی)' : ' ⚠️'));
if (killed !== MUTS.length || !backGreen) {
  console.log('خروجیِ اجرای پایانی:');
  console.log(finalOut.split('\n').slice(-12).join('\n'));
}
process.exit(killed === MUTS.length && backGreen ? 0 : 1);
