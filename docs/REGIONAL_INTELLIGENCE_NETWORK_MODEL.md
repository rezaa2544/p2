# مدل شبکه بینش و اقدام منطقه‌ای هوشمندی آموزشی (P0-EI-10)
## Regional Educational Intelligence Network Model Specification

**شناسه سند:** `DOC-P0-EI-10-REGIONAL-NETWORK-MODEL`  
**نسخه:** ۱.۰.۰  
**تاریخ تصویب:** ۲۰۲۶-۰۹-۱۸  
**مالک راهبردی:** دفتر راهبری آموزش و پرورش مناطق، معاونت پایش و ارزشیابی  
**منبع قطعی حقیقت (Source of Truth):** خروجی‌های تجمیعی مراکز هوشمندی مدارس منطقه بر بستر PostgreSQL  

---

## ۱. بیانیه مأموریت و اصول پایه (Foundational Rules)

1. **اصل عدم رتبه‌بندی خطی (Zero League Tables):**
   - هیچ رتبه‌بندی، لیست بهترین/بدترین مدارس یا مقایسه تحقیرآمیز در سطح منطقه تولید نمی‌شود.
2. **محرمانگی آماری و حریم خصوصی (Privacy-Preserving Aggregation):**
   - شناسنامه منطقه‌ای فاقد هرگونه داده هویتی فردی (نام دانش‌آموز، کدملی، نمرات فردی یا یادداشت‌های محرمانه مشاوره‌ای) است.
3. **تصمیم‌یاری متمرکز بر حمایت (Support-Driven Analytics):**
   - هدف این شبکه تبدیل داده‌ها به برنامه‌های عملیاتی حمایت و توانمندسازی مدارس نیازمند پشتیبانی است.
4. **شکست ایمن در سطح منطقه (`Fail-Closed Regional Tenant Isolation`):**
   - ترکیب داده‌های مدارس متعلق به مناطق دیگر اکیداً مسدود و منجر به خطای `REGIONAL_TENANT_ISOLATION_VIOLATION` می‌شود.

---

## ۲. قرارداد ساختار شناسنامه منطقه‌ای (`RegionalIntelligenceSnapshot`)

```json
{
  "region_id": 1,
  "academic_year": "1405-1406",
  "generated_at": "2026-09-18T10:00:00.000Z",
  "school_count": 42,
  "educational_health_summary": {
    "total_schools": 42,
    "healthy_schools_count": 28,
    "needs_monitoring_count": 11,
    "needs_immediate_action_count": 3,
    "average_attendance_rate": 92.4,
    "average_gpa": 15.8,
    "is_ranked": false,
    "ranking_score": null,
    "league_table": null,
    "best_school": null,
    "worst_school": null
  },
  "risk_distribution": {
    "critical_schools_count": 3,
    "high_risk_schools_count": 8,
    "medium_risk_schools_count": 14,
    "low_risk_schools_count": 17,
    "dominant_risk_area": "ATTENDANCE"
  },
  "intervention_summary": {
    "total_active_cases": 114,
    "unassigned_high_priority_cases": 4,
    "overall_resolution_rate": 68.5,
    "effective_interventions_ratio": 0.82
  },
  "attendance_patterns": {
    "average_calendar_rate": 92.4,
    "average_chronic_absence_rate": 7.1,
    "peak_absence_day": "wednesday",
    "temporal_risk_detected": true
  },
  "assessment_patterns": {
    "total_exams_surveyed": 540,
    "hard_exams_count": 18,
    "average_difficulty_p_value": 0.58,
    "grade_inflation_clusters_detected": 2
  },
  "resource_needs": [
    {
      "category": "COUNSELING_SUPPORT",
      "priority": "CRITICAL",
      "target_schools_count": 3,
      "description": "نیاز به اعزام مشاور سیار به ۳ مدرسه با پرونده‌های مداخله معوق"
    }
  ],
  "action_recommendations": [
    {
      "priority": "CRITICAL",
      "cause": "طغیان غیبت مزمن و پرونده‌های بحرانی بلاتکلیف در ۳ مدرسه",
      "evidence": "نرخ غیبت مزمن بالای ۱۵٪ و ۴ پرونده بحرانی بدون مشاور",
      "proposed_action": "اعزام تیم مشاوره سیار اداره و تشکیل جلسه فوری با مدیران مدارس هدف",
      "timeframe": "48h"
    }
  ],
  "privacy_flags": {
    "individual_pii_excluded": true,
    "k_anonymity_threshold_met": true,
    "confidential_clinical_notes_stripped": true
  }
}
```

---

## ۳. فرمول‌های ریاضی و استخراج شاخص‌های منطقه‌ای

### ۳.۱. توزیع سلامت آموزشی منطقه:
$$HealthyRatio = \frac{N_{\text{healthy}}}{N_{\text{total}}}, \quad ImmediateActionRatio = \frac{N_{\text{immediate\_action}}}{N_{\text{total}}}$$

### ۳.۲. شناسایی نیازمندی‌های منابع منطقه‌ای (`calculateRegionalNeeds`):
- `ATTENDANCE_SUPPORT`: اگر نرخ غیبت مزمن در بیش از ۲۰٪ مدارس بالای ۱۰٪ باشد یا روزهای بحرانی مشترک وجود داشته باشد.
- `COUNSELING_SUPPORT`: اگر پرونده‌های مداخله با اولویت بالا بدون مسئول (`unassigned_high_priority_cases > 0`) در سطح مدارس وجود داشته باشد.
- `LEARNING_SUPPORT`: اگر درصد مدارس دارای دروس زیر حد نصاب قبولی بالای ۲۵٪ باشد.
- `ASSESSMENT_QUALITY_SUPPORT`: اگر آزمون‌های بسیار دشوار ($p < 0.40$) یا آزمون‌های با ناهنجاری تصحیح در سطح منطقه شناسایی شوند.
- `TEACHER_DEVELOPMENT`: اگر تراکم دبیران دارای اضافه‌بار تدریس یا سبد شواهد ناقص بیش از آستانه استاندارد باشد.

### ۳.۳. تحلیل الگوهای توضیح‌پذیر منطقه‌ای (`detectRegionalPatterns`):
الگوهای سیستماتیک بدون گمانه‌زنی و صرفاً بر اساس قواعد آماری قطعی استخراج می‌شوند:
- الگوی روز اوج غیبت (مثلاً چهارشنبه‌ها پیش از تعطیلات آخر هفته)
- الگوی افت سنجش در درسی خاص در چند مدرسه همجوار

---

## ۴. قرارداد وب‌سرویس RESTful

- **مسیر فراخوانی:** `GET /api/v1/analytics/regional-intelligence`
- **پارامترهای جستجو:**
  - `region_id` (اجباری): شناسه منطقه آموزشی
  - `academic_year` (اختیاری): سال تحصیلی (پیش‌فرض: سال جاری)
- **پاسخ موفق (200 OK):**
  - بازگرداندن شیء `RegionalIntelligenceSnapshot` با کد وضعیت 200 و متادیتای نسخه‌گذاری.
- **کنترل دسترسی:**
  - `edu_office` (منطقه خودی) و `superadmin`: مجاز.
  - سایر نقش‌ها (`manager`, `teacher`, `student`, `parent`, `driver`): سقط فوری با خطای `REGIONAL_TENANT_ISOLATION_VIOLATION` یا `FORBIDDEN`.
