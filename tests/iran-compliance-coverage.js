#!/usr/bin/env node
/* iran-compliance-coverage.js — پوششِ بستهٔ انطباق قانونی ایران (چت ۶، مأموریت ۲۰) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'IRAN_COMPLIANCE_PACKAGE.md');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function grp(t) { console.log('▸ ' + t); }

chk('سند بستهٔ انطباق وجود دارد', fs.existsSync(DOC));
const doc = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';

grp('بخش ۱ — ساختار دوازده‌بخشی');
const sections = ['خلاصهٔ مدیریتی', 'اینماد', 'مجوز نرم‌افزار آموزشی', 'میزبانی داده در ایران',
  'درگاه پیامک', 'استعلام کد ملی', 'حساب انتشار اپ اندروید', 'حریم خصوصی و جی‌دی‌پی‌آر',
  'چک‌لیست نهایی انطباق', 'خط زمانی تا گو-لایو', 'دفتر ثبت تصمیم‌ها', 'دفتر ریسک‌های انطباق'];
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
sections.forEach((s, i) => chk('بخش ' + (i + 1) + ': ' + s, doc.includes('بخش ' + fa(i + 1) + ': ' + s)));

grp('بخش ۲ — محتوای کلیدی');
chk('هفت محور اصلی در خلاصه', doc.includes('۷ محور اصلی'));
chk('مسئول = کارفرما', doc.includes('کارفرما'));
chk('دامنهٔ .ir الزام اینماد است', doc.includes('.ir'));
chk('اعتبار یک‌سالهٔ اینماد', doc.includes('۱ سال'));
chk('مرکز توسعه تجارت الکترونیکی', doc.includes('مرکز توسعه تجارت الکترونیکی'));
chk('مدارک مورد نیاز اینماد فهرست شده', doc.includes('مدارک مورد نیاز'));
chk('الزام‌های سرویس پیامکی (پنل + خط خدماتی)', doc.includes('خط خدماتی'));
chk('الزام سازمان تنظیم مقررات برای پیامک', doc.includes('سازمان تنظیم مقررات'));
chk('مسیر ثبت احوال برای استعلام', doc.includes('سازمان ثبت احوال'));
chk('دادهٔ استعلام هش‌شده نگهداری می‌شود', doc.includes('هش شده'));
chk('جایگزین‌های داخلی گوگل‌پلی', doc.includes('کافه‌بازار') && doc.includes('مایکت'));
chk('هزینهٔ ۲۵ دلاری گوگل‌پلی + ریسک تحریم', doc.includes('۲۵ دلار') && doc.includes('تحریم'));
chk('جی‌دی‌پی‌آر برای ایرانِ صرف = ان‌ای', doc.includes('N/A'));
chk('ارجاع به حاکمیت دادهٔ چت ۱', doc.includes('DATA_GOVERNANCE.md'));
chk('ارجاع به شکاف مدیریت راز', doc.includes('SECRETS_MANAGEMENT.md'));

grp('بخش ۳ — چک‌لیست و فرایندها');
const checklistRows = doc.match(/^\| [۰-۹0-9]+ \|.*\|.*\|.*\|.*\|$/gm) || [];
chk('دست‌کم ۱۲ ردیف چک‌لیست', checklistRows.length >= 12, String(checklistRows.length));
chk('چهار گزینهٔ میزبان داخلی', ['ابر آروان', 'پارس‌پک', 'ایران‌سرور', 'افرانت'].every((h) => doc.includes(h)));
chk('ارائه‌دهندگان پیامک', ['کاوه‌نگار', 'ملی‌پیامک', 'فراز'].every((h) => doc.includes(h)));
chk('خط زمانی تی-۶ تا تی-۰', ['تی−۶ ماه', 'تی−۴ ماه', 'تی−۳ ماه', 'تی−۲ ماه', 'تی−۱ ماه', 'تی−۰'].every((t) => doc.includes(t)));
chk('ستون تصمیم کارفرما در ثبت تصمیم‌ها', doc.includes('تصمیم کارفرما'));
chk('هفت تصمیم (دی-۱ تا دی-۷)', [1, 2, 3, 4, 5, 6, 7].every((n) => doc.includes('دی-' + '۱۲۳۴۵۶۷'[n - 1])));
chk('ریسک تأخیر اینماد', doc.includes('تأخیر صدور اینماد'));
chk('ریسک رد مجوز آموزشی', doc.includes('رد درخواست مجوز آموزشی'));
chk('ریسک تحریم گوگل‌پلی', doc.includes('تحریم گوگل‌پلی'));
chk('هر ریسک کاهش دارد (ستون کاهش ریسک)', doc.includes('کاهش ریسک'));

grp('بخش ۴ — ارجاع‌های زنده');
chk('ارجاع به بستهٔ گو-لایو', doc.includes('GO_LIVE_PACKAGE.md'));
chk('ارجاع به ردیاب پ0', doc.includes('P0_BLOCKER_TRACKER.md'));
chk('ارجاع به دیکشنری داده', doc.includes('DATA_DICTIONARY.md'));
chk('ارجاع به معماری ملی', doc.includes('NATIONAL_ARCHITECTURE.md'));
chk('ارجاع به طرح پایلوت', doc.includes('PILOT_ROLLOUT_PLAN.md'));
chk('هر چهار سند مرجع فیزیکی ارجاع‌شده وجود دارند', ['GO_LIVE_PACKAGE.md', 'P0_BLOCKER_TRACKER.md', 'DATA_DICTIONARY.md', 'NATIONAL_ARCHITECTURE.md', 'PILOT_ROLLOUT_PLAN.md', 'SECURITY_MODEL.md', 'RELEASE_NOTES.md'].every((f) => fs.existsSync(path.join(ROOT, 'docs', f))));
chk('ردیف نمایه برای بستهٔ انطباق وجود دارد', fs.readFileSync(path.join(ROOT, 'docs', 'DOCS_INDEX.md'), 'utf8').includes('IRAN_COMPLIANCE_PACKAGE.md'));

console.log('');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
