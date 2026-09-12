/* ═══════════════════════════════════════════════════════════════════
   تست راهنمای کاربر (E.11) — USER_GUIDE.html
   - عددِ «بخشِ منو»ی مدیر باید با NAV_EXPECT در tests/smoke.js یکی باشد
     (همان اشتباهی که ۳۳ را تا ۴۷ کهنه نگه داشت، دیگر بی‌صدا نمی‌ماند)
   - حساب‌های جدولِ «ورود» باید در دادهٔ دمو (02-demo-data.js یا server/data/payesh.json) باشند
   - غلط‌های تایپیِ شناخته‌شدهٔ گزارش G.3 نباید برگردند
   - بخشِ فنیِ توسعه‌دهنده («قاعدهٔ همگامی») نباید داخل راهنمای کاربر باشد
   - فصل «تازه‌های سامانه» باید باشد و ماژول‌های تازه را نام ببرد
   - مُهرِ بیلد (meta payesh-build) باید در head باشد
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const guide = fs.readFileSync(path.join(ROOT, 'USER_GUIDE.html'), 'utf8');
const smoke = fs.readFileSync(path.join(ROOT, 'tests', 'smoke.js'), 'utf8');
/* حساب‌های دمو: سیدِ کلاینت (02-demo-data.js) + دادهٔ سرور (payesh.json) —
   در معماری فعلی حساب‌ها در payesh.json زندگی می‌کنند */
const seed = fs.readFileSync(path.join(ROOT, 'src', 'js', '02-demo-data.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.error('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}

/* ۱. عدد منوی مدیر از NAV_EXPECT (منبع حقیقت) */
const navBlock = smoke.match(/const NAV_EXPECT = \{[\s\S]*?\n\};/);
check('NAV_EXPECT در tests/smoke.js پیدا شد', !!navBlock);
let managerCount = 0;
if (navBlock) {
  const m = navBlock[0].match(/manager: \[([^\]]*)\]/);
  managerCount = m ? m[1].match(/'[^']+'/g).length : 0;
}
check('شمار روت‌های مدیر > ۳۰ (سلامت پارس)', managerCount > 30, 'شمرده: ' + managerCount);

const faDigits = String(managerCount).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const menuRe = new RegExp('([۰-۹]+) بخشِ منو');
const gm = guide.match(menuRe);
check('راهنما عددِ «بخشِ منو» دارد', !!gm);
check(
  'عددِ منویِ مدیر در راهنما با NAV_EXPECT یکی است (' + faDigits + ')',
  !!gm && gm[1] === faDigits,
  gm ? 'راهنما: ' + gm[1] + ' ≠ کد: ' + faDigits : 'عدد پیدا نشد'
);

/* ۲. حساب‌های جدول ورود در سید دمو */
const accounts = ['superadmin', 'manager1', 'teacher1_1', 'student1',
  'parent_multi', 'counselor1', 'edu_kurdistan', 'driver1'];
for (const a of accounts) {
  const inGuide = guide.includes('<code>' + a + '</code>');
  const inSeed = seed.includes("'" + a + "'") || seed.includes('"' + a + '"');
  check('حساب «' + a + '» در راهنما و سیدِ دمو هست', inGuide && inSeed,
    (inGuide ? '' : 'در راهنما نیست؛ ') + (inSeed ? '' : 'در سید نیست'));
}

/* ۳. غلط‌های تایپی گزارش G.3 برنگشته باشند */
const typos = ['گمگ', 'روزهای گاری', 'روزهای گاریِ', 'نمرهٔ درش،', 'تراگنش', 'می‌گند'];
for (const t of typos) {
  check('غلط تایپی «' + t + '» در راهنما نیست', !guide.includes(t));
}

/* ۴. بخش فنی توسعه‌دهنده حذف شده باشد (مرجعش docs/AI_PROMPT.md است) */
check('سرفصل «قاعدهٔ همگامی» (فنی) داخل راهنمای کاربر نیست',
  !guide.includes('<h2>🔁 قاعدهٔ همگامی'));
check('فرمان‌های توسعه‌دهنده (node build.js / _shots.js) در متن راهنما نیست',
  !/node build\.js|_shots\.js/.test(guide.replace(/<!--[\s\S]*?-->/g, '')));

/* ۵. فصل «تازه‌های سامانه» و ماژول‌های تازه */
check('فصل «تازه‌های سامانه» (id=whatsnew) هست', guide.includes('id="whatsnew"'));
const mods = ['تیکت پشتیبانی', 'گزارش‌ساز', 'چندپایه', 'ارزشیابی ناشناس',
  'برنامهٔ هفتگی', 'کارآموزی', 'رفتاری دبستان', 'کارت امتیازی', 'سلامت مدرسه'];
for (const w of mods) {
  check('ماژول «' + w + '» در راهنما نام برده شده', guide.includes(w));
}
check('لینک منو به #whatsnew هست', guide.includes('href="#whatsnew"'));

/* ۶. مُهر بیلد */
check('مُهرِ بیلد (meta payesh-build) در head هست',
  /<meta name="payesh-build" content="[0-9a-f]{12}"/.test(guide.slice(0, 8192)));

/* ۷. گام‌های روز کاری مدیر */
check('بخش «یک روز کاری مدیر» هست', guide.includes('یک روز کاری مدیر'));

console.log('──────────────────────────────────────────');
console.log(`user-guide: ${pass} سبز / ${fail} قرمز ${fail === 0 ? '✅' : '❌'}`);
process.exit(fail === 0 ? 0 : 1);
