# سند جامع طرح مهاجرت به پایگاه داده PostgreSQL (PostgreSQL Migration Plan)
## سامانه پایش — فاز ۲ نقشه اجرایی (گذار از ذخیره‌ساز JSON به پایگاه داده رابطه‌ای توزیع‌شده)

**سند مرجع:** `03_IMPLEMENTATION_ROADMAP.docx` (فاز ۲ — بندهای ۱ تا ۶)  
**نسخه سند:** ۱.۰.۰  
**تاریخ تدوین:** ۱۸ شهریور ۱۴۰۵ (2026-09-08)  
**وضعیت:** مصوب مهاجرت و پایگاه داده (Database Migration Specification)  

---

## ۱. اهداف و نیازمندی‌های مهاجرت (Executive Objectives)

هدف فاز ۲، جایگزینی فایل متمرکز `server/data/payesh.json` با یک پایگاه داده استاندارد، رابطه‌ای و قدرتمند **PostgreSQL** در مقیاس ملی است.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   شاخص‌های کلیدی پایگاه داده PostgreSQL                 │
├───────────────────────────────────┬────────────────────────────────────┤
│ تعداد کل جداول نگاشت‌شده          │ ۸۰ جدول منطبق بر مدل داده پایش     │
│ پشتیبانی از تراکنش‌های اتمیک (ACID)│ ایزولاسیون کامل سطح Read Committed │
│ موتور ایندکس‌گذاری                │ B-Tree + GIN (برای فیلدهای JSONB)  │
│ راهبرد اتصال و استخر پایش         │ pg-pool با مدیریت خودکار اتصال     │
│ سازگاری به عقب (Fallback)         │ بازگشت خودکار به JSON در غیاب PG   │
└───────────────────────────────────┴────────────────────────────────────┘
```

---

## ۲. طراحی مدل داده و نگاشت جداول (Relational Schema Design)

تمام ۸۰ مجموعه داده موجود در `authz/model.json` به جداول رابطه‌ای PostgreSQL با رعایت انواع داده بهینه نگاشت می‌شوند:

```
┌──────────────────────────────┬──────────────────────────────┬──────────────────────────────────────────┐
│ نام جدول (Table Name)        │ کلید اصلی و خارجی            │ فیلدهای کلیدی و انواع داده               │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ schools                      │ id (VARCHAR/INT PK)          │ name VARCHAR(200), type VARCHAR(50),     │
│                              │                              │ capabilities JSONB, active BOOLEAN       │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ users                        │ id (PK), school_id (FK)      │ national_id VARCHAR(10) UNIQUE,          │
│                              │                              │ phone VARCHAR(20), role VARCHAR(50)      │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ classes                      │ id (PK), school_id (FK)      │ name VARCHAR(100), grade INT,            │
│                              │ homeroom_teacher_id (FK)     │ capacity INT, class_mode VARCHAR(50)     │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ enrollments                  │ id (PK), school_id (FK)      │ student_id (FK), class_id (FK),          │
│                              │                              │ status VARCHAR(50), version INT DEFAULT 1│
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ attendance                   │ id (PK), school_id (FK)      │ student_id (FK), class_id (FK),          │
│                              │                              │ date DATE, status VARCHAR(20), late INT  │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ grades                       │ id (PK), school_id (FK)      │ student_id (FK), subject_id (FK),        │
│                              │                              │ score NUMERIC(4,2), version INT DEFAULT 1│
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ parent_links                 │ id (PK), school_id (FK)      │ parent_id (FK), student_id (FK),         │
│                              │                              │ relation VARCHAR(50)                     │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ sync_conflicts               │ id (PK), school_id (FK)      │ collection VARCHAR(100), record_id INT,  │
│                              │                              │ base_version INT, server_version INT     │
└──────────────────────────────┴──────────────────────────────┴──────────────────────────────────────────┘
```

---

## ۳. استراتژی ایندکس‌های ترکیبی (Composite Indexing)

منطبق بر سند `docs/DATABASE_PERFORMANCE_OPTIMIZATION.md`، ایندکس‌های زیر برای بهینه‌سازی دسترسی و جلوگیری از Table Scan تعریف می‌شوند:

```sql
-- ایندکس‌های اساسی چندمدرسه‌ای
CREATE INDEX idx_users_school_nid ON users (school_id, national_id);
CREATE INDEX idx_enrollments_school_student ON enrollments (school_id, student_id);
CREATE INDEX idx_attendance_school_class_date ON attendance (school_id, class_id, date);
CREATE INDEX idx_grades_school_student_subject ON grades (school_id, student_id, subject_id);
CREATE INDEX idx_schedule_school_teacher_day ON schedule (school_id, teacher_id, day);
CREATE INDEX idx_parent_links_parent_student ON parent_links (parent_id, student_id);
```

---

## ۴. ابزار مهاجرت داده‌ها (`tools/migrate-to-pg.js`)

اسکریپت مهاجرت داده‌ها با قابلیت‌های زیر توسعه داده می‌شود:
1. خواندن فایل `server/data/payesh.json`.
2. ایجاد خودکار جداول و ایندکس‌ها بر اساس DDL استاندارد.
3. درج دسته‌ای (Batch Multi-Row Insert) با تراکنش‌های اتمیک.
4. تولید فایل خروجی اسکریپت SQL جهت بازبینی DBA (`server/schema.sql`).
5. راستی‌آزمایی شمارش رکوردها پس از اتمام مهاجرت.

---

## ۵. راهبرد انتزاع دیتابیس و پشتیبانی از دو حالت (Database Abstraction Layer & Fallback)

ماژول `server/db.js` وظیفه مدیریت اتصالات و اجرای کوئری‌ها را با رعایت اصل **Zero-Disruption Fallback** بر عهده دارد:

```
[درخواست وب‌سرور] ──► [ماژول مرکزی server/db.js]
                            │
            ┌───────────────┴───────────────┐
            ▼ (در صورت تنظیم DATABASE_URL)  ▼ (در غیاب PostgreSQL)
    [اتصال PostgreSQL با pg.Pool]    [فال‌بک به ذخیره‌ساز JSON در حافظه]
            │                               │
            ▼                               ▼
    (محیط عملیاتی و کلاستر)         (محیط تست، آفلاین و توسعه محلی)
```

---

## ۶. تنظیمات و متغیرهای محیطی (Configuration & Environment)

```ini
# پیکربندی اتصال به PostgreSQL در .env
DATABASE_URL=postgresql://payesh_user:secure_password@localhost:5432/payesh_db
PG_POOL_MIN=5
PG_POOL_MAX=25
PG_TIMEOUT_MS=3000
```

---

## ۷. گیت‌های پذیرش و تست صحت مهاجرت

1. اجرای موفق `tools/migrate-to-pg.js` و تطابق ۱۰۰٪ شمارش رکوردها.
2. پاس شدن تمام **۵۴۷ تست دودی** در `node tests/smoke.js`.
3. پاس شدن تمام **۴۷ تست ممیزی** در `node tests/audit.js`.
4. پاس شدن تست‌های سرور و احراز هویت در `tests/server*.js`.
