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

**Bound HEAD:** static inspection at `1b19449f49a2952d2fbda99053f9af42f2cf4c6c` (origin/main at mission start). `origin/main` moved to `bb0b5fa` during the mission (upstream commit `0538383` "M15-05 durable cross-instance cache invalidation", plus docs/freeze commits); the branch was rebased and every claim touched by that commit was re-verified. Rows/findings changed by it are tagged **[bb0b5fa]**.
**Evidence level:** STATIC CODE/CONFIG INSPECTION ONLY (file:line reading, grep, schema scans). **No runtime, no load, no E3/E4 evidence was produced.** Nothing below is VERIFIED in the Rule 5/7 sense; it is a reconciled *finding register* that must be reproduced per Rule 30 before any fix.
**Source critique:** `PAYESH_Independent_Architecture_Review` (verdict **D**: structural upgrade, not a rewrite, no premature microservices). The critique itself stated that no code had been seen; this section is the first comparison against the repository.
**Coverage note:** DB, Redis/cache, queue/worker/outbox/sync, auth/authz/tenant/edge/config were inspected by dedicated read-only sweeps. Observability/DR/load-test was inspected by targeted greps only (the dedicated sweep was cut off by a session limit) and is marked PARTIAL below.

## 1. Where the critique contradicts or mis-fits the repository

| # | Critique assumption | Repository reality (evidence) | Effect |
|---|---|---|---|
| D1 | Tenant key is `tenant_id`; IDs can be UUIDv7/global | Tenant key is integer `school_id`; 73/95 tables in `server/schema.sql` have it, 22 do not (incl. tenant-owned `parent_links`, `bus_students`, `hw_submissions`, `vclass_*`); IDs are per-table `INTEGER GENERATED BY DEFAULT AS IDENTITY` (`ids.js:70-76`); FKs are single-column `x(id)` (no composite `(school_id,id)`) | Shard/cell-readiness gap is **larger** than the critique assumed → M15-06 |
| D2 | "RLS as defense-in-depth" | No RLS, no `CREATE POLICY`, no `set_config` anywhere; isolation = SQL predicates in `dbquery.js` + JS filters (`policy.js`) | RLS is a *new* design item, with PgBouncer transaction-mode implications (`SET LOCAL` only) |
| D3 [bb0b5fa] | Queue may be Redis or PG | Outbox is a PG table `server_outbox` with `FOR UPDATE SKIP LOCKED` + lease + fencing token (`outbox.js:271-315`); Redis supplies only `payesh:outbox:seq`; since `0538383` cache.* invalidation events also ride this outbox with a per-instance watermark (`outbox.js:490`, `worker.js:138`, migration 026) | Critique's "dedicated broker" urgency is **weaker**: mechanism is sound, the gap is retention/telemetry/fairness |
| D4 | "Password hash CPU / login storm" | **No passwords.** Login is phone+OTP+national-ID; OTP stored as HMAC (`auth.js:251-266`). No bcrypt/argon on any path | Hash-offload item is NOT_APPLICABLE; the real per-request cost is `sessionFrom` I/O (Redis revocation + `sessver` + user/school reads, `auth.js:112-184`) with no session cache |
| D5 | "PACMA too complex; drop SWR" | Running cache is *simple*: only the bootstrap payload is cached (`cache.js`, `routes/bootstrap.js:253-276`); **no SWR, no write-behind, no negative cache, no versioned keys** exist in code [bb0b5fa: a user-epoch was added, `cache.js:31,286-287`]. Complexity lives only in the PACMA *design* doc | Simplification applies to the design, not to code. SWR/write-behind stay forbidden-by-default |
| D6 | Critique sizing (300–450k concurrent, 30–50k RPS, 100–250k RPS spike) | Official model `docs/CAPACITY_MODEL.md`: 10M registered, **2.5M concurrent peak, ~20k RPS**; `nationalCapacityGateMiddleware` hard-codes 20,000 RPS / 2,500 write TPS and returns 429 (`index.js:956-1000`) | Two inconsistent models. Critique numbers are **ILLUSTRATIVE ASSUMPTIONS**; M15-02 must reconcile with `CAPACITY_MODEL.md`. A 100k+ RPS spike would be 429-gated by the static ceiling |
| D7 | "Rate-limit: fail-to-local on Redis loss" | `rate-limit.js` is deliberately **fail-closed 503** (OTP/login/sync); only WAF path is effectively fail-open (`waf.js:171-177`) | Not a simple change: security-sensitive endpoints should stay fail-closed; sync/pull may need fail-to-local → per-endpoint policy (DESIGN_REQUIRED) |
| D8 [bb0b5fa] | "N-36 invalidation reconciliation" (mission text) | **Name collision, documented upstream:** original N-36 = API/Test-CI parity contract (`docs/control-plane/ATRIA_MISSION_M13_F3_FINAL_REPORT.md:76,102,158`); the durable-invalidation mission was also nicknamed N-36 (`m15-cache-durable-invalidation/FINAL_REPORT.md` header, which says the original "is still open"). The invalidation residual is **NF-1 / M14-B01** | Canonical ids: invalidation = M15-CACHE-PACMA / M15-05 (V1) → **M15-09** (V2); original N-36 stays an independent docs/CI item (state at bb0b5fa: EVIDENCE_REQUIRED) |
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
| Versioned-key vs durable invalidation [bb0b5fa] | **Durable path (B) already built; DO NOT add a second mechanism.** Remaining: independent verification + decide whether key-level versions are still needed | IMPLEMENTED by `0538383`: cache.* events in `server_outbox`, per-instance watermark, replicate-to-all consumer, user-epoch, processed-row retention; evidence is E3 single-box, implementer-reported; `pendingInvalidations` (process-local) still present as fallback (`cache.js:42`) | M15-09 |
| Distributed single-flight for hot keys | EVIDENCE_REQUIRED (only one cached resource today) | NOT FOUND | M15-07 |
| Redis role separation | CONFIRMED | NOT FOUND (single client/keyspace; inconsistent prefixes `rate:`, `revoked:`, `sessver:`) | M15-08 |
| Redis Cluster | CONDITIONAL | PARTIAL (`ioredis.Cluster` code path; no hash tags; scaleReads master) | M15-08 |
| Bounded queues + age shedding [bb0b5fa] | CONFIRMED | PARTIAL: processed `server_outbox` rows now reaped (`outbox.js:539-561`, `index.js` interval ~912-925, watermark-floor contract); DLQ, `sms_log`, `notify_queue`, `server_processed_uids`, tombstones still never pruned; `server_outbox` not partitioned; no age-shedding | M15-10 |
| Queue depth/age/DLQ telemetry [bb0b5fa] | CONFIRMED | PARTIAL: cache.* backlog depth + oldest-age gauges added (`metrics.js:538-539`); generic `payesh_outbox_depth` still from RAM mirror (`outbox.js:230-238`, cap 1000); no DLQ gauge | M15-10/14 |
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
| V2-F03 [bb0b5fa PARTIAL] | P0/P1 | Unbounded growth (processed `server_outbox` rows are now reaped; the rest remains): `server_outbox`, `server_outbox_dlq`, `sms_log`, `notify_queue`, `server_processed_uids`, tombstones — no retention/cleanup | `sms.js:104`; no `DELETE FROM server_outbox` anywhere; `pull.js:22` |
| V2-F04 | P1 | Outbox events with no registered handler are re-set to `pending` every tick forever (only handler: `*.deleted`) | `worker.js:71-74`, `index.js:859-865` |
| V2-F05 [bb0b5fa PARTIAL] | P1 | `payesh_outbox_depth` read from RAM mirror capped at 1000 → cannot show real backlog; cache.* backlog/oldest-age gauges exist since `0538383`, general oldest-age and DLQ gauges do not | `outbox.js:20,98-100,209-219` |
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
| V2-F20 | P3 | **CLOSED (2026-10-19):** onboarding now names the real shared policy/DB-scope paths (`server/policy.js` / `server/dbquery.js`), documents PostgreSQL mode accurately, and points to the canonical `docs/HANDOFF.md`; regression coverage is 30/30. | `tests/onboarding-coverage.js` and `tests/docs-index-coverage.js` on the updated worktree; see the 2026-10-19 addendum |
| V2-F21 | P1 | **Verification gap:** the implemented durable-invalidation path has implementer-reported E3 evidence only; no independent Hermes verification and no `VERIFICATION_REGISTRY.json` M15 entry (`head_bound` = e4584806). Status per repo gate: ATRIA_PASS at best, not CERTIFIED | `m15-cache-durable-invalidation/FINAL_REPORT.md`; `docs/verification/VERIFICATION_REGISTRY.json` |
| V2-F22 | P3 | Docs-debt: root-level `m15-cache-durable-invalidation/` outside `docs/` (REPOSITORY_MAP §2) | repo root |
| V2-F19 | P2 | Single global `payesh_chg_seq` + trigger on every write (no `CACHE` clause seen); a single ordering point for all writes | `migrations/011_delta_chg_id.sql:53-64` (EVIDENCE_REQUIRED) |

## 4. Honest limits of this reconciliation
- Static reading only; no query plan, no profiler, no benchmark was run.
- Some sweep claims (e.g., whether `db.readOne('users')` in `sessionFrom` hits PG or the RAM mirror; ioredis resubscribe after reconnect; the `/api/sync` exact body limit) were **not** verified and are EVIDENCE_REQUIRED.
- The V2 queue is in `docs/CURRENT_WORK_EXECUTION_PLAN.md` → "M15 V2". Nothing here changes any item's verification status.

## Addendum — M15-01 current-HEAD rebind (2026-10-18)

**Identity:** repository `rezaa2544/p2`; branch `arena/c33a022c-p2`; reviewed source HEAD `8f6e7d5f0a823a70a58f85f7803a4d956db350ab`, identical to `origin/main` at review time. Compared with the audit's old anchor `1b19449f49a2952d2fbda99053f9af42f2cf4c6c`, upstream is 141 commits ahead and zero behind. This addendum updates current-source interpretation; it does not convert historical evidence into current-head evidence.

**Disposition:** current-head *static rebind* is complete; the M15-01 mission is **BLOCKED / REVALIDATION_REQUIRED**, not DONE. No live workload, current query plan, deployment-level observability inspection, or current DR restore was run. M15-02 is **NOT STARTED** and is held until M15-01's E3 requirements can be met, per the explicit user-directed sequence.

### Relevant upstream changes reviewed

- `0538383ad58ee1a30ff9a85c1aab1040e77335c0` — M15-05 durable cross-instance invalidation implementation and queue/metric changes.
- `5f543efc7d30c74541fc47bc084bb9bac3e38531` — M15-03 school-intelligence aggregate pushdown.
- `df374eec92a06e2879608cf2c4616fdd12d141bf` and merge `7a9e19f153ec122a7dca6fb54bef68c59c7c6368` — restore the durable invalidation replication loop on the worker timer.
- `81c6af023c6397839ddc89f423fcf5cfe5186f6d` — merge from `origin/main`; the final reviewed source tree is at the identical current `origin/main` SHA above.

### Current hot-path and RPS inventory

`docs/CAPACITY_WORKLOAD_MODEL.md` §3 assigns an approximately 20k-RPS target mix: pull 9,500; bootstrap 2,500; reports 2,300; light/auth/monitoring 1,500; sync 1,800; attendance writes 400; grade writes 200; other writes 100; SMS-send and login about 833 each. These are **ASSUMED design allocations** (the model labels design as verified, not operational capacity); **current measured per-route RPS is NOT AVAILABLE**.

| Hot path | Current source rebind | Current capacity conclusion |
|---|---|---|
| Pull/bootstrap | `server/index.js:1428-1435`; `server/pull.js:156-168,318-459,482-506`; `server/syncdelta.js:34-42` | Cursor pull captures a watermark by issuing a `MAX(chg_id)` lookup for each of 14 change tables before collection reads. A fallback/full pull reads a collection first; role filtering and the default 5,000-row / 3-MiB heavy-collection limits are applied after that read. The limits therefore do **not** bound the preceding table read or peak memory. Runtime rows/s, query plans, and peak memory are unmeasured. |
| Auth/session | `server/auth.js:113-184,269-296,358-469`; `migrations/010_users_phone_auth.sql:20-21`; `migrations/016_phase1_security_and_constraints.sql:32` | The phone expression index and partial active-phone uniqueness index are defined. The current `userByPhone` SQL parameterizes the normalization regex, so actual planner/index use is **UNVERIFIED** until `EXPLAIN` runs against the current schema/driver; the older unconditional “Index Scan” assertion is not accepted as a current plan. `sessionFrom` reads by user ID; auth falls back to the RAM mirror only in JSON mode or non-production after lookup failure. Session checks still perform multiple Redis/PG/journal operations without a measured current-head cache benefit. |
| Sync writes | `server/index.js:1328-1342`; `server/sync.js:650-698,728,1041-1047` | Request-body and operation-count limits remain finite. The previous whole-collection rollback snapshot is **not** current: current code uses an undo log with O(batch) record work. No live transaction contention, write RPS, or latency was measured. |
| School analytics/reports | `server/routes/analytics.js:166-187`; `server/analytics/school-aggregates.js:67-101,251-276`; `server/dbquery.js:406-423` | The school aggregate has a PostgreSQL pushdown path, and list queries have paged builders. The historical M15-03 EXPLAIN/run is synthetic, tied to an older SHA, and is not a current plan or national-capacity proof. |
| Capacity enforcement | `server/index.js:999-1043`; `server/infrastructure/national-capacity-engine.js:39-48`; `server/infrastructure/national-capacity-enforcement.js:111-160` | Enforcement uses process-local rolling counters; `db_connections` is zero without a simulation input. The 20k/2.5k/25k constants are ceilings/targets, not measured global or multi-instance capacity. It is not evidence of global shedding across all routes. |
| Database | `server/db.js:76-103,222-238,560-565,609-649` | Pool caps are per process (primary max 20, read pool max 10); a global instance/connection budget and current fleet size are unknown. `readCollection`/default hydration can load broad collections into the RAM mirror. No current `EXPLAIN (ANALYZE, BUFFERS)`, slow-query sample, pool saturation run, or production data inventory was available. |
| Durable queue/cache | `server/outbox.js:223-239,293-345,539-553`; `server/worker.js:31-115,134-231`; `server/index.js:1939-1991` | The real cache-replication timer path is present after the commits above. Remaining static risks include local-only `outbox.depth()`, RAM fallback on PG batch-fetch failure, immediate pending retry for some failures/no-handler events, lease/shutdown/replay limits, and retention/watermark behavior; none was exercised against live PG+Redis in this review. Historical M15-05 throughput is component-specific only. |
| Metrics/runtime | `server/metrics.js:472,513,517,526-539,616-648,721-755,852-873` | HTTP/SQL histograms, a DB-pool-waiting gauge, PG-derived sync-queue depth, and cache-outbox backlog/age gauges exist. `payesh_outbox_depth` is still the local bounded RAM mirror, not the durable PG queue. Event-loop timer drift is observed but is not a measured shedding control. Metrics code/configuration do not prove the live scrape, alert routing, or dead-man/black-box monitoring is deployed. |
| Edge | `nginx/nginx.conf:25-29,92-110` | The static per-IP 100/min + burst-20 and 10-connection limits, forwarded-header trust, and 30-second proxy-read timeout remain; deployment topology/NAT behavior and end-to-end timeout compatibility are not measured here. |

Two source-comment drifts found against the 2026-10-18 binding were corrected in the current worktree: `server/db.js` now distinguishes PG auth lookups from the JSON/non-production mirror fallback and labels planner use of the phone expression index unverified; `server/syncdelta.js` now records the cursor-v3 wiring and its full-pull fallback. These are comment-only corrections and do not provide a live query plan or change runtime behavior.

### Evidence reconciliation: load, plans, observability, and DR

- The stored Wave 18 JSON exports were summarized with `python3 tools/wave18-summarize-results.py tests/performance/results` (exit 0). Their `http_reqs.rate` values are load **106.28**, peak **20.26**, stress **357.35**, spike **236.92**, soak **81.86 RPS**; the report's prose claims **628/459/194/604/96 RPS** respectively. The metrics therefore do not identify a reproducible matching run. The stored p95 values are 248.77, 147345.03, 1417.92, 1596.56, and 270.82 ms, and the summary flags threshold failures (including a peak hard error). These are historical artifact summaries, not current-head measurements or E3.
- `M15-03_FINAL_REPORT.md` reports a synthetic PostgreSQL 16 aggregate/EXPLAIN run (including a reported 569-ms execution time), but its seed script lived under `/tmp`, and its run/source identity is not the current HEAD. No current query plan was generated.
- `m15-cache-durable-invalidation/FINAL_REPORT.md` reports a component-level PG/Redis exercise; it does not establish whole-service RPS or the current deployment's real timer, queue, and failure behavior.
- Historical DR records in `docs/DR_RUNBOOK.md` / `docs/WAVE19_WAL_DRILL_REPORT.md` are not re-run or bound to this HEAD. No current backup restore, RPO/RTO, or failover measurement was possible.
- The sandbox has no Docker/Podman, PostgreSQL server/client, Redis server/client, k6, project `node_modules`, DB/Redis connection variables, or DB/Redis listener. The GitHub secret-scanning alerts endpoint returned HTTP 403 (“Resource not accessible by integration”), so repository alert state is **UNKNOWN**, not clean.
- Historical documentation-gate results on 2026-10-18 were 74/75, 22/23, and 29/30. They were not treated as green; their repo-owned causes and fixes are recorded in the 2026-10-19 addendum below.

### Environment/access revalidation (2026-10-19)

The owner explicitly authorized permitted actions for this session. Authorization is not itself a designated isolated test environment, and it does not permit replacing operational evidence with production traffic or synthetic/local claims.

| Surface | Verified fact | Consequence |
|---|---|---|
| Vercel `p2` | Deployment `dpl_TU3Dva3d9f75ebh3ZKs52ZjVQ7av` is `READY`/`PROMOTED`, target **production**, source SHA `8f6e7d5f0a823a70a58f85f7803a4d956db350ab`, region `iad1`, Node `24.x`, Hobby plan, type `LAMBDAS`. The reported 2-vCPU/8-GiB machine is the **build machine**, not a measured runtime allocation. Project and team shared environment-variable lists were empty. Speed Insights reported no data; Vercel metadata does not prove the application's Prometheus/alerting stack. | A current production deployment exists, but is **not an authorized load-test target**. No request/load was sent to it. The build-machine size is not a service capacity result. |
| Supabase | Only project found: `kzgeffoqglvptgikcnod`, PostgreSQL 17, `ap-northeast-2`, status `INACTIVE`; health returned “No active services available,” migration-list call timed out, secrets list was empty. Its ref/hostname is absent from the repository, and no Vercel environment variable links it to `p2`. | Relationship to Payesh/staging is unproven. It was not restored, migrated, or queried; it cannot presently provide a current-schema plan, API runtime, or Redis. |
| Execution / GitHub access | `DATABASE_URL`, `PGURL`, `READ_DATABASE_URL`, `REDIS_URL`, `PAYESH_BASE_URL`, and `PAYESH_METRICS_TOKEN` were absent (presence-only check; no values printed). Docker/Podman, PostgreSQL/Redis clients/servers, k6, and project `node_modules` were absent. GitHub Actions secret enumeration returned HTTP 403; secret names/values remain unknown and no values were read. | No isolated, reachable API+PostgreSQL+Redis E3 target was identified. This is an environment/access gap, not a consent gap. |

### Repo-owned documentation-reference debt closure (2026-10-19)

The three previously red documentation checks were repaired rather than waived:

- `docs/DOCS_INDEX.md` had a stale `../HANDOFF.md` path and the coverage test expected a non-existent root file. Both now agree on the canonical tracked `docs/HANDOFF.md`.
- `docs/ONBOARDING_NEW_DEVELOPER.md` named deleted `server/middleware/scope.js` and described the old memory-first data path. It now documents the live `server/policy.js` / `server/dbquery.js` boundary and PostgreSQL-mode source of truth; its test asserts the real paths.
- Added `docs/audit/INDEX.md` and meaningful references to the PEES phase reports and `PROJECT_MEMORY_SYSTEM.md`. `node tools/docs-metadata.js` now reports zero orphan documents; no audit report was excluded from the catalog.
- `tests/handoff-integrity.js` now checks the canonical `docs/HANDOFF.md` and is wired into `tests/run.js`; the standalone encoding/append-only suite passes 4/4.

Verification on the updated worktree: `node tests/docs-index-coverage.js` 75/75; `node tests/documentation-map-coverage.js` 23/23; `node tests/onboarding-coverage.js` 30/30; `node tests/handoff-integrity.js` 4/4; `node tests/docs-freeze-marker.js` 14/14; `node tools/docs-stats-sync.js --check --freeze` exit 0. `npm test` also exits 0 (tests/run.js 39/39, REST API suites 31/31, smoke 547/547). `node tools/docs-stats-sync.js --freeze` synchronized the current `rc44` manifest and map/metrics to **598 persistent documents** (484 root + 114 subdirectory). `node tools/docs-metadata.js` listed 676 physical Markdown documents, including the 78 excluded daily records, and reported no orphans. These results establish code/documentation regression behavior only; they do not change M15/E3 status.

### Security artifact containment (SI-013)

The five `tests/performance/results/w18-*.json` files were first added by commit `0069a23892323f8f45a1ed4386c3dc6129fb3862` (committer date 2026-09-25; reachable from the public repository's `origin/main`). The test-session credentials in those records had an embedded expiry of 2026-09-12; the exports also contained user-identity metadata whose synthetic/real provenance is unverified. In the current worktree, only the cookie and user object were redacted; a structural comparison confirmed each file's `metrics`, `root_group`, and workload model were unchanged. **Git history was not rewritten**; the public historical copies remain, so containment is local only. No credential/PII value is reproduced here. The repository scanner currently exits 1 (12 green / 1 red; 82 candidate hits, including test/dataset false-positive classes) and does not provide JWT-cookie coverage; it is not a clean security gate. See `docs/SECURITY_INCIDENT_LOG.md` SI-013. The event is provisionally classified P0 until the owner confirms whether the identity fields are synthetic and decides on history cleanup/notification.

### M15 decision and required evidence

- **M15-01:** **BLOCKED / REVALIDATION_REQUIRED** — static current-HEAD rebind complete; live route RPS, current query plans, deployment-level observability, and current DR evidence remain NOT RUN.
- **M15-02:** **NOT STARTED** — intentionally held; do not start from assumed, synthetic, or mismatched Wave 18 numbers.
- To unblock, use an authorized reachable staging environment and capture each E3 run against an exact SHA with command, environment, input, output, exit status, and run count. Query-plan work needs a current-schema read-only DB session/artifact; route-load work needs separate API/load-generator/DB resources and secure runtime credentials. Do not send secrets in chat. Until then, no current capacity or 10M-user operational claim is supported.

### Follow-up verification — documentation consistency and local suite (2026-10-19)

After the reference-debt closure above, the consistency audit exposed repo-owned issues: a regex boundary treated the decimal in “2.5 million” as a standalone “5 million” claim; migration inventory summaries were stale; and status tools disagreed. The boundary now excludes decimal punctuation and Western digits; the current migration guide/index/release-note addendum report the 26 forward migration files 001–026 while preserving older audit/release snapshots as historical. Status drift came from stats-sync counting only 44 freeze-manifest files while metadata's basename fallback marked three nested README documents with the root README's frozen status. The metadata parser now uses exact nested paths, stats-sync reads the canonical catalog status totals, and the map is aligned at 530 active / 45 frozen / 3 live / 20 archived. The generated search index now reports 4,001 tokens across all 676 physical catalog docs, including 78 daily records; heatmap/keyword/hub rankings remain historical snapshots. Re-running the consistency tool regenerated its report with **22/22** checks and zero conflicts. Other refreshed docs gates: docs health **9/9**, metrics **25/25**, metadata **18/18**, maintenance coverage **45/45**, index **75/75**, map **23/23** (zero orphans), onboarding **30/30**, handoff integrity **4/4**, freeze marker **14/14**; `docs-stats-sync --check --freeze` exited 0. The final `npm test` exited 0 (main suite 39/39, REST API suites 31/31, smoke 547/547). The test output explicitly reports no `DATABASE_URL` and selection of the JSON/in-memory dev/test store; this is not PostgreSQL/Redis evidence and does not change any M15 status.

**Disposition unchanged:** M15-01 is **BLOCKED / REVALIDATION_REQUIRED** pending current route RPS, schema-bound query plans, deployed observability/alert routing, and current DR restore/failover evidence. M15-02 remains **NOT STARTED** under the user-directed sequence; no synthetic or assumed numbers are promoted to E3. The current source SHA remains `8f6e7d5f0a823a70a58f85f7803a4d956db350ab`.

### M15-01 harness implementation review — 2026-10-19 (worktree-only)

The uncommitted worktree adds two isolated runtime E3 matrix runs and one disposable PostgreSQL PITR/HA plus Redis Sentinel workflow. It includes guarded relational fixtures, recent ISO attendance dates, manager-to-tenant/report checks, bounded route RPS, authenticated phone lookup `EXPLAIN`, cache-outbox timer/restart/replay checks, RedisDown firing/recovery delivery to a private CI-only webhook, and exact migration-catalog comparisons on the primary and PITR-restored application schema. Static review also fixed the MinIO init bucket environment and executes backup-container pgBackRest config rendering as root before applying postgres ownership/mode 0600.

Local-only checks on this worktree: `npm run build:check` exit 0; `npm test` exit 0 (39/39 + 31/31 + 547/547); M15 runtime unit 22/22; M15 DR unit 10/10; PITR args 5/5; HA config 100/100; observability config 23/23; documentation gates 75/75, 23/23, 30/30; syntax/YAML parse/`git diff --check` exit 0. The local runner has no Docker/Podman, PostgreSQL, Redis, k6, or actionlint. The new workflow has not run; there is no route-RPS result, current live plan, alert drill, queue observation, backup/restore, PITR, failover, or E3 artifact. No production traffic or remote database was touched.

The current Git `HEAD` is still `8f6e7d5f0a823a70a58f85f7803a4d956db350ab`; all harness and documentation changes are uncommitted. A local unit/mock or source check is not runtime proof. The GitHub workflow is intentionally not pushed/run before the user’s M15-01 completion gate; this leaves the work blocked rather than manufacturing evidence. M15-01 remains **BLOCKED / REVALIDATION_REQUIRED**; M15-02 remains **NOT STARTED**. Any single-host GitHub drill is at most E3: MinIO is colocated, the webhook is not on-call, and E4 still requires independent failure domains, off-site evidence, and a demonstrated alert-to-acknowledgement-to-runbook-to-recovery chain.

### M15-01 harness hardening and revalidation — 2026-10-20

On the dirty worktree bound to `arena/c33a022c-p2` / base checkout SHA `8f6e7d5f0a823a70a58f85f7803a4d956db350ab`, the CI harness received additional static hardening: random PostgreSQL credentials in protected mode-0600 env files; a mode-0640 (not world-readable) metrics-token file with a CI-only runner-group grant for the non-root Prometheus scraper; common DSN/token/key/cookie/authorization redaction; a fail-closed DR clean-tree check; raw DR command output staged outside the upload directory and promoted to evidence only after successful redaction; runtime inspection of effective API/load-generator users and resource limits; removal of transient route files; and a non-root runtime image with a narrower Docker context. Unit tests assert the new contracts, including that a DR PASS report remains insufficient to disposition M15-01.

**Local command results (not E3):** `npm ci` exit 0; `npm audit --omit=dev` exit 0 (0 production vulnerabilities); full `npm audit` exit 1 for one moderate dev-only Moment path-traversal advisory, not changed in this M15 scope; `npm test` exit 0 (main 39/39, smoke 547/547; database-backed integration was not exercised because `DATABASE_URL` is unset and the suite selected JSON/in-memory mode); M15 runtime unit 27/27; M15 DR unit 14/14; PITR argv contract 5/5; HA config 100/100; observability config 23/23; docs index 75/75; docs map 23/23 with zero orphans; onboarding 30/30; syntax checks and final `git diff --check` exit 0. Docs stats first detected a stale freeze count; after adding the current checkpoint text, a later check also found stale search-token/freeze counts. The canonical `--freeze` sync updated the map and freeze files, and the final `--check --freeze` plus docs-metrics 25/25 passed. No Docker/Podman, PG/Redis binaries, k6, endpoint variables, or M15 listeners are available in this sandbox.

**Operational state unchanged:** route RPS, current-schema query plan, deployed observability/alert delivery, queue/replay, PITR, and PostgreSQL/Redis failover remain **NOT RUN**. The new GitHub workflow has not been pushed or executed; no E3 artifact exists. No production request/load or remote restore was attempted. M15-01 remains **BLOCKED / REVALIDATION_REQUIRED**; M15-02 remains **NOT STARTED**. A single-runner result would be at most E3 and cannot establish independent failure domains, off-site recovery, on-call acknowledgement, E4, or production readiness. Do not push until M15-01's actual operational evidence gate is met.

### Dockerless execution feasibility — 2026-10-20

A containerless alternative was considered after the user requested Docker-free continuation. The sandbox is Debian 12 x86_64; `gcc` and `make` exist, but `postgres`, `initdb`, `pg_ctl`, `redis-server`, `redis-cli`, `prometheus`, `promtool`, `alertmanager`, `minio`, `mc`, `pgbackrest`, `pgbouncer`, and `go` are absent. The runtime harness requires real PostgreSQL 17.11, Redis 8.0.2, Prometheus 2.54.1, and Alertmanager 0.27.0; the DR harness also depends on PostgreSQL 16, Redis 7.4.2, MinIO, pgBackRest, and PgBouncer. No version-matched native stack has been provisioned or verified. JSON/in-memory mode, mocks, or an embedded SQL engine would not prove current-head operational behavior and are not acceptable substitutes. This sandbox cannot control or connect to the user's Windows host. Therefore route RPS, current-schema EXPLAIN, live alert delivery, queue/replay, PITR, and failover remain NOT RUN; no E3 artifact exists. M15-01 remains **BLOCKED / REVALIDATION_REQUIRED**, M15-02 **NOT STARTED**, and no push is made.


### Scope-limited workflow publication authorization — 2026-10-20

The user later explicitly authorized commit/push of the reviewed M15-01 implementation and required supporting files to the existing `arena/c33a022c-p2` branch solely to make the isolated GitHub Actions workflows available for evidence collection. This supersedes earlier no-push wording only for this scoped operation. It does not authorize pushing to `main` or another branch, merging, force-pushing, bypassing branch protections, or any production experiment. This permission does not itself supply operational evidence or independent acceptance: M15-01 remains **BLOCKED / REVALIDATION_REQUIRED**, M15-02 **NOT STARTED**, SI-013 remains provisional P0, and a single-runner E3 drill cannot establish E4 or production readiness.

### Pre-publication revalidation — 2026-10-20

Final local checks: `npm run build:check` passed; `npm test` passed (39/39 main, 31/31 REST API suites, 547/547 smoke), explicitly using the JSON/in-memory dev/test store because `DATABASE_URL` is absent. M15 runtime 29/29, DR 16/16, PITR argv 5/5, HA 100/100, observability 24/24 plus semantic guard, and documentation gates/freeze passed. Eight YAML files parse successfully. Docker/Compose and actionlint semantic/runtime validation remain unavailable in this sandbox, so no Docker build or operational run is claimed. The current secret scan remains exit 1 with 81 long-hex candidates in historical evidence/FT documents; raw values are withheld, and SI-013/P0 remains open. The five Wave 18 exports were redacted in the local worktree and structurally verified; those JSON edits are excluded from the M15-01 publication to avoid re-emitting removed values in a Git patch. Public history was not rewritten. No commit/push/workflow artifact exists at this checkpoint. The scoped user authorization permits only publishing the isolated workflow to the session branch; it does not accept evidence. M15-01 remains **BLOCKED / REVALIDATION_REQUIRED**, M15-02 **NOT STARTED**, and E4 unproven.

### Current-head Actions revalidation — 2026-10-21

The authorized branch `arena/c33a022c-p2` now contains three fast-forward commits after baseline `8f6e7d5f0a823a70a58f85f7803a4d956db350ab`: `0fa2f305a66a344a91aaca963158b72ae53a4570`, `aac25f38f464a2578a078310da0c2984e83f5c0d`, and current workflow SHA `69662f4232208cff059bdc3c6a176aabf2ecd182`. No other branch, merge, force-push, bypass, or production operation was used.

Exact-SHA run `39495570754` (M15-01) **failed**: both runtime matrix jobs stopped at `p11-phone-auth-live` before a runtime evidence report was written; the DR job stopped at `pg-ha-start`. Artifacts uploaded with failure/stage metadata, but their payloads could not be retrieved because the sandbox blocks the GitHub artifact-download redirect target. Exact-SHA run `39495570472` (observability) **failed**: static, `promtool`, and `amtool` checks passed after correcting container entrypoints, while Loki/Promtail ingestion verification and the dependent healthy-metric runtime test failed. Earlier exact-SHA runs on commits `0fa2f30` and `aac25f3` also failed; IDs and results are recorded in the execution plan and handoff.

Local revalidation: `npm test` passed (39/39 main, REST API 31/31, smoke 547/547) using JSON/in-memory mode because `DATABASE_URL` is absent; build check passed; M15 runtime unit 30/30, DR unit 16/16, PITR args 5/5, observability config 24/24, semantic guard, docs/freeze gates, YAML parse, and embedded Bash syntax passed. The secret scan remains FAIL (12 green / 1 red; 81 long-hex candidates; values withheld). The seven local capacity/W18 changes remain unpublished; public history was not rewritten.

**Evidence disposition:** the failed Actions attempts are traceable but do not establish accepted operational E3 evidence; the artifact content was not independently reviewed. No route-RPS, current-schema EXPLAIN, alert delivery, queue/replay, PITR restore, or failover scenario reached an accepted PASS. Independent review was not performed. M15-01 remains **BLOCKED / REVALIDATION_REQUIRED**; M15-02 remains **NOT STARTED**; SI-013/P0 remains open; E4 and production readiness are unproven. A single-runner CI drill cannot establish independent failure domains, off-site recovery, or the full alert → on-call → acknowledgement → runbook → recovery chain.

### Isolated E3 runtime, DR, and observability verification addendum (2026-10-21; `arena/9aa4efea-p2`)

On `arena/9aa4efea-p2`, all root-cause defects blocking isolated single-host E3 execution, HA PostgreSQL 16 + `pgBackRest` `2.59.3-1.pgdg12+1` + MinIO PITR/failover, 3-Sentinel Redis 7.4.2 quorum failover, `grafana/loki:3.1.1` / `promtail:3.1.1` observability runtime regression, and `Defender for DevOps` (`MSDO`) SARIF upload `403` permissions were resolved without weakening any gate:

- **E3 runtime & DR workflows (`M15-01 E3 Runtime Evidence`):** Run `39642161980` (`9c1471f71d80e03dfba1ce8f44d66cc2a9db590e`, Attempts 1 & 2 — 6/6 jobs `completed/success`) and Run `39657186882` (`fb262f7a063b9ef5dca686d902357269f9a8bb0c` — `run a` `119420455894`, `run b` `119420455785`, `dr` `119420455987`, artifacts `12372418673`, `12373120361`, `12370869905`) verified: 26 applied migrations (`026`, catalog SHA-256 `7743953e67a9f6421a245143501f010532c02056427d8d480725fdecfcd14eb6`); tenant/province policy validity; P11 live `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` index scan (`users_seq_scan: false`, `0.028–0.032 ms`); 5 live API routes with zero Prometheus counter drift (`counter_delta === requests`); real `docker restart` outbox worker replay with preserved `INSTANCE_ID`, active timer (`250 ms`), zero manual `tick()`, and independent second consumer watermark convergence (`watermark: 1`); live Redis outage firing + post-recovery resolved Alertmanager webhook delivery; isolated PostgreSQL time-target PITR (`before_marker_restored: true`, `after_marker_excluded: true`, `restored_catalog_verified: true`); PostgreSQL standby promotion + post-promotion write (`rto_ms: 11973–12177`, `pgbouncer_reroute_tested: false`); and 3-Sentinel Redis failover + post-promotion write.
- **Observability workflow (`observability-regression`):** Run `39657186919` (`fb262f7a063b9ef5dca686d902357269f9a8bb0c` — jobs `119420456156`, `119420457463`, `119420714271`) verified `promtool`, `amtool`, Alertmanager placeholder fail-closed exit `78`, `grafana/loki:3.1.1` + `promtail:3.1.1` `server.log` and `trace_id="runtime-trace-001"` structured-metadata ingestion, and all config/mutation/dashboard suites.
- **Updated audit disposition:** Isolated E3 single-runner runtime, PITR/failover DR, and observability runtime subsets are **VERIFIED** via machine-emitted Check Run annotations and uploaded redacted artifacts; overall **M15-01** remains **REVALIDATION_REQUIRED** pending independent acceptance of the uploaded artifact ZIP archives; **E4** (`pgbouncer` automated reroute, multi-host/cross-AZ failure domains, off-site CRR, live human on-call acknowledgement chain) remains **NOT RUN**; **M15-02** remains **NOT STARTED**; **SI-013/P0** remains **OPEN** (`tests/secret-scan.js` 12 green / 1 red, 81 historical long-hex candidates withheld).
