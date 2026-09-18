# مدل پایش طولی هوشمندی آموزشی و کشف روندها (P0-EI-12)
## Educational Intelligence Longitudinal Monitoring & Trend Detection Model

**شناسه سند:** `DOC-P0-EI-12-LONGITUDINAL-MONITORING-MODEL`  
**نسخه:** ۱.۰.۰  
**تاریخ تصویب:** ۲۰۲۶-۰۹-۱۸  
**مالک راهبردی:** شورای راهبری تحلیل‌های طولی و هوشمندی آموزشی  
**منبع قطعی حقیقت (Source of Truth):** PostgreSQL (جداول اسنپ‌شات‌های دوره‌ای و رکوردهای تحلیلی)  

---

## ۱. مدل داده‌ای اسنپ‌شات طولی (`LongitudinalEducationSnapshot`)

اسنپ‌شات دوره‌ای واحد پایه پایش طولی مدرسه یا منطقه در بازه‌های مشخص زمانی (ترم، ماه، یا سال تحصیلی) است:

```json
{
  "entity_id": 10,
  "entity_type": "school",
  "period": "1405-1406-T1",
  "health_index": 78.5,
  "academic_metrics": {
    "average_gpa": 16.2,
    "failing_students_ratio": 0.04,
    "at_risk_subjects_count": 1
  },
  "attendance_metrics": {
    "calendar_rate": 91.5,
    "chronic_absence_rate": 7.2,
    "unexcused_rate": 2.1
  },
  "intervention_metrics": {
    "active_cases": 3,
    "resolved_cases": 8,
    "resolution_rate": 72.7
  },
  "quality_metrics": {
    "overall_quality_index": 79.0,
    "status": "STABLE_AND_COMPLIANT"
  },
  "trend_summary": {
    "direction": "IMPROVING",
    "slope": 1.45,
    "confidence": 0.92
  },
  "change_points": [],
  "recommendations": []
}
```

---

## ۲. مدل‌های جبری تحلیل روند (Trend Analysis Formulas)

### ۲.۱. محاسبه شیب تغییرات خطی (Linear Slope)
با در نظر گرفتن $N$ اسنپ‌شات زمانی با مقادیر زمانی $t_1, t_2, \dots, t_N$ و مقادیر شاخص $y_1, y_2, \dots, y_N$:

$$\bar{t} = \frac{1}{N} \sum_{i=1}^{N} t_i, \quad \bar{y} = \frac{1}{N} \sum_{i=1}^{N} y_i$$

$$\text{Slope} = \frac{\sum_{i=1}^{N} (t_i - \bar{t})(y_i - \bar{y})}{\sum_{i=1}^{N} (t_i - \bar{t})^2}$$

### ۲.۲. طبقه‌بندی وضعیت روند (Trend Classification)
با آستانه پیش‌فرض حساسیت $\theta = 0.5$ (یا متناسب با نوع شاخص):

- **شاخص‌های با جهت مثبت (Higher is Better - مانند معدل، نرخ حضور، شاخص سلامت):**
  - $\text{Slope} > \theta \implies \text{IMPROVING}$
  - $|\text{Slope}| \le \theta \implies \text{STABLE}$
  - $\text{Slope} < -\theta \implies \text{DECLINING}$

- **شاخص‌های معکوس (Lower is Better - مانند نرخ غیبت مزمن، نسبت مردودی):**
  - $\text{Slope} < -\theta \implies \text{IMPROVING}$
  - $|\text{Slope}| \le \theta \implies \text{STABLE}$
  - $\text{Slope} > \theta \implies \text{DECLINING}$

---

## ۳. کشف نقاط چرخش معنادار (Change Point Detection)

نقاط تغییر معنادار نشان‌دهنده گسست از روند گذشته یا شوک‌های آموزشی هستند:

1. **افت ناگهانی (Sudden Drop):**
   - کاهش بیش از $10\%$ در یک یا دو دوره پیاپی نسبت به خط مبنا:
     $$\Delta y = y_{t} - y_{t-1} < -0.10 \times y_{t-1}$$
   - برچسب: `SUDDEN_DROP`
2. **بهبود پایدار (Sustained Improvement):**
   - رشد مثبت مداوم در حداقل ۳ دوره متوالی:
     $$y_{t} > y_{t-1} > y_{t-2} > y_{t-3}$$
   - برچسب: `SUSTAINED_IMPROVEMENT`
3. **نقطه عطف پس از مداخله (Post-Intervention Inflection):**
   - تغییر علامت شیب از منفی به مثبت پس از راه‌اندازی پرونده مداخله یا چرخه PDCA.
   - برچسب: `POST_INTERVENTION_INFLECTION`

---

## ۴. سنجش ضریب دوام و پایداری بهبود (Persistence Score)

جهت تفکیک بهبود واقعی از جهش‌های موقت یا نوسان تصادفی:

$$\text{Persistence Score} = \frac{\text{successful\_periods}}{\text{total\_periods}}$$

### طبقه‌بندی چهارگانه پایداری:
1. **بهبود پایدار (`SUSTAINABLE_IMPROVEMENT`):**
   - $\text{Persistence Score} \ge 0.75$ و $\text{Trend} = \text{IMPROVING}$.
2. **جهش موقت (`TEMPORARY_SPIKE`):**
   - جهش ناگهانی تک‌دوره‌ای و افت بلافاصله در دوره بعد به سطح مبنا.
3. **نوسان تصادفی (`RANDOM_FLUCTUATION`):**
   - نوسانات متناوب حول میانگین بدون شیب مشخص و $\text{Persistence Score} < 0.60$.
4. **افت تدریجی (`GRADUAL_DECLINE`):**
   - شیب منفی پیوسته طی دوره‌های متوالی.

---

## ۵. نقشه روندهای منطقه‌ای با تضمین ۱۰۰٪ عدم رتبه‌بندی (`RegionalTrendMap`)

```json
{
  "region_id": 3,
  "period_range": "1404-1406",
  "total_schools_monitored": 28,
  "trend_distribution": {
    "IMPROVING": 14,
    "STABLE": 10,
    "DECLINING": 4
  },
  "priority_support_needed_count": 4,
  "schools_trend_summary": [
    {
      "school_id": 101,
      "school_name": "مدرسه شهید رجایی",
      "trend_direction": "IMPROVING",
      "persistence_classification": "SUSTAINABLE_IMPROVEMENT"
    }
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

## ۶. گارد امنیتی و کنترل دسترسی (`enforceLongitudinalAccessGuard`)

1. **مدیر مدرسه (`manager`):**
   - مجاز به دریافت پرونده طولی مدرسه خود است (`school_id`).
   - در صورت تلاش برای دریافت داده مدرسه دیگر، فوراً با خطای زیر سقط می‌شود:
     `LONGITUDINAL_TENANT_ISOLATION_VIOLATION: manager of school X cannot access school Y`
2. **کارشناس اداره منطقه (`edu_office`):**
   - مجاز به دریافت پرونده طولی مدارس و نقشه روندهای منطقه خود است (`region_id`).
   - در صورت درخواست منطقه نامربوط، سقط با `LONGITUDINAL_TENANT_ISOLATION_VIOLATION`.
3. **مدیر ارشد سامانه (`superadmin`):**
   - دسترسی کامل نظارتی به تمامی مدارس و مناطق.
4. **سایر نقش‌ها (دانش‌آموز، والد، معلم):**
   - رد دسترسی با خطای `LONGITUDINAL_ACCESS_FORBIDDEN`.

---

## ۷. مشخصات وب‌سرویس RESTful

```http
GET /api/v1/analytics/longitudinal-intelligence?entity_id=10&entity_type=school&period_range=1404-1406
Cookie: payesh_session=<TOKEN>
```

**پاسخ موفق:**
```json
{
  "ok": true,
  "api_version": "1.0.0",
  "entity_type": "school",
  "entity_id": 10,
  "period_range": "1404-1406",
  "profile": {
    "school_id": 10,
    "total_periods": 5,
    "overall_trend": "IMPROVING",
    "persistence_classification": "SUSTAINABLE_IMPROVEMENT",
    "trends_by_metric": { ... },
    "change_points": [ ... ],
    "insights": [ ... ],
    "recommendations": [ ... ],
    "zero_ranking_policy_enforced": true
  }
}
```
