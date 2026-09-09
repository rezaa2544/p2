# نقشه راه جامع مهندسی «پایش» تا آمادگی مقیاس ملی

> این سند مکمل الزامات معماری ملی است و اجرای Waves بدون رعایت آن مجاز نیست.

**هدف:** تبدیل پایش به سامانه مدیریت مدرسه پایدار، سریع، امن، قابل نگهداری و مقیاس‌پذیر برای جمعیت بسیار بزرگ دانش‌آموزان، معلمان و اولیا.

## 1. تعریف هدف
«کاربر نامحدود» از نظر فنی وجود ندارد. هدف واقعی: **مقیاس‌پذیری افقی، ظرفیت قابل اندازه‌گیری و افزایش ظرفیت بدون تغییر معماری**. معیار موفقیت فقط تعداد کاربران ثبت‌شده نیست؛ باید Registered Users، DAU، Peak Concurrent، RPS، Writes/sec، DB TPS و Sync Rate اندازه‌گیری شوند.

اصل پایداری:
> هیچ failure شناخته‌شده‌ای نباید باعث از دست رفتن داده، نشت داده، corruption یا توقف کنترل‌نشده شود؛ failure ناشناخته باید با telemetry، alerting، isolation و recovery قابل تشخیص و مهار باشد.

---

# 2. معماری هدف

```text
Internet
  ↓
DNS / CDN / WAF / DDoS / TLS
  ↓
Load Balancer
  ↓
API #1 ... API #N  ← Stateless
  ↓
Service / Policy Layer
  ├── PostgreSQL = Source of Truth
  ├── Redis = Cache + Distributed Ephemeral State
  └── Outbox / Queue
          └── Workers → SMS / Notification / Report / Analytics

Browser
  └── UI + bounded cache + IndexedDB offline queue + Sync
```

**قانون:** در Production فقط PostgreSQL منبع حقیقت داده‌های اصلی باشد. JSON/in-memory store نباید source of truth باشد. Browser نباید دیتاست ملی را نگه دارد.

---

# 3. Wave 0 — Baseline و Freeze

- نسخه فعلی tag شود و commit مبنا ثبت شود.
- همه تست‌های فعلی اجرا و نتیجه ثبت شود.
- CPU/RAM/heap/event-loop latency ثبت شود.
- latency و حجم پاسخ endpointهای اصلی اندازه‌گیری شود.
- queryهای DB، cache hit/miss و sync throughput اندازه‌گیری شود.
- dependency و deployment inventory ساخته شود.

**خروجی:** `docs/NATIONAL_BASELINE.md`

---

# 4. Wave 1 — PostgreSQL به عنوان Source of Truth [P0]

این مهم‌ترین کار است.

### کارها
1. تمام read/write pathهای فعلی را inventory کن.
2. تمام readهای Production را به PostgreSQL منتقل کن.
3. writeها را transaction-based کن.
4. `store` را از مسیر production data خارج کن.
5. persistence دوره‌ای JSON را از Production حذف کن.
6. migration داده فعلی به PostgreSQL را repeatable کن.
7. دو API instance را با یک DB تست کن:
   `write A → read B → update B → read A`

**Acceptance:** همه instanceها state واحد را از DB ببینند.

---

# 5. Wave 2 — Database Engineering

## Migration
ساختار versioned ایجاد شود:

```text
migrations/
001_initial.sql
002_indexes.sql
003_constraints.sql
...
```

Migration باید immutable، تست‌شده و قابل rollback/forward-recovery باشد.

## Constraints
برای invariantهای مهم از:
- PK
- FK
- UNIQUE
- composite UNIQUE
- CHECK
- NOT NULL

استفاده شود.

## ID
`max(id)+1` حذف شود؛ از PostgreSQL Identity یا UUID/ULID استفاده شود.

## Transactions
عملیات چندمرحله‌ای در transaction انجام شوند:

```text
BEGIN
  business changes
  audit
  outbox event
COMMIT
```

## OCC
برای داده‌هایی مثل grade/attendance:

```sql
UPDATE ...
WHERE id = $id AND version = $base_version
```

صفر row → `409 Conflict`.

---

# 6. Wave 3 — Query و Performance [P0]

هر endpoint پرترافیک باید DB-native باشد.

### ممنوع
```text
load all
filter in JS
sort in JS
slice
```

### مجاز
```text
SQL WHERE
SQL ORDER BY
INDEX
LIMIT
cursor
```

برای queryهای مهم `EXPLAIN ANALYZE` و benchmark قبل/بعد اجباری است.

## Pagination
Cursor/keyset واقعی:

```text
GET /students?cursor=...
```

و cursor پایدار بر اساس کلید ترکیبی مناسب، مثلاً `(updated_at,id)`.

## Index
Index فقط بر اساس workload و query plan واقعی ایجاد شود.

---

# 7. Wave 4 — Sync / A01


A01 حفظ شود اما database-native شود.

### Pull
به جای scan کل store:

```sql
WHERE updated_at > $since
  AND scope_condition
ORDER BY updated_at,id
LIMIT $limit
```

Delta باید در برابر timestamp برابر، pagination boundary و clock skew مقاوم باشد.

### Tombstone
جدول/ساختار استاندارد:

```text
entity
record_id
deleted_at
scope
version
```

Retention مشخص شود و قبل از حذف tombstone امکان full resync وجود داشته باشد.

### Push
- validation
- authorization
- idempotency
- OCC
- transaction

در یک مسیر استاندارد انجام شود.
ید مشخص شود:

```text
RPO = حداکثر داده قابل از دست رفتن
RTO = حداکثر زمان recovery
```

و داشته باشیم:

```text
Backup
Off-site copy
Encryption
PITR
Restore test
Failover test
Runbook
```

Backup داشتن بدون restore drill کافی نیست.

---

# 20. Wave 17 — Testing Pyramid

تست‌ها:

```text
Unit
Integration
Contract
E2E
Security
Concurrency
Load
Stress
Spike
Soak
Chaos
Recovery
```

تست‌های موجود باید حفظ شوند و ضعیف/حذف نشوند.

---

# 21. Wave 18 — National Load Testing

10M registered user به تنهایی کافی نیست.

Dataset آزمایشی باید شامل:

```text
10M users
schools
classes
enrollments
attendance
grades
messages
notifications
audit/events
```

با نسبت‌های نزدیک به workload واقعی باشد.

سپس اندازه‌گیری:

```text
API RPS
writes/sec
DB TPS
Redis ops/sec
sync records/sec
p50/p95/p99
CPU
RAM
network
```

سناریوهای اجباری:

### Load
بار عادی و peak

### Stress
افزایش بار تا نقطه failure

### Spike
افزایش ناگهانی بار

### Soak
چند روز اجرای مداوم برای کشف:
- memory leak
- connection leak
- queue growth
- cache growth
- GC degradation
- DB bloat

---

# 22. Wave 19 — Chaos / Failure Testing

عمداً تست شود:

```text
kill API instance
Redis outage
slow Redis
slow DB
DB connection exhaustion
network degradation
queue outage
disk full
certificate expiry
bad deployment
database failover
```

برای هر failure:

```text
Detect
→ Alert
→ Contain
→ Recover
→ Verify data integrity
```

---

# 23. Wave 20 — چهار Arena

## Arena 1 — Database/Core
مالک:
```text
PostgreSQL
schema
migrations
queries
indexes
transactions
OCC
```

## Arena 2 — Security
مالک:
```text
Auth
RBAC
Tenant isolation
session
rate limiting
security tests
```

## Arena 3 — Sync/Offline
مالک:
```text
A01
Pull/Push
tombstone
cursor
offline queue
conflict resolution
IndexedDB
```

## Arena 4 — Performance/Infra
مالک:
```text
Redis
cache
workers
observability
load tests
deployment
```

---

# 24. قرارداد اجباری گزارش هر Arena

هر Arena بعد از هر task باید بدهد:

```text
TASK:
FILES CHANGED:
WHY:
ARCHITECTURAL IMPACT:
DATABASE IMPACT:
SECURITY IMPACT:
PERFORMANCE IMPACT:
NEW TESTS:
ALL TEST RESULTS:
KNOWN LIMITATIONS:
MIGRATION REQUIRED:
ROLLBACK PLAN:
COMMIT:
```

---

# 25. قوانین جلوگیری از خراب شدن معماری

هیچ Arena مجاز نیست:

- Data Layer را دور بزند.
- مستقیم `fetch`/`localStorage` را خارج از قرارداد پروژه اضافه کند.
- authorization مستقل و موازی بسازد.
- schema را بدون migration تغییر دهد.
- production fallback حافظه‌ای برای state حیاتی بسازد.
- business logic تکراری ایجاد کند.
- تست را برای سبز شدن ضعیف یا حذف کند.
- فقط برای افزایش سرعت cache بدون benchmark اضافه کند.
- دو source of truth ایجاد کند.

---

# 26. Definition of Done

هر تغییر مهم زمانی Done است که:

```text
Code
+ Tests
+ Security
+ Performance impact
+ Migration impact
+ Observability
+ Documentation
```

بررسی شده باشد.

---

# 27. Production Readiness Gate

## Data
- [ ] PostgreSQL تنها Source of Truth
- [ ] transactions
- [ ] constraints
- [ ] migrations
- [ ] OCC
- [ ] tombstones

## Security
- [ ] centralized authorization
- [ ] tenant isolation
- [ ] secret management
- [ ] SAST/DAST/SCA
- [ ] penetration testing
- [ ] abuse protection

## Performance
- [ ] SQL pagination
- [ ] indexed queries
- [ ] no whole-store serialization
- [ ] no request-path sync disk I/O
- [ ] cache strategy

## Distributed
- [ ] stateless API
- [ ] Redis distributed state
- [ ] idempotency
- [ ] graceful shutdown

## Reliability
- [ ] HA database
- [ ] backup
- [ ] PITR
- [ ] restore drill
- [ ] failover drill
- [ ] RPO/RTO

## Observability
- [ ] metrics
- [ ] logs
- [ ] traces
- [ ] dashboards
- [ ] alerts

## Testing
- [ ] integration
- [ ] concurrency
- [ ] load
- [ ] stress
- [ ] spike
- [ ] soak
- [ ] chaos
- [ ] recovery

---

# 28. Anti-patternهای ممنوع

### 1
```text
PostgreSQL اضافه شود ولی store باقی بماند
```
= دو source of truth.

### 2
```text
Redis برای پوشاندن query بد
```

### 3
```text
افزایش RAM به جای scale-out
```

### 4
```text
Kubernetes قبل از stateless architecture
```

### 5
```text
catch کردن خطا و سکوت
```

### 6
```text
سبز کردن تست با تغییر تست
```

---

# 29. SLO اولیه برای benchmark

برای endpointهای حیاتی می‌توان به صورت اولیه benchmark را با این اهداف شروع کرد:

```text
p50 < 100ms
p95 < 300ms
p99 < 1s
5xx < 0.1%
```

این اعداد هدف اولیه تست هستند و باید پس از capacity model رسمی نهایی شوند.

---

# 30. اسناد اجباری پایان پروژه

```text
docs/
  NATIONAL_ARCHITECTURE.md
  NATIONAL_BASELINE.md
  DATABASE_ARCHITECTURE.md
  AUTHORIZATION_MODEL.md
  SYNC_PROTOCOL.md
  DISASTER_RECOVERY.md
  SECURITY_MODEL.md
  OBSERVABILITY.md
  CAPACITY_MODEL.md
  LOAD_TEST_PLAN.md
  LOAD_TEST_RESULTS.md
  PRODUCTION_RUNBOOK.md
  INCIDENT_RESPONSE.md
  MIGRATION_GUIDE.md
```

---

# 31. ترتیب اجرای قطعی

```text
1. Baseline
2. PostgreSQL Source of Truth
3. DB reads/writes/transactions
4. Migrations + constraints + IDs
5. Unified authorization + tenant isolation
6. DB-native Pull/Push
7. Redis distributed state
8. Idempotency + OCC
9. SQL pagination/index/query optimization
10. Async workers/outbox
11. Offline queue hardening
12. HA + Backup + PITR + Restore
13. Observability
14. Deployment hardening
15. Security verification
16. 10M realistic dataset
17. Load + Stress + Spike + Soak
18. Chaos + Recovery
19. Final architecture/security/performance sign-off
20. Go-Live
```

**ترتیب را جابه‌جا نکنید مگر با Architecture Review.**

---

# 32. معیار نهایی GO / NO-GO

## NO-GO اگر:
- PostgreSQL source of truth نیست.
- state بین instanceها متفاوت است.
- full scan در مسیر پرترافیک وجود دارد.
- persistence failure silently موفق اعلام می‌شود.
- authorization بین endpointها متفاوت است.
- tenant isolation اثبات نشده.
- Redis critical state fallback محلی دارد.
- restore تست نشده.
- load/soak test واقعی انجام نشده.
- observability ناکافی است.
- recovery اثبات نشده.

## GO اگر:
تمام blockerهای بالا رفع شده باشند و functional، security، integration، concurrency، load، stress، spike، soak و recovery با acceptance criteria رسمی پروژه پاس شوند.

---

# 33. نتیجه مهندسی

پایش برای رسیدن به National Scale نیازمند «افزایش منابع» صرف نیست؛ باید به معماری زیر برسد:

```text
PostgreSQL
= authoritative data

Redis
= distributed ephemeral state/cache

Browser
= bounded local cache + offline queue

API
= stateless

Workers
= asynchronous heavy operations

Authorization
= centralized + tenant-aware

Observability
= metrics + logs + traces

Reliability
= HA + backup + PITR + tested recovery

Capacity
= proven by realistic load testing
```

هدف نهایی «تست سبز» نیست؛ هدف **اثبات ظرفیت، امنیت، درستی داده، پایداری و recovery با آزمایش واقعی** است.

---

## پیوست: وضعیت فاز ۵ (E) — تکمیل‌شده‌ها (از roadmap قدیمی، دور ۱۰۳–۱۰۴)

> یادداشتِ ریبیسِ دور ۱۱۲: این جدول از roadmapِ قدیمی (نسخهٔ `2a2b74f`)
> به این سندِ مهندسی منتقل شد تا وضعیتِ تکالیفِ فازِ E گم نشود.

| # | کار | مسئول | وضعیت |
|---|-----|-------|-------|
| E.1 | نمره‌ی عملی/کارگاهی هنرستان — قسمت‌های تئوری/عملی | چت ۳ | ✅ کامل (دور ۱۰۳) |
| E.2 | ثبت ساعت کارآموزی هنرستان | چت ۳ | ⏳ |
| E.3 | گیمیفیکیشن رفتاری برای دبستان | چت ۳ | ⏳ |
| E.4 | مدیریت کتابخانه‌ی مدرسه | چت ۱ | ⏳ |
| E.5 | مدیریت اموال/انبار مدرسه | چت ۱ |  |
| E.6 | تولید خودکار برنامه‌ی هفتگی | چت ۳ | ⏳ |
| E.7 | گردش کار امتحانات شهریور/تجدیدی | چت ۲ | ⏳ |
| E.8 | کلاس‌های تابستانی (ماژول سبک) | چت ۲ | ⏳ |
| E.9 | مدیریت مراجعین (Visitor Management) | چت ۱/۳ | ✅ کامل (دور ۱۰۴) |
| E.10 | شاخص «سلامت مدرسه» (G.1 – کدنویسی) | چت ۴ | ⏳ |
| E.11 | پایگاه دانش برای کاربر نهایی (USER_GUIDE) | چت ۳ | ⏳ |
| E.12 | صفحه‌ی وضعیت عمومی سرویس | چت ۲ | ⏳ |
| B.3 | PG منبعِ حقیقت — Wave 1 بخش ۲ (انتقالِ Writes + تراکنش‌ها) | چت ۳ | ✅ کامل (دور ۱۰۵ — اسنکواری در `docs/WAVE1_WRITES_INVENTORY.md`) |
| B.4 | PG/Redis: Wave 6 — Audit و تکمیلِ Distributed State (OTP/rate-limit/revocation/idempotency/cache/lock) | چت ۳ | ✅ کامل (`docs/WAVE6_REDIS_AUDIT.md`) |
| B.5 | کشینگ: Wave 11 — TTL، invalidation، stampede protection (Cache Hierarchy) | چت ۳ | ✅ کامل (دور ۱۱۱ — `docs/WAVE11_CACHE_STRATEGY.md`) |
