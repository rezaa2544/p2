# گزارش جامع تحویل گام‌های ۱ تا ۵ فاز ۳: هوشمندی آموزشی پایش (Educational Intelligence Foundation)

**تاریخ:** ۲۸ شهریور ۱۴۰۵ (2026-09-18)  
**شاخه اجرایی:** `feat/phase3-step1-semantic-layer`  
**بندهای تحویلی نقشه‌راه:** P0-EI-01, P0-EI-02, P0-EI-03, P0-EI-04, P0-EI-05  
**وضعیت پیاده‌سازی:** ۱۰۰٪ کامل، سبز و تأییدشده در تمامی گیت‌های آزمون و اعتبارسنجی  

---

## ۱. خلاصه اجرایی و دستاوردها

در این جلسه، زیرساخت بنیادین «هوشمندی آموزشی و تصمیم‌یار مدارس» (Phase 3 Educational Intelligence Foundation) مطابق با مفاد مصوب سند بالادستی `docs/roadmaps/ROADMAP_V3_EDUCATIONAL_INTELLIGENCE.md` با رعایت کامل قواعد معماری ملی (عدم استفاده از مدل‌های جعبه‌سیاه/ML، قطعیت کامل محاسبات، امنیت چندمستأجری Fail-Closed، انطباق با هرس پارتیشن‌های PostgreSQL و ایمنی تغییرناپذیری) به مرحله بهره‌برداری کامل در سطح کد و آزمون رسید.

### ۵ ماژول کلیدی تحویل‌شده (P0):
1. **P0-EI-01 — لایه معنایی آموزشی (`server/analytics/semantic.js`):** منبع واحد حقیقت (Single Source of Truth) برای فرمول‌های رسمی نرخ حضور (تقویمی و خالص)، غیبت مزمن، توزیع آماری نمرات، روند پیشرفت یادگیری، سطوح تسلط تکوینی/تراکمی، رده مشارکت، سنجش آزمون و تکمیل تحصیلی.
2. **P0-EI-02 — موتور خط زمانی طولی دانش‌آموز (`server/analytics/timeline.js`):** تجمیع داده‌های چندساله تاریخی (`student_archive`) با پارتیشن‌های زنده، کشف افت‌های تحصیلی (`GROWTH_DIP`) و جهش‌های رشدی (`GROWTH_SPURT`) همراه با اندپوینت RESTful امن `GET /api/v1/students/:id/timeline`.
3. **P0-EI-03 — پایه تحلیل‌های سنجش و ارزشیابی (`server/analytics/assessment.js`):** سنجش پوشش آزمون، رصد تأخیرهای ثبت، کشف نمرات پرت با روش آماری حصارهای توکی (Tukey's Fences)، نمره ترکیبی کیفیت داده (Composite DQS) و اندپوینت `GET /api/v1/grades/analytics`.
4. **P0-EI-04 — پایه تحلیل‌های حضور و غیاب (`server/analytics/attendance.js`):** محاسبه شاخص وقت‌شناسی و دقایق دیرکرد، کشف توالی غیبت‌های متوالی (پیشگیری زودهنگام از ترک تحصیل)، تحلیل روند روزهای هفته (شنبه تا چهارشنبه)، نمره کیفیت داده حضور و اندپوینت `GET /api/v1/attendance/analytics`.
5. **P0-EI-05 — داشبورد سلامت آموزشی مدرسه و مرکز اقدام روزانه (`server/analytics/school-health-dashboard.js`):** تجمیع نیمرخ ۴بعدی مدرسه، تضمین بدون مصالحه اصل عدم پنهان‌سازی (No-Masking Principle)، تولید وظایف اولویت‌دار در مرکز اقدام روزانه (Daily Action Center) همراه با پیشنهادات اقدام اصلاحی و اندپوینت `GET /api/v1/analytics/school-health`.

---

## ۲. مشخصات معماری و تدابیر امنیتی

### الف) اصل عدم پنهان‌سازی (No-Masking Principle)
میانگین‌های کلی بالا هرگز مجاز به پوشاندن یا ماسک‌کردن شکست‌های حاد نقطه‌ای نیستند. در صورتی که مدرسه‌ای با معدل کل ۱۸ دارای غیبت مزمن بالای ۲۰٪ یا توالی غیبت بحرانی باشد:
- شاخص سلامت آموزشی بلافاصله به وضعیت نیازمند مداخله تنزل می‌یابد.
- پرچم‌های بحرانی (`critical_flags`) به صورت مستقل و برجسته صادر می‌شوند.
- آیتم‌های اقدام فوری (`URGENT_INTERVENTION`) در مرکز اقدام روزانه برای مدیر و مشاوران درج می‌گردد.

### ب) سازگاری با هرس پارتیشن‌ها (Partition Pruning Compatibility)
کوئری‌سازهای تخصصی دیتابیس (`buildGradesKpiQuery`, `buildAttendanceKpiQuery`, `buildAssessmentAnalyticsQuery`, `buildAttendanceAnalyticsQuery`):
- جدول‌های پارتیشن‌بندی‌شده `grades` و `attendance` را هدف می‌گیرند (مبتنی بر مهاجرت‌های فاز ۲).
- شروط زمانی `created_at >= $X AND created_at < $Y` را به‌صورت پارامتری تولید می‌کنند که موتور برنامه‌ریزی PostgreSQL را قادر می‌سازد صرفاً پارتیشن‌های سال‌های تحصیلی مربوطه را بخواند.

### ج) ایزولاسیون کامل چندمستأجری (Fail-Closed Tenant Isolation)
کلیه ماژول‌های محاسباتی مجهز به تابع نگهبان `enforceTenantIsolation` هستند. در صورت ورود هر رکوردی با `school_id` مغایر با مدرسه هدف، پردازش بلافاصله متوقف شده و خطای صریح `TENANT_ISOLATION_VIOLATION` صادر می‌شود تا از کوچک‌ترین نشت داده میان مدارس جلوگیری گردد.

### د) ایمنی در برابر جهش داده‌ها (Mutation Safety)
تمام توابع تحلیلی خالص (Pure Functions) بوده و اشیای ورودی را تغییر نمی‌دهند. این ماژول‌ها به‌طور کامل با اشیای منجمدشده (`Object.freeze`) سازگار هستند و از عوارض جانبی (Side Effects) در زمان اجرا مبرا می‌باشند.

---

## ۳. جدول نتایج آزمون‌های اعتبارسنجی

| ردیف | نام سوئیت آزمون | فایل آزمون | تعداد سناریو | وضعیت |
|:---:|---|---|:---:|:---:|
| ۱ | نرخ حضور تقویمی و خالص | `tests/semantic-layer/attendance-rate.test.js` | ۶ | ✅ ۱۰۰٪ سبز |
| ۲ | نرخ غیبت مزمن و کف جلسات | `tests/semantic-layer/chronic-absence.test.js` | ۴ | ✅ ۱۰۰٪ سبز |
| ۳ | توزیع آماری نمرات و چارک‌ها | `tests/semantic-layer/grade-distribution.test.js` | ۵ | ✅ ۱۰۰٪ سبز |
| ۴ | روند یادگیری و شیب رگرسیون | `tests/semantic-layer/learning-trend.test.js` | ۴ | ✅ ۱۰۰٪ سبز |
| ۵ | شاخص سلامت آموزشی ۴بعدی | `tests/semantic-layer/school-health.test.js` | ۳ | ✅ ۱۰۰٪ سبز |
| ۶ | پروفایل پیشرفت یادگیرنده | `tests/semantic-layer/learner-progress.test.js` | ۴ | ✅ ۱۰۰٪ سبز |
| ۷ | رده تعامل و مشارکت در درس | `tests/semantic-layer/course-engagement.test.js` | ۳ | ✅ ۱۰۰٪ سبز |
| ۸ | روان‌سنجی آزمون (دشواری/تمایز) | `tests/semantic-layer/assessment-semantics.test.js` | ۳ | ✅ ۱۰۰٪ سبز |
| ۹ | تکمیل و ارتقای تحصیلی | `tests/semantic-layer/completion-semantics.test.js` | ۳ | ✅ ۱۰۰٪ سبز |
| ۱۰ | خلاصه فعالیت‌های آموزشی | `tests/semantic-layer/activity-summary.test.js` | ۲ | ✅ ۱۰۰٪ سبز |
| ۱۱ | خط زمانی چندساله دانش‌آموز | `tests/semantic-layer/longitudinal-timeline.test.js` | ۴ | ✅ ۱۰۰٪ سبز |
| ۱۲ | تحلیل‌های پایه سنجش و آزمون | `tests/semantic-layer/assessment-analytics.test.js` | ۷ | ✅ ۱۰۰٪ سبز |
| ۱۳ | تحلیل‌های پایه حضور و تأخیر | `tests/semantic-layer/attendance-analytics.test.js` | ۷ | ✅ ۱۰۰٪ سبز |
| ۱۴ | داشبورد سلامت و مرکز اقدام | `tests/semantic-layer/school-health-dashboard.test.js` | ۴ | ✅ ۱۰۰٪ سبز |
| ۱۵ | کوئری‌سازهای هرس پارتیشن | `tests/semantic-layer/query-builders.test.js` | ۳ | ✅ ۱۰۰٪ سبز |
| ۱۶ | آزمون‌های جهش (Mutations) | `tests/semantic-layer/mutations.test.js` | ۶ | ✅ ۶/۶ کشته شد |
| ۱۷ | قطعی‌بودن، عدم جهش و نشت | `tests/semantic-layer/deterministic-and-mutation.test.js` | ۶ | ✅ ۱۰۰٪ سبز |

**نتیجه رانر لایه معنایی (`node tests/semantic-layer/runner.js`):** ۱۷ سوئیت از ۱۷ سوئیت موفق (۱۰۰٪ پاس)  
**نتیجه رانر رگرسیون هسته (`node tests/run.js`):** ۳۵ تست از ۳۵ تست موفق (۱۰۰٪ پاس)  
**بررسی بیت‌به‌بیت خروجی Build (`node build.js --check`):** تطابق کامل و یکسان  
**انطباق مجوزهای دسترسی (`node tools/check-authz.js`):** تطبیق کامل ۳۹۴ اکشن  
**اسکن امنیتی و نشت توکن (`node tests/secret-scan.js`):** ۱۲ از ۱۲ بررسی سبز (۱۴۹۰ فایل اسکن‌شده)  
**همگام‌سازی مستندات (`node tools/docs-stats-sync.js --check`):** ۳۸۳ سند پایدار و ۵۱۰ تست رسمی مطابق دیسک  

---

## ۴. لیست فایل‌های تغییریافته و ایجادشده

### فایل‌های جدید ایجادشده:
1. `server/analytics/semantic.js` — لایه معنایی جامع محاسبات آموزشی
2. `server/analytics/timeline.js` — موتور خط زمانی طولی دانش‌آموز
3. `server/analytics/assessment.js` — موتور تحلیل‌های سنجش و آزمون
4. `server/analytics/attendance.js` — موتور تحلیل‌های حضور و تأخیر
5. `server/analytics/school-health-dashboard.js` — موتور داشبورد سلامت و مرکز اقدام
6. `docs/EDUCATIONAL_SEMANTIC_MODEL.md` — سند رسمی قرارداد داده و تعاریف ریاضی
7. `tests/semantic-layer/` — ۱۷ فایل آزمون واحد، جهش و سناریوهای یکپارچه‌سازی

### فایل‌های به‌روزرسانی‌شده:
1. `server/routes/students.js` — افزودن تابع `getStudentTimeline` با کنترل‌های PG-Authoritative
2. `server/routes/grades.js` — افزودن تابع `getAssessmentAnalytics`
3. `server/routes/attendance.js` — افزودن تابع `getAttendanceAnalytics`
4. `server/index.js` — تعریف مسیرهای RESTful جدید در لایه سرور
5. `docs/NATIONAL_ROADMAP_PROGRESS.md` — ثبت امواج ۲۵، ۲۶، ۲۷، ۲۸ و ۲۹ در ماتریس پیشرفت ملی

---

## ۵. شواهد کامیت‌های گیت

- کامیت `f0013a4`: `feat(phase3): P0-EI-01 Educational Semantic Layer (formulas, data contract, partition-pruning query builders, 7/7 test suites & mutations)`
- کامیت `54505c1`: `feat(phase3): expand Educational Semantic Layer with learner progress, course engagement, assessment quality, completion, and activity summary semantics (13/13 test suites)`
- کامیت `f4a57f9`: `feat(phase3): implement Longitudinal Student Timeline engine with multi-year aggregation, growth trajectories, and PG-live REST endpoint (P0-EI-02)`
- کامیت `3b1ba58`: `feat(phase3): implement Assessment Analytics Foundation (coverage, timeliness, Tukey's outliers, composite DQS, partition-pruning query, REST API) (P0-EI-03)`
- کامیت `da99a42`: `feat(phase3): implement Attendance Analytics Foundation (punctuality, truancy streaks, day-of-week trends, composite DQS, partition-pruning query, REST API) (P0-EI-04)`
- کامیت `fb1be3f`: `feat(phase3): implement School Educational Health Dashboard with No-Masking guarantee, Daily Action Center, and PG-live REST endpoint (P0-EI-05)`
