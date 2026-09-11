#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   national-architecture-coverage.js — سنجه‌های سندِ چترِ معماریِ ملی
   (سندِ اجباریِ §30: docs/NATIONAL_ARCHITECTURE.md):
     NA-SEC   هر چهارده بخشِ الزامی موجود باشد
     NA-REF   هر ارجاعِ فایل در سند به فایلِ واقعیِ ریپو برسد
     NA-SUM   خلاصهٔ اجرایی: مقیاس، اس‌ال‌او، اصولِ کلان
     NA-ADR   ده رکوردِ تصمیمِ معماری
     NA-TEN   مدلِ چندمستأجری با سلسله‌مراتب و جدولِ لایه‌ها
     NA-ANTI  ضدالگوها + چک‌لیستِ ردِ پی‌آر
     NA-XREF  جدولِ ارجاعاتِ §30 با وضعیتِ اسناد
   اجرا: node tests/national-architecture-coverage.js
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

const doc = rd('docs/NATIONAL_ARCHITECTURE.md');
if (!doc) { console.log('❌ docs/NATIONAL_ARCHITECTURE.md نیست'); process.exit(1); }

/* ── NA-SEC ── */
grp('NA-SEC — بخش‌های چهارده‌گانه');
[
  ['خلاصهٔ اجرایی', /خلاصهٔ اجرایی|Executive Summary/],
  ['معماری هدف', /معماری هدف|Target Architecture/],
  ['مدل چندمستأجری', /مدل چندمستأجری|Multi-Tenant/],
  ['معماری داده', /معماری داده|Data Architecture/],
  ['ای‌پی‌آی و همگام‌سازی', /ای‌پی‌آی و همگام‌سازی|API & Sync/],
  ['مجوز و امنیت', /مجوز و امنیت|Authorization & Security/],
  ['کارایی و مقیاس', /کارایی و مقیاس|Performance & Scale/],
  ['رصدپذیری', /رصدپذیری|Observability/],
  ['پایایی و بازیابی', /پایایی و بازیابی|Reliability/],
  ['استقرار و عملیات', /استقرار و عملیات|Deployment/],
  ['ضدالگوها', /ضدالگوها|Anti-Pattern/],
  ['رکوردهای تصمیم', /رکوردهای تصمیم|ADR/],
  ['موارد باز و آینده', /موارد باز و آینده|Open Items/],
  ['جدول ارجاعات', /جدول ارجاعات/]
].forEach(([label, re]) => chk('بخشِ «' + label + '» در سند هست', re.test(doc)));

/* ── NA-REF ── */
grp('NA-REF — ارجاع‌های فایلِ زنده');
const refs = [...new Set((doc.match(/(?:docs|server|infra|tests|tools)\/[A-Za-z0-9_./-]+\.(?:json|md|js|yml|sh|sql)/g) || []))];
chk('سند به فایل‌های ریپو ارجاع می‌دهد', refs.length >= 10, String(refs.length));
const dead = refs.filter((r) => !fs.existsSync(path.join(ROOT, r)) && !/LOAD_TEST_RESULTS\.md$/.test(r)); /* این سند ذاتاً مسدود به اجرای موج ۱۸ است — ارجاعِ آیندهٔ رسمی */
chk('همهٔ ارجاع‌ها به فایلِ موجود می‌رسند', dead.length === 0, dead.join(','));

/* ── NA-SUM ── */
grp('NA-SUM — خلاصهٔ اجرایی');
chk('مقیاس: ۱۰ میلیون کاربر ثبت‌شده', /۱۰ میلیون/.test(doc));
chk('بار پیک: ۲۰هزار درخواست/ثانیه', /۲۰هزار/.test(doc));
chk('اهداف اس‌ال‌او (میانه/صدک۹۵/صدک۹۹/خطا)', /۱۰۰ میلی‌ثانیه/.test(doc) && /۳۰۰/.test(doc) && /۱ ثانیه/.test(doc) && /۰\.۱٪|۰٫۱٪/.test(doc));
chk('اصلِ پستگرس = تنها منبع حقیقت', /تنها منبع حقیقت/.test(doc));
chk('اصلِ ای‌پی‌آی بدون وضعیت', /بدون وضعیت/.test(doc));
chk('اصلِ آفلاین-اول با سقف', /آفلاین-اول/.test(doc));
chk('تفکیک شکست‌بسته/باز-رو', /شکست‌بسته/.test(doc) && /باز-رو/.test(doc));

/* ── NA-ADR ── */
grp('NA-ADR — رکوردهای تصمیم');
const adrCount = (doc.match(/ای‌دی‌آر-[۰-۹]+/g) || []).length;
chk('دست‌کم ده رکوردِ ای‌دی‌آر در جدول', adrCount >= 10, String(adrCount));
[
  ['ADR-001 منبع حقیقت', /منبع حقیقت/],
  ['ADR-002 حالت توزیع‌شده', /حالت توزیع‌شده/],
  ['ADR-003 مجوز متمرکز', /مجاز متمرکز|موتور واحد/],
  ['ADR-004 صف کراندار', /صف کراندار/],
  ['ADR-005 صندوق خروجی', /صندوق خروجی/],
  ['ADR-006 سنگ‌قبر', /سنگ‌قبر/],
  ['ADR-007 استریمینگ+نگهبان', /استریمینگ/],
  ['ADR-008 تک‌سنگواره', /تک‌سنگواره/],
  ['ADR-009 سلسله‌مراتب محدوده', /سلسله‌مراتب/],
  ['ADR-010 شکست‌بسته', /شکست‌بسته/]
].forEach(([label, re]) => chk(label + ' پوشش شده', re.test(doc)));

/* ── NA-TEN ── */
grp('NA-TEN — چندمستأجری');
chk('سلسله‌مراتب ملی→استان→شهرستان→مدرسه→کلاس', /ملی → استان/.test(doc) && /مدرسه → کلاس/.test(doc));
['اسکیما', 'مجوز', 'کش', 'همگام‌سازی'].forEach((l) => chk('اعمال محدوده در لایهٔ ' + l, doc.includes('| ' + l)));
chk('قاعدهٔ طلایی: شناسهٔ منبع مجوز نیست', /شناسهٔ منبعی به‌تنهایی مجوز نیست/.test(doc));

/* ── NA-ANTI ── */
grp('NA-ANTI — ضدالگوها');
chk('دست‌کم شش ضدالگوی شماره‌دار', (doc.match(/^\d+\. /gm) || []).length >= 6);
chk('دو منبع حقیقت ممنوع', /دو منبع حقیقت/.test(doc));
chk('ردیس برای پوشاندن کوئری بد ممنوع', /پوشاندن کوئری بد/.test(doc));
chk('کوبرنت پیش از بی‌وضعیتی ممنوع', /کوبرنت/.test(doc));
chk('چک‌لیستِ ردِ پی‌آر دارد', /چک‌لیست رد/.test(doc));

/* ── NA-XREF ── */
grp('NA-XREF — جدول ارجاعات');
const okRows = (doc.match(/\| ✅ \|/g) || []).length;
chk('جدولِ ارجاعات دست‌کم ۱۳ سندِ کامل دارد', okRows >= 13, String(okRows));
chk('وضعیتِ مسدودِ نتایجِ آزمون بار صادقانه آمده', /مسدود به اجرا/.test(doc));
chk('جمعِ ۱۴ از ۱۴ ذکر شده', /۱۴ از ۱۴/.test(doc));

console.log('\n' + '─'.repeat(52));
console.log(`نتیجه سندِ معماری ملی: ${pass}/${pass + fail} موفق` + (fail ? `  —  ${fail} ناموفق ❌` : '  —  بدون خطا ✅'));
if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
process.exit(fail ? 1 : 0);
