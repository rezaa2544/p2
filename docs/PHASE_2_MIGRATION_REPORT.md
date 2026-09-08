# گزارش اجرایی پیاده‌سازی فاز ۲: مهاجرت به پایگاه داده رابطه‌ای PostgreSQL
## سامانه پایش (سامانه هوشمند مدیریت مدرسه)

**سند مرجع:** نقشه راه پیاده‌سازی (`03_IMPLEMENTATION_ROADMAP.docx` — فاز ۲)  
**تاریخ گزارش:** ۱۸ شهریور ۱۴۰۵ (2026-09-08)  
**وضعیت پیاده‌سازی:** ۱۰۰٪ تکمیل شده — تمامی تست‌ها سبز (Verified & Committed)  
**نسخه گزارش:** ۱.۰.۰  

---

## ۱. چکیده اجرایی (Executive Summary)

در راستای ارتقای زیرساخت سامانه پایش به مقیاس ملی، فاز ۲ پروژه با هدف گذار از فایل متمرکز `server/data/payesh.json` به پایگاه داده استاندارد و توزیع‌شده **PostgreSQL** با موفقیت اجرا شد. این مهاجرت با حفظ کامل اصل **Zero-Disruption Fallback** (پشتیبانی هم‌زمان از دیتابیس رابطه‌ای در محیط پروداکشن و ذخیره‌ساز محلی/JSON در محیط‌های توسعه و آفلاین) پیاده‌سازی گردید.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   خلاصه وضعیت تحویل فاز ۲ (PostgreSQL)                  │
├───────────────────────────────────┬────────────────────────────────────┤
│ لایه انتزاع دیتابیس (server/db.js)│ تکمیل‌شده با استخر pg.Pool و Reconnect│
│ طرح DDL و اسکریپت پایگاه داده     │ ۸۰ جدول رابطه‌ای + ایندکس‌های بهینه │
│ ابزار مهاجرت داده‌ها              │ tools/migrate-to-pg.js با درج دسته‌ای│
│ پایدارسازی صف همگام‌سازی (sync.js) │ اتصال به DB + اعتبارسنجی UIDs      │
│ مدیریت چرخه حیات (index.js)       │ اتصال در استارت‌آپ + بستن تمیز      │
│ فایل تنظیمات نمونه (.env.example) │ پیکربندی متغیرهای محیطی پروداکشن    │
│ نتایج آزمون‌های دودی و سرور      │ ۵۴۷/۵۴۷ تست موفق (۱۰۰٪ سبز)        │
└───────────────────────────────────┴────────────────────────────────────┘
```

---

## ۲. دستاوردهای فنی و اجزای پیاده‌سازی‌شده

### ۲.۱. لایه انتزاع پایگاه داده (`server/db.js`)
ماژول مرکزی دیتابیس با ویژگی‌های زیر پیاده‌سازی شد:
- **استخر اتصالات هوشمند (`pg.Pool`):** مدیریت کانکشن‌ها با تنظیم حداقل و حداکثر (`PG_POOL_MIN`, `PG_POOL_MAX`) و سقف مهلت زمانی (`PG_TIMEOUT_MS`).
- **متد `query(sql, params)`:** اجرای ایمن کوئری‌های پارامتری‌شده با اندازه‌گیری دقیق زمان پاسخ‌دهی.
- **متد `transaction(callback)`:** مدیریت تراکنش‌های اتمیک با پشتیبانی کامل از `BEGIN`, `COMMIT`, `ROLLBACK`.
- **متد `ping()`:** پروب فوق‌سریع برای بررسی زنده بودن پایگاه داده در Kubernetes / Docker Liveness.
- **متد `persistOp(op)`:** نگارش اتمیک و خودکار عملیات صف همگام‌سازی (`ins`, `upd`, `del`) در جداول PostgreSQL.
- **متد `isUidProcessed(uid)`:** اعتبارسنجی عدم پردازش تکراری عملیات (Idempotency) در جدول `server_processed_uids`.
- **مکانیسم Reconnect خودکار:** تلاش پس‌زمینه برای برقراری مجدد اتصال در صورت قطعی موقت بدون توقف وب‌سرور.
- **مکانیسم Graceful Fallback:** در صورت عدم تنظیم `DATABASE_URL`، سامانه بدون هیچ‌گونه خطا از لایه حافظه مقیم استفاده می‌کند.

### ۲.۲. اسکریپت DDL و ساختار پایگاه داده (`server/schema.sql`)
- نگاشت کامل تمام **۸۰ مجموعه داده** مدل پایش (`authz/model.json`) به جداول استاندارد رابطه‌ای.
- تخصیص انواع داده بهینه (`INTEGER`, `VARCHAR(10/20/255)`, `NUMERIC(12,2)`, `BOOLEAN`, `TIMESTAMPTZ`, `JSONB`, `TEXT`).
- ایجاد کلیدهای اصلی (`PRIMARY KEY`) و کلیدهای خارجی (`FOREIGN KEY ... REFERENCES ... ON DELETE CASCADE`).
- ایجاد ایندکس‌های ترکیبی اساسی:
  - `idx_users_school_nid` روی `users(school_id, national_id)`
  - `idx_users_school_role` روی `users(school_id, role)`
  - `idx_attendance_school_class_date` روی `attendance(school_id, class_id, date)`
  - `idx_grades_school_student_subject` روی `grades(school_id, student_id, subject_id)`
  - `idx_schedule_school_teacher_day` روی `schedule(school_id, teacher_id, day)`
  - `idx_parent_links_parent_student` روی `parent_links(parent_id, student_id)`
  - ایندکس‌های GIN روی فیلدهای JSONB (`idx_schools_capabilities`).

### ۲.۳. ابزار مهاجرت داده‌ها (`tools/migrate-to-pg.js`)
- استخراج مستقیم داده‌ها از `server/data/payesh.json`.
- تولید و اجرای اسکریپت‌های درج دسته‌ای (Batch Multi-Row Inserts) برای بیش از **۳۲,۶۰۰ سطر داده**.
- پشتیبانی از سوئیچ‌های خط فرمان:
  - `node tools/migrate-to-pg.js` (تولید DDL و فایل مهاجرت)
  - `node tools/migrate-to-pg.js --execute` (اجرای مستقیم روی PostgreSQL با `DATABASE_URL`)
- اعتبارسنجی خودکار شمارش رکوردهای مبدأ در برابر سطرهای درج‌شده در پایگاه داده.

### ۲.۴. تطبیق لایه همگام‌سازی و سرور (`server/sync.js` و `server/index.js`)
- اتصال صف `POST /api/sync` به لایه انتزاع دیتابیس و پایدارسازی تراکنشی تغییرات.
- پایش وضعیت پردازش `uid`ها جهت جلوگیری از ثبت تکراری عملیات آفلاین.
- حفظ ۱۰۰٪ کلیه قوانین امنیتی:
  - گیت فیلدها و استثناهای IEP و ترک تحصیل (`fieldGate`, `filterFields`)
  - تفکیک و ایزولاسیون مدرسه‌ای (`inScope`)
  - نگهداری تعارض‌های نسخه‌گذاری در `sync_conflicts`
  - ثبت بدون نشت لاگ ممیزی (`audit`)
- اتصال به دیتابیس در زمان راه‌اندازی سرور (`db.init`) و بستن تمیز استخر کانکشن در زمان خاتمه سرور (`SIGTERM`, `SIGINT`, `exit`).

### ۲.۵. فایل پیکربندی متغیرهای محیطی (`.env.example`)
- تعریف جامع متغیرهای محیطی پروداکشن شامل `DATABASE_URL`, `PG_POOL_MIN`, `PG_POOL_MAX`, `PG_TIMEOUT_MS`, `REDIS_URL`, `PAYESH_JWT_SECRET` و مقادیر پیش‌فرض بهینه.

---

## ۳. جدول نگاشت ۸۰ مجموعه داده به جداول PostgreSQL

```
┌────┬────────────────────────┬──────────────────────┬───────────────────────────────┐
│ #  │ نام جدول               │ کلید اصلی / خارجی    │ فیلدهای شاخص و ایندکس‌ها      │
├────┼────────────────────────┼──────────────────────┼───────────────────────────────┤
│ ۱  │ schools                │ id (PK)              │ name, type, capabilities(GIN) │
│ ۲  │ users                  │ id (PK), school_id   │ national_id, phone, role      │
│ ۳  │ classes                │ id (PK), school_id   │ name, grade, capacity         │
│ ۴  │ enrollments            │ id (PK), school_id   │ student_id, class_id, status  │
│ ۵  │ attendance             │ id (PK), school_id   │ class_id, date, status, late  │
│ ۶  │ grades                 │ id (PK), school_id   │ student_id, subject_id, score │
│ ۷  │ discipline             │ id (PK), school_id   │ student_id, date, points      │
│ ۸  │ schedule               │ id (PK), school_id   │ teacher_id, class_id, day     │
│ ۹  │ parent_links           │ id (PK), school_id   │ parent_id, student_id         │
│ ۱۰ │ notifications          │ id (PK), school_id   │ user_id, title, read          │
│ ۱۱ │ messages               │ id (PK), school_id   │ from_id, to_id, body          │
│ ۱۲ │ sync_conflicts         │ id (PK), school_id   │ collection, record_id, status │
│ ۱۳ │ tuitions / plans       │ id (PK), school_id   │ student_id, amount, balance   │
│ ۱۴ │ installments           │ id (PK), school_id   │ tuition_id, due_date, status  │
│ ۱۵ │ transactions           │ id (PK), school_id   │ amount, tracking_no, type     │
│ ۱۶ │ bus_* (routes/events)  │ id (PK), school_id   │ driver_id, route_id, status   │
│ ۱۷ │ vclass_* (sessions)    │ id (PK), school_id   │ teacher_id, class_id, link    │
│ ۱۸ │ lib_* (books/loans)    │ id (PK), school_id   │ isbn, user_id, due_date       │
│ ۱۹ │ leaves / corrections   │ id (PK), school_id   │ user_id, from_date, status    │
│ ۲۰ │ سایر ۶۰ جدول مدل داده  │ id (PK), school_id   │ مطابق authz/model.json        │
└────┴────────────────────────┴──────────────────────┴───────────────────────────────┘
```

---

## ۴. نتایج آزمون‌ها و اعتبارسنجی (Test & Validation Results)

تمامی سوئیت‌های آزمون پروژه با موفقیت ۱۰۰٪ اجرا شدند:

| عنوان آزمون | تعداد کل | موفق (Pass) | ناموفق (Fail) | وضعیت |
| :--- | :---: | :---: | :---: | :---: |
| **تست‌های دودی جامع (`tests/smoke.js`)** | ۵۴۷ | ۵۴۷ | ۰ | **سبز ✅** |
| **تست‌های ساختار و بیلد (`tests/run.js`)** | ۳۳ | ۳۳ | ۰ | **سبز ✅** |
| **تست‌های ممیزی امنیتی (`tests/audit.js`)** | ۴۷ | ۴۷ | ۰ | **سبز ✅** |
| **آزمون مدل مجوزها (`tests/authz-model.js`)** | ۲۳۰ | ۲۳۰ | ۰ | **سبز ✅** |
| **تست تطابق مجوزهای اکشن (`tests/check-authz.js`)** | ۶ | ۶ | ۰ | **سبز ✅** |
| **اسکن عدم افشای کلیدها (`tests/secret-scan.js`)** | ۱۱ | ۱۱ | ۰ | **سبز ✅** |
| **تست‌های یکپارچگی سرور (`tests/server*.js`)** | ۱۸ سوئیت | تمامی | ۰ | **سبز ✅** |
| **بررسی بیلد نهایی (`node build.js --check`)** | ۱ | ۱ | ۰ | **سبز ✅** |

---

## ۵. تاریخچه کامیت‌ها در شاخه `main`

1. `31fa0da`: `feat: implement PostgreSQL migration layer, DDL generator, and unified db engine (phase 2)`
2. `4175d08`: `feat: complete PostgreSQL migration engine, ping probes, reconnect logic, and env configuration (phase 2)`

---

## ۶. جمع‌بندی و گام‌های بعدی

پیاده‌سازی فاز ۲ با بالاترین استانداردهای معماری نرم‌افزار، مقیاس‌پذیری و قابلیت اطمینان به پایان رسید. زیرساخت پایش اکنون آماده ورود به **فاز ۴ (لایه کش و صف پیام با Redis)** و **فاز ۵ (تست‌های بار و کارایی با k6)** می‌باشد.
