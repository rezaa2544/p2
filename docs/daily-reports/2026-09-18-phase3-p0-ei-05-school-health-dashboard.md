# گزارش تحویل مأموریت: داشبورد سلامت آموزشی و مرکز تصمیم‌گیری مدرسه (P0-EI-05)
## School Health Dashboard & Decision Center Delivery Report

**پروژه:** سامانه ملی پایش مدارس (`rezaa2544/p2`)  
**فاز / گام:** Phase 3 — P0-EI-05  
**شاخهٔ اجرایی:** `feat/phase3-step5-school-health-dashboard`  
**مبنای کامیت (Base Commit):** `9aff3c0f4f7d2eeafb7858c8942b0c36bbdcfd9c`  
**تاریخ گزارش:** ۲۰۲۶-۰۹-۱۸  

---

## ۱. ممیزی معماری (Architecture Audit)

ممیزی رسمی در سند `docs/SCHOOL_HEALTH_DASHBOARD_AUDIT.md` تدوین و ثبت شد. خلاصهٔ آسیب‌شناسی وضعیت پیشین و دستاوردهای پیاده‌سازی جدید:

1. **وضعیت پیشین سیستم:**
   - تابع اولیه `calculateSchoolEducationalHealth` در `semantic.js` صرفاً با ۴ متغیر ورودی تقریبی اجرا می‌شد و ارتباط ارگانیکی با موتورهای تخصصی هوشمندی سنجش، حضور و خط زمانی دانش‌آموز نداشت.
   - سرکوب وضعیت‌ها بسیار ضعیف بود و تنها در رتبه `EXCELLENT` اعمال اثر می‌کرد؛ در نتیجه بحران‌های حاد آموزشی در پشت میانگین‌های به ظاهر مطلوب پنهان می‌شدند.
2. **برطرف‌سازی شکاف‌های معنایی:**
   - ایجاد شاخص سلامت ۴ بعدی جامع و متوازن با وزن‌های مصوب (حضور ۳۰٪، سنجش ۲۵٪، پیشرفت یادگیری ۳۰٪، ارتقا و قبولی ۱۵٪).
   - استقرار مدل اولویت‌بندی مخاطرات و سطوح بحران (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`).
   - ایجاد مرکز اقدام روزانه مدیران (`Daily Action Center`) با تعیین نقش‌های هدف (`principal`, `vice_principal`, `counselor`, `teacher`)، مستندات عینی و مهلت اقدام.
   - پیاده‌سازی تجمیع سلسله‌مراتبی داده‌ها در ۴ لایه (مدرسه، پایه، کلاس، درس) با حفظ کامل حریم مستأجران.
   - تضمین اصل عدم پنهان‌سازی (`No-Masking Principle`) در سطح کلان داشبورد.

---

## ۲. پرونده‌های تغییریافته و ایجادشده (Changed Files)

| ردیف | مسیر فایل | نوع تغییر | شرح وظیفه |
|:---:|---|:---:|---|
| ۱ | `server/analytics/school-health-dashboard.js` | ایجاد جدید | موتور داشبورد سلامت مدرسه و مرکز تصمیم‌گیری (۵ تابع اصلی + گارد مستأجران) |
| ۲ | `docs/SCHOOL_HEALTH_DASHBOARD_AUDIT.md` | ایجاد جدید | سند ممیزی راهبردی داشبورد سلامت و مرکز اقدام مدیران |
| ۳ | `docs/SCHOOL_HEALTH_DASHBOARD_MODEL.md` | ایجاد جدید | سند مشخصات رسمی، فرمول‌های ریاضی و قرارداد داده‌ای نسخه ۱.۰.۰ |
| ۴ | `tests/semantic-layer/school-health-dashboard/health-index.test.js` | ایجاد جدید | آزمون شاخص ترکیبی سلامت و اعمال قانون No-Masking |
| ۵ | `tests/semantic-layer/school-health-dashboard/critical-issues.test.js` | ایجاد جدید | آزمون کشف طغیان غیبت مزمن، افت جمعی یادگیری و افت کیفیت آزمون |
| ۶ | `tests/semantic-layer/school-health-dashboard/action-center.test.js` | ایجاد جدید | آزمون تولید و اولویت‌بندی اقدامات روزانه مدیران |
| ۷ | `tests/semantic-layer/school-health-dashboard/aggregation.test.js` | ایجاد جدید | آزمون تجمیع سلسله‌مراتبی شاخص‌ها (مدرسه، پایه، کلاس، درس) |
| ۸ | `tests/semantic-layer/school-health-dashboard/executive-summary.test.js` | ایجاد جدید | آزمون خلاصه مدیریتی، نقاط قوت، مخاطرات و اقدامات |
| ۹ | `tests/semantic-layer/school-health-dashboard/deterministic.test.js` | ایجاد جدید | آزمون قطعیت و انطباق بیت‌به‌بیت در ۱۰ اجرای متوالی همزمان |
| ۱۰ | `tests/semantic-layer/school-health-dashboard/mutation-safety.test.js` | ایجاد جدید | آزمون ایمنی در برابر جهش با اشیای منجمد (`Object.freeze`) |
| ۱۱ | `tests/semantic-layer/school-health-dashboard/tenant-isolation.test.js` | ایجاد جدید | آزمون مسدودسازی قاطع نشت مستأجران بیگانه (`Fail-Closed`) |
| ۱۲ | `tests/semantic-layer/school-health-dashboard/index.test.js` | ایجاد جدید | رانر جامع تجمیعی سوئیت‌های ۸‌گانه داشبورد سلامت |
| ۱۳ | `tests/semantic-layer/runner.js` | ویرایش | اتصال سوئیت به رانر جامع و ارتقای دروازه لایه معنایی به ۱۷ سوئیت فعال |
| ۱۴ | `docs/DOCS_INDEX.md` | ویرایش | ثبت مراجع رسمی اسناد جدید در نمایه جامع مستندات |
| ۱۵ | `docs/DOCS_METRICS.md` | به‌روزرسانی ماشینی | همگام‌سازی آمار درخت پایدار مستندات (۳۹۰ سند) |
| ۱۶ | `docs/DOCUMENTATION_MAP.md` | به‌روزرسانی ماشینی | همگام‌سازی نقشه و وضعیت اسناد مخزن |
| ۱۷ | `docs/daily-reports/2026-09-18-phase3-p0-ei-05-school-health-dashboard.md` | ایجاد جدید | گزارش جامع تحویل مأموریت |

---

## ۳. مدل ریاضی و فرمول‌های محاسباتی (Mathematical Model)

### ۳.۱. فرمول شاخص سلامت ترکیبی (Composite Health Index):
$$HealthScore = 0.30 \times H_{\text{att}} + 0.25 \times H_{\text{assess}} + 0.30 \times H_{\text{learn}} + 0.15 \times H_{\text{comp}}$$

1. **سلامت حضور و تعامل ($H_{\text{att}}$ - ۳۰٪):**
   $$H_{\text{att}} = \max\left(0, \min\left(100, \text{AttendanceRate} - (1.5 \times \text{ChronicAbsenceRate})\right)\right)$$
2. **سلامت سنجش و آزمون‌ها ($H_{\text{assess}}$ - ۲۵٪):**
   $$H_{\text{assess}} = 0.40 \times \text{Reliability} + 0.40 \times \text{FairnessScore} + 0.20 \times \text{QualityScore}$$
3. **سلامت پیشرفت یادگیری ($H_{\text{learn}}$ - ۳۰٪):**
   $$H_{\text{learn}} = \max\left(0, \min\left(100, 50 + 50 \times (R_{\text{improving}} - R_{\text{declining}})\right)\right)$$
4. **سلامت ارتقا و قبولی ($H_{\text{comp}}$ - ۱۵٪):**
   $$H_{\text{comp}} = \max\left(0, \min\left(100, \text{PassRate} - (0.5 \times \text{FailureRate})\right)\right)$$

### ۳.۲. قانون قطعی عدم پنهان‌سازی (No-Masking Principle):
در صورتی که هر یک از شروط بحرانی زیر برقرار باشد:
- نرخ غیبت مزمن $\ge 20\%$
- نرخ مردودی نمرات $\ge 15\%$
- افت حاد کیفیت آزمون (پایایی یا عدالت $< 50$)
- نسبت افت پیشرفت یادگیری $> 35\%$

سطح سلامت مدرسه به صورت اجباری به حداقل **`NEEDS_INTERVENTION`** (و در صورت وجود ۲ بحران همزمان به **`CRITICAL`**) تنزل می‌یابد و پرچم `no_masking_applied = true` صادر می‌شود.

---

## ۴. نتایج آزمون‌های تحلیلی (Test Results)

تمامی ۸ سوئیت تست با موفقیت ۱۰۰٪ و بدون خطا پاس شدند:

```text
═══════════════════════════════════════════════════════════════════
  P0-EI-05: School Health Dashboard & Decision Center Suite
═══════════════════════════════════════════════════════════════════

▸ تست ۱: شاخص سلامت ترکیبی مدرسه و اصل عدم پنهان‌سازی (Health Index & No-Masking)
  ✅ صحت محاسبه ابعاد چهارگانه و اعمال قاطع اصل عدم پنهان‌سازی (No-Masking)
▸ تست ۲: کشف نقاط بحرانی و مخاطرات حاد آموزشی (detectSchoolCriticalIssues)
  ✅ کشف دقیق طغیان غیبت مزمن، افت جمعی یادگیری و افت کیفیت آزمون‌ها
▸ تست ۳: مرکز تصمیم‌گیری و اقدامات روزانه مدیران (generateDailyActionCenter)
  ✅ تفکیک وظایف بر مبنای نقش، تعیین مهلت‌های زمانی و اولویت‌بندی قطعی اقدامات
▸ تست ۴: تجمیع ماتریسی شاخص‌ها (School, Grade Level, Class, Subject)
  ✅ صحت تجمیع سلسله‌مراتبی داده‌ها در چهار لایه ساختاری مدرسه
▸ تست ۵: تولید خلاصه مدیریتی راهبردی (generateExecutiveSummary)
  ✅ استخراج نقاط قوت، احصای مخاطرات و ارائه گزارش راهبردی به مدیر
▸ تست ۶: آزمون قطعیت و بازتولیدپذیری بیت‌به‌بیت (Deterministic 10-Execution)
  ✅ قطعیت ۱۰۰٪: ده اجرای متوالی تمامی توابع خروجی‌های بیت‌به‌بیت یکسان تولید کردند
▸ تست ۷: ایمنی در برابر جهش داده‌ها و انجماد اشیا (Object.freeze Mutation Safety)
  ✅ پایداری کامل در برابر اشیای منجمد: تمامی ورودی‌ها بدون تغییر باقی ماندند
▸ تست ۸: ایزولاسیون چندمستأجری و سقط قاطع نشت داده (Fail-Closed Tenant Isolation)
  ✅ مسدودسازی قاطع نشت مستأجران (Fail-Closed) در تمامی توابع داشبورد سلامت

✅ تمامی ۸ سوئیت آزمون داشبورد سلامت و مرکز تصمیم‌گیری با موفقیت پاس شدند.
```

---

## ۵. نتایج گیت‌های کیفیت سامانه (Quality Gates)

1. **دروازه لایه معنایی آموزشی (`node tests/semantic-layer/runner.js`):**
   - **۱۷ از ۱۷ سوئیت موفق (۱۰۰٪ سبز)** شامل آزمون‌های جهش، قطعیت، ایزولاسیون و سلامت مدرسه.
2. **تست‌های پایه‌ای مخزن (`node tests/run.js`):**
   - **۳۵ از ۳۵ تست موفق** و تضمین کامل استقلال آفلاین و عدم وابستگی خارجی.
3. **کنترل خروجی بیلد و تطابق کدها (`node build.js --check`):**
   - انطباق بیت‌به‌بیت خروجی بیلد با `index.html`.
4. **کنترل مجوزهای دسترسی و نقش‌ها (`node tools/check-authz.js`):**
   - ۳۹۴ اکشن بررسی شد و تمامی ۱۹۹ اکشن نویسنده در `WRITE_PERMS` تطبیق داده شدند.
5. **اسکن امنیتی نشت توکن‌ها و اسرار (`node tests/secret-scan.js`):**
   - اسکن ۱۵۱۱ فایل: ۱۲ از ۱۲ کنترل کاملاً سبز و عاری از هرگونه کلید، پسورد یا توکن.
6. **کنترل همگام‌سازی آماری مستندات (`node tools/docs-stats-sync.js --check`):**
   - تطابق ۳۹۰ سند پایدار در مخزن تأیید شد.
7. **بررسی عدم تعارض داده‌های مخزن (`bash tools/docs-consistency-check.sh`):**
   - ۴۹ سنجه هماهنگ و ۰ تعارض آماری یا معماری.

---

## ۶. مشخصات کامیت ثبت‌شده (Commit SHA)

```text
commit ebbd810518fca99d416dbaacb28abbf987af2fd6 (HEAD -> feat/phase3-step5-school-health-dashboard)
Author: Chat1 <chat1@payesh.internal>
Date:   Fri Sep 18 02:33:36 2026 +0000

    feat(phase3): implement School Health Dashboard and Decision Center with no-masking educational risk aggregation (P0-EI-05)
```

---

## ۷. وضعیت شاخه (Branch Status)

```text
On branch feat/phase3-step5-school-health-dashboard
nothing to commit, working tree clean
```
*(عملیات Push طبق قواعد غیرقابل مذاکره انجام نشده و کامیت به صورت محلی و تمیز تثبیت شده است).*
