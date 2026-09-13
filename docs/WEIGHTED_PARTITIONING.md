# Weighted Partitioning برای مدارس شلوغ پایش

**نسخه:** ۱.۰.۰  
**تاریخ:** ۱۸ شهریور ۱۴۰۵ (2026-09-09)  
**وضعیت:** ✅ فاز ۲.۴ — طراحی و قرارداد اجرایی پیاده‌سازی شد

---

## ۱. مسئله

در مقیاس ملی، همهٔ مدارس بار یکسان ندارند. بیشتر مدارس چندصد دانش‌آموز دارند، اما مدارس بزرگ با بیش از ۱۰۰۰ دانش‌آموز می‌توانند روی جدول‌های پرترافیک مثل `attendance` و `grades` hotspot بسازند. اگر shard key فقط `school_id` باشد ولی مدارس بزرگ مثل مدارس کوچک وزن بگیرند، چند مدرسهٔ بزرگ می‌توانند یک shard یا یک read path را اشباع کنند.

هدف این فاز، ساخت یک لایهٔ routing و مانیتورینگ است که مدارس شلوغ را از روی enrollment شناسایی کند و queryهای خواندنی آن‌ها را به read replica یا shard اختصاصی هدایت کند، بدون اینکه اصل‌های امنیتی پروژه تغییر کنند.

---

## ۲. تحلیل وضعیت فعلی دیتابیس

### ۲.۱. `school_id` و ایزولاسیون tenant

اسکیمای PostgreSQL تولیدشده در `server/schema.sql` برای مجموعه‌های مدرسه‌محور، ستون `school_id`، کلید خارجی به `schools(id)` و ایندکس پایه دارد. نمونه‌ها:

```sql
CREATE INDEX IF NOT EXISTS idx_attendance_school_id ON attendance (school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_student ON attendance (school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_class ON attendance (school_id, class_id);

CREATE INDEX IF NOT EXISTS idx_grades_school_id ON grades (school_id);
CREATE INDEX IF NOT EXISTS idx_grades_school_student ON grades (school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_grades_school_class ON grades (school_id, class_id);
```

جدول‌های داخلی مثل `server_processed_uids`، `server_revoked_jti` و برخی جدول‌های رابطه‌ای مانند `bus_students` ذاتاً مدرسه‌محور مستقیم نیستند یا از رابطهٔ parent قابل resolve هستند. قاعدهٔ امنیتی تغییر نمی‌کند: route و query باید همچنان scope را با session و `school_id` enforce کنند.

### ۲.۲. شناسایی مدارس شلوغ

تعریف پیش‌فرض:

```text
heavy school = school with enrollment_count >= 1000
```

منبع شمارش: `enrollments` با dedupe روی `(school_id, student_id)`. اگر store هنوز enrollment نداشت، fallback روی `users` با نقش `student` انجام می‌شود.

در PostgreSQL واقعی:

```sql
SELECT school_id, COUNT(DISTINCT student_id) AS enrollment
FROM enrollments
WHERE school_id IS NOT NULL AND student_id IS NOT NULL
GROUP BY school_id
HAVING COUNT(DISTINCT student_id) >= 1000
ORDER BY enrollment DESC;
```

---

## ۳. طراحی انتخاب‌شده

پیشنهاد محصول ترکیب A و B بود؛ همین ترکیب پیاده‌سازی شد:

### گزینه A — Shard با وزن

مدارس عادی روی shardهای shared پخش می‌شوند. مدارس بزرگ روی shardهای dedicated/heavy با وزن بالاتر می‌روند تا احتمال تجمع چند مدرسهٔ بزرگ روی یک shard کم شود.

### گزینه B — Read Replica اختصاصی

برای مدارس بزرگ، queryهای read-only می‌توانند به replica بروند. writeها همیشه به primary/shard اصلی می‌روند تا سازگاری داده، OCC و conflict handling دست‌نخورده بماند.

### قاعده نهایی routing

```text
write(any school)                  → primary shard
read(normal school)                → primary/shared shard
read(heavy school + replica exists) → read replica
read(heavy school + no replica)     → primary dedicated shard
```

---

## ۴. پیاده‌سازی در کد

### ۴.۱. ماژول `server/partitioning.js`

این ماژول pure است و هیچ socket یا اتصال دیتابیس باز نمی‌کند. وظایف:

- `enrollmentCountsBySchool(store)`
- `largeSchools(store, threshold)`
- `buildRoutingPlan(store, opts)`
- `routeForSchool(plan, schoolId, operation)`
- `metricsForPlan(plan)`
- `analyzeSchema(sql)`

### ۴.۲. یکپارچه‌سازی با `server/db.js`

`server/db.js` همچنان abstraction اصلی دیتابیس است. تغییرات:

- ساخت `partitionPlan` هنگام `init(store)`
- خواندن envهای weighted partitioning
- پشتیبانی از replica poolها با `pg.Pool`
- افزودن `query(text, params, opts)` با سازگاری عقب‌رو: دو آرگومان قبلی همچنان کار می‌کند.
- اگر `opts = { schoolId, readOnly: true }` و مدرسه heavy باشد و replica تنظیم شده باشد، query به replica pool هدایت می‌شود.
- `healthCheck()` متریک‌های partitioning را گزارش می‌کند.

نمونه استفاده جدید:

```js
await db.query(
  'SELECT * FROM grades WHERE school_id=$1 AND student_id=$2',
  [schoolId, studentId],
  { schoolId, readOnly: true }
);
```

---

## ۵. متغیرهای محیطی

```bash
PAYESH_WEIGHTED_PARTITIONING=1
PAYESH_HEAVY_SCHOOL_THRESHOLD=1000
PAYESH_SHARDS=primary-a:1,primary-b:1,primary-c:1,heavy-a:4
DATABASE_READ_REPLICA_URLS=postgresql://payesh_ro:***@replica-a:6432/payesh,postgresql://payesh_ro:***@replica-b:6432/payesh
PG_REPLICA_POOL_MAX=10
```

فرمت JSON هم برای shardها پشتیبانی می‌شود:

```json
[
  { "id": "primary-a", "weight": 1 },
  { "id": "primary-b", "weight": 1 },
  { "id": "heavy-a", "weight": 4, "dedicated": true }
]
```

---

## ۶. مانیتورینگ

`db.healthCheck()` اکنون بخش `partitioning` را اضافه می‌کند:

```json
{
  "partitioning": {
    "enabled": true,
    "threshold": 1000,
    "schools": 1250,
    "heavy_schools": 32,
    "total_enrollment": 820000,
    "replica_pools": 2,
    "replica_reads": 12030,
    "primary_reads": 54012,
    "writes": 9801
  }
}
```

آستانه‌های هشدار:

| شاخص | هشدار | اقدام |
|---|---:|---|
| `heavy_schools` رشد ناگهانی | بیشتر از ۲۰٪ در ماه | بازنگری threshold و shard weights |
| `replica_reads = 0` با وجود replica | ۵ دقیقه | بررسی `schoolId/readOnly` در routeها |
| `waiting_count` روی primary | پایدار > 0 | افزایش PgBouncer/Pg pool یا انتقال readها |
| shard با enrollment نامتوازن | ۲ برابر میانگین | تغییر وزن‌ها یا shard اختصاصی جدید |

---

## ۷. پارتیشن‌بندی فیزیکی PostgreSQL برای جدول‌های بزرگ

این فاز routing را آماده می‌کند. اگر جدول‌های `attendance` و `grades` به چند صد میلیون رکورد برسند، قدم بعدی partitioning فیزیکی است:

```sql
CREATE TABLE attendance_p (
  LIKE attendance INCLUDING ALL
) PARTITION BY HASH (school_id);

CREATE TABLE attendance_p_00 PARTITION OF attendance_p
  FOR VALUES WITH (MODULUS 32, REMAINDER 0);
```

برای مدارس خیلی بزرگ می‌توان partition اختصاصی ساخت:

```sql
CREATE TABLE grades_school_12345 PARTITION OF grades_p
  FOR VALUES IN (12345);
```

این migration باید جدا، با downtime/dual-write کنترل‌شده و benchmark انجام شود. در این فاز عمداً schema فعلی تخریب نشد.

---

## ۸. امنیت و Fail-Closed

- routing هیچ مجوزی صادر نمی‌کند؛ فقط مقصد query را انتخاب می‌کند.
- Scope و RBAC همچنان در routeها و `server/sync.js` enforce می‌شوند.
- اگر مدرسه ناشناخته باشد، route به primary می‌رود، نه replica؛ یعنی fail-closed از نظر سازگاری داده.
- write هیچ‌وقت به replica نمی‌رود.
- replica URLها فقط از env خوانده می‌شوند و در Git ذخیره نمی‌شوند.

---

## ۹. تست

تست اختصاصی:

```bash
node tests/weighted-partitioning.js
```

گیت‌های عمومی:

```bash
node build.js --check
node tools/check-authz.js
node tests/secret-scan.js
node --expose-gc --max-old-space-size=2048 tests/smoke.js
```

---

## ۱۰. چک‌لیست پذیرش فاز ۲.۴

- [x] مدارس بزرگ با enrollment بالای ۱۰۰۰ شناسایی می‌شوند.
- [x] shardهای weighted و dedicated پشتیبانی می‌شوند.
- [x] read replica برای readهای مدارس بزرگ route می‌شود.
- [x] write همیشه primary می‌ماند.
- [x] health metrics برای shard/replica اضافه شد.
- [x] تست قرارداد `tests/weighted-partitioning.js` اضافه شد.
