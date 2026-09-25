# Payesh — Daily Task Ledger

Use this file for small, immediate tasks. It is intentionally separate from the long-range roadmap.

## 2026-09-25

### Today
- [ ] Reconcile all A-30..A-39 branches/commits against current main.
- [ ] Merge only evidence-backed changes.
- [ ] Rebind verification registry after the final hardening HEAD is known.
- [ ] Keep ChatGPT 7 separate; Arena 10 owns the transferred A-39 execution.
- [ ] Update CHANGELOG and Decision Log after material merges.

### Done
- [x] Reviewed the external-memory specification supplied for this project.
- [x] Added the repository-side seven-layer memory foundation.

## Capture queue

Use this section for quick notes before promoting them to the correct durable layer.

- [ ] No unpromoted notes currently recorded.

## Daily rule

A task is not marked Done because an agent says it is done. It is Done only when the repository/evidence supports the completion state.


## 2026-09-25 — CURRENT STATE SYNCHRONIZATION

### Completed / confirmed today
- [x] Confirmed main advanced to `38ecab9` via merged PR #415 and #416.
- [x] Confirmed memory system remains present in main via PR #414.
- [x] Confirmed verification registry is intentionally stale at `e4584806` and must not be treated as current certification.
- [x] Confirmed current Arena Sync/OCC publication remains NOT VERIFIED and includes explicit legacy-mode failures.
- [x] Confirmed A-35 remediation/evidence exists in main history and requires exact-current-HEAD re-verification.

### Next tasks — ordered
1. [ ] A-30: close all Strict Gate bypasses; add negative tests and prove fail-closed behavior.
2. [ ] A-31: eliminate semantic false-positive defaults and self-attested certification; test empty/no-data/malformed/real-route cases.
3. [ ] A-32: reproduce SMS→PG mirror/restart duplication with live PostgreSQL; fix transaction/idempotency boundary.
4. [ ] A-33: prove PG persistence parity for delegated authorization flags through login→policy.
5. [ ] A-34: reconcile sync authorization fix to current main; run REST/sync/conflict tenant-isolation matrix.
6. [ ] A-35: re-run 15/15 regression and adversarial tenant/phone identity matrix on current main.
7. [ ] A-36: replay migration chain on live PG; repair transaction/ledger/identifier defects with regression.
8. [ ] A-37: inventory and classify zero-check/orphan/mock/swallowed-catch debt; wire certification-critical suites into executable gates.
9. [ ] A-38: after hardening SHA freezes, regenerate verification registry and collect independent ChatGPT/Arena/Atria evidence.
10. [ ] A-39: run E4 PG/Redis restore/failover, worker crash, queue saturation, notification growth and graceful-shutdown drills with measured RPO/RTO/MTTA/MTTR.

### Non-negotiable
- [ ] Never mark a historical report green on the new SHA without re-execution.
- [ ] Never conflate ChatGPT 7 with Arena 10.
- [ ] Never treat NOT-RUN as PASS.
- [ ] Never expose or commit credentials/tokens.
