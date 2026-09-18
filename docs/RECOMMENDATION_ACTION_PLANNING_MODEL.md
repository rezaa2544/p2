# مدل قرارداد موتور پیشنهاددهنده و برنامه‌ریزی اقدام آموزشی (P0-EI-13)
## Educational Intelligence Recommendation & Action Planning Model Specification

**شناسه سند:** `DOC-P0-EI-13-RECOMMENDATION-PLANNING-MODEL`  
**نسخه:** ۱.۰.۰ (`v1.0.0`)  
**تاریخ تصویب:** ۲۰۲۶-۰۹-۱۸  
**مالک راهبردی:** شورای راهبری هوشمندی آموزشی و هیئت نظارت  
**منبع قطعی حقیقت (Source of Truth):** PostgreSQL و جدول سوابق اقدامات (`educational_action_recommendations`)  

---

## ۱. مدل داده‌ای رکورد پیشنهاد اقدام (`ActionRecommendationRecord`)

```json
{
  "recommendation_id": "ACT-REC-SCH1-1405-001",
  "entity_type": "school",
  "entity_id": 1,
  "trigger_source": "ATTENDANCE_INTELLIGENCE",
  "action_type": "ATTENDANCE_SUPPORT",
  "evidence": {
    "metric": "chronic_absence_rate",
    "current_value": 14.2,
    "baseline_value": 7.0,
    "trend": "DECLINING",
    "threshold_exceeded": true
  },
  "severity": "HIGH",
  "suggested_action": "برگزاری جلسه هم‌اندیشی مشاور با اولیای دانش‌آموزان دارای غیبت متوالی و پیگیری سرویس تردد",
  "responsible_role": "counselor",
  "deadline": "2026-10-15",
  "approval_status": "REVIEW_PENDING",
  "priority_score": 82.5,
  "automated_decision": false,
  "requires_human_confirmation": true,
  "created_at": "2026-09-18T10:00:00.000Z",
  "history": [
    {
      "status": "GENERATED",
      "timestamp": "2026-09-18T10:00:00.000Z",
      "actor_id": null,
      "note": "تولید سیستمی پیشنهاد بر مبنای سیگنال‌های غیبت مزمن"
    },
    {
      "status": "REVIEW_PENDING",
      "timestamp": "2026-09-18T10:00:00.000Z",
      "actor_id": null,
      "note": "در انتظار بررسی و تأیید کادر مدیریت مدرسه"
    }
  ]
}
```

---

## ۲. ماشین چرخه حیات اقدام آموزشی (Action Lifecycle Machine)

```
       [ GENERATED ]
             │
             ▼
     [ REVIEW_PENDING ] ◄── (پیش‌فرض تولید، در انتظار تصمیم انسان)
             │
      ┌──────┴──────┐
      │             │
      ▼             ▼
  [ APPROVED ]  [ CANCELLED ]
      │
      ▼
 [ IN_PROGRESS ]
      │
      ▼
  [ EVALUATING ]
      │
      ▼
  [ COMPLETED ]
```

### ترنزیشن‌های مجاز و نقش‌های مجری:
| وضعیت مبدأ | وضعیت مقصد | نقش‌های مجاز | شرط و کنترل |
|:---:|:---:|:---:|---|
| `GENERATED` | `REVIEW_PENDING` | System | خودکار پس از استخراج شواهد |
| `REVIEW_PENDING` | `APPROVED` | `manager`, `counselor`, `edu_office` | ثبت شناسه کاربر و یادداشت موافقت |
| `REVIEW_PENDING` | `CANCELLED` | `manager`, `edu_office` | ثبت دلیل مستدل برای رد پیشنهاد |
| `APPROVED` | `IN_PROGRESS` | `manager`, `counselor`, `teacher` | شروع رسمی اقدامات میدانی |
| `IN_PROGRESS` | `EVALUATING` | `manager`, `counselor`, `edu_office` | ثبت داده‌های مقیاس پس از دوره اقدام |
| `EVALUATING` | `COMPLETED` | `manager`, `counselor`, `edu_office` | ارزیابی موفقیت و بستن پرونده |
| `EVALUATING` | `IN_PROGRESS` | `manager`, `edu_office` | نیاز به بازنگری یا ادامه اقدام |

---

## ۳. الگوریتم اولویت‌بندی پیشنهادها (`prioritizeActions`)

اولویت اقدام بر مبنای ضرب سه‌گانه عوامل عینی بدون هرگونه مقایسه رقابتی با سایر مدارس محاسبه می‌شود:

$$\text{Priority Score} = \frac{\text{Impact} \times \text{Urgency} \times \text{EvidenceStrength}}{75} \times 100$$

- **دامنه مقادیر:**
  - $\text{Impact} \in [1, 5]$: شدت اثرگذاری بر موفقیت یا سلامت یادگیرنده (بحرانی = ۵، هشدار = ۳، روتین = ۱).
  - $\text{Urgency} \in [1, 5]$: حساسیت زمانی اقدام (۲۴ ساعت فوری = ۵، هفتگی = ۳، ماهانه = ۱).
  - $\text{EvidenceStrength} \in [1.0, 3.0]$: استحکام داده‌ها (تداوم روند منفی چنددوره‌ای = ۳.۰، تغییر ناگهانی تاییدشده = ۲.۰، سیگنال منفرد = ۱.۰).
- **سطوح اولویت:**
  - $\text{Priority Score} \ge 75 \implies \text{CRITICAL}$
  - $50 \le \text{Priority Score} < 75 \implies \text{HIGH}$
  - $25 \le \text{Priority Score} < 50 \implies \text{MEDIUM}$
  - $\text{Priority Score} < 25 \implies \text{LOW}$

---

## ۴. ماتریس تخصیص نقش متولی اقدام (`assignActionOwner`)

| حوزه اقدام (`action_type`) | نقش متولی مسئول | شرح مأموریت |
|:---:|:---:|---|
| `ATTENDANCE_SUPPORT` | `counselor` (مشاور) | تماس با اولیا، بررسی دلایل غیبت، هماهنگی مشاوره‌ای |
| `ACADEMIC_REMEDIAL` | `teacher` / `counselor` | تشکیل کلاس جبرانی، تفکیک آزمون، بازخورد اصلاحی |
| `TEACHER_DEVELOPMENT` | `manager` (مدیر مدرسه) | نظارت کلاسی، تعدیل بار کاری، معرفی دوره رشد |
| `REGIONAL_RESOURCE` | `edu_office` (کارشناس اداره) | تخصیص ردیف معلم پشتیبان، ملزومات فیزیکی و روانشناختی |
| `PARENT_COLLABORATION` | `counselor` / `manager` | برگزاری نشست انجمن اولیا و مربیان، شفاف‌سازی انضباطی |

---

## ۵. سنجش اثربخشی اقدام (`evaluateActionEffectiveness`)

پس از طی دوره اجرا، متغیرهای کلیدی قبل و بعد مقایسه می‌شوند:

$$\Delta \text{Attendance} = \text{PostAttendance} - \text{PreAttendance}$$
$$\Delta \text{GPA} = \text{PostGPA} - \text{PreGPA}$$
$$\Delta \text{Engagement} = \text{PostEngagement} - \text{PreEngagement}$$

### طبقه‌بندی وضعیت اثربخشی:
1. **`HIGHLY_EFFECTIVE`:** بهبود بیش از ۱۰٪ در شاخص هدف یا کاهش بیش از ۳ واحد غیبت مزمن.
2. **`PARTIALLY_EFFECTIVE`:** بهبود بین ۳٪ تا ۱۰٪ در شاخص هدف.
3. **`INEFFECTIVE`:** تغییر صفر یا نوسان جزئی زیر ۳٪.
4. **`REQUIRES_ESCALATION`:** وخامت بیشتر شاخص هدف با وجود اجرای اقدام $\rightarrow$ نیازمند ارجاع فوری به اداره منطقه.

---

## ۶. تابلوی اقدامات مدیر مدرسه (`PrincipalActionBoard`)

داشبورد اقدامات مدیر مدرسه به سه دسته‌بندی زمانی شفاف تقسیم می‌شود:

```json
{
  "school_id": 1,
  "generated_at": "2026-09-18T10:00:00.000Z",
  "immediate_24h_actions": [
    { "recommendation_id": "REC-01", "title": "تماس اضطراری با اولیای غایب بحرانی", "priority": "CRITICAL" }
  ],
  "weekly_actions": [
    { "recommendation_id": "REC-02", "title": "کارگاه تقویتی ریاضی پایه نهم", "priority": "HIGH" }
  ],
  "district_support_needed_actions": [
    { "recommendation_id": "REC-03", "title": "درخواست معلم جایگزین برای پایه هفتم", "priority": "HIGH" }
  ],
  "zero_ranking_policy_enforced": true,
  "is_ranked": false,
  "ranking_score": null,
  "league_table": null,
  "best_school": null,
  "worst_school": null
}
```

---

## ۷. گارد امنیتی و تفکیک چندمستأجری (`enforceRecommendationAccessGuard`)

1. **مدیر مدرسه (`manager`):**
   - دسترسی منحصراً محدود به اقدامات مدرسه خود (`school_id`).
   - تلاش برای مشاهده یا تغییر وضعیت اقدامات سایر مدارس منجر به سقط فوری با استثنای زیر می‌شود:
     `RECOMMENDATION_TENANT_ISOLATION_VIOLATION: manager cannot access actions of foreign school`
2. **مشاور مدرسه (`counselor`):**
   - دسترسی به اقدامات حمایتی دانش‌آموزان و حضور و غیاب مدرسه خود.
3. **کارشناس اداره منطقه (`edu_office`):**
   - دسترسی به اقدامات نیازمند منابع منطقه‌ای و تابلوی مدارس زیرمجموعه منطقه خود (`region_id`).
4. **مدیر ارشد سامانه (`superadmin`):**
   - دسترسی کامل نظارتی.
5. **سایر نقش‌ها:** سقط با خطای `RECOMMENDATION_ACCESS_FORBIDDEN`.
