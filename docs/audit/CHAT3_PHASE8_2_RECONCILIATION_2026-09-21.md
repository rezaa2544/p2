# Chat 3 — Phase 8.2 Architecture / Data Integrity Reconciliation

**Date:** 2026-09-21  
**Repository:** `rezaa2544/p2`  
**Chat 3 audited SHA:** `138cd1d9b03278fcf15c6476faa497fe89d275af`  
**Current roadmap baseline:** current `main` / later reconciliation evidence takes precedence over this historical audit.

## Evidence rule
This report is treated as a red-team input, not as current-main truth. Claims are classified as **confirmed in later/current evidence**, **reproduction required**, **already tracked**, or **not accepted as stated**. A finding from the historical SHA does not change a Gate by itself.

## Reconciliation matrix

| ID | Chat 3 claim | Current disposition | Roadmap action |
|---|---|---|---|
| ARCH-001 | Full boot hydration can cause OOM | **PARTIALLY SUPERSEDED / MEASUREMENT REQUIRED** | Hydration guards/caps already exist. Keep a cold-boot/national-dataset E4 measurement before capacity claims; do not reopen 8.2 solely from the historical claim. |
| SEC-001 | Redis outage leaves revoked sessions exposed | **ALREADY GOVERNED** | Reconciles with R6-A3/A5 accepted-risk policy and bounded JWT TTL. No new blocker; keep as explicit security risk. |
| REDIS-001 | `sessver:<userId>` is Redis-only and can disappear on restart/eviction | **CONFIRMED ARCHITECTURAL LIMIT / DEFERRED** | R6-A10 `users.security_version` remains TARGET/POLICY, not implemented. Track in existing 8.3/8.4 backlog; not a new 8.2 blocker because it is already governed as accepted risk. |
| OUTBOX-001 | Outbox is disconnected from the main sync mutation stream | **NEEDS CONTRACT RECONCILIATION** | Current architecture documents sync as transactional, while `server_outbox` is used for delete/tombstone events. Before claiming 25k events/s, define exactly which mutations are event-producing and prove coverage. |
| OUTBOX-002 | `FOR UPDATE SKIP LOCKED` is ineffective when fetch runs outside a transaction | **HIGH-VALUE REPRODUCTION REQUIRED** | The indexed code path shows `worker` calling `fetchPendingBatch(50)` without a client and `fetchPendingBatch` accepting `client=null`. Later queue-outage drills prove buffering/dedupe/drain but do not by themselves prove multi-worker row-lock exclusivity. Add a two-worker concurrency test on live PG before empirical multi-worker scale claims. |
| DB-001 | Tenant guard causes four SQL reads/request | **CODE PATH CONFIRMED / MEASUREMENT REQUIRED** | Do not accept the 10k→40k QPS and p95 extrapolation as measured. Instrument query count/latency and test a request through the real route. Architecture decision on caching remains open until measurement. |
| MIG-001 | psql execution and ledger INSERT are separate transactions | **CODE PATH CONFIRMED / NON-BLOCKING FOLLOW-UP** | Preserve as migration-runner crash-window hardening item. Add an interruption/recovery test or redesign the psql path; this does not independently block current 8.2 exit. |
| CONC-001 | Redis outage can bypass sync backpressure | **ALREADY GOVERNED / MEASUREMENT FOLLOW-UP** | R7 policy is documented; verify actual outage behavior and queue protection before Phase 8.3 empirical capacity tests. |
| DR-001 | Physical restore depends on pgBackRest | **ALREADY TRACKED BY M2/S4** | Do not create a second DR blocker. M2 remains the canonical E4 PG+Redis restore/promote + RPO/RTO drill. |
| OBS-001 | Alertmanager has a webhook placeholder | **CONFIRMED / ALREADY M1** | `__WEBHOOK_URL__` is intentionally a configuration placeholder. It becomes an exit blocker only because S3 requires a live alert→on-call→ack→runbook→recovery drill. |
| PGB-001 | PgBouncer 2000/25 is below a 3500 target | **CAPACITY-TARGET RECONCILIATION REQUIRED** | Treat 3500 as a target only if the current capacity contract still requires it. Verify through capacity model and E4 load evidence rather than changing config from the audit alone. |
| WORKER-001 | Health endpoints may remain green while worker loop is stalled | **OBSERVABILITY FOLLOW-UP** | Add worker liveness/queue-lag evidence to the M1/S3 operational drill; do not mark as a separate 8.2 gate unless exit criteria require it. |

## Durable impact
Chat 3 adds **one important reproduction task** that is not safe to close from static inspection alone: multi-worker Outbox claim/lock exclusivity. It also reinforces two already-known measurement areas: tenant-policy query amplification and E4 restore/observability evidence.

It does **not** justify reopening Phase 8.1 or declaring a new independent Phase 8.2 blocker from the historical SHA. The existing Gate remains governed by M1 (S3 live alert/on-call/recovery) and M2+M3 (S4 PG/Redis restore/failover with measured RPO/RTO).

## Required execution order after this report
1. Reproduce OUTBOX-002 with two concurrent workers against live PostgreSQL.
2. Measure DB-001 query/request and latency on a real authenticated route.
3. Keep M1 live alert/on-call/recovery drill as the first 8.2 exit blocker.
4. Keep M2+M3 E4 restore/failover and measured RPO/RTO as the second blocker.
5. Only after those gates pass, proceed to Phase 8.3 empirical scale testing; include Outbox multi-worker evidence and tenant query measurements in the baseline.

**Status after reconciliation:** Phase 8.2 Exit = **NOT VERIFIED**; Phase 8.3 = **BLOCKED** pending the existing Gate 8.2 evidence.
