#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   load-test-results-coverage.js — سنجه‌های قالب نتایج آزمون بار ملی:
     LTR-SEC  ده بخشِ الزامی
     LTR-VER  وضعیت قالب: بدون نتیجهٔ واقعی + نسخه + جای فیصله
     LTR-ENV  محیط: نسخه‌ها + دیتاست ملی + تاریخ
     LTR-SCEN جدول پنج سناریو با ستون‌های کامل
     LTR-RES  جدول مصرف منابع (اوج پایدار)
     LTR-BOT  جدول گلوگاه‌ها
     LTR-SLO  جدول انطباق اس‌ال‌او با اهداف طرح
     LTR-FRM  چارچوب تحلیل چهاربخشی
     LTR-ACT  سه دستهٔ اقلام اقدام
     LTR-HON  محدودیت‌های صادقانه
     LTR-LOG  دفترچهٔ اجرا: ورودی‌ها + دستورهای دقیق
     LTR-REF  ارجاع‌های فایلِ زنده
   اجرا: node tests/load-test-results-coverage.js
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

const doc = rd('docs/LOAD_TEST_RESULTS.md');
if (!doc) { console.log('❌ docs/LOAD_TEST_RESULTS.md نیست'); process.exit(1); }

grp('LTR-SEC — بخش‌های ده‌گانه');
[
  ['خلاصهٔ مدیریتی', /خلاصهٔ مدیریتی/],
  ['محیط آزمون', /محیط آزمون/],
  ['نتایج سناریوهای بار', /نتایج سناریوهای بار/],
  ['مصرف منابع', /مصرف منابع/],
  ['گلوگاه‌های شناسایی‌شده', /گلوگاه‌های شناسایی‌شده/],
  ['انطباق با SLO', /انطباق با SLO/],
  ['چارچوب تحلیل', /چارچوب تحلیل/],
  ['اقلام اقدام', /اقلام اقدام/],
  ['محدودیت‌های صادقانه', /محدودیت‌های صادقانه/],
  ['دفترچهٔ اجرا', /دفترچهٔ اجرا/]
].forEach(([label, re]) => chk('بخشِ «' + label + '» در سند هست', re.test(doc)));

grp('LTR-VER — وضعیت قالب (بدون نتیجهٔ واقعی)');
chk('وضعیت صریح: قالب آماده، بدون اجرای واقعی', /قالب آماده/.test(doc) && /هنوز هیچ اجرای واقعی انجام نشده/.test(doc));
chk('نسخهٔ قالب ۰.۱.۰', /۰\.۱\.۰/.test(doc));
chk('جای فیصله: ‎PASS/FAIL', /PASS یا FAIL/.test(doc));
chk('جای تصمیم ظرفیت: ‎GO/NO-GO', /GO یا NO-GO/.test(doc));
chk('قاعدهٔ تغییرناپذیری اهداف در این سند', /اهداف و آستانه‌ها هرگز در این سند تغییر نمی‌کنند/.test(doc));

grp('LTR-PH — جای‌دارها (placeholders)');
const tbd = (doc.match(/\[TBD/g) || []).length;
chk('دست‌کم ۶۰ جای [TBD] برای پر شدن پس از اجرا', tbd >= 60, String(tbd));

grp('LTR-ENV — محیط آزمون');
['پایش', 'Node', 'PostgreSQL', 'Redis', 'PgBouncer', 'k6'].forEach((v) => chk('ردیف نسخهٔ «' + v + '» در جدول نسخه‌ها', new RegExp('\\|\\s*' + v + '[^|]*\\|').test(doc)));
chk('دیتاست: ۱۰ میلیون کاربر', /۱۰٬۰۰۰٬۰۰۰/.test(doc));
chk('دیتاست: ۱۰۰ هزار مدرسه', /۱۰۰٬۰۰۰/.test(doc));
chk('دیتاست: حضور و نمره (۵۰م/۲۸۸م)', /۵۰٬۰۰۰٬۰۰۰/.test(doc) && /۲۸۸٬۰۰۰٬۰۰۰/.test(doc));
chk('جای تاریخ اجرا', /تاریخ\/بازهٔ اجرا.*\[TBD\]/.test(doc));
chk('قید مرج‌نشدن ابزار بارگذاری ملی', /seed-national\.js/.test(doc) && /مرج نشده|نیست/.test(doc));

grp('LTR-SCEN — جدول سناریوها');
const scenSec = doc.split(/نتایج سناریوهای بار/)[1].split(/مصرف منابع/)[0];
['بار پایدار', 'پیک صبح مهر', 'استرس', 'ضربه', 'خیس‌خوردن'].forEach((s) => chk('سناریوی «' + s + '» در جدول هست', scenSec.includes(s)));
['RPS نهایی', 'p50', 'p95', 'p99', '5xx٪', 'RTO', 'نتیجه'].forEach((c) => chk('ستون «' + c + '» در سربرگ جدول', scenSec.includes('| ' + c)));
chk('پارامتر سوآک: ۷۲ ساعت', /۷۲ ساعت/.test(scenSec));
chk('پارامتر پیک: ۲۰هزار + نوشتن', /۲۰٬۰۰۰/.test(scenSec) && /۲٬۵۰۰/.test(scenSec));

grp('LTR-RES — مصرف منابع');
const resSec = doc.split(/مصرف منابع/)[1].split(/گلوگاه‌های شناسایی‌شده/)[0];
['گره‌های API', 'Redis', 'PostgreSQL', 'شبکه', 'دیسک'].forEach((r) => chk('ردیف منبع «' + r + '»', resSec.includes(r)));
chk('سنجه‌های ردیس: حافظه + ‎ops/s + اصابت کش', /ops\/s/.test(resSec) && /اصابت کش/.test(resSec));
chk('سنجه‌های پی‌جی: اتصال‌ها + ‎TPS + پول‌ویت', /اتصال‌های فعال/.test(resSec) && /TPS/.test(resSec) && /pool wait/.test(resSec));

grp('LTR-BOT — گلوگاه‌ها');
const botSec = doc.split(/گلوگاه‌های شناسایی‌شده/)[1].split(/انطباق با SLO/)[0];
['منبع', 'نقطه اشباع', 'RPS بحرانی', 'راه‌حل پیشنهادی'].forEach((c) => chk('ستون «' + c + '» در جدول گلوگاه‌ها', botSec.includes(c)));

grp('LTR-SLO — انطباق با اهداف طرح');
const sloSec = doc.split(/انطباق با SLO/)[1].split(/چارچوب تحلیل/)[0];
chk('هدف پ50 زیر ۱۰۰ میلی‌ثانیه', /p50 < ۱۰۰ms/.test(sloSec));
chk('هدف پ95 زیر ۳۰۰ میلی‌ثانیه', /p95 < ۳۰۰ms/.test(sloSec));
chk('هدف پ99 زیر ۱ ثانیه', /p99 < ۱s/.test(sloSec));
chk('هدف خطای 5xx زیر ۰.۱٪', /5xx < ۰\.۱٪/.test(sloSec));
chk('ستون‌های هدف/مشاهده/وضعیت', /هدف/.test(sloSec) && /مشاهده‌شده/.test(sloSec) && /وضعیت/.test(sloSec));

grp('LTR-FRM — چارچوب تحلیل');
const frmSec = doc.split(/چارچوب تحلیل/)[1].split(/اقلام اقدام/)[0];
chk('موضوع ۱: اثر پ95 بر پ99 (دم توزیع)', /پ99/.test(frmSec) && /دم توزیع|فاصلهٔ پ95 تا پ99/.test(frmSec));
chk('موضوع ۲: تشخیص گلوگاه دیتابیس/اپ/شبکه', /دیتابیس/.test(frmSec) && /اپلیکیشن/.test(frmSec) && /شبکه/.test(frmSec));
chk('موضوع ۳: الگوهای نشت سوآک (هیپ/اتصال/صف)', /هیپ/.test(frmSec) && /اتصال‌ها/.test(frmSec) && /صف/.test(frmSec));
chk('الگوی رشد ‎dead tuples و وکیوم', /dead tuples/.test(frmSec) && /وکیوم/.test(frmSec));
chk('موضوع ۴: آستانه‌های شکست با خط قرمز صحت داده', /آستانه‌های شکست/.test(frmSec) && /صحت داده/.test(frmSec));

grp('LTR-ACT — اقلام اقدام');
const actSec = doc.split(/اقلام اقدام/)[1].split(/محدودیت‌های صادقانه/)[0];
chk('دستهٔ نقض اس‌ال‌او', /اگر SLO نقض شد/.test(actSec));
chk('دستهٔ گلوگاه با گزینه‌های مقیاس', /اگر گلوگاه پیدا شد/.test(actSec) && /مقیاس/.test(actSec));
chk('دستهٔ نشت با گام رفع', /اگر نشت پیدا شد/.test(actSec));

grp('LTR-HON — محدودیت‌های صادقانه');
const honSec = doc.split(/محدودیت‌های صادقانه/)[1].split(/دفترچهٔ اجرا/)[0];
chk('قید سندباکس ۲ هسته/۴ گیگ', /۲ هسته \/ ۴ گیگ/.test(honSec));
chk('قید نیاز به استیجینگ شبیه تولید', /استیجینگ شبیه تولید/.test(honSec));
chk('قید پر شدن نتایج فقط پس از اجرای واقعی', /فقط پس از اجرای واقعی پر می‌شوند/.test(honSec));

grp('LTR-LOG — دفترچهٔ اجرا');
const logSec = doc.split(/دفترچهٔ اجرا/)[1];
chk('جدول ورودی‌های لازم (نشانی/سکرت/پیامک)', /نشانی استیجینگ/.test(logSec) && /PAYESH_JWT_SECRET/.test(logSec));
chk('هشدار ننوشتن سکرت در سند', /هرگز در همین سند نوشته نشود/.test(logSec));
chk('دستور رانر کی‌شش', /run-benchmarks\.sh/.test(logSec));
chk('دستور هارنس چندنمونه‌ای با حالت امن', /wave18w19-multinode-live\.js/.test(logSec) && /--live/.test(logSec));
chk('ترتیب شش‌گامی اجرا مطابق طرح', /ری‌استور دیتاست/.test(logSec) && /گرم‌کردن کش/.test(logSec) && /صحت داده/.test(logSec));
chk('گیت‌های پایه پس از اجرا', /smoke\.js/.test(logSec) && /check-authz\.js/.test(logSec) && /secret-scan\.js/.test(logSec) && /build\.js --check/.test(logSec));
chk('جدول دفتر ثبت اجراها', /دفتر ثبت اجراها/.test(logSec));

grp('LTR-REF — ارجاع‌ها');
const refs = [...new Set((doc.match(/(?:docs|server|infra|tests|tools)\/[A-Za-z0-9_./-]+\.(?:json|md|js|yml|sh|sql)/g) || []))];
chk('سند به فایل‌های ریپو ارجاع می‌دهد', refs.length >= 6, String(refs.length));
// ابزار بارگذاری ملی هنوز در مین نیست (انسداد شناخته‌شدهٔ پ0-۶) — ارجاعش موعود و مجاز است
const PENDING = ['tools/seed-national.js'];
const dead = refs.filter((ref) => !PENDING.includes(ref) && !fs.existsSync(path.join(ROOT, ref)));
chk('همهٔ ارجاع‌ها به فایلِ موجود می‌رسند (مستثنیات شناخته‌شده: ابزار مرج‌نشده)', dead.length === 0, dead.join(','));
chk('ارجاع به طرح آزمون بار (منبع اهداف)', /LOAD_TEST_PLAN\.md/.test(doc));
chk('ارجاع به مدل ظرفیت', /CAPACITY_MODEL\.md/.test(doc));
chk('ارجاع به بستهٔ انتشار و ردیاب پ0', /GO_LIVE_PACKAGE\.md/.test(doc) && /P0_BLOCKER_TRACKER\.md/.test(doc));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail > 0) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ قالب نتایج آزمون بار کامل و آمادهٔ پر شدن است.');
