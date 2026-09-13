#!/usr/bin/env node
/* risk-register-coverage.js — پوشش سند ثبت جامع ریسک‌ها (چت ۶، مأموریت ۳۰) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'RISK_REGISTER.md');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function grp(t) { console.log('▸ ' + t); }
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

chk('سند رجیستر ریسک وجود دارد', fs.existsSync(DOC));
const doc = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';

grp('نه بخش اصلی');
[['۱', 'خلاصهٔ اجرایی'], ['۲', 'ماتریس ریسک'], ['۳', 'رجیستر کامل'],
 ['۴', 'ده ریسک بحرانی برتر'], ['۵', 'راهبرد پاسخ به ریسک'], ['۶', 'پایش و بازبینی'],
 ['۷', 'رویدادهای ریسک تاریخی'], ['۸', 'بیانیهٔ اشتهاپذیری ریسک'], ['۹', 'یکپارچگی با رجیسترهای دیگر']]
  .forEach(([num, title]) => chk('بخش ' + num + ': ' + title, doc.includes('## بخش ' + num + ': ' + title)));

grp('شمارش ریسک‌ها');
const riskIds = [...new Set((doc.match(/RISK-[TSLFOHE]-\d{3}/g) || []))];
chk('حداقل ۳۰ ریسک ثبت شده (' + fa(riskIds.length) + ' آیدی یکتا)', riskIds.length >= 30, String(riskIds.length));
const cats = { T: 'فنی', S: 'امنیتی', L: 'قانونی', F: 'مالی', O: 'عملیاتی', H: 'منابع انسانی', E: 'وابستگی خارجی' };
Object.entries(cats).forEach(([c, name]) => {
  const n = riskIds.filter((id) => id.startsWith('RISK-' + c + '-')).length;
  chk('دستهٔ ' + name + ' (' + c + ') حداقل ۲ ریسک دارد (' + fa(n) + ')', n >= 2, String(n));
});
const regSec = doc.slice(doc.indexOf('## بخش ۳'), doc.indexOf('## بخش ۴'));
const regRows = [...new Set((regSec.match(/RISK-[TSLFOHE]-\d{3}/g) || []))];
chk('رجیستر کامل همهٔ ریسک‌ها را دارد (' + fa(regRows.length) + ' = ' + fa(riskIds.length) + ')', regRows.length === riskIds.length);

grp('سازگاری خلاصهٔ اجرایی با رجیستر');
chk('تعداد کل در خلاصه با رجیستر یکی است', doc.includes('**' + fa(riskIds.length) + '**'), String(riskIds.length));
const scores = {};
const tableLines = regSec.split('\n').filter((l) => l.startsWith('| RISK-'));
tableLines.forEach((l) => {
  const m = l.match(/\| (RISK-[TSLFOHE]-\d{3}) \|.*\| \*\*([۰-۹0-9]+)\*\* \|/);
  if (m) {
    const toEn = (s) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    scores[m[1]] = Number(toEn(m[2]));
  }
});
chk('همهٔ ردیف‌های رجیستر امتیاز دارند (' + fa(Object.keys(scores).length) + ')', Object.keys(scores).length === regRows.length);
const criticals = Object.entries(scores).filter(([, s]) => s >= 15).map(([id]) => id);
chk('ادعای تعداد بحرانی با محاسبه یکی است (' + fa(criticals.length) + ')', doc.includes(fa(criticals.length) + ' ریسک**') || doc.includes('**' + fa(criticals.length) + '**'), String(criticals.length));
chk('هر بحرانی در رجیستر امتیاز ≥ ۱۵ دارد', criticals.every((id) => scores[id] >= 15));

grp('ماتریس ۵×۵');
const matSec = doc.slice(doc.indexOf('## بخش ۲'), doc.indexOf('## بخش ۳'));
const matRows = matSec.split('\n').filter((l) => /^\| (بسیار کم|کم|متوسط|زیاد|بسیار زیاد) \(/.test(l));
chk('ماتریس ۵ ردیف احتمال دارد (' + fa(matRows.length) + ')', matRows.length === 5, String(matRows.length));
chk('سرستون‌های تأثیر پنچ‌گانه است', matSec.includes('بسیار کم (۱)') && matSec.includes('بحرانی (۵)'));
let matSum = 0;
const toEn = (s) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
matRows.forEach((l) => {
  let m;
  const re = /\*\*([۰-۹0-9]+)\*\*/g;
  while ((m = re.exec(l)) !== null) matSum += Number(toEn(m[1]));
});
chk('جمع خانه‌های ماتریس = تعداد ریسک‌ها (' + fa(matSum) + ')', matSum === riskIds.length, String(matSum));

grp('ده ریسک برتر');
const topSec = doc.slice(doc.indexOf('## بخش ۴'), doc.indexOf('## بخش ۵'));
const topTable = topSec.split('\n').filter((l) => /^\| [۰-۹0-9]+ \| RISK-/.test(l));
chk('جدول ده‌تای اول کامل است (' + fa(topTable.length) + ' ردیف)', topTable.length === 10, String(topTable.length));
const deepSecs = (topSec.match(/### ۴\.[۰-۹0-9]+ — RISK-[TSLFOHE]-\d{3}/g) || []);
chk('تحلیل عمیق برای هر ده ریسک (' + fa(deepSecs.length) + ')', deepSecs.length === 10, String(deepSecs.length));
['محرک (trigger)', 'نشانه‌های هشدار اولیه', 'پلن ای', 'پلن بی', 'پلن سی', 'مالک و تشدید'].forEach((f) => {
  const cnt = (topSec.split(f).length - 1);
  chk('فیلد «' + f + '» ده بار آمده', cnt === 10, String(cnt));
});

grp('راهبردها و پایش');
['اجتناب (Avoid)', 'کاهش (Mitigate)', 'انتقال (Transfer)', 'پذیرش (Accept)'].forEach((s) =>
  chk('راهبرد: ' + s, doc.includes('**' + s + '**')));
chk('فرکانس بازبینی هفتگی و ماهانه آمده', doc.includes('هفتگی') && doc.includes('ماهانه'));
chk('مسئول به‌روزرسانی مشخص است', doc.includes('مسئول به‌روزرسانی سند'));

grp('درس‌آموخته‌های تاریخی');
['ریست', 'باگ پنجشنبه', 'روفلو', 'ریبیس'].forEach((h) =>
  chk('رویداد تاریخی: ' + h, doc.includes(h)));

grp('خط قرمزها و یکپارچگی');
['چهار امضا', 'اقامت داده', 'برنامهٔ بازگشت'].forEach((rl) =>
  chk('خط قرمز: ' + rl, doc.includes(rl)));
['P0_BLOCKER_TRACKER.md', 'SECURITY_FINDINGS_REGISTER.md', 'IRAN_COMPLIANCE_PACKAGE.md', 'GO_LIVE_PACKAGE.md', 'CAPACITY_MODEL.md', 'DISASTER_RECOVERY.md', 'OPERATIONAL_HANDOVER.md'].forEach((ref) =>
  chk('ارجاع به ' + ref, doc.includes(ref)));

grp('امنیت و جایگاه در کتابخانه');
chk('هیچ رازی در سند نیست', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));
chk('ردیف نمایه برای رجیستر ریسک وجود دارد', rd('docs/DOCS_INDEX.md').includes('RISK_REGISTER.md'));

console.log('');
console.log('نتیجه: ' + fa(pass) + ' موفق / ' + fa(fail) + ' ناموفق (از ' + fa(pass + fail) + ')');
process.exit(fail ? 1 : 0);
