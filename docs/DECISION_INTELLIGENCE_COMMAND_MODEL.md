# مدل داده و قرارداد رسمی لایه هوش تصمیم و ارکستراسیون فرمان آموزشی (P0-EI-17)
## Educational Decision Intelligence & Command Orchestration Data Contract Specification

**شناسه سند:** `DATA-CONTRACT-P0-EI-17-DECISION-INTELLIGENCE-COMMAND`  
**نسخه:** ۱.۰.۰  
**تاریخ انتشار:** ۲۰۲۶-۰۹-۱۸  
**وضعیت:** مصوب (Approved)  
**مرجع ذخیره‌سازی:** PostgreSQL (تولید)، SQLite/Memory (محیط آزمون)  

---

## ۱. ثابت‌ها و مجموعه‌های مقادیر مجاز (Enums & Constants)

### ۱.۱. وضعیت‌های چرخه حیات تصمیم انسانی (`DECISION_WORKFLOW_STATE`)
```javascript
const DECISION_WORKFLOW_STATE = Object.freeze({
  DETECTED: 'DETECTED',                             // مسئله یا سیگنال کشف شد
  ANALYZED: 'ANALYZED',                             // ریشه‌یابی و تحلیل شواهد تکمیل شد
  RECOMMENDED: 'RECOMMENDED',                       // سناریوی اقدام مشخص گردید
  HUMAN_REVIEW_REQUIRED: 'HUMAN_REVIEW_REQUIRED',   // در صف بازبینی و تأیید انسانی
  APPROVED_BY_HUMAN: 'APPROVED_BY_HUMAN',           // توسط کاربر مجاز انسانی مصوب شد
  EXECUTION_TRACKING: 'EXECUTION_TRACKING',         // اقدام در حال اجرا و پایش میدانی است
  OUTCOME_REVIEW: 'OUTCOME_REVIEW',                 // سنجش اثربخشی و ثبت در حافظه یادگیری
  REJECTED: 'REJECTED',                             // تصمیم توسط ناظر انسانی رد شد
  BLOCKED: 'BLOCKED',                               // تصمیم به دلیل کسری منبع یا عدم متولی مسدود است
  COMPLETED: 'COMPLETED',                           // چرخه تصمیم با موفقیت مختومه شد
  CANCELLED: 'CANCELLED'                            // لغو یا بازپس‌گیری توسط کاربر
});
```

### ۱.۲. ترنزیشن‌های مجاز ماشین چرخه تصمیم (`ALLOWED_WORKFLOW_TRANSITIONS`)
```javascript
const ALLOWED_WORKFLOW_TRANSITIONS = Object.freeze({
  DETECTED: Object.freeze(['ANALYZED']),
  ANALYZED: Object.freeze(['RECOMMENDED']),
  RECOMMENDED: Object.freeze(['HUMAN_REVIEW_REQUIRED']),
  HUMAN_REVIEW_REQUIRED: Object.freeze(['APPROVED_BY_HUMAN', 'REJECTED', 'BLOCKED']),
  APPROVED_BY_HUMAN: Object.freeze(['EXECUTION_TRACKING', 'CANCELLED']),
  EXECUTION_TRACKING: Object.freeze(['OUTCOME_REVIEW', 'CANCELLED']),
  OUTCOME_REVIEW: Object.freeze(['COMPLETED']),
  BLOCKED: Object.freeze(['HUMAN_REVIEW_REQUIRED', 'CANCELLED']),
  REJECTED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
  COMPLETED: Object.freeze([])
});
```

### ۱.۳. رده‌های فوریت زمانی تصمیم (`DECISION_URGENCY`)
```javascript
const DECISION_URGENCY = Object.freeze({
  IMMEDIATE_24H: 'IMMEDIATE_24H',       // نیازمند تصمیم‌گیری در ۲۴ ساعت (موارد بحرانی ترک تحصیل، غیبت حاد)
  URGENT_72H: 'URGENT_72H',             // نیازمند تصمیم‌گیری در ۷۲ ساعت (افت ناگهانی دروس اصلی)
  WEEKLY: 'WEEKLY',                     // نیازمند بررسی هفتگی در شورای مدرسه
  STRATEGIC_TERM: 'STRATEGIC_TERM'      // تصمیمات میان‌مدت و فصلی
});
```

### ۱.۴. وضعیت پیوستگی زنجیره هوشمندی (`INTELLIGENCE_INTEGRITY_STATUS`)
```javascript
const INTELLIGENCE_INTEGRITY_STATUS = Object.freeze({
  VALID: 'VALID',                       // تمامی اتصالات زنجیره، شواهد و تأییدیه‌ها برقرارند
  WARNING: 'WARNING',                   // برخی اقدامات با شواهد ضعیف یا تأخیر همراهند
  VIOLATION: 'VIOLATION'                // کشف اقدام خودکار یا نشت رتبه‌بندی
});
```

---

## ۲. مشخصات رکوردهای داده‌ای (Data Schemas)

### ۲.۱. رکورد قلم تصمیم آموزشی (`DecisionItemRecord`)
```typescript
interface DecisionItemRecord {
  decision_id: string;               // e.g. "DEC-101-2026-ATT-001"
  title: string;                     // عنوان فارسی تصمیم
  domain: string;                    // ATTENDANCE, ACADEMIC, TEACHING, GOVERNANCE
  workflow_state: string;            // از مقادیر DECISION_WORKFLOW_STATE
  urgency: string;                   // از مقادیر DECISION_URGENCY
  evidence_strength: number;         // ۰ تا ۱۰۰
  affected_scope: number;            // ۰ تا ۱۰۰
  intervention_readiness: number;    // ۰ تا ۱۰۰
  human_owner_available: boolean;
  priority_score: number;            // ۰ تا ۱۰۰
  assigned_role: string;             // manager, counselor, teacher, edu_office
  assigned_actor_id: string | null;
  evidence_summary: string[];
  policy_simulation_ref: string | null;
  requires_human_approval: true;     // اکیداً true
  automated_decision: false;         // اکیداً false
  history: Array<{
    from_state: string;
    to_state: string;
    actor_id: string;
    role: string;
    timestamp: string;
    notes: string;
  }>;
}
```

### ۲.۲. تابلوی ارکستراسیون فرماندهی تصمیم (`DecisionCommandBoard`)
```typescript
interface DecisionCommandBoard {
  board_id: string;
  school_id: number;
  region_id: number;
  academic_year: string;
  critical_decisions_pending_review: DecisionItemRecord[];
  recommended_actions: DecisionItemRecord[];
  blocked_decisions: DecisionItemRecord[];
  required_human_approvals: DecisionItemRecord[];
  governance_warnings: string[];
  policy_simulation_references: object[];
  total_decisions_tracked: number;
  zero_ranking: true;
}
```

### ۲.۳. شناسنامه جامع ارکستراسیون فرمان (`DecisionCommandSnapshot`)
```typescript
interface DecisionCommandSnapshot {
  snapshot_id: string;
  school_id: number;
  region_id: number;
  academic_year: string;
  command_board: DecisionCommandBoard;
  engine_inputs_summary: {
    school_intelligence_present: boolean;
    regional_network_present: boolean;
    quality_governance_present: boolean;
    longitudinal_monitoring_present: boolean;
    recommendation_engine_present: boolean;
    feedback_memory_present: boolean;
    governance_dashboard_present: boolean;
    policy_simulation_present: boolean;
  };
  chain_integrity: {
    integrity_status: 'VALID' | 'WARNING' | 'VIOLATION';
    checks_passed: number;
    total_checks: number;
    issues: string[];
  };
  priority_matrix_summary: {
    high_priority_count: number;
    immediate_24h_count: number;
    human_assigned_pct: number;
  };
  created_at: string;
  automated_decision: false;
  requires_human_approval: true;
  zero_ranking: true;
}
```

---

## ۳. فرمول محاسبه امتیاز ماتریس اولویت تصمیم

$$\text{DecisionPriority} = 0.30 \times U + 0.25 \times E + 0.20 \times S + 0.15 \times R + 0.10 \times O$$

که در آن:
- $U$: امتیاز فوریت زمانی (۱۰۰ برای ۲۴h، ۷۵ برای ۷۲h، ۵۰ برای هفتگی، ۲۵ برای فصلی).
- $E$: استحکام شواهد داده‌ای متقن ($0$ تا $100$).
- $S$: دامنه جامعه تحت تأثیر ($0$ تا $100$).
- $R$: آمادگی زیرساختی و مداخله‌ای مدرسه ($0$ تا $100$).
- $O$: در دسترس بودن مسئول انسانی متولی ($100$ در صورت انتساب، $0$ در صورت فقدان متولی).

---

## ۴. امنیت چندمستأجری و گارد کنترل دسترسی

در صورت عدم تطابق مدرسه با کاربر `school_admin` یا منطقه با کاربر `district_operator`:
$$\text{Error: DECISION\_COMMAND\_TENANT\_ISOLATION\_VIOLATION}$$
سامانه با رفتار شکست ایمن (Fail-Closed) درخواست را با کد ۴۰۳ سقط می‌نماید.
