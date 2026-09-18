# مدل داده و قرارداد رسمی حلقه بازخورد و حافظه راهبری یادگیری (P0-EI-14)
## Educational Intelligence Feedback Loop & Governance Memory Data Contract Specification

**شناسه سند:** `DATA-CONTRACT-P0-EI-14-FEEDBACK-LEARNING-MEMORY`  
**نسخه:** ۱.۰.۰  
**تاریخ انتشار:** ۲۰۲۶-۰۹-۱۸  
**وضعیت:** مصوب (Approved)  
**مرجع ذخیره‌سازی:** PostgreSQL (تولید)، SQLite/Memory (محیط آزمون)  

---

## ۱. ثابت‌ها و مجموعه‌های مقادیر مجاز (Enums & Constants)

### ۱.۱. تصمیمات بازخورد انسانی (`RECOMMENDATION_DECISION`)
```javascript
const RECOMMENDATION_DECISION = Object.freeze({
  APPROVED: 'APPROVED',       // اقدام پیشنهادی تأیید شد و وارد مرحله اجرا شد
  REJECTED: 'REJECTED',       // پیشنهاد توسط ناظر انسانی رد شد
  MODIFIED: 'MODIFIED'        // پیشنهاد با تعدیل در جزییات یا مهلت مصوب شد
});
```

### ۱.۲. علل استاندارد رد پیشنهاد (`REJECTION_REASONS`)
```javascript
const REJECTION_REASONS = Object.freeze({
  MISDIAGNOSIS: 'MISDIAGNOSIS',                       // عدم تطابق تحلیل با شرایط واقعی دانش‌آموز/مدرسه
  INSUFFICIENT_RESOURCE: 'INSUFFICIENT_RESOURCE',     // کمبود ظرفیت پرسنلی یا زیرساخت لازم برای اقدام
  INAPPROPRIATE_TIMING: 'INAPPROPRIATE_TIMING',       // زمان‌بندی نامناسب (نزدیکی به امتحانات، تعطیلات)
  ALREADY_ADDRESSED: 'ALREADY_ADDRESSED',             // مسئله پیش‌تر توسط کادر حل شده یا در دست اقدام است
  POLICY_CONFLICT: 'POLICY_CONFLICT',                 // تعارض با بخشنامه‌ها و دستورالعمل‌های محلی
  OTHER: 'OTHER'                                      // دلایل بافتاری دیگر با توضیح در یادداشت
});
```

### ۱.۳. سطوح پیامد و اثربخشی مداخله (`INTERVENTION_SUCCESS_LEVEL`)
```javascript
const INTERVENTION_SUCCESS_LEVEL = Object.freeze({
  HIGHLY_EFFECTIVE: 'HIGHLY_EFFECTIVE',         // بهبود بارز شاخص هدف و تحقق اهداف مداخله
  PARTIALLY_EFFECTIVE: 'PARTIALLY_EFFECTIVE',   // بهبود نسبی شاخص اما نیاز به پایش ادامه‌دار
  INEFFECTIVE: 'INEFFECTIVE',                   // عدم تغییر معنادار در شاخص‌ها
  REQUIRES_ESCALATION: 'REQUIRES_ESCALATION'    // تشدید ریسک و نیاز به ارجاع به لایه منطقه‌ای
});
```

### ۱.۴. سطوح بلوغ هوشمندی آموزشی (`MATURITY_LEVEL`)
```javascript
const MATURITY_LEVEL = Object.freeze({
  INITIAL: 'INITIAL',               // امتیاز ۰ تا ۳۹: اقدامات پراکنده و بدون ثبت بازخورد
  DEVELOPING: 'DEVELOPING',         // امتیاز ۴۰ تا ۶۴: ثبت بازخورد آغاز شده اما یادگیری سازمانی ناقص است
  ESTABLISHED: 'ESTABLISHED',       // امتیاز ۶۵ تا ۸۴: حلقه بازخورد کامل و الگوهای موفق شناسایی می‌شوند
  OPTIMIZED: 'OPTIMIZED'            // امتیاز ۸۵ تا ۱۰۰: استفاده فعال از حافظه سازمانی و کالیبراسیون توصیه‌ها
});
```

---

## ۲. مشخصات رکوردهای داده‌ای (Data Schemas)

### ۲.۱. رکورد بازخورد انسانی (`HumanFeedbackRecord`)
```typescript
interface HumanFeedbackRecord {
  feedback_id: string;              // e.g. "FDB-SCH01-2026-001"
  recommendation_id: string;        // ارجاع به ActionRecommendationRecord
  school_id: string | number;       // شناسه مستأجر مدرسه
  decision: 'APPROVED' | 'REJECTED' | 'MODIFIED';
  rejected_reason: string | null;   // از مقادیر REJECTION_REASONS
  actor_id: string;                 // شناسه کاربر ثبت‌کننده بازخورد
  actor_role: 'manager' | 'counselor' | 'teacher' | 'edu_office';
  notes: string;                    // توضیحات توصیفی کاربر
  feedback_timestamp: string;       // ISO 8601
}
```

### ۲.۲. رکورد پیامد و اثربخشی اقدام (`ActionOutcomeRecord`)
```typescript
interface ActionOutcomeRecord {
  outcome_id: string;               // e.g. "OUT-SCH01-2026-001"
  action_id: string;                // شناسه اقدام پیاده‌سازی شده
  recommendation_id: string;        // ارجاع به پیشنهاد اولیه
  school_id: string | number;       // شناسه مستأجر مدرسه
  action_type: string;              // نوع اقدام اجراشده
  effectiveness_level: 'HIGHLY_EFFECTIVE' | 'PARTIALLY_EFFECTIVE' | 'INEFFECTIVE' | 'REQUIRES_ESCALATION';
  delta_metrics: {
    delta_attendance: number;       // درصد تغییر در حضور
    delta_gpa: number;              // تغییر در معدل
    delta_engagement: number;       // تغییر در شاخص مشارکت
  };
  evaluator_id: string;             // ارزیاب نتیجه
  evaluation_timestamp: string;     // ISO 8601
}
```

### ۲.۳. گزارش دقت و کیفیت پیشنهادها (`RecommendationAccuracyReport`)
```typescript
interface RecommendationAccuracyReport {
  total_recommendations: number;
  total_reviewed: number;
  approved_count: number;
  rejected_count: number;
  adoption_rate_pct: number;         // Approved / (Approved + Rejected) * 100
  precision_pct: number;             // Effective / Completed * 100
  false_positive_rate_pct: number;   // (Rejected + Ineffective) / Total * 100
  action_success_rate_pct: number;   // Effective / Evaluated * 100
  escalation_accuracy_pct: number;   // Confirmed Escalations / Total Escalations * 100
  calculated_at: string;
}
```

### ۲.۴. الگوی موفقیت مداخله (`InterventionSuccessPattern`)
```typescript
interface InterventionSuccessPattern {
  pattern_id: string;
  action_type: string;
  problem_category: string;
  sample_size: number;
  success_rate_pct: number;
  average_delta: {
    attendance: number;
    gpa: number;
    engagement: number;
  };
  context_conditions: {
    grade_level?: string;
    school_type?: string;
    duration_weeks?: number;
  };
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW'; // بر اساس sample_size
}
```

### ۲.۵. پرونده یادگیری سازمانی مدرسه (`OrganizationalLearningProfile`)
```typescript
interface OrganizationalLearningProfile {
  profile_id: string;
  school_id: string | number;
  region_id: string | number;
  academic_year: string;
  accuracy_report: RecommendationAccuracyReport;
  successful_patterns: InterventionSuccessPattern[];
  ineffective_patterns: InterventionSuccessPattern[];
  maturity_index: {
    score: number;                   // ۰ تا ۱۰۰
    level: 'INITIAL' | 'DEVELOPING' | 'ESTABLISHED' | 'OPTIMIZED';
    components: {
      feedback_quality: number;      // وزن ۰.۳۰
      action_effectiveness: number;  // وزن ۰.۲۵
      learning_retention: number;    // وزن ۰.۲۵
      governance_compliance: number; // وزن ۰.۲۰
    };
  };
  learning_retention_summary: {
    documented_interventions_count: number;
    reusable_strategies_count: number;
    deprecated_approaches_count: number;
  };
  created_at: string;
  human_controlled_policy: true;     // سیاست‌ها فقط توسط انسان تغییر می‌یابند
  automated_decision: false;         // سامانه هرگز تصمیم خودکار اتخاذ نمی‌کند
  zero_ranking: true;                // هیچ رتبه‌بندی بین مدارس یا معلمان وجود ندارد
}
```

---

## ۳. فرمول محاسبه شاخص بلوغ هوشمندی آموزشی

$$\text{IntelligenceMaturity} = 0.30 \times Q_{\text{feedback}} + 0.25 \times E_{\text{action}} + 0.25 \times R_{\text{retention}} + 0.20 \times C_{\text{compliance}}$$

که در آن:
1. $Q_{\text{feedback}}$: نسبت اقدامات دارای یادداشت تشریحی و علل شفاف در تصمیمات انسانی (۰ تا ۱۰۰).
2. $E_{\text{action}}$: درصد موفقیت مداخلات ارزیابی‌شده ($\text{Success Rate}$).
3. $R_{\text{retention}}$: نسبت بهره‌گیری از راهکارهای با نرخ موفقیت بالای ۶۰٪ در اقدامات اخیر (۰ تا ۱۰۰).
4. $C_{\text{compliance}}$: پایبندی به الزامات حاکمیتی (۱۰۰ در صورت عبور تمام اقدامات از تأیید انسانی).

---

## ۴. الگوریتم کالیبراسیون توصیه‌ها با حافظه یادگیری (`calibrateRecommendationsWithMemory`)

برای کالیبره کردن پیشنهادهای جدید قبل از ارائه به کادر مدرسه:
1. بازیابی الگوهای حافظه مدرسه متناظر با `action_type` و `problem_category`.
2. اگر الگوی موفقیت با `confidence_level` متوسط یا بالا و `success_rate_pct >= 70` وجود داشته باشد:
   - ضریب تقویت: $\text{Bonus} = +15\%$
   - افزودن پرچم: `HISTORICAL_SUCCESS_VALIDATED`
3. اگر الگو با `success_rate_pct <= 30` و حجم نمونه کافی وجود داشته باشد:
   - ضریب بازدارندگی: $\text{Penalty} = -25\%$
   - افزودن پرچم هشدار: `HISTORICAL_INEFFECTIVE_WARNING` با یادداشت مستند برای مدیر.
4. خروجی کالیبراسیون با تابع `deepFreeze` منجمد شده و قطعیت بیت‌به‌بیت تضمین می‌گردد.
