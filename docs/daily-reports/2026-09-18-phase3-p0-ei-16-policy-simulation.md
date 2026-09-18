# گزارش تحویل مأموریت: لایه فرماندهی و شبیه‌سازی خط‌مشی‌های آموزشی (P0-EI-16)
## Educational Intelligence Command & Policy Simulation Layer Delivery Report

**پروژه:** سامانه ملی پایش مدارس (`rezaa2544/p2`)  
**فاز / گام:** Phase 3 — P0-EI-16  
**شاخهٔ اجرایی:** `feat/phase3-step16-policy-simulation`  
**مبنای کامیت (Base Commit):** آخرین کامیت گام P0-EI-15 به شناسه `37d26ed`  
**تاریخ گزارش:** ۲۰۲۶-۰۹-۱۸  

---

## ۱. ممیزی معماری و دستاوردهای راهبردی (Architecture & Strategy Audit)

سند ممیزی معماری در `docs/POLICY_SIMULATION_ENGINE_AUDIT.md` و مدل داده رسمی در `docs/POLICY_SIMULATION_ENGINE_MODEL.md` ثبت شد. اهم دستاوردهای این مأموریت عبارتند از:

1. **لایه فرماندهی و شبیه‌سازی پیشینی سیاست‌های آموزشی (Policy Simulation Layer):**
   - ایجاد موتور تحلیلی برای شبیه‌سازی پیش‌دستانه اثرات سیاست‌ها و مداخلات آموزشی قبل از تخصیص منابع و اعمال در مدرسه.
   - ممانعت از آزمون و خطای مدیریتی در محیط واقعی مدرسه و هدایت بهینه منابع انسانی و مشاوره‌ای.
2. **اصل غیرقابل مذاکره نظارت انسانی و تحریم مطلق اجرای خودکار سیاست:**
   - شبیه‌سازی صرفاً یک ابزار پشتیبان تصمیم (Decision Support System) است و هرگز سیاست را خودکار اجرا نمی‌کند (`automated_policy_execution: false`).
   - تحریم مطلق تصمیم‌گیری خودکار الگوریتمی (`automated_decision: false`).
   - تمامی تصمیمات نیازمند بررسی، تطبیق و تصویب صریح کاربر انسانی است (`requires_human_approval: true`).
3. **مدل شبیه‌سازی سه‌سناریویی مقایسه‌ای (`comparePolicyScenarios`):**
   - مقایسه سه‌گانه:
     - **`BASELINE`:** ادامه وضع موجود بدون مداخله و نمایش استهلاک تدریجی شاخص‌ها.
     - **`POLICY_INTERVENTION`:** سیاست پیشنهادی هدفمند (مانند طرح مداخله فشرده حضور یا کلاس‌های توانمندسازی).
     - **`ALTERNATIVE_POLICY`:** سناریوی جایگزین با شدت و ساختار منابع متفاوت (مانند تمرکز بر توانمندسازی خانواده‌ها).
   - تحلیل پیامد در ۵ بُعد کلیدی: $\Delta \text{GPA}$، $\Delta \text{Attendance}$، $\Delta \text{Engagement}$، بار کاری مداخله و تقاضای ساعت نیروی انسانی.
4. **مدیریت عدم قطعیت و افشای صریح فرضیات مدل:**
   - تعیین رده‌های اطمینان بر اساس پایداری داده‌های تاریخی (`confidence_level: HIGH / MEDIUM / LOW`).
   - افشای فرضیات بنیادین، محدودیت‌های مدل و کیفیت داده‌های ورودی.
5. **تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی مدارس (Zero-Ranking Guarantee):**
   - تحریم مطلق تولید فیلدهای رتبه، جداول لیگ، یا برچسب‌های بهترین/بدترین مدارس.
6. **تفکیک چندمستأجری و وب‌سرویس RESTful API:**
   - گارد امنیتی ضد نفوذ IDOR با شکست ایمن (`POLICY_SIMULATION_TENANT_ISOLATION_VIOLATION` / Fail-Closed).
   - ارائه وب‌سرویس استاندارد مسیر `GET /api/v1/analytics/policy-simulation?school_id=&region_id=&academic_year=&scenario_type=`.

---

## ۲. مشخصات و نتایج تست‌ها (Test Execution & Quality Gates)

### ۲.۱. رانر لایه معنایی آموزشی (`node tests/semantic-layer/runner.js`):
- **۲۸ سوئیت فعال** با پوشش کامل:
  - `scenario-builder.test.js`: ساخت و شبیه‌سازی سناریوهای پایه، مداخله و جایگزین.
  - `policy-comparison.test.js`: مقایسه تریدآف‌های سناریوها و راهنمای تصمیم‌گیری.
  - `impact-analysis.test.js`: برآورد دقیق شاخص‌های پسامداخله.
  - `uncertainty.test.js`: مدیریت عدم قطعیت و افشای فرضیات و محدودیت‌ها.
  - `human-review.test.js`: تحریم اجرای خودکار سیاست و الزام تصویب انسانی.
  - `no-ranking.test.js`: تضمین قطعی عدم تولید جدول رتبه‌بندی رقابتی.
  - `privacy.test.js`: حفظ حریم خصوصی و عدم نشت شناسه‌ها و کدهای ملی.
  - `deterministic.test.js`: بازتولیدپذیری بیت‌به‌بیت در ۱۰ اجرای متوالی.
  - `mutation-safety.test.js`: ایمنی کامل در برابر جهش داده‌ها و فریز عمیق اشیا.
  - `tenant-isolation.test.js`: تفکیک چندمستأجری و سقط صریح Fail-Closed.
  - `index.test.js`: رانر تجمیعی آزمون‌های موتور شبیه‌سازی خط‌مشی.
- **نتیجه:** ۲۸/۲۸ سوئیت موفق — ۱۰۰٪ سبز.

### ۲.۲. رانر وب‌سرویس‌های بک‌اند (`node tests/api/runner.js`):
- **۱۳ سوئیت فعال** شامل اندپوینت جدید `tests/api/policy-simulation.test.js`:
  - SIM1: احراز هویت الزامی (401 برای درخواست ناشناس)
  - SIM2: اعتبارسنجی پارامترهای اجباری (400 برای فقدان شناسه)
  - SIM3: بازگردانی شناسنامه شبیه‌سازی برای مدیر مدرسه خودی (200)
  - SIM4: مهار نفوذ و تفکیک سازمانی مدیران (403)
  - SIM5: منع دسترسی نقش‌های غیرمجاز مانند دانش‌آموز (403)
  - SIM6: شبیه‌سازی سیاست منطقه‌ای بدون رتبه‌بندی مدارس (200)
- **نتیجه:** ۱۳/۱۳ سوئیت موفق — ۱۰۰٪ سبز.

### ۲.۳. تست‌های رگرسیون عمومی سامانه (`node tests/run.js`):
- ۳۵/۳۵ آزمون بدون خطا پاس شدند.

### ۲.۴. بررسی صحت بیلد کلاینت و کنترل دسترسی:
- `node build.js --check`: خروجی build با `index.html` بیت‌به‌بیت یکسان است.
- `node tools/check-authz.js`: تطبیق کامل ۳۹۴ اکشن و مجوزهای سرور.
- `node tests/secret-scan.js`: ۱۲/۱۲ سبز بدون نشت کلید یا اطلاعات حساس.
- `node tools/docs-stats-sync.js --check`: آمار ۴۱۲ سند پایدار و ۵۱۶ فایل تست کاملاً همگام است.
- `bash tools/docs-consistency-check.sh`: ۴۹ بخش هماهنگ و بدون تعارض.

---

## ۳. خلاصه فایل‌های ایجاد یا تغییر یافته

| ردیف | مسیر فایل | نوع تغییر | شرح وظیفه |
|:---:|---|:---:|---|
| ۱ | `server/analytics/policy-simulation-engine.js` | ایجاد جدید | موتور اصلی شبیه‌سازی سناریوها، مقایسه تریدآف‌ها، محاسبه اثرات و شناسنامه شبیه‌سازی |
| ۲ | `server/routes/analytics.js` | ویرایش | هندلر وب‌سرویس RESTful مسیر `policySimulationReport` |
| ۳ | `server/index.js` | ویرایش | اتصال مسیر `/api/v1/analytics/policy-simulation` |
| ۴ | `docs/POLICY_SIMULATION_ENGINE_AUDIT.md` | ایجاد جدید | ممیزی معماری شبیه‌سازی خط‌مشی و تحریم اجرای خودکار |
| ۵ | `docs/POLICY_SIMULATION_ENGINE_MODEL.md` | ایجاد جدید | سند مشخصات مدل داده، تعاریف ثابت‌ها و فرمول‌ها نسخه ۱.۰.۰ |
| ۶ | `tests/semantic-layer/policy-simulation/*` | ایجاد ۱۱ فایل | ۱۰ ماژول آزمون مجزا و رانر تجمیعی موتور شبیه‌سازی |
| ۷ | `tests/semantic-layer/runner.js` | ویرایش | ارتقای رانر لایه معنایی به ۲۸ سوئیت فعال |
| ۸ | `tests/api/policy-simulation.test.js` | ایجاد جدید | آزمون ادغام وب‌سرویس RESTful API با احراز هویت و کنترل نقش‌ها |
| ۹ | `tests/api/runner.js` | ویرایش | ارتقای رانر RESTful API به ۱۳ سوئیت فعال |
| ۱۰ | `docs/DOCS_INDEX.md` | ویرایش | ثبت اسناد جدید ممیزی و مدل در نمایه جامع مستندات |
| ۱۱ | `docs/DOCS_METRICS.md` · `docs/DOCUMENTATION_MAP.md` · `docs/TEST_COVERAGE_REPORT.md` | ویرایش | همگام‌سازی خودکار آمار مستندات و تست‌ها |
| ۱۲ | `docs/daily-reports/2026-09-18-phase3-p0-ei-16-policy-simulation.md` | ایجاد جدید | گزارش رسمی تحویل مأموریت |
