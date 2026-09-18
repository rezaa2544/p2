# مدل مرکز فرماندهی و هوشمندی مدرسه (P0-EI-09)
## School Intelligence Command Center Data Contract and Model Specification

**شناسه سند:** `DOC-P0-EI-09-INTELLIGENCE-CENTER-MODEL`  
**نسخه:** ۱.۰.۰  
**تاریخ تصویب:** ۲۰۲۶-۰۹-۱۸  
**مالک راهبردی:** دفتر راهبری داده‌های آموزشی و نظارت راهبردی مدارس  
**منبع قطعی حقیقت (Source of Truth):** PostgreSQL (`attendance`, `grades`, `classes`, `schedule`, `teacher_evaluations`, `counselor_refs`)  

---

## ۱. قرارداد شناسنامه هوشمندی مدرسه (`SchoolIntelligenceSnapshot`)

```json
{
  "school_id": 10,
  "generated_at": "2026-09-18T10:00:00.000Z",
  "academic_year": "1405-1406",
  "health_index": {
    "score": 81.5,
    "status": "HEALTHY",
    "components": {
      "academic": 82.0,
      "attendance": 84.5,
      "engagement": 80.0,
      "intervention": 76.0
    },
    "critical_risk_count": 0,
    "no_masking_applied": false
  },
  "risk_summary": {
    "total_risks_count": 4,
    "critical_count": 0,
    "high_count": 2,
    "medium_count": 2,
    "top_risks": [
      {
        "domain": "ATTENDANCE",
        "priority": "HIGH",
        "description": "تشدید تأخیر در ورود در روزهای شنبه"
      }
    ]
  },
  "academic_summary": {
    "average_gpa": 15.6,
    "failing_students_ratio": 0.05,
    "at_risk_subjects_count": 1
  },
  "attendance_summary": {
    "calendar_rate": 93.4,
    "chronic_absence_rate": 6.2,
    "peak_absence_day": "wednesday"
  },
  "assessment_summary": {
    "total_exams_analyzed": 14,
    "hard_exams_count": 1,
    "outlier_clusters_count": 0
  },
  "teacher_summary": {
    "active_teachers_count": 18,
    "overloaded_teachers_count": 1,
    "exemplary_evidence_count": 6
  },
  "parent_summary": {
    "average_pei": 78.4,
    "unjustified_absences_pending": 4
  },
  "intervention_summary": {
    "active_cases_count": 8,
    "unassigned_high_priority_count": 0,
    "resolution_rate": 62.5
  },
  "action_center": [
    {
      "priority": "CRITICAL",
      "source": "ATTENDANCE",
      "action": "رسیدگی به پرونده‌های غیبت مزمن دانش‌آموزان پایه دهم",
      "deadline": "24h"
    }
  ]
}
```

---

## ۲. فرمول شاخص سلامت ترکیبی و اصل عدم پنهان‌سازی (No-Masking Health Index)

### ۲.۱. فرمول محاسبه شاخص سلامت:
$$HealthIndex = 0.35 \times C_{\text{academic}} + 0.30 \times C_{\text{attendance}} + 0.20 \times C_{\text{engagement}} + 0.15 \times C_{\text{intervention}}$$

- **مؤلفه آموزشی ($C_{\text{academic}}$):** درصد قبولی دانش‌آموزان و میانگین نمرات نرمال‌شده به مقیاس ۱۰۰.
- **مؤلفه حضور ($C_{\text{attendance}}$):** نرخ حضور تقویمی منهای جریمه غیبت مزمن ($AttRate - 2 \times ChronicRate$).
- **مؤلفه مشارکت و تعامل ($C_{\text{engagement}}$):** میانگین شاخص تعامل اولیا (PEI) و تکمیل سبد شواهد تدریس.
- **مؤلفه مداخله ($C_{\text{intervention}}$):** نرخ رسیدگی به پرونده‌های مداخله فعال و پوشش به‌موقع.

### ۲.۲. اصل عدم پنهان‌سازی (No-Masking Principle):
در صورتی که هر یک از ریسک‌های بحرانی زیر رخ دهد، حتی اگر نمره عددی بالای ۸۰ باشد:
$$\text{critical\_risk\_count} > 0 \implies \text{health\_status} = \text{"NEEDS\_IMMEDIATE\_ACTION"}$$

محرک‌های بحرانی:
1. نرخ غیبت مزمن مدرسه $\ge 15\%$
2. افت جمعی معدل بیش از ۲ نمره نسبت به بازه قبل
3. وجود پرونده‌های با اولویت `CRITICAL` بدون مسئول (Unassigned) بیش از ۴۸ ساعت

---

## ۳. مرکز اقدامات روزانه مدیر (Principal Action Center)

هر اقدام در مرکز تصمیم‌گیری شامل ۴ ویژگی قطعی است:
- `priority`: سطوح سه‌گانه (`CRITICAL`, `HIGH`, `MEDIUM`).
- `source`: منبع شناسایی (`ATTENDANCE`, `ACADEMIC`, `ASSESSMENT`, `INTERVENTION`, `PARENT`).
- `action`: دستور اقدام عملیاتی شفاف.
- `deadline`: مهلت زمانی صریح (`24h`, `48h`, `7d`).

---

## ۴. تجمیع منطقه‌ای بدون رتبه‌بندی (`DistrictAggregationSummary`)

```json
{
  "district_id": 1,
  "total_schools": 42,
  "generated_at": "2026-09-18T10:00:00.000Z",
  "is_ranked": false,
  "ranking_score": null,
  "league_table": null,
  "health_distribution": {
    "HEALTHY": 28,
    "NEEDS_MONITORING": 11,
    "NEEDS_IMMEDIATE_ACTION": 3
  },
  "overall_average_attendance": 92.8,
  "district_chronic_absence_rate": 7.4,
  "total_active_interventions": 114,
  "common_critical_issues": [
    "تمرکز غیبت‌های متوالی در مدارس مقطع متوسطه دوم"
  ]
}
```

- **تضمین اکید:** عدم درج هرگونه جدول رتبه‌ای (`league_table: null`, `is_ranked: false`).

---

## ۵. قرارداد وب‌سرویس (RESTful API Contract)

- **مسیر فراخوانی:** `GET /api/v1/analytics/school-intelligence`
- **پارامترهای ورودی (Query Parameters):**
  - `school_id` (اجباری): شناسه مدرسه
  - `academic_year` (اختیاری): سال تحصیلی (پیش‌فرض: سال جاری)
- **پاسخ موفق (200 OK):**
  - بازگرداندن شیء `SchoolIntelligenceSnapshot` همراه با متادیتای نسخه‌گذاری (`api_version: "1.0.0"`).
- **خطاهای مورد انتظار:**
  - `400 Bad Request`: در غیاب `school_id`
  - `403 Forbidden`: در صورت عدم تطابق نقش یا نشت چندمستأجری (`SCHOOL_INTELLIGENCE_ACCESS_FORBIDDEN`)
