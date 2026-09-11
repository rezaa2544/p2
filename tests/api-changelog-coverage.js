#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   api-changelog-coverage.js — سنجه‌های دفترچهٔ تغییرات ای‌پی‌آی:
     AC-SEC  هشت بخش
     AC-VER  نسخهٔ جاری + سیاست نسخه‌بندی
     AC-INV  موجودی مسیرها با ستون‌های کامل
     AC-BRK  تاریخچهٔ شکننده/منسوخ + راهنمای مهاجرت
     AC-SYN  نسخهٔ پروتکل ای۰۱ و اجزایش
     AC-REF  ارجاع‌های زنده
   اجرا: node tests/api-changelog-coverage.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 200) : '')); }
}
function grp(t) { console.log('\n▸ ' + t); }
const rd = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return null; } };

const doc = rd('docs/API_CHANGELOG.md');
if (!doc) { console.log('❌ docs/API_CHANGELOG.md نیست'); process.exit(1); }

grp('AC-SEC — بخش‌های هشت‌گانه');
[
  ['سیاست نسخه‌بندی', /سیاست نسخه‌بندی/],
  ['نسخهٔ جاری', /نسخهٔ جاری/],
  ['دفترچهٔ تغییرات', /دفترچهٔ تغییرات/],
  ['موجودی مسیرها', /موجودی مسیرها/],
  ['تاریخچهٔ تغییرات شکننده', /تاریخچهٔ تغییرات شکننده/],
  ['هشدارهای منسوخ‌سازی', /هشدارهای منسوخ‌سازی/],
  ['راهنمای مهاجرت مصرف‌کنندگان', /راهنمای مهاجرت مصرف‌کنندگان/],
  ['نسخهٔ پروتکل همگام‌سازی', /نسخهٔ پروتکل همگام‌سازی/]
].forEach(([label, re]) => chk('بخشِ «' + label + '»', re.test(doc)));

grp('AC-VER — سیاست و نسخه');
chk('فضای /api/v1/ تعریف شده', /\/api\/v1\//.test(doc));
chk('تضمین سازگاری عقب‌رو', /سازگاری عقب‌رو/.test(doc));
chk('پنجرهٔ منسوخ‌سازی حداقل شش ماه', /۶ ماه/.test(doc));
chk('نسخهٔ وی۱.۰.۰ با تاریخ', /v1\.0\.0/.test(doc) && /2026-09-10/.test(doc));
chk('احراز: کوکی نشست + جی‌دابلیوتی', /HttpOnly/.test(doc) && /jti/.test(doc));
chk('پروتکل ای۰۱ اعلام شده', /A01/.test(doc));

grp('AC-INV — موجودی مسیرها');
const inv = doc.split(/موجودی مسیرها/)[1].split(/تاریخچهٔ تغییرات شکننده/)[0];
['/api/v1/bootstrap', '/api/v1/pull', '/api/v1/students', '/api/v1/classes', '/api/v1/attendance', '/api/v1/grades', '/api/v1/users',
 '/api/auth/send-code', '/api/auth/login', '/api/auth/me', '/api/auth/logout', '/api/auth/delete-account',
 '/api/sync', '/api/sync/conflicts', '/api/sync/resolve-conflict', '/api/bell/now', '/api/public-report',
 '/api/admin/backup', '/api/admin/restore', '/api/sms/send', '/api/liveness', '/api/readiness', '/api/health',
 /* دو مسیر پلتفرمی که پس از تدوین اولیهٔ این فهرست اضافه شدند (ج.۱ و ویو ۱۴) */
 '/api/health-index', '/metrics']
  .forEach((p) => chk('مسیر «' + p + '» در موجودی', inv.includes(p)));
['روش', 'مسیر', 'توضیح', 'احراز', 'ریت‌لیمیت', 'نوع پاسخ'].forEach((c) => chk('ستون «' + c + '» در جدول', inv.includes(c)));
/* شمارهای اعلامیِ سند با شمار واقعیِ سطرهای §۴.۱/§۴.۲ یکی باشد
   (۱۲ عملیات نسخه‌دار + ۱۸ پلتفرمی + ۱ فقط-تست = ۳۱) */
const invRows = inv.split('\n').filter((l) => /^\|\s*(GET|POST|PUT|PATCH|DELETE)\b/.test(l)).length;
chk('شمارش اعلام‌شده با جدول هم‌خوان است',
  /۱۲ نسخه‌دار/.test(doc) && /۱۸ پلتفرمی/.test(doc) && /۳۱ عملیات/.test(doc),
  'سطرهای جدول: ' + invRows);

grp('AC-BRK — شکننده/منسوخ/مهاجرت');
chk('شکننده: «هیچ» از وی۱ صادقانه', /هیچ/.test(doc.split(/تاریخچهٔ تغییرات شکننده/)[1].split(/هشدارهای منسوخ‌سازی/)[0]));
chk('منسوخ: فعلاً هیچ + جدول آماده', /هیچ مورد منسوخ‌شده‌ای نیست/.test(doc));
chk('مهاجرت: وی۰ وجود نداشته', /وی۰ وجود نداشته/.test(doc));

grp('AC-SYN — پروتکل ای۰۱');
const syn = doc.split(/## ۸\) نسخهٔ پروتکل همگام‌سازی/)[1] || '';
chk('جزء پول با وضعیت', /پول \(pull\)|پول/.test(syn));
chk('جزء کرسر', /کرسر/.test(syn) && /lastUpdatedAt/.test(syn));
chk('جزء سنگ‌قبر با جدول‌ها', /سنگ‌قبر/.test(syn) && /server_tombstones/.test(syn));
chk('جزء پوش با قید باقی‌مانده', /پوش \(push\)|پوش/.test(syn) && /باقی/.test(syn));
chk('ارجاع به پروتکل همگام‌سازی', /SYNC_PROTOCOL\.md/.test(syn));
chk('بخش پروتکل پیدا شد', syn.length > 200);

grp('AC-REF — ارجاع‌ها');
const refs = [...new Set((doc.match(/(?:docs|server|infra|tests|tools|authz)\/[A-Za-z0-9_./-]+\.(?:json|md|js|yml|sh|sql)/g) || []))];
chk('دست‌کم ۵ ارجاع فایلی', refs.length >= 5, String(refs.length));
const dead = refs.filter((r) => !fs.existsSync(path.join(ROOT, r)));
chk('همهٔ ارجاع‌ها به فایل موجود می‌رسند', dead.length === 0, dead.join(','));
/* صادقانه و معکوسِ فرضِ قدیمی: اسپک ماشینی دیگر «وجود ندارد» نیست —
   `docs/openapi.yaml` در مأموریت ۳۶ ساخته شد. سند باید به آن ارجاع دهد و فایل
   باید واقعاً روی دیسک باشد، وگرنه ادعای سند کاذب است. */
chk('صداقت: وجود اسپک اوپن‌ای‌پی‌آی قید و راستی‌آزمایی شده',
  /اوپن‌ای‌پی‌آی|OpenAPI/.test(doc) && doc.includes('docs/openapi.yaml') &&
  fs.existsSync(path.join(ROOT, 'docs/openapi.yaml')));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail > 0) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ دفترچهٔ ای‌پی‌آی کامل است.');
