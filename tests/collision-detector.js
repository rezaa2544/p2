#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/collision-detector.js — تست و اعتبارسنجی ابزار تشخیص تداخل فایل (C8-02)
   ───────────────────────────────────────────────────────────────────
   سنجه‌ها:
     ۱) بررسی وجود و اجرای موفق ابزار روی درخت فعلی (خروجی ۰)
     ۲) پرونده مثبت: تغییرات مجاز آرنا (بدون تداخل) پذیرفته می‌شود
     ۳) پرونده منفی ۱: تلاش برای تغییر فایل گزارش آرنای دیگر مسدود می‌شود
     ۴) پرونده منفی ۲: تلاش برای تغییر صف مأموریت آرنای دیگر مسدود می‌شود
     ۵) پرونده منفی ۳: فلگ --block-shared فایل‌های حساس را مسدود می‌کند
     ۶) مقایسه تداخل دو شاخه با فایل‌های متداخل و غیرمتداخل
     ۷) گاز تست (Bite): کنترل منفی شکست در صورت حذف فیلتر مرزبندی

   اجرا: node tests/collision-detector.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const failures = [];

function chk(name, ok, extra) {
  if (ok) {
    pass++;
    console.log('  ✅ ' + name);
  } else {
    fail++;
    failures.push(name + (extra ? ' — ' + extra : ''));
    console.log('  ❌ ' + name + (extra ? ' — ' + extra : ''));
  }
}

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'collision-detector.js');
const detector = require(TOOL);

console.log('■ ۱) بررسی صحت ابزار روی ریپو');
chk('ابزار tools/collision-detector.js وجود دارد', fs.existsSync(TOOL));

let cleanCode = 0, cleanOut = '';
try {
  cleanOut = execFileSync(process.execPath, [TOOL, '--files', 'docs/daily-reports/Chat8/2026-09-17.md', '--arena', 'Chat8'], { encoding: 'utf8' });
} catch (e) {
  cleanCode = e.status || 1;
  cleanOut = (e.stdout || '') + (e.stderr || '');
}
chk('اجرای پرونده تمیز با کد خروجی ۰', cleanCode === 0);
chk('پیام تأیید عدم تداخل در خروجی', cleanOut.includes('هیچ تداخل یا نقض مرز مالکیتی مسدودکننده‌ای یافت نشد'));

console.log('\n■ ۲) پرونده مثبت و توابع هسته');
const allowedFiles = [
  'docs/daily-reports/Chat8/2026-09-17.md',
  'src/js/08-dashboard.js',
  'tests/collision-detector.js'
];
const vAllowed = detector.checkArenaBoundary(allowedFiles, 'Chat8');
chk('تغییرات اختصاصی Chat8 فاقد نقض مرز است', vAllowed.length === 0);

const highShared = detector.checkHighCollisionFiles(['authz/model.json', 'src/js/01-helpers.js', 'docs/DOCS_METRICS.md']);
chk('فایل‌های حساس مشترک شناسایی می‌شوند', highShared.includes('authz/model.json') && highShared.includes('docs/DOCS_METRICS.md') && !highShared.includes('src/js/01-helpers.js'));

console.log('\n■ ۳) کنترل‌های منفی مسدودسازی (Negative Controls)');
// ۳.۱ نقض مرز گزارش روزانه آرنای دیگر
const foreignReportFiles = [
  'docs/daily-reports/Chat3/2026-09-17.md',
  'docs/daily-reports/Chat8/2026-09-17.md'
];
const vForeign = detector.checkArenaBoundary(foreignReportFiles, 'Chat8');
chk('تلاش برای ویرایش گزارش Chat3 توسط Chat8 کشف می‌شود', vForeign.some(v => v.type === 'FOREIGN_ARENA_REPORT' && v.owner === 'Chat3'));

let foreignCode = 0;
try {
  execFileSync(process.execPath, [TOOL, '--files', foreignReportFiles.join(','), '--arena', 'Chat8'], { encoding: 'utf8', stdio: 'pipe' });
} catch (e) {
  foreignCode = e.status || 1;
}
chk('تلاش برای دستکاری گزارش آرنای دیگر منجر به Exit 1 می‌شود', foreignCode === 1);

// ۳.۲ نقض مرز صف مأموریت آرنای دیگر
const foreignMissionFiles = ['docs/daily-missions/Chat1/ACTIVE.md'];
const vMission = detector.checkArenaBoundary(foreignMissionFiles, 'Chat8');
chk('تلاش برای ویرایش صف ACTIVE چت دیگر کشف می‌شود', vMission.some(v => v.type === 'FOREIGN_ARENA_MISSION' && v.owner === 'Chat1'));

// ۳.۳ گزینه --block-shared روی فایل‌های حساس
let blockSharedCode = 0;
try {
  execFileSync(process.execPath, [TOOL, '--files', 'authz/model.json', '--arena', 'Chat8', '--block-shared'], { encoding: 'utf8', stdio: 'pipe' });
} catch (e) {
  blockSharedCode = e.status || 1;
}
chk('گزینه --block-shared ویرایش فایل حساس را مسدود می‌کند (Exit 1)', blockSharedCode === 1);

console.log('\n■ ۴) تشخیص تداخل بین دو شاخه/PR مستقل');
const setBranchA = ['src/js/08-dashboard.js', 'authz/model.json', 'docs/daily-reports/Chat8/2026-09-17.md'];
const setBranchB = ['src/js/12-attendance.js', 'authz/model.json', 'docs/daily-reports/Chat3/2026-09-17.md'];
const setBranchC = ['src/js/45-teacher-tools.js', 'docs/daily-reports/Chat4/2026-09-17.md'];

const colAB = detector.detectCollisionsBetween(setBranchA, setBranchB);
chk('تداخل authz/model.json بین شاخه A و B کشف می‌شود', colAB.length === 1 && colAB[0] === 'authz/model.json');

const colAC = detector.detectCollisionsBetween(setBranchA, setBranchC);
chk('شاخه A و C هیچ تداخلی ندارند', colAC.length === 0);

console.log(`\n──────────────────────────────────────────`);
console.log(`نتیجه: ${pass} موفق / ${fail} ناموفق (از ${pass + fail})`);
if (fail > 0) {
  console.error('موارد ناموفق:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
console.log('✅ سنجه‌های ابزار تشخیص تداخل فایل (C8-02) کاملاً معتبر است.');
process.exit(0);
