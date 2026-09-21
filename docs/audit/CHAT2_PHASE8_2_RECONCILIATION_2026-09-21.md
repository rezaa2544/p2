# Chat 2 — Adversarial Red-Team Reconciliation Delta
Date: 2026-09-21
Historical audit baseline: bc68b2b539bf5b59aa0108c0959af767ea57ce35
Current roadmap baseline: main@fbe178be7c99ddb6c068eee4f7b389a6b9e7aeab

## Purpose
Chat 2 is useful as a historical adversarial input, but its runtime claims must be reconciled against later evidence before changing gate status.

## Reconciled findings

| ID | Chat 2 claim | Current disposition | Required action |
|---|---|---|---|
| RT2-01 | Codacy forces exit 0 with max-allowed-issues=2147483647; security.yml has advisory SCA/DAST | CONFIGURATION CONFIRMED; IMPACT QUALIFIED | Keep as CI/security-governance follow-up. Do not treat Codacy configuration alone as proof that all security jobs are "always green". Chat 4 records actual Codacy tool/config failures and classifies them as non-blocking scanner/workflow issues. |
| RT2-02 | Tenant-policy double query on request path; 40k QPS at 20k RPS | CODE PATH CONFIRMED; CAPACITY IMPACT NOT MEASURED | Instrument current HEAD and measure query/request, latency, pool pressure and query plan. The 40k figure remains extrapolation until measured. No local-memory cache by default. |
| RT2-03 | DR drill only exercises JSON and provides no PG17 proof | SUPERSEDED/PARTIALLY RECONCILED | Later QA/Chat 5 evidence shows real PostgreSQL/Redis restore work exists at E3/isolated scope. E4 production-equivalent restore/promote, target identity and measured RPO/RTO remain blocking for Phase 8.2 exit. |
| RT2-04 | monitoring/alert-rules.yaml is not loaded, causing RedisDown blind spot | ORIGINAL RISK WITHDRAWN | Chat 4 verified monitoring/alert-rules.yml is a symlink to infra/observability/alert-rules.yml and Prometheus loads both alert-rules.yml and alerts.yml. The orphan monitoring/alert-rules.yaml remains cleanup/drift work, but the claimed silent-alert failure is not current evidence. |
| RT2-05 | Outbox is at-least-once and needs consumer idempotency | ARCHITECTURAL FOLLOW-UP | Inventory external side-effect consumers and prove idempotency/retry behavior. Do not classify at-least-once itself as a defect. |
| RT2-06 | E4 staging / 10M dataset missing for 8.3 | STILL RELEVANT | Keep Phase 8.3 empirical load validation blocked until E4 topology, dataset and instrumentation are provisioned. |
| RT2-07 | Historical SHA boundary | CONFIRMED | Runtime findings from bc68b2b5 do not directly change current status; current-main reproduction/evidence wins. |

## Gate impact
Chat 2 does not create four new independent Phase 8.2 blockers. The durable blockers reconcile with the existing M1/M2/M3 exit work:
- M1: live alert → on-call → acknowledgement → runbook → recovery evidence.
- M2: PostgreSQL production-equivalent restore/promote with verifier, identity/checksum and measured RPO/RTO.
- M3: Redis restore/failover semantics, including revocation/rate-limit recovery evidence.

RT2-02 remains a separate performance/security hardening work item and must be resolved before empirical Phase 8.3 capacity claims, but its 20k-RPS impact is not yet a measured fact.

## Decision
Keep Phase 8.2 Exit = NOT VERIFIED and Phase 8.3 = BLOCKED.
Do not reopen S2 work.
Do not treat the historical Chat 2 report as current runtime evidence.
