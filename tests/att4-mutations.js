#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — دور ۷۷ (رویدادِ تاخیر/خروج + ۳۰٪ + موجهِ یکپارچه)
   هر جهش باید tests/att4.js را بشکاند؛ وگرنه تست بی‌اثر است.
   ═══════════════════════════════════════════════════════════════════ */
const { execSync } = require('child_process');
const fs = require('fs');

const FILES = {
  'src/js/44-sms-notify.js': fs.readFileSync('src/js/44-sms-notify.js', 'utf8'),
  'src/js/19-actions.js':    fs.readFileSync('src/js/19-actions.js', 'utf8'),
  'src/js/12-attendance.js': fs.readFileSync('src/js/12-attendance.js', 'utf8'),
  'src/js/17-student-record.js': fs.readFileSync('src/js/17-student-record.js', 'utf8'),
};

const MUTS = [
  {
    file: 'src/js/19-actions.js',
    name: 'M1 تبدیلِ خودکارِ حذف‌شده برگردد (تأخیر روی غایب، وضعیت علامت بخورد)',
    bad: "attDraftEvent(cid,date,id,'late',auto.fields);",
    mut: "attDraftSet(cid,date,id,'late',auto.fields);",
    expectFail: 'اتوماتِ تبدیل حذف شد',
  },
  {
    file: 'src/js/19-actions.js',
    name: 'M2 گاردِ قفلِ تایمر (هنگامِ خروجِ فعال) خاموش شود',
    bad: "if(st!=='early_exit'&&_tmAll[id]){",
    mut: 'if(false&&_tmAll[id]){',
    expectFail: 'گاردِ قفلِ تایمر کار نکرد',
  },
  {
    file: 'src/js/19-actions.js',
    name: 'M3 قاعدهٔ ۳۰٪ در ثبتِ رکوردِ تازه بی‌اثر شود',
    bad: "if(st!=='absent'&&typeof attOutRule==='function'){",
    mut: 'if(false){',
    expectFail: 'رکورد باید غایب باشد',
  },
  {
    file: 'src/js/44-sms-notify.js',
    name: 'M4 پنجرهٔ زمانیِ موجه برایِ دبیر برداشته شود',
    bad: "if(role === 'teacher' && which !== 'record'){",
    mut: 'if(false){',
    expectFail: 'موجهِ بیرونِ پنجره اعمال شد',
  },
  {
    file: 'src/js/17-student-record.js',
    name: 'M5 رکوردِ موجه از پرونده حذف نشود',
    bad: 'const attFile=att.filter(x=>!x.excused);',
    mut: 'const attFile=att.slice();',
    expectFail: 'رکوردِ موجه‌شده هنوز در پرونده نمایش داده می‌شود',
  },
];

let killed = 0;
for (const m of MUTS) {
  const src = FILES[m.file];
  if (src.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
  fs.writeFileSync(m.file, src.replace(m.bad, m.mut));
  execSync('node build.js', { stdio: 'pipe' });
  let out = '', crashed = false;
  try { execSync('node tests/att4.js', { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
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
try { finalOut = execSync('node tests/att4.js', { stdio: 'pipe' }).toString(); backGreen = finalOut.includes('بدون خطا'); }
catch (e) { finalOut = String(e.stdout || ''); }
console.log(`\nجهش: ${killed}/${MUTS.length} کشته` + (killed === MUTS.length && backGreen ? ' ✅ (سبزِ پایانی)' : ' ⚠️'));
if (killed !== MUTS.length || !backGreen) {
  console.log('خروجیِ اجرای پایانی:');
  console.log(finalOut.split('\n').slice(-12).join('\n'));
}
process.exit(killed === MUTS.length && backGreen ? 0 : 1);
