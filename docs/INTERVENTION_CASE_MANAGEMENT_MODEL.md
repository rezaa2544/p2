# مدل مدیریت پرونده‌های مداخله زودهنگام (P0-EI-08)
## Intervention Case Management Data Contract and Model Specification

**شناسه سند:** `DOC-P0-EI-08-INTERVENTION-MODEL`  
**نسخه:** ۱.۰.۰  
**تاریخ تصویب:** ۲۰۲۶-۰۹-۱۸  
**مالک راهبردی:** هسته مشاوره و پیشگیری از افت تحصیلی، دفتر هوشمندی آموزش  
**منبع قطعی حقیقت (Source of Truth):** PostgreSQL (`counselor_refs`, `counselor_msgs`, `grades`, `attendance`)  

---

## ۱. قوانین هشدار زودهنگام (Early Warning Rule Triggers)

سیستم به صورت قاعده‌محور و قطعی (Rule-based) رویدادهای بحرانی دانش‌آموز را به پرچم‌های هشدار تبدیل می‌کند:

| شناسه هشدار | شاخص محرک | شرط فعال‌سازی | سطح اولویت |
|---|---|---|:---:|
| `CRITICAL_ACADEMIC_DROP` | معدل نمرات | $GPA < 10.0$ یا افت معدل $\ge 3.0$ نمره نسبت به بازه قبل | `HIGH` |
| `CHRONIC_ABSENCE_ALERT` | نرخ غیبت | $AbsenceRate \ge 10\%$ در ۳۰ روز گذشته یا $\ge 3$ روز غیبت متوالی | `HIGH` |
| `DISENGAGEMENT_ALERT` | مشارکت کلاسی | عدم ثبت نمره/تکلیف در ۲ درس متوالی در ۳۰ روز گذشته | `MEDIUM` |
| `DROPOUT_RISK_COMPOUND` | ترکیب چندگانه | $GPA < 10.0$ همزمان با $AbsenceRate \ge 15\%$ | `CRITICAL` |

---

## ۲. قراردادهای داده‌ای چرخه پرونده مداخله

### ۲.۱. رکورد پرونده مداخله (`InterventionCase`)

```json
{
  "case_id": "CASE-10-2026-401",
  "student_id": 401,
  "school_id": 10,
  "trigger_type": "DROPOUT_RISK_COMPOUND",
  "priority": "CRITICAL",
  "status": "OPEN",
  "created_at": "2026-09-18T08:00:00Z",
  "assigned_role": "counselor",
  "assigned_to_id": 205,
  "baseline_metrics": {
    "gpa": 8.5,
    "attendance_rate": 78.0,
    "failing_subjects_count": 3
  },
  "action_plan": null,
  "outcome_assessment": null,
  "history": [
    {
      "status": "OPEN",
      "timestamp": "2026-09-18T08:00:00Z",
      "updated_by": 205,
      "note": "پرونده بر اساس سیستم هشدار زودهنگام ایجاد شد"
    }
  ]
}
```

---

### ۲.۲. برنامه اقدام مداخله‌ای (`InterventionActionPlan`)

```json
{
  "strategy_type": "COMBINED_ACADEMIC_COUNSELING",
  "interventions": [
    {
      "type": "ACADEMIC_TUTORING",
      "subject": "ریاضی",
      "responsible_role": "teacher",
      "responsible_id": 102,
      "sessions_planned": 6
    },
    {
      "type": "COUNSELING_SESSION",
      "responsible_role": "counselor",
      "responsible_id": 205,
      "focus": "انگیزش تحصیلی و بررسی موانع خانوادگی"
    },
    {
      "type": "FAMILY_CONFERENCE",
      "responsible_role": "manager",
      "responsible_id": 50,
      "scheduled_date": "2026-09-25"
    }
  ],
  "start_date": "2026-09-19",
  "review_deadline": "2026-10-19",
  "expected_goals": {
    "target_gpa": 12.0,
    "target_attendance_rate": 90.0
  }
}
```

---

### ۲.۳. سنجش اثربخشی مداخله (`InterventionOutcomeAssessment`)

$$Score_{\text{effect}} = 0.6 \times \Delta GPA_{\text{norm}} + 0.4 \times \Delta AttRate$$

```json
{
  "evaluation_date": "2026-10-19",
  "evaluated_by_id": 205,
  "evaluated_by_role": "counselor",
  "pre_metrics": {
    "gpa": 8.5,
    "attendance_rate": 78.0
  },
  "post_metrics": {
    "gpa": 12.5,
    "attendance_rate": 92.0
  },
  "delta_gpa": 4.0,
  "delta_attendance_rate": 14.0,
  "efficacy_level": "HIGHLY_EFFECTIVE",
  "recommendation": "CLOSURE",
  "evaluator_notes": "دانش‌آموز با حضور در کلاس‌های تقویتی و حل مسائل خانوادگی به وضعیت باثبات بازگشت"
}
```

---

### ۲.۴. خلاصه پرونده‌های مدرسه (`SchoolInterventionSummary`)

```json
{
  "school_id": 10,
  "total_cases": 24,
  "status_breakdown": {
    "OPEN": 3,
    "UNDER_REVIEW": 4,
    "INTERVENTION_ACTIVE": 11,
    "EVALUATING": 2,
    "RESOLVED": 3,
    "ESCALATED": 1
  },
  "active_cases_count": 18,
  "resolution_rate": 12.5,
  "high_priority_unassigned_count": 1,
  "effective_interventions_ratio": 0.75
}
```

---

## ۳. امنیت، تفکیک دسترسی و کنترل IDOR

1. **گارد پرونده مداخله (`enforceInterventionAccessGuard`):**
   - مشاور و مدیر صرفاً به پرونده‌های مدرسه خود دسترسی دارند.
   - هرگونه فراخوانی پرونده مدرسه بیگانه با خطای `TENANT_ISOLATION_VIOLATION` قطع می‌شود.
   - دسترسی اولیا و دانش‌آموزان به یادداشت‌های حساس مشاوره‌ای مسدود است (`INTERVENTION_ACCESS_FORBIDDEN`).
2. **عدم تصمیم‌گیری خودکار بدون تأیید انسان (Human-in-the-Loop):**
   - تغییر وضعیت پرونده به `RESOLVED` یا `ESCALATED` نیازمند تأیید مشاور یا مدیر با شناسه هویتی معتبر است.
