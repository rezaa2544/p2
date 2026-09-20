# Service Level Objectives (SLO) & Service Level Indicators (SLI) Specification

**Document Reference:** `docs/SLO.md`
**Execution Context:** Phase 8.2 Sprint S2 (Sequence 23, Deliverable B3)
**System Version:** Payesh National Educational Platform v1.0.0
**Effective Date:** 2026-09-20 (۲۹ شهریور ۱۴۰۵)
**Governance Authority:** SRE, Database Reliability & Platform Security Board
**Target Scale Baseline:** 10,000,000 Registered Users · 2,500,000 Peak Concurrent · 20,000 Peak RPS · 2,500 Write TPS · 25,000 Events/s · 25,000 PG IOPS · 300 MB/s Throughput · 45,000 Redis ops/s · 3,500 Database Connections (`docs/CAPACITY_MODEL.md`)
**Inherited Phase 5 Standards:** `docs/PHASE5_OPERATIONAL_SLO_ENFORCEMENT.md` (§1 Standards: p95 $\le 300\text{ms}$, p99 $\le 1000\text{ms}$, 5xx rate $< 0.1\%$, Outbox lag $\le 500\text{ms}$, Replication lag $\le 300\text{ms}$)
**Governance Note:** Sign-offs in Section 6 represent documentation governance approval. In strict compliance with Phase 5 §2, in the absence of live production telemetry, performance thresholds are strictly marked `TARGET/POLICY — MEASUREMENT REQUIRED` (or `NOT_VERIFIED`).

---

## 1. Governance, Terminology & Metric Disciplines

To eliminate ambiguity, prevent operational drift, and prohibit greenwashing, this specification enforces five distinct levels of metrics, definitions, and verification disciplines:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        METRIC DISCIPLINE HIERARCHY                     │
├────────────────────────────────────────────────────────────────────────┤
│  1. SLI (Service Level Indicator)   │ Quantitative formula & metric    │
│  2. SLO (Service Level Objective)   │ Target reliability commitment    │
│  3. Alert Threshold                 │ Trigger for automated paging/NOC │
│  4. Engineering Target              │ Sizing & capacity envelope       │
│  5. Measured Result                 │ Empirically proven test evidence │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Strict Definitions
1. **Service Level Indicator (SLI):** A precisely defined mathematical evaluation of service performance measured at a specific observer boundary over time (e.g., ratio of successful HTTP requests to total valid requests).
2. **Service Level Objective (SLO):** The formal target commitment for an SLI over a specified rolling window (e.g., 99.95% over 30 days).
3. **Alert Threshold:** The actionable boundary codified in `infra/observability/alert-rules.yml` and `infra/observability/alerts.yml` that alerts human on-call engineers before the SLO error budget is exhausted.
4. **Engineering Target (Architecture Design Envelope):** Theoretical or calculated capacity parameters derived from `docs/CAPACITY_MODEL.md`. **Design targets must never be presented as measured evidence.**
5. **Measured Result:** Empirically verified data points obtained via live runtime test execution, deterministic CI suites, or live production drills with timestamped evidence.

### 1.2 Epistemic Status Categories
- **`[POLICY — INHERITED]`**: Official mandated threshold established in `docs/PHASE5_OPERATIONAL_SLO_ENFORCEMENT.md`.
- **`[TARGET/POLICY — MEASUREMENT REQUIRED]`**: Architectural requirement or design capacity limit requiring empirical proof in Phase 8.3 load tests.
- **`[MEASURED]`**: Empirically proven by existing automated tests or live drills on the repository, citing the exact test file, test count, and reproduction command.

---

## 2. National Scale Baseline & Workload Profile

All objectives in this catalog are tied directly to the national deployment scale baseline (`docs/CAPACITY_MODEL.md`):

| Dimension | Engineering Parameter | Basis / Derivation |
|---|---|---|
| **Registered Users** | **10,000,000** | Canonical national student, teacher, and administrative registry (`docs/CAPACITY_MODEL.md` §1) |
| **Peak Concurrent Users** | **2,500,000** | Worst-case back-to-school morning peak (07:00–09:00 Mehr surge) |
| **Peak HTTP Throughput** | **20,000 RPS** | Morning peak ingestion across API gateway cluster (`docs/CAPACITY_MODEL.md` §1.1) |
| **Peak Mutation Writes** | **2,500 TPS** | Synchronous attendance taking, grade submission, profile updates, and sync pushes |
| **Event Stream Ingestion** | **25,000 events/s** | Transactional outbox event generation across all nodes (`server_outbox`) |
| **PostgreSQL IOPS** | **≥ 25,000 sustained IOPS** | 4KB random read/write storage envelope on NVMe storage array (`docs/CAPACITY_MODEL.md` §2.1) |
| **PostgreSQL Storage Throughput**| **≥ 300 MB/s** | Sustained sequential WAL write + checkpoint throughput |
| **Redis Ingestion Rate** | **≈ 45,000 ops/s** | Distributed denylist, sliding-window rate limiters, OTP, and L2 cache (`docs/CAPACITY_MODEL.md` §2.2) |
| **Database Connection Capacity**| **3,500 connections** | Cluster-wide connection capacity multiplexed via PgBouncer into ≤ 256 backend connections |

---

## 3. Master National Scale SLO Specification (All 17 Required Core Items)

The table below provides the full specification for the 17 core operational items across the 11 platform pillars. Every single row contains all 11 required columns:

| SLI | Metric | Threshold | Window | Scope | Owner | Alert Threshold | Escalation | Data Source | TARGET/POLICY vs MEASURED | Evidence Method |
|---|---|---|---|---|---|---|---|---|---|---|
| **1. API Availability** | `payesh_http_requests_total` | **≥ 99.95%** successful (non-5xx) responses | Rolling 30 days | All public `/api/*` endpoints | API Platform Lead | 5xx rate > 0.1% over 5m for 2m | Alertmanager → NOC On-Call → Declare IC (`docs/INCIDENT_PLAYBOOK.md` Phase 1) | Prometheus `/metrics` | **POLICY — INHERITED (MEASUREMENT REQUIRED)** | Inherited from `docs/PHASE5_OPERATIONAL_SLO_ENFORCEMENT.md`; verified in CI (`tests/server17.js`); 30-day soak in Phase 8.3 |
| **2. HTTP p95 Latency** | `payesh_http_request_duration_seconds_bucket` | **p95 ≤ 300 ms** | Rolling 1 hour | All authenticated `/api/*` requests | Core Backend Lead | p95 > 300 ms for 5m (`HighLatency`) | On-call engineer inspects Grafana trace exemplars / Loki `trace_id` | Prometheus histogram | **POLICY — INHERITED (MEASUREMENT REQUIRED)** | Inherited from Phase 5 standard ($\le 300\text{ms}$); in-memory microbenchmark p95 = 0.95 ms (`docs/SESSION_REVOCATION.md` §5); network test in Phase 8.3 |
| **3. HTTP p99 Latency** | `payesh_http_request_duration_seconds_bucket` | **p99 ≤ 1,000 ms** | Rolling 1 hour | All authenticated `/api/*` requests | Core Backend Lead | p99 > 1.0 s for 10m (`PayeshLatencyP99Breach`) | Page SRE On-Call → Inspect slow queries and event loop lag | Prometheus histogram | **POLICY — INHERITED (MEASUREMENT REQUIRED)** | Inherited from Phase 5 standard ($\le 1000\text{ms}$); Wave 18 k6 load test validation scheduled for Phase 8.3 |
| **4. Write TPS Throughput** | `payesh_http_requests_total{method=~"POST\|PUT\|PATCH"}` | **2,500 writes/sec** sustained at p95 ≤ 300 ms | Peak 2-hour window (07:00–09:00) | State mutation endpoints (grades, attendance, sync) | Database Reliability Lead | Write throughput drops > 30% below expected during peak | DBA On-Call → Inspect DB lock contention | Prometheus `/metrics` | **TARGET/POLICY — MEASUREMENT REQUIRED** | Calculated capacity in `docs/CAPACITY_MODEL.md` §1; full benchmark proof scheduled in Phase 8.3 |
| **5. DB Query Latency** | `payesh_db_query_duration_seconds` / `payesh_db_query_latency_ms` | **p95 < 25 ms** for transactional queries | Rolling 5 minutes | PostgreSQL Primary | DBA Lead | `payesh_db_query_latency_ms > 50` for 5m (`DBLatencyHigh`) | Page DBA On-Call → Inspect slow queries (`payesh_db_slow_queries_total`) | Prometheus `/metrics` | **TARGET/POLICY — MEASUREMENT REQUIRED** | Query duration tracked in `tests/server17.js`; live saturation test in Phase 8.3 |
| **6. DB Pool Utilization** | `payesh_db_pool_connections` / `payesh_db_pool_waiting` | **0 waiting clients** at p99; utilization ≤ 85% | Rolling 5 minutes | PgBouncer + Node pool | DBA Lead | Pool waiting > 0 and idle == 0 for 2m (`PayeshDbPoolSaturated`) | Page DBA On-Call → Scale PgBouncer backend pool or throttle traffic | Prometheus `/metrics` | **TARGET/POLICY — MEASUREMENT REQUIRED** | Sizing envelope in `docs/CAPACITY_MODEL.md` §3.2; live pool test in Phase 8.3 |
| **7. PG Error Rate** | `payesh_db_query_errors_total` | **< 0.01%** (less than 1 SQL error per 10,000 queries) | Rolling 15 minutes | PostgreSQL Primary & Replicas | DBA Lead | Error rate > 1% over 5m (`PayeshDbErrorRate`) | P0 Page to DBA Lead and IC → Check replication and disk space | Prometheus `/metrics` | **TARGET/POLICY — MEASUREMENT REQUIRED** | Error handling verified in `tests/r2-postgres-authority-fail-closed.js` (32/32 PASS) |
| **8. Redis Availability** | `payesh_redis_up` | **≥ 99.99%** uptime (Sentinel cluster 1M + 2R) | Rolling 30 days | Redis Cluster | Distributed State Lead | `payesh_redis_up == 0` for 1m (`RedisDown`) | P0 Page → Sentinel auto-failover (< 30s) or manual triage (`docs/DR_RUNBOOK.md` §2) | Prometheus `/metrics` | **TARGET/POLICY — MEASUREMENT REQUIRED** | Failover runbook codified in `docs/DR_RUNBOOK.md` §2; live chaos drill in Phase 8.3 |
| **9. Redis Error Rate** | `payesh_rate_limit_decisions_total` | **< 0.05%** unexpected command errors | Rolling 15 minutes | Redis Cluster | Distributed State Lead | Error rate > 0.5% over 5m | Page On-Call Systems Engineer → Inspect memory and network | Prometheus `/metrics` | **TARGET/POLICY — MEASUREMENT REQUIRED** | Redis fail-closed verified in `tests/phase2-redis-fail-closed.js` (BLOCKER 5 PASS) |
| **10. Outbox Processing Lag**| `payesh_outbox_depth` / `payesh_sync_queue_depth` | **p95 ≤ 500 ms** from commit to consumption | Rolling 15 minutes | Async workers (`server/worker.js`) | Event Platform Lead | Outbox backlog > 500 pending events for 10m (`PayeshOutboxBacklog`) | Alert Worker Specialist → Inspect worker consumer threads | Prometheus `/metrics` | **POLICY — INHERITED (MEASUREMENT REQUIRED)** | Inherited from Phase 5 standard ($\le 500\text{ms}$); queue depth verified in `tests/wave14-observability.js`; live load in Phase 8.3 |
| **11. Queue Depth** | `payesh_sync_queue_depth` | **< 1,000 pending items** | Rolling 5 minutes | Sync outbox queue | Sync Platform Lead | `payesh_sync_queue_depth > 1000` for 5m (`SyncQueueDepth`) | SRE Specialist → Apply Nginx edge traffic-shaping | Prometheus `/metrics` | **TARGET/POLICY — MEASUREMENT REQUIRED** | Queue cap logic verified in `server/worker.js`; live queue saturation in Phase 8.3 |
| **12. Audit Write Failures** | `payesh_audit_write_failures_total` | **0 dropped audit logs** on state mutations (100% atomic) | Rolling 30 days | All state-altering operations | Compliance & SecOps Lead | `payesh_audit_write_failures_total > 0` for 1m (`PayeshAuditWriteFailure`) | P0 Page to Lead Auditor & SecOps → Revert unverified mutations | Prometheus `/metrics` + Loki | **MEASURED** | Empirically verified at E3/E4 in `tests/canary-atomic-postgres-live-runtime.js` (10/10 PASS) and `tests/observability-s2-metrics.test.js` (4/4 PASS) |
| **13. Authority Unavailable**| `payesh_authority_unavailable_total` | **0 unauthorized bypasses** (100% fail-closed on outage) | Continuous / Per incident | Control-plane authority modules | Platform Security Architect | `payesh_authority_unavailable_total > 0` for 1m (`PayeshAuthorityUnavailable`) | Immediate Page to SecOps & DBA → Verify PostgreSQL attachment | Prometheus `/metrics` + Audit Log | **MEASURED** | Empirically verified in `tests/r1-eliminate-ram-authorities.test.js` (49/49 PASS) and `tests/r2-postgres-authority-fail-closed.js` (32/32 PASS) |
| **14. Canary Correctness** | `payesh_http_requests_total{stage=~"canary\|stable"}` | **\|Configured % - Observed %\| ≤ 0.5%** | Rolling 1 hour during rollout | Dynamic traffic fabric routing | Release Engineering Lead | Traffic split deviation > 2.0% for 5m | Release Engineer On-Call → Halt rollout; trigger atomic rollback | Prometheus `/metrics` | **TARGET/POLICY — MEASUREMENT REQUIRED** | Atomic rollback verified in `tests/canary-atomic-postgres-live-runtime.js` (`[MEASURED]`); dynamic split proof in Phase 8.3 |
| **15. Migration Integrity** | `schema_migrations` table ledger | **100% deterministic SHA-256** checksum verification | Per release cycle | All migrations (`migrations/001→020`) | Principal DBA | Checksum mismatch or uncommitted migration | Release Blocked → Abort deployment pipeline | PostgreSQL `schema_migrations` | **MEASURED** | Empirically verified in `tests/schema-migrations-ledger.test.js` (8/8 PASS) and `tests/migration-sequence.js` (19/19 PASS) |
| **16. Backup / Restore RPO** | Data loss window on recovery | **RPO ≤ 5 minutes** (PG primary crash); **RPO ≤ 1 second** (Redis crash) | Per DR drill / disaster event | National primary cluster | DBA Lead & SRE Lead | WAL archiving lag > 2 minutes | Page Primary DBA → Check WAL archive storage mount | Backup catalog & WAL timestamps | **TARGET/POLICY — MEASUREMENT REQUIRED** | Codified in `docs/DR_RUNBOOK.md` §0; live destructive restore drill scheduled in Phase 8.3 |
| **17. Backup / Restore RTO** | System recovery downtime | **RTO ≤ 4 minutes** (PG standby promote); **RTO < 30s auto / ≤ 2m manual** (Redis) | Per DR drill / disaster event | National primary cluster | Lead Incident Commander | Standby promotion exceeds 3 minutes | Escalate to Chief Infrastructure Architect | Incident timeline logs | **TARGET/POLICY — MEASUREMENT REQUIRED** | Codified in `docs/DR_RUNBOOK.md` §0 & `docs/INCIDENT_PLAYBOOK.md` §2.2; live drill in Phase 8.3 |

---

## 4. Alert Ownership Catalog (S2 Governance Matrix)

All production alerts referenced in `infra/observability/alert-rules.yml` and `infra/observability/alerts.yml` are mapped below with operational ownership and escalation paths. Roles requiring human on-call staffing are explicitly tagged:

| Alertname | Severity | Service | Environment | Owner / Team | Runbook Reference | Escalation | Operationally Executable Status |
|---|---|---|---|---|---|---|---|
| **HighErrorRate** | critical | `payesh-api` | production | API Platform Team | `docs/DR_RUNBOOK.md` §0 | Primary On-Call → IC Page | **TARGET/POLICY / NOT VERIFIED** (Requires human on-call team) |
| **HighLatency** | warning | `payesh-api` | production | Core Backend Team | `docs/INCIDENT_PLAYBOOK.md` §2.2 | Primary On-Call → Loki trace review | **TARGET/POLICY / NOT VERIFIED** (Requires human on-call team) |
| **RedisDown** | critical | `redis` | production | Distributed Systems Team | `docs/DR_RUNBOOK.md` §2 | Page DBA / Systems Engineer → Sentinel triage | **TARGET/POLICY / NOT VERIFIED** (Requires human on-call team) |
| **DBLatencyHigh** | warning | `postgres` | production | Database Reliability Team | `docs/INCIDENT_PLAYBOOK.md` §2.2 | Primary On-Call → DBA Page | **TARGET/POLICY / NOT VERIFIED** (Requires human on-call team) |
| **SyncQueueDepth** | warning | `payesh-worker` | production | Sync Platform Team | `docs/INCIDENT_PLAYBOOK.md` §6 | Primary On-Call → SRE Specialist | **TARGET/POLICY / NOT VERIFIED** (Requires human on-call team) |
| **EventLoopLagHigh**| warning | `payesh-api` | production | Runtime Infrastructure Team | `docs/INCIDENT_PLAYBOOK.md` §2.2 | Ticket to Backend Engineering | **TARGET/POLICY / NOT VERIFIED** (Requires human on-call team) |
| **MemoryHigh** | warning | `payesh-api` | production | Runtime Infrastructure Team | `docs/INCIDENT_PLAYBOOK.md` §2.2 | Primary On-Call → Soft restart pod | **TARGET/POLICY / NOT VERIFIED** (Requires human on-call team) |
| **DiskSpaceLow** | warning | `storage` | production | Infrastructure SRE Team | `docs/INCIDENT_PLAYBOOK.md` §2.2 | Primary On-Call → Clean archive/wal | **TARGET/POLICY / NOT VERIFIED** (Requires human on-call team) |
| **AnomalyDetected** | warning | `security` | production | SecOps / SOC Team | `docs/INCIDENT_PLAYBOOK.md` §5 | Security Analyst Review | **TARGET/POLICY / NOT VERIFIED** (Requires human on-call team) |
| **AttackPatternSignature** | critical | `security` | production | SecOps / Incident Team | `docs/INCIDENT_PLAYBOOK.md` §5 | Page Security Lead → Automated IP ban | **TARGET/POLICY / NOT VERIFIED** (Requires human on-call team) |
| **SuspiciousSession** | warning | `security` | production | SecOps / Identity Team | `docs/INCIDENT_PLAYBOOK.md` §5 | Ticket to Identity Specialist | **TARGET/POLICY / NOT VERIFIED** (Requires human on-call team) |
| **PayeshAuditWriteFailure** | critical | `audit` | production | Compliance & SecOps Team | `docs/R6_R7_DECISIONS.md` §2.4 | P0 Page to Lead Auditor & SecOps | **TARGET/POLICY / NOT VERIFIED** (Requires human on-call team) |
| **PayeshAuthorityUnavailable** | critical | `authority` | production | Platform Security & DBA Team | `docs/R6_R7_DECISIONS.md` §2.4 | Immediate Page to SecOps & DBA | **TARGET/POLICY / NOT VERIFIED** (Requires human on-call team) |

> **Operational Note on S3 Scope:** In accordance with Sprint S2 governance boundaries, notification endpoint placeholders (e.g. `__WEBHOOK_URL__` in Alertmanager configuration) remain intact and are strictly preserved for implementation in Sprint S3.

---

## 5. Error Budget Policies & Burn-Rate Trigger Schedule

### 5.1 Monthly Error Budget Formulation
For the national availability commitment of **99.95%** over a rolling 30-day window:
- **Total Seconds in 30 Days:** $30 \times 24 \times 3600 = 2,592,000 \text{ seconds}$
- **Permissible Downtime Budget (0.05%):**
  $$\text{Budget} = 2,592,000 \times 0.0005 = 1,296 \text{ seconds} \approx \mathbf{21.6 \text{ minutes}}$$
- **Permissible Failed Requests (at 20,000 peak RPS baseline):**
  $$\text{Error Budget} = 150,000,000 \text{ daily requests} \times 30 \times 0.0005 = \mathbf{2,250,000 \text{ failed requests / month}}$$

### 5.2 Multi-Window Multi-Burn-Rate Alerting Rules
Following Google SRE engineering disciplines codified in `infra/observability/alerts.yml` (`CriticalErrorBudgetBurn`):

| Severity | Burn Rate | % Budget Consumed | Short Window | Long Window | Target Action | Playbook Reference |
|---|---|---|---|---|---|---|
| **Critical (P0)** | **14.4×** | 2% consumed in 1 hour | 2 minutes | 1 hour | Immediate Page to Incident Commander | `docs/INCIDENT_PLAYBOOK.md` Phase 1 |
| **Critical (P1)** | **6.0×** | 5% consumed in 6 hours | 15 minutes | 6 hours | Page Primary On-Call Engineer | `docs/INCIDENT_PLAYBOOK.md` Phase 2 |
| **Warning (P2)** | **1.0×** | 10% consumed in 3 days | 1 hour | 3 days | Next-day business triage ticket | `docs/INCIDENT_PLAYBOOK.md` Phase 3 |

### 5.3 Policy Upon Error Budget Depletion
If the rolling 30-day error budget falls to **≤ 0%**:
1. **Immediate Release Freeze:** All non-emergency feature deployments and non-critical schema migrations are immediately halted.
2. **Dedicated Reliability Sprint:** Engineering capacity is 100% diverted to root-cause remediation, database query optimization, and architectural hardening.
3. **Executive Approval for Exceptions:** Only emergency security patches (CVSS ≥ 8.0) or P0 incident fixes may be deployed, requiring joint authorization from the Chief Architect and Lead SRE.

---

## 6. Documentation Governance Sign-Off

```text
================================================================================
SERVICE LEVEL OBJECTIVE (SLO) SPECIFICATION GOVERNANCE RECORD
--------------------------------------------------------------------------------
DOCUMENT ID:           SLO-SPEC-2026-09-20-V1
GOVERNING MANDATE:     Phase 8.2 Sprint S2 (Sequence 23, Deliverable B3)
NATIONAL SCALE ENVELOPE: 10M Users · 2.5M Concurrent · 20k RPS · 2.5k TPS
STATUS:                DOCUMENTATION GOVERNANCE APPROVED (STANDARDS CODIFIED)

GOVERNANCE ROLES:
  1. Site Reliability Engineering:  [DOCUMENTATION SIGN-OFF] Lead SRE Authority
  2. Database Platform:             [DOCUMENTATION SIGN-OFF] Principal DBA Authority
  3. Platform Security:             [DOCUMENTATION SIGN-OFF] Lead SecOps Authority
  4. Enterprise Architecture:       [DOCUMENTATION SIGN-OFF] Enterprise Architecture Board

NOTE: This sign-off indicates formal documentation approval of the SLO definitions.
In strict compliance with Phase 5 §2, all performance and latency metrics without
live production telemetry remain categorized as TARGET/POLICY — MEASUREMENT REQUIRED.
================================================================================
```
