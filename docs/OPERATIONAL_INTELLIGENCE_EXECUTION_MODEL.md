# مدل قرارداد لایه اجرای عملیاتی هوشمندی آموزشی (P0-EI-18)
## Operational Intelligence Execution Layer Data Contract Specification

**نگارش سند:** ۱.۰.۰  
**وضعیت:** مصوب (Approved)  
**تاریخ تصویب:** ۲۰۲۶-۰۹-۱۸  
**ماژول اجرایی:** `server/analytics/operational-intelligence-execution.js`  
**طرح وب‌سرویس:** `GET /api/v1/analytics/operational-execution`  

---

## ۱. انوم‌ها و مقادیر پایه (Core Enumerations)

### ۱.۱. وضعیت‌های چرخه حیات اجرای عملیاتی (`EXECUTION_STATE`)
```javascript
const EXECUTION_STATE = Object.freeze({
  APPROVED_DECISION: 'APPROVED_DECISION', // تصمیم تایید شده توسط انسان در لایه EI-17
  TASK_CREATED: 'TASK_CREATED',           // وظیفه عملیاتی ایجاد شده
  ASSIGNED: 'ASSIGNED',                   // به متولی انسانی تخصیص داده شده
  IN_PROGRESS: 'IN_PROGRESS',             // عملیات توسط متولی در حال انجام است
  BLOCKED: 'BLOCKED',                     // عملیات به دلیل مانع محیطی یا کمبود منابع متوقف شده
  COMPLETED: 'COMPLETED',                 // اقدام عملیاتی با موفقیت به پایان رسیده
  OUTCOME_PENDING: 'OUTCOME_PENDING',     // در انتظار ارزیابی و ثبت پیامد در لایه حافظه بازخورد (EI-14)
  REVIEWED: 'REVIEWED'                    // بررسی نهایی و بسته شدن کامل چرخه
});
```

### ۱.۲. ترنزیشن‌های مجاز چرخه حیات (`ALLOWED_EXECUTION_TRANSITIONS`)
```javascript
const ALLOWED_EXECUTION_TRANSITIONS = Object.freeze({
  APPROVED_DECISION: ['TASK_CREATED'],
  TASK_CREATED: ['ASSIGNED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['BLOCKED', 'COMPLETED'],
  BLOCKED: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: ['OUTCOME_PENDING'],
  OUTCOME_PENDING: ['REVIEWED'],
  REVIEWED: [],
  CANCELLED: []
});
```

### ۱.۳. وضعیت توافق‌نامه سطح خدمت زمانی (`SLA_STATUS`)
```javascript
const SLA_STATUS = Object.freeze({
  ON_TRACK: 'ON_TRACK',   // زمان سپری‌شده کمتر از ۸۰٪ مهلت مقرر
  AT_RISK: 'AT_RISK',     // زمان سپری‌شده بین ۸۰٪ تا ۱۰۰٪ مهلت مقرر
  BREACHED: 'BREACHED'    // مهلت مقرر به پایان رسیده و اقدام هنوز کامل نشده
});
```

### ۱.۴. سطوح شدت موانع اجرایی (`BLOCKER_SEVERITY`)
```javascript
const BLOCKER_SEVERITY = Object.freeze({
  CRITICAL: 'CRITICAL',   // توقف کامل فرایند با عدم دسترسی به منبع حیاتی
  HIGH: 'HIGH',           // تاخیر جدی در مهلت قانونی نیازمند اقدام فوری مدیر
  MEDIUM: 'MEDIUM'        // کندی در اجرا یا نیاز به هماهنگی بین‌بخشی
});
```

---

## ۲. مشخصات ساختار قراردادهای داده (Data Contracts)

### ۲.۱. شناسنامه وظیفه عملیاتی (`OperationalTask`)
```typescript
interface OperationalTask {
  task_id: string;                    // شناسه یکتا مانند "TASK-SCH101-01"
  workflow_id: string;                // شناسه گردش کار متناظر
  decision_id: string;                // شناسه تصمیم مصوب ورودی از EI-17
  title: string;                      // عنوان وظیفه به زبان فارسی
  description?: string;               // شرح اقدامات موردنیاز
  domain: string;                     // "ATTENDANCE" | "ACADEMIC" | "TEACHING" | "FAMILY"
  execution_state: EXECUTION_STATE;   // وضعیت فعلی اجرا
  urgency: string;                    // "IMMEDIATE_24H" | "WEEKLY" | "MONTHLY" | "STRATEGIC_TERM"
  assigned_to: {
    actor_id: string | number;
    role: string;                     // "manager" | "deputy" | "counselor" | "teacher"
    assigned_at: string;              // ISO-8601
  } | null;
  sla: {
    deadline_at: string;              // تاریخ و ساعت پایان مهلت
    status: SLA_STATUS;               // "ON_TRACK" | "AT_RISK" | "BREACHED"
    delay_hours: number;              // ساعت‌های تاخیر در صورت نقض
  };
  blockers: Array<{
    blocker_id: string;
    type: string;
    severity: BLOCKER_SEVERITY;
    description: string;
    detected_at: string;
  }>;
  progress_pct: number;               // 0 .. 100
  history: Array<{
    from_state: string;
    to_state: string;
    actor_id: string | number;
    role: string;
    timestamp: string;
    note?: string;
  }>;
  created_at: string;                 // ISO-8601
  updated_at: string;                 // ISO-8601
}
```

### ۲.۲. داشبورد اجرای عملیاتی (`OperationalExecutionDashboard`)
```typescript
interface OperationalExecutionDashboard {
  school_id: number;
  region_id: number;
  academic_year: string;
  total_workflows: number;
  total_tasks: number;
  tasks_by_state: {
    APPROVED_DECISION: number;
    TASK_CREATED: number;
    ASSIGNED: number;
    IN_PROGRESS: number;
    BLOCKED: number;
    COMPLETED: number;
    OUTCOME_PENDING: number;
    REVIEWED: number;
  };
  sla_summary: {
    on_track_count: number;
    at_risk_count: number;
    breached_count: number;
    sla_compliance_rate_pct: number;
  };
  active_blockers: Array<any>;
  in_progress_tasks: Array<OperationalTask>;
  blocked_tasks: Array<OperationalTask>;
  outcome_pending_tasks: Array<OperationalTask>;
  automated_decision: false;          // تضمین عدم تصمیم‌گیری خودکار
  automated_execution: false;         // تضمین عدم اجرای خودکار بدون اراده انسانی
  requires_human_approval: true;      // الزام تایید صریح عامل انسانی
  zero_ranking: true;                 // منع قطعی رتبه‌بندی رقابتی مدارس
  generated_at: string;               // ISO-8601
}
```

---

## ۳. امنیت، چندمستأجری و کدهای خطا (Security & Error Codes)

در صورت نقض مرزهای سازمانی یا عدم تطابق نقش‌ها، توابع باید بلافاصله با پرتاب خطاهای رسمی زیر متوقف شوند (Fail-Closed):

| کد خطا | وضعیت HTTP | توضیح و سناریوی وقوع |
|:---|:---:|:---|
| `OPERATIONAL_EXECUTION_TENANT_ISOLATION_VIOLATION` | 403 Forbidden | تلاش کاربر مدرسه یا منطقه برای دسترسی یا دستکاری وظایف مدرسه دیگر |
| `OPERATIONAL_EXECUTION_ROLE_ACCESS_DENIED` | 403 Forbidden | تلاش نقش‌های فاقد صلاحیت ستادی نظیر دانش‌آموز یا والد برای دسترسی به داشبورد اجرا |
| `INVALID_EXECUTION_TRANSITION` | 400 Bad Request | تلاش برای پرش وضعیت خارج از قوانین ماشین حالت چرخه حیات |
| `EXECUTION_TASK_NOT_FOUND` | 404 Not Found | عدم وجود وظیفه عملیاتی مورد استعلام |

---

## ۴. الزامات قطعی بودن و ایمنی در برابر جهش (Determinism & Mutation Safety)

۱. **۱۰۰٪ قطعیت جبری:** تمام محاسبات و تخصیص وضعیت‌ها باید فاقد هرگونه رفتار تصادفی (`Math.random()`) بوده و با ورودی‌های یکسان، خروجی‌های بیت‌به‌بیت برابر تولید کنند.  
۲. **انجماد عمیق داده‌ها (`deepFreeze`):** تمام اشیا و آرایه‌های خروجی پیش از بازگشت به فراخوان منجمد شده تا از هرگونه جهش نامطلوب در لایه‌های بعدی حافظه ممانعت به عمل آید.
