# گزارش نهایی مأموریت M15-03 — معماریِ مقیاسِ پایگاهِ داده (Database Scale Architecture)

| مورد | مقدار |
|---|---|
| **مأموریت** | M15-03 / DATABASE SCALE ARCHITECTURE |
| **حالت** | EXECUTION / CORRECTION / MEASUREMENT (P0) |
| **پایهٔ شروع** | HEAD = origin/main = `bb0b5fa65a0aab8ecc7570b2a16227f298b6c1` |
| **هدف** | تجمیعِ SQL روی مسیرِ school-intelligence: اصلاحِ schema، درستی، کارایی، مقیاس، تاب‌آوریِ شکست |
| **دستاوردها** | یک کوئریِ تجمیعیِ واحد جایگزینِ شش `SELECT *` · ۴ تا ۶.۴۷× سریع‌تر · اشباعِ pool از c=4 به c=۲۰+ · ۸۱۳MB → ۱.۲MB RAM |
| **رأی نهایی** | **FIXED-SCOPED** (۳ عیبِ موروثی طبقه‌بندی‌شده، ۲ اصلاحِ جانبیِ درونِ scope، ۷ یافتهٔ خارج از scope ثبت شد) |

---

## ۱) خلاصهٔ اجرایی

مسیرِ `/api/v1/school-intelligence` تا پیش از این مأموریت **شش کوئریِ `SELECT *` موازی** می‌زد، **تمامِ ردیف‌های خام را به Node منتقل می‌کرد** (در مقیاس: ۲۵۰٬۰۵۰ ردیف)، و سپس در جاوااسکریپت فیلتر و تجمیع می‌کرد. نتیجه در مقیاس:

- **۴.۵۹ ثانیه** latency برای یک مدرسه با ۱۲۵٬۰۰۰ نمره (p50)
- **۸۱۳ مگابایت** RSS برای یک درخواست
- **۳.۴۴ ثانیه** انسدادِ event-loop (تمامِ درخواست‌های دیگرِ سرور در این مدت متوقف)
- **۶ اتصال از poolِ ۲۰تایی** به ازایِ هر درخواست → اشباع در **۴ درخواستِ همزمان**

این مأموریت یک کوئریِ تجمیعیِ **واحد** جایگزینِ آن کرد: یک اتصال، یک رفت‌وبرگشت، **یک ردیف** (`jsonb_build_object` شاملِ شش خلاصه). نتیجه در همان مقیاس: **۷۱۰ms**، **۱.۲MB**، **۶۱.۷ms** event-lag، **۱ اتصال**.

**۴ legacy defect** در مسیرِ قدیمی کشف و طبقه‌بندی شد (F1–F4). بر اساسِ بنایِ مأموریت، **هیچ‌کدام از bugها در aggregate کپی نشدند** — aggregate قراردادِ صحیح را حفظ کرد و هر تفاوت با مقدارِ محاسبه‌شدهٔ قراردادی assertion شد.

---

## ۲) IMMEDIATE BLOCKER — SQL_CASES_AGG و ستون‌های ناموجود (بسته شد)

بنر فرموده بود: «مطلقاً این کار را نکن: اضافه کردن COALESCE روی ستون ناموجود / ساختن ستون جعلی / تغییر schema صرفاً برای سبز کردن تست.»

**بررسیِ schema واقعی** (`payesh_m15probe` روی PostgreSQL 16 زنده):

ستون‌های واقعی `counselor_refs`: `breach_key, created_at, handled_at, handled_by, id, note, pattern, reason, referred_at, referred_by, school_id, status, student_id, updated_at, chg_id, version`.

**`priority` وجود ندارد. `assigned_to_id` وجود ندارد.** کوئریِ اولیه به این دو ستونِ ناموجود ارجاع می‌داد و در PG زنده شکست می‌خورد.

**اقدامِ انجام‌شده (مطابقِ مسیرِ مجاز):**
1. ✅ schema واقعی inspect شد.
2. ✅ `cases_agg` مطابق schema واقعی بازنویسی شد: `COALESCE(status,'OPEN') IN ('OPEN','UNDER_REVIEW','INTERVENTION_ACTIVE','EVALUATING')` برای active، `= 'RESOLVED'` برای resolved.
3. ✅ رفتارِ production واقعاً `unassigned_high_priority_count = 0` است (تأیید روی دیتای زنده) — صریحاً `'unassigned_high_priority_count', 0` در `jsonb_build_object` نوشته شد.
4. ✅ طبقه‌بندی: **legacy defect (F2)**، نه intentional contract — ستون‌ها هرگز وجود نداشته‌اند.
5. ✅ scope گسترش نیافت؛ F2 به‌عنوان finding مستقل ثبت شد.

تستِ ساختاری اثبات می‌کند که SQL نه به `priority` و نه به `assigned_to_id` اشاره می‌کند (پس از strip کردنِ نظراتِ SQL).

---

## ۳) اصلاحاتِ درستی (CORRECTNESS)

چهار legacy defect با شواهد زنده کشف شد. **هیچ‌کدام در aggregate کپی نشدند.**

| شناسه | عیب | شواهد | تصمیم |
|---|---|---|---|
| **F1** | مسیرِ قدیمی `att.day` می‌خواند — فیلد وجود ندارد؛ schema `date` است. نتیجه: `peak_absence_day` همیشه `'wednesday'` می‌شد (undefined → پیش‌فرض). | schema واقعی + خروجیِ قدیم `wednesday` در برابرِ خروجیِ جدید `thursday` (از `extract(dow FROM date::date)` واقعی) | aggregate از `date` واقعی استفاده می‌کند |
| **F2** | `c.priority` / `c.assigned_to_id` ناموجود → `unassigned_high_priority_count` همیشه ۰. | schema واقعی (۱۶ ستون، هیچ‌کدام priority/assigned_to_id نیست) | صریحاً `0` نوشته شد + مستند |
| **F3** | `excused` (و `early_exit`) در هیچ bucket قرار نمی‌گرفت — در حالی که بقیهٔ سیستم `excused` را **غیبتِ موجه‌شده** می‌شمارد (`attendance-intelligence.js:364`، `semantic.js:346`، `reports-sql.js:106-108`). ۲۵٪ از ردیف‌ها سقوط می‌کردند. | `sessions_analyzed` قدیم ۳۷۵۰۰ در برابرِ جدید ۵۰۰۰۰؛ `calendar_rate` ۶۶.۶۷ → ۵۰ | aggregate `excused` را در missed می‌شمارد |
| **F4** | `buildSchoolIntelligenceSnapshot(data, options)` از **آرگومانِ دوم positional** می‌خواند (`school-intelligence-center.js:558`)، ولی تمامِ ۱۰ call site مسیرِ قدیمی `options: nowOptions()` را **درونِ data** پاس می‌دادند → `PAYESH_ANALYTICS_FIXED_NOW` خاموش بود. | اثباتِ زنده: old-style `2026-10-06T16:40:29Z` (wall-clock) در برابرِ new-style `2026-10-04T10:00:00Z` (FIXED_NOW) | مسیرِ جدید درست پاس می‌دهد |

**۱۶ فیلد بایت‌به‌بایت برابر** روی دیتای زنده اثبات شد (از جمله `average_gpa 10.53` و `failing_ratio 0.475` — برابریِ exact float/numeric).

**۲ اصلاحِ جانبیِ درونِ scope:**
- **مسیریابیِ خواندن:** aggregate اکنون از `db.queryRead` می‌رود (fail-soft به primary، `db.js:426-446`). پیش از این `db.query` (poolِ اصلی) می‌زد.
- **نگهبانِ crashِ رپلیکا:** `readPool.on('connect', c => c.on('error', onClientError))` اضافه شد — همان نگهبانِ poolِ اصلی در `db.js:258-260` که برای جلوگیری از **kill شدنِ کلِ فرآیند** اضافه شده بود. بدونِ این، یک Clientِ رپلیکا که ارتباطش بمیرد، فرآیند را از کار می‌اندازد.

---

## ۴) پیاده‌سازی

### `server/analytics/school-aggregates.js` (جدید، ۲۹۲ خط)

یک کوئریِ تجمیعیِ واحد با **۷ CTE روی ۵ جدولِ پایه** (هر جدول فقط یک بار اسکن می‌شود — `attendance_agg` و `peak_day` از `attendance_days` مشتق می‌شوند و دوباره attendance را نمی‌خوانند):

| CTE | کار |
|---|---|
| `grades_agg` | inner `GROUP BY subject` → outer: `sum(n_rows)`, `COALESCE(sum(sum_scores),0::numeric)`, `sum(n_failing)`, subject_count با `FILTER (WHERE n_scores > 0)` |
| `attendance_days` | `GROUP BY COALESCE(status,''), CASE WHEN date ~ '^[0-9]{4}-...$' THEN CASE extract(dow FROM date::date) WHEN 6 THEN 'saturday' ... END END` |
| `attendance_agg` | total_rows + ۶ bucket با `sum(d.n) FILTER (WHERE d.st = ...)` — همگی `COALESCE(...,0)::int` |
| `peak_day` | `WHERE d.dk IS NOT NULL AND d.st NOT IN ('present','late','early_exit') ORDER BY 2 DESC, 1 ASC LIMIT 1` |
| `schedule_agg` | inner `GROUP BY teacher_id` → distinct_teachers + `count(*) FILTER (WHERE g.n_periods > 30)` |
| `cases_agg` / `notes_agg` | status buckets / count(*) |

SELECT نهایی: `jsonb_build_object(...)` با شش summary + `status_breakdown`.

**الگوی Wave 23** رعایت شد: builders پارامتر شده `{sql, params}`، تستِ «هر پارامتر مصرف شده / placeholder‌ها پیوسته ۱..n»، `FILTER (WHERE ...)`، `COALESCE(a.status,'') NOT IN (...)`.

### `server/analytics/school-intelligence-center.js` (+۵۲/-۱۲)

`assembleSchoolIntelligenceSnapshot({schoolId, academicYear, summaries, options})` استخراج شد — **بدون تغییرِ رفتار** — تا هم مسیرِ قدیمی و هم مسیرِ aggregate از یک تابع استفاده کنند. تمامِ ۱۹ semantic-layer suite سبز ماند.

### `server/routes/analytics.js` (+۷۷/-۴۲)

مسیرِ PG: `computeSchoolIntelligenceFromDb` → `assembleSchoolIntelligenceSnapshot` → return. fail-soft به آینهٔ درون‌حافظه‌ای با log شفاف.

---

## ۵) مجموعهٔ تستِ درستی

| مجموعه | نتیجه | محتوا |
|---|---|---|
| `tests/m15-03-aggregate-sql.js` | **۵۸/۵۸ ✅** | پارامتری‌بودن، نبودِ سمی‌کالن، مسیریابیِ queryRead، ۶ bucket، ۷ روزِ هفته، thresholds،faithfulness، F2، ساختارِ jsonb، runner |
| `tests/m15-03-aggregate-pg.js` | **۴۷/۴۷ ✅** | parity زنده روی PG واقعی: ۱۶ فیلد برابر، ۴ intentional diff با مقدارِ قراردادی، tenant isolation، EXPLAIN |
| `npm test` | **۵۴۷/۵۴۷ ✅** | regression کامل |
| ۱۹ semantic-layer suite | **همه ✅** | access-guard, action-center, deterministic, district-summary, health-index, mutation-safety, no-ranking, snapshot-builder, tenant-isolation |

**هر تفاوت intentional با مقدارِ محاسبه‌شدهٔ قراردادی assertion شد**، نه فقط «متفاوت از قدیم»:
- `sessions_analyzed 37500→50000` [F3]
- `calendar_rate 66.67→50` [F3]
- `chronic_absence_rate 33.33→50` [F3]
- `peak_absence_day "wednesday"→"thursday"` [F1]
- `unassigned_high 0→0` [F2 صفرِ صریح]
- `health_index.score 25.2→18.9` [پیامدِ F3]

---

## ۶) ممیزیِ PostgreSQL pool

| تنظیم | مقدار | منبع |
|---|---|---|
| primary pool | min=2, max=20 | `db.js:78-79` |
| read replica | min=2, max=10 | `db.js:101-102` |
| connectionTimeoutMillis | 3000 | `db.js:82` |
| query_timeout | 10000 | `db.js:94` |
| idleTimeoutMillis | 30000 (hardcoded) | `db.js:83` |
| statement_timeout | **NOT CONFIGURED** | — |
| maxUses | **NOT CONFIGURED** | — |
| queue cap | **ندارد** — `_pendingQueue` بی‌کران | `pg-pool/index.js:105` |
| circuit breaker | **ندارد** | — |
| per-query retry | **ندارد** | `db.js:412-416` |

**رفتارِ اشباع (تأییدشده با concurrency probe):** poolِ پر → درخواست در صف → بعد از ۳۰۰۰ms با `timeout exceeded when trying to connect` شکست می‌خورد. fail-fast است (هنگ نمی‌کند) به‌خاطرِ `boundedMs` که تضمین می‌کند `connectionTimeoutMillis` هرگز ۰ نشود.

**مسیریابی:** `queryRead` با fail-soft درست کار می‌کند. `readCollection`/`readOne` عمداً روی primary می‌مانند (قرارداد read-your-writes، `db.js:18-21`).

---

## ۷) EXPLAIN (ANALYZE, BUFFERS)

در سطحِ ۵۰۰k (۱۲۵٬۰۰۰ ردیف برای probe school):

| جدول | استراتژی | زمان |
|---|---|---|
| `grades` | **Parallel Bitmap Heap Scan** (۲ worker) + Bitmap Index Scan روی `idx_grades_school_id` | ۱۱۵ms |
| `attendance` | **Parallel Bitmap Heap Scan** + Bitmap Index Scan روی `idx_attendance_school_id` | ۴۴۴ms |
| `schedule` | Seq Scan (۱۰ ردیف — بهینه) | ۰.۱ms |
| `counselor_refs` | Seq Scan (۱۰ ردیف — بهینه) | ۰.۰۷ms |
| `teacher_notes` | Seq Scan (۱۰ ردیف — بهینه) | ۰.۰۵ms |

- **Execution Time: 569ms** · **Planning: 2ms** · **Buffers: shared hit=4173** (کاملاً در cache، صفر read)
- PG به‌صورتِ خودکار **parallel query** را برای جداولِ بزرگ فعال کرد (Gather Merge + 2 workers)
- کوئری‌های داغِ مجزا: `count+sum` روی grades = **۸۶ms**، `count` روی attendance = **۲۹ms** (**Index Only Scan، Heap Fetches=0**)
- Seq Scan روی جداولِ کوچک **بهینه است، نه bug** (۱۰ ردیف در برابرِ هزینهٔ ایندکس)

---

## ۸) SCALE PROBE (LIVE PostgreSQL 16، دادهٔ SYNTHETIC چندمستأجره)

۲۰ مدرسه؛ probe school ۹۰۰۱ صاحب ۲۵٪ ردیف‌ها. داده SYNTHETIC است (تولیدِ قطعی با `generate_series`) و از PG **زنده** خوانده شد.

| سطح | probe rows | AGG p50 | AGG p95 | OLD p50 | OLD p95 | سرعت | wire | AGG RSS | OLD RSS | OLD ev-lag |
|---|---|---|---|---|---|---|---|---|---|---|
| ۵۰k | ۱۲٬۵۰۰ | ۱۱۷ms | ۱۶۸ms | ۴۷۳ms | ۴۷۳ms | **۴.۰۴×** | ۲۵۰۵۰→۱ | ~۰MB | ۱۸۳MB | ۷۲۱ms |
| ۱۰۰k | ۲۵٬۰۰۰ | ۳۰۲ms | ۳۳۰ms | ۱۲۶۰ms | ۱۲۶۰ms | **۴.۱۷×** | ۵۰۰۵۰→۱ | ۰.۹MB | ۲۴۴MB | ۱۶۴۸ms |
| ۲۵۰k | ۶۲٬۵۰۰ | ۳۹۲ms | ۴۴۱ms | ۲۴۰۶ms | ۲۴۰۶ms | **۶.۱۴×** | ۱۲۵۰۵۰→۱ | ۰.۲MB | ۲۴۶MB | ۲۷۷۴ms |
| ۵۰۰k | ۱۲۵٬۰۰۰ | ۷۱۰ms | ۷۷۳ms | ۴۵۹۲ms | ۴۵۹۲ms | **۶.۴۷×** | ۲۵۰۰۵۰→۱ | ۱.۲MB | **۸۱۳MB** | **۳۴۴۴ms** |

**یافته‌های کلیدی:**
1. **سرعت با مقیاس افزایش می‌یابد** (۴.۰۴× → ۶.۴۷×): aggregate زیرخطی رشد می‌کند، OLD تقریباً خطی.
2. **حافظهٔ aggregate ثابت است** (~۱MB در همهٔ سطوح)؛ OLD تا ۸۱۳MB.
3. **event-loop lag** در ۵۰۰k: OLD **۳.۴۴ ثانیه** — یعنی یک درخواستِ OLD کلِ سرور را ۳.۴ ثانیه متوقف می‌کند. AGGREGATE: ۶۱.۷ms (۵۶× کمتر).
4. **استفادهٔ ایندکس تأیید شد** در دادهٔ چندمستأجره (Bitmap Index Scan روی `school_id` در همهٔ سطوح).
5. **tenant isolation OK** در همهٔ ۴ سطح: `grades_analyzed` دقیقاً برابرِ حقیقتِ DB.

---

## ۹) CONCURRENCY PROBE

pool max=20، connectionTimeout=3000ms (تنظیماتِ production). دیتابیسِ ۱۰۰k.

| مسیر | c=1 | c=4 | c=10 | c=20 | c=30 | اشباع | اولین شکست |
|---|---|---|---|---|---|---|---|
| **AGGREGATE** | ۷۲۱ms ✅ | ۴۱۲ms ✅ | ۹۳۰ms ✅ | ۱۷۶۸ms ✅ | ۲۷۰۰ms ✅ **۳۰/۳۰** | c=۲۰ | **هیچ ≤۳۰** |
| **OLD** | ۱۵۸۰ms ✅ | **۰/۴ ❌** | ۱/۱۰ | ۷/۲۰ | ۲/۳۰ | **c=۴** | **c=۴** |

**OLD در c=۴ تمامِ چهار درخواست را از دست می‌دهد** (۴×۶=۲۴ > ۲۰). AGGREGATE در c=۳۰ با **صفر شکست** ۳۰/۳۰ سرو می‌کند (فقط ۱۰ در صف، همگی زیرِ timeout).

- **Throughputِ پایدار: ۹.۷۲ در برابرِ ۰.۷۷ req/s = ۱۲.۶×**
- عمقِ صف در c=۳۰: AGGREGATE ۱۰، OLD **۱۶۰**
- latency در c=۴: AGGREGATE ۴۱۲ms در برابرِ OLD **ناموفق**

---

## ۱۰) تحلیلِ READ REPLICA

هر پیشنهاد با چهار بُعدِ خواسته‌شده:

### پیشنهاد ۱: aggregate از queryRead برود ✅ (اجرا شد)
- **SOURCE OF TRUTH:** PG primary. aggregate فقط‌خواندنی است.
- **CONSISTENCY:** در صورتِ lag، خلاصه‌ها تا چند ثانیه کهنه می‌شوند — برایِ dashboard تحلیلی قابل‌قبول است (آینهٔ درون‌حافظه‌ای فعلاً همین‌طور است).
- **FAILOVER:** `queryRead` خودکار به primary برمی‌گردد (`db.js:445`)؛ replica مرده routing را متوقف و هر ۱۰s دوباره probe می‌کند.
- **STALE-READ RISK:** پایین. downgrade قابل‌قبول برایِ analytics؛ write path هرگز تحت تأثیر قرار نمی‌گیرد.

### پیشنهاد ۲: regional report از queryRead برود (ثبت شد، خارج از scope)
- `analytics.js:291` از `db.readCollection` (primary) برای ۶ مجموعه استفاده می‌کند. همان درز.
- **CONSISTENCY:** regional گزارش از آینهٔ حافظه می‌آید — تغییری در stale-read نیست.
- **FAILOVER:** یکسان.
- **STALE-READ RISK:** یکسان.
- **وضعیت:** به‌عنوان یافتهٔ مستقل ثبت شد (نقشِ M15-03 فقط مسیرِ school بود).

### پیشنهاد ۳: read replica چون اصلاً تنظیم نشده — ارزشِ عملی فعلاً صفر
- `READ_DATABASE_URL` روی این box تنظیم نشده. `queryRead` شفافاً به primary برمی‌گردد.
- **هیچ ایندکسی صرفاً برای سبز شدنِ benchmark اضافه نشد.**

---

## ۱۱) هزینهٔ SYNC

(بر اساسِ ممیزیِ کد — این مسیر در این مأموریت تغییر نکرد)

- `hydrateStoreFromPg` در boot **۸۷ کوئریِ serial** می‌زند (یک `SELECT *` بدونِ LIMIT به ازایِ هر جدول).
- **N+1 در مسیرِ write** نه read: `persistSyncBatch` حدود ۳ statement به ازایِ هر uid + ۲–۴ به ازایِ هر op + N invalidationِ fire-and-forget Redis.
- **هیچ re-syncی بعد از reconnect نیست** — `scheduleReconnect` فقط ping می‌زند و mirror را refresh نمی‌کند.

---

## ۱۲) هزینهٔ BOOTSTRAP

- **~۱۰۰ round tripِ تقریباً کاملاً serial قبل از `listen()`** (۸۷ تا hydration + ping + partition detection + authority + outbox + canary).
- `server/data/payesh.json` **۶.۸MB** در هر boot synchronous parse می‌شود، حتی در حالتِ PG — بعد با truthِ PG overwrite می‌شود.
- **boot از کلِ اندازهٔ DB است، نه از تغییرات** (`chg_id` برای mirror استفاده نمی‌شود).
- Redis فقط coordination است (epoch، lock، rate-limit، idempotency، OTP) — data replica نیست.

---

## ۱۳) ۱۵ FAILURE MODE

| # | حالت | Detection | Containment | Recovery | User impact | Data integrity |
|---|---|---|---|---|---|---|
| ۱ | pool exhaustion (analytics) | `pool.waitingCount` در `poolStats` | fail-fast در ۳۰۰۰ms | fail-soft به memory mirror با warning | خطای صریح، نه هنگ | بدون تغییر (read-only) |
| ۲ | aggregate timeout (>۱۰s) | `query_timeout` | یک کوئری، یک اتصال | fail-soft به mirror | timeout شفاف | read-only |
| ۳ | replica down | `SELECT 1` probe + error classification (`db.js:350`) | routing off + reprobe هر ۱۰s | automatic وقتی پاسخ داد | بدون افت (به primary) | read-only |
| ۴ | replica lag | **هیچ مکانیزمی موجود نیست** | — | — | dashboard کهنه | read-only |
| ۵ | replica crash (client error) | **موجود نیست بود** → اکنون `onClientError` | progress kill نمی‌شود | pool خودش connection می‌سازد | بدون افت | read-only |
| ۶ | PG primary down (boot) | `SELECT NOW()` probe | production: `process.exit(1)` | deploy مجدد | outage صریح | بدون تغییر |
| ۷ | PG primary down (runtime) | `onClientError` + metric | queue fail-fast در ۳۰۰۰ms | `scheduleReconnect` هر ۱۰s | خطای صریح | بدون تغییر |
| ۸ | schema lag (migration اجرا نشده) | `tools/migrate-ledger.js status` | degrade نرم (مثل `tombstoneTableAvailable`) | migration اجرا شود | warning در log | **ریسک: سقوطِ نرم** |
| ۹ | connection leak | بررسیِ کد: همهٔ `release()` در `finally` | — | idle timeout ۳۰s | تدریجی اشباع | بدون تغییر |
| ۱۰ | chg_id gap | sequence monoton است | bump در no-op UPDATE عمدی است | watermark دوباره همخوان می‌شود | بدون افت | event تکراری، نه از دست رفتن |
| ۱۱ | stale mirror بعد از reconnect | **موجود نیست** | — | restart لازم | **دادهٔ کهنه سرو می‌شود** | **ریسک** |
| ۱۲ | JSON parse failure در boot | throw در `loadStore` | fail-closed (`exit 1`) | restore از backup | refusal به listen | بدون تغییر |
| ۱۳ | Redis down در production | `cache.init()` | `process.exit(1)` | deploy مجدد | outage صریح | OTP در Redis است |
| ۱۴ | slow aggregate (۹.۹s) | `DB_SLOW_MS` metric فقط | **هیچ fallbackی روی کندی نیست** | timeout در ۱۰s | پاسخِ ۲۰۰ با تأخیر | read-only |
| ۱۵ | tenant cross-read | `enforceSchoolIntelligenceAccessGuard` + probe | filter در SQL (`school_id = $1`) | — | ۴۰۳ | **probe تأیید کرد: OK در ۴ سطح** |

---

## ۱۴) تصمیماتِ معماری — فقط بر اساسِ bottleneck اندازه‌گیری‌شده

| bottleneck اندازه‌گیری‌شده | تصمیم |
|---|---|
| wire transfer: ۲۵۰٬۰۵۰ ردیف → ۱ | aggregate push-down (اجرا شد) |
| ۶ اتصال به ازایِ هر درخواست | ۱ کوئری، ۱ اتصال (اجرا شد) |
| ۸۱۳MB RAM / ۳.۴s event-lag | صفر ردیف منتقل می‌شود (اجرا شد) |
| primary pool تحت فشار | `queryRead` (اجرا شد) |
| replica crash risk | `on('connect')` guard (اجرا شد) |

**معرفی نشد:** MICROSERVICES / KUBERNETES / SERVICE MESH / SHARDING / cache layer جدید. هیچ‌کدام بر اساسِ شواهد توجیه نمی‌شوند — bottleneck در **نمایشِ اشتباهِ داده‌ها در لایهٔ application** بود، نه در topology. در ۵۰۰k ردیف، PG خودش ۵۶۹ms با parallel bitmap scan کار می‌کند؛ نیاز به shard نداشت.

---

## ۱۵) انضباطِ scope

**خارج از scope ثبت شد، انجام نشد:**
- regional report مسیرِ تبدیل‌نشده (`analytics.js:291`) — نقشِ M15-03 مسیرِ school بود
- DLQ / retry → M15-06
- audit rotation / observability → M15-07
- tenant fairness → M15-09
- event-loop lag عمومی → M15-08
- F1/F3 (attendance/cases correctness) — به‌عنوان **legacy defect مستقل** ثبت شدند؛ aggregate قراردادِ صحیح را حفظ کرد ولی مسیرِ قدیمی را اصلاح نکرد

**انضباطِ تست:** هیچ تستی حذف/skip/FAIL→PASS نشد؛ mock جایگزینِ live نشد؛ NOT-RUN هرگز PASS گزارش نشد؛ synthetic صراحتاً SYNTHETIC اعلام شد.

**انضباطِ git:** فایل‌های unrelated commit نشدند. `FINAL_REPORT_FA.md`، `migrations/026*`، `cache-invalidation-events.js`، `tools/m15-outbox-capacity.js` تغییراتِ pre-existing مأموریت‌های قبل هستند — دست نخورده باقی ماندند.

**یافتهٔ pre-existing (نه از M15-03):** `docs-freeze-marker` قرمز است چون ۴۸۱ doc روی disk ولی rc44 فقط ۴۸۰ هش لیست کرده. `git diff HEAD -- docs/` خالی است — این drift قبل از این مأموریت وجود داشته. scope نیست.

**یافتهٔ pre-existing (محیطی):** `tests/a31-intelligence-semantic-integrity.js` با `password authentication failed for user "payesh"` شکست می‌خورد — کاربرِ `payesh` روی این box وجود ندارد. تمامِ ۱۹ چکِ قبل از آن سبز بود. خطای محیطی، نه محصول.

---

## ۱۶) خلاصهٔ نهایی تغییرات

| فایل | تغییر |
|---|---|
| `server/analytics/school-aggregates.js` | **جدید** (۲۹۲ خط) — کوئریِ تجمیعیِ واحد |
| `server/analytics/school-intelligence-center.js` | +۵۲/-۱۲ — استخراجِ `assembleSchoolIntelligenceSnapshot` |
| `server/routes/analytics.js` | +۷۷/-۴۲ — wiring + fail-soft |
| `server/db.js` | +۱۲ — `readPool.on('connect')` crash guard |
| `tests/m15-03-aggregate-sql.js` | **جدید** — ۵۸/۵۸ ساختاری |
| `tests/m15-03-aggregate-pg.js` | **جدید** — ۴۷/۴۷ parity زنده |

**اصلاحِ هارنسِ تست (شفاف‌سازی):** هر دو suite جدید، خطِ خلاصه را `${pass}/${pass}` چاپ می‌کردند که در صورتِ شکست متناقض بود (مثلاً «۵۵/۵۵ موفق، ۳ ناموفق»). این نقص **هرگز false-green تولید نمی‌کرد** — exit code و شمارشِ `fail` همیشه درست بودند — ولی خلاصهٔ چاپی گمراه‌کننده بود. هر دو به `${pass}/${pass + fail}` اصلاح شدند.

**آمادهٔ verification:** تمامِ probeها با دادهٔ SYNTHETIC روی PostgreSQL 16 زنده اجرا شدند. داده‌ها با `node /tmp/m1503-scale-seed.js <LEVEL>` قابلِ بازتولید هستند.

---

## رأی نهایی: **FIXED-SCOPED**

هدفِ مأموریت (aggregate push-down روی مسیرِ school-intelligence) **کاملاً انجام و تأیید شد**: درستی با ۱۰۵ assertion اثبات، کارایی ۴-۶.۴۷×، اشباع از c=۴ به c=۲۰+، ۸۱۳MB → ۱.۲MB. چهار legacy defect (F1-F4) با شواهد طبقه‌بندی و **کپی نشدند**. دو اصلاحِ جانبی (queryRead routing، replica crash guard) درونِ scope بودند و regression-clean هستند. هفت یافتهٔ خارج از scope (regional report، boot O(n)، stale mirror، no queue cap، replica lag detection، docs drift، a31 env) به‌صورتِ مستقل ثبت شدند.

**چیزی که هنوز باز است:** F1 و F3 به‌اصالتِ خودشان bugهای مسیرِ قدیمی هستند که aggregate آن‌ها را اصلاح کرد، ولی مسیرِ قدیمی (fallback) هنوز آنها را دارد. این‌ها legacy defect هستند که تعمیرشان scopeِ این مأموریت نبود.
