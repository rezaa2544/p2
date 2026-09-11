#!/usr/bin/env node
/* user-guides-coverage.js — پوشش راهنماهای نقش‌محور کاربران نهایی (چت ۶، مأموریت ۲۶) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'docs', 'user-guides');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function grp(t) { console.log('▸ ' + t); }
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

chk('پوشهٔ راهنماهای کاربر وجود دارد', fs.existsSync(DIR));

const GUIDES = [
  ['MANAGER_GUIDE.md', 'مدیر مدرسه', ['ثبت‌نام', 'کلاس', 'دبیران', 'گزارش', 'اطلاعیه', 'کتابخانه', 'اموال']],
  ['TEACHER_GUIDE.md', 'دبیر', ['حضور و غیاب', 'نمرات', 'پیام به والدین', 'برنامه', 'نمرات پایانی', 'فوق‌برنامه']],
  ['PARENT_GUIDE.md', 'ولی', ['نمرات', 'حضور', 'اطلاعیه', 'پیام به دبیر', 'کارنامه', 'پرداخت']],
  ['STUDENT_GUIDE.md', 'دانش‌آموز', ['برنامهٔ هفتگی', 'نمرات', 'حضور', 'کتابخانه', 'امتیاز', 'تکالیف']],
  ['STAFF_GUIDE.md', 'کارکنان', ['مراجع', 'اموال', 'خوابگاه', 'مشاور', 'گزارش']],
];

const SECTIONS = [
  ['مقدمه', /## ۱\. مقدمه/],
  ['ورود', /## ۲\. ورود/],
  ['کارهای روزمره', /## ۳\. کارهای روزمره/],
  ['پرسش‌های متداول', /## ۴\. پرسش‌های متداول/],
  ['مشکلات متداول', /## ۵\. مشکلات متداول/],
  ['تماس با پشتیبانی', /## ۶\. تماس با پشتیبانی/],
];

grp('ساختار شش‌بخشی هر ۵ راهنما');
GUIDES.forEach(([file, role]) => {
  const p = path.join(DIR, file);
  const exists = fs.existsSync(p);
  chk(file + ' وجود دارد', exists);
  if (!exists) return;
  const doc = fs.readFileSync(p, 'utf8');
  chk(file + ' عنوان نقش دارد', doc.includes('# راهنمای کاربر نهایی'));
  SECTIONS.forEach(([title, re]) => chk(file + ' بخش «' + title + '»', re.test(doc)));
  chk(file + ' ورود با کد یک‌بارمصرف', doc.includes('کد یک‌بارمصرف'));
});

grp('محتوای نقش‌محور');
GUIDES.forEach(([file, role, keys]) => {
  const p = path.join(DIR, file);
  if (!fs.existsSync(p)) return;
  const doc = fs.readFileSync(p, 'utf8');
  keys.forEach((k) => chk(file + ' پوشش «' + k + '»', doc.includes(k)));
});
const parent = fs.existsSync(path.join(DIR, 'PARENT_GUIDE.md')) ? rd('docs/user-guides/PARENT_GUIDE.md') : '';
chk('قید صادقانهٔ پرداخت (پیاده‌سازی‌نشده)', parent.includes('فعال **نیست**'));
const student = fs.existsSync(path.join(DIR, 'STUDENT_GUIDE.md')) ? rd('docs/user-guides/STUDENT_GUIDE.md') : '';
chk('قید صادقانهٔ تکالیف (پیاده‌سازی‌نشده)', student.includes('فعال **نیست**'));
const manager = fs.existsSync(path.join(DIR, 'MANAGER_GUIDE.md')) ? rd('docs/user-guides/MANAGER_GUIDE.md') : '';
chk('پرسش‌وپاسخ کافی در راهنمای مدیر (≥۷)', (manager.match(/^\d+\. \*\*/gm) || []).length >= 7 || (manager.match(/\*\*[^*]+\*\*/g) || []).length >= 10);

grp('امنیت و جایگاه در کتابخانه');
const allText = GUIDES.map(([f]) => fs.existsSync(path.join(DIR, f)) ? rd('docs/user-guides/' + f) : '').join('\n');
chk('هیچ رازی در راهنماها نیست', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(allText));
chk('هیچ دادهٔ شخصی واقعی در راهنماها نیست', !/کد ملی[:\s]*\d{10}/.test(allText));
chk('ردیف نمایه برای راهنماهای کاربر وجود دارد', rd('docs/DOCS_INDEX.md').includes('user-guides'));
chk('برنامهٔ پایلوت به راهنماها ارجاع می‌دهد', rd('docs/PILOT_ROLLOUT_PLAN.md').includes('user-guides'));
chk('بستهٔ تحویل مستندات بستهٔ کاربران نهایی دارد', rd('docs/DOCUMENTATION_HANDOVER.md').includes('user-guides'));

console.log('');
console.log('نتیجه: ' + fa(pass) + ' موفق / ' + fa(fail) + ' ناموفق (از ' + fa(pass + fail) + ')');
process.exit(fail ? 1 : 0);
