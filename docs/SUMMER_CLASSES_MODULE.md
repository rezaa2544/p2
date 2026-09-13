# ماژول کلاس‌های تابستانی (E.8)

تاریخ: 2026-09-09  
وضعیت: پیاده‌سازی‌شده ✅

## هدف

این ماژول برای مدیریت دوره‌های تابستانی مدرسه است: کلاس‌های جبرانی، تقویتی، هنری و ورزشی که بیرون از چرخه رسمی سال تحصیلی برگزار می‌شوند. داده‌های این ماژول روی کارنامه، حضور رسمی، برنامه هفتگی رسمی و محاسبات سال تحصیلی اثر مستقیم ندارد.

## مدل داده

### `summer_classes`

فیلدهای اصلی:

- `id`
- `school_id`
- `title` — عنوان کلاس، مثل «ریاضی تقویتی پایه هشتم»
- `subject` — درس یا محور دوره
- `teacher_id` — دبیر، اختیاری
- `start_date`
- `end_date`
- `schedule` — شیء JSON مثل `{"saturday":"08:00-10:00"}`
- `capacity`
- `status` — یکی از `planned`، `active`، `done`
- `created_at`
- `updated_at`

برای سازگاری عقب‌رو، فیلدهای قدیمی `name`، `note` و `student_ids` هنوز خوانده می‌شوند؛ اما مسیر جدید ثبت‌نام بر پایه `summer_enrollments` است.

### `summer_enrollments`

فیلدهای اصلی:

- `id`
- `school_id`
- `summer_class_id`
- `student_id`
- `enrolled_at`
- `status` — یکی از `enrolled`، `withdrawn`
- `attendance` — شیء JSON با نگاشت تاریخ جلسه به وضعیت حضور، مثل `{"2026-06-20":"present"}`
- `created_at`
- `updated_at`

## مجوزها و دامنه امنیتی

- مدیر مدرسه و سوپرادمین می‌توانند کلاس تابستانی بسازند، ویرایش کنند، حذف کنند و دانش‌آموز ثبت‌نام/منصرف کنند.
- دبیر فقط کلاس‌هایی را می‌بیند که `teacher_id` آن‌ها خودش است.
- دبیر فقط می‌تواند `attendance` همان ثبت‌نام‌های کلاس خودش را به‌روزرسانی کند؛ تغییر `status`، `student_id` یا `summer_class_id` برای دبیر fail-closed است.
- دانش‌آموز و ولی فقط کارت «کلاس‌های تابستانی من» را در داشبورد می‌بینند؛ نوشتن ندارند.
- سمت سرور، دامنه `summer_enrollments` از روی `summer_class_id`، مدرسه کلاس، دانش‌آموز و دبیر همان کلاس بررسی می‌شود.

## رابط کاربری

- مدیر: مسیر «کلاس‌های تابستانی» با لیست، ایجاد/ویرایش کلاس، ثبت‌نام دانش‌آموزان و ثبت حضور.
- دبیر: همان مسیر، اما فقط کلاس‌های خودش و دکمه ثبت حضور.
- دانش‌آموز/ولی: کارت «کلاس‌های تابستانی من» در داشبورد.

## PostgreSQL

`server/schema.sql` شامل ALTERهای idempotent برای ستون‌های جدید `summer_classes` و جدول `summer_enrollments` است. مولد `tools/migrate-to-pg.js` نیز `schedule` و `attendance` را به‌صورت `JSONB` تولید می‌کند.

## تست‌ها

- `node tests/summer2.js` — سناریوهای کلاینت، CRUD، ثبت‌نام، ظرفیت، حضور دبیر، کارت دانش‌آموز/ولی.
- `node tests/summer3.js` — سناریوهای سرور و دامنه/مجوز.
- `node tests/summer-mutations.js` — جهش‌های مجوز و دامنه.

گیت‌های سراسری لازم:

- `node build.js --check`
- `node tools/check-authz.js`
- `node tests/secret-scan.js`
- `node --expose-gc --max-old-space-size=2048 tests/smoke.js`
