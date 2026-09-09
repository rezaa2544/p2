# راستی‌آزماییِ قالبِ دومِ کارنامه و دو گواهیِ اضافه

> تاریخ: ۲۰۲۶-۰۹-۰۹ | مبنا: `origin/main` | روش: خواندنِ کد + اجرای تست‌های موجود (node ‏۲۲)
>
> **نتیجهٔ کلان: هر سه مورد موجود، سیم‌کشی‌شده و سبز‌اند — نیازی به ساخت از الگوی گواهی نمرات نبود.**

## ۱. قالبِ دومِ کارنامه ✅ موجود

- **تعریف:** `reportCardCert(sid, term, tpl)` در `src/js/33-forms-sms.js:128` — پارامترِ `tpl` دو قالب دارد:
  - `'classic'` (پیش‌فرض): چیدمانِ تک‌ستونهٔ کامل؛
  - `'compact'` (**قالبِ دوم**): چیدمانِ دوستونه (`grid-template-columns:1fr 1fr`)، فشرده برای چاپِ کم‌حجم.
- **سیم‌کشیِ UI:** اکشنِ `report-print` (`src/js/19-actions-core.js:1153`) قالب را از انتخابگرِ `cert_tpl` می‌خواند (`V('cert_tpl')||'classic'`)؛ مجوزِ داده‌ای: `certAllowedStudent`.
- **تست:** `tests/reporttpl2.js` — **۷/۷ سبز** (پیش‌فرض=classic، compact دوستونه، عدمِ قاطی‌شدنِ بدنه‌ها، چاپِ واقعیِ هر دو قالب).

## ۲. گواهی اشتغال به تحصیل (`enrollmentCert`) ✅ موجود

- **تعریف:** `enrollmentCert(sid)` در `src/js/33-forms-sms.js:335` — همان الگوی گواهی نمرات (`transcriptCert`): عنوان/مشخصات/متنِ رسمی + **کد احراز** (`certCodeCalc('enrollment', …)`) + یادداشتِ راستی‌آزمایی. همهٔ ورودی‌ها با `esc()` پالایش می‌شوند.
- **سیم‌کشیِ UI:** اکشنِ `cert-enroll-print` (`src/js/19-actions-core.js:1163`) + ثبتِ سوابقِ صدور (`certRecord('enrollment', sid)`) + راستی‌آزمایی با `cert-verify`.
- **تست:** `tests/certify.js` — **۸/۸ سبز** (شاملِ صدور، کد احراز، و عدمِ نشتِ دامنه با `data-sid` جعلی).

## ۳. گواهی انتقالی (`transferCert`) ✅ موجود

- **تعریف:** `transferCert(sid)` در `src/js/33-forms-sms.js:364` — متنِ رسمیِ انتقال با بازهٔ تحصیل (ابتدای سال تا تاریخِ صدورِ شمسی)، **وضعیت کلی و معدل** (`certOverall`) در صورتِ وجودِ نمره + کد احراز (`certCodeCalc('transfer', …)`).
- **سیم‌کشیِ UI:** اکشنِ `cert-transfer-print` (`src/js/19-actions-core.js:1172`) + `certRecord('transfer', sid)` + `cert-verify`.
- **تست:** `tests/certify.js` — **۸/۸ سبز** (مشترک با بالا؛ صدورِ مکرر، پایداریِ کد، ایزولاسیونِ دانش‌آموز).

## ۴. گیت‌های سخت (روی همین شاخه)

- `node tests/smoke.js` → **۵۴۷/۵۴۷** ✅ (فقط مستندات؛ بدونِ تغییرِ کد)
- `node tools/check-authz.js` → **تطبیق کامل (۰)** ✅

## ۵. یادداشت

- شاخهٔ مرتبطِ الگو (`transcriptCert`، گواهی نمرات/ریزِنمرات) در همان فایل (`33-forms-sms.js:72`) است و هر سه سندِ بالا از قراردادِ `{ok,title,school,subtitle,body,note}` و چاپِ `printableDoc` پیروی می‌کنند.
- اگر در آینده قالبِ سومِ کارنامه یا گواهیِ تازه‌ای لازم شد، نقطهٔ افزودن همان فایل + یک اکشن در `19-actions-core.js` + کیس در `certify.js`/`reporttpl2.js` است.
