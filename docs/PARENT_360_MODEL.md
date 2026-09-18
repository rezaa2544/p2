# مدل نمای جامع والدین و مرکز اقدامات خانواده (P0-EI-06)
## Parent 360 & Family Action Center Specification & Data Contract

**نسخه:** ۱.۰.۰  
**وضعیت:** مصوب (Approved)  
**ماژول مرجع:** `server/analytics/parent-360.js`  
**آزمون‌های مرجع:** `tests/semantic-layer/parent-360/*.test.js`

---

## ۱. اصول معماری و حریم خصوصی

این سند مشخصات داده‌ای، ساختارهای JSON، اعتبارسنجی‌های امنیتی و قواعد ضد نفوذ (Anti-IDOR) ماژول **نمای ۳۶۰ درجه والدین و مرکز اقدامات خانواده (Parent 360 & Family Action Center)** را تعریف می‌کند.

### اصول اساسی غیرقابل مذاکره:
1. **امنیت بدون درز و ضد IDOR (Strict Anti-IDOR & Zero Trust):** والد فقط و فقط مجاز به مشاهده داده‌های فرزندان قانونی ثبت‌شده در `parent_links` است. تلاش برای دسترسی به سایر شناسه‌ها فوراً خطای قطعی `PARENT_ACCESS_FORBIDDEN` پرتاب می‌کند.
2. **ایزولاسیون مستقل هر فرزند (Per-Child Multi-Tenant Isolation):** در خانواده‌های چندفرزندی که فرزندان در مدارس متفاوتی تحصیل می‌کنند، پردازش پرونده هر فرزند کاملاً ایزوله و تحت `school_id` همان مدرسه انجام می‌شود.
3. **محاسبات ۱۰۰٪ قطعی و بدون عوارض جانبی (Deterministic & Pure):** تمامی محاسبات، استخراج اقدامات و خلاصه‌سازی پرونده با ورودی یکسان، خروجی بیت‌به‌بیت یکسان تولید می‌کنند و هیچ‌گونه تغییری روی اشیای ورودی (`Object.freeze`) اعمال نمی‌شود.
4. **رویکرد حمایتی و غیرمخرب (Constructive & Non-Punitive):** شاخص‌ها برای اولیا با زبان سازنده، روشن و فاقد اصطلاحات روان‌سنجی پیچیده نمایش داده می‌شوند و تمرکز بر «اقدامات یاری‌رسان» است.

---

## ۲. مشخصات شاخص‌ها و ابعاد پرونده والد

### ۲.۱. امتیاز مشارکت سازنده خانواده (Parent Engagement Index):
شاخص مشارکت خانواده در فرآیند آموزشی فرزند بر پایه ترکیب ۳ مؤلفه در مقیاس ۰ تا ۱۰۰ محاسبه می‌شود:
$$PEI = 0.40 \times C_{\text{action}} + 0.35 \times T_{\text{just}} + 0.25 \times R_{\text{portal}}$$
- $C_{\text{action}}$ (تکمیل اقدامات): نسبت اقدامات انجام‌شده توسط والد به کل اقدامات ضروری ثبت‌شده.
- $T_{\text{just}}$ (به‌موقع بودن توجیه غیبت): درصد غیبت‌های غیرموجهی که ظرف ۴۸ ساعت توسط ولی با ارائه دلیل پاسخ داده شده است.
- $R_{\text{portal}}$ (استمرار تعامل): میزان بازدید و ارتباط مستمر هفتگی با پورتال پایش.

### ۲.۲. وضعیت آموزشی فرزند در نمای والد:
- **وضعیت حضور (Attendance Summary):** درصد حضور، تعداد جلسات غیبت غیرموجه نیازمند توجیه، و رده هشدار حضور.
- **وضعیت یادگیری (Academic Summary):** معدل کل به مقیاس ۲۰، دروس با عملکرد عالی (نمره $\ge 17$)، دروس نیازمند تقویت و پیگیری (نمره $< 12$).
- **رویدادهای کلیدی (Key Milestones):** استخراج نقاط عطف طولی به زبان قابل فهم خانواده (مانند جهش یادگیری در درس ریاضی، بازگشت به حضور کامل).

---

## ۳. قرارداد ساختار داده‌ها (JSON Data Contracts)

### ۳.۱. خروجی `buildParent360Profile`
```typescript
interface Parent360Profile {
  student_id: number;
  school_id: number;
  student_identity: {
    full_name: string;
    grade_level: string;
    class_name: string;
    school_name: string;
  };
  attendance_overview: {
    attendance_rate: number;
    unexcused_absences: number;
    late_arrivals_count: number;
    status: 'EXCELLENT' | 'STABLE' | 'WARNING' | 'CRITICAL';
  };
  academic_overview: {
    gpa: number | null;
    total_grades: number;
    strong_subjects_count: number;
    subjects_needing_support: string[];
    performance_status: 'EXCELLENT' | 'GOOD' | 'NEEDS_SUPPORT' | 'CRITICAL';
  };
  key_milestones: Array<{
    title: string;
    date: string;
    type: 'POSITIVE' | 'ATTENTION' | 'INFO';
    description: string;
  }>;
  pending_actions_count: number;
}
```

### ۳.۲. خروجی `generateParentActionItems`
```typescript
interface ParentActionItem {
  action_id: string;
  student_id: number;
  type:
    | 'JUSTIFY_ABSENCE'
    | 'ACKNOWLEDGE_WARNING'
    | 'SCHEDULE_CONFERENCE'
    | 'REVIEW_IEP'
    | 'PAY_TUITION_INSTALLMENT';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  reference_date?: string;
  reference_id?: number;
  deadline: string;
}
```

### ۳.۳. ورودی و خروجی `validateAbsenceJustification`
```typescript
// ورودی
interface AbsenceJustificationInput {
  parent_id: number;
  student_id: number;
  attendance_id: number;
  date: string;
  reason: string;
  attachment_ref?: string;
}

// خروجی
interface AbsenceJustificationResult {
  valid: boolean;
  status: 'PENDING_SCHOOL_REVIEW';
  submission: {
    parent_id: number;
    student_id: number;
    attendance_id: number;
    date: string;
    reason_sanitized: string;
    attachment_ref: string | null;
    submitted_at: string;
  };
}
```

---

## ۴. ماتریس اولویت اقدامات اولیا (Action Priority Matrix)

| نوع اقدام | اولویت | مهلت اقدام | شرح وظیفه ولی |
|---|:---:|:---:|---|
| **موجه‌سازی غیبت غیرموجه** (`JUSTIFY_ABSENCE`) | `HIGH` | ۴۸ ساعت | اعلام علت غیبت روز گذشته فرزند و بارگذاری گواهی پزشکی یا درخواست مرخصی |
| **امضای اخطار افت تحصیلی** (`ACKNOWLEDGE_WARNING`) | `CRITICAL` | ۲۴ ساعت | مشاهده نمره زیر ۱۰ و اعلام تایید آگاهی به معاونت آموزشی مدرسه |
| **هماهنگی جلسه با مشاور** (`SCHEDULE_CONFERENCE`) | `HIGH` | ۷۲ ساعت | انتخاب نوبت خالی از تقویم دیدارهای مشاور تحصیلی مدرسه |
| **پرداخت سررسید شهریه** (`PAY_TUITION_INSTALLMENT`) | `MEDIUM` | تاریخ سررسید | واریز قسط معوقه به حساب مجاز مدرسه |
