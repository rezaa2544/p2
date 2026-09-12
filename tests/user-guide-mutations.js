/* ═══════════════════════════════════════════════════════════════════
   تست جهش راهنمای کاربر (E.11) — اثبات اینکه tests/user-guide.js
   واقعاً کهنگی/بازگشتِ غلط را می‌گیرد (سبزِ جعلی ممنوع).
   هر جهش: نسخهٔ خراب‌شدهٔ USER_GUIDE.html در tmp ساخته می‌شود و
   انتظار می‌رود سوئیت قرمز شود.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const GUIDE = path.join(ROOT, 'USER_GUIDE.html');
const original = fs.readFileSync(GUIDE, 'utf8');

const mutations = [
  {
    name: 'عدد منوی مدیر کهنه شود (۴۷ → ۳۳)',
    mutate: (s) => s.replace(/[۰-۹]+ بخشِ منو/, '۳۳ بخشِ منو'),
  },
  {
    name: 'غلط تایپی «گمگ» برگردد',
    mutate: (s) => s.replace('انجمن و کمک‌ها', 'انجمن و گمگ‌ها'),
  },
  {
    name: 'فصل «تازه‌های سامانه» حذف شود',
    mutate: (s) => s.replace('id="whatsnew"', 'id="whatsnew-removed"'),
  },
  {
    name: 'بخش فنی توسعه‌دهنده برگردد',
    mutate: (s) => s.replace('</body>',
      '<section><h2>🔁 قاعدهٔ همگامی</h2><p>با node build.js بسازید</p></section></body>'),
  },
  {
    name: 'حساب دمو از جدول ورود حذف شود',
    mutate: (s) => s.replace('<code>parent_multi</code>', '<code>parent_gone</code>'),
  },
];

let killed = 0;
for (const m of mutations) {
  const mutated = m.mutate(original);
  if (mutated === original) {
    console.error('  ⚠️ جهش «' + m.name + '» اعمال نشد (الگو پیدا نشد)');
    continue;
  }
  fs.writeFileSync(GUIDE, mutated, 'utf8');
  let failedAsExpected = false;
  try {
    execFileSync('node', [path.join(ROOT, 'tests', 'user-guide.js')], { stdio: 'pipe' });
  } catch (e) {
    failedAsExpected = true;
  } finally {
    fs.writeFileSync(GUIDE, original, 'utf8');
  }
  if (failedAsExpected) { killed++; console.log('  🗡️ کشته شد: ' + m.name); }
  else console.error('  ❌ زنده ماند: ' + m.name);
}

/* راستی‌آزمایی: فایل به حالت اول برگشت */
const after = fs.readFileSync(GUIDE, 'utf8');
if (after !== original) {
  fs.writeFileSync(GUIDE, original, 'utf8');
  console.error('  ⚠️ فایل بازگردانده شد (restore ثانویه)');
}

const ok = killed === mutations.length;
console.log(`user-guide-mutations: ${killed}/${mutations.length} کشته؛ سبزِ نهایی: ${ok ? '✅' : '❌'}`);
process.exit(ok ? 0 : 1);
