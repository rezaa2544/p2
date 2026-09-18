# مدل راهبری کیفیت آموزشی و چرخه بهبود مستمر (P0-EI-11)
## Educational Quality Governance & Continuous Improvement Model Specification

**شناسه سند:** `DOC-P0-EI-11-QUALITY-GOVERNANCE-MODEL`  
**نسخه:** ۱.۰.۰  
**تاریخ تصویب:** ۲۰۲۶-۰۹-۱۸  
**مالک راهبردی:** شورای عالی راهبری کیفیت آموزشی و هیئت نظارت  
**منبع قطعی حقیقت (Source of Truth):** PostgreSQL (خروجی‌های تحلیلی تجمیعی مدارس و پرونده‌های پایش)  

---

## ۱. ارکان پنج‌گانه ارزیابی کیفیت آموزشی (`QualityPillarAssessment`)

```json
{
  "school_id": 10,
  "evaluated_at": "2026-09-18T10:00:00.000Z",
  "pillars": {
    "ACADEMIC_MASTERY": {
      "score": 82.5,
      "status": "OPTIMAL",
      "metrics": { "average_gpa": 16.2, "failing_ratio": 0.03 }
    },
    "ATTENDANCE_STABILITY": {
      "score": 68.0,
      "status": "NEEDS_IMPROVEMENT",
      "metrics": { "calendar_rate": 89.0, "chronic_absence_rate": 11.5 }
    },
    "ASSESSMENT_VALIDITY_AND_FAIRNESS": {
      "score": 85.0,
      "status": "OPTIMAL",
      "metrics": { "hard_exams_count": 0, "anomalies_count": 0 }
    },
    "TEACHING_EVIDENCE_AND_SUPPORT": {
      "score": 78.0,
      "status": "ADEQUATE",
      "metrics": { "overloaded_teachers_count": 1, "formative_coverage": 65.0 }
    },
    "FAMILY_AND_COMMUNITY_COLLABORATION": {
      "score": 80.0,
      "status": "ADEQUATE",
      "metrics": { "average_pei": 80.0, "pending_justifications": 2 }
    }
  },
  "overall_governance_status": "NEEDS_FOCUSED_IMPROVEMENT",
  "priority_focus_pillar": "ATTENDANCE_STABILITY"
}
```

- **سطوح وضعیت ارکان:**
  - `OPTIMAL`: امتیاز $\ge 80$
  - `ADEQUATE`: $65 \le$ امتیاز $< 80$
  - `NEEDS_IMPROVEMENT`: امتیاز $< 65$ یا بروز محرک‌های بحرانی

---

## ۲. چرخه بهبود مستمر کیفیت (PDCA Continuous Improvement Cycle)

چرخه بهبود به عنوان سند رسمی پیگیری عمل می‌کند:

```json
{
  "cycle_id": "Q-CYCLE-10-1405-01",
  "school_id": 10,
  "academic_year": "1405-1406",
  "target_pillar": "ATTENDANCE_STABILITY",
  "phase": "PLAN",
  "status": "ACTIVE",
  "created_at": "2026-09-18T10:00:00.000Z",
  "initiator_id": 101,
  "initiator_role": "manager",
  "baseline_metrics": {
    "calendar_rate": 89.0,
    "chronic_absence_rate": 11.5
  },
  "target_goals": {
    "target_calendar_rate": 93.0,
    "target_chronic_absence_rate": 6.0,
    "deadline": "2026-10-30"
  },
  "action_items": [
    {
      "step": "DO",
      "action": "برگزاری جلسه انجمن اولیا و پیگیری علل غیبت روزهای چهارشنبه",
      "responsible_role": "manager",
      "status": "PENDING"
    }
  ],
  "check_evaluation": null,
  "history": [
    {
      "phase": "PLAN",
      "timestamp": "2026-09-18T10:00:00.000Z",
      "actor_id": 101,
      "note": "چرخه بهبود ثبات حضور آغاز شد"
    }
  ]
}
```

---

## ۳. سنجش اثربخشی چرخه بهبود (`QualityImprovementOutcome`)

$$ImprovementEffect = \Delta Metric_{\text{post}} - \Delta Metric_{\text{pre}}$$

```json
{
  "cycle_id": "Q-CYCLE-10-1405-01",
  "evaluation_date": "2026-10-30",
  "evaluator_id": 101,
  "pre_metrics": { "chronic_absence_rate": 11.5 },
  "post_metrics": { "chronic_absence_rate": 5.8 },
  "delta": -5.7,
  "efficacy_level": "HIGHLY_EFFECTIVE",
  "next_act_decision": "STANDARDIZE_PROCESS",
  "notes": "کاهش چشمگیر نرخ غیبت مزمن و تحقق هدف تعیین‌شده"
}
```

- **تصمیم فاز Act:**
  - `STANDARDIZE_PROCESS`: تثبیت فرآیند و بستن موفق چرخه (`COMPLETED`).
  - `ADJUST_AND_RETRY`: تعدیل اقدامات و تداوم فاز اجرا (`ACTIVE`).
  - `ESCALATE_TO_DISTRICT`: ارجاع به اداره منطقه جهت تخصیص منابع تکمیلی (`ESCALATED`).

---

## ۴. تجمیع راهبری کیفیت در سطح منطقه بدون رتبه‌بندی (`DistrictQualityGovernanceSummary`)

```json
{
  "district_id": 1,
  "total_schools": 42,
  "is_ranked": false,
  "ranking_score": null,
  "league_table": null,
  "best_school": null,
  "worst_school": null,
  "pillar_health_summary": {
    "ACADEMIC_MASTERY": { "optimal_count": 32, "needs_improvement_count": 3 },
    "ATTENDANCE_STABILITY": { "optimal_count": 28, "needs_improvement_count": 6 },
    "ASSESSMENT_VALIDITY_AND_FAIRNESS": { "optimal_count": 35, "needs_improvement_count": 2 },
    "TEACHING_EVIDENCE_AND_SUPPORT": { "optimal_count": 30, "needs_improvement_count": 4 },
    "FAMILY_AND_COMMUNITY_COLLABORATION": { "optimal_count": 34, "needs_improvement_count": 3 }
  },
  "active_cycles_count": 14,
  "completed_cycles_count": 8,
  "cycle_success_rate": 78.5
}
```

---

## ۵. امنیت، احراز هویت و ایزولاسیون

1. **گارد احراز دسترسی (`enforceQualityGovernanceAccessGuard`):**
   - مدیر مدرسه فقط مجاز به چرخه‌های بهبود مدرسه خود است.
   - کارشناس اداره منطقه به چرخه‌های مدارس منطقه خود دسترسی دارد.
   - نقش‌های غیرمجاز فوراً با استثنای `QUALITY_GOVERNANCE_ACCESS_FORBIDDEN` یا `TENANT_ISOLATION_VIOLATION` سقط می‌شوند.
2. **سیاست قطعی شکست ایمن (Fail-Closed):** در صورت بروز هرگونه تناقض شناسه مدرسه در چرخه، اجرا فوراً متوقف می‌شود.
