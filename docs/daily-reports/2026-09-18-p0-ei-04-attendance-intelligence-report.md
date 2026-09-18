# گزارش جامع تحویل مأموریت: موتور هوشمندی حضور و غیاب آموزشی (P0-EI-04)
## Attendance Intelligence Engine Delivery Report

**پروژه:** سامانه ملی پایش مدارس (`rezaa2544/p2`)  
**فاز / گام:** Phase 3 — P0-EI-04  
**شاخهٔ اجرایی:** `feat/phase3-step4-attendance-intelligence`  
**مبنای کامیت (Base Commit):** `94c51299ac7d9a2a7d239a786f1cc7836c6c273c`  
**هش کامیت محلی:** `9aff3c0f4f7d2eeafb7858c8942b0c36bbdcfd9c`  
**وضعیت درخت کاری:** `Clean` (تمامی تغییرات کامیت‌شده، بدون فایل‌های استیج‌نشده)  
**تاریخ گزارش:** ۲۰۲۶-۰۹-۱۸  

---

## ۱. ممیزی معماری (Architecture Audit)

ممیزی کامل در سند `docs/ATTENDANCE_INTELLIGENCE_AUDIT.md` ثبت و مصوب شد. خلاصهٔ آسیب‌شناسی وضعیت قبلی و راه‌حل‌های اعمال‌شده:

1. **وضعیت پیشین سیستم:**
   - توابع آماری در `server/analytics/semantic.js` صرفاً محدود به دو محاسبهٔ تجمعی بدون زمان (`calculateAttendanceRate` و `calculateChronicAbsence`) بودند.
   - رکوردهای حضور در `attendance` به صورت ایستا و بدون ارزیابی توالی زمانی یا روند فرسایشی تحلیل می‌شدند.
2. **شکاف‌های معنایی (Semantic Gaps):**
   - **فقدان امتیاز پایایی حضور (Attendance Reliability Score):** قبلاً شاخصی برای تفکیک «عدم ثبت دفتر حضور توسط دبیر» از «حضور کامل دانش‌آموزان» وجود نداشت که منجر به اریبی محاسباتی در رصد سلامت مدرسه می‌شد.
   - **فقدان تفکیک رفتاری غیبت‌ها:** عدم تفاوت‌گذاری میان غیبت‌های متوالی (Consecutive) ناشی از بیماری/حادثه با غیبت‌های پراکنده و مزمن (Chronic Habitual Absenteeism).
3. **نبود شاخص‌های پویای زمانی (Temporal Indicators):**
   - عدم امکان تشخیص شتاب‌گیری غیبت‌ها (Absence Acceleration Trend) پیش از رسیدن نرخ کلی به آستانهٔ ۱۰٪.
   - غفلت از تحلیل دقیق ستون `late_minutes` و عدم رهگیری روند تأخیر در ورود به مدرسه.
4. **نبود مدل ریسک چندسطحی و الگوی ایام هفته:**
   - خروجی سیستم تنها دو قطبی (عادی یا مزمن) بود؛ مدل ریسک نیازمند رده‌بندی ۴ سطحی (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) به همراه شواهد عینی (`evidence`) و دوره‌های زمانی (`periods`) بود.
   - الگوی پرتکرار غیبت در روزهای آغازین (شنبه) و پایانی (چهارشنبه) تقویم آموزشی ایران بررسی نمی‌شد.

---

## ۲. پرونده‌های تغییریافته و ایجادشده (Changed Files)

| ردیف | مسیر فایل | نوع تغییر | شرح عملکرد |
|:---:|---|:---:|---|
| ۱ | `server/analytics/attendance-intelligence.js` | ایجاد جدید | موتور هوشمندی حضور و غیاب شامل ۶ تابع خالص، قطعی و چندمستأجری |
| ۲ | `docs/ATTENDANCE_INTELLIGENCE_AUDIT.md` | ایجاد جدید | سند رسمی ممیزی قابلیت‌های هوشمندی حضور و تحلیل شکاف‌ها |
| ۳ | `docs/ATTENDANCE_INTELLIGENCE_MODEL.md` | ایجاد جدید | مشخصات رسمی، فرمول‌های ریاضی و قرارداد داده‌ای نسخه ۱.۰.۰ |
| ۴ | `tests/semantic-layer/attendance-intelligence/attendance-quality.test.js` | ایجاد جدید | آزمون جامع کیفیت ثبت، پایایی، جامعیت و طبقه‌بندی کیفی |
| ۵ | `tests/semantic-layer/attendance-intelligence/chronic-absence-detection.test.js` | ایجاد جدید | آزمون غیبت مزمن (۱۰٪) و بحرانی (۲۰٪) با شرط کف ۵ جلسه |
| ۶ | `tests/semantic-layer/attendance-intelligence/consecutive-pattern.test.js` | ایجاد جدید | آزمون توالی ۳ و ۵ جلسه غیبت متوالی و پنجره‌های متمرکز |
| ۷ | `tests/semantic-layer/attendance-intelligence/weekly-pattern.test.js` | ایجاد جدید | آزمون تفکیک روزهای شنبه تا چهارشنبه، تقویم شمسی و شناسایی روز پرریسک |
| ۸ | `tests/semantic-layer/attendance-intelligence/late-arrival.test.js` | ایجاد جدید | آزمون تحلیل دقایق تأخیر، شیب رگرسیون و هشدار تشدید تأخیر |
| ۹ | `tests/semantic-layer/attendance-intelligence/risk-classification.test.js` | ایجاد جدید | آزمون رده‌بندی ۴ سطحی ریسک و صدور بینش‌های هوشمند اقدام‌محور |
| ۱۰ | `tests/semantic-layer/attendance-intelligence/deterministic.test.js` | ایجاد جدید | آزمون قطعیت ۱۰ اجرای متوالی همزمان و انطباق بیت‌به‌بیت |
| ۱۱ | `tests/semantic-layer/attendance-intelligence/mutation-safety.test.js` | ایجاد جدید | آزمون ایمنی در برابر تغییرات با انجماد ورودی‌ها (`Object.freeze`) |
| ۱۲ | `tests/semantic-layer/attendance-intelligence/tenant-isolation.test.js` | ایجاد جدید | آزمون مسدودسازی قاطع نشت مستأجران بیگانه (`Fail-Closed`) |
| ۱۳ | `tests/semantic-layer/attendance-intelligence/index.test.js` | ایجاد جدید | رانر جامع تجمیعی سوئیت‌های ۹‌گانه هوشمندی حضور |
| ۱۴ | `tests/semantic-layer/runner.js` | ویرایش | ثبت سوئیت جدید و ارتقای دروازه لایه معنایی به ۱۶ سوئیت فعال |
| ۱۵ | `docs/DOCS_INDEX.md` | ویرایش | ثبت مراجع رسمی اسناد جدید در نمایه جامع مستندات |
| ۱۶ | `docs/DOCS_METRICS.md` | به‌روزرسانی ماشینی | همگام‌سازی آمار درخت پایدار مستندات (۳۸۸ سند) |
| ۱۷ | `docs/DOCUMENTATION_MAP.md` | به‌روزرسانی ماشینی | همگام‌سازی توزیع و وضعیت مستندات در جدول نقشه |
| ۱۸ | `docs/DOCS_CONSISTENCY_REPORT.md` | به‌روزرسانی ماشینی | تأیید انطباق ۴۹ سنجه رفرنس سیستم |

---

## ۳. مدل ریاضی و فرمول‌های رسمی (Mathematical Model)

### ۳.۱. امتیاز پایایی داده‌های حضور (Attendance Reliability Score)
ترکیب وزنی ۴ مؤلفه کیفی در مقیاس ۰ تا ۱۰۰:
$$Reliability = 0.35 \times Completeness + 0.25 \times Validity + 0.25 \times Freshness + 0.15 \times Consistency$$
- **جامعیت (Completeness):** نسبت جلسات ثبت‌شده به جلسات مورد انتظار تقویمی مدرسه.
- **اعتبار (Validity):** نسبت رکوردهای دارای مقادیر مجاز وضعیت حضور و شناسه‌های معتبر.
- **تازگی (Freshness):** درصد رکوردهایی که در همان روز جلسه یا ظرف ۲۴ ساعت ثبت شده‌اند.
- **ثبات (Consistency):** یکنواختی ثبت حضور در طول ایام و معکوس ضریب تغییرات روزانه ($100 - CV \times 50$).

### ۳.۲. نرخ آموزش از دست رفته و غیبت مزمن (Chronic Absence)
تعریف استاندارد نسبت زمان از دست رفته آموزشی:
$$AbsenceRate = \frac{N_{\text{absent}} + N_{\text{excused}}}{N_{\text{total\_sessions}}} \times 100$$
- **شرط کف مشاهدات:** $N_{\text{total\_sessions}} \ge 5$.
- **غیبت مزمن (`CHRONIC`):** $AbsenceRate \ge 10\%$.
- **غیبت بحرانی (`CRITICAL`):** $AbsenceRate \ge 20\%$.

### ۳.۳. الگوهای متوالی و متمرکز غیبت (Consecutive & Scattered Patterns)
- **توالی غیبت متوالی غیرموجه:** ثبت زنجیرهٔ متوالی جلسات غیبت غیرموجه؛ توالی $\ge 3$ نشانه خطر زودهنگام و توالی $\ge 5$ نشانگر ریسک بحرانی ترک تحصیل است.
- **غیبت‌های متمرکز در پنجره کوتاه:** وقوع ۵ جلسه غیبت در پنجره متحرک ۱۰ جلسه‌ای.

### ۳.۴. هوشمندی تأخیر در ورود (Late Arrival Intelligence)
- میانگین زمان تأخیر: $\bar{T}_{\text{delay}} = \frac{\sum \text{late\_minutes}}{N_{\text{late}}}$.
- شیب رگرسیون خطی دقایق تأخیر بر حسب زمان ($m$):
  $$m = \frac{n \sum xy - \sum x \sum y}{n \sum x^2 - (\sum x)^2}$$
  - $m > 0.5 \Rightarrow \text{INCREASING}$ (روند صعودی و تشدیدشونده).
  - $m < -0.5 \Rightarrow \text{DECREASING}$ (روند نزولی و بهبود).
  - مابقی $\Rightarrow \text{STABLE}$.
- کشف بحران تشدید تأخیر (`escalation_detected`): روند افزایشی به همراه میانگین تأخیر $\ge 20$ دقیقه یا تعداد تأخیر $\ge 5$.

### ۳.۵. سطوح چهارگانه ریسک حضور (Attendance Risk Level)
- **CRITICAL:** نرخ غیبت $\ge 20\%$، توالی $\ge 5$ جلسه غیبت متوالی، یا ترکیب غیبت مزمن با تشدید تأخیر.
- **HIGH:** نرخ غیبت بین ۱۰٪ تا ۲۰٪، توالی $\ge 3$ جلسه غیبت متوالی، یا ۵ غیبت متمرکز.
- **MEDIUM:** نرخ غیبت بین ۵٪ تا ۱۰٪، تکرار تأخیر، توالی ۲ جلسه، یا افت معنادار زمانی در نیمه دوم.
- **LOW:** حضور منظم و طبیعی با غیبت کمتر از ۵٪ بدون الگوی خطر.

---

## ۴. نتایج آزمون‌های تحلیلی (Test Results)

تمامی ۹ سوئیت تست با موفقیت ۱۰۰٪ و بدون خطا پاس شدند:

```text
═══════════════════════════════════════════════════════════════════
  P0-EI-04: Attendance Intelligence Engine Comprehensive Suite
═══════════════════════════════════════════════════════════════════

▸ تست ۱: تحلیل کیفیت و پایایی ثبت حضور (analyzeAttendanceQuality)
  ✅ صحت ارزیابی کیفیت ثبت، پایایی، جامعیت و طبقه‌بندی کیفی
▸ تست ۲: کشف و سطح‌بندی غیبت مزمن و بحرانی (Chronic & Critical Absence)
  ✅ تفکیک دقیق غیبت مزمن، غیبت بحرانی و اعمال شرط کف جلسات
▸ تست ۳: تحلیل الگوی غیبت‌های متوالی و متمرکز (Consecutive & Scattered)
  ✅ شناسایی توالی ۳ و ۵ جلسه غیبت متوالی و پنجره‌های غیبت متمرکز
▸ تست ۴: تحلیل الگوی هفتگی غیبت (Weekly Absence Pattern)
  ✅ تفکیک روزهای شنبه تا چهارشنبه، تشخیص روز با بیشترین ریسک و الگوی هفتگی
▸ تست ۵: هوشمندی تأخیر در ورود و روند افزایشی (Late Arrival Intelligence)
  ✅ صحت شمارش تأخیرها، میانگین دقایق، تحلیل شیب رگرسیون و کشف تشدید تأخیر
▸ تست ۶: سطح‌بندی ریسک حضور و تولید بینش‌های هوشمند (Risk Classification & Insights)
  ✅ تفکیک کامل سطوح چهارگانه ریسک (LOW, MEDIUM, HIGH, CRITICAL) و تولید بینش‌های هوشمند
▸ تست ۷: آزمون قطعیت و بازتولیدپذیری بیت‌به‌بیت (Deterministic 10-Execution)
  ✅ قطعیت ۱۰۰٪: ده اجرای متوالی تمامی توابع خروجی‌های بیت‌به‌بیت یکسان تولید کردند
▸ تست ۸: ایمنی در برابر جهش داده‌ها و انجماد اشیا (Object.freeze Mutation Safety)
  ✅ پایداری کامل در برابر اشیای منجمد: تمامی ورودی‌ها بدون تغییر باقی ماندند
▸ تست ۹: ایزولاسیون چندمستأجری و سقط قاطع نشت داده (Fail-Closed Tenant Isolation)
  ✅ مسدودسازی قاطع نشت مستأجران (Fail-Closed) در تمامی توابع هوشمندی حضور

✅ تمامی ۹ سوئیت آزمون هوشمندی حضور و غیاب با موفقیت پاس شدند.
```

---

## ۵. نتایج گیت‌های کیفیت سامانه (Quality Gates)

1. **دروازه لایه معنایی آموزشی (`node tests/semantic-layer/runner.js`):**
   - **۱۶ از ۱۶ سوئیت موفق (۱۰۰٪ سبز)** شامل آزمون‌های جهش، قطعیت و مقاومت در برابر خطا.
2. **تست‌های پایه‌ای مخزن (`node tests/run.js`):**
   - **۳۵ از ۳۵ تست موفق** و تضمین کامل استقلال آفلاین.
3. **کنترل خروجی بیلد و تطابق کدها (`node build.js --check`):**
   - انطباق بیت‌به‌بیت خروجی با `index.html`.
4. **کنترل مجوزهای دسترسی و نقش‌ها (`node tools/check-authz.js`):**
   - ۳۹۴ اکشن بررسی شد و تمامی ۱۹۹ اکشن نویسنده در `WRITE_PERMS` تطبیق داده شدند.
5. **اسکن امنیتی نشت توکن‌ها و اسرار (`node tests/secret-scan.js`):**
   - اسکن ۱۵۱۱ فایل: ۱۲ از ۱۲ کنترل کاملاً سبز و عاری از هرگونه کلید یا رمز عبور.
6. **کنترل همگام‌سازی آماری مستندات (`node tools/docs-stats-sync.js --check`):**
   - تطابق ۳۸۸ سند پایدار در مخزن تأیید شد.
7. **بررسی عدم تعارض داده‌های مخزن (`bash tools/docs-consistency-check.sh`):**
   - ۴۹ سنجه هماهنگ و ۰ تعارض آماری یا معماری.

---

## ۶. شناسه کامیت (Commit SHA)

```text
commit 9aff3c0f4f7d2eeafb7858c8942b0c36bbdcfd9c
Author: Chat1 <chat1@payesh.internal>
Date:   Fri Sep 18 02:44:07 2026 +0000

    feat(phase3): implement Attendance Intelligence Engine with chronic absence detection, temporal attendance risk analysis, late arrival intelligence, and actionable insights (P0-EI-04)

 18 files changed, 1674 insertions(+), 6 deletions(-)
 create mode 100644 docs/ATTENDANCE_INTELLIGENCE_AUDIT.md
 create mode 100644 docs/ATTENDANCE_INTELLIGENCE_MODEL.md
 create mode 100644 server/analytics/attendance-intelligence.js
 create mode 100644 tests/semantic-layer/attendance-intelligence/attendance-quality.test.js
 create mode 100644 tests/semantic-layer/attendance-intelligence/chronic-absence-detection.test.js
 create mode 100644 tests/semantic-layer/attendance-intelligence/consecutive-pattern.test.js
 create mode 100644 tests/semantic-layer/attendance-intelligence/deterministic.test.js
 create mode 100644 tests/semantic-layer/attendance-intelligence/index.test.js
 create mode 100644 tests/semantic-layer/attendance-intelligence/late-arrival.test.js
 create mode 100644 tests/semantic-layer/attendance-intelligence/mutation-safety.test.js
 create mode 100644 tests/semantic-layer/attendance-intelligence/risk-classification.test.js
 create mode 100644 tests/semantic-layer/attendance-intelligence/tenant-isolation.test.js
 create mode 100644 tests/semantic-layer/attendance-intelligence/weekly-pattern.test.js
```

---

## ۷. وضعیت شاخه (Branch Status)

```text
On branch feat/phase3-step4-attendance-intelligence
nothing to commit, working tree clean
```
*(طبق دستورالعمل اکید، عملیات Push بر روی سرور ریموت انجام نشده و کامیت به صورت محلی و تمیز تثبیت گردیده است).*
