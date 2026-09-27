---
name: databases-fundamentals
description: Design and use databases — relational (PostgreSQL) and NoSQL — schema design, indexing, querying, and backup strategy.
version: 1.0.0
author: rezaa2544, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [databases, postgresql, sql, nosql, indexing, education]
    related_skills: [database-architect, software-security, devops-cicd]
---

# بانک‌های اطلاعاتی (databases-fundamentals)

این مهارت طراحی و استفاده از پایگاه‌های داده برای ذخیره‌سازی درازمدت اطلاعات
را پوشش می‌دهد — از مدل رابطه‌ای تا NoSQL، ایندکس‌گذاری و backup.

## When to Use

- هر زمان که داده‌های مهم پروژه نیاز به ذخیره‌سازی درازمدت دارند (داده
  کاربر، لاگ، تنظیمات).
- طراحی یا بازبینی schema یک جدول.
- وقتی کوئریها کند شده‌اند و باید ایندکس را بررسی کنی.
- Don't use for: داده موقت/کش — برای آن Redis (در پروژه پایش) مناسب‌تر است.

## Procedure

1. **نوع دیتابیس را انتخاب کن.**
   - **رابطه‌ای (PostgreSQL، MySQL):** داده ساختاریافته با روابط، ACID
     مهم است، کوئریهای پیچیده.
   - **NoSQL (MongoDB، Redis):** داده نیمه‌ساختاریافته، دسترسی سریع
     key-value، scale افقی.
2. **schema را طراحی کن.**
   - جداول و ستونها را بر اساس موجودیتهای واقعی بساز
   - کلید اصلی (primary key) و کلید خارجی (foreign key) را مشخص کن
   - نوع داده مناسب انتخاب کن (به‌جای `TEXT` برای همه چیز)
3. **عادی‌سازی (normalization) را انجام بده.** جداول تکراری را بشکن تا
   داده‌های تکراری حذف شوند. اما از over-normalization پرهیز کن — joinهای
   زیاد کارایی را می‌کشند.
4. **ایندکس‌گذاری کن.** ایندکس روی ستونهای پرکاربرد در `WHERE`، `JOIN`،
   `ORDER BY`. به‌خاطر داشته باش: ایندکس نوشتن را کندتر می‌کند.
5. **کوئری را بنویس و بهینه کن.**
   - ستونهای مورد نیاز را مشخص کن (`SELECT *` نکن)
   - از parameterized queries استفاده کن (امنیت + performance)
   - `EXPLAIN` را اجرا کن تا plan کوئری را ببینی
6. **idempotency و consistency.** در عملیات نوشتن تکراری، از کلیدهای
   یکتا (مثل idempotency key) استفاده کن.
7. **backup و restore.** یک برنامه backup منظم و یک مسیر restore آزمایش‌شده.
   Backup بدون تست restore، ارزش ندارد.
8. **در پروژه پایش:**
   - PostgreSQL از طریق `server/db.js` و `migrations/`
   - Redis برای cache/coordination
   - migrationها باید با `tools/migrate-ledger.js` اجرا و rollback شوند
   - tenant isolation: هر کوئری باید `school_id` داشته باشد

## Pitfalls

- **عدم نرمال‌سازی** → داده تکراری و سختی مدیریت.
- **over-normalization** → joinهای سنگین و کارایی پایین.
- **فراموش کردن ایندکس روی ستونهای پرکاربرد** → جستجوی کامل جدول (seq scan).
- **ایندکس بیش از حد** → نوشتن کندتر.
- **backup بدون تست restore** — وقتی لازم شود، ممکن است کار نکند.
- **نادیده گرفتن migration rollback** — هر migration باید مسیر برگشت داشته باشد.
- **`SELECT *`** → داده اضافه و کارایی پایین.

## Verification

- schema با موجودیتهای واقعی تطابق دارد و کلیدها درست تنظیم شده‌اند.
- کوئری اصلی با حجم داده واقعی در زمان معقول اجرا می‌شود (`EXPLAIN` بدون
  seq scan روی جداول بزرگ).
- یک backup می‌تواند به یک دیتابیس ایزوله restore شود.
- migration با مسیر rollback آزمایش شده است.
- کوئریها parameterized هستند (نه string concatenation).
