# Payesh — System Scale & Reliability Gap Audit — 2026-10-05

## Scope
Original audit baseline HEAD: `2fab2f9b2533bef944458a1fc05643fac1ded892` (historical). **V2 reconciliation below is bound to HEAD `1b19449f49a2952d2fbda99053f9af42f2cf4c6c` (2026-10-06).**

Goal: maximum throughput/lowest tail latency under peak load, with minimum defects, errors, database/Redis/server/hardware pressure, while preserving security and data correctness.

This is an architecture/readiness audit, not a certification. A design or source inspection is not treated as runtime proof.

## Findings

### P0 — Must close before production-scale certification

1. **Database/source-of-truth duality remains a scale and correctness risk**
   - PostgreSQL is authoritative in many paths, but JSON/memory store remains a transitional path/fallback.
   - Risk: memory divergence, per-instance inconsistency, RAM/GC pressure, different behavior under degraded infrastructure.
   - Action: define one production data plane; make PostgreSQL the sole authoritative transactional SoT; keep memory only as bounded cache/materialized state with explicit degraded-mode contract.

2. **Tenant/authorization policy must remain invariant-wide**
   - Existing history shows point fixes can leave REST/sync/cache/config variants.
   - Action: one authoritative policy contract, enforced at the resource boundary and reused by REST, sync, async workers and cache admission/projection; adversarial tenant matrix on current HEAD.

3. **PostgreSQL concurrency budget is not yet a national-scale capacity contract**
   - Pool sizes cannot be chosen per instance without a global connection budget.
   - Action: model total connections across all app/worker instances, reserve operational headroom, add pool-wait/transaction-duration/query-latency SLOs and admission/backpressure.

4. **Hot-path query plan/capacity proof is incomplete**
   - SQL-native/keyset paths exist, but several fallback/memory paths and historical scan risks remain.
   - Action: EXPLAIN ANALYZE on top endpoints using national-scale cardinalities; prohibit unbounded SELECT/projection in hot paths.

5. **Sync/pull can become the dominant CPU/DB load**
   - Batch validation, authz, OCC, idempotency, conflict handling and enrichment can amplify per-operation cost.
   - Action: batch cost budget, bounded batch size, stage-level latency metrics, DB-native filtering, transaction chunking, queue/backpressure.

6. **Queue/outbox growth needs explicit capacity/retention control**
   - Historical audit found unbounded sms_log/notify_queue growth and latency/heap effects.
   - Action: queue depth SLO, per-tenant fairness, retention/compaction, DLQ limits, worker concurrency caps, oldest-age alert, backpressure.

7. **Cache architecture still needs durable cross-instance invalidation**
   - M14-B01 fixed same-process pending invalidation but confirmed process-local residual staleness (NF-1).
   - Action: durable invalidation/outbox, replay, idempotency, bounded backlog, cross-instance proof. PACMA must implement this rather than merely document it.
   - **UPDATE 2026-10-04 — RESOLVED (M15-05 / M15-CACHE-PACMA):** تمامِ چهارجزءِ Action پیاده و رویِ PG/Redis زنده verify شد: durable outbox (`server_outbox` + handlerهایِ `cache.*`)، replay (boot-time + tick)، idempotency (F6 + first-writer-wins)، bounded backlog (per-instance watermark + `reapProcessed` retention)، cross-instance proof (F20: دو INSTANCE_ID واقعی روی PG/Redis زنده). NF-1 بسته شد. ظرفیتِ اندازه‌گیری‌شده: produce ۵۱۱/s، consume ۷۳۱/s، latency ۵ms. این finding **بسته شدنه با evidence** است، نه با سند. بقیهٔ M15 هنوز باز است.

8. **Redis hot-key and cluster behavior needs capacity proof**
   - Redis Cluster cannot spread one hot key across shards.
   - Action: hot-key identification, local L1/admission, key splitting only where semantically safe, per-key payload/TTL budgets, shard CPU/latency SLOs.

9. **Observability is designed but not yet implemented/certified**
   - Independent monitoring, metrics, logs, traces and monitoring-of-monitoring are design tracks.
   - Action: implement minimum telemetry contract before load certification.

10. **Load/soak/chaos evidence is not yet sufficient for 10M+ claims**
    - Existing benchmarks are useful but not a national-scale proof.
    - Action: synthetic cardinality, peak load, burst, long soak, dependency outage, recovery and multi-instance tests.

### P1 — High priority

11. **Event-loop blocking risks remain**
    - Sync file/audit paths exist; Node synchronous console/file writes can block the event loop.
    - Action: production async structured logging; bounded queues; no synchronous disk I/O in request hot paths except explicitly proven emergency/shutdown paths.

12. **Logging can become its own outage**
    - Rotation/retention is designed, but centralized shipping/backpressure/drop policy is not yet operationally proven.
    - Action: separate application vs security/audit durability classes; bounded local disk; compression; sink outage policy; cardinality controls.

13. **Heavy-worker fallback can reintroduce latency spikes**
    - Wave 9 intentionally retains synchronous/in-process fallbacks.
    - Action: measure fallback frequency and duration; make fallback bounded and observable; never silently return to expensive whole-store work under load.

14. **Worker retry storms**
    - Existing worker retry behavior is bounded but can synchronize across instances.
    - Action: exponential backoff + jitter + concurrency budget + dependency-aware circuit breaking.

15. **Cache stampede/hot-key protection needs policy-level admission**
    - Single-flight exists for some cache paths, but not every expensive resource should be admitted equally.
    - Action: PACMA policy registry per object class with TTL, admission, SWR, negative cache, single-flight and failure semantics.

16. **Large response/payload amplification**
    - Even with keyset pagination, projections and batch payloads can become CPU/network/memory bottlenecks.
    - Action: hard response byte limits, field projections, compression thresholds, streaming for exports, bounded sync payloads.

17. **Client/offline storage can become a scale bottleneck**
    - Browser localStorage/IndexedDB growth, replay and startup remain a separate capacity domain.
    - Action: byte/age quotas, compaction, bounded replay batches, resumable cursors and backpressure.

18. **Backup/report/admin work must remain isolated from request capacity**
    - Heavy-worker architecture helps, but disk/network/CPU budgets must be independent.
    - Action: dedicated worker/queue budgets and admission controls; never allow backup/report bursts to starve request traffic.

19. **Monitoring cardinality explosion**
    - Per-user/per-school/per-request labels can make telemetry itself expensive.
    - Action: bounded label cardinality; aggregate by route/class/tenant tier rather than raw identifiers.

20. **Configuration safety is still a systemic risk**
    - Historical NaN/zero timeout defects show env parsing can disable safeguards.
    - Action: one bounded configuration parser/schema; boot-time validation; reject unsafe production configuration rather than silently normalize it.

### P2 — Important hardening

21. **Graceful shutdown must include every worker/queue/telemetry pipeline**
22. **Redis/PG outage recovery needs repeated multi-instance drills**
23. **Rate limiting must have global + tenant + endpoint budgets and degraded-mode semantics**
24. **Per-tenant noisy-neighbor isolation for queues, workers, DB and cache**
25. **Storage/disk exhaustion must be a tested failure mode**
26. **Schema/index growth and vacuum/bloat must be part of capacity planning**
27. **Static assets/CDN/cache headers should be separated from application compute**
28. **Security/audit log retention and access must be separated from ordinary operational logs**
29. **Error budgets/SLOs need explicit admission thresholds before saturation**
30. **Current-head evidence registry must invalidate performance/capacity evidence after material changes**

## Architecture decision

### Correct existing architecture
Use for:
- DB pool budgeting
- SQL query/index improvements
- queue limits/retention
- async logging/rotation
- worker retry/backoff
- response/payload limits
- configuration validation
- shutdown/drain
- client storage bounds

### Extend existing architecture
Use for:
- PACMA durable invalidation/outbox
- tenant-aware resource budgets
- cache admission/SWR/hot-key controls
- observability implementation
- capacity model
- monitoring-of-monitoring

### New architecture only if evidence requires it
Do NOT jump directly to microservices/Kubernetes/service mesh.
First prove bottlenecks with measurements. Consider read replicas, PgBouncer, Redis Cluster, partitioning, dedicated worker pools, CDN/object storage, or service extraction only when measured saturation and failure-domain requirements justify them.

## Required execution order

1. M15-READINESS-DISCOVERY: inventory hot paths, DB pools, queues, cache policies, sync/pull, logging, workers, client storage.
2. M15-CAPACITY-MODEL: define workload classes and resource budgets.
3. M15-DB-SCALE: EXPLAIN/ANALYZE + pool/transaction budgets.
4. M15-SYNC-SCALE: batch cost, backpressure, tenant fairness.
5. M15-CACHE-PACMA: durable invalidation + admission + hot-key controls.
6. M15-QUEUE-WORKER: bounded queues, retries, fairness, DLQ/retention.
7. M15-OBSERVABILITY: independent monitoring + logs + rotation + traces + alerts.
8. M15-LOAD-SOAK-CHAOS: peak/burst/soak/failure/recovery.
9. Hermes independent verification.
10. Current-head reconciliation and only then performance/production certification.

## Definition of Done
No 10M+ readiness claim without measured evidence for:
- p50/p95/p99 latency
- throughput
- event-loop lag
- CPU/RSS/heap/GC
- PostgreSQL QPS, pool wait, active connections, locks, slow queries
- Redis ops/sec, p95/p99, shard CPU, memory, hot keys
- queue depth/age/retry/DLQ
- cache hit/miss/admission/invalidation lag
- log/telemetry throughput and disk usage
- error rate and saturation
- failure recovery RTO/RPO
- per-tenant fairness/noisy-neighbor behavior
- exact current SHA
- independent verification

Status: OPEN — architecture/readiness program, not a certification. See **V2 Reconciliation** below for the current-HEAD status of every recommendation.


---

# V2 Reconciliation — Independent 10M+ Critique vs Actual Repository (2026-10-06)

**Bound HEAD:** `1b19449f49a2952d2fbda99053f9af42f2cf4c6c` (origin/main at start of mission).
**Evidence level:** STATIC CODE/CONFIG INSPECTION ONLY (file:line reading, grep, schema scans). **No runtime, no load, no E3/E4 evidence was produced.** Nothing below is VERIFIED in the Rule 5/7 sense; it is a reconciled *finding register* that must be reproduced per Rule 30 before any fix.
**Source critique:** `PAYESH_Independent_Architecture_Review` (verdict **D**: structural upgrade, not a rewrite, no premature microservices). The critique itself stated that no code had been seen; this section is the first comparison against the repository.
**Coverage note:** DB, Redis/cache, queue/worker/outbox/sync, auth/authz/tenant/edge/config were inspected by dedicated read-only sweeps. Observability/DR/load-test was inspected by targeted greps only (the dedicated sweep was cut off by a session limit) and is marked PARTIAL below.

## 1. Where the critique contradicts or mis-fits the repository

| # | Critique assumption | Repository reality (evidence) | Effect |
|---|---|---|---|
| D1 | Tenant key is `tenant_id`; IDs can be UUIDv7/global | Tenant key is integer `school_id`; 73/95 tables in `server/schema.sql` have it, 22 do not (incl. tenant-owned `parent_links`, `bus_students`, `hw_submissions`, `vclass_*`); IDs are per-table `INTEGER GENERATED BY DEFAULT AS IDENTITY` (`ids.js:70-76`); FKs are single-column `x(id)` (no composite `(school_id,id)`) | Shard/cell-readiness gap is **larger** than the critique assumed → M15-06 |
| D2 | "RLS as defense-in-depth" | No RLS, no `CREATE POLICY`, no `set_config` anywhere; isolation = SQL predicates in `dbquery.js` + JS filters (`policy.js`) | RLS is a *new* design item, with PgBouncer transaction-mode implications (`SET LOCAL` only) |
| D3 | Queue may be Redis or PG | Outbox is a PG table `server_outbox` with `FOR UPDATE SKIP LOCKED` + lease + fencing token (`outbox.js:271-315`); Redis supplies only `payesh:outbox:seq` | Critique's "dedicated broker" urgency is **weaker**: mechanism is sound, the gap is retention/telemetry/fairness |
| D4 | "Password hash CPU / login storm" | **No passwords.** Login is phone+OTP+national-ID; OTP stored as HMAC (`auth.js:251-266`). No bcrypt/argon on any path | Hash-offload item is NOT_APPLICABLE; the real per-request cost is `sessionFrom` I/O (Redis revocation + `sessver` + user/school reads, `auth.js:112-184`) with no session cache |
| D5 | "PACMA too complex; drop SWR" | Running cache is *simple*: only the bootstrap payload is cached (`cache.js`, `routes/bootstrap.js:253-276`); **no SWR, no write-behind, no negative cache, no versioned keys** exist in code. Complexity lives only in the PACMA *design* doc | Simplification applies to the design, not to code. SWR/write-behind stay forbidden-by-default |
| D6 | Critique sizing (300–450k concurrent, 30–50k RPS, 100–250k RPS spike) | Official model `docs/CAPACITY_MODEL.md`: 10M registered, **2.5M concurrent peak, ~20k RPS**; `nationalCapacityGateMiddleware` hard-codes 20,000 RPS / 2,500 write TPS and returns 429 (`index.js:956-1000`) | Two inconsistent models. Critique numbers are **ILLUSTRATIVE ASSUMPTIONS**; M15-02 must reconcile with `CAPACITY_MODEL.md`. A 100k+ RPS spike would be 429-gated by the static ceiling |
| D7 | "Rate-limit: fail-to-local on Redis loss" | `rate-limit.js` is deliberately **fail-closed 503** (OTP/login/sync); only WAF path is effectively fail-open (`waf.js:171-177`) | Not a simple change: security-sensitive endpoints should stay fail-closed; sync/pull may need fail-to-local → per-endpoint policy (DESIGN_REQUIRED) |
| D8 | "N-36 invalidation reconciliation" (mission text) | **N-36 = API/Test-CI parity contract** (API-suite count; `docs/control-plane/ATRIA_MISSION_M13_F3_FINAL_REPORT.md:76,102,158`). The cache-invalidation residual is **NF-1 / M14-B01** (`PAYESH_ADAPTIVE_CACHE_ARCHITECTURE.md:308`) | N-36 is unrelated to cache invalidation. Renamed in queue: M15-09 = **NF-1 invalidation reconciliation**; N-36 stays an independent docs/CI mission |
| D9 | Redis roles "possibly shared" | Confirmed: cache, 2 rate-limit schemes, OTP blob, revocation, pub/sub, locks, idempotency, outbox seq, enum counters — **one client, one keyspace, one policy**; infra says `noeviction` (`infra/redis/docker-compose.sentinel.yml`), `docs/CACHE_STRATEGY_DESIGN.md:26,186` says `allkeys-lru 32gb` | Repo-internal contradiction + correlated failure domain → M15-08 |
| D10 | Observability "independent" unknown | Config exists (`infra/observability/*`: prometheus, alertmanager, loki, promtail, otelcol; `infra/tracing/*` jaeger; 11 alerts) but **no deployment evidence**; no dead-man / black-box probe found by grep; metrics module is custom (no `prom-client`) | Design present, implementation/independence UNPROVEN |

## 2. Recommendation status register (every critique recommendation)

Status vocabulary: CONFIRMED · PARTIALLY_CONFIRMED · DESIGN_REQUIRED · EVIDENCE_REQUIRED · CONDITIONAL · NOT_APPLICABLE · REJECTED_WITH_REASON. "Impl" = state in repo at HEAD 1b19449 (never "IMPLEMENTED" without code evidence; never PRODUCTION-READY).

| Recommendation | Status | Impl at HEAD | Queue |
|---|---|---|---|
| Keep Modular Monolith + Workers | CONFIRMED | n/a (existing) | governance |
| Microservices / Service Mesh / Event Sourcing now | REJECTED_WITH_REASON (premature, no measured boundary) | — | governance |
| CQRS | CONDITIONAL (only if reporting evidence) | — | M15-23 |
| Kubernetes | CONDITIONAL / EVIDENCE_REQUIRED (no k8s found; compose/systemd only) | NOT IMPLEMENTED | M15-16 |
| PostgreSQL stays SoT | CONFIRMED; **PARTIALLY_CONFIRMED in practice**: memory mirror hydrated at boot and read in prod (`db.js:604-655`), `readCollection` unbounded `SELECT *` without school predicate (`db.js:551`) | PARTIAL | M15-05 |
| PgBouncer | CONFIRMED (needed) | PARTIAL: infra ini exists (`pool_mode=transaction`, `max_client_conn=3500`), app unaware; `ids.js:47,56` session advisory lock via `pool.query` is transaction-pooling-unsafe | M15-05 |
| Global connection budget | CONFIRMED | NOT FOUND (`PG_POOL_MAX` default 20 per process, no `instances×pool` vs `max_connections`) | M15-05 |
| `statement_timeout` / `idle_in_transaction` / `lock_timeout` | CONFIRMED | NOT FOUND (only client-side `query_timeout` 10 s) | M15-05 |
| Pool-wait histogram | CONFIRMED | PARTIAL (gauges only) | M15-05/14 |
| Keyset pagination | CONFIRMED | IMPLEMENTED for list routes (`dbquery.js:111-132`); unbounded `readCollection` remains | M15-05 |
| Read replicas | CONDITIONAL / EVIDENCE_REQUIRED | PARTIAL: `queryRead()` w/ fallback (`db.js:420-445`), async replication; read-your-writes policy not evidenced | M15-23 |
| Partitioning | CONFIRMED | PARTIAL: `attendance_p`, `grades_p` by `created_at` (mig 012), PK `(id,created_at)`; outbox/log tables not partitioned | M15-05 |
| Patroni / auto-failover | CONDITIONAL | NOT FOUND (manual `pg_promote`, async replication) | M15-20 |
| Shard-ready data model | CONFIRMED, **DESIGN_REQUIRED** (see D1) | NOT READY | M15-06 |
| Shard / cell *now* | REJECTED_WITH_REASON (no write-ceiling evidence) | — | M15-24 |
| Cell architecture (blast radius) | DESIGN_REQUIRED → "CELL-READY" only | NOT IMPLEMENTED | M15-22 |
| Tenant Directory / Router | DESIGN_REQUIRED | NOT FOUND | M15-22 |
| Admission control + priority classes | CONFIRMED | NOT FOUND (only static national gate; lag observed, never used to shed) | M15-04 |
| Event-loop delay as SLI (`monitorEventLoopDelay`) | CONFIRMED | NOT FOUND (timer-drift gauge only, `metrics.js:700`) | M15-13 |
| Payload / row caps | CONFIRMED | PARTIAL (body 1 MB/64 KB, pull 5000 rows/3 MiB heavy set, page limit 200); no streaming | M15-13 |
| Offload heavy CPU / sync fs | CONFIRMED | PARTIAL (worker thread for persist/backup/report, in-process fallback; audit `appendFileSync` default) | M15-13 |
| Hash-offload for passwords | NOT_APPLICABLE (no passwords) | — | — |
| Local token validation | PARTIALLY_CONFIRMED (HMAC local, but per-request Redis/DB I/O) | PARTIAL | M15-03 |
| Single authoritative authz contract | CONFIRMED | PARTIAL (`policy.js` shared by REST/sync/SQL; `pull.js` separate filter; workers/cache n/a) | M15-03 |
| Per-tenant resource quotas / noisy neighbor | CONFIRMED | MODELED not ENFORCED (`resource-governance.js` read-only endpoint); sync limit per *user* only | M15-03 |
| Rate limit tenant-aware (NAT) | CONFIRMED | nginx `$binary_remote_addr` 100 r/m + `limit_conn 10`; XFF `ips[0]` spoofable (`audit.js:166-180`) | M15-03/04 |
| Rate-limit fail mode per endpoint | DESIGN_REQUIRED (see D7) | fail-closed today | M15-04 |
| PACMA-lite (bounded L1, versioned L2, single-flight, negative cache) | CONFIRMED as target | PARTIAL: L1 count-bound 2048 (not bytes), no TTL jitter, per-process single-flight used once, no negative cache, epoch inside value not key | M15-07 |
| Generic SWR | REJECTED by default (forbidden for authz-sensitive) | NOT FOUND (good) | M15-07 |
| Write-behind for authoritative data | REJECTED_WITH_REASON (already forbidden) | NOT FOUND | governance |
| Versioned-key vs durable invalidation | **DESIGN_REQUIRED — do not build both** | pub/sub fire-and-forget + process-local `pendingInvalidations` (cap 2000); only `*.deleted` goes via outbox | M15-09 |
| Distributed single-flight for hot keys | EVIDENCE_REQUIRED (only one cached resource today) | NOT FOUND | M15-07 |
| Redis role separation | CONFIRMED | NOT FOUND (single client/keyspace; inconsistent prefixes `rate:`, `revoked:`, `sessver:`) | M15-08 |
| Redis Cluster | CONDITIONAL | PARTIAL (`ioredis.Cluster` code path; no hash tags; scaleReads master) | M15-08 |
| Bounded queues + age shedding | CONFIRMED | NOT FOUND (`server_outbox`, DLQ, `sms_log`, `notify_queue`, `server_processed_uids` never pruned) | M15-10 |
| Queue depth/age/DLQ telemetry | CONFIRMED | PARTIAL (depth gauge from RAM mirror capped at 1000) | M15-10/14 |
| Worker fairness / priority lanes / heartbeat | CONFIRMED | NOT FOUND (serial tick, batch 50 hard-coded, 60 s lease, no heartbeat) | M15-10 |
| Retry: single layer, budget, full jitter, deadline propagation | CONFIRMED (P0) | NOT FOUND: zero jitter anywhere; no budget; no deadline; client `online` event retries immediately; page+SW retries can multiply (5×5) | M15-12 |
| Circuit breaker around PG/Redis/SMS | CONFIRMED | NOT FOUND (canary engine only) | M15-12 |
| DLQ ownership/replay tooling | CONFIRMED | NOT FOUND (no replay tool; boot replay capped 1000) | M15-10 |
| Cursor-delta sync + server cursor + idempotency | CONFIRMED (already strong) | IMPLEMENTED in code (`cursor.js`, `sync.js:907-922`, OCC) — runtime proof absent | M15-11 |
| Sync storm defence (jitter, per-tenant/device limits, pull rate limit, version skew) | CONFIRMED (P0 risk) | NOT FOUND for all four | M15-11 |
| Client `storage.persist()` / eviction detection | CONFIRMED | NOT FOUND; client DLQ drops oldest beyond 200 | M15-11 |
| Observability plane independent, dead-man, black-box, cardinality budget | CONFIRMED | CONFIG PRESENT / DEPLOYMENT UNPROVEN / dead-man NOT FOUND | M15-14 |
| Telemetry lossy fail-open, async logging | CONFIRMED | PARTIAL (audit sync by default; 61 `console.*` in `index.js`; no log shipper in app) | M15-14 |
| Backup: WAL + PITR + restore drill, RPO/RTO measured | CONFIRMED | CONFIG/TOOLS PRESENT (`pgbackrest`, `pitr-restore.sh`, `pitr-verify.sh`); `infra/wal-drill` is a WAL disk-full drill; **no measured RPO/RTO** (Ground Truth RT2-03 OPEN) | M15-15/20 |
| Immutable / off-site backup, warm standby | EVIDENCE_REQUIRED | NOT VERIFIED | M15-15 |
| Canary / auto-rollback / expand-contract / kill switch | CONFIRMED | PARTIAL (graceful drain + readiness exist; canary engine for routing; no progressive deploy evidence) | M15-16 |
| Scheduled pre-scale for school peaks | CONFIRMED | NOT FOUND | M15-16 |
| Central config schema, hard bounds, fail-fast | CONFIRMED | PARTIAL: `boundedMs` has 6 call sites; ~12 unbounded `Number/parseInt(process.env)` sites incl. `db.js:78,79,101,102` (pool NaN/0), `sms.js:46`, `worker-service.js:24`, `index.js:103,720,867,868` | M15-17 |
| Load / spike / soak / chaos / restore | CONFIRMED | NOT RUN at national scale (`CAPACITY_WORKLOAD_MODEL.md`: NOT-RUN; scripts in `infra/wave18-loadtest/`) | M15-18/19/20 |
| Dedicated broker (NATS/RabbitMQ/Kafka) | CONDITIONAL / EVIDENCE_REQUIRED | NOT FOUND | M15-21 |

## 3. New repo-owned findings registered (static inspection — each requires reproduction per Rule 30 before fix)

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| V2-F01 | P2 | Session-level `pg_advisory_lock/unlock` through `pool.query` (can land on different connections under PgBouncer transaction mode); only when a sequence is missing | `server/ids.js:47,56,80-81` |
| V2-F02 | P1 | No server-side `statement_timeout`, `idle_in_transaction_session_timeout`, `lock_timeout` | grep over `server/ migrations/ infra/` empty |
| V2-F03 | P0/P1 | Unbounded growth: `server_outbox`, `server_outbox_dlq`, `sms_log`, `notify_queue`, `server_processed_uids`, tombstones — no retention/cleanup | `sms.js:104`; no `DELETE FROM server_outbox` anywhere; `pull.js:22` |
| V2-F04 | P1 | Outbox events with no registered handler are re-set to `pending` every tick forever (only handler: `*.deleted`) | `worker.js:71-74`, `index.js:859-865` |
| V2-F05 | P1 | `payesh_outbox_depth` read from RAM mirror capped at 1000 → cannot show real backlog; no oldest-age / DLQ gauge | `outbox.js:20,98-100,209-219` |
| V2-F06 | P0 | Zero retry jitter; client backoff deterministic; `online` event triggers immediate retry; page loop and SW both retry 5× | `src/js/27-sync.js:350-352,1286`; `sw.js:29` |
| V2-F07 | P1 | Redis: one client/keyspace/policy; infra `noeviction` vs doc `allkeys-lru`; inconsistent prefixes | `redis.js:27-28`; `infra/redis/docker-compose.sentinel.yml`; `docs/CACHE_STRATEGY_DESIGN.md:26` |
| V2-F08 | P1 | Unbounded env parsing sites (NaN/0 can disable pool/timeouts) | list in §2 "Central config schema" |
| V2-F09 | P3 | Doc/comment drift: `cache.js` L1-max comments disagree (10,000 vs 208, real default 2048); `rate-limit.js:7-8` header says fail-open on unexpected errors but code is fail-closed (`rate-limit.js:20,52-56`), and other docs repeat the stale claim (`docs/MULTI_INSTANCE_ARCHITECTURE.md:39`, `docs/MULTI_INSTANCE_AUDIT.md:20`, `docs/WAVE6_REDIS_AUDIT.md:57`, `docs/CHAT3_SUMMARY.md:41`; only `docs/PHASE_8.2_ARCHITECTURE_GOVERNANCE_PRE_AUDIT.md:78` is correct); migration 012 header says "009"; this audit's own stale SHAs | cited lines |
| V2-F10 | P1 | nginx: per-IP 100 r/m + `limit_conn 10` collides with NAT/school IPs; XFF first hop spoofable; no `client_max_body_size`, `proxy_send_timeout`, `client_*_timeout`; `proxy_read_timeout 30s` < Node 65 s | `nginx/nginx.conf:25,97-118`; `audit.js:139-180` |
| V2-F11 | P2 | National capacity gate: `db_connections` hard-coded 0; ceilings static and inconsistent with any modelled spike | `index.js:979-982` |
| V2-F12 | P1 | Client sync DLQ drops oldest item beyond 200 (possible user-data loss); no `storage.persist()` | `27-sync.js:188,30-37` |
| V2-F13 | P0/P1 | 22 tables without `school_id` (some tenant-owned); no composite FKs; partition key is time | `server/schema.sql`; mig 012 |
| V2-F14 | P0 | In-memory mirror hydrated from all tables at boot and read in production; `readCollection` unbounded & unscoped | `db.js:551,604-655,625` |
| V2-F15 | P1 | `sessionFrom` does 2–3 round trips per authenticated request, no session cache | `auth.js:112-184`; `index.js:1105-1106` |
| V2-F16 | P1 | Worker: 60 s lease without heartbeat (handler can run twice), shutdown does not await in-flight tick, boot replay cap 1000, no DLQ replay tool, batch size not configurable | `outbox.js:240,271-315`; `worker.js:58`; `index.js:1939-1991` |
| V2-F17 | P0 | Event-loop lag only observed (timer drift), never used for shedding; no `monitorEventLoopDelay` | `metrics.js:700-711` |
| V2-F18 | P1 | Observability: no dead-man switch / black-box probe found; audit log `appendFileSync` by default (async only with `PAYESH_AUDIT_ASYNC=1`) — **PARTIAL sweep** | `audit.js:185-195,466-476` |
| V2-F20 | P3 | **Pre-existing** failing test at HEAD 1b19449 (identical with and without this documentation change): `tests/onboarding-coverage.js` 29/30 — `docs/ONBOARDING_NEW_DEVELOPER.md:105` references non-existent `server/middleware/scope.js` (isolation actually lives in `policy.js`/`dbquery.js`) | `tests/onboarding-coverage.js`; `ls server/middleware` = auth, canary, pagination, projection |
| V2-F19 | P2 | Single global `payesh_chg_seq` + trigger on every write (no `CACHE` clause seen); a single ordering point for all writes | `migrations/011_delta_chg_id.sql:53-64` (EVIDENCE_REQUIRED) |

## 4. Honest limits of this reconciliation
- Static reading only; no query plan, no profiler, no benchmark was run.
- Some sweep claims (e.g., whether `db.readOne('users')` in `sessionFrom` hits PG or the RAM mirror; ioredis resubscribe after reconnect; the `/api/sync` exact body limit) were **not** verified and are EVIDENCE_REQUIRED.
- The V2 queue is in `docs/CURRENT_WORK_EXECUTION_PLAN.md` → "M15 V2". Nothing here changes any item's verification status.
