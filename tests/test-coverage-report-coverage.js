#!/usr/bin/env node
/* test-coverage-report-coverage.js — پوشش گزارش جامع تست‌ها (چت ۶، مأموریت ۲۹) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'TEST_COVERAGE_REPORT.md');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function grp(t) { console.log('▸ ' + t); }
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

chk('گزارش پوشش تست وجود دارد', fs.existsSync(DOC));
const doc = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';

grp('بخش‌های اصلی');
[['۱', 'خلاصهٔ اجرایی'], ['۲', 'فهرست کامل بر اساس دسته'], ['۳', 'پوشش به تفکیک حوزه'],
 ['۴', 'گیت‌های اجباری انتشار'], ['۵', 'روش‌شناسی'], ['۶', 'شکاف‌ها و کارهای باقی‌مانده'],
 ['۷', 'راهنمای اجرا']]
  .forEach(([num, title]) => chk('بخش ' + num + ': ' + title, doc.includes('## ' + num + '. ' + title)));

grp('راستی‌آزمایی زندهٔ شمارش‌ها');
const rootTests = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.js'));
const apiTests = fs.readdirSync(path.join(ROOT, 'tests', 'api')).filter((f) => f.endsWith('.js'));
const total = rootTests.length + apiTests.length;
chk('ادعای سند با دیسک یکی است (' + fa(total) + ' فایل)', doc.includes('**' + fa(total) + '**'), String(total));
chk('شمار ریشه در سند آمده (' + fa(rootTests.length) + ')', doc.includes(fa(rootTests.length)), String(rootTests.length));
chk('شمار ای‌پی‌آی در سند آمده', doc.includes('tests/api/'));
chk('دود ۵۴۷ موردی ذکر شده', doc.includes('۵۴۷/۵۴۷'));
chk('اسکن راز ۱۱/۱۱ ذکر شده', doc.includes('۱۱/۱۱'));
chk('رانر کامل ذکر شده', doc.includes('scripts/run-all-tests.sh'));
chk('دروازهٔ انتشار ذکر شده', doc.includes('tools/release-gate.js'));

grp('دسته‌های یازده‌گانه');
['دامنهٔ کاربردی', 'جهش', 'پوشش مستندات', 'موجی/آرنا', 'همگام‌سازی/آفلاین', 'امنیت/احراز',
 'کش/ردیس', 'واحد/یکپارچگی', 'حکمرانی مستندات', 'دود', 'کارایی']
  .forEach((c) => chk('دسته: ' + c, doc.includes(c)));

grp('محتوای کیفی');
const gateSec = doc.slice(doc.indexOf('## ۴'), doc.indexOf('## ۵'));
chk('جدول گیت‌ها کامل است (۸ گیت)', (gateSec.match(/^\| /gm) || []).length === 9);
chk('روش تست-اول-قرمز آمده', doc.includes('تست-اول-قرمز'));
chk('ارجاع به ثبت یافته‌های امنیتی', doc.includes('SECURITY_FINDINGS_REGISTER.md'));
chk('ارجاع به گزارش باگ‌هانت', doc.includes('BUG_HUNT_REPORT.md'));
chk('شکاف‌ها صادقانه‌اند (پنتست/بار/ای۲ئی)', doc.includes('دی‌ای‌اس‌تی') && doc.includes('[TBD]') && doc.includes('پیلوت'));

grp('امنیت و جایگاه در کتابخانه');
chk('هیچ رازی در گزارش نیست', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));
chk('ردیف نمایه برای گزارش پوشش تست وجود دارد', rd('docs/DOCS_INDEX.md').includes('TEST_COVERAGE_REPORT.md'));

console.log('');
console.log('نتیجه: ' + fa(pass) + ' موفق / ' + fa(fail) + ' ناموفق (از ' + fa(pass + fail) + ')');
process.exit(fail ? 1 : 0);
