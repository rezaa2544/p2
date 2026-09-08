#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — دور ۱۰۲ (به‌روزرسانیِ جزئیِ ثبت حضور)
   هر جهش باید tests/attpartial.js را بشکاند؛ وگرنه تست بی‌اثر است.
   ═══════════════════════════════════════════════════════════════════ */
const { execSync } = require('child_process');
const fs = require('fs');

const FILES = {
  'src/js/19-actions-core.js': fs.readFileSync('src/js/19-actions-core.js', 'utf8'),
  'src/js/12-attendance.js':   fs.readFileSync('src/js/12-attendance.js', 'utf8'),
};

const MUTS = [
  {
    file: 'src/js/19-actions-core.js',
    name: 'M1 فراخوانیِ به‌روزرسانیِ جزئی حذف شود (رندرِ کامل برگردد)',
    bad: "if(!(typeof attPartialSync==='function'&&attPartialSync(id))) render();",
    mut: 'render();',
    expectFail: 'رندر کامل',
  },
  {
    file: 'src/js/12-attendance.js',
    name: 'M2 بازسازیِ ردیفِ دانش‌آموز حذف شود',
    bad: 'tr.outerHTML=attRowHTML(studs[idx],idx,ctx);',
    mut: '/* tr.outerHTML=attRowHTML(studs[idx],idx,ctx); */',
    expectFail: 'ردیف دانش‌آموز به‌روز نشد',
  },
  {
    file: 'src/js/12-attendance.js',
    name: 'M3 به‌روزرسانیِ شمارنده‌هایِ خلاصه حذف شود',
    bad: 'if(sumRow) sumRow.innerHTML=attSummaryInner(roster,ctx);',
    mut: 'if(false) sumRow.innerHTML=attSummaryInner(roster,ctx);',
    expectFail: 'شمارنده‌های خلاصه به‌روز نشدند',
  },
  {
    file: 'src/js/12-attendance.js',
    name: 'M4 درجِ نوارِ پیش‌نویس در نخستین تیک حذف شود',
    bad: "else card.insertAdjacentHTML('beforebegin',attDraftBarHTML(nChange));",
    mut: 'else void 0;',
    expectFail: 'نوار پیش‌نویس ظاهر نشد',
  },
];

let killed = 0;
for (const m of MUTS) {
  const src = FILES[m.file];
  if (src.indexOf(m.bad) < 0) { console.log(`  ❌ ${m.name}: الگو پیدا نشد`); continue; }
  fs.writeFileSync(m.file, src.replace(m.bad, m.mut));
  execSync('node build.js', { stdio: 'pipe' });
  let out = '', crashed = false;
  const __cmd = 'node tests/attpartial.js';
  try { execSync(__cmd, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
  catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    if (out.trim() === '') { /* خروجی خالی = فرایند کشته شد (محیط) — یک‌بار تلاشِ دوباره */
      try { execSync(__cmd, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
      catch (e2) { out = String(e2.stdout || '') + String(e2.stderr || ''); }
    }
    if (/JavaScript heap out of memory|FATAL|aborting/.test(out) || out.trim() === '') crashed = true;
  }
  const killedThis = crashed ? (m.crashOK === true) : (/❌/.test(out) && out.includes(m.expectFail));
  for (const f of Object.keys(FILES)) fs.writeFileSync(f, FILES[f]);
  console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' : 'زنده ماند! (خطا: ' + (out.split('\n').find(l => l.includes('❌')) || out.slice(0, 120)) + ')'}`);
  if (killedThis) killed++;
}
execSync('node build.js', { stdio: 'pipe' });
let finalOut = '', backGreen = false;
try { finalOut = execSync('node tests/attpartial.js', { stdio: 'pipe' }).toString(); backGreen = finalOut.includes('بدون خطا'); }
catch (e) { finalOut = String(e.stdout || ''); }
console.log(`\nجهش: ${killed}/${MUTS.length} کشته` + (killed === MUTS.length && backGreen ? ' ✅ (سبزِ پایانی)' : ' ⚠️'));
if (killed !== MUTS.length || !backGreen) {
  console.log('خروجیِ اجرای پایانی:');
  console.log(finalOut.split('\n').slice(-12).join('\n'));
}
process.exit(killed === MUTS.length && backGreen ? 0 : 1);
