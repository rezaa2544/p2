# مدل شواهد تدریس و چارچوب کیفیت‌بخشی معلمان (P0-EI-07)
## Teacher Evidence & Quality Framework Data Contract and Model Specification

**شناسه سند:** `DOC-P0-EI-07-TEACHER-EVIDENCE`  
**نسخه:** ۱.۰.۰  
**تاریخ تصویب:** ۲۰۲۶-۰۹-۱۸  
**مالک راهبردی:** معاونت آموزش و نیروی انسانی، کمیته کیفیت‌بخشی آموزشی  
**منبع قطعی حقیقت (Source of Truth):** PostgreSQL (`teacher_evaluations`, `teacher_notes`, `training_courses`, `schedule`, `grades`)  

---

## ۱. بیانیه مأموریت و اصول پایه (Foundational Principles)

این چارچوب بر اساس سه اصل بنیادین معماری هوشمندی آموزشی طراحی شده است:

1. **اصل عدم رتبه‌بندی خودکار (Zero Automated Ranking):**
   - هیچ رتبه‌بندی خطی، مقایسه کاذب یا تنبیه الگوریتمی برای معلمان تولید نمی‌شود.
   - ارزشیابی به عنوان ابزار توانمندسازی و هدایت رشد حرفه‌ای تدوین می‌گردد.
2. **سبد چندبُعدی مبتنی بر شواهد (Multi-Source Evidence Portfolio):**
   - کیفیت تدریس صرفاً با میانگین نمرات سنجیده نمی‌شود، بلکه ترکیبی از بازخوردهای تکوینی، تنوع سنجش، پایش روبریک کلاسی و توسعه حرفه‌ای است.
3. **شکست ایمن و ایزولاسیون کامل چندمستأجری (Fail-Closed Multi-School Isolation):**
   - عدم امکان نشت اطلاعات بین مدارس یا دسترسی غیرمجاز سایر نقش‌ها (IDOR Protection).

---

## ۲. مشخصات و قراردادهای داده‌ای (Data Contracts)

### ۲.۱. نمایه بار کاری و فعالیت معلم (`TeacherWorkloadProfile`)

```json
{
  "teacher_id": 105,
  "school_id": 12,
  "assigned_classes_count": 3,
  "homeroom_classes_count": 1,
  "weekly_periods_count": 22,
  "unique_subjects_count": 2,
  "total_students_enrolled": 78,
  "assessment_events_count": 156,
  "workload_intensity": "BALANCED",
  "schedule_distribution": {
    "saturday": 4,
    "sunday": 5,
    "monday": 4,
    "tuesday": 5,
    "wednesday": 4
  }
}
```

- **سطوح شدت بار کاری (`workload_intensity`):**
  - `BALANCED`: $\text{weekly\_periods} \le 24$
  - `HIGH`: $25 \le \text{weekly\_periods} \le 30$
  - `OVERLOADED`: $\text{weekly\_periods} > 30$

---

### ۲.۲. سبد شواهد فرآیند یاددهی (`TeacherEvidencePortfolio`)

```json
{
  "teacher_id": 105,
  "school_id": 12,
  "total_students": 78,
  "formative_notes_count": 52,
  "students_receiving_feedback_count": 48,
  "formative_coverage_rate": 61.54,
  "assessment_diversity": {
    "formative": 68,
    "summative": 42,
    "classwork": 30,
    "project": 16
  },
  "diversity_type_count": 4,
  "portfolio_completeness": "PROFICIENT",
  "evidence_summary": {
    "has_individual_feedback": true,
    "uses_multiple_assessment_types": true,
    "formative_ratio": 0.436
  }
}
```

- **سطوح تکمیل سبد شواهد (`portfolio_completeness`):**
  - `EXEMPLARY`: پوشش بازخورد $\ge 75\%$ و تنوع سنجش $\ge 3$ نوع
  - `PROFICIENT`: پوشش بازخورد $\ge 45\%$ و تنوع سنجش $\ge 2$ نوع
  - `DEVELOPING`: پوشش بازخورد $< 45\%$ یا تنوع محدود سنجش

---

### ۲.۳. ارزیابی روبریک مشاهدات کلاسی (`LessonObservationReview`)

فرم استاندارد روبریک در ۴ بُعد اصلی با نمره‌دهی ۱ تا ۵:

$$Score_{\text{observation}} = \frac{D_{\text{interaction}} + D_{\text{engagement}} + D_{\text{clarity}} + D_{\text{feedback}}}{4}$$

| بُعد روبریک | دامنه نمره | تعریف عملیاتی |
|---|:---:|---|
| `classroom_interaction` | ۱ تا ۵ | مدیریت کلاس، تنظیم زمان و جریان گفتگوی یادگیری |
| `learner_engagement` | ۱ تا ۵ | مشارکت فعال دانش‌آموزان و فرصت تفکر عمیق |
| `instructional_clarity` | ۱ تا ۵ | شفافیت اهداف درس و پیوند با مفاهیم قبلی |
| `formative_feedback` | ۱ تا ۵ | ارائه بازخورد هدایت‌کننده و توجه به تفاوت‌های فردی |

```json
{
  "observation_id": 401,
  "teacher_id": 105,
  "school_id": 12,
  "evaluator_role": "manager",
  "average_score": 4.25,
  "mastery_level": "ADVANCED",
  "dimension_scores": {
    "classroom_interaction": 4.5,
    "learner_engagement": 4.0,
    "instructional_clarity": 4.5,
    "formative_feedback": 4.0
  },
  "priority_focus_dimension": "learner_engagement",
  "strengths": ["مدیریت عالی زمان و تسلط علمی"],
  "growth_recommendations": ["افزایش پرسش‌های بازپاسخ و پروژه‌های گروهی"]
}
```

---

### ۲.۴. پیگیری دوره‌های رشد حرفه‌ای (`ProfessionalDevelopmentTracker`)

```json
{
  "teacher_id": 105,
  "school_id": 12,
  "total_hours_completed": 28,
  "completed_courses_count": 2,
  "in_progress_courses_count": 1,
  "courses": [
    {
      "id": 1,
      "title": "کارگاه روش‌های نوین سنجش تکوینی",
      "hours": 16,
      "status": "completed",
      "competency_area": "formative_feedback"
    }
  ],
  "addressed_needs": ["formative_feedback"],
  "unaddressed_needs": ["learner_engagement"],
  "pd_status": "ON_TRACK"
}
```

- **وضعیت پیگیری (`pd_status`):**
  - `ACTIVE_LEARNER`: ساعات $\ge 24$ و تمامی نیازهای اولویت‌دار دارای دوره گذرانده‌شده باشند.
  - `ON_TRACK`: ساعات $\ge 12$
  - `NEEDS_ENGAGEMENT`: ساعات $< 12$

---

### ۲.۵. کارنامه سنتز رشد و توانمندسازی معلم (`TeacherGrowthProfile`)

```json
{
  "teacher_id": 105,
  "school_id": 12,
  "profile_date": "2026-09-18",
  "is_ranked": false,
  "ranking_score": null,
  "workload_status": "BALANCED",
  "evidence_completeness": "PROFICIENT",
  "observation_mastery": "ADVANCED",
  "pd_engagement": "ON_TRACK",
  "growth_trajectory": "ADVANCING",
  "strength_areas": [
    "پوشش مطلوب بازخورد تکوینی به دانش‌آموزان",
    "تنوع مناسب در شیوه‌های ارزشیابی کلاسی",
    "ثبات در نمره‌دهی و عدالت در سنجش"
  ],
  "priority_growth_goals": [
    "شرکت در کارگاه تقویت مشارکت فعال یادگیرنده در کلاس",
    "گسترش ابزارهای بازخورد فردی به کلیه دانش‌آموزان نیازمند حمایت"
  ]
}
```

---

## ۳. امنیت، کنترل دسترسی و ایزولاسیون سازمانی

1. **گارد احراز و نفوذناپذیری (`enforceTeacherAccessGuard`):**
   - اگر نقش کاربر `teacher` باشد، تنها به داده‌های `teacher_id === session.id` در همان مدرسه دسترسی دارد. هرگونه تلاش برای دسترسی به معلم دیگر به عنوان IDOR مسدود شده و خطای `TEACHER_EVIDENCE_ACCESS_FORBIDDEN` پرتاب می‌شود.
   - اگر نقش کاربر `manager` باشد، فقط داده‌های معلمان همان مدرسه (`session.school_id`) قابل فراخوانی است.
   - نقش‌های غیرمجاز (`student`, `parent`, `driver`, `counselor`) بلافاصله مسدود می‌شوند.
2. **سیاست شکست ایمن (`fail-closed`):** در غیاب پارامترهای هویتی یا بروز تداخل شناسه مدارس در آرایه‌های ورودی، پردازش با استثنای صریح متوقف می‌شود.
