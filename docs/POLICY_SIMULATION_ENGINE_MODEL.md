# مدل داده و قرارداد رسمی موتور شبیه‌سازی خط‌مشی‌های آموزشی (P0-EI-16)
## Educational Intelligence Policy Simulation Engine Data Contract Specification

**شناسه سند:** `DATA-CONTRACT-P0-EI-16-POLICY-SIMULATION`  
**نسخه:** ۱.۰.۰  
**تاریخ انتشار:** ۲۰۲۶-۰۹-۱۸  
**وضعیت:** مصوب (Approved)  
**مرجع ذخیره‌سازی:** PostgreSQL (تولید)، SQLite/Memory (محیط آزمون)  

---

## ۱. ثابت‌ها و مجموعه‌های مقادیر مجاز (Enums & Constants)

### ۱.۱. انواع سناریوهای شبیه‌سازی (`SCENARIO_TYPE`)
```javascript
const SCENARIO_TYPE = Object.freeze({
  BASELINE: 'BASELINE',                         // سناریوی پایه: ادامه وضع موجود بدون مداخله
  POLICY_INTERVENTION: 'POLICY_INTERVENTION',   // سناریوی مداخله اصلی: اجرای خط‌مشی پیشنهادی
  ALTERNATIVE_POLICY: 'ALTERNATIVE_POLICY'      // سناریوی جایگزین: رویکرد متفاوت با منابع متغیر
});
```

### ۱.۲. سطوح اطمینان محاسباتی (`CONFIDENCE_LEVEL`)
```javascript
const CONFIDENCE_LEVEL = Object.freeze({
  HIGH: 'HIGH',         // داده‌های تاریخی کامل و پایدار (بیش از ۱۰ دوره مشاهده)
  MEDIUM: 'MEDIUM',     // داده‌های نسبتاً کامل (۴ تا ۹ دوره مشاهده)
  LOW: 'LOW'            // داده‌های محدود یا با نوسان بالا (کمتر از ۴ دوره)
});
```

### ۱.۳. حوزه‌های تمرکز خط‌مشی (`POLICY_FOCUS`)
```javascript
const POLICY_FOCUS = Object.freeze({
  ATTENDANCE_BOOST: 'ATTENDANCE_BOOST',               // بهبود حضور و کاهش غیبت مزمن
  ACADEMIC_REMEDIAL: 'ACADEMIC_REMEDIAL',             // کلاس‌های جبرانی و رفع افت تحصیلی
  TEACHING_QUALITY: 'TEACHING_QUALITY',               // ارتقای مهارت‌های تدریس معلمان
  PARENTAL_ENGAGEMENT: 'PARENTAL_ENGAGEMENT',         // تقویت تعامل و مشارکت اولیا
  RESOURCE_OPTIMIZATION: 'RESOURCE_OPTIMIZATION'      // بهینه‌سازی تخصیص معلمان و ساعات آموزشی
});
```

---

## ۲. مشخصات رکوردهای داده‌ای (Data Schemas)

### ۲.۱. تعریف سناریو (`ScenarioDefinition`)
```typescript
interface ScenarioDefinition {
  scenario_id: string;               // e.g. "SCN-101-ATT-BASELINE"
  scenario_type: 'BASELINE' | 'POLICY_INTERVENTION' | 'ALTERNATIVE_POLICY';
  title: string;                     // عنوان فارسی سناریو
  description: string;               // توضیح رویکرد مداخله
  duration_weeks: number;            // افق زمانی اجرای سیاست (هفته)
  target_cohort: string;             // جامعه هدف (مثلاً "پایه نهم" یا "دانش‌آموزان در معرض ریسک")
  intervention_intensity: 'LIGHT' | 'MODERATE' | 'INTENSIVE';
}
```

### ۲.۲. پیامدهای برآوردی سناریو (`PredictedEffects`)
```typescript
interface PredictedEffects {
  delta_gpa: number;                 // تغییر برآوردی معدل (-۲۰ تا +۲۰)
  delta_attendance: number;          // تغییر برآوردی نرخ حضور (-۱۰۰ تا +۱۰۰)
  delta_engagement: number;          // تغییر برآوردی نرخ مشارکت (-۱۰۰ تا +۱۰۰)
  intervention_load_delta: number;   // تغییر بار کاری پرسنل (درصد)
  resource_demand_hours: number;     // ساعات نفر/نیروی کار مورد نیاز
}
```

### ۲.۳. ارزیابی جامع سناریو (`ScenarioEvaluation`)
```typescript
interface ScenarioEvaluation {
  scenario: ScenarioDefinition;
  predicted_effects: PredictedEffects;
  feasibility_score: number;         // نمره امکان‌سنجی اجرا (۰ تا ۱۰۰)
  cost_benefit_ratio: number;        // نسبت بازدهی آموزشی به منابع مورد نیاز
  risk_factors: string[];            // مخاطرات احتمالی اجرای سناریو
}
```

### ۲.۴. شناسنامه شبیه‌سازی خط‌مشی (`PolicySimulationSnapshot`)
```typescript
interface PolicySimulationSnapshot {
  snapshot_id: string;
  school_id: number;
  region_id: number;
  academic_year: string;
  policy_focus: string;
  baseline_metrics: {
    current_attendance_rate: number;
    current_gpa: number;
    chronic_absence_rate: number;
    active_interventions_count: number;
  };
  scenarios: ScenarioEvaluation[];
  comparative_summary: {
    recommended_scenario_for_review: string;
    tradeoffs_summary: string;
    decision_guidance: string;
  };
  assumptions: string[];             // فرضیات مدل شبیه‌سازی
  limitations: string[];             // محدودیت‌های پیش‌بینی
  uncertainty_level: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW';
  data_quality: {
    completeness_pct: number;
    freshness_days: number;
  };
  human_review_status: 'PENDING_HUMAN_REVIEW';
  automated_policy_execution: false; // اکیداً false
  automated_decision: false;         // اکیداً false
  requires_human_approval: true;     // اکیداً true
  zero_ranking: true;                // اکیداً true
  created_at: string;                // ISO 8601
}
```

---

## ۳. فرمول‌های برآورد و امکان‌سنجی سناریوها

### ۳.۱. مدل خطی برآورد پیامد
$$\Delta \text{Metric} = \alpha_{\text{focus}} \times \text{IntensityWeight} \times \text{HistoricalEfficacy} \times (1 - \text{FrictionFactor})$$
که در آن:
- $\alpha_{\text{focus}}$: ضریب کشش شاخص بر اساس نوع سیاست (حضور، آموزش، یا مشارکت).
- $\text{IntensityWeight}$: ضریب شدت مداخله ($0.4$ سبک، $0.8$ متوسط، $1.2$ فشرده).
- $\text{HistoricalEfficacy}$: نرخ موفقیت مستند این مداخله در حافظه سازمانی مدرسه یا منطقه (از گام ۱۴).
- $\text{FrictionFactor}$: اصطکاک عملیاتی و کمبود ظرفیت پرسنلی ($0$ تا $0.5$).

### ۳.۲. نمره امکان‌سنجی اجرا (Feasibility Score)
$$\text{FeasibilityScore} = 100 - (\text{ResourceHours} \times 0.5) - (\text{FrictionFactor} \times 40)$$
محدود به بازه ۱۰ تا ۱۰۰.

---

## ۴. گارد امنیتی چندمستأجری و کنترل دسترسی

در صورت عدم تطابق شناسه مدرسه با مشخصات مدیر یا عدم تطابق منطقه با کارشناس اداره:
$$\text{Error: POLICY\_SIMULATION\_TENANT\_ISOLATION\_VIOLATION}$$
سامانه با رفتار شکست ایمن (Fail-Closed) درخواست را با کد ۴۰۳ سقط می‌نماید.
