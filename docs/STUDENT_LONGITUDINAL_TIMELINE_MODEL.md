# قرارداد مدل خط زمانی طولی دانش‌آموز (Longitudinal Student Timeline Model)

**نسخه:** 1.0.0  
**کد پروژه:** P0-EI-02 — فاز ۳ هوشمندی آموزشی پایش  
**ماژول پیاده‌سازی:** `server/analytics/student-timeline.js`  
**وضعیت:** مصوب و فعال (Approved / Active)  

---

## ۱. هدف و فلسفه طراحی

موتور خط زمانی طولی دانش‌آموز (Longitudinal Student Timeline Engine) لایه‌ای تحلیلی است که تمامی رخدادهای پراکنده تحصیلی دانش‌آموز در طول دوران تحصیل را به یک **جریان زمانی یکپارچه، استاندارد، مرتب‌شده و قابل ممیزی (Educational Journey)** تبدیل می‌کند.

این لایه جایگزین کارنامه‌های نقطه‌ای سالانه شده و سیر تکاملی یادگیرنده را در ۵ محور کلیدی قابل تحلیل می‌سازد:
1. جریان ثبت‌نام، انتصاب کلاسی و جابجایی مدارس (`ENROLLMENT`, `CLASS_ASSIGNMENT`, `SCHOOL_TRANSFER`)
2. الگوهای حضور و غیاب و هشدارهای آغاز غیبت مزمن (`ATTENDANCE`, `CHRONIC_ABSENCE_STARTED`)
3. سیر نمرات، جهش‌های رشدی و افت‌های ناگهانی یادگیری (`GRADE`, `LEARNING_IMPROVEMENT`, `LEARNING_DECLINE`)
4. رویدادهای ارزیابی، آزمون‌های مجدد و دوره‌های جبرانی (`EXAM`, `REEXAM`, `RECOVERY_PERIOD`)
5. بازشناسی دوره‌های ریسک و هشدارهای ترک تحصیل یا افت تحصیلی (`RISK_PERIODS`, `COMPLETION_RISK`)

---

## ۲. قرارداد ساختار داده رویداد واحد (Unified Event Schema)

تمامی داده‌های واکشی‌شده از جداول مختلف دیتابیس به ساختار استاندارد و تغییرناپذیر زیر تبدیل می‌شوند:

```json
{
  "student_id": 1001,
  "school_id": 10,
  "event_type": "GRADE",
  "timestamp": "2026-10-15T08:30:00.000Z",
  "source_table": "grades",
  "source_id": 5421,
  "semantic_weight": 1.0,
  "payload": {
    "score": 18.5,
    "normalized_score": 18.5,
    "max_score": 20,
    "subject_id": 12,
    "class_id": 101,
    "term": "term1"
  }
}
```

### مشخصات فیلدهای قرارداد:
- `student_id` (عدد صحیح، الزامی): شناسه یکتای دانش‌آموز.
- `school_id` (عدد صحیح، اختیاری/مستأجر): شناسه مدرسه‌ای که رویداد در آن رخ داده است.
- `event_type` (رشته، الزامی): رده رویداد تحصیلی از میان ۱۰ نوع مجاز.
- `timestamp` (رشته ISO-8601، الزامی): زمان دقیق وقوع رویداد به وقت UTC.
- `source_table` (رشته، الزامی): نام جدول مبدأ در بانک داده PostgreSQL.
- `source_id` (عدد صحیح، اختیاری): کلید اصلی رکورد در جدول مبدأ جهت رهگیری و حساب‌رسی.
- `semantic_weight` (عدد اعشاری، الزامی): وزن معنایی رویداد در الگوریتم‌های ترتیبی و تصمیم‌یار.
- `payload` (شیء JSON، الزامی): فراداده و جزییات خاص هر نوع رویداد.

---

## ۳. جدول نگاشت ۱۰ منبع داده (Source Mapping)

| ردیف | جدول مبدأ | نوع رویداد (`event_type`) | وزن معنایی | نگاشت زمان (`timestamp`) | محتوای `payload` |
|:---:|---|---|:---:|---|---|
| ۱ | `enrollments` | `ENROLLMENT` | ۱٫۲ | `created_at` یا `date` | `class_id`, `academic_year`, `status` |
| ۲ | `certificates` | `CERTIFICATE` | ۱٫۱ | `issued_at` یا `created_at` | `title`, `type`, `code`, `year`, `issued_by` |
| ۳ | `grades` | `GRADE` | ۱٫۰ | `date` یا `created_at` | `score`, `normalized_score`, `max_score`, `subject_id`, `class_id`, `term` |
| ۴ | `reexams` | `REEXAM` | ۰٫۹۵ | `exam_date` یا `created_at` | `subject_id`, `original_score`, `new_score`, `status` |
| ۵ | `discipline` | `DISCIPLINE` | ۰٫۹ | `date` یا `created_at` | `kind`, `title`, `description`, `points` |
| ۶ | `exams` | `EXAM` | ۰٫۸۵ | `date` یا `created_at` | `title`, `class_id`, `max_score`, `duration`, `source` |
| ۷ | `classes` | `CLASS_ASSIGNMENT` | ۰٫۸ | `created_at` | `class_id`, `name`, `grade`, `academic_year` |
| ۸ | `attendance` | `ATTENDANCE` | ۰٫۷ | `date` یا `created_at` | `status`, `late_minutes`, `class_id`, `date` |
| ۹ | `exam_terms` | `EXAM_TERM` | ۰٫۶ | `start_date` یا `created_at` | `title`, `term`, `start_date`, `end_date`, `academic_year` |
| ۱۰ | `vclass_sessions` | `VCLASS` | ۰٫۵ | `created_at` یا `shad_time` | `title`, `type`, `class_id` |

---

## ۴. نقاط عطف تحصیلی (Educational Milestones)

موتور خط زمانی با اسکن توالی رویدادها، رخدادهای کلیدی تحصیلی را به عنوان Milestone ثبت می‌کند:

1. **`LEARNING_DECLINE_DETECTED` (افت تحصیلی):**
   - افت $\ge ۲٫۵$ نمره نسبت به نمره قبلی، یا سقوط نمره قبولی ($\ge ۱۰$) به زیر حد نصاب قبولی ($< ۱۰$).
2. **`LEARNING_IMPROVEMENT_DETECTED` (جهش یادگیری):**
   - بهبود $\ge ۲٫۵$ نمره در ارزیابی‌ها، یا خروج موفقیت‌آمیز از وضعیت مردودی به بالای ۱۲.
3. **`CHRONIC_ABSENCE_STARTED` (آغاز دوره غیبت مزمن):**
   - وقوع $\ge ۳$ جلسه غیبت متوالی غیرموجه، یا عبور نرخ تجمعی غیبت از ۱۵٪ با حداقل ۵ جلسه ثبت‌شده.
4. **`RECOVERY_PERIOD` (دوره بازیابی و بازگشت):**
   - ثبت عملکرد پایدار (نمرات قبولی $\ge ۱۲$ یا حضور منظم) پس از یک دوره افت قبلی.
5. **`SCHOOL_TRANSFER` (انتقال مدرسه):**
   - کشف تغییر در `school_id` بین رکوردهای متوالی ثبت‌نام.
6. **`COMPLETION_RISK` (ریسک عدم ارتقای پایه):**
   - ثبت $\ge ۲$ نمره زیر نصاب قبولی در کارنامه پایانی.

---

## ۵. تحلیل دوره‌های ریسک (Student Risk Periods)

موتور خط زمانی از طریق اتصال به توابع رسمی لایه معنایی آموزشی (`server/analytics/semantic.js`) دوره‌های زمانی دارای خطر را استخراج می‌کند:

- `evaluateLearnerProgress` $\rightarrow$ کشف دوره `ACADEMIC_DECLINE` در سطوح تسلط `BELOW_BASIC`.
- `evaluateCourseEngagement` $\rightarrow$ کشف دوره `COURSE_DISENGAGEMENT` با بروز ریسک قطع ارتباط کلاسی.
- `evaluateCompletionSemantics` $\rightarrow$ کشف دوره `COMPLETION_RISK` در شرایط `CONDITIONAL` و `FAILED`.

---

## ۶. تضمین‌های قطعی، امنیت و ایزولاسیون

1. **قطعیت ۱۰۰٪ (Deterministic Guarantee):**
   - مرتب‌سازی رویدادها ۴ سطحی و قطعی است:
     1. `timestamp ASC`
     2. `semantic_weight DESC`
     3. `event_type ASC`
     4. `source_id ASC`
   - ده بار اجرای پیاپی با داده یکسان، دقیقاً آرایه‌ای با بایت‌های یکسان تولید می‌کند.
2. **ایمنی در برابر تغییر اشیا (Mutation Safety):**
   - توابع به صورت خالص (Pure Functions) اجرا می‌شوند و ورودی‌های منجمد (`Object.freeze`) را تغییر نمی‌دهند.
3. **ایزولاسیون مستأجران (Fail-Closed Tenant Isolation):**
   - ورود هر رکوردی با `school_id` مغایر با مدرسه مورد انتظار بلافاصله با خطای `TENANT_ISOLATION_VIOLATION` ابورت می‌شود.
4. **فیلتر بازه زمانی (Temporal Query Engine):**
   - تابع `queryTimelineRange(timeline, from, to, eventTypes)` بازه‌های تاریخی را بدون ایجاد اثر جانبی استخراج می‌کند.
