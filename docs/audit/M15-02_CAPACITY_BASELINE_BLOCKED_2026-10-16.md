# M15-02 Capacity Baseline — BLOCKED / NOT VERIFIED

**Recorded:** 2026-10-16  
**Mission:** M15-02 — Capacity baseline & model  
**Priority / track:** P0 / PRIMARY  
**Evidence status:** BLOCKED — no operational baseline was executed  
**Base repository SHA:** `8f6e7d5f0a823a70a58f85f7803a4d956db350ab`

## Decision

Do not claim a measured capacity baseline, capacity certification, or completion. The authorized local Desktop Commander device is unavailable, and no alternate authorized operational connection to the intended host, PostgreSQL, or Redis was available in this session.

## Direct evidence

- Desktop Commander device inventory returned:
  - Device: `Reza`
  - ID: `b4eb1184-c1c5-4edd-80fa-23b306e8fcba`
  - Status: `Offline`
  - Last seen: `473h ago`
  - App version: `0.2.51`
- Canonical M15-02 Notion item: https://app.notion.com/p/3f9ba74ecd988110b20cfc16091cf4e8
- Current Work Queue snapshot: https://app.notion.com/p/3f6ba74ecd9881ac972de7055540a7ea
- Tracking issue: https://github.com/rezaa2544/p2/issues/468
- Related CI remediation (not merged): https://github.com/rezaa2544/p2/pull/467

No RPS, latency, CPU, RAM, PostgreSQL, Redis, queue, or event-loop measurement was performed. No synthetic test result is represented as an operational measurement.

## Required evidence to unblock

For every run, record the exact command, repository HEAD SHA, host/runtime versions, target endpoints (without secrets), input/workload profile, duration, repeat count, raw output/artifact URI, and limitations.

Measure at minimum:
- Throughput and latency: achieved RPS, p50/p95/p99, errors/timeouts, concurrency and warm-up.
- Host resources: CPU, RAM, disk I/O and network.
- PostgreSQL: active/idle pool, query plans, query latency, lock/wait and transaction metrics.
- Redis: operations/sec, latency, memory/evictions and connection health.
- Async path: queue depth/age, worker throughput/retries and event-loop delay.
- Repeated baseline runs plus explicitly defined NORMAL / PEAK / EXTREME load profiles, only where the actual operational environment can safely support them.

Reconcile measured results with `docs/CAPACITY_MODEL.md`. Its current figures (10M registered users, 2.5M concurrent users, ~20k RPS) are planning assumptions until measured; they are not observed capacity.

## Execution sequence

1. Restore the authorized Desktop Commander connection or another explicitly authorized route.
2. Prove the intended live host, application build and PostgreSQL/Redis endpoints before any load.
3. Run M15-02 and preserve raw E3 evidence bound to the exact HEAD.
4. Have Hermes independently reproduce or challenge the evidence.
5. Update the capacity model and Notion queue only from the measured results.

M15-09, M15-12 and M15-17 remain parallel-eligible only when they have independent evidence and do not delay M15-02. This blocker does not reprioritize or replace M15-02.

## Evidence Gate

- Runtime measurement: **NOT RUN**
- Operational DB/Redis access: **NOT AVAILABLE**
- Local device: **BLOCKED / OFFLINE**
- Capacity result: **NOT VERIFIED**
- Certification: **NOT GRANTED**
