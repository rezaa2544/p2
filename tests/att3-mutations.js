#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — دور ۷۵ (تایمرِ خروج + تأخیرِ خودکار)
   هر جهش باید tests/att3.js را بشکاند؛ وگرنه تست بی‌اثر است.
   ═══════════════════════════════════════════════════════════════════ */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('a3-mut-');
const ROOT = path.join(__dirname, '..');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const FILES = {
  'src/js/44-sms-notify.js': fs.readFileSync('src/js/44-sms-notify.js', 'utf8'),
  'src/js/19-actions-core.js':    fs.readFileSync('src/js/19-actions-core.js', 'utf8'),
  'src/js/17-student-record.js': fs.readFileSync('src/js/17-student-record.js', 'utf8'),
};

const MUTS = [
  {
    file: 'src/js/44-sms-notify.js',
    name: 'M1 دقیقهٔ تایمرِ خروج معکوس (s-now به‌جای now-s) شود',
    bad: '  var minutes = Math.max(0, Math.floor((now - s) / 60000));',
    mut: '  var minutes = Math.max(0, Math.floor((s - now) / 60000));',
    expectFail: 'دقیقهٔ سپری‌شده درست نیست',
  },
  {
    file: 'src/js/44-sms-notify.js',
    name: 'M2 تبدیلِ خودکار روی هر وضعیتی (نه فقط absent) فعال شود',
    bad: "  if(cur !== 'absent') return { converted: false, reason: 'no-absent' };",
    mut: "  if(cur !== 'late') return { converted: false, reason: 'no-absent' };",
    expectFail: 'مودالِ ساعت باز شد — غیبتِ موجود باید خودکار می‌شد',
  },
  {
    file: 'src/js/44-sms-notify.js',
    name: 'M3 taken_at در تبدیلِ خودکار نادیده گرفته شود',
    bad: "  var taken = (rec && rec.taken_at) ? Date.parse(rec.taken_at) : null;",
    mut: '  var taken = null;',
    expectFail: 'دقیقهٔ تاخیر (~۱۰) درست نیست',
  },
  {
    file: 'src/js/19-actions-core.js',
    name: 'M4 taken_at در رکوردِ تازهٔ ثبت‌شده نوشته نشود',
    bad: 'student_id:c.student_id,date,status:st,note:baseNote,\n              taken_at:new Date().toISOString()};',
    mut: 'student_id:c.student_id,date,status:st,note:baseNote,\n              taken_at:null};',
    expectFail: 'taken_at در رکوردِ تازه نیست',
  },
  {
    file: 'src/js/17-student-record.js',
    name: 'M5 توضیحِ خودکارِ پرونده (رویدادِ خروج: بازه تا بازگشت) خاموش شود',
    bad: "_parts.push('خروج از کلاس: ساعت '+(rr.exit_at?(_tf?_tf(rr.exit_at):rr.exit_at):'—')+((rr.exit_return_at)?' تا '+(_tf?_tf(rr.exit_return_at):rr.exit_return_at):'')+((rr.exit_minutes!=null)?' — '+fa(rr.exit_minutes)+' دقیقه':''));",
    mut: "_parts.push('—');",
    expectFail: 'توضیحِ خروجِ تایمری در پرونده نیست',
  },
];

let killed = 0, prevFile = null;
for (const m of MUTS) {
  const abs = path.join(ROOT, m.file);
  if (prevFile && prevFile !== abs) kit.clear(prevFile); /* فقط جهشِ جاری فعال */
  prevFile = abs;
  const src = FILES[m.file];
  if (src.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
  kit.mutant(abs, src.replace(m.bad, m.mut)); /* کپی جدا؛ سورس اصلی دست‌نخورده */
  execSync('node build.js', { stdio: 'pipe', env: kit.env(), cwd: ROOT });
  let out = '', crashed = false;
  const __r89cmd = 'node tests/att3.js';
  try { execSync(__r89cmd, { stdio: 'pipe', env: kit.env(), cwd: ROOT }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (out.trim() === '') { /* R89: empty output = process killed (env/memory) — retry once */
      try { execSync(__r89cmd, { stdio: 'pipe', env: kit.env(), cwd: ROOT }); out = 'PASSED (no failure)'; }
      catch (e2) { out = String(e2.stdout || '') + String(e2.stderr || ''); }
    }
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
    if (out.trim() === '') out = '\u274c \u062e\u0637\u0627: \u0641\u0631\u0622\u06cc\u0646\u062f \u0628\u062f\u0648\u0646 \u062e\u0631\u0648\u062c\u06cc \u06a9\u0634\u062a\u0647 \u0634\u062f (\u0645\u062d\u06cc\u0637) \u2014 \u00ab\u0632\u0646\u062f\u0647 \u0645\u0627\u0646\u062f\u0646\u00bb \u062c\u0647\u0634 \u0646\u06cc\u0633\u062a';
  }
  const killedThis = crashed ? (m.crashOK === true) : (/❌/.test(out) && out.includes(m.expectFail));
  console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' : 'زنده ماند! (خطا: ' + (out.split('\n').find(l => l.includes('❌')) || out.slice(0, 120)) + ')'}`);
  if (killedThis) killed++;
}
let finalOut = '', backGreen = false;
try {
  finalOut = execSync('node tests/att3.js', { stdio: 'pipe' }).toString();
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
