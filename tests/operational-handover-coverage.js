#!/usr/bin/env node
/* operational-handover-coverage.js — پوششِ بستهٔ تحویل عملیاتی (چت ۶، مأموریت ۲۳) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'OPERATIONAL_HANDOVER.md');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function grp(t) { console.log('▸ ' + t); }
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

chk('سند تحویل عملیاتی وجود دارد', fs.existsSync(DOC));
const doc = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';

grp('۱۲ بخش اصلی');
const sections = [
  ['۱', 'خلاصهٔ اجرایی'],
  ['۲', 'مرجع سریع On-Call'],
  ['۳', 'چک‌لیست عملیات روزانه'],
  ['۴', 'چک‌لیست عملیات هفتگی'],
  ['۵', 'چک‌لیست عملیات ماهانه'],
  ['۶', 'ماتریس دسترسی'],
  ['۷', 'چک‌لیست تحویل'],
  ['۸', 'برنامهٔ آموزش'],
  ['۹', 'ریسک‌های عملیاتی شناخته‌شده'],
  ['۱۰', 'فهرست تماس‌ها'],
  ['۱۱', 'مدیریت تغییر'],
  ['۱۲', 'موارد باز'],
];
sections.forEach(([num, title]) => chk('بخش ' + num + ': ' + title, doc.includes('## ' + num + '. ' + title)));

grp('محتوای بخش ۲ (مرجع سریع)');
chk('جدول پنج هشدار برتر (۵ ردیف عددی)', (doc.match(/\| [۱۲۳۴۵] \|/g) || []).length >= 5);
chk('هر هشدار اقدام فوری دارد', doc.includes('اقدام فوری'));
chk('نقطه‌های سلامت (جدول نشانی‌ها)', doc.includes('`GET /health`'));
chk('دستورات فوری (جدول دستورها)', doc.includes('ری‌استارت سرویس') && doc.includes('فیلاور'));
chk('جدول تشدید ۴ سطحی', doc.includes('جدول تشدید') && doc.includes('On-call شیفت') && doc.includes('مدیریت'));

grp('چک‌لیست‌های دوره‌ای');
chk('روزانه: صبح/ظهر/عصر/شب', ['صبح', 'ظهر', 'عصر', 'شب'].every((t) => doc.includes('| ' + t + ' |')));
chk('هفتگی: ۵ کار', ['مانور سبک بازیابی', 'چرخش لاگ', 'انقضای گواهی', 'روند ظرفیت', 'وصله‌های امنیتی'].every((t) => doc.includes(t)));
chk('ماهانه: ۴ کار', ['مانور کامل بازیابی', 'مانور فیلاور', 'بازنگری تنظیم هشدارها', 'بازنگری به‌روزرسانی مستندات'].every((t) => doc.includes(t)));

grp('ماتریس دسترسی و نقش‌ها');
['On-call', 'SRE', 'مدیر دیتابیس', 'امنیت'].forEach((role) => chk('نقش: ' + role, doc.includes(role)));
chk('ستون مدت اعتبار وجود دارد', doc.includes('مدت اعتبار'));
chk('اصل حداقل دسترسی', doc.includes('حداقل دسترسی'));

grp('ساختار جدولی و آموزش');
chk('جدول چک‌لیست تحویل (مورد/وضعیت/مسئول/تاریخ)', doc.includes('مورد | وضعیت | مسئول | تاریخ'));
chk('سه جلسهٔ آموزشی ۲ ساعته', (doc.match(/جلسهٔ [۱۲۳]:/g) || []).length === 3);
chk('ریسک‌ها با سه‌گانهٔ نشانه/تشخیص/اقدام', doc.includes('نشانه | تشخیص | اقدام'));

grp('ارجاع‌ها به پیش‌نیازها');
['PRODUCTION_RUNBOOK.md', 'INCIDENT_RESPONSE.md', 'DEPLOYMENT_GUIDE.md', 'OBSERVABILITY_LIVE_SETUP.md',
  'DISASTER_RECOVERY.md', 'DR_RUNBOOK.md', 'HA_POSTGRES.md', 'HA_REDIS.md', 'DOCUMENTATION_HANDOVER.md']
  .forEach((ref) => chk('ارجاع: ' + ref, doc.includes(ref)));

grp('امنیت بسته');
chk('هیچ رازی در بسته نیست (بدون الگوی توکن/کلید)', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));
chk('تصریح «هیچ گذرواژه‌ای در این بسته نیست»', doc.includes('هیچ گذرواژه'));
chk('ارجاع به مدیریت تغییر برای دسترسی', doc.includes('§۱۱') && doc.includes('§۶'));

grp('جایگاه در کتابخانه');
chk('ردیف نمایه برای تحویل عملیاتی وجود دارد', rd('docs/DOCS_INDEX.md').includes('OPERATIONAL_HANDOVER.md'));
chk('سند تحویل مستندات به این بسته ارجاع می‌دهد', rd('docs/DOCUMENTATION_HANDOVER.md').includes('OPERATIONAL_HANDOVER.md'));

console.log('');
console.log('نتیجه: ' + fa(pass) + ' موفق / ' + fa(fail) + ' ناموفق (از ' + fa(pass + fail) + ')');
process.exit(fail ? 1 : 0);
