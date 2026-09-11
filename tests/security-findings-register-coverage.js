#!/usr/bin/env node
/* security-findings-register-coverage.js — پوشش ثبت جامع یافته‌های امنیتی (چت ۶، مأموریت ۲۸) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'SECURITY_FINDINGS_REGISTER.md');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function grp(t) { console.log('▸ ' + t); }
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

chk('ثبت یافته‌ها وجود دارد', fs.existsSync(DOC));
const doc = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';

grp('۸ بخش اصلی');
[['۱', 'خلاصهٔ اجرایی'], ['۲', 'ثبت کامل یافته‌ها'], ['۳', 'خط زمانی'],
 ['۴', 'الگوهای تکرارشونده'], ['۵', 'توصیه‌های پیشگیری'], ['۶', 'خلاصهٔ راستی‌آزمایی'],
 ['۷', 'تحویل به تیم پنتست خارجی'], ['۸', 'اقلام باز']]
  .forEach(([num, title]) => chk('بخش ' + num + ': ' + title, doc.includes('## ' + num + '. ' + title)));

grp('شمارش و ستون‌ها');
const ids = new Set([...doc.matchAll(/\| اس‌اف-([۰-۹]+) \|/g)].map((m) => m[1]));
chk('حداقل ۲۵ یافته', ids.size >= 25, String(ids.size));
chk('ستون‌های ثبت: شناسه/تاریخ/شدت/حوزه/عنوان/منبع/ریشه/رفع/راستی‌آزمایی/وضعیت',
  doc.includes('| شناسه | تاریخ | شدت | حوزه | عنوان | منبع | ریشه | رفع (کامیت/مسیر) | راستی‌آزمایی | وضعیت |'));
chk('تفکیک شدت در خلاصه', doc.includes('پ0 (بحرانی)') && doc.includes('پ1 (بالا)') && doc.includes('پ2 (متوسط)') && doc.includes('پ3 (پایین'));
chk('تفکیک وضعیت در خلاصه', doc.includes('رفع‌شده با تست رگرسیون') && doc.includes('در انتظار راستی‌آزمایی'));
chk('تفکیک حوزه در خلاصه', ['همگام‌سازی', 'شبکه', 'کلاینت', 'دیتابیس', 'کش', 'مجوز', 'احراز', 'عملیات'].every((h) => doc.includes(h)));

grp('یافته‌های کلیدی ابلاغی');
[['۰۰۱', 'ساسپکت-الف'], ['۰۰۲', 'ساسپکت-ب'], ['۰۰۳', 'ساسپکت-ج'], ['۰۰۴', 'آر۹۷'], ['۰۰۵', 'ریت‌لیمیت'],
 ['۰۰۶', 'باگ-۳'], ['۰۰۷', 'باگ-۴'], ['۰۱۸', 'دبلیو۳-۱'], ['۰۱۹', 'دبلیو۳-۲'], ['۰۱۲', 'دبلیو۷-۱'],
 ['۰۲۸', 'اِی۰۱-سک'], ['۰۲۹', 'اِی۰۱-پار'], ['۰۳۰', 'اِی۰۱-پریو'], ['۰۲۱', 'انتساب انبوه'],
 ['۰۲۲', 'اچ‌پی‌پی'], ['۰۲۳', 'اس‌اس‌آر‌اف'], ['۰۲۴', 'هدر هاست'], ['۰۳۱', 'دی-باگ-۱'],
 ['۰۳۲', 'دی-باگ-۲'], ['۰۲۵', 'اس‌ام-پی۰-۱'], ['۰۲۶', 'اس‌ام-پی۰-۲'], ['۰۲۷', 'تومب‌ستون']]
  .forEach(([num, title]) => chk('یافتهٔ اس‌اف-' + num + ' (' + title + ')', doc.includes('اس‌اف-' + num) && doc.includes(title)));

grp('صداقت منبع و الگوها');
chk('برچسب «ابلاغی/بدون ردپا در کلون» وجود دارد', doc.includes('📋 ابلاغی') && doc.includes('بدون ردپا در این کلون'));
chk('الگوهای تکرارشونده جدول دارد', doc.includes('| الگو | یافته‌های مرتبط | درس |'));
chk('درس‌های کلیدی: دامنه، اتمی‌بودن، فال‌بک بی‌صدا', doc.includes('دامنهٔ نقش') && doc.includes('اتمی') && doc.includes('فال‌بک بی‌صدا'));
chk('توصیه: حسابرسی دامنه برای هر مسیر تازه', doc.includes('حسابرسی دامنه'));
chk('قرارداد پنتست: یافتهٔ شناخته‌شده جدید ثبت نمی‌شود', doc.includes('«یافتهٔ جدید» ثبت **نکنید**'));

grp('ارجاع‌ها و امنیت');
['SECURITY_INCIDENT_LOG.md', 'BUG_HUNT_REPORT.md', 'WAVE13_ASVS_AUDIT.md', 'SECRETS_MANAGEMENT.md',
 'THREAT_MODEL.md', 'PEN_TEST_CHECKLIST.md']
  .forEach((ref) => chk('ارجاع: ' + ref, doc.includes(ref)));
chk('هیچ رازی در ثبت نیست', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));

grp('جایگاه در کتابخانه');
chk('ردیف نمایه برای ثبت یافته‌ها وجود دارد', rd('docs/DOCS_INDEX.md').includes('SECURITY_FINDINGS_REGISTER.md'));
chk('دفتر رخدادهای امنیتی به ثبت ارجاع می‌دهد', rd('docs/SECURITY_INCIDENT_LOG.md').includes('SECURITY_FINDINGS_REGISTER'));
chk('چک‌لیست پنتست به ثبت ارجاع می‌دهد', rd('docs/PEN_TEST_CHECKLIST.md').includes('SECURITY_FINDINGS_REGISTER'));

console.log('');
console.log('نتیجه: ' + fa(pass) + ' موفق / ' + fa(fail) + ' ناموفق (از ' + fa(pass + fail) + ')');
console.log('شمار یافته‌ها: ' + fa(ids.size));
process.exit(fail ? 1 : 0);
