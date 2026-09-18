# مدل قرارداد لایه ارزیابی پیامد و بهینه‌سازی مستمر (P0-EI-19)
## Outcome Evaluation & Continuous Optimization Layer Data Contract Specification

**نگارش سند:** ۱.۰.۰  
**وضعیت:** مصوب (Approved)  
**تاریخ تصویب:** ۲۰۲۶-۰۹-۱۸  
**ماژول اجرایی:** `server/analytics/outcome-evaluation-optimization.js`  
**طرح وب‌سرویس:** `GET /api/v1/analytics/outcome-evaluation`  

---

## ۱. انوم‌ها و مقادیر پایه (Core Enumerations)

### ۱.۱. انواع الگوهای یادگیری سازمانی (`LEARNING_PATTERN_TYPE`)
```javascript
const LEARNING_PATTERN_TYPE = Object.freeze({
  SUCCESS_PATTERN: 'SUCCESS_PATTERN',                     // الگوی مداخله موفق با اثر پایدار
  PARTIAL_SUCCESS_PATTERN: 'PARTIAL_SUCCESS_PATTERN',     // بهبود نسبی با پایداری محدود
  FAILED_INTERVENTION_PATTERN: 'FAILED_INTERVENTION_PATTERN', // مداخله بی‌اثر نیازمند بازنگری روش
  REPEAT_RISK_PATTERN: 'REPEAT_RISK_PATTERN'              // بازگشت مخاطره و افت مجدد شاخص
});
```

### ۱.۲. سطوح اثربخشی مداخله (`IMPACT_LEVEL`)
```javascript
const IMPACT_LEVEL = Object.freeze({
  EXEMPLARY: 'EXEMPLARY',     // امتیاز اثرگذاری >= 85
  EFFECTIVE: 'EFFECTIVE',     // امتیاز اثرگذاری بین 70 تا 84.9
  MODERATE: 'MODERATE',       // امتیاز اثرگذاری بین 50 تا 69.9
  INEFFECTIVE: 'INEFFECTIVE', // امتیاز اثرگذاری بین 30 تا 49.9
  ADVERSE: 'ADVERSE'          // امتیاز اثرگذاری کمتر از 30
});
```

### ۱.۳. موتورهای هدف بهینه‌سازی مستمر (`OPTIMIZATION_TARGET_ENGINE`)
```javascript
const OPTIMIZATION_TARGET_ENGINE = Object.freeze({
  SCHOOL_INTELLIGENCE: 'EI-09-SchoolIntelligence',
  REGIONAL_NETWORK: 'EI-10-RegionalIntelligenceNetwork',
  QUALITY_GOVERNANCE: 'EI-11-QualityGovernance',
  LONGITUDINAL_MONITORING: 'EI-12-LongitudinalIntelligence',
  RECOMMENDATION_ENGINE: 'EI-13-ActionRecommendation',
  FEEDBACK_MEMORY: 'EI-14-FeedbackLearningMemory',
  GOVERNANCE_DASHBOARD: 'EI-15-IntelligenceGovernance',
  POLICY_SIMULATION: 'EI-16-PolicySimulation',
  DECISION_COMMAND: 'EI-17-DecisionCommand',
  OPERATIONAL_EXECUTION: 'EI-18-OperationalExecution'
});
```

---

## ۲. مشخصات ساختار قراردادهای داده (Data Contracts)

### ۲.۱. رکورد سنجش اثرگذاری مداخله (`InterventionImpactRecord`)
```typescript
interface InterventionImpactRecord {
  record_id: string;                  // شناسه یکتا مانند "IMP-REC-SCH101-TASK01"
  task_id: string;                    // شناسه وظیفه عملیاتی در EI-18
  decision_id: string;                // شناسه تصمیم مصوب در EI-17
  title: string;                      // عنوان اقدام ارزیابی‌شده
  domain: string;                     // "ATTENDANCE" | "ACADEMIC" | "TEACHING" | "FAMILY"
  delta_metrics: {
    delta_attendance_pct: number;     // تغییر درصد حضور (مثلا +4.5%)
    delta_gpa: number;                // تغییر معدل تحصیلی (مثلا +0.8 از 20)
    delta_engagement_pct: number;     // تغییر درصد مشارکت کلاسی
    delta_wellbeing_pct: number;      // تغییر شاخص رفاه و انگیزش
  };
  impact_score: number;               // 0.0 .. 100.0 محاسبه‌شده با فرمول ۵ عامله
  impact_level: IMPACT_LEVEL;         // "EXEMPLARY" | "EFFECTIVE" | ...
  goal_achievement_pct: number;       // درصد تحقق هدف مصوب (0 .. 100)
  sustainability_score: number;       // پایداری اثر پس از مداخله (0 .. 100)
  evidence_confidence: number;        // اطمینان شواهد آماری (0 .. 100)
  evaluated_at: string;               // ISO-8601
}
```

### ۲.۲. الگوی یادگیری سازمانی (`LearningPattern`)
```typescript
interface LearningPattern {
  pattern_id: string;                 // شناسه یکتا مانند "LPAT-SCH101-01"
  pattern_type: LEARNING_PATTERN_TYPE;// "SUCCESS_PATTERN" | ...
  domain: string;                     // حوزه تخصصی الگو
  title: string;                      // عنوان الگو به فارسی
  description: string;                // شرح تجربی الگو
  supporting_interventions_count: number; // تعداد مداخلات مؤید این الگو
  confidence_pct: number;             // درجه اطمینان تجربی به الگو
  suggested_future_action: string;    // توصیه تجربی برای چرخه‌های آتی
  detected_at: string;                // ISO-8601
}
```

### ۲.۳. بینش بهینه‌سازی موتورها (`OptimizationInsight`)
```typescript
interface OptimizationInsight {
  insight_id: string;                 // شناسه یکتا مانند "OPT-INS-SCH101-01"
  target_engine: OPTIMIZATION_TARGET_ENGINE; // موتور مخاطب بهینه‌سازی
  title: string;                      // عنوان پیشنهاد بهینه‌سازی
  recommended_calibration: string;    // شرح کالیبراسیون و تعدیل ضرایب
  rationale: string;                  // استدلال تجربی مبتنی بر پیامدها
  urgency: string;                    // "IMMEDIATE_24H" | "WEEKLY" | "TERM"
  requires_human_approval: true;      // الزام تایید صریح انسان
  automated_execution: false;         // منع اجرای خودکار
}
```

### ۲.۴. شناسنامه جامع ارزیابی پیامد و بهینه‌سازی (`OutcomeEvaluationSnapshot`)
```typescript
interface OutcomeEvaluationSnapshot {
  snapshot_id: string;                // شناسه یکتا مانند "OUT-SNAP-SCH101-1405-1406"
  school_id: number;
  region_id: number;
  academic_year: string;
  total_interventions_evaluated: number;
  average_impact_score: number;       // میانگین امتیاز اثرگذاری تمام مداخلات
  impact_distribution: {
    EXEMPLARY: number;
    EFFECTIVE: number;
    MODERATE: number;
    INEFFECTIVE: number;
    ADVERSE: number;
  };
  overall_delta_summary: {
    mean_delta_attendance_pct: number;
    mean_delta_gpa: number;
    mean_delta_engagement_pct: number;
  };
  impact_records: Array<InterventionImpactRecord>;
  detected_learning_patterns: Array<LearningPattern>;
  optimization_insights: Array<OptimizationInsight>;
  automated_decision: false;          // تضمین عدم تصمیم‌گیری خودکار
  automated_execution: false;         // تضمین عدم اجرای خودکار
  requires_human_approval: true;      // الزام تایید انسان
  zero_ranking: true;                 // منع قطعی رتبه‌بندی رقابتی مدارس
  generated_at: string;               // ISO-8601
}
```

---

## ۳. امنیت، چندمستأجری و کدهای خطا (Security & Error Codes)

| کد خطا | وضعیت HTTP | سناریوی وقوع |
|:---|:---:|:---|
| `OUTCOME_EVALUATION_TENANT_ISOLATION_VIOLATION` | 403 Forbidden | تلاش برای دسترسی به پیامدها و ارزیابی‌های مدرسه دیگر |
| `OUTCOME_EVALUATION_ROLE_ACCESS_DENIED` | 403 Forbidden | تلاش نقش‌های غیرمجاز نظیر دانش‌آموز یا والد برای دسترسی به لایه ارزیابی پیامد |
| `INVALID_EVALUATION_PARAMETERS` | 400 Bad Request | فقدان شناسه‌های اجباری مدرسه یا داده‌های ارزیابی |

---

## ۴. انجماد عمیق و قطعیت جبری ۱۰۰٪

تمام اشیای خروجی با تابع `deepFreeze` بازگشتی منجمد شده و محاسبات بدون هیچ‌گونه تابع شبه‌تصادفی تولید می‌گردند تا برابری بیت‌به‌بیت در اجرای متوالی تضمین شود.
