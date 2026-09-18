# مدل داده و قرارداد رسمی داشبورد حاکمیت و شفافیت هوشمندی (P0-EI-15)
## Educational Intelligence Governance & Transparency Data Contract Specification

**شناسه سند:** `DATA-CONTRACT-P0-EI-15-INTELLIGENCE-GOVERNANCE`  
**نسخه:** ۱.۰.۰  
**تاریخ انتشار:** ۲۰۲۶-۰۹-۱۸  
**وضعیت:** مصوب (Approved)  
**مرجع ذخیره‌سازی:** PostgreSQL (تولید)، SQLite/Memory (محیط آزمون)  

---

## ۱. ثابت‌ها و مجموعه‌های مقادیر مجاز (Enums & Constants)

### ۱.۱. سطوح شفافیت الگوریتمی (`TRANSPARENCY_LEVEL`)
```javascript
const TRANSPARENCY_LEVEL = Object.freeze({
  EXCELLENT: 'EXCELLENT',       // امتیاز ۸۵ تا ۱۰۰: شفافیت کامل، شواهد متقن و استدلال بدون ابهام
  GOOD: 'GOOD',                 // امتیاز ۷۰ تا ۸۴.۹: شفافیت مطلوب با شواهد مکفی
  MODERATE: 'MODERATE',         // امتیاز ۵۰ تا ۶۹.۹: شفافیت متوسط و نیاز به تقویت شواهد
  LOW: 'LOW'                    // امتیاز ۰ تا ۴۹.۹: سطح نامطلوب و نیازمند مداخله فوری حاکمیتی
});
```

### ۱.۲. سطوح شدت هشدارهای حاکمیتی (`ALERT_SEVERITY`)
```javascript
const ALERT_SEVERITY = Object.freeze({
  CRITICAL: 'CRITICAL',         // تصمیم خودکار، نشت داده، یا نقض تفکیک مستأجر
  HIGH: 'HIGH',                 // افت نرخ تأیید انسانی، افزایش نامتعارف رد پیشنهادها
  MEDIUM: 'MEDIUM',             // افت کیفیت بازخوردها یا نقصان در کامل بودن داده
  LOW: 'LOW'                    // تأخیرهای جزئی در بررسی پیشنهادها
});
```

### ۱.۳. انواع رویدادهای ممیزی (`AUDIT_EVENT_TYPE`)
```javascript
const AUDIT_EVENT_TYPE = Object.freeze({
  ACTION_APPROVAL: 'ACTION_APPROVAL',
  ACTION_REJECTION: 'ACTION_REJECTION',
  ACTION_MODIFICATION: 'ACTION_MODIFICATION',
  STATUS_TRANSITION: 'STATUS_TRANSITION',
  POLICY_UPDATE: 'POLICY_UPDATE',
  EVALUATION_RECORDED: 'EVALUATION_RECORDED',
  ACCESS_VIOLATION_BLOCKED: 'ACCESS_VIOLATION_BLOCKED'
});
```

### ۱.۴. وضعیت سلامت سامانه هوشمندی (`INTELLIGENCE_HEALTH_STATUS`)
```javascript
const INTELLIGENCE_HEALTH_STATUS = Object.freeze({
  HEALTHY: 'HEALTHY',           // امتیاز سلامت ۹۰ تا ۱۰۰ بدون هشدار بحرانی
  DEGRADED: 'DEGRADED',         // امتیاز سلامت ۷۵ تا ۸۹.۹
  AT_RISK: 'AT_RISK',           // امتیاز سلامت ۶۰ تا ۷۴.۹
  CRITICAL: 'CRITICAL'          // امتیاز کمتر از ۶۰ یا وجود هشدار بحرانی باز
});
```

---

## ۲. مشخصات رکوردهای داده‌ای (Data Schemas)

### ۲.۱. رکورد هشدار حاکمیتی (`GovernanceAlert`)
```typescript
interface GovernanceAlert {
  alert_id: string;               // e.g. "ALT-2026-GOV-001"
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  code: string;                   // e.g. "GOVERNANCE_POLICY_VIOLATION", "LOW_HUMAN_APPROVAL_RATE"
  message: string;                // پیام توصیفی فارسی
  entity_type: string;            // "school" | "recommendation" | "action"
  entity_id: string | number;
  created_at: string;             // ISO 8601
  resolved: boolean;
}
```

### ۲.۲. رکورد ردپای ممیزی تغییرناپذیر (`AuditEventRecord`)
```typescript
interface AuditEventRecord {
  event_id: string;               // e.g. "EVT-2026-09-001"
  actor_id: string;               // شناسه کاربر اقدام‌کننده
  role: string;                   // نقش کاربر (manager, counselor, edu_office)
  action_type: string;            // از مقادیر AUDIT_EVENT_TYPE
  entity_type: string;            // موجودیت هدف
  entity_id: string;              // شناسه موجودیت هدف
  timestamp: string;              // ISO 8601
  before_state: string | null;
  after_state: string | null;
  reason: string;                 // ادله اقدام (بدون درج داده‌های حساس فردی)
}
```

### ۲.۳. شناسنامه جامع حاکمیت هوشمندی (`IntelligenceGovernanceSnapshot`)
```typescript
interface IntelligenceGovernanceSnapshot {
  snapshot_id: string;
  school_id: number;
  region_id: number;
  academic_year: string;
  intelligence_health: {
    status: 'HEALTHY' | 'DEGRADED' | 'AT_RISK' | 'CRITICAL';
    score: number;                // ۰ تا ۱۰۰
  };
  transparency_score: {
    score: number;                // ۰ تا ۱۰۰
    level: 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'LOW';
    components: {
      explainability: number;     // وزن ۳۰٪
      evidence_availability: number; // وزن ۲۵٪
      human_approval_rate: number;   // وزن ۲۰٪
      audit_coverage: number;        // وزن ۱۵٪
      privacy_compliance: number;    // وزن ۱۰٪
    };
  };
  human_control_metrics: {
    approval_rate_pct: number;
    override_rate_pct: number;
    rejection_rate_pct: number;
    average_approval_time_hours: number;
    unreviewed_count: number;
    violations_detected: number;
  };
  recommendation_metrics: {
    total_generated: number;
    approved_count: number;
    rejected_count: number;
    pending_count: number;
  };
  approval_metrics: {
    average_time_hours: number;
    pending_review_count: number;
  };
  privacy_status: {
    student_pii_masked: true;
    clinical_notes_stripped: true;
    compliance_score: 100.0;
  };
  security_status: {
    tenant_isolation_enforced: true;
    idor_protection_active: true;
    fail_closed_guards: true;
  };
  governance_alerts: GovernanceAlert[];
  audit_trail_summary: {
    total_events: number;
    recent_events_count: number;
  };
  created_at: string;
  automated_decision: false;
  human_controlled_policy: true;
  zero_ranking: true;
}
```

---

## ۳. فرمول‌ها و قواعد تصمیم‌گیری

### ۳.۱. محاسبه شاخص شفافیت هوش مصنوعی (AI Transparency Score)
$$\text{TransparencyScore} = 0.30 \times E + 0.25 \times V + 0.20 \times H + 0.15 \times A + 0.10 \times P$$

### ۳.۲. قاعده عدم تصمیم‌گیری خودکار (No Autonomous Decision Rule)
در هر مرحله ارزیابی:
$$\text{automated\_decision} \equiv \text{false} \quad \wedge \quad \text{requires\_human\_confirmation} \equiv \text{true}$$
هر رکوردی که این شرط را نقض نماید منجر به تولید هشدار بحرانی `GOVERNANCE_POLICY_VIOLATION` خواهد شد.

### ۳.۳. شاخص سلامت کل هوشمندی (Intelligence Health Score)
$$\text{HealthScore} = 0.50 \times \text{TransparencyScore} + 0.30 \times \text{HumanApprovalRate} + 0.20 \times \text{PrivacyScore} - \text{AlertPenalty}$$
که در آن:
- به ازای هر هشدار `CRITICAL` فعال: کسر ۳۰ امتیاز
- به ازای هر هشدار `HIGH` فعال: کسر ۱۰ امتیاز
- به ازای هر هشدار `MEDIUM` فعال: کسر ۳ امتیاز
- اگر هرگونه هشدار بحرانی فعال باشد، وضعیت سلامت رأساً به `CRITICAL` تبدیل می‌شود.
