# قرارداد مدل هوشمندی سنجش و ارزشیابی آموزشی (Assessment Intelligence Model)

**نسخه:** 1.0.0  
**کد پروژه:** P0-EI-03 — فاز ۳ هوشمندی آموزشی پایش  
**ماژول پیاده‌سازی:** `server/analytics/assessment-intelligence.js`  
**وضعیت:** مصوب و فعال (Approved / Active)  

---

## ۱. هدف و دامنه کاربرد

موتور هوشمندی سنجش و ارزشیابی آموزشی (Assessment Intelligence Engine) با هدف ارتقای کیفیت طراحی، اجرا و تحلیل آزمون‌های مدارس و جلوگیری از سوگیری‌های ناخواسته، نمرات صوری و بی‌ثباتی در سنجش توسعه یافته است.

این موتور بر مبنای **نظریه کلاسیک آزمون (Classical Test Theory - CTT)** و **آمار توصیفی قطعی (Deterministic Descriptive Statistics)** عمل کرده و فاقد هرگونه مدل جعبه سیاه یا پیش‌بینی هوش مصنوعی غیرقابل توضیح می‌باشد.

---

## ۲. مشخصات فرمول‌ها و مبانی ریاضی (Formula Reference)

### ۲.۱. ضریب دشواری آزمون و سوال (Difficulty Index: $p$-value)

- **سطح آزمون (بر مبنای نمرات ۲۰):**
  $$p = \frac{\bar{X}}{\text{MaxScore}} = \frac{\frac{1}{n}\sum_{i=1}^n X_i}{20}$$
- **سطح سوال (بر مبنای پاسخ‌ها):**
  $$p_j = \frac{\text{تعداد پاسخ‌های صحیح به سوال } j}{\text{کل پاسخ‌ها به سوال } j}$$
- **طبقه‌بندی استاندارد:**
  - $p < ۰٫۴۵$: **`HARD`** (دشوار)
  - $۰٫۴۵ \le p \le ۰٫۷۵$: **`BALANCED`** (متعادل و استاندارد)
  - $p > ۰٫۷۵$: **`EASY`** (بسیار آسان / اثر سقف)

---

### ۲.۲. شاخص تمایز (Discrimination Index: $D$)

تفکیک آزمودنی‌ها به ترتیب صعودی نمرات و انتخاب ۲۷٪ بالای توزیع ($Top_{27\%}$) و ۲۷٪ پایین توزیع ($Bottom_{27\%}$):

$$D = \frac{\bar{X}_{top} - \bar{X}_{bottom}}{\text{MaxScore}}$$

- **سطوح کیفی تمایز:**
  - $D \ge ۰٫۴۰$: **`EXCELLENT`** (تمایز عالی؛ سوالات به خوبی دانش‌آموزان قوی و ضعیف را جدا می‌کنند)
  - $۰٫۳۰ \le D < ۰٫۴۰$: **`GOOD`** (تمایز خوب؛ استاندارد آزمون‌های پیشرفت تحصیلی)
  - $۰٫۲۰ \le D < ۰٫۳۰$: **`ACCEPTABLE`** (تمایز مرزی و قابل قبول)
  - $D < ۰٫۲۰$: **`POOR`** (تمایز ضعیف؛ سوالات نیاز به بازبینی و اصلاح گزینه‌ها دارند)

---

### ۲.۳. کشف ناهنجاری‌ها با روش حصارهای توکی (Tukey's Fences)

- مرتب‌سازی نمرات معتبر: $s_1 \le s_2 \le \dots \le s_n$
- محاسبه چارک اول ($Q_1$) در موقعیت $\lfloor ۰٫۲۵ \times n \rfloor$
- محاسبه چارک سوم ($Q_3$) در موقعیت $\lfloor ۰٫۷۵ \times n \rfloor$
- دامنه میان‌چارکی: $IQR = Q_3 - Q_1$
- **حصار پایین (Lower Fence):** $\max(0, Q_1 - 1.5 \times IQR)$
- **حصار بالا (Upper Fence):** $\min(20, Q_3 + 1.5 \times IQR)$
- هر نمره‌ای بیرون از این حصارها به عنوان داده پرت (`LOW_OUTLIER` یا `HIGH_OUTLIER`) گزارش می‌شود.

---

### ۲.۴. کشف خوشه‌بندی غیرطبیعی (Unnatural Clustering / Border Spike)

در صورتی که در یک آزمون بیش از ۳۵٪ از کل دانش‌آموزان با نمره بین ۹٫۵ تا ۱۰٫۵ تجمع یابند، پرچم اخطار دستکاری یا ارفاق مصنوعی (`PASS_THRESHOLD_SPIKE`) صادر می‌شود.

---

### ۲.۵. ارزیابی عدالت سنجش (Assessment Fairness Score)

- **شکاف بین کلاسی (Inter-Class Gap):**
  $$\Delta_{\text{classes}} = \max(\bar{X}_c) - \min(\bar{X}_c)$$
- در صورتی که $\Delta_{\text{classes}} \ge ۳٫۰$ نمره باشد، هشدار `CLASS_DISPARITY_ALERT` فعال شده و از نمره عدالت کسر می‌گردد.
- **شاخص برابری:**
  $$\text{Fairness Score} = \max(0, 100 - \text{penalties})$$
  - $\ge ۸۵$: **`EXCELLENT`**
  - $۷۰ - ۸۴$: **`FAIR`**
  - $< ۷۰$: **`NEEDS_REVIEW`**

---

### ۲.۶. نیمرخ سنجش معلم (Teacher Assessment Profile)

- ارزیابی پراکندگی، ثبات نمره‌دهی و نرخ قبولی کلاس‌های تحت تدریس معلم.
- **اصل بنیادین:** این نیمرخ صرفاً جهت بازخورد آموزشی و خودارزیابی حرفه‌ای طراحی شده و **هرگونه رتبه‌بندی یا اقدام تنبیهی مبتنی بر این شاخص ممنوع است**.

---

## ۳. قرارداد ورودی و خروجی توابع (API & Contract Schemas)

### ورودی `analyzeAssessmentQuality`:
```json
{
  "exam": { "id": 101, "school_id": 10, "max_score": 20 },
  "questions": [ { "id": 1, "max_score": 2 } ],
  "responses": [ { "student_id": 1001, "question_id": 1, "score": 2 } ],
  "grades": [ { "student_id": 1001, "score": 18, "max_score": 20 } ]
}
```

### خروجی `analyzeAssessmentQuality`:
```json
{
  "assessment_id": 101,
  "total_examinees": 35,
  "difficulty_index": 0.64,
  "difficulty_level": "BALANCED",
  "discrimination_index": 0.38,
  "discrimination_quality": "GOOD",
  "reliability_score": 0.81,
  "quality_level": "EXCELLENT",
  "pass_rate": 88.57,
  "data_quality": { "status": "HIGH_CONFIDENCE", "sample_size": 35 }
}
```

---

## ۴. قواعد ایزولاسیون چندمستأجری (Tenant Isolation Rules)

1. تمامی توابع ورودی `options.expectedSchoolId` را می‌پذیرند.
2. تابع نگهبان `enforceTenantIsolation` تک‌تک رکوردهای آزمون (`exam`)، نمرات (`grades`) و پاسخ‌ها (`responses`) را با شناسه مدرسه هدف مقایسه می‌کند.
3. در صورت مشاهده هر رکوردی با `school_id` مغایر، فرآیند فوراً متوقف شده و خطای ساخت‌یافته `TENANT_ISOLATION_VIOLATION` پرتاب می‌شود (Fail-Closed).
