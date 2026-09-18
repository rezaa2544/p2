# مدل داشبورد سلامت آموزشی و مرکز تصمیم‌گیری مدرسه (P0-EI-05)
## School Health Dashboard & Decision Center Specification & Data Contract

**نسخه:** ۱.۰.۰  
**وضعیت:** مصوب (Approved)  
**ماژول مرجع:** `server/analytics/school-health-dashboard.js`  
**آزمون‌های مرجع:** `tests/semantic-layer/school-health-dashboard/*.test.js`

---

## ۱. مقدمه و اصول معماری

این سند مشخصات فنی، قراردادهای JSON، فرمول‌های ریاضی و اصول راهبردی ماژول **داشبورد سلامت آموزشی مدرسه و مرکز تصمیم‌گیری (School Health Dashboard & Decision Center)** را تعریف می‌کند.

### اصول اساسی غیرقابل مذاکره:
1. **محاسبات ۱۰۰٪ قطعی (Deterministic):** بدون هیچ مدل احتمالاتی یا یادگیری ماشین جعبه سیاه؛ خروجی برای ورودی‌های یکسان در تمام اجراها بیت‌به‌بیت یکسان است.
2. **توابع ناب و پایداری در برابر جهش (Pure Functions & Mutation Safety):** هیچ تابعی مجاز به تغییر ورودی نیست؛ تمامی ورودی‌ها تحت `Object.freeze` اجرا می‌شوند.
3. **اصل عدم پنهان‌سازی (No-Masking Principle):** هیچ بحران حادی نباید در پس میانگین‌های کلان پنهان بماند. در صورت بروز هر پرچم بحرانی، رتبه کلان مدرسه فوراً تنزل می‌یابد.
4. **ایزولاسیون قطعی چندمستأجری (Fail-Closed Multi-Tenant Isolation):** در صورت مشاهده هر رکورد با `school_id` مغایر با مدرسه هدف، اجرای محاسبات فوراً متوقف شده و خطای `TENANT_ISOLATION_VIOLATION` پرتاب می‌شود.

---

## ۲. مدل ریاضی شاخص سلامت ترکیبی مدرسه (Composite Health Index)

شاخص کلی سلامت آموزشی مدرسه از ترکیب خطی ۴ بُعد استاندارد آموزشی با وزن‌های مصوب محاسبه می‌شود:

$$HealthScore = 0.30 \times H_{\text{att}} + 0.25 \times H_{\text{assess}} + 0.30 \times H_{\text{learn}} + 0.15 \times H_{\text{comp}}$$

### ۲.۱. ابعاد چهارگانه سلامت مدرسه:

1. **سلامت حضور و تعامل ($H_{\text{att}}$ - وزن ۳۰٪):**
   $$H_{\text{att}} = \max\left(0, \min\left(100, \text{AttendanceRate} - (1.5 \times \text{ChronicAbsenceRate})\right)\right)$$
2. **سلامت سنجش و امتحانات ($H_{\text{assess}}$ - وزن ۲۵٪):**
   ترکیبی از پایایی آزمون‌ها، امتیاز عدالت سنجش و ضریب تمایز:
   $$H_{\text{assess}} = 0.40 \times \text{Reliability} + 0.40 \times \text{FairnessScore} + 0.20 \times \text{DiscriminationQuality}$$
3. **سلامت پیشرفت یادگیری ($H_{\text{learn}}$ - وزن ۳۰٪):**
   مبتنی بر نسبت دانش‌آموزان در حال پیشرفت در برابر دانش‌آموزان دچار افت تحصیلی:
   $$H_{\text{learn}} = \max\left(0, \min\left(100, 50 + 50 \times (R_{\text{improving}} - R_{\text{declining}})\right)\right)$$
4. **سلامت ارتقا و قبولی ($H_{\text{comp}}$ - وزن ۱۵٪):**
   مبتنی بر نسبت قبولی کامل به تجدیدی و مردودی:
   $$H_{\text{comp}} = \max\left(0, \min\left(100, \text{PassRate} - (0.5 \times \text{FailureRate})\right)\right)$$

### ۲.۲. رده‌بندی اولیه سلامت:
- $HealthScore \ge 85 \Rightarrow \text{EXCELLENT}$
- $70 \le HealthScore < 85 \Rightarrow \text{GOOD}$
- $50 \le HealthScore < 70 \Rightarrow \text{NEEDS_INTERVENTION}$
- $HealthScore < 50 \Rightarrow \text{CRITICAL}$

### ۲.۳. قانون قطعی عدم پنهان‌سازی (No-Masking Enforcement):
اگر هر یک از شروط بحرانی زیر برقرار باشد:
1. نرخ غیبت مزمن $\ge 20\%$ (`chronic_absence_rate >= 20%`)
2. نرخ مردودی $\ge 15\%$ (`failure_rate >= 15%`)
3. بروز نقص بحرانی در سنجش (پایایی $< 50$ یا امتیاز عدالت $< 50$ یا وجود ناهنجاری ساختاری)
4. نسبت افت یادگیری $> 35\%$ (`declining_ratio > 35%`)

آن‌گاه:
- پرچم `no_masking_applied = true` ثبت می‌شود.
- رتبه سلامت مدرسه به صورت اجباری به حداقل **`NEEDS_INTERVENTION`** تنزل می‌یابد (و در صورت وجود ۲ بحران همزمان به **`CRITICAL`** تنزل پیدا می‌کند)، حتی اگر $HealthScore \ge 90$ باشد.

---

## ۳. قرارداد ساختار داده‌ها (Data Contracts)

### ۳.۱. خروجی `calculateSchoolHealthIndex`
```typescript
interface SchoolHealthResult {
  health_score: number;      // 0 - 100
  health_level: 'EXCELLENT' | 'GOOD' | 'NEEDS_INTERVENTION' | 'CRITICAL';
  dimensions: {
    attendance_health: number;
    assessment_health: number;
    learning_health: number;
    completion_health: number;
  };
  critical_flags: string[];
  no_masking_applied: boolean;
}
```

### ۳.۲. خروجی `detectSchoolCriticalIssues`
```typescript
interface CriticalIssue {
  issue_type:
    | 'CHRONIC_ABSENCE_SURGE'
    | 'COLLECTIVE_LEARNING_DECLINE'
    | 'ASSESSMENT_QUALITY_DEGRADATION'
    | 'HIGH_FAILURE_RISK'
    | 'DISENGAGEMENT_SPIKE';
  severity: 'CRITICAL' | 'HIGH' | 'WARNING';
  title: string;
  evidence: string[];
  affected_count: number;
}
```

### ۳.۳. خروجی `generateDailyActionCenter`
```typescript
interface ManagerialAction {
  action_type: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  target_role: 'principal' | 'vice_principal' | 'counselor' | 'teacher';
  title: string;
  description: string;
  evidence: string[];
  deadline: 'IMMEDIATE' | 'TODAY' | 'WITHIN_48_HOURS' | 'THIS_WEEK';
}
```

### ۳.۴. خروجی `aggregateSchoolEducationalMetrics`
```typescript
interface HierarchicalAggregationResult {
  school_id: number;
  school_summary: Record<string, any>;
  by_grade_level: Record<string, Record<string, any>>;
  by_class: Record<string, Record<string, any>>;
  by_subject: Record<string, Record<string, any>>;
}
```

### ۳.۵. خروجی `generateExecutiveSummary`
```typescript
interface ExecutiveSummaryResult {
  school_health: SchoolHealthResult;
  strengths: string[];
  risks: string[];
  recommended_actions: ManagerialAction[];
  generated_at: string;
}
```

---

## ۴. قواعد نگاشت شواهد و معانی اقدام (Action Semantics)

| نوع بحران | نقش هدف | اولویت | مهلت اقدام | اقدام توصیه‌شده |
|---|---|:---:|:---:|---|
| غیبت مزمن بالای ۲۰٪ | معاون آموزشی (`vice_principal`) | `CRITICAL` | `TODAY` | تماس فوری با اولیا و تشکیل جلسه اضطراری شورا |
| افت جمعی یادگیری در یک درس | مدیر مدرسه (`principal`) | `HIGH` | `WITHIN_48_HOURS` | جلسه بازخورد سازنده با دبیر مربوطه و بازبینی روش تدریس |
| کیفیت پایین یا عدم پایایی آزمون | دبیر مربوطه (`teacher`) | `HIGH` | `THIS_WEEK` | بازطراحی سؤالات آزمون و اصلاح کلید تصحیح |
| نرخ بالای مردودی در کلاس | مشاور تحصیلی (`counselor`) | `CRITICAL` | `TODAY` | برگزاری جلسات مشاوره انگیزشی و تدوین برنامه بهبود درسی |
