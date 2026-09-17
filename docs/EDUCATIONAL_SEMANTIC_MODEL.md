# مدل معنایی شاخص‌های آموزشی (Educational Semantic Model)

**شناسه سند:** `DOC-P0-EI-01-SEMANTIC-MODEL`  
**وضعیت:** مصوب و مستقر در کد (`server/analytics/semantic.js`)  
**نسخه:** `1.1.0`  
**تاریخ تصویب:** ۲۷ شهریور ۱۴۰۵ (2026-09-17)  
**مالکیت فنی:** Arena 2 / Educational Intelligence  
**ماژول اجرایی پیاده‌سازی:** `server/analytics/semantic.js`  
**سوئیت آزمون‌های جامع:** `tests/semantic-layer/runner.js` (۱۳ سوئیت، ۱۰۰٪ سبز)  
**اسناد بالادستی:** `docs/roadmaps/ROADMAP_V3_EDUCATIONAL_INTELLIGENCE.md` · `docs/ROADMAP.md`

---

## ۱. هدف و فلسفه طراحی (Core Purpose & Philosophy)

سامانه پایش در فاز ۳ از یک ابزار صرفاً ثبتی به یک **سامانه تصمیم‌یار آموزشی و مدیریت کیفیت مدرسه** ارتقا می‌یابد.  
مشکل بنیادین در سامانه‌های سنتی، **انحراف معنایی شاخص‌ها (Semantic Metric Drift)** است؛ به این معنا که یک شاخص مانند «نرخ حضور»، «معدل» یا «مشارکت» در داشبورد مدیر مدرسه، داشبورد معلم، کارنامه والد و گزارش اداره با فرمول‌ها، مخرج‌ها و فیلترهای گوناگون محاسبه می‌شود و نتایج متناقض تولید می‌کند.

این سند قرارداد یکتای داده‌ای، ریاضی و حاکمیتی تمامی شاخص‌های بنیادین لایه معنایی سامانه پایش را مشخص می‌سازد.

---

## ۲. کاتالوگ شاخص‌ها و موجودیت‌های معنایی (Metric Registry)

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                      ماتریس شاخص‌های بنیادین لایه معنایی                         │
├─────────┬───────────────────────────────┬────────────┬─────────────┬──────────────┤
│ ردیف    │ نام شاخص                      │ شناسه      │ واحد        │ بازه معتبر   │
├─────────┼───────────────────────────────┼────────────┼─────────────┼──────────────┤
│ **۱**   │ نرخ حضور                      │ `attendance_rate`          │ درصد (٪)    │ ۰ تا ۱۰۰     │
│ **۲**   │ نرخ غیبت مزمن                │ `chronic_absence_rate`     │ درصد (٪)    │ ۰ تا ۱۰۰     │
│ **۳**   │ توزیع آماری نمرات            │ `grade_distribution`       │ مقیاس ۲۰     │ ۰ تا ۲۰      │
│ **۴**   │ روند پیشرفت یادگیری          │ `learning_progress_trend`   │ نمره/جلسه   │ ۲۰- تا ۲۰+   │
│ **۵**   │ شاخص سلامت آموزشی مدرسه       │ `school_health_index`      │ شاخص ۱۰۰     │ ۰ تا ۱۰۰     │
│ **۶**   │ پروفایل پیشرفت یادگیرنده      │ `learner_progress`         │ پروفایل     │ کیفی/کمی     │
│ **۷**   │ مشارکت در درس                │ `course_engagement`        │ شاخص ۱۰۰     │ ۰ تا ۱۰۰     │
│ **۸**   │ کیفیت و دشواری سنجش          │ `assessment_quality`       │ شاخص‌های p/D │ ۰ تا ۱.۰     │
│ **۹**   │ تکمیل دوره و ارتقای تحصیلی    │ `completion_status`        │ وضعیت رسمی  │ PASSED/...   │
│ **۱۰**  │ خلاصه فعالیت‌های آموزشی       │ `activity_summary`         │ خلاصه تجمیعی│ رویدادها     │
└─────────┴───────────────────────────────┴────────────┴─────────────┴──────────────┘
```

---

## ۳. قراردادهای معنایی دهگانه (Semantic Contracts)

### ۳.۱. نرخ حضور (`calculateAttendanceRate`)
- **ورودی الزامی:** `records` (آرایه‌ای از رکوردهای `attendance` شامل فیلد `status`).
- **ورودی اختیاری:** `formula` (`calendar` پیش‌فرض یا `net`)، `lateWeight` (پیش‌فرض ۱.۰)، `expectedSchoolId`.
- **اعتبارسنجی:** وضعیت‌ها باید ⊆ `{present, late, absent, excused}` یا معادل‌های فارسی باشند.
- **خروجی:** شیء شامل `value`, `numerator`, `denominator`, `counts`, `data_quality`.
- **منبع داده‌ای:** جدول `attendance` در PostgreSQL.

### ۳.۲. نرخ غیبت مزمن (`calculateChronicAbsence`)
- **ورودی الزامی:** `records` شامل `student_id` و `status`.
- **ورودی اختیاری:** `chronicThreshold` (پیش‌فرض ۰.۱۰ معادل ۱۰٪)، `minRequiredSessions` (پیش‌فرض ۵ جلسه)، `expectedSchoolId`.
- **خروجی:** `value`, `chronic_students_count`, `eligible_students_count`, `students_detail`.
- **منبع داده‌ای:** جدول `attendance`.

### ۳.۳. توزیع آماری نمرات (`calculateGradeDistribution`)
- **ورودی الزامی:** `records` شامل فیلد `score` و اختیاری `max_score`.
- **ورودی اختیاری:** `targetScale` (پیش‌فرض ۲۰)، `expectedSchoolId`.
- **خروجی:** میانگین (`mean`)، میانه (`median`)، انحراف معیار (`std_dev`)، چارک‌ها (`q1`, `q2`, `q3`, `iqr`)، هیستوگرام ۴ باکت، و رده‌بندی ۴ گانه وزارتخانه.
- **منبع داده‌ای:** جدول `grades`.

### ۳.۴. روند پیشرفت یادگیری (`calculateLearningProgressTrend`)
- **ورودی الزامی:** `records` شامل `score` و `date`/`created_at`.
- **ورودی اختیاری:** `minObservations` (پیش‌فرض ۳ جلسه)، `expectedSchoolId`.
- **خروجی:** `direction` (`IMPROVING`, `DECLINING`, `STABLE`, `VOLATILE`)، شیب رگرسیون خطی (`slope`)، ضریب تعیین (`r_squared`)، تغییر خالص (`net_change`).
- **منبع داده‌ای:** جدول `grades`.

### ۳.۵. شاخص سلامت آموزشی مدرسه (`calculateSchoolEducationalHealth`)
- **ورودی الزامی:** `components` شامل `attendance_rate`, `mean_grade`, `chronic_absence_rate`, `failure_rate`, `improving_students_ratio`, `declining_students_ratio`, `class_coverage_ratio`.
- **خروجی:** `composite_index` (۰ تا ۱۰۰)، رتبه کیفی (`EXCELLENT`, `GOOD`, `NEEDS_ATTENTION`, `CRITICAL`)، تفکیک ۴ بعد، و لیست پرچم‌های بحرانی (`critical_flags`) طبق اصل No-Masking.

### ۳.۶. پروفایل پیشرفت یادگیرنده (`evaluateLearnerProgress`)
- **ورودی الزامی:** `studentData.studentId` و `studentData.grades`.
- **ورودی اختیاری:** `expectedSchoolId`.
- **منطق:** تفکیک نمرات تکوینی (مستمر) از تراکمی (نهایی)، محاسبه فاصله تکوینی-تراکمی (`formative_summative_gap`)، سرعت رشد، و شاخص ثبات یادگیری در دروس (`stability_score`).
- **خروجی:** سطح تسلط (`ADVANCED`, `PROFICIENT`, `BASIC`, `BELOW_BASIC`)، میانگین کل و تفکیک دروس.

### ۳.۷. مشارکت در درس (`evaluateCourseEngagement`)
- **ورودی الزامی:** `courseId` و `attendance`.
- **ورودی اختیاری:** `activities` (تکالیف/کلاس مجازی)، `expectedSchoolId`.
- **منطق:** ترکیب وزنی ۷۰٪ حضور و ۳۰٪ فعالیت‌های کلاسی.
- **خروجی:** `engagement_score` (۰ تا ۱۰۰)، رده مشارکت (`HIGH`, `MODERATE`, `LOW`, `DISENGAGED`)، و پرچم هشدار قطع ارتباط (`disengagement_risk`).

### ۳.۸. کیفیت و دشواری سنجش (`evaluateAssessmentSemantics`)
- **ورودی الزامی:** `grades` برای یک آزمون معین.
- **ورودی اختیاری:** `assessmentId`, `maxScore`, `passThreshold`, `expectedSchoolId`.
- **منطق:** محاسبه ضریب دشواری کلاسیک ($p$-value = میانگین / سقف) و شاخص تمایز ($D = p_{top27\%} - p_{bottom27\%}$).
- **خروجی:** طبقه‌بندی دشواری (`HARD`, `BALANCED`, `EASY`)، کیفیت تمایز (`EXCELLENT`, `GOOD`, `ACCEPTABLE`, `POOR`)، نرخ قبولی و واریانس.

### ۳.۹. وضعیت تکمیل و ارتقای تحصیلی (`evaluateCompletionSemantics`)
- **ورودی الزامی:** `studentId` و `subjectGrades` (شامل `score`, `coeff`).
- **ورودی اختیاری:** `passThreshold` (پیش‌فرض ۱۰)، `maxFailedAllowed` (پیش‌فرض ۲ درس)، `expectedSchoolId`.
- **منطق:** ارزیابی شرط ارتقای پایه: معدل $\ge ۱۰$ و دروس افتاده $\le ۲$.
- **خروجی:** وضعیت رسمی (`PASSED`, `CONDITIONAL`, `FAILED`, `INCOMPLETE`)، معدل وزنی کل، پرچم‌های `promotion_eligible` و `makeup_exam_required`، و شناسه‌های دروس تجدیدی.

### ۳.۱۰. خلاصه فعالیت‌های آموزشی (`generateEducationalActivitySummary`)
- **ورودی الزامی:** `attendance` و `grades`.
- **ورودی اختیاری:** `scope` (`student`, `teacher`, `school`)، `startDate`, `endDate`, `expectedSchoolId`.
- **خروجی:** تعداد کل کنش‌ها، رکوردهای حضور، نمرات، روزهای فعال، معلمان و دانش‌آموزان فعال، و وضعیت کلی (`ACTIVE`, `LOW_ACTIVITY`, `INACTIVE`).

### ۳.۱۱. خط زمانی طولی چندساله دانش‌آموز (`buildStudentLongitudinalTimeline`)
- **ماژول:** `server/analytics/timeline.js`
- **ورودی الزامی:** شیء مشخصات دانش‌آموز (`student`)، رکوردهای زنده نمرات (`liveGrades`) و حضور (`liveAttendance`).
- **ورودی اختیاری:** سوابق آرشیوشده سال‌های قبل (`archiveRecords`)، فیلتر بازه سال تحصیلی (`fromAcademicYear`, `toAcademicYear`).
- **منطق:**
  1. تجمیع امن و ایزوله داده‌های تاریخی (`student_archive`) و داده‌های پارتیشن‌بندی‌شده زنده (`grades` و `attendance`).
  2. تقسیم‌بندی زمانی به تفکیک سال‌های تحصیلی مرتب‌شده کرونولوژیک (`academic_years`).
  3. اعمال فرمول‌های رسمی لایه معنایی روی هر سال (محاسبه نرخ حضور تقویمی و خالص، وضعیت غیبت مزمن، توزیع نمرات و نمره میانگین، سطوح تسلط تکوینی و تراکمی، و ارزیابی شرایط قبولی/ارتقا).
  4. تحلیل خط سیر تحصیلی چندساله (`trajectory_analysis`) شامل محاسبه شیب رگرسیون معدل‌ها در طول سال‌ها، جهت روند کلی (`IMPROVING`, `DECLINING`, `STABLE`, `VOLATILE`)، شناسایی جهش‌های رشدی (`GROWTH_SPURT` $\ge +1.5$) و افت‌های تحصیلی شدید (`GROWTH_DIP` $\le -1.5$).
  5. تجمیع هشدارهای زودهنگام طولی (`longitudinal_alerts`) مانند اخطار غیبت مزمن چندساله یا افت‌های متوالی.
- **خروجی:** ساختار کامل تایم‌لاین شامل فراداده دانش‌آموز، تعداد سال‌های ثبت‌شده، ریز عملکرد سالانه، خط سیر و هشدارهای پیشگیرانه.
- **گارد ایزولاسیون:** بررسی تطابق `school_id` دانش‌آموز با تک‌تک رکوردهای زنده و آرشیوشده؛ بروز خطای قطعی در صورت نشت چندمستأجری.

---

## ۴. اصول تغییرناپذیر و امنیت (Invariants & Guarantees)

1. **خروجی‌های قطعی (Deterministic Transformations):** بدون وابستگی به زمان حال یا متغیرهای تصادفی؛ ورودی یکسان همواره خروجی بیت‌به‌بیت یکسان می‌دهد.
2. **عدم تغییر اشیای ورودی (Mutation Safety):** توابع هرگز خصوصیات اشیای ورودی را تغییر نمی‌دهند و با داده‌های منجمد (`Object.freeze`) به طور کامل سازگارند.
3. **ایزولاسیون مستأجران (Fail-Closed Tenant Isolation):** هرگونه نشت رکورد با `school_id` مغایر با خطای صریح `TENANT_ISOLATION_VIOLATION` ابورت می‌شود.
4. **انطباق با هرس پارتیشن‌ها (Partition Pruning):** کوئری‌سازها همیشه فیلترهای زمانی و مدرسه‌ای را به صورت پارامتریک در WHERE اعمال می‌کنند.
5. **عدم استفاده از مدل‌های جعبه‌سیاه یا ML:** کلیه محاسبات شفاف، جبری و قابل حساب‌رسی دقیق انسانی هستند.

---

## ۵. محدودیت‌ها و نقاط توسعه آینده (Limitations & Extension Points)

- **محدودیت:** لایه معنایی داده‌ها را از دیتابیس واکشی نمی‌کند؛ این لایه وظیفه پردازش خالص (Transformation) را دارد و وظیفه کوئری زدن بر عهده سرویس‌های دیتابیس است.
- **نقطه توسعه گام دوم (P0-EI-02):** اتصال توابع این لایه به اندپوینت‌های RESTful سرور تحت مسیر `/api/v1/analytics/*`.
- **نقطه توسعه گام سوم (P0-EI-03):** ذخیره‌سازی نتایج تجمیعی در جداول تحلیلی جهت تسریع گزارش‌های سطح منطقه و استان.
