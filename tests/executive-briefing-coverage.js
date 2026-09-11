#!/usr/bin/env node
/* executive-briefing-coverage.js — پوشش بستهٔ خلاصهٔ تصمیم‌گیری مدیران (چت ۶، مأموریت ۳۳) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'EXECUTIVE_BRIEFING.md');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function grp(t) { console.log('▸ ' + t); }
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

chk('بستهٔ خلاصهٔ مدیریتی وجود دارد', fs.existsSync(DOC));
const doc = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';

grp('نه بخش اصلی');
[['۱', 'یک صفحه خلاصه'], ['۲', 'سرمایه‌گذاری و مزیت'], ['۳', 'راهبری فنی'],
 ['۴', 'ده تصمیم فوری'], ['۵', 'خط زمانی تا گو-لایو'], ['۶', 'شاخص‌های کلیدی موفقیت'],
 ['۷', 'پنج ریسک بحرانی برتر'], ['۸', 'توصیهٔ نهایی'], ['۹', 'پیوست']]
  .forEach(([num, title]) => chk('بخش ' + num + ': ' + title, doc.includes('## بخش ' + num + ': ' + title)));

grp('یک‌صفحه‌ای (One-Pager)');
const one = doc.slice(doc.indexOf('## بخش ۱'), doc.indexOf('## بخش ۲'));
const oneLines = one.split('\n').filter((l) => l.trim() !== '');
chk('حداکثر ۴۰ خط (' + fa(oneLines.length) + ')', oneLines.length <= 40, String(oneLines.length));
['پایش در یک نگاه', 'آمادگی فعلی', 'سه مانع اصلی', 'سه تصمیم فوری', 'خط زمانی پیشنهادی'].forEach((i) =>
  chk('آیتم یک‌صفحه‌ای: ' + i, one.includes(i)));
chk('اعداد آمادگی آمده (۹۲٪ فنی / ۷۰٪ اجرایی)', one.includes('۹۲٪') && one.includes('۷۰٪'));
chk('معیار مکمل ردیاب پ0 صادقانه آمده', one.includes('۴۳٪'));

grp('سرمایه‌گذاری و راهبری');
chk('ده موج کلیدی نام برده شده', (doc.match(/موج \d+|موج [۰-۹]+/g) || []).length >= 10);
['آفلاین-اول', 'راست‌به‌چپ', 'میزبانی'].forEach((m) => chk('مزیت: ' + m, doc.includes(m)));
chk('قید صداقت ظرفیت آمده', doc.includes('قید صداقت'));
['معماری', 'امنیت', 'قابلیت اطمینان', 'مقیاس‌پذیری'].forEach((g) =>
  chk('زیربخش راهبری: ' + g, doc.includes('**' + g)));

grp('ده تصمیم فوری');
const decSec = doc.slice(doc.indexOf('## بخش ۴'), doc.indexOf('## بخش ۵'));
const decRows = decSec.split('\n').filter((l) => /^\| [۰-۹0-9]+ \|/.test(l));
chk('جدول ده تصمیم کامل است (' + fa(decRows.length) + ' ردیف)', decRows.length === 10, String(decRows.length));
['میزبان', 'اینماد', 'مجوز آموزشی', 'پیامک', 'استعلام کد ملی', 'اقامت داده', 'پنتست خارجی'].forEach((d) =>
  chk('تصمیم: ' + d, decSec.includes(d)));
['هزینهٔ تخمینی', 'خط زمانی', 'تأثیر تأخیر'].forEach((c) => chk('ستون: ' + c, decSec.includes(c)));

grp('خط زمانی و کی‌پی‌آی');
const tlSec = doc.slice(doc.indexOf('## بخش ۵'), doc.indexOf('## بخش ۶'));
['تی−۶ ماه', 'تی−۴ ماه', 'تی−۳ ماه', 'تی−۲ ماه', 'تی−۱ ماه', 'تی−۰'].forEach((t) =>
  chk('نقطهٔ زمانی: ' + t, tlSec.includes(t)));
const kpiSec = doc.slice(doc.indexOf('## بخش ۶'), doc.indexOf('## بخش ۷'));
const kpiRows = kpiSec.split('\n').filter((l) => /^\| [^#\s-]/.test(l) && !/شاخص/.test(l));
chk('پنج کی‌پی‌آی (' + fa(kpiRows.length) + ' ردیف)', kpiRows.length === 5, String(kpiRows.length));
['۹۹.۵٪', '۳۰۰ میلی‌ثانیه', '۸۰٪', '۷۰٪', '۹۵٪'].forEach((k) => chk('هدف کی‌پی‌آی: ' + k, kpiSec.includes(k)));

grp('ریسک‌ها و توصیه');
const riskSec = doc.slice(doc.indexOf('## بخش ۷'), doc.indexOf('## بخش ۸'));
const riskRows = riskSec.split('\n').filter((l) => /^\| [^#\s-]/.test(l) && !/ریسک \|/.test(l));
chk('پنج ریسک برتر (' + fa(riskRows.length) + ' ردیف)', riskRows.length === 5, String(riskRows.length));
chk('بالاترین امتیاز رجیستر آمده (۲۰)', riskSec.includes('۲۰'));
const recSec = doc.slice(doc.indexOf('## بخش ۸'), doc.indexOf('## بخش ۹'));
['همین هفته', 'این ماه', 'مسئولیت‌ها'].forEach((r) => chk('توصیه: ' + r, recSec.includes(r)));

grp('پیوست و جایگاه در کتابخانه');
['IRAN_COMPLIANCE_PACKAGE.md', 'P0_BLOCKER_TRACKER.md', 'GO_LIVE_PACKAGE.md', 'NATIONAL_ARCHITECTURE.md',
 'CAPACITY_MODEL.md', 'PILOT_ROLLOUT_PLAN.md', 'RISK_REGISTER.md', 'RELEASE_NOTES.md'].forEach((r) =>
  chk('ارجاع به ' + r, doc.includes(r)));
chk('هیچ رازی در سند نیست', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));
chk('ردیف نمایه وجود دارد', rd('docs/DOCS_INDEX.md').includes('EXECUTIVE_BRIEFING.md'));
chk('نمایهٔ نقشه به بسته ارجاع می‌دهد', rd('docs/DOCUMENTATION_MAP.md').includes('EXECUTIVE_BRIEFING.md'));
chk('شروع سریع نمایه تصمیم‌گیران را هدایت می‌کند', rd('docs/DOCS_INDEX.md').includes('نخست برای تصمیم‌گیران'));

console.log('');
console.log('نتیجه: ' + fa(pass) + ' موفق / ' + fa(fail) + ' ناموفق (از ' + fa(pass + fail) + ')');
process.exit(fail ? 1 : 0);
