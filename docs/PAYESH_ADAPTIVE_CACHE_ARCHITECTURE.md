# PAYESH — Adaptive Cache Management Architecture (PACMA)

**وضعیت:** PROPOSED / ARCHITECTURE-DESIGN TRACK  
**Mission:** M15-CACHE-ARCHITECTURE  
**Baseline HEAD:** `ae78f34fdf39fdc762505da9363119a8168fe781`  
**هدف مقیاس:** 10M+ users  
**مالک تصمیم:** ChatGPT Control Plane  
**طراح/اجراکننده:** Atria  
**راستی‌آزما:** Hermes  

---

## 1. مسئله معماری

Payesh در HEAD فعلی یک Cache Layer قابل‌توجه دارد، اما سیاست مدیریت کش به‌صورت یک معماری واحد و workload-aware هنوز تثبیت نشده است.

قابلیت‌های موجود شامل L1 memory، L2 Redis، LRU/TTL، single-flight، epoch validation، school index، Pub/Sub invalidation و M14-B01 pending invalidation است.

**شکاف معماری:** وجود اجزای خوب، بدون یک control layer واحد که برای هر نوع داده تعیین کند:
- چه چیزی cache شود؛
- کجا cache شود؛
- با چه TTL؛
- چه زمانی invalidate شود؛
- چگونه در outage/recovery رفتار کند؛
- consistency مورد نیاز چیست؛
- write strategy چیست؛
- چه زمانی cache bypass شود؛
- و چه میزان بار باید از PostgreSQL برداشته شود.

هدف PACMA حل این شکاف است، نه صرفاً افزودن یک Redis یا افزایش TTL.

---

## 2. اهداف اصلی

### اهداف عملکردی
1. کاهش p50/p95/p99 latency مسیرهای read-heavy.
2. کاهش QPS و connection pressure روی PostgreSQL.
3. کاهش CPU/event-loop pressure روی application nodes.
4. جلوگیری از cache stampede.
5. استفاده حداکثری از L1 برای داده‌های مناسب.
6. استفاده کنترل‌شده از L2 برای اشتراک بین instanceها.
7. تحمل Redis outage بدون سرو stale data.
8. recovery سریع و deterministic پس از Redis recovery.
9. جلوگیری از memory growth و hot-key collapse.
10. فراهم‌کردن capacity path برای 10M+ users بدون فرض ظرفیت اثبات‌نشده.

### اهداف correctness
1. PostgreSQL/SoT برای داده‌های authoritative باقی می‌ماند.
2. tenant isolation هرگز با cache bypass نمی‌شود.
3. authorization decision از cache داده‌ای نامعتبر تغذیه نمی‌شود.
4. داده حساس با stale policy نامناسب سرو نمی‌شود.
5. invalidation باید idempotent و قابل‌ردیابی باشد.
6. failure نباید به false-green یا healthy-looking stale state تبدیل شود.

---

## 3. اصول معماری

### P1 — SoT separation
Cache هیچ‌گاه Source of Truth نیست مگر یک تصمیم معماری صریح و ثبت‌شده برای یک workload غیرحساس.

### P2 — Policy over implementation
Serviceها نباید هرکدام الگوی cache مستقل اختراع کنند. سیاست از Cache Policy Registry می‌آید.

### P3 — Correctness before hit-rate
افزایش hit-rate اگر باعث stale/unauthorized data شود شکست معماری محسوب می‌شود.

### P4 — Cache only what earns its cost
هر داده‌ای شایسته cache نیست. admission باید بر اساس frequency، cost، size، volatility و sensitivity تصمیم بگیرد.

### P5 — Failure-aware by design
Redis down، restart، network partition، delayed Pub/Sub و node loss باید در طراحی اولیه دیده شوند.

### P6 — No universal strategy
Cache-Aside، Read-Through، Write-Through و Write-Behind ابزارهای انتخابی‌اند؛ هیچ‌کدام default جهانی نیست.

### P7 — Durable invalidation for critical correctness
pending invalidation صرفاً process-local راه‌حل نهایی نیست. برای invariantهای حیاتی، durable mechanism لازم است.

### P8 — Bounded memory
L1، pending queues، indexes و admission structures باید سقف، eviction و observability داشته باشند.

### P9 — Current-head evidence
هر ادعای performance/capacity باید measured و به SHA/محیط/سناریو متصل باشد.

---

## 4. معماری هدف

```
                         ┌─────────────────────┐
                         │ API / Service Layer  │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   PACMA Orchestrator │
                         │ Cache Policy Engine  │
                         └──────────┬──────────┘
                                    │
             ┌──────────────────────┼──────────────────────┐
             │                      │                      │
             ▼                      ▼                      ▼
       READ PATH               WRITE PATH           INVALIDATION
             │                      │                      │
       ┌─────┴─────┐          ┌─────┴─────┐        ┌─────┴────────┐
       │ L1 Memory │          │ DB-first   │        │ Durable      │
       │ LRU/TTL   │          │ / Through │        │ Invalidation  │
       └─────┬─────┘          └─────┬─────┘        │ Outbox/Queue  │
             │ miss                 │              └─────┬────────┘
             ▼                      ▼                    │
       ┌─────────────┐        PostgreSQL                ▼
       │ L2 Redis    │               │          Pub/Sub / Workers
       └──────┬──────┘               │                    │
              │ miss                 │                    │
              └──────────────┬───────┘                    │
                             ▼                            │
                        PostgreSQL ◄──────────────────────┘
                         Source of Truth
```

---

## 5. Read Architecture

### 5.1 Default: Multi-Level Cache-Aside

برای workloadهای عمومی:

```
Request
  ↓
L1
  ├─ HIT → response
  └─ MISS
       ↓
      L2
       ├─ HIT → populate L1 → response
       └─ MISS
            ↓
           DB
            ↓
         populate L2
            ↓
         populate L1
            ↓
         response
```

### 5.2 Read-Through

Read-Through فقط برای workloadهایی فعال شود که:
- source مشخص؛
- serialization قراردادی؛
- invalidation مشخص؛
- consistency قابل‌قبول؛
- و benefit اندازه‌گیری‌شده دارند.

هدف Read-Through در PACMA حذف تکرار منطق cache از serviceهاست، نه مخفی‌کردن failure.

---

## 6. Write Architecture

### 6.1 Critical authoritative data

پیش‌فرض:

```
Application
   ↓
PostgreSQL transaction
   ↓
Durable invalidation/outbox
   ↓
Cache invalidation/update
```

نمونه‌ها:
- role/permission
- school membership
- student-sensitive records
- grades
- financial state
- authorization-related state

### 6.2 Write-Through

برای داده‌هایی که cache representation باید هم‌زمان با write حفظ شود، فقط پس از benchmark و consistency review.

### 6.3 Write-Behind

Write-Behind **opt-in و ممنوع برای authoritative security/data-integrity state** مگر Architecture Review صریحاً خلاف آن را تصویب کند.

مناسب بالقوه:
- counters
- analytics aggregates
- derived metrics
- non-critical materialized views

الزامات:
- durable queue
- retry
- idempotency
- ordering contract
- backpressure
- loss/replay policy
- reconciliation job

---

## 7. Cache Policy Registry

هر cacheable dataset باید policy صریح داشته باشد:

```js
{
  keyspace,
  strategy,              // cache-aside | read-through | write-through | write-behind
  l1,
  l2,
  ttl,
  ttlJitter,
  maxObjectSize,
  admission,
  consistency,
  invalidationScope,     // user | school | collection | global
  staleWhileRevalidate,
  negativeCaching,
  singleFlight,
  failureMode,           // fail-closed | bypass-cache | bounded-stale
  sensitivity,
  observability
}
```

هیچ service نباید بدون policy مشخص cache جدید معرفی کند.

---

## 8. Admission / Eviction

PACMA باید از cache کردن داده‌های کم‌ارزش جلوگیری کند.

Admission inputs:
- request frequency
- DB cost
- response size
- volatility
- hotness
- tenant distribution
- sensitivity
- regeneration cost

Eviction:
- LRU پایه
- TTL
- size bound
- hot-key protection
- per-tenant quotas در صورت نیاز

---

## 9. Stampede / Hot-Key Protection

الزامات:

- single-flight per key
- bounded concurrency
- TTL jitter
- request coalescing
- hot-key detection
- optional stale-while-revalidate برای داده‌های مجاز
- negative caching فقط برای پاسخ‌های امن و کوتاه‌عمر

هیچ stale-while-revalidate برای authorization-sensitive state بدون proof مجاز نیست.

---

## 10. Invalidation Architecture

### سطح 1 — Local
L1 invalidation در همان process.

### سطح 2 — Distributed
Redis Pub/Sub یا مکانیزم توزیع‌شده معادل.

### سطح 3 — Durable
برای invariantهای حیاتی:

```
DB Transaction
      ↓
Transactional Outbox
      ↓
Invalidation Worker
      ↓
Redis / Distribution
      ↓
All application nodes
```

این مسیر باید idempotent، retryable و observable باشد.

> **وضعیت (۲۰۲۶-۱۰-۰۴): سطح ۳ پیاده‌سازی و رویِ PG/Redis زنده verify شد.** رویدادهای `cache.user_changed` / `cache.school_changed` / `cache.collection_changed` در `server_outbox` نوشته می‌شوند و هر instance آن‌ها را برای L1/L2 خودش بازپخش می‌کند. سه ویژگیِ الزامیِ بالا اکنون دارایِ تستِ واقعی هستند: idempotency (F6)، retry/DLQ (F15)، observability (۶ metric، بخش ۱۳). جزئیات در `m15-cache-durable-invalidation/`.

### M14-B01 lesson

`pendingInvalidations` فعلی یک safety mechanism مفید است، اما process-local بودن آن NF-1 است و **راه‌حل نهایی multi-instance durability نیست**.

> **رفع (۲۰۲۶-۱۰-۰۴): NF-1 بسته شد.** مسیرِ دوام‌دارِ بالا (`server_outbox` + per-instance watermark در PG) اکنون همان ضمانتی را می‌دهد که `pendingInvalidations` فقط به‌صورتِ تک‌نمونه‌ای می‌داد. `pendingInvalidations` به‌عنوانِ safety mechanism محلی **حفظ شد** و حذف نشد — حالا لایهٔ آخرِ دفاعی است، نه تنها لایهٔ تنها.

---

## 11. Failure Matrix

| Failure | رفتار هدف |
|---|---|
| L1 miss | L2 را بررسی کن |
| L2 miss | DB را بخوان |
| Redis unavailable | برای critical data stale سرو نشود |
| Redis recovery | invalidations replay شوند |
| Pub/Sub loss | durable invalidation مسیر جایگزین باشد |
| application restart | L1 پاک شود؛ correctness حفظ شود |
| hot key | single-flight/coalescing |
| cache corruption | validate → evict → rebuild |
| queue backlog | backpressure + alert |
| invalidation backlog | bounded escalation |
| DB unavailable | فقط workloadهای صریحاً مجاز می‌توانند bounded-stale باشند |
| tenant ambiguity | fail-closed |

---

## 12. Multi-Tenant Safety

Cache key باید tenant scope را به‌صورت صریح و غیرقابل‌ابهام encode کند.

نمونه:

`payesh:v1:tenant:{tenant}:school:{school}:user:{user}:resource:{id}`

اما key format به‌تنهایی authorization نیست.

هر cache read باید با contract مربوط به ownership/scope سازگار باشد.

---

## 13. 10M+ Scale Strategy

برای 10M+ کاربر، scale فقط با بزرگ‌کردن Redis حاصل نمی‌شود.

PACMA باید ظرفیت را در این لایه‌ها توزیع کند:

```
Traffic
  ↓
Edge / Load Balancer
  ↓
Stateless App Fleet
  ↓
L1 local cache
  ↓
Redis L2 cluster/shards
  ↓
Read replicas / PostgreSQL topology
  ↓
Durable queues/outbox
```

### اصل مهم

L1 باید بیشترین readهای بسیار پرتکرار را جذب کند تا Redis و DB به bottleneck تبدیل نشوند.

L2 باید shared-cache workload را جذب کند.

PostgreSQL باید عمدتاً برای:
- authoritative reads
- writes
- cache misses
- queries با ارزش پایین برای cache

استفاده شود.

---

## 14. Capacity Model

قبل از ادعای «۱۰ میلیون» باید اندازه‌گیری شود:

- DAU
- peak concurrent users
- requests/user
- cacheable request ratio
- L1 hit ratio
- L2 hit ratio
- DB miss ratio
- average object size
- Redis memory/object overhead
- invalidation rate
- hot-key distribution
- PostgreSQL QPS
- connection pool utilization
- p50/p95/p99
- CPU
- RSS/heap
- event-loop lag
- network bandwidth

مدل ظرفیت باید از این اعداد استخراج شود، نه از تعداد کاربران به‌تنهایی.

---

## 15. Observability

حداقل metrics:

```
cache_requests_total
cache_hits_total
cache_misses_total
cache_hit_ratio
cache_l1_hit_ratio
cache_l2_hit_ratio
cache_fill_total
cache_evictions_total
cache_invalidations_total
cache_invalidation_lag
cache_pending_invalidations
cache_replay_total
cache_stampede_prevented
cache_hot_keys
cache_object_size
cache_backend_latency
cache_stale_served_total
cache_bypass_total
```

و برای هر metric باید cardinality bounded باشد.

---

## 16. Performance Targets — هنوز NOT VERIFIED

این اعداد فعلاً **هدف معماری‌اند، نه ادعای ظرفیت فعلی**:

- L1 hit: sub-millisecond target
- L2 hit: low-single-digit-ms target
- cache-miss path: measured separately
- p95 API latency: workload-specific SLO
- DB load reduction: measured after implementation
- invalidation propagation: bounded and measured
- Redis recovery: measured
- 10M+ capacity: NOT VERIFIED until load/soak evidence

---

## 17. Workstream Breakdown

### M15-CACHE-01 — Discovery
Inventory کامل cache consumers، data classes و current paths.

### M15-CACHE-02 — Policy Registry
طراحی schema و policy taxonomy.

### M15-CACHE-03 — Read Optimization
L1/L2/admission/single-flight/TTL/SWR.

### M15-CACHE-04 — Durable Invalidation
Outbox/queue/replay/multi-instance correctness.

### M15-CACHE-05 — Write Strategy
تصمیم workload-specific برای DB-first / Write-Through / Write-Behind.

### M15-CACHE-06 — Scale
Redis topology، sharding readiness، hot-key، quotas و capacity model.

### M15-CACHE-07 — Observability
metrics/tracing/alerts و cache SLO.

### M15-CACHE-08 — Load/Soak
اندازه‌گیری واقعی 10M+ model assumptions.

### M15-CACHE-09 — Verification
Atria implementation → Hermes independent verification → targeted 16-view challenge where needed → ChatGPT decision.

---

## 18. Definition of Done

طراحی زمانی کامل است که:

- [ ] تمام cache consumers inventory شده باشند.
- [ ] تمام workloadها classification شده باشند.
- [ ] برای هر workload strategy مشخص باشد.
- [ ] critical data و non-critical data جدا شده باشند.
- [ ] failure matrix تکمیل شده باشد.
- [ ] invalidation durability design مشخص باشد.
- [ ] multi-instance semantics مشخص باشد.
- [ ] tenant isolation contract مشخص باشد.
- [ ] capacity model با فرض‌های قابل‌اندازه‌گیری نوشته شده باشد.
- [ ] observability contract مشخص باشد.
- [ ] migration plan کم‌ریسک وجود داشته باشد.
- [ ] rollback plan وجود داشته باشد.
- [ ] Hermes architecture review انجام شده باشد.
- [ ] ChatGPT final reconciliation انجام شده باشد.

**طراحی ≠ پیاده‌سازی ≠ اثبات ظرفیت.**

---

## 19. ممنوعیت‌های معماری

1. Write-Behind برای داده‌های authoritative بدون approval.
2. استفاده از cache به‌عنوان authorization source.
3. افزایش TTL برای پنهان‌کردن مشکل invalidation.
4. bypass کردن Redis failure با stale data بدون policy.
5. cache کردن بدون tenant/scope contract.
6. افزودن Redis node بدون capacity evidence.
7. ادعای 10M+ صرفاً بر اساس تعداد کاربران.
8. microservices/sharding صرفاً به دلیل «مقیاس بزرگ».
9. تغییر هم‌زمان correctness و performance بدون جداکردن evidence.
10. certification بر اساس benchmark مصنوعی بدون اتصال به workload واقعی.

---

## 20. تصمیم معماری فعلی

**ADOPT AS DESIGN TRACK — NOT YET IMPLEMENTED**

پایه فعلی Payesh حفظ می‌شود و PACMA به‌صورت تدریجی روی آن سوار می‌شود.

اولین mission اجرایی فقط **Discovery + Architecture Evidence** است. هیچ تغییر production code تا بعد از review طراحی مجاز نیست.

---

## 21. ارتباط با اسناد موجود

این سند باید با موارد زیر هم‌راستا بماند:

- `docs/CURRENT_PROJECT_INTELLIGENCE.md`
- `docs/CURRENT_WORK_EXECUTION_PLAN.md`
- `docs/CAPACITY_MODEL.md`
- `docs/SCALE_10M.md`
- `docs/BOTTLENECK_MAP.md`
- `docs/LOAD_TEST_PLAN.md`
- `docs/PERFORMANCE_BENCHMARKS.md`
- `docs/ARCHITECTURE_EVOLUTION_ROADMAP.md`

این سند جایگزین اسناد ظرفیت/مقیاس موجود نیست؛ لایه مدیریت Cache را به آنها متصل می‌کند.

## M15 SYSTEM-READINESS V2 UPDATE — 2026-10-05

**Architectural assumption:** for M15 planning, the existing architecture is treated as having reached its practical limit. This document is therefore a design upgrade, not merely a hardening checklist.

### Required integration with system-scale architecture
- Global resource budgets and admission control must protect this layer from upstream bursts.
- Tenant/noisy-neighbor budgets are mandatory.
- Every expensive path needs p95/p99, saturation and failure metrics.
- Any fallback must be bounded, observable and unable to create a feedback loop.
- Current-head load/soak/chaos evidence is required before scale certification.
- Canonical execution queue: `docs/CURRENT_WORK_EXECUTION_PLAN.md` → M15.
- Canonical gap audit: `docs/audit/PAYESH_SYSTEM_SCALE_RELIABILITY_GAP_AUDIT_2026-10-05.md`.
- Status remains **DESIGN/UPGRADE QUEUED — NOT IMPLEMENTED/CERTIFIED** until the M15 execution gates pass.

## M15-05 DURABLE INVALIDATION — IMPLEMENTATION RECORD — 2026-10-04

این بخش فقط مسیرِ durable invalidation را پوشش می‌دهد. بقیهٔ M15 (admission، hot-key، bounded L1، single-flight، tenant budgets، soak certification) **هنوز باز است** و وضعیتِ کلیِ سند بالا تغییری نکرده است.

### تصمیماتِ معماری که در پیاده‌سازی گرفته شدند
1. **Replicate-to-all، نه competing-consumer.** ابطالِ کش idempotent است و باید رویِ **هر** نمونه اجرا شود؛ پس `FOR UPDATE SKIP LOCKED` (claim) عمداً استفاده نشد. به جای آن، هر instance یک **watermarkِ اختصاصی** در `server_outbox_watermark` دارد و فقط رویدادهای بعد از watermarkِ خودش را می‌خواند. این تصمیم، یادداشتِ قدیمیِ MULTI_INSTANCE_AUDIT (row G: «handlerِ سراسری باید claim توزیع‌شده بگیرد») را **نقض می‌کند** — claim کردن اینجا غلط بود، زیرا رویداد را فقط یک نمونه مصرف می‌کرد.
2. **user-scope epoch (بخشِ ۸ مأموریت).** پکتِ L2 حالا `ue` دارد. قبل از این، انتقالِ کاربر بینِ مدارس می‌توانست کشِ bootstrap را کهنه نگه دارد (حفرهٔ M14-B02 از زاویهٔ دیگر).
3. **آینهٔ RAM از PG عقب نمی‌افتد.** اگر insertِ رویداد داخلِ تراکنشِ فراخوان رول‌بک شود، رویداد از آینهٔ محلی هم برداشته می‌شود (بخشِ ۶: commit بدونِ event غیرممکن).
4. **fail-closed برای scope ناشناخته:** رویدادِ cache با scope ناشناخته به DLQ می‌رود، نه ابطالِ سراسریِ کور.
5. **Redis outage ≠ retry burn.** اگر handler خطای `REDIS_UNAVAILABLE` بدهد، رویداد علامت نمی‌خورد و retry_count افزایش نمی‌یابد؛ cursor ثابت می‌ماند تا تیکِ بعدی.

### سه باگِ واقعی که حینِ تست کشف شدند
| # | باگ | اثر |
|---|---|---|
| ۱ | شاخهٔ حافظهٔ `fetchReplicateBatch` به id sort نمی‌کرد | ordering invariant فقط روی PG برقرار بود |
| ۲ | رویداد در رول‌بک یتیم می‌ماند | commit بدونِ event ممکن بود (نقضِ بخش ۶) |
| ۳ | `mark()` در مسیرِ unguarded ۶ پارامتر می‌فرستاد ولی SQL ۵ تا می‌خواست (SQLSTATE 08P01) | خطا در try/catch بلعیده می‌شد → status برای همیشه `pending` |

باگِ سوم بدونِ probing مستقیمِ PG زنده قابل‌مشاهده نبود — consuming throughput از ۲۰/s به ۷۳۱/s پرید. تستِ **F21** به‌عنوانِ regression guard دائمی اضافه شد.

### شواهدِ اندازه‌گیری‌شده (PG زنده)
- produce **۵۱۱/s**، consume **۷۳۱/s**، latency تک‌رویداد **۵ms**
- ۶۰/۶۰ تست (۲۰ سناریوی شکست + F21) در سه اجرای متوالی پایدار
- دو instance واقعی روی PG + Redis زنده (F20)
- اثباتِ منفی: `CACHE_DURABLE_VULN=1` نشان می‌دهد بدونِ consumer، کش کهنه می‌ماند
- ۶ metric همگی روی ماژول‌های واقعی verify شدند (قبل از اصلاح، declare نشده بودند و drop می‌شدند)

### محدودیت‌های شناخته‌شده
- مسیرِ دوام‌دار به PG وابسته است. بدونِ `DATABASE_URL`، تست‌های PG به‌درستی **NOT-RUN** می‌شوند.
- ظرفیتِ بالا فقط برای مسیرِ invalidation است؛ هیچ ادعایی دربارهٔ کلِ سیستم تحت peak-load صادر نشده است.
- `server_outbox` هنوز partition نشده؛ OUTBOX_CAP فقط آینهٔ RAM را محدود می‌کرد و retention (reapProcessed) اینک به آن اضافه شده اما اندازه‌گیریِ retention زیرِ بارِ طولانی‌مدت هنوز انجام نشده.
