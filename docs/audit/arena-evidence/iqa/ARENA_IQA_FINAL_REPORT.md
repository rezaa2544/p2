# گزارش نهایی ممیزی هوشمندی آموزشی — Arena Intelligence QA

**تاریخ:** ۱۴۰۵/۰۷/۰۲ (2026-09-24)
**پایه ممیزی:** `main @ 66928be` (تازه fetch شده، بدون drift)
**شاخه کاری مستقل:** `arena-iqa/engine-audit-20260923`
**کامیت اصلاح:** `8ab817a` — ۱۰ فایل، ‎+1009/−184‎
**Patch:** `arena_iqa_evidence/0001-fix-intelligence-qa-*.patch`
**سطح شواهد:** E3 (اجرای واقعی در سندباکس — Node v22.14.0، JSON store؛ بدون PG/Redis زنده)
**قاعده حاکم:** طبق دستور، هیچ حکم «CERTIFIED» صادر نشده است. احکام فقط: VERIFIED-E3 / PARTIAL / OPEN.

---

## ۱) دامنه و روش

هر ۲۱ موتور `server/analytics/` (P0-EI-01…21) تحت ۷ شرط داده آزموده شد:

| کد | شرط | کد | شرط |
|---|---|---|---|
| D1 | داده نرمال | D5 | داده نامعتبر (NaN، تاریخ خراب، وضعیت جعلی) |
| D2 | داده خالی | D6 | داده مرزی (نمره ۰ و ۲۰، تک‌رکورد) |
| D3 | داده null | D7 | داده برون‌حوزه (مستأجر بیگانه + نقش بیگانه) |
| D4 | داده ناقص | | |

**ابزار ساخته‌شده (در repo، committed):**
- `tests/arena-iqa-engine-battery.js` — باتری ۲۴۹ سنجه: ۱۳ موتور متصل از مسیر واقعی route-layer (همان مسیری که HTTP صدا می‌زند) + ۸ موتور غیرمتصل در سطح ماژول. شامل اسکنر خصمانه fallback (هر metric عددیِ «معتبرنما» که از داده خالی تولید شود شکار می‌شود)، سنجش timestamp، fingerprint، سازگاری سنجه با ورودی، و ایزولاسیون مستأجر.
- `tests/api/school-regional-intelligence.test.js` — پوشش HTTP زنده برای EI-09/10 (تنها endpointهای هوشمندی بدون تست API) — در `tests/api/runner.js` ثبت شد.

**درباره «A-23»:** این شناسه در هیچ‌کجای repo وجود ندارد (grep کامل، شامل docs و dailyها). طبق راهنمای شما به‌صورت «ممیزی خصمانه هر fallback/پیش‌فرضی که سنجه معتبرنما تولید می‌کند» تفسیر و اجرا شد؛ یافته‌ها با شناسه‌های مستقل IQA-01…08 ثبت شدند.

---

## ۲) یافته اصلی: کلاس نقض «جعل داده در نبود داده» (No-Data Fabrication)

نقض سیستمیک و بازتولیدشده: در نبود کامل داده، موتورها/routeها سنجه‌های کاملاً معتبرنما برمی‌گرداندند. نمونه‌های بازتولیدشده روی baseline:

| موتور | خروجی از store کاملاً خالی (baseline) |
|---|---|
| EI-09 | `health_index.score=83.2`، `average_gpa=15.0`، `calendar_rate=95%`، `resolution_rate=100%` |
| EI-05 | `health_score=85.13 (EXCELLENT)` با `attendance_health=100` |
| EI-11 | `overall_quality_index=81.5` با ۵ رکن نمره‌دار |
| EI-06 | `attendance_rate=100%` برای دانش‌آموز بدون هیچ جلسه ثبت‌شده |
| EI-08 | `effective_interventions_ratio=1.0` (۱۰۰٪ اثربخشی با صفر پرونده!) |
| EI-13 (route) | نرخ حضور همیشه ثابت `88.0` حتی با داده واقعی؛ `chronic=14.5` جعلی |
| EI-14 (route) | اقدام جعلی `ACT-DEFAULT-01` با نتیجه `HIGHLY_EFFECTIVE` تزریق می‌شد |
| EI-15 (route) | اقدام جعلی `ACT-DEF-01` + شفافیت `92/98/95` hardcoded |
| EI-02 | timestamp خراب → تاریخ جعلی `1970-01-01` در خط زمانی دانش‌آموز |

**پیامد داشبوردی:** مدیر مدرسه‌ای که هنوز هیچ داده‌ای ثبت نکرده، داشبورد «سالم/عالی» می‌دید — دقیقاً همان چیزی که اصل No-Masking پروژه ممنوع کرده است.

## ۳) یافته امنیتی: fail-open روی NaN (IQA-07)

`Number('abc') = NaN` در ۴ handler بدون اعتبارسنجی:
- **بازتولید baseline:** superadmin با `school_id=abc` روی EI-18/19/20/21 → **۲۰۰ + snapshot کامل برای مدرسه NaN**.
- **پس از اصلاح:** هر ۴ مورد → `400 invalid_params`. اعتبارسنجی یکنواخت (عدد صحیح مثبت) به هر ۱۳ handler اضافه شد.
- نکته: برای نقش‌های مدرسه‌ای، گارد Zero-Trust فاز۶ (index.js:1168) زودتر 403 می‌دهد (fail-closed صحیح)؛ حفره فقط در مسیر superadmin/admin بود که از آن گارد معاف است.

## ۴) اصلاحات اعمال‌شده (breach → fix → regression)

| ID | موتور/لایه | اصلاح | وضعیت |
|---|---|---|---|
| IQA-01 | EI-09 engine | حذف ۶ مقدار جعلی؛ null + بلوک `data_quality`؛ شاخص سلامت با بازتوزیع وزن روی ابعاد دارای داده؛ وضعیت `NO_DATA`؛ تجمیع منطقه‌ای مدرسه بی‌داده را HEALTHY نمی‌شمارد | بسته ✅ |
| IQA-02 | EI-05 engine | حذف پیش‌فرض‌های ۱۰۰/۸۵/…؛ بعد بدون داده = null؛ `health_level=NO_DATA`؛ `data_coverage` | بسته ✅ |
| IQA-03 | EI-11 engine | هر ۵ رکن null-aware؛ شاخص کل فقط از رکن‌های دارای داده؛ میانگین ناحیه بدون مدارس بی‌داده | بسته ✅ |
| IQA-04 | EI-06 engine | نرخ حضور جعلی ۱۰۰٪ → null + `NO_DATA` | بسته ✅ |
| IQA-05 | EI-08 engine | نسبت اثربخشی جعلی 1.0 و نرخ حل → null + `data_quality` | بسته ✅ |
| IQA-06 | EI-02 engine | حذف جعل epoch-1970؛ رویداد بی‌زمان حذف و در `data_quality.invalid_timestamp_events_count` شمارش می‌شود | بسته ✅ |
| IQA-07 | routes (۱۳ handler) | اعتبارسنجی NaN→400 + بستن fail-open superadmin | بسته ✅ |
| IQA-08 | routes EI-13/14/15 | حذف تزریق داده جعلی route-ای؛ EI-13 سنجه‌ها از داده واقعی store محاسبه می‌شود؛ timestampهای ثابت `2026-09-18` در مسیر HTTP با زمان واقعی جایگزین شد | بسته ✅ |

## ۵) موارد OPEN — نیازمند تصمیم Tech Lead (عمداً دست نخورد)

1. **EI-16…21 ذاتاً synthetic هستند:** این ۶ موتور هیچ pipeline داده واقعی ندارند (policy-simulation با baseline جعلی 87.5/15.2؛ decision-command با ۲ تصمیم دمو `DEC-SCH*`؛ operational-execution با `defaultWorkflow`؛ outcome-evaluation با رکوردهای اثر 92.8؛ platform با `school_intelligence_score=86.5`؛ زنجیره E2E گواهی EI-21 با سیگنال 78.5/96.5). رفتارشان در تست‌های deterministic موجود pin شده است. **اقدام انجام‌شده:** پاسخ HTTP آن‌ها اکنون `data_provenance: SYNTHETIC_BASELINE` با هشدار صریح فارسی دارد تا خروجی به‌عنوان سنجه واقعی قالب نشود. **اصلاح ریشه‌ای = تصمیم محصولی** (اتصال داده واقعی یا حذف از سطح API).
2. **پیش‌فرض‌های engine-سطح EI-13/14/15:** موتورها هنوز در نبود ورودی، درون خودشان default می‌سازند (مثلاً explainability=90، feedback_quality=50، chronic جعلی 14.2). لایه route دیگر آن مسیر را فعال نمی‌کند، اما پاکسازی engine-سطح test-pinned است و نیاز به بازنگری قرارداد دارد.
3. **EI-01…08 بدون مسیر HTTP** (به‌جز EI-09..21؛ مطابق roadmap :206-220). شکاف wiring از قبل شناخته‌شده و NOT VERIFIED است.
4. **ناهمگونی 401/403/400:** EI-21 برای بی‌هویت 401 می‌دهد، بقیه 403؛ برای شناسه خراب، نقش‌های مدرسه‌ای 403 (گارد فاز۶) و ادمین 400. fail-closed است ولی قرارداد یکدست نیست.
5. **خودترمیمی tests/run.js:** اولین اجرا پس از `git checkout index.html` همیشه 34/35 است و اجرای دوم 35/35 (روی baseline هم عیناً بازتولید شد — مستقل از تغییرات این شاخه).

## ۶) رگرسیون نهایی (همه پس از اصلاحات، روی 8ab817a)

| سوئیت | نتیجه |
|---|---|
| باتری D1–D7 (جدید) | **249/249** ✅ |
| لایه معنایی `tests/semantic-layer/runner.js` | **33/33** ✅ |
| `tests/run.js` | **35/35** ✅ |
| دودی `tests/smoke.js` | **547/547** ✅ |
| RESTful API `tests/api/runner.js` | **31/31** ✅ (۳۰ قبلی + سوئیت جدید EI-09/10) |
| بازتولید نقض NaN روی baseline / بسته‌شدن روی شاخه | 200→400 در هر ۴ endpoint ✅ |

## ۷) احکام ۲۱ موتور (بدون CERTIFIED)

| موتور | حکم | | موتور | حکم |
|---|---|---|---|---|
| EI-01 semantic | VERIFIED-E3 | | EI-12 longitudinal | VERIFIED-E3 |
| EI-02 student-timeline | VERIFIED-E3 (پس از IQA-06) | | EI-13 recommendation | PARTIAL |
| EI-03 assessment-int. | VERIFIED-E3 | | EI-14 feedback-memory | PARTIAL |
| EI-04 attendance-int. | VERIFIED-E3 | | EI-15 governance-dash | PARTIAL |
| EI-05 health-dashboard | VERIFIED-E3 (پس از IQA-02) | | EI-16 policy-simulation | OPEN (synthetic) |
| EI-06 parent-360 | VERIFIED-E3 (پس از IQA-04) | | EI-17 decision-command | OPEN (synthetic) |
| EI-07 teacher-evidence | VERIFIED-E3 | | EI-18 operational-exec | OPEN (synthetic؛ NaN بسته شد) |
| EI-08 intervention-mgmt | VERIFIED-E3 (پس از IQA-05) | | EI-19 outcome-eval | OPEN (synthetic) |
| EI-09 school-int-center | VERIFIED-E3 (پس از IQA-01) | | EI-20 platform-integr. | OPEN (synthetic) |
| EI-10 regional-network | VERIFIED-E3 | | EI-21 release-cert | OPEN (E1/synthetic؛ fingerprintها حاضر و قطعی) |
| EI-11 quality-governance | VERIFIED-E3 (پس از IQA-03) | | | |

PARTIAL = مسیر HTTP پاکسازی شد؛ residual در engine (تست‌pinned).
OPEN = بدون pipeline داده واقعی؛ اکنون با provenance صریح علامت‌گذاری شده.

## ۸) وضعیت انتشار

- شاخه: `arena-iqa/engine-audit-20260923` @ `8ab817a` — merge-base = main HEAD → قابلیت FF تمیز (Rule 31).
- **push انجام نشده**: بدون credential + طبق دستور شما «پوش با اعلام خودتان». patch در `arena_iqa_evidence/` آماده است.
- تغییرات Arena 9 (شاخه `arena9/...`, کامیت `5f0af4e`) طبق دستور به‌عنوان وابستگی فرض نشد؛ این شاخه مستقیماً از main ساخته شده و مستقل merge می‌شود.
- Merge نهایی: فقط با تأیید Tech Lead، به‌ویژه برای تغییر قرارداد پاسخ (nullهای جدید و بلوک‌های `data_quality`/`data_provenance`) که مصرف‌کننده داشبورد باید null-safe بخواند.
