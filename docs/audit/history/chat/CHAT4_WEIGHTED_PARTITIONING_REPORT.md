# گزارش نهایی چت ۴ — Weighted Partitioning فاز ۲.۴

**تاریخ:** ۱۸ شهریور ۱۴۰۵ (2026-09-09)  
**شاخه اجرایی:** `arena/01a08527-p2`  
**وضعیت:** ✅ کامل و Push شده

---

## ۱. محدودیت شاخه

در پرامپت، شاخه `feat/weighted-partitioning-chat4` درخواست شده بود؛ اما این سشن Arena به‌صورت سخت روی `arena/01a08527-p2` قفل است و طبق قانون محیط، مجاز به checkout/create/push شاخه دیگر نیست. بنابراین تمام کار روی شاخه مجاز همین سشن انجام و به `origin/arena/01a08527-p2` پوش شد.

---

## ۲. تحلیل وضعیت فعلی

| پرسش | نتیجه |
|---|---|
| آیا `school_id` در همه جداول مدرسه‌محور هست؟ | در `server/schema.sql` جدول‌های tenantمحور مثل `attendance`, `grades`, `enrollments`, `classes`, `users`, `subjects` و… ستون `school_id` و FK به `schools(id)` دارند. |
| آیا ایندکس مناسب هست؟ | جدول‌های پرترافیک ایندکس پایه و ترکیبی دارند؛ نمونه: `idx_attendance_school_id`, `idx_attendance_school_student`, `idx_attendance_school_class`, `idx_grades_school_id`, `idx_grades_school_student`, `idx_grades_school_class`. |
| مدارس بزرگ چگونه شناسایی می‌شوند؟ | با شمارش `COUNT(DISTINCT student_id)` از `enrollments` بر اساس `school_id`؛ آستانه پیش‌فرض ۱۰۰۰ دانش‌آموز است. |

---

## ۳. پیاده‌سازی انجام‌شده

| فایل | تغییر |
|---|---|
| `server/partitioning.js` | ماژول pure برای شمارش enrollment، تشخیص مدارس شلوغ، shard weighted، read-replica routing، متریک و تحلیل schema. |
| `server/db.js` | یکپارچه‌سازی routing: `query(text, params, opts)` با گزینه سوم سازگار با نسخه قبل؛ read مدرسه شلوغ در صورت وجود replica به replica pool می‌رود؛ write همیشه primary می‌ماند. |
| `docs/WEIGHTED_PARTITIONING.md` | سند کامل طراحی و runbook فاز ۲.۴: تحلیل فعلی، گزینه‌های A/B/C، طراحی ترکیبی، envها، مانیتورینگ، PostgreSQL physical partitioning آینده، امنیت. |
| `tests/weighted-partitioning.js` | تست قرارداد ۱۲ مرحله‌ای برای routing، تشخیص مدارس شلوغ، shard config، replica، fail-closed، schema index و health metrics. |
| `.env.example` | envهای `PAYESH_WEIGHTED_PARTITIONING`, `PAYESH_HEAVY_SCHOOL_THRESHOLD`, `PAYESH_SHARDS`, `DATABASE_READ_REPLICA_URLS`, `PG_REPLICA_POOL_MAX`. |
| `docs/ROADMAP.md` | ردیف `Weighted Partitioning برای مدارس شلوغ` با وضعیت ✅ اضافه شد. |
| `docs/README.md` | فهرست مستندات با سند جدید به‌روز شد. |

---

## ۴. رفتار Routing

```text
write(any school)                   → primary
read(normal school)                 → primary/shared shard
read(heavy school + replica exists) → read replica
read(heavy school + no replica)     → primary dedicated shard
unknown school                      → primary (fail-closed)
```

نمونه env تولید:

```bash
PAYESH_WEIGHTED_PARTITIONING=1
PAYESH_HEAVY_SCHOOL_THRESHOLD=1000
PAYESH_SHARDS=primary-a:1,primary-b:1,primary-c:1,heavy-a:4
DATABASE_READ_REPLICA_URLS=postgresql://payesh_ro:***@replica-a:6432/payesh,postgresql://payesh_ro:***@replica-b:6432/payesh
PG_REPLICA_POOL_MAX=10
```

---

## ۵. تست‌ها

| دستور | نتیجه |
|---|---|
| `node build.js --check` | ✅ سبز |
| `node tools/check-authz.js` | ✅ تطبیق کامل / خطا ۰ |
| `node tests/secret-scan.js` | ✅ ۱۱/۱۱ |
| `node tests/weighted-partitioning.js` | ✅ ۱۲/۱۲ |
| `node tests/pgbouncer-pooling.js` | ✅ ۱۲/۱۲، رگرسیون PgBouncer |
| `node --expose-gc --max-old-space-size=2048 tests/smoke.js` | ✅ ۵۴۷/۵۴۷ |

هشدار شناخته‌شده smoke: `Not implemented: Window's scrollTo() method` مربوط به jsdom است و شکست تست نیست.

---

## ۶. کامیت‌ها و Push

| کامیت | پیام | وضعیت Push |
|---|---|---|
| `5ea62a3` | `feat(db): add weighted partitioning routing` | ✅ Push شده به `origin/arena/01a08527-p2` |
| `b37907b` | `docs: update weighted partitioning handoff report` | ✅ Push شده به `origin/arena/01a08527-p2` |

---

## ۷. نتیجه نهایی

Weighted Partitioning فاز ۲.۴ از نظر طراحی، کد، مستندات و تست کامل شد. پیاده‌سازی فعلی production-safe و config-driven است: تا وقتی `PAYESH_WEIGHTED_PARTITIONING=1` و replica URL تنظیم نشود، رفتار عملی مسیرهای موجود تغییر مخرب ندارد؛ اما قرارداد routing و health metrics برای مقیاس ملی آماده است.
