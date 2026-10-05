# Payesh — System Scale & Reliability Gap Audit — 2026-10-05

## Scope
Current main HEAD: `2fab2f9b2533bef944458a1fc05643fac1ded892`.

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

Status: OPEN — architecture/readiness program, not a certification.
