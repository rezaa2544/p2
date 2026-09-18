# مدل هوشمندی حضور و غیاب و تحلیل ریسک آموزشی (P0-EI-04)
## Attendance Intelligence Engine Specification & Data Contract

**نسخه:** ۱.۰.۰  
**وضعیت:** مصوب (Approved)  
**ماژول مرجع:** `server/analytics/attendance-intelligence.js`  
**آزمون‌های مرجع:** `tests/semantic-layer/attendance-intelligence/*.test.js`

---

## ۱. مقدمه و اصول راهنما

این سند مشخصات داده‌ای، فرمول‌های ریاضی قطعی، ساختار خروجی و قوانین چندمستأجری ماژول **هوشمندی حضور و غیاب آموزشی (Attendance Intelligence Engine)** را به صورت رسمی تعریف می‌کند.

### اصول معماری غیرقابل مذاکره:
1. **محاسبات ۱۰۰٪ قطعی (Deterministic):** بدون هیچ مدل پیش‌بینی احتمالاتی، تصادفی یا یادگیری ماشین جعبه‌سیاه؛ خروجی برای ورودی یکسان باید در تمام محیط‌ها بیت‌به‌بیت یکسان باشد.
2. **توابع ناب و ایمنی در برابر جهش (Pure Functions & Mutation Safety):** توابع نباید متغیرهای عمومی یا آرایه‌ها/اشیای ورودی را تغییر دهند. تمام پارامترها باید تحت اجرای `Object.freeze` پایداری کامل داشته باشند.
3. **ایزولاسیون کامل چندمستأجری با سقط قاطع (Fail-Closed Tenant Isolation):** داده‌های متعلق به مدارس مختلف به هیچ عنوان نباید با یکدیگر ترکیب شوند. در صورت مشاهده هرگونه عدم انطباق یا نشت مستأجر بیگانه، خطای قطعی `TENANT_ISOLATION_VIOLATION` با کد وضعیت مربوطه پرتاب می‌شود.
4. **سازگاری با Partition Pruning:** تمام کوئری‌های واکشی داده باید دارای فیلتر قطعی `school_id` و بازه زمانی `created_at` باشند.

---

## ۲. مشخصات شاخص‌های هوشمندی حضور (Attendance Metrics)

### ۲.۱. امتیاز پایایی ثبت حضور (Attendance Reliability Score)

امتیاز پایایی داده‌های حضور و غیاب در یک مدرسه یا کلاس از ترکیب خطی چهار مؤلفه کیفی در مقیاس ۰ تا ۱۰۰ به دست می‌آید:

$$Reliability = 0.35 \times Completeness + 0.25 \times Validity + 0.25 \times Freshness + 0.15 \times Consistency$$

1. **کامل بودن (Completeness):** نسبت روزها/جلسات دارای حضور ثبت‌شده به کل جلسات مورد انتظار تقویمی:
   $$Completeness = \min\left(100, \frac{\text{recorded\_sessions}}{\text{expected\_sessions}} \times 100\right)$$
2. **معتبر بودن (Validity):** نسبت رکوردهایی که دارای وضعیت مجاز (`present`, `absent`, `late`, `excused`)، شناسه معتبر دانش‌آموز و تاریخ معتبر هستند:
   $$Validity = \frac{\text{valid\_records}}{\text{total\_records}} \times 100$$
3. **به‌موقع بودن / تازگی (Freshness / Timeliness):** نسبت رکوردهایی که ثبت آنها در همان روز یا حداکثر در ۲۴ ساعت اولیه تشکیل کلاس در پایگاه داده ثبت شده است:
   $$Freshness = \frac{\text{timely\_recorded}}{\text{total\_records}} \times 100$$
4. **ثبات ارزیابی (Consistency):** یکنواختی ثبت حضور در روزهای مختلف هفته؛ معکوس انحراف معیار نرخ ثبت روزانه نرمال‌شده:
   $$Consistency = \max\left(0, 100 - (CV_{\text{daily}} \times 100)\right)$$

---

### ۲.۲. کشف و سطح‌بندی غیبت مزمن (Chronic Absence Detection)

بر مبنای استانداردهای بین‌المللی ارزیابی آموزشی، غیبت مزمن به عنوان نسبت زمان آموزش از دست رفته (مجموع غیبت‌های غیرموجه و موجه) به کل جلسات واجد شرایط تعریف می‌شود:

$$AbsenceRate = \frac{N_{\text{absent}} + N_{\text{excused}}}{N_{\text{total\_sessions}}}$$

- **شرط کف مشاهدات (Minimum Sessions Floor):** دانش‌آموز باید حداقل در **۵ جلسه** آموزشی ثبت‌نام و شرکت داشته باشد تا واجد شرایط بررسی غیبت مزمن شناخته شود ($N_{\text{total\_sessions}} \ge 5$).
- **غیبت مزمن (CHRONIC):**
  $$AbsenceRate \ge 0.10 \quad (10\%)$$
- **غیبت بحرانی (CRITICAL):**
  $$AbsenceRate \ge 0.20 \quad (20\%)$$

---

### ۲.۳. الگوی غیبت‌های متوالی و متمرکز (Consecutive Absence Pattern)

الگوهای رفتاری غیبت نیازمند تفکیک زمانی هستند:
1. **غیبت متوالی غیرموجه (Consecutive Unexcused Streak):**
   - وقوع **۳ جلسه غیبت متوالی غیرموجه** نشانهٔ زودهنگام ترک تحصیل بالقوه، بحران خانوادگی یا مشکلات ایمنی دانش‌آموز است.
2. **غیبت‌های پراکنده در پنجره زمانی کوتاه (Scattered Absence Pattern):**
   - وقوع **۵ جلسه غیبت در یک بازه کوتاه‌مدت** (مانند ۱۰ الی ۱۴ روز تقویمی)، حتی در صورتی که نرخ کلی سالانه هنوز به ۱۰٪ نرسیده باشد، نشان‌دهندهٔ الگوی فرار از مدرسه یا مشکلات سازمان‌یافته است.

---

### ۲.۴. پروفایل هفتگی غیبت (Weekly Absence Profile)

در تقویم آموزشی ایران، روزهای کاری از شنبه تا چهارشنبه هستند. خروجی پروفایل هفتگی به شرح زیر محاسبه می‌شود:
- `saturday`: تعداد و نرخ غیبت در روز شنبه.
- `sunday`: تعداد و نرخ غیبت در روز یکشنبه.
- `monday`: تعداد و نرخ غیبت در روز دوشنبه.
- `tuesday`: تعداد و نرخ غیبت در روز سه‌شنبه.
- `wednesday`: تعداد و نرخ غیبت در روز چهارشنبه.
- `highest_risk_day`: روزی از هفته که بیشترین فراوانی و نرخ غیبت را دارد (مثلاً `saturday` یا `wednesday`).

---

### ۲.۵. هوشمندی تأخیر در ورود (Late Arrival Intelligence)

تأخیر در ورود در صورت تکرار، افت تحصیلی را به دنبال دارد. ماژول شاخص‌های زیر را استخراج می‌کند:
- `late_count`: مجموع تعداد روزهای تأخیر ثبت‌شده.
- `average_delay_minutes`: میانگین زمان تأخیر بر حسب دقیقه برای جلسات دارای تأخیر:
  $$\bar{T}_{\text{delay}} = \frac{\sum \text{late\_minutes}}{N_{\text{late}}}$$
- `trend`: روند شدت تأخیرها با استفاده از شیب رگرسیون بر حسب زمان:
  - `INCREASING`: شیب مثبت معنادار (افزایش زمان یا تعداد تأخیرها).
  - `DECREASING`: شیب منفی (بهبود زمان ورود دانش‌آموز).
  - `STABLE`: شیب خنثی.
  - `INSUFFICIENT_DATA`: تعداد تأخیرها کمتر از ۳ مورد.

---

### ۲.۶. سطح‌بندی چندگانه ریسک حضور (Attendance Risk Level)

سطح نهایی ریسک دانش‌آموز با تجمیع شواهد در یکی از ۴ رده قطعی زیر قرار می‌گیرد:

| رده ریسک | معیارهای احراز (حداقل یک مورد) | شدت |
|---|---|:---:|
| **CRITICAL** | نرخ غیبت $\ge 20\%$، یا ۵ جلسه غیبت متوالی غیرموجه، یا همزمانی غیبت مزمن با روند صعودی شدید تأخیر | بسیار شدید |
| **HIGH** | نرخ غیبت بین ۱۰٪ تا ۲۰٪، یا ۳ جلسه غیبت متوالی، یا ۵ غیبت در پنجره ۲ هفته‌ای | بالا |
| **MEDIUM** | نرخ غیبت بین ۵٪ تا ۱۰٪، یا تکرار بیش از ۳ تأخیر با روند افزایشی | متوسط |
| **LOW** | نرخ غیبت کمتر از ۵٪ بدون هیچ‌گونه توالی غیبت یا تأخیر بحرانی | کم (طبیعی) |

---

## ۳. قرارداد ساختار داده‌ها (Schemas & Contracts)

### ۳.۱. خروجی `analyzeAttendanceQuality`
```typescript
interface AttendanceQualityResult {
  completeness: number;      // 0 - 100
  validity: number;          // 0 - 100
  consistency: number;       // 0 - 100
  freshness: number;         // 0 - 100
  reliability_score: number; // 0 - 100
  total_records: number;
  expected_sessions: number;
  unclassified_records: number;
  quality_grade: 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION' | 'POOR';
}
```

### ۳.۲. خروجی `detectAttendanceRisk`
```typescript
interface AttendanceRiskResult {
  student_id: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  absence_rate: number;      // e.g. 15.5
  total_sessions: number;
  absent_count: number;
  excused_count: number;
  late_count: number;
  consecutive_absent_streak: number;
  is_chronic: boolean;
  is_critical: boolean;
  evidence: string[];
  periods: Array<{
    type: 'CONSECUTIVE_ABSENCE' | 'CHRONIC_PERIOD' | 'SCATTERED_ABSENCE';
    start_date: string;
    end_date: string;
    session_count: number;
  }>;
}
```

### ۳.۳. خروجی `analyzeWeeklyAttendancePattern`
```typescript
interface WeeklyAttendancePatternResult {
  saturday: { count: number; total_sessions: number; rate: number };
  sunday: { count: number; total_sessions: number; rate: number };
  monday: { count: number; total_sessions: number; rate: number };
  tuesday: { count: number; total_sessions: number; rate: number };
  wednesday: { count: number; total_sessions: number; rate: number };
  highest_risk_day: 'saturday' | 'sunday' | 'monday' | 'tuesday' | 'wednesday' | null;
  pattern_detected: boolean;
  weekday_risk_profile: string; // e.g. "HIGHER_ON_SATURDAY_WEDNESDAY"
}
```

### ۳.۴. خروجی `analyzeLateArrival`
```typescript
interface LateArrivalResult {
  late_count: number;
  total_sessions: number;
  late_ratio: number;           // e.g. 12.5%
  average_delay_minutes: number;
  max_delay_minutes: number;
  trend: 'INCREASING' | 'DECREASING' | 'STABLE' | 'INSUFFICIENT_DATA';
  escalation_detected: boolean;
}
```

### ۳.۵. خروجی `generateAttendanceInsights`
```typescript
interface AttendanceInsight {
  type: 'CHRONIC_ABSENCE' | 'CONSECUTIVE_STREAK' | 'WEEKDAY_PATTERN' | 'LATE_ARRIVAL_ESCALATION' | 'DATA_QUALITY_WARNING';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  description: string;
  recommended_action: string;
  student_id?: number;
}
```
