#!/usr/bin/env node
/* glossary-coverage.js — پوشش واژه‌نامهٔ اصطلاحات پروژه (چت ۶، مأموریت ۲۷) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'GLOSSARY.md');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function grp(t) { console.log('▸ ' + t); }
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

chk('واژه‌نامه وجود دارد', fs.existsSync(DOC));
const doc = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';

grp('۸ بخش اصلی');
[['۱', 'مقدمه'], ['۲', 'اصطلاحات انگلیسی/فنی'], ['۳', 'اصطلاحات فارسی/پروژه'],
 ['۴', 'نقش‌ها و مسئولیت‌ها'], ['۵', 'مسیرها و نقاط ورودی'], ['۶', 'خانوادهٔ اِس‌اِل‌او'],
 ['۷', 'اصطلاحات امنیتی'], ['۸', 'اصطلاحات معماری']]
  .forEach(([num, title]) => chk('بخش ' + num + ': ' + title, doc.includes('## ' + num + '. ' + title)));

grp('شمارش مدخل‌ها');
const seg = (start, end) => {
  const a = doc.indexOf(start), b = doc.indexOf(end, a + 1);
  return (a >= 0 && b > a) ? doc.slice(a, b) : '';
};
const enSec = seg('## ۲.', '## ۳.');
const faSec = seg('## ۳.', '## ۴.');
const enCount = (enSec.match(/^\| \*\*/gm) || []).length;
const faCount = (faSec.match(/^\| \*\*/gm) || []).length;
chk('حداقل ۸۰ مدخل انگلیسی/فنی', enCount >= 80, String(enCount));
chk('حداقل ۴۰ مدخل فارسی/پروژه', faCount >= 40, String(faCount));
chk('ستون‌های مدخل انگلیسی: اصطلاح/تلفظ/فارسی/تعریف/ارجاع', enSec.includes('| اصطلاح | تلفظ | فارسی | تعریف | ارجاع |'));

grp('مدخل‌های کلیدی ابلاغی (انگلیسی)');
['ADR', 'A01', 'ASVS', 'BOLA', 'CDN', 'CI/CD', 'CSP', 'CSRF', 'DAST', 'DLQ', 'DLP', 'DSR', 'DTO',
 'FK', 'GDPR', 'HA', 'HNSW', 'HPP', 'HSTS', 'IDOR', 'IDB', 'JWT', 'LB', 'LRU', 'MFA', 'MTTD',
 'MTTR', 'OCC', 'OIDC', 'OTel', 'OTP', 'PITR', 'PK', 'RACI', 'RBAC', 'RC', 'REST', 'RLS', 'RPO',
 'RTO', 'SAST', 'SBOM', 'SCA', 'SDK', 'SLI', 'SLO', 'SMS', 'SSRF', 'SSE', 'TLS', 'TPS', 'TTX',
 'ULID', 'UUID', 'WAF', 'XSS']
  .forEach((t) => chk('مدخل: ' + t, doc.includes('**' + t + '**') || doc.includes('**' + t.split(' ')[0])));

grp('مدخل‌های فارسی کلیدی');
['پایش', 'تیکت', 'مانور (دریل)', 'صورت‌جلسه', 'شاخص سلامت', 'ارزشیابی', 'پیش‌ثبت‌نام', 'همگام‌سازی', 'کارنامه', 'آزمون بار']
  .forEach((t) => chk('مدخل فارسی: ' + t, faSec.includes('**' + t + '**')));

grp('نقش‌ها و مسیرها');
['asli', 'bargashte', 'bmkala', 'payesh.test1', 'nandr7079', 'Documentarian', 'Merge Queue Manager', 'Ruflo']
  .forEach((r) => chk('نقش: ' + r, doc.includes(r)));
chk('مسیرهای ورودی: مخزن + حافظهٔ روفلو + مهارت‌ها + نمایه',
  doc.includes('github.com/rezaa2544/p2') && doc.includes('/tmp/ruflo-unified') &&
  doc.includes('SKILLS_MASTER.md') && doc.includes('docs/DOCS_INDEX.md'));

grp('خانوادهٔ اِس‌اِل‌او و امنیت و معماری');
['SLO', 'SLI', 'RPO', 'RTO', 'MTTD', 'MTTR', 'TTX'].forEach((t) => chk('§۶: ' + t, doc.includes('**' + t + '**')));
['XSS', 'CSRF', 'SQLi', 'SSRF', 'HPP', 'IDOR', 'BOLA', 'Mass Assignment', 'Session Fixation', 'Open Redirect', 'XXE', 'JWT alg=none']
  .forEach((t) => chk('§۷: ' + t, doc.includes('**' + t)));
['Stateless', 'Source of Truth', 'Tombstone', 'Delta Sync', 'Cursor Pagination', 'OCC', 'Outbox Pattern', 'Read Replica', 'Partitioning', 'Connection Pooling']
  .forEach((t) => chk('§۸: ' + t, doc.includes('**' + t)));

grp('امنیت و جایگاه در کتابخانه');
chk('هیچ رازی در واژه‌نامه نیست', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));
chk('ردیف نمایه برای واژه‌نامه وجود دارد', rd('docs/DOCS_INDEX.md').includes('GLOSSARY.md'));
chk('آنبوردینگ به واژه‌نامه ارجاع می‌دهد', rd('docs/ONBOARDING_NEW_DEVELOPER.md').includes('GLOSSARY'));
chk('پرسش‌وپاسخ به واژه‌نامه ارجاع می‌دهد', rd('docs/FAQ.md').includes('GLOSSARY'));

console.log('');
console.log('نتیجه: ' + fa(pass) + ' موفق / ' + fa(fail) + ' ناموفق (از ' + fa(pass + fail) + ')');
console.log('شمارش نهایی: انگلیسی ' + fa(enCount) + ' · فارسی ' + fa(faCount));
process.exit(fail ? 1 : 0);
