# مدل قرارداد لایه یکپارچه‌سازی پلتفرم هوشمندی (P0-EI-20)
## Intelligence Platform Integration Layer Data Contract Specification

**نگارش سند:** ۱.۰.۰  
**وضعیت:** مصوب (Approved)  
**تاریخ تصویب:** ۲۰۲۶-۰۹-۱۸  
**ماژول اجرایی:** `server/analytics/intelligence-platform-integration.js`  
**طرح وب‌سرویس:** `GET /api/v1/analytics/intelligence-platform`  

---

## ۱. انوم‌ها و مقادیر پایه (Core Enumerations)

### ۱.۱. شناسه‌های رسمی ۱۱ موتور هوشمندی پلتفرم (`INTELLIGENCE_ENGINE_ID`)
```javascript
const INTELLIGENCE_ENGINE_ID = Object.freeze({
  EI_09_SCHOOL_INTELLIGENCE: 'EI-09-SchoolIntelligence',
  EI_10_REGIONAL_NETWORK: 'EI-10-RegionalIntelligenceNetwork',
  EI_11_QUALITY_GOVERNANCE: 'EI-11-QualityGovernance',
  EI_12_LONGITUDINAL_MONITORING: 'EI-12-LongitudinalIntelligence',
  EI_13_ACTION_RECOMMENDATION: 'EI-13-ActionRecommendation',
  EI_14_FEEDBACK_MEMORY: 'EI-14-FeedbackLearningMemory',
  EI_15_INTELLIGENCE_GOVERNANCE: 'EI-15-IntelligenceGovernance',
  EI_16_POLICY_SIMULATION: 'EI-16-PolicySimulation',
  EI_17_DECISION_COMMAND: 'EI-17-DecisionCommand',
  EI_18_OPERATIONAL_EXECUTION: 'EI-18-OperationalExecution',
  EI_19_OUTCOME_EVALUATION: 'EI-19-OutcomeEvaluation'
});
```

### ۱.۲. وضعیت سلامت پلتفرم (`PLATFORM_HEALTH_STATUS`)
```javascript
const PLATFORM_HEALTH_STATUS = Object.freeze({
  HEALTHY: 'HEALTHY',       // تمام ۱۱ موتور فعال، زنجیره تصمیم کامل، سازگاری ۱۰۰٪
  DEGRADED: 'DEGRADED',     // برخی موتورها با هشدارهای کیفی یا فقدان داده مواجهند
  CRITICAL: 'CRITICAL'      // گسست در زنجیره تصمیم یا خطای چندمستأجری
});
```

### ۱.۳. وضعیت عملکردی هر موتور (`ENGINE_STATUS`)
```javascript
const ENGINE_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',         // فعال و پاسخگو
  INITIALIZING: 'INITIALIZING', // در حال بارگذاری شواهد
  DEGRADED: 'DEGRADED',     // داده ناکافی یا افت کیفیت
  DISABLED: 'DISABLED'      // غیرفعال شده
});
```

---

## ۲. مشخصات ساختار قراردادهای داده (Data Contracts)

### ۲.۱. ساختار ثبت موتور در رجیستری (`EngineRegistration`)
```typescript
interface EngineRegistration {
  engine_id: INTELLIGENCE_ENGINE_ID;
  name: string;                       // نام فارسی رسمی موتور
  contract_version: string;           // نسخه قرارداد داده، مثلا "1.0.0"
  domain: string;                     // "ANALYTICS" | "GOVERNANCE" | "DECISION" | "EXECUTION"
  status: ENGINE_STATUS;
  dependencies: Array<string>;        // شناسه‌های موتورهای پیش‌نیاز
  registered_at: string;              // ISO-8601
}
```

### ۲.۲. گزارش سازگاری نسخ قراردادها (`PlatformCompatibilityReport`)
```typescript
interface PlatformCompatibilityReport {
  total_registered_engines: number;   // باید ۱۱ باشد
  compatible_engines_count: number;
  all_compatible: boolean;
  contract_version_matrix: Record<string, string>;
  incompatible_engines: Array<{
    engine_id: string;
    expected_version: string;
    actual_version: string;
    reason: string;
  }>;
  evaluated_at: string;               // ISO-8601
}
```

### ۲.۳. گزارش سلامت زنجیره هوشمندی (`IntelligenceChainHealthStatus`)
```typescript
interface IntelligenceChainHealthStatus {
  chain_status: PLATFORM_HEALTH_STATUS; // "HEALTHY" | "DEGRADED" | "CRITICAL"
  nodes: {
    insight_engines_present: boolean;  // EI-09..16
    decision_command_present: boolean; // EI-17
    execution_workflow_present: boolean; // EI-18
    outcome_evaluation_present: boolean; // EI-19
  };
  integrity_checks: {
    evidence_presence: boolean;
    human_approval_enforced: boolean;
    audit_trail_preserved: boolean;
    zero_ranking_guaranteed: boolean;
  };
  issues_detected: Array<string>;
}
```

### ۲.۴. شناسنامه یکپارچه پلتفرم هوشمندی (`UnifiedIntelligenceSnapshot`)
```typescript
interface UnifiedIntelligenceSnapshot {
  snapshot_id: string;                // "UNIF-SNAP-SCH101-1405-1406"
  school_id: number;
  region_id: number;
  academic_year: string;
  platform_health: PLATFORM_HEALTH_STATUS;
  total_engines_integrated: number;   // ۱۱
  active_engines_count: number;
  engine_catalog: Array<EngineRegistration>;
  compatibility_report: PlatformCompatibilityReport;
  chain_health: IntelligenceChainHealthStatus;
  summary_metrics: {
    school_intelligence_score: number;
    health_index: number;
    decision_items_count: number;
    operational_tasks_count: number;
    evaluations_count: number;
    avg_impact_score: number;
  };
  automated_decision: false;          // تضمین عدم تصمیم‌گیری خودکار
  automated_execution: false;         // تضمین عدم اجرای خودکار
  requires_human_approval: true;      // الزام تایید صریح انسان
  zero_ranking: true;                 // منع قطعی رتبه‌بندی رقابتی مدارس
  generated_at: string;               // ISO-8601
}
```

---

## ۳. امنیت، چندمستأجری و کدهای خطا (Security & Error Codes)

در صورت نقض مرزهای سازمانی یا عدم تطابق نقش‌ها، متدهای پلتفرم بلافاصله با پرتاب خطاهای رسمی زیر متوقف می‌شوند (Fail-Closed):

| کد خطا | وضعیت HTTP | سناریوی وقوع |
|:---|:---:|:---|
| `INTELLIGENCE_PLATFORM_TENANT_ISOLATION_VIOLATION` | 403 Forbidden | تلاش برای دریافت تابلوی یکپارچه مدرسه دیگر |
| `INTELLIGENCE_PLATFORM_ROLE_ACCESS_DENIED` | 403 Forbidden | تلاش نقش‌های فاقد صلاحیت ستادی نظیر دانش‌آموز یا والد برای دسترسی به تابلوی پلتفرم |
| `INVALID_INTELLIGENCE_PLATFORM_PARAMS` | 400 Bad Request | فقدان شناسه‌های اجباری مدرسه یا منطقه |

---

## ۴. الزامات انجماد عمیق و قطعیت جبری ۱۰۰٪

تمام ساختارها با تابع بازگشتی `deepFreeze` منجمد شده و محاسبات عاری از هرگونه مقدار تصادفی یا وابستگی غیرقطعی است تا برابری بیت‌به‌بیت در ۱۰ اجرای متوالی محقق شود.
