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

---

# 8. Wave 5 — Authorization و Tenant Isolation [P0]

REST و Sync نباید policyهای جدا داشته باشند.

مدل واحد:

```text
Identity
 ↓
Role
 ↓
Tenant Scope
 ↓
Resource
 ↓
Operation
 ↓
Field Policy
```

ساختار scope:

```text
National
 └── Province
      └── District
           └── School
                └── Class
```

Teacher فقط به کلاس/درس/دانش‌آموزی دسترسی داشته باشد که واقعاً به او assign شده است.

Parent فقط childهای مجاز را ببیند.

هیچ resource ID به تنهایی authorization محسوب نشود.

Self-update نیز فقط allowlist فیلدهای مجاز را قبول کند.

---

# 9. Wave 6 — Redis و Distributed State [P0]

Redis برای:

```text
OTP
rate limit
session/revocation
idempotency
cache
distributed coordination
```

استفاده شود.

برای state حیاتی:

```text
Redis down → production instance not ready
```

و fallback حافظه‌ای وجود نداشته باشد.

## Lock
از primitive اتمیک مانند:

```text
SET key token NX EX ttl
```

استفاده شود و release مالکیت token را بررسی کند.

## OTP
`otp.json` و local-memory state حذف و Redis با TTL استفاده شود.

## Idempotency
برای mutationهای مهم:

```text
principal + operation + idempotency_key
```

ثبت شود تا retry باعث duplicate نشود.

---

# 10. Wave 7 — Offline-first

Offline-first یکی از نقاط قوت پایش است و حفظ شود.

مدل هدف:

```text
Server authoritative
      ↓
bounded local cache
      ↓
offline queue
      ↓
sync
```

Queue دارای:
- max operations
- max bytes
- max age
- retry limit
- dead-letter/conflict state

باشد.

هیچ full national dataset به browser منتقل نشود.

---

# 11. Wave 8 — Async Architecture

کارهای غیرضروری برای پاسخ فوری از request path خارج شوند:

```text
SMS
Email
Push
Notifications
Reports
Exports
Analytics
Heavy audit fan-out
```

مدل:

```text
API
 ↓
DB transaction + outbox
 ↓
Queue
 ↓
Worker
```

هدف جلوگیری از lost events و duplicate side effects است.

---

# 12. Wave 9 — Application Performance

از request path حذف شود:

```text
JSON.stringify(whole store)
synchronous file I/O
large array filter/sort
full backup
heavy report generation
```

Audit logging باید asynchronous/centralized شود.

Backup نباید داخل application request process انجام شود.

L1 cache باید bounded + TTL + eviction داشته باشد.

---

# 13. Wave 10 — Database Scale

ابتدا:

```text
PostgreSQL Primary
+ correct indexes
+ pool limits
+ backup
```

بعد در صورت نیاز:

```text
Read Replicas
```

و سپس با benchmark:

```text
Partitioning
```

نامزدهای partitioning معمولاً داده‌های حجیم و time-oriented مانند attendance، audit، notification/event و sync history هستند؛ partition key باید از workload واقعی انتخاب شود.

PostgreSQL برای high availability، streaming replication، hot standby و failover سازوکارهای رسمی دارد و انتخاب معماری HA باید بر اساس RPO/RTO باشد.

---

# 14. Wave 11 — Cache

Hierarchy:

```text
Browser
 ↓
CDN
 ↓
Redis
 ↓
PostgreSQL
```

Cache باید:
- TTL
- invalidation
- max size
- stampede protection

داشته باشد.

برای hot keys از single-flight/locking یا stale-while-revalidate متناسب با نوع داده استفاده شود.

---

# 15. Wave 12 — Network / Edge

Production:

```text
DNS
→ CDN
→ WAF
→ Load Balancer
→ Stateless API
```

اجباری:
- TLS
- HSTS
- security headers
- request size limits
- timeouts
- compression
- rate limiting
- origin protection
- DDoS strategy

WAF جای authorization برنامه را نمی‌گیرد.

---

# 16. Wave 13 — Security Program

امنیت باید فراتر از security.js باشد.

بررسی:

```text
Authentication
Authorization
Session
Tenant Isolation
Input Validation
Output Encoding
XSS
Injection
IDOR/BOLA
CSRF where applicable
Secrets
Cryptography
API abuse
Rate limits
File handling
Audit
Supply chain
Infrastructure
```

برای baseline رسمی می‌توان OWASP ASVS را مبنا قرار داد؛ نسخه پایدار فعلی ASVS 5.0.0 است.

CI:
- SAST
- DAST
- dependency/SCA scan
- secret scan
- SBOM
- lockfile/dependency policy

---

# 17. Wave 14 — Observability

حداقل سه signal:

```text
Metrics
Logs
Traces
```

OpenTelemetry چارچوب vendor-neutral برای traces، metrics و logs است.

Metrics:
```text
RPS
p50/p95/p99
4xx/5xx
DB latency
DB pool wait
DB connections
Redis latency/errors
cache hit rate
sync queue depth
sync conflicts
OTP/login abuse
event-loop lag
heap
GC
CPU
memory
```

داشبورد و alerting برای همه موارد بحرانی ساخته شود.

---

# 18. Wave 15 — Health / Deployment

Endpoints:

```text
/liveness
/readiness
/health
```

تفاوت آنها رعایت شود.

Graceful shutdown:

```text
stop traffic
→ finish in-flight requests
→ stop workers
→ flush telemetry
→ close DB/Redis
```

Deployment:
- immutable image
- config خارج code
- rolling deployment
- برای تغییرات پرریسک canary یا blue/green

Kubernetes در صورت انتخاب می‌تواند با HPA ظرفیت workload را بر اساس resource یا custom metrics تغییر دهد، اما orchestration بعد از stateless شدن application و اصلاح معماری انجام شود.

---

# 19. Wave 16 — Disaster Recovery

باید مشخص شود:

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
