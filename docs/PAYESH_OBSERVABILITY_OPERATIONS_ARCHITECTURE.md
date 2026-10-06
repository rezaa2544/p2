# PAYESH — Observability & Operations Architecture

**Status:** PROPOSED / QUEUED  
**Track:** M15-OBSERVABILITY-ARCHITECTURE  
**Scale target:** 10M+ users

## 1. Goal

Provide an independent operational visibility plane that can observe Payesh even when one or more application servers are unhealthy or completely unavailable.

## 2. Target architecture

```
                    ┌─────────────────────────────┐
                    │ Independent Monitoring      │
                    │ Cluster / Server             │
                    │                             │
                    │ Metrics • Logs • Traces     │
                    │ SLO • Alerts • Retention    │
                    └──────────────┬──────────────┘
                                   ▲
              ┌────────────────────┼────────────────────┐
              │                    │                    │
          metrics                logs                traces
              │                    │                    │
      ┌───────┴──────┐      ┌─────┴─────┐       ┌──────┴─────┐
      │ Payesh App   │      │ Log Agent │       │ Trace      │
      │ Fleet        │      │ / Buffer  │       │ Collector  │
      └──────────────┘      └───────────┘       └────────────┘
```

The monitoring plane must have a separate failure domain from the application plane.

## 3. Monitoring responsibilities

Monitor at four layers:

1. Infrastructure — CPU, RAM, disk, network, process health.
2. Runtime — event-loop lag, heap, GC, restarts, worker state.
3. Dependencies — PostgreSQL, Redis, queues, external dependencies.
4. Application — request rate, error rate, latency, cache, authentication/authorization failures and business-critical SLOs.

Minimum signals:
- availability
- latency p50/p95/p99
- error rate
- saturation
- DB connection pool utilization
- Redis health/latency/memory
- queue depth/age/retry/DLQ
- cache hit/miss/invalidation lag
- disk free percentage
- log shipping lag
- process restart count

## 4. Alerting model

Alerts must be severity-based:

- P0: outage/data-integrity/security emergency
- P1: major degradation or imminent capacity failure
- P2: sustained degradation requiring intervention
- P3: operational warning

Every alert needs:
- condition
- threshold/window
- owner
- runbook
- deduplication policy
- escalation path
- recovery/resolve condition

Avoid alert storms with grouping, suppression and bounded cardinality.

## 5. Monitoring-of-monitoring

The monitoring system itself must be monitored externally or have an independent liveness path.

A single monitoring server is not considered highly available merely because it is separate from Payesh.

For 10M+ production, target a monitoring cluster or redundant monitoring path.

## 6. Logging architecture

Application logs should be structured and include bounded-cardinality:
- timestamp
- level
- service
- instance
- request/correlation ID
- trace ID where available
- route/category
- error code
- duration where relevant

Secrets, credentials, OTPs, access tokens and sensitive payloads must never be logged.

Audit/security logs require a separate retention/access policy.

## 7. Log rotation

Rotation must protect application availability and disk capacity.

Required policy:
- rotate by size and/or time
- compress rotated logs
- explicit retention count/age
- bounded total local disk usage
- safe atomic rotation
- permissions preserved
- no unbounded file growth
- behavior defined when remote collector is unavailable
- backpressure/drop policy documented for non-critical logs
- critical audit/security logs must have stronger durability requirements

The application must not become unavailable merely because logs consume disk.

## 8. Remote log aggregation

Local files are a buffer, not the long-term source of truth.

Target:

```
Application
   ↓
Local structured log
   ↓
Rotation / bounded buffer
   ↓
Log Agent
   ↓
Remote Aggregator
   ↓
Search / Alert / Retention
```

The agent must tolerate temporary network/sink failure without causing application failure.

## 9. Retention classes

At minimum define separate policies for:
- operational logs
- application errors
- security/audit logs
- performance/trace data
- debug logs

Retention must be driven by operational, security and legal requirements rather than arbitrary disk capacity.

## 10. Failure scenarios

Must be tested:
- monitoring server down
- monitoring network partition
- log collector down
- remote sink slow/unavailable
- disk nearly full
- disk full
- rotation during high write rate
- application restart during rotation
- collector restart
- metrics cardinality explosion
- monitoring overload
- Redis/PostgreSQL outage and resulting alert correctness

Expected invariant:

**Observability degradation must not become application outage.**

## 11. Capacity / 10M+ readiness

The architecture must be dimensioned from measured:
- monitored instance count
- metrics cardinality
- samples/sec
- logs/sec
- average/peak log size
- traces/sec
- retention duration
- compression ratio
- network bandwidth
- storage IOPS/capacity

No 10M+ capacity claim without load/soak evidence.

## 12. Workstream

1. M15-OBS-01 — inventory current health/metrics/logging
2. M15-OBS-02 — monitoring architecture + alert matrix
3. M15-OBS-03 — structured logging + correlation
4. M15-OBS-04 — log rotation/retention/disk protection
5. M15-OBS-05 — remote aggregation
6. M15-OBS-06 — monitoring HA / monitoring-of-monitoring
7. M15-OBS-07 — failure drills
8. M15-OBS-08 — load/soak/capacity validation
9. Hermes independent verification
10. ChatGPT final reconciliation

## 13. Definition of Done

- independent failure domain
- metrics/log/traces contracts
- alert matrix + runbooks
- log rotation + compression + retention
- disk exhaustion protection
- remote aggregation
- monitoring failure detection
- failure/recovery evidence
- measured capacity
- independent verification on current HEAD

**Design status: PROPOSED. Implementation has not yet been claimed.**

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

## M15 V2 OBSERVABILITY RECONCILIATION — 2026-10-06

**Bound HEAD:** `1b19449f49a2952d2fbda99053f9af42f2cf4c6c`. **Status: DESIGN INTEGRATED — NOT VERIFIED.** Queue: M15-14 (plane), M15-13 (event-loop/log safety), M15-16 (deployment), M15-19 (game days). Rule: **observability must never become an application failure.**

### Invariants added
- Telemetry is **bounded, async, lossy, non-blocking, fail-open**; drop priority debug < info < warn < error; dropped counts are themselves metrics.
- **Cardinality budget:** no tenant/user/URL-id labels on metrics (tenant only as top-N in logs/analytics/traces); trace sampling tail-based (keep errors/slow).
- **Independence** means separate host/network/deploy path from the app plus **external black-box probes** and a **dead-man's switch**; a single separate server is not HA (unchanged from §5).
- Event-loop delay (`monitorEventLoopDelay`) is an SLI and an admission input; TARGET p99 < 50–100 ms is a target, not a fact.
- Audit/security logs keep a stronger durability class than operational logs.

### What exists (static inspection; deployment NOT evidenced; sweep PARTIAL)
`infra/observability/` (prometheus, alertmanager, loki, promtail, otelcol, grafana, 11 alert rules), `infra/tracing/` (jaeger dev/prod, tail-sampling collector), OpenTelemetry dependencies in `package.json`, custom metrics module `server/metrics.js` (no `prom-client`; label-name filtering, no cardinality cap), event-loop lag as timer-drift gauge only (`metrics.js:700-711`), `/api/liveness` vs `/api/readiness` split, graceful drain.
**Not found:** dead-man's switch, black-box probes, monitoring-of-monitoring, log shipper wiring from the app, async audit by default (`PAYESH_AUDIT_ASYNC=1` opt-in; default `appendFileSync`, `audit.js:185-195`), outbox/DLQ true depth and age metrics (`outbox.js:209-219` reads a 1000-cap RAM mirror), pool-wait histogram, L1 eviction and invalidation-lag metrics.

### Acceptance for M15-14 (additions to §13)
Kill the monitoring plane → app SLO unchanged; kill the app → external alert fires; flood labels → series count stays within budget and drop counter rises; log sink down → bounded disk, no request impact; disk-full drill (`infra/wal-drill` covers PG WAL only, not app/log disk).

Status line: **Observability V2 = DESIGN INTEGRATED / NOT IMPLEMENTED / NOT VERIFIED.**
