# National Baseline — Wave 0 / Part 3

**موضوع:** اندازه‌گیری baseline دیتابیس و کش
**تاریخ اجرا:** ۱۸/۰۶/۱۴۰۵ — 2026-09-09
**شاخه کاری Arena:** `arena/01a085da-p2`
**محدوده:** اندازه‌گیری مستنداتی در sandbox؛ بدون تغییر کد پروژه.
**Commit هنگام اندازه‌گیری:** `58e1ebe8cec2d9d95b2c5a1dc85e4d13a6fe0c50`

---

## 1. روش اندازه‌گیری

برای رعایت شرط documentation-only، هیچ فایل runtime/schema/test تغییر نکرد و benchmark با harness موقت خارج از repository اجرا شد:

- مسیر harness: `/tmp/payesh_measure_part3.js`
- خروجی خام: `/tmp/payesh_baseline_part3_results.json`
- داده benchmark از `server/data/payesh.json` در یک temp store کپی شد؛ writeهای sync فقط روی temp store انجام شدند.
- ابتدا availability لایه DB با `server/db.js` بررسی شد.
- چون `DATABASE_URL` در sandbox تنظیم نبود، PostgreSQL واقعی فعال نشد؛ بنابراین queryها به‌صورت SQL-shape simulation روی JSON fallback/demo store اندازه‌گیری شدند.
- availability کش با `server/redis.js` و `server/cache.js` بررسی شد.
- چون `REDIS_URL` تنظیم نبود، Redis واقعی فعال نشد؛ فقط fallback حافظه‌ای توسعه و L1 bootstrap cache اندازه‌گیری شدند.
- sync throughput با سرور واقعی `node server/index.js`، login دمو، و route فعال `POST /api/sync` اندازه‌گیری شد.

> این سند baseline محیط sandbox است، نه ظرفیت‌سنجی production. PostgreSQL و Redis واقعی باید در Waveهای بعدی/محیط staging و Wave 18 دوباره اندازه‌گیری شوند.

---

## 2. مشخصات داده و محیط

| مورد | مقدار |
|---|---:|
| زمان اندازه‌گیری | `2026-09-09T12:46:01.295Z` |
| Node.js | `v22.22.3` |
| `DATABASE_URL` | `not set` |
| `REDIS_URL` | `not set` |
| temp store | `/tmp/payesh-baseline3-B8kW0Y/payesh.json` |
| `schools` records | `6` |
| `users` records | `1035` |
| `classes` records | `36` |
| `enrollments` records | `523` |
| `attendance` records | `10537` |
| `grades` records | `12854` |
| `schedule` records | `1080` |
| `subjects` records | `489` |
| `notifications` records | `705` |
| school انتخابی | `1` |
| class انتخابی | `5` |
| subject انتخابی | `1` |

---

## 3. وضعیت PostgreSQL / DB Layer

| متریک | مقدار |
|---|---|
| `server/db.js init.driver` | `memory` |
| `poolSize` | `0` |
| `ping.driver` | `memory` |
| `ping.alive` | `true` |
| PostgreSQL واقعی | `not available in sandbox` |

### Query Performance

| Query | Runs | SQL / منطق اندازه‌گیری | Rows | Scanned records | Avg ms | p50 ms | p95 ms | p99 ms | محدودیت |
|---|---:|---|---:|---:|---:|---:|---:|---:|---|
| `class_student_roster` | `3000` | `SELECT u.id,u.full_name,u.national_id FROM users u JOIN enrollments e ON e.student_id=u.id WHERE e.class_id=$1 ORDER BY u.full_name` | `16` | `1558` | `0.046` | `0.043` | `0.067` | `0.088` | JSON fallback / in-process scan; PostgreSQL planner, indexes, IO, locks and network not measured. |
| `attendance_class_report` | `3000` | `SELECT * FROM attendance WHERE school_id=$1 AND class_id=$2 AND date BETWEEN $3 AND $4 ORDER BY date,student_id` | `304` | `10537` | `0.240` | `0.219` | `0.345` | `0.424` | JSON fallback / in-process scan; PostgreSQL planner, indexes, IO, locks and network not measured. |
| `grades_class_subject_list` | `3000` | `SELECT * FROM grades WHERE school_id=$1 AND class_id=$2 AND subject_id=$3 ORDER BY student_id,created_at` | `48` | `12854` | `0.153` | `0.137` | `0.237` | `0.278` | JSON fallback / in-process scan; PostgreSQL planner, indexes, IO, locks and network not measured. |
| `pull_delta_scope_manager` | `2000` | `GET /api/v1/pull equivalent: for manager scope, filter collections by school_id and updated_at/created_at > since` | `5938` | `24462` | `0.292` | `0.328` | `0.388` | `0.584` | JSON fallback / in-process scan; PostgreSQL planner, indexes, IO, locks and network not measured. |

### تفسیر DB

- اعداد query بسیار پایین‌اند چون در یک process، روی دیتاست دمو و بدون network/DB engine اجرا شده‌اند.
- مهم‌ترین ریسک مشاهده‌شده خود عدد latency نیست؛ الگوی scan روی مجموعه‌های `attendance` و `grades` است که در PostgreSQL ملی باید با index و projection واقعی کنترل شود.
- این اندازه‌گیری baseline fallback است و نباید جایگزین `EXPLAIN (ANALYZE, BUFFERS)` روی PostgreSQL staging شود.

---

## 4. وضعیت Redis / Cache

| متریک | مقدار |
|---|---|
| Redis واقعی | `not available in sandbox` |
| `redis.init.driver` | `memory` |
| `redis.ping.driver` | `memory` |
| cache init | `true` |
| محدودیت | No REDIS_URL / real Redis service in sandbox; measured dev-only in-memory fallback and L1 bootstrap cache only. |

### Cache Hit/Miss — fallback اندازه‌گیری‌شده

| سناریو | Runs | Hit | Miss | Hit-rate | Avg ms | p95 ms | توضیح |
|---|---:|---:|---:|---:|---:|---:|---|
| Bootstrap cache cold lookup | `50` | `0` | `50` | `0.00%` | `0.060336` | `0.084303` | lookup برای userهای ناموجود در cache |
| Bootstrap cache L1 hit | `500` | `500` | `0` | `100.00%` | `0.000494` | `0.000740` | بعد از `setBootstrapCache`، hit از Map محلی L1 |
| مجموع sample | `550` | `500` | `50` | `90.91%` | — | — | Redis واقعی در این عدد دخیل نیست |

### Redis-like Memory Fallback

| Operation | Runs | Avg ms | p95 ms | توضیح |
|---|---:|---:|---:|---|
| `redis.set` fallback | `300` | `0.001304` | `0.002856` | Map محلی؛ distributed Redis نیست |
| `redis.get` fallback | `300` | `0.040398` | `0.036480` | Map محلی؛ network/serialization Redis واقعی سنجیده نشده |

---

## 5. Sync Throughput

Route اندازه‌گیری‌شده: `POST /api/sync`
پورت موقت: `19902`
نوع عملیات: batchهای `notifications` با `superadmin` روی temp store.

| Batch size | Repeats | Status | Avg ms | p95 ms | Avg records/sec | Avg response KB | Avg ok records | محدودیت |
|---:|---:|---|---:|---:|---:|---:|---:|---|
| `1` | `5` | `200` | `4.574` | `6.736` | `218.6` | `0.115` | `1.0` | localhost + JSON temp store؛ DB/Redis واقعی و concurrent clients سنجیده نشده‌اند |
| `50` | `5` | `200` | `8.397` | `13.867` | `5954.8` | `4.749` | `50.0` | localhost + JSON temp store؛ DB/Redis واقعی و concurrent clients سنجیده نشده‌اند |
| `250` | `3` | `200` | `22.910` | `23.412` | `10912.2` | `24.085` | `250.0` | localhost + JSON temp store؛ DB/Redis واقعی و concurrent clients سنجیده نشده‌اند |
| `500` | `3` | `200` | `51.512` | `59.435` | `9706.5` | `48.255` | `500.0` | localhost + JSON temp store؛ DB/Redis واقعی و concurrent clients سنجیده نشده‌اند |

### تفسیر Sync

- سقف contract فعلی batch برابر ۵۰۰ عملیات است؛ batch ۵۰۰ با status `200` پردازش شد.
- throughput بالا ناشی از temp JSON/in-process path و نبود network/DB persistence واقعی است.
- برای Go/No-Go ملی، همین سناریو باید با PostgreSQL source of truth، Redis idempotency واقعی، چند worker، و load همزمان تکرار شود.

---

## 6. محدودیت‌های شناخته‌شده

| محدودیت | اثر |
|---|---|
| PostgreSQL در sandbox فعال نبود | DB engine، planner، index selectivity، lock/contention، IO و `EXPLAIN ANALYZE` اندازه‌گیری نشد. |
| Redis واقعی فعال نبود | hit/miss توزیع‌شده، network latency، eviction، pub/sub و lock واقعی اندازه‌گیری نشد. |
| دیتاست دمو | حجم داده با 10M دانش‌آموز و multi-tenant ملی قابل مقایسه نیست. |
| اجرای localhost/sequential | load همزمان، jitter شبکه، TLS/LB/WAF/CDN و چند process وارد benchmark نشد. |
| writeهای sync روی temp store | repository و store اصلی تغییر نکردند، اما نتیجه ظرفیت persistence واقعی نیست. |
| Query simulation مبتنی بر آرایه‌های JS | زمان‌ها بیشتر هزینه filter/sort محلی را نشان می‌دهند، نه SQL واقعی. |

---

## 7. Evidence خام خلاصه

```json
{
  "measured_at": "2026-09-09T12:46:01.295Z",
  "commit": "58e1ebe8cec2d9d95b2c5a1dc85e4d13a6fe0c50",
  "db_layer": {
    "init": {
      "ok": true,
      "driver": "memory",
      "poolSize": 0
    },
    "ping": {
      "ok": true,
      "driver": "memory",
      "alive": true
    },
    "database_url_present": false,
    "mode_note": "PostgreSQL not configured in this sandbox; timings below are JSON fallback / SQL-shape simulations over the demo store."
  },
  "chosen_scope": {
    "school_id": 1,
    "class_id": 5,
    "subject_id": 1
  },
  "query_performance": [
    {
      "name": "class_student_roster",
      "runs": 3000,
      "avg_ms": 0.046457177333333106,
      "p50_ms": 0.04271099999999706,
      "p95_ms": 0.06689099999999826,
      "p99_ms": 0.08787599999999429,
      "rows": 16,
      "scanned_records": 1558
    },
    {
      "name": "attendance_class_report",
      "runs": 3000,
      "avg_ms": 0.24034106066666552,
      "p50_ms": 0.2191090000000031,
      "p95_ms": 0.34498199999995904,
      "p99_ms": 0.42373399999996764,
      "rows": 304,
      "scanned_records": 10537
    },
    {
      "name": "grades_class_subject_list",
      "runs": 3000,
      "avg_ms": 0.15314004866666514,
      "p50_ms": 0.13728599999990365,
      "p95_ms": 0.23719400000004498,
      "p99_ms": 0.2776730000000498,
      "rows": 48,
      "scanned_records": 12854
    },
    {
      "name": "pull_delta_scope_manager",
      "runs": 2000,
      "avg_ms": 0.2917238725000002,
      "p50_ms": 0.3284350000001268,
      "p95_ms": 0.38837100000000646,
      "p99_ms": 0.5838630000000649,
      "rows": 5938,
      "scanned_records": 24462
    }
  ],
  "cache": {
    "redis_url_present": false,
    "redis_active": false,
    "redis_init": {
      "ok": true,
      "driver": "memory",
      "message": "In-memory cache fallback active (dev only)"
    },
    "cache_init": {
      "ok": true
    },
    "ping": {
      "ok": true,
      "driver": "memory",
      "alive": true
    },
    "limitation": "No REDIS_URL / real Redis service in sandbox; measured dev-only in-memory fallback and L1 bootstrap cache only.",
    "bootstrap_cache": {
      "misses": 50,
      "hits": 500,
      "hit_rate_percent": 90.9090909090909,
      "cold_miss_avg_ms": 0.060336080000042785,
      "cold_miss_p95_ms": 0.08430300000009083,
      "l1_hit_avg_ms": 0.0004942080000018905,
      "l1_hit_p95_ms": 0.0007400000004054164
    },
    "redis_like_memory_fallback": {
      "set_runs": 300,
      "set_avg_ms": 0.0013035199999967518,
      "set_p95_ms": 0.002856000000065251,
      "get_runs": 300,
      "get_avg_ms": 0.040398213333335965,
      "get_p95_ms": 0.036480000000210566
    }
  },
  "sync_throughput": [
    {
      "batch_size": 1,
      "repeats": 5,
      "avg_ms": 4.57352979999996,
      "p95_ms": 6.736476000000039,
      "records_per_sec_avg": 218.6494991242888,
      "avg_response_kb": 0.115234375,
      "statuses": "200",
      "ok_avg": 1
    },
    {
      "batch_size": 50,
      "repeats": 5,
      "avg_ms": 8.39661499999993,
      "p95_ms": 13.867175999999745,
      "records_per_sec_avg": 5954.780587177144,
      "avg_response_kb": 4.7490234375,
      "statuses": "200",
      "ok_avg": 50
    },
    {
      "batch_size": 250,
      "repeats": 3,
      "avg_ms": 22.910213666666703,
      "p95_ms": 23.41217800000004,
      "records_per_sec_avg": 10912.163615642678,
      "avg_response_kb": 24.0849609375,
      "statuses": "200",
      "ok_avg": 250
    },
    {
      "batch_size": 500,
      "repeats": 3,
      "avg_ms": 51.51163733333336,
      "p95_ms": 59.43525200000022,
      "records_per_sec_avg": 9706.544499148511,
      "avg_response_kb": 48.2548828125,
      "statuses": "200",
      "ok_avg": 500
    }
  ]
}
```

---

## 8. وضعیت Wave 0 پس از Part 3

Wave 0 هنوز کامل نیست؛ Partهای ۱، ۲ و ۳ کامل شده‌اند و Part 4 باقی مانده است. پس از Part 4 باید نتایج در `docs/NATIONAL_BASELINE.md` تجمیع شوند.
