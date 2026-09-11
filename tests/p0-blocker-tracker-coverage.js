#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   p0-blocker-tracker-coverage.js — سنجه‌های ردیاب موانع پ0 (نو-گو→گو):
     PT-SEC   شش بخشِ الزامی سند
     PT-DASH  داشبورد مدیریتی + سازگاری عددی (رفع+درحال+بلاک = ۶، درصد = گام‌ها)
     PT-CARD  شش کارتِ پ0-۱..پ0-۶ با ده فیلدِ کامل
     PT-PATH  مسیر بحرانی: جدول گام‌ها + تاریخ تخمینی تی-صفر
     PT-DEC   دفتر ثبت تصمیم‌ها با ستون تاریخ
     PT-RISK  ثبت ریسک‌ها: احتمال/تأثیر/کاهش
     PT-ACT   اقدام‌های هفتهٔ پیش رو
     PT-REF   ارجاع‌های فایلِ زنده + اتصال به بستهٔ انتشار و چک‌لیست
   اجرا: node tests/p0-blocker-tracker-coverage.js
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
// تبدیل ارقام فارسی/عربی به لاتین برای راستی‌آزمایی عددی
const fa2en = (s) => String(s).replace(/[۰-۹]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c));

const doc = rd('docs/P0_BLOCKER_TRACKER.md');
if (!doc) { console.log('❌ docs/P0_BLOCKER_TRACKER.md نیست'); process.exit(1); }

grp('PT-SEC — بخش‌های شش‌گانه');
[
  ['داشبورد مدیریتی', /داشبورد مدیریتی/],
  ['کارت‌های کامل شش مانع', /کارت‌های کامل شش مانع/],
  ['مسیر بحرانی', /مسیر بحرانی/],
  ['دفتر ثبت تصمیم‌ها', /دفتر ثبت تصمیم‌ها/],
  ['ثبت ریسک‌ها', /ثبت ریسک‌ها/],
  ['اقدام‌های هفتهٔ پیش رو', /اقدام‌های هفتهٔ پیش رو/]
].forEach(([label, re]) => chk('بخشِ «' + label + '» در سند هست', re.test(doc)));
chk('قاعدهٔ سند زنده (سه‌جا): کارت + §۸/§۵ + هندآف', /سه‌جا/.test(doc) && /HANDOFF\.md/.test(doc));

grp('PT-DASH — داشبورد و سازگاری عددی');
chk('کل موانع = ۶', /کل موانع پ0 \| \*\*۶\*\*/.test(doc));
const mResolved = doc.match(/رفع‌شده ✅ \| \*\*([۰-۹]+)\*\*/);
const mWip = doc.match(/در حال رفع 🟡 \| \*\*([۰-۹]+)\*\*/);
const mBlocked = doc.match(/بلاک‌شده 🔴 \| \*\*([۰-۹]+)\*\*/);
chk('سه شمارندهٔ وضعیت وجود دارند', !!(mResolved && mWip && mBlocked));
const r = mResolved ? Number(fa2en(mResolved[1])) : -1;
const w = mWip ? Number(fa2en(mWip[1])) : -1;
const b = mBlocked ? Number(fa2en(mBlocked[1])) : -1;
chk('رفع + درحال + بلاک = ۶', r + w + b === 6, r + '+' + w + '+' + b);
const mSteps = doc.match(/گام‌های تکمیل‌شده \| \*\*([۰-۹]+) از ([۰-۹]+)\*\*/);
chk('شمار گام‌های تکمیل‌شده/کل هست', !!mSteps);
const mPct = doc.match(/درصد کلی تا گو\*\* \| \*\*([۰-۹]+)٪\*\*/);
chk('درصد کلی تا گو هست', !!mPct);
if (mSteps && mPct) {
  const done = Number(fa2en(mSteps[1])), total = Number(fa2en(mSteps[2]));
  const pct = Number(fa2en(mPct[1]));
  chk('درصد = گام‌های کامل/کل (سازگاری عددی)', Math.round((done / total) * 100) === pct, done + '/' + total + ' ≠ ' + pct + '٪');
  // مجموع گام‌های مسیر رفع در کارت‌ها باید با «کل» داشبورد یکی باشد
  const stepTotals = [...doc.matchAll(/\(([۰-۹]+)\/([۰-۹]+)\)/g)].map((m) => Number(fa2en(m[2])));
  chk('مخرج گام‌های شش کارت = کل داشبورد', stepTotals.length === 6 && stepTotals.reduce((a, x) => a + x, 0) === total, stepTotals.join(','));
  const stepDone = [...doc.matchAll(/\(([۰-۹]+)\/([۰-۹]+)\)/g)].map((m) => Number(fa2en(m[1])));
  chk('صورت گام‌های شش کارت = تکمیل‌شدهٔ داشبورد', stepDone.reduce((a, x) => a + x, 0) === done, stepDone.join(','));
}

grp('PT-CARD — شش کارت کامل');
const cards = doc.split(/### پ0-/).slice(1);
chk('دقیقاً ۶ کارت پ0 وجود دارد', cards.length === 6, String(cards.length));
for (let i = 1; i <= 6; i++) {
  const faNum = '۰۱۲۳۴۵۶'[i];
  chk('کارت پ0-' + faNum + ' وجود دارد', doc.includes('### پ0-' + faNum + ':'));
}
const FIELDS = ['توضیح', 'معادل §۸', 'تأثیر', 'مسئول', 'مهلت', 'وضعیت', 'وابستگی', 'شاهد پیشرفت', 'مسیر رفع', 'خطر باقی‌مانده'];
cards.forEach((card, idx) => {
  const missing = FIELDS.filter((f) => !card.includes('| ' + f + ' |'));
  chk('کارت ' + (idx + 1) + ': هر ده فیلد حاضر است', missing.length === 0, missing.join(','));
  const hasEmoji = /🔴|🟡|✅/.test(card);
  chk('کارت ' + (idx + 1) + ': ایموجی وضعیت دارد', hasEmoji);
});

grp('PT-PATH — مسیر بحرانی');
const pathSec = doc.split(/مسیر بحرانی/)[1].split(/دفتر ثبت تصمیم/)[0];
chk('زنجیرهٔ وابستگی ترسیم شده (پ0-۶ در سر)', /پ0-۶/.test(pathSec) && /پ0-۱/.test(pathSec));
const stepRows = (pathSec.match(/^\|\s*[۰-۹]+\s*\|/gm) || []).length;
chk('دست‌کم ۸ گام در جدول مسیر بحرانی', stepRows >= 8, String(stepRows));
chk('تاریخ تخمینی تی-صفر با فرمت میلادی', /20[0-9]{2}-[0-9]{2}-[0-9]{2}/.test(pathSec));
chk('قید صریح «برآورد — قطعی در جلسهٔ تصمیم»', /برآورد|تخمین/.test(pathSec));

grp('PT-DEC — دفتر ثبت تصمیم‌ها');
const decSec = doc.split(/دفتر ثبت تصمیم‌ها/)[1].split(/ثبت ریسک‌ها/)[0];
const decRows = (decSec.match(/^\|\s*20[0-9]{2}-[0-9]{2}-[0-9]{2}\s*\|/gm) || []).length;
chk('دست‌کم ۵ تصمیم ثبت‌شده با تاریخ', decRows >= 5, String(decRows));
chk('تصمیم نو-گو ثبت شده است', /نو-گو/.test(decSec));
chk('ستون‌های تصمیم‌گیر/دلیل/تأثیر در سربرگ', /تصمیم‌گیر/.test(decSec) && /دلیل/.test(decSec) && /تأثیر/.test(decSec));

grp('PT-RISK — ثبت ریسک‌ها');
const riskSec = doc.split(/ثبت ریسک‌ها/)[1].split(/اقدام‌های هفتهٔ پیش رو/)[0];
const riskRows = (riskSec.match(/^\|(?!\s*ریسک|\s*-)/gm) || []).length;
chk('دست‌کم ۷ ریسک ثبت شده (یکی به ازای هر مانع + مشترک)', riskRows >= 7, String(riskRows));
chk('ستون‌های احتمال/تأثیر/کاهش ریسک', /احتمال/.test(riskSec) && /تأثیر/.test(riskSec) && /کاهش ریسک/.test(riskSec));
chk('هر شش مانع در ثبت ریسک حاضرند', ['پ0-۱', 'پ0-۲', 'پ0-۳', 'پ0-۴', 'پ0-۵', 'پ0-۶'].every((p) => riskSec.includes(p)));

grp('PT-ACT — اقدام‌های هفتهٔ پیش رو');
const actSec = doc.split(/اقدام‌های هفتهٔ پیش رو/)[1];
const actRows = (actSec.match(/^\|\s*(ناظر|چت|چه کسی)/gm) || []).length;
chk('دست‌کم ۸ اقدام برای هفتهٔ پیش رو', actRows >= 8, String(actRows));
chk('بازهٔ هفته با تاریخ میلادی مشخص', /2026-09-1[1-7]/.test(actSec) || /۲۰۲۶/.test(actSec));

grp('PT-REF — ارجاع‌ها و اتصال اسناد');
const refs = [...new Set((doc.match(/(?:docs|server|infra|tests|tools)\/[A-Za-z0-9_./-]+\.(?:json|md|js|yml|sh|sql)/g) || []))];
chk('سند به فایل‌های ریپو ارجاع می‌دهد', refs.length >= 8, String(refs.length));
// ارجاع‌های آیندهٔ رسمی (هنوز ساخته نشده‌اند ولی موعودند) مستثناً پذیرفته می‌شوند:
// - docs/LOAD_TEST_RESULTS.md: خروجی اجرای موج ۱۸ — ذاتاً مسدود به اجرا (همان قاعدهٔ تستِ ملی‌معماری)
const PENDING_REFS = ['docs/LOAD_TEST_RESULTS.md'];
const dead = refs.filter((ref) => {
  if (/[۰-۹]/.test(ref)) return false;
  if (PENDING_REFS.includes(ref)) return false;
  return !fs.existsSync(path.join(ROOT, ref));
});
chk('همهٔ ارجاع‌ها به فایلِ موجود می‌رسند', dead.length === 0, dead.join(','));
chk('ارجاع به §۸ بستهٔ انتشار (منبع مانع‌ها)', /GO_LIVE_PACKAGE\.md/.test(doc) && /§۸/.test(doc));
chk('ارجاع به چک‌لیست آمادگی تولید', /PRODUCTION_READINESS_CHECKLIST\.md/.test(doc));
chk('ارجاع به برنامهٔ ادغام پی‌آرها', /PR_MERGE_PLAN\.md/.test(doc));
chk('ارجاع به هندآف برای قاعدهٔ سه‌جا', /HANDOFF\.md/.test(doc));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail > 0) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ ردیاب موانع پ0 کامل و سازگار است.');
