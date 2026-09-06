#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — دور ۷۵ (تایمرِ خروج + تأخیرِ خودکار)
   هر جهش باید tests/att3.js را بشکاند؛ وگرنه تست بی‌اثر است.
   ═══════════════════════════════════════════════════════════════════ */
const { execSync } = require('child_process');
const fs = require('fs');

const FILES = {
  'src/js/44-sms-notify.js': fs.readFileSync('src/js/44-sms-notify.js', 'utf8'),
  'src/js/19-actions.js':    fs.readFileSync('src/js/19-actions.js', 'utf8'),
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
    file: 'src/js/19-actions.js',
    name: 'M4 taken_at در رکوردِ تازهٔ ثبت‌شده نوشته نشود',
    bad: "           taken_at:new Date().toISOString()},c.fields||{})).id;",
    mut: '           },c.fields||{})).id;',
    expectFail: 'taken_at در رکوردِ تازه نیست',
  },
  {
    file: 'src/js/17-student-record.js',
    name: 'M5 توضیحِ خودکارِ پرونده (بازهٔ خروج تا بازگشت) خاموش شود',
    bad: "if(rr.status==='early_exit'&&rr.exit_at)return 'خروج از کلاس: ساعت '+(_tf?_tf(rr.exit_at):rr.exit_at)+((rr.exit_return_at)?' تا '+(_tf?_tf(rr.exit_return_at):rr.exit_return_at):'')+((rr.exit_minutes!=null)?' — '+fa(rr.exit_minutes)+' دقیقه':'');",
    mut: "if(rr.status==='early_exit'&&rr.exit_at)return '—';",
    expectFail: 'توضیحِ خروجِ تایمری در پرونده نیست',
  },
];

let killed = 0;
for (const m of MUTS) {
  const src = FILES[m.file];
  if (src.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
  fs.writeFileSync(m.file, src.replace(m.bad, m.mut));
  execSync('node build.js', { stdio: 'pipe' });
  let out = '', crashed = false;
  try { execSync('node tests/att3.js', { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out)) crashed = true;
  }
  const killedThis = crashed ? (m.crashOK === true) : (/❌/.test(out) && out.includes(m.expectFail));
  for (const f of Object.keys(FILES)) fs.writeFileSync(f, FILES[f]);
  console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' : 'زنده ماند! (خطا: ' + (out.split('\n').find(l => l.includes('❌')) || out.slice(0, 120)) + ')'}`);
  if (killedThis) killed++;
}
execSync('node build.js', { stdio: 'pipe' });
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
