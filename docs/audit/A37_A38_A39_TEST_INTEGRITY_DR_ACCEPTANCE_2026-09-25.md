# A-37 / A-38 / A-39 — Test Integrity, Evidence Rebind, Reliability/DR Acceptance Criteria

**Date:** 2026-09-25  
**Repository:** `rezaa2544/p2`  
**Current main HEAD:** `cb7e06565c9ece0d327fc6f2865f57a552cf8509`

## 1. A-37 — Test Inventory Debt

### 1.1 Current inventory re-check

The current `main` tree contains **2,338 files**, of which **975 are test-like paths** under the inventory heuristic (paths under `tests/` or test-named files). The current tree contains **32 files under `tests/api/`**: **31 `*.test.js` suites plus `runner.js`**.

The historical Arena counts **513 ZERO-CHECK / 311 ORPHAN / 54 MOCK / ~40 swallowed catches** are **not accepted as current facts**. The repository currently does not contain a single authoritative machine-readable inventory artifact proving those exact totals.

The current source tree does independently confirm the following certification-path condition:

- `package.json:test` executes only `tests/run.js` and `tests/smoke.js`.
- `tests/api/*.test.js` is not equivalent to the historical `tests/api/runner.js`; the tree now contains 31 individual API suites.
- `tests/api/runner.js` is explicitly referenced by `tools/wave1-gate.js`, but that is not the same as the full current `tests/api/*.test.js` inventory being a CI release gate.
- The current Node CI workflow explicitly wires selected critical suites, live PG/Redis suites, intelligence gates, and reliability gates, but it does not execute every test-like file.

### 1.2 Confirmed certification-path defects / blockers

| Area | Current finding | Classification | Gate impact |
|---|---|---|---|
| `tests/api/*.test.js` | 31 current API test files exist; current CI contract does not execute them as a complete recursive API layer | ORPHAN / coverage debt | **BLOCKER** until wired, explicitly retired, or separately certified |
| `tests/wave10-tenant-live.js` | Missing PG/module path prints `0/0 (skip)` and exits 0 | FALSE-GREEN CONTRACT VIOLATION | **BLOCKER** for live tenant-isolation evidence |
| `tests/wave10-tenant-live-mutations.js` | Same self-skip family | FALSE-GREEN CONTRACT VIOLATION | **BLOCKER** for mutation-negative evidence |
| `tests/wave10-pg-live.js` / related live suites | Environment-gated live-PG evidence exists outside the core npm test contract | ORPHAN / prerequisite ambiguity | **BLOCKER** unless explicit exit-3/NOT-RUN and CI ownership are enforced |
| `tests/wave6-11-redis-live-mutations.js` | Redis prerequisite path is environment-gated | ORPHAN / prerequisite ambiguity | **BLOCKER** for Redis mutation evidence if used as certification evidence |
| `tests/migration-009-live.js` | Live-PG prerequisite path exists outside `npm test` | ORPHAN / prerequisite ambiguity | **BLOCKER** for live migration claim |
| `tests/pg-prod-client-error.js` | Missing `pg` or unreachable PG uses explicit exit 2 / NOT-RUN semantics | LEGITIMATE explicit prerequisite handling | Not a false-green; still cannot become PASS without runtime evidence |
| `tests/multigrade2.js`, `tests/client-features.js` | `assert(true)` search hits are not themselves proof of fixed-true assertions; surrounding code contains real behavioral assertions | LEGITIMATE / false-positive candidate | No blocker from the token alone |
| `process.exit(0)` search hits | Many are legitimate final-success exits; some environment-gated suites require contract review | NEEDS TRIAGE | Do not count raw hits as defects |
| `|| true` search hits | Includes shell cleanup/error-tolerant paths and documentation/code examples; raw count is not a defect count | NEEDS TRIAGE | No blanket blocker from token alone |

### 1.3 Inventory conclusion

**Arena-10's numeric inventory is NOT re-accepted as fact.** The certification-relevant problem is narrower but real:

1. The repository has a materially larger current `tests/api/` layer than the `npm test` contract.
2. At least the Wave-10 live PG suites contain the prohibited `0/0 + exit 0` prerequisite behavior.
3. Historical/static counts cannot substitute for current executable inventory evidence.
4. Security/authz critical gates are partly wired explicitly, but a repository-wide orphan budget is not proven.

**A-37 status: BLOCKED / OPEN.**

No business-logic change was made for A-37.

## 2. A-38 — Registry Rebind

### 2.1 Binding

- **Current `main` HEAD:** `cb7e06565c9ece0d327fc6f2865f57a552cf8509`
- **Registry `head_bound`:** `e4584806c1af2a1e5db648c8452580a8fa8cbcec`
- **Required reviewers:** ChatGPT + Arena + Atria
- **Current recorded reviews:** Atria only
- **Current registry status:** `BLOCKED_UNTIL_THREE_AI_AGREEMENT`

The registry is therefore **stale by construction** and is not rebinding evidence to the new HEAD.

### 2.2 Evidence disposition

| Evidence class | Disposition |
|---|---|
| Evidence explicitly recorded against `e4584806` | **HISTORICAL**; not current-HEAD evidence |
| Atria-only review entries | **HISTORICAL / SINGLE-AI**; cannot satisfy three-AI gate |
| ChatGPT current review | This document/review is current-HEAD analysis, but does not magically rebind old artifacts |
| Arena current review | **MISSING** in the registry |
| Independent current-HEAD artifacts with command/run/environment/hash provenance | **MISSING as a complete registry set** |
| Current-HEAD three-AI agreement | **MISSING** |
| Current-HEAD runtime E3/E4 evidence for blocked infrastructure claims | **MISSING / external dependency** |

**Decision:** do **not** change `head_bound`. Do **not** convert historical evidence to green by changing SHA only.

**A-38 status: BLOCKED / NOT VERIFIED.**

The registry was intentionally left unchanged.

## 3. A-39 — Reliability / DR acceptance criteria

### Global evidence rule

A drill is **PASS** only when all of these are present:

- exact current-HEAD / release identity;
- trigger and injected failure;
- observed failure;
- detection timestamp;
- alert timestamp;
- receiver/on-call timestamp where applicable;
- acknowledgement timestamp;
- recovery-action timestamp;
- service-recovered timestamp;
- measured RPO/RTO;
- measured MTTA/MTTR where alerting is involved;
- raw logs/metrics/artifact with integrity reference;
- post-recovery functional checks;
- explicit negative/failure-path proof;
- no mock-only substitute for production-equivalent claims.

Missing infrastructure is **BLOCKED / NOT-RUN**, never PASS.

### Acceptance matrix

| Drill | Trigger | Expected failure | Detection | Alert | Recovery action | RPO | RTO | MTTA | MTTR | Evidence artifact | PASS criteria |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **F-1a — processing-claim recovery** | Kill worker after claim, before completion | Row remains recoverable; stale owner cannot complete it | Worker/queue state shows processing lease and reclaim | Queue/worker alert if threshold crossed | Reclaim expired lease; process exactly once or idempotently | 0 committed-event loss | ≤ worker lease + recovery budget | record if alerting is part of drill | record | DB rows before/after + worker logs + metrics | Reclaimed row completes; stale token cannot mutate terminal state; no loss/duplicate |
| **F-1b — no-handler processing state** | Submit event with unknown/unregistered handler | Event must not disappear or falsely become processed | Outbox status remains visible | Alert on stuck/unsupported event if policy requires | Return to pending / DLQ according to contract | 0 | bounded by retry/recovery policy | record | record | outbox row + worker log + metric | No silent drop; terminal state is explicit; recovery path is observable |
| **F-2 — worker timeout/recovery** | Hang/kill worker during handler execution | Worker becomes unhealthy; work remains recoverable | Worker heartbeat/health age | Worker-health/backlog alert | Restart/reclaim and drain | 0 | ≤ declared worker recovery target | record | record | health timeline + outbox state + logs | No loss; stale completion fenced; backlog drains |
| **F-3 — processing-depth observability** | Increase pending/processing backlog under controlled load | Queue depth rises and remains measurable | `payesh_outbox_depth` / queue metric | Backlog alert | Scale/drain/recover consumer | 0 | backlog drain target measured | record | record | Prometheus/metrics + load log | Metric equals DB/queue ground truth; alert fires at configured threshold; drain is measured |
| **F-4 — CI registration** | Add/identify a certification-path suite | Unregistered suite must not be treated as certified | Discovery/parity gate | CI gate failure | Wire suite, retire with owner, or mark explicit NOT-RUN | n/a | n/a | n/a | n/a | inventory + CI log | Every certification-path suite has an owner and executable gate; orphan budget is explicit |
| **F-5 — terminal DLQ consistency** | Exhaust retry budget with deterministic handler failure | Event reaches one explicit terminal DLQ state | DLQ metric/status | DLQ alert according to threshold | Operator replay/fix/quarantine | 0 event loss | bounded by operator/runbook target | record | record | DB/outbox/DLQ row + logs | Exactly one terminal state; retry count preserved; replay path works; no silent drop |
| **Redis outage** | Stop/blackhole Redis master | Redis dependency fails; production fail-closed semantics apply where required | readiness/Redis health | `PayeshRedisLayerDown` / Sentinel quorum alert | Sentinel failover; restart/reconfigure if needed | Cache state: 0; revocation freshness must follow documented residual-risk contract | **≤30s automatic** / **≤2m manual** per DR runbook | measure | measure | Sentinel timeline + app logs + auth/rate-limit probes | New master elected; app recovers without violating auth/revocation contract; RTO target met |
| **PostgreSQL outage/failover** | Stop primary / isolate primary | Writes/readiness fail according to contract; no split-brain | `pg_isready`, API readiness, DB logs | DB-down/failover alert | Fence old primary; promote standby; repoint app | **≤5m** | **≤15m global target**; runbook scenario target ≈4m | measure | measure | pg logs + promotion output + health + identity/checksum | New primary proves `pg_is_in_recovery()=false`; data identity/checksum verified; no split-brain; RPO/RTO target met |
| **Worker crash** | SIGKILL worker during processing | Process dies; leased work is recoverable | process/health + queue state | worker-down/backlog alert | Restart worker; reclaim lease; drain | 0 | bounded by lease/restart target | measure | measure | process timeline + DB row state + metrics | No lost event; stale worker cannot commit after reclaim; backlog drains |
| **Queue saturation** | Fill pending queue beyond alert threshold | Backlog grows; producers remain bounded according to contract | queue-depth metric | `SyncQueueDepth` / outbox backlog alert | Traffic shaping / scale consumer / drain | 0 | drain target measured | measure | measure | load generator + Prometheus + queue snapshot | Alert at configured threshold; no silent drop; queue remains bounded; drain time measured. Current policy: <1000 pending; outbox p95 processing lag ≤500ms |
| **Notification growth** | Generate sustained notification volume above consumer rate | Notification backlog increases without unbounded memory/duplication | queue depth / consumer lag | notification/backlog alert if configured | scale consumers / throttle / drain | 0 lost committed notification events | target must be explicitly approved; no current repository E4 target accepted | measure | measure | notification queue snapshot + consumer metrics + dedupe/audit logs | Backlog bounded; no duplicate/lost notification; drain rate measured; alert and recovery path proven |
| **Graceful shutdown** | SIGTERM/SIGINT during idle and in-flight work | Stop accepting new traffic; finish in-flight work; stop workers; flush telemetry; close DB/Redis | shutdown log/health state | operational event if production | drain → flush → close → exit | 0 committed-work loss | **must be measured and owner-approved**; no unverified PASS | n/a | measure shutdown recovery time | shutdown timeline + request IDs + DB/outbox state | No committed-work loss; no new request accepted after drain begins; clean exit; telemetry flushed; dependencies closed |
| **Recovery / restore** | Restore backup/PITR to isolated target | Restored DB must be independently identifiable and consistent | restore verifier | recovery incident alert | restore → verify → promote/switch | measured from target timestamp | **PG/PITR runbook ≈14m target**, but must be measured | measure | measure | restore log + identity/checksum + verifier output | Restored identity/checksum matches expected source; no corruption; application smoke/authz checks pass |
| **Alert → on-call → ack → recovery** | Inject synthetic production alert | Alert fires and reaches real receiver | fault timestamp → alert timestamp | real Alertmanager receiver | on-call acknowledgement + runbook + recovery | n/a | service-specific | **must be measured** | **must be measured** | Alertmanager receiver log + ack record + runbook timeline | Real receiver, human/on-call ack, timestamps for every transition, and recovery all present; missing any stage = NOT VERIFIED |

### Current policy targets vs evidence

The repository documents these policy targets:

- PostgreSQL RPO ≤ 5 minutes; overall RTO ≤ 15 minutes.
- Redis automatic failover ≤ 30 seconds; manual ≤ 2 minutes.
- Regional failover total recovery ≤ 15 minutes.
- PITR scenario target ≈14 minutes.
- Queue policy: pending depth <1000; outbox processing lag p95 ≤500ms.

These are **acceptance thresholds/policies**, not proof of production behavior.

Current evidence still leaves production-equivalent E4 alert/on-call/ack, E4 PG restore/promote, E4 Redis restore/failover, and measured operational MTTA/MTTR **NOT VERIFIED**.

## 4. A-39 verdict

**A-39 acceptance criteria are now explicit in this document, but the drills themselves were not executed by this review. Therefore no new PASS is granted.**

Status remains:

- F-1a..F-5: **criteria defined; current-HEAD runtime closure not established for all items**
- Redis outage: **E3 evidence exists historically; E4/current release evidence not established**
- PostgreSQL outage: **E3 evidence exists historically; E4/current release evidence not established**
- Worker crash: **criteria defined; current production-equivalent evidence missing**
- Queue saturation: **E3 drill evidence exists; production-scale/E4 evidence missing**
- Notification growth: **criteria defined; acceptance target/production evidence incomplete**
- Graceful shutdown: **local behavioral coverage exists; production-equivalent operational evidence not established**
- Recovery: **criteria defined; current E4 restore identity evidence missing**
- Alert/on-call/ack/recovery: **BLOCKED; real receiver + human acknowledgement + MTTA/MTTR evidence missing**

## 5. Gate decision

**A-37:** BLOCKED / OPEN  
**A-38:** BLOCKED / NOT VERIFIED  
**A-39:** ACCEPTANCE CRITERIA DEFINED; DRILLS NOT EXECUTED IN THIS REVIEW  
**Certification:** NOT ALLOWED
