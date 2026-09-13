#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   migration-guide-coverage.js — سنجه‌های سندِ راهنمای مهاجرت
   (سندِ اجباریِ §30: docs/MIGRATION_GUIDE.md):
     MIG-SEC   هر هشت بخشِ الزامی موجود باشد
     MIG-REF   هر ارجاعِ فایل در سند به فایلِ واقعیِ ریپو برسد
     MIG-POL   سیاست: تغییرناپذیری + شماره‌گذاری + جفتِ رفت/برگشت + کامیت
     MIG-EXP   الگوی بسط/انقباض با مثالِ واقعیِ این ریپو
     MIG-RBK   بازگشت: مسیر، محدودیتِ از‌دست‌رفتنِ داده، تفاوت با بازگشتِ کد
     MIG-LIV   مهاجرتِ زنده: ایندکسِ هم‌زمان + ستونِ تهی + بک‌فیلِ دسته‌ای
     MIG-DAT   مهاجرتِ جی‌سان→دیتابیس با ابزارِ رسمی + مسیرِ برگشت
     MIG-CHK   چک‌لیستِ پیش از تولید + فهرستِ چهار مهاجرتِ فعلی
   اجرا: node tests/migration-guide-coverage.js
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

const doc = rd('docs/MIGRATION_GUIDE.md');
if (!doc) { console.log('❌ docs/MIGRATION_GUIDE.md نیست'); process.exit(1); }

/* ── MIG-SEC ── */
grp('MIG-SEC — بخش‌های هشت‌گانه');
[
  ['سیاست مهاجرت', /سیاست مهاجرت|Migration Policy/],
  ['چرخهٔ کار', /چرخهٔ کار مهاجرت|Workflow/],
  ['بسط/انقباض', /بسط\/انقباض|Expand ?\/ ?Contract/],
  ['رویه‌های بازگشت', /رویه‌های بازگشت|Rollback/],
  ['مهاجرت زنده', /مهاجرتِ زنده|Zero-Downtime/],
  ['مهاجرت داده', /مهاجرتِ داده|Data Migration/],
  ['چک‌لیست پیش از تولید', /چک‌لیست پیش از/],
  ['فهرست مهاجرت‌ها', /فهرست مهاجرت‌های فعلی/]
].forEach(([label, re]) => chk('بخشِ «' + label + '» در سند هست', re.test(doc)));

/* ── MIG-REF ── */
grp('MIG-REF — ارجاع‌های فایلِ زنده');
const refs = [...new Set((doc.match(/(?:docs|server|infra|tests|tools|authz|migrations)\/[A-Za-z0-9_./-]+\.(?:json|md|js|yml|sh|sql)/g) || []))].filter((r) => !/NNN/.test(r)); /* الگوی نام‌گذاری، فایل نیست */
chk('سند به فایل‌های ریپو ارجاع می‌دهد', refs.length >= 6, String(refs.length));
const dead = refs.filter((r) => !fs.existsSync(path.join(ROOT, r)));
chk('همهٔ ارجاع‌ها به فایلِ موجود می‌رسند', dead.length === 0, dead.join(','));
chk('ارجاع به سندِ معماریِ دیتابیس', /DATABASE_ARCHITECTURE\.md/.test(doc));

/* ── MIG-POL ── */
grp('MIG-POL — سیاست');
chk('تغییرناپذیریِ مهاجرتِ اعمال‌شده', /تغییرناپذیری|هرگز ویرایش/.test(doc));
chk('شماره‌گذاری پیوسته', /شماره‌گذاری پیوسته/.test(doc));
chk('جفتِ رفت/برگشت', /\.down\.sql/.test(doc));
chk('هر مهاجرت = یک کامیت', /یک کامیت/.test(doc));
chk('اجرای تراکنشی', /BEGIN/.test(doc) || /تراکنش/.test(doc));

/* ── MIG-EXP ── */
grp('MIG-EXP — بسط/انقباض');
chk('سه مرحله: بسط، انتقال، انقباض', /بسط \(Expand\)/.test(doc) && /انتقال \(Migrate\)/.test(doc) && /انقباض \(Contract\)/.test(doc));
chk('مثالِ واقعی از ریپو (مهاجرت 004)', /مهاجرتِ `004`|مهاجرت 004|`004`/.test(doc));
chk('ممنوعیتِ تغییرِ تک‌مرحله‌ای روی دادهٔ زنده', /تک‌مرحله‌ای/.test(doc));

/* ── MIG-RBK ── */
grp('MIG-RBK — بازگشت');
chk('مسیرِ اجرای فایلِ برگشت (معکوس)', /معکوس/.test(doc));
chk('محدودیتِ صادقانه: پس از نوشتن، داده از دست می‌رود', /داده از دست|دادهٔ تولید/.test(doc));
chk('تفکیکِ بازگشتِ کد از بازگشتِ مهاجرت', /بازگشتِ کد/.test(doc) && /بازگشتِ مهاجرت/.test(doc));
chk('ارجاعِ بازیابیِ نقطه‌ای به ران‌بوک', /DR_RUNBOOK\.md/.test(doc));

/* ── MIG-LIV ── */
grp('MIG-LIV — مهاجرت زنده');
chk('ایندکسِ هم‌زمان', /CREATE INDEX CONCURRENTLY/.test(doc));
chk('ستونِ جدید با پیش‌فرضِ تهی', /ADD COLUMN/.test(doc) && /تهی|NULL/.test(doc));
chk('بک‌فیلِ دسته‌ای با صفحه‌بندی', /بک‌فیل|دسته‌های کوچک/.test(doc));
chk('ارجاع به حجمِ جداولِ بزرگ از مدلِ ظرفیت', /CAPACITY_MODEL\.md/.test(doc));

/* ── MIG-DAT ── */
grp('MIG-DAT — جی‌سان → دیتابیس');
chk('ابزارِ رسمیِ مهاجرتِ داده', /tools\/migrate-to-pg\.js/.test(doc));
chk('مراحل: استخراج/تبدیل/بارگذاری/راستی‌آزمایی/برش', /استخراج/.test(doc) && /تبدیل/.test(doc) && /بارگذاری/.test(doc) && /راستی‌آزمایی/.test(doc) && /برش/.test(doc));
chk('مسیرِ برگشت با ابزارِ رسمی', /tools\/reseed-from-pg\.js/.test(doc));
chk('ارجاع به موجودیِ نوشتن‌های موج ۱', /WAVE1_WRITES_INVENTORY\.md/.test(doc));
chk('ضدالگوی دو منبعِ حقیقت ذکر شده', /دو منبع حقیقت|دو منبعِ حقیقت/.test(doc));

/* ── MIG-CHK + MIG-LIST ── */
grp('MIG-CHK — چک‌لیست و فهرست');
const boxes = (doc.match(/^- \[ \]/gm) || []).length;
chk('چک‌لیستِ پیش از تولید دست‌کم ۶ بند دارد', boxes >= 6, String(boxes));
['001', '002', '003', '004'].forEach((n) => chk('مهاجرتِ ' + n + ' در جدولِ فهرست هست', doc.includes(n + '_')));
chk('وضعیتِ مرج‌شدگی در جدول ذکر شده', /مرج/.test(doc));
chk('قاعدهٔ شمارهٔ بعدی (005) برای مهاجرتِ تازه', /005/.test(doc));

console.log('\n' + '─'.repeat(52));
console.log(`نتیجه راهنمای مهاجرت: ${pass}/${pass + fail} موفق` + (fail ? `  —  ${fail} ناموفق ❌` : '  —  بدون خطا ✅'));
if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
process.exit(fail ? 1 : 0);
