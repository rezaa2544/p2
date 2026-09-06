#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — حالت‌های زمان‌دار غیاب (بند 15.1)
   هر جهش باید tests/att2.js را بشکاند؛ وگرنه تست بی‌اثر است.
   ═══════════════════════════════════════════════════════════════════ */
const { execSync } = require('child_process');
const fs = require('fs');

const FILES = {
  'src/js/44-sms-notify.js': fs.readFileSync('src/js/44-sms-notify.js', 'utf8'),
  'src/js/19-actions.js': fs.readFileSync('src/js/19-actions.js', 'utf8'),
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
    file: 'src/js/19-actions.js',
    name: 'M2 فیلدهای زمان از رکوردِ ثبت‌شده (att-commit) حذف شود',
    bad: 'note:null},c.fields||{})).id;',
    mut: 'note:null})).id;',
    expectFail: 'ساعتِ خروج در رکوردِ ثبت‌شده نیست',
  },
  {
    file: 'src/js/47-counselor.js',
    name: 'M3 شمارشِ خروج در patternFlagged حذف شود',
    bad: "    else if(a.status==='early_exit'){e.exit.push(a.date);e.exitMin+=Number(a.exit_minutes)||0;}",
    mut: "    else if(a.status==='__no_exit__'){e.exit.push(a.date);e.exitMin+=Number(a.exit_minutes)||0;}",
    expectFail: 'الگوی خروج مکرر شناسایی نشد',
  },
  {
    file: 'src/js/12-attendance.js',
    name: 'M4 گاردِ نقشِ موجه‌سازی (canExempt) همیشه‌روشن شود',
    bad: "  const canExempt=!!(S.user&&(S.user.role==='manager'||S.user.role==='superadmin'));",
    mut: '  const canExempt=!!(S.user&&true);',
    expectFail: 'دبیر نباید دکمهٔ موجه‌سازی ببیند',
  },
  {
    file: 'src/js/19-actions.js',
    name: 'M5 اثرِ موجه‌سازی (excused:true) خاموش شود',
    bad: '       excused:true,\n       justified_by:S.user.id,',
    mut: '       excused:false,\n       justified_by:S.user.id,',
    expectFail: 'موجه‌سازی روی رکورد اعمال نشد',
  },
];

let killed = 0;
for (const m of MUTS) {
  const src = FILES[m.file];
  if (src.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
  fs.writeFileSync(m.file, src.replace(m.bad, m.mut));
  execSync('node build.js', { stdio: 'pipe' });
  let out = '', crashed = false;
  try { execSync('node tests/att2.js', { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
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
  finalOut = execSync('node tests/att2.js', { stdio: 'pipe' }).toString();
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
