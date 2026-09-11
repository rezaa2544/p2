#!/usr/bin/env node
/* performance-benchmarks-coverage.js — پوششِ گزارش تجمیعی بنچمارک‌های عملکرد (چت ۶، مأموریت ۲۴) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'PERFORMANCE_BENCHMARKS.md');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function grp(t) { console.log('▸ ' + t); }
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

chk('سند بنچمارک‌ها وجود دارد', fs.existsSync(DOC));
const doc = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';

grp('۱۰ بخش اصلی');
const sections = [
  ['۱', 'خلاصهٔ اجرایی'],
  ['۲', 'عملکرد سمت کلاینت'],
  ['۳', 'عملکرد سمت سرور'],
  ['۴', 'عملکرد دیتابیس'],
  ['۵', 'عملکرد همگام‌سازی'],
  ['۶', 'معیارهای پایایی'],
  ['۷', 'نتایج آزمون بار (مدل)'],
  ['۸', 'انطباق اس‌ال‌او'],
  ['۹', 'گلوگاه‌های شناسایی‌شده'],
  ['۱۰', 'محدودیت‌ها و اندازه‌گیری‌های آینده'],
];
sections.forEach(([num, title]) => chk('بخش ' + num + ': ' + title, doc.includes('## ' + num + '. ' + title)));

grp('اعداد کلیدی کلاینت (موج ۱۲)');
chk('V4: ۷۱۰ به ۱۹ (۳۵ برابر)', doc.includes('۷۱۰ms') && doc.includes('۱۹ms') && doc.includes('۳۵×'));
chk('V3: ۵۱۷ به ۱۸.۷ (۲۸ برابر)', doc.includes('۵۱۷ms') && doc.includes('۱۸.۷ms') && doc.includes('۲۸×'));
chk('B1: ۷.۶ ثانیه به ۵۸۶ (۱۲ برابر)', doc.includes('۷.۶ ثانیه') && doc.includes('۵۸۶ms') && doc.includes('۱۲×'));
chk('p99 رندر: ۷۷۷ به ۳۸.۵ (۲۰ برابر)', doc.includes('۷۷۷ms') && doc.includes('۳۸.۵ms') && doc.includes('۲۰×'));
chk('V5 بدون رگرسیون', doc.includes('viewLeaves'));

grp('اعداد سرور و دیتابیس');
chk('بلاک پشتیبان‌گیری: ۴۶ به ۰.۶ میلی‌ثانیه', doc.includes('۴۶ms') && doc.includes('۰.۶ms'));
chk('نمره‌ها ۷۲۰ هزار ردیف: ۱۰۵ به ۰.۲۱۹ (۴۸۰ برابر)', doc.includes('۱۰۵ms') && doc.includes('۰.۲۱۹ms') && doc.includes('۴۸۰×'));
chk('خط‌مبنای ملی با قید محیط جی‌سان', doc.includes('جی‌سان فال‌بک'));

grp('پایایی و ظرفیت');
chk('فیلاور پستگرس: ۰.۲۲ ثانیه', doc.includes('۰.۲۲ ثانیه'));
chk('فیلاور ردیس: ۲.۰ دستی / ۶.۵ خودکار', doc.includes('۲.۰ ثانیه') && doc.includes('۶.۵ ثانیه'));
chk('پی‌آی‌تی‌آر: سقف ۵ دقیقه و ۲۶۰ بازیابی', doc.includes('۲۶۰ms'));
chk('مدل: ۲۰ هزار آراس‌پی + ۸۳۳ ورود + ۲۵۰۰ نوشتن', doc.includes('۲۰٬۰۰۰') && doc.includes('۸۳۳') && doc.includes('۲٬۵۰۰'));

grp('انطباق اس‌ال‌او و صداقت');
chk('اهداف اس‌ال‌او: صدک ۵۰/۹۵/۹۹ و خطا', doc.includes('<۱۰۰ms') && doc.includes('<۳۰۰ms') && doc.includes('<۰.۱٪'));
chk('ستون مشاهده برای تولید خالی/در انتظار است', doc.includes('نیازمند استیجینگ'));
chk('برچسب‌های دسته‌بندی (اندازه‌گیری/گزارش موج/مدل)', doc.includes('📏') && doc.includes('📋') && doc.includes('🧮'));
chk('قید نبود سند اصلی موج ۱۲/۱۶ در کتابخانه', doc.includes('در کتابخانهٔ فعلی موجود نیست'));
chk('قالب نتایج آزمون بار هنوز پر نشده', doc.includes('[TBD]'));

grp('ارجاع‌ها به منابع');
['WAVE9_PERFORMANCE.md', 'WAVE14_OBSERVABILITY.md', 'WAVE3_QUERY_PERFORMANCE.md', 'CAPACITY_MODEL.md',
  'WAVE18_LOAD_TEST_PLAN.md', 'LOAD_TEST_RESULTS.md', 'LOAD_TESTING_PLAN.md', 'DR_RUNBOOK.md',
  'NATIONAL_BASELINE_PART3.md', 'CLIENT_CAPACITY.md', 'PRODUCTION_READINESS_CHECKLIST.md']
  .forEach((ref) => chk('ارجاع: ' + ref, doc.includes(ref)));

grp('امنیت و جایگاه در کتابخانه');
chk('هیچ رازی در سند نیست', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));
chk('ردیف نمایه برای بنچمارک‌ها وجود دارد', rd('docs/DOCS_INDEX.md').includes('PERFORMANCE_BENCHMARKS.md'));
chk('مدل ظرفیت به این سند ارجاع می‌دهد', rd('docs/CAPACITY_MODEL.md').includes('PERFORMANCE_BENCHMARKS.md'));

console.log('');
console.log('نتیجه: ' + fa(pass) + ' موفق / ' + fa(fail) + ' ناموفق (از ' + fa(pass + fail) + ')');
process.exit(fail ? 1 : 0);
