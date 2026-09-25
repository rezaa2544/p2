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


## FINAL SYNCHRONIZATION RECEIPT — 2026-09-25
**Exact main HEAD after this synchronization series:** `7c1a4ce3c29810910bfee72e17358d81032c33ea`.
This SHA includes the synchronization updates themselves. The verification registry remains intentionally bound to `e4584806c1af2a1e5db648c8452580a8fa8cbcec` until the hardening SHA is frozen and evidence is regenerated; therefore this receipt is a project-state update, not a certification.


## 2026-09-25 — ROOT-CAUSE FIRST UPDATE

### New P0 tasks
1. [ ] Create the Invariant Registry and map A-18/A-20/A-22/A-24/A-34/A-35 to every entrypoint/configuration/state transition.
2. [ ] Build Reappearance Regression Suite from previously recurring findings; preserve negative/adversarial cases permanently.
3. [ ] Add automatic REVALIDATION_REQUIRED semantics when material code merges invalidate prior evidence.
4. [ ] Build mutation/auth/failure configuration inventories and identify untested alternate paths.
5. [ ] Audit twin policy implementations and move OCC/ownership/tenant/revocation/conflict toward one authoritative contract.
6. [ ] For every A-30..A-39 item, record why the previous control did not prevent the new observation.


## 2026-09-25 — SUPERVISING ENGINEER / DELIVERY CONTROL

### P0
- [ ] Add Delivery Contract to every future agent execution prompt.
- [ ] Verify claimed completion against remote GitHub state.
- [ ] Treat unpushed commits as WORK_INCOMPLETE.
- [ ] Treat unmerged PRs as WORK_INCOMPLETE when main merge was required.
- [ ] After each material change, update intelligence + memory + roadmap as applicable.



## 2026-09-25 — FRESH AUDIT / TWO-ATRIA EXECUTION QUEUE

### P0 — execute first
1. [ ] **Atria-1 / F1:** reproduce clean-PG bootstrap data loss, sequence drift and identity overwrite; fix all three mechanisms and add permanent regression.
2. [ ] **Atria-2 / A-30:** close remaining Strict Verification Gate integrity defects without weakening the gate.
3. [ ] **Atria-2 / A-37:** complete certification-path test inventory and false-green triage.

### P1 — next
4. [ ] **Atria-1 / F4:** close manager→foreign-region analytics authorization path and add negative tests for both analytics modules.
5. [ ] **Atria-1 / F2:** remove/gate the obsolete `users.parent_id` PG query; preserve authoritative `parent_links` behavior; add legacy PG regression.
6. [ ] Atria-1 / A-31..A-36 root-cause closure.
7. [ ] Atria-1 / A-18/A-20/A-24 current-head sync/OCC/conflict reconciliation.
8. [ ] Atria-2 / A-38 preparation; do not rebind registry yet.

### Revalidation
9. [ ] F3 parent_links pull isolation on final hardening SHA.
10. [ ] F5 edu_office province resolution on final hardening SHA.

### After defect closure
11. [ ] A-39 E4 reliability/DR acceptance.
12. [ ] Freeze hardening SHA and rebuild Verification Registry.
13. [ ] Start independent ChatGPT + Arena + Atria validation.

**Rule:** no item is DONE from agent prose; commit/push/current-head/evidence must be verified.


## 2026-09-25 — Direct fixes completed / verification queue
1. [x] Supervising Engineer applied F1 bootstrap/identity fail-closed remediation.
2. [x] Supervising Engineer applied F2 PostgreSQL parent-scope remediation.
3. [x] Supervising Engineer applied F4 regional manager authorization remediation.
4. [ ] Run current-head CI and targeted regression for F1/F2/F4.
5. [ ] Assign exact non-overlapping Atria-3 mission.
6. [ ] Continue A-30/A-37 and remaining root-cause queue after verification.


## 2026-09-25 — Canonical Integration Receipt
- Canonical main HEAD after integration: eafca3809bb0a89bff68b1375e0292426ff35098
- Integration PR: #418
- Legacy PRs reconciled/closed as superseded: #402, #403, #407, #410, #411, #412, #413, #417.
- Integration method: reconcile each candidate against current main, preserve applicable intent, integrate one logical unit, then verify the resulting remote HEAD.
- Important: closure of a legacy PR does not mean its original branch was merged verbatim; duplicate/stale/conflicting portions were intentionally superseded when current main already contained the fix or when preserving them verbatim would risk regression.
- Verification status: NOT VERIFIED. Broad certification remains blocked until current-HEAD evidence is regenerated.


## 2026-09-25 — Multi-report independent-audit reconciliation

A new consolidated audit comparison has been added:
`docs/audit/MULTI_REPORT_DEFECT_RECONCILIATION_2026-09-25.md`

### Canonical newly surfaced queue

| ID | Severity | Status / action |
|---|---|---|
| NCR-01 | CRITICAL/P0 | `server/index.js` syntax corruption; **OPEN — immediate blocker** |
| NCR-02 | HIGH/P1 | manager cross-school `parent_links` scope gap; **OPEN** |
| NCR-03 | HIGH/P1 | bootstrap/session JWT exposure; **OPEN** |
| NCR-04 | HIGH/P1 | security-health synthetic HEALTHY; **OPEN** |
| NCR-05 | HIGH/P1 | certification `externallyVerified === true` boolean trap; **OPEN** |
| NCR-06 | HIGH/P1 | teacher access to Parent-360 without object-level class ownership; **OPEN** |
| NCR-07 | HIGH/P1 | intervention aggregate uses unfiltered school-wide counselling cases; **OPEN** |
| NCR-08 | HIGH/P1 | REST attendance lacks Sync virtual-day invariant; **REVALIDATION / FIX** |
| NCR-09 | HIGH/P1 | conflict resolution atomicity; **adversarial revalidation required** |
| NCR-10 | HIGH/P1 | migration 022 structural/rollback contract gap; **OPEN** |
| NCR-11 | HIGH/P1 | SMS PG schema/mirror/idempotency drift; **OPEN under A-32** |
| NCR-12 | HIGH/P1 | comprehensive test runner can execute zero suites; **OPEN** |
| NCR-13 | HIGH/P1 | backend syntax outside `tests/run.js` coverage; **OPEN** |
| NCR-14 | HIGH/P1 | region-bearing alternate-path authorization recurrence; **fold into F4** |
| NCR-15 | MEDIUM/P2 | `office_id`/region identity confusion; **fold into F5** |
| NCR-16 | MEDIUM/P2 | LWW/base_version contract regression; **OPEN** |
| NCR-17 | MEDIUM/P2 | conflict 400/403 contract drift; **OPEN** |
| NCR-18 | MEDIUM/P2 | strict-gate test/implementation mismatch; **OPEN** |
| NCR-19 | MEDIUM/P2 | hardcoded machine-local A-35 test dependency; **OPEN** |
| NCR-20 | MEDIUM/P2 | missing manager→foreign-region regression; **fold into F4** |
| NCR-21 | MEDIUM/P2 | Parent-360 NULL attendance coerced to CRITICAL; **OPEN** |
| NCR-22 | MEDIUM/P2 | A-18..A-22 regex/test false-failure risk; **OPEN** |
| NCR-23 | MEDIUM/P2 | frontend single-file build drift; **OPEN** |
| NCR-24 | LOW/P3 | wave3 empty-store crash; **OPEN** |
| NCR-25 | LOW/P3 | stale navigation expectation; **OPEN** |
| NCR-26 | INFO/P3 | k6 performance suites not wired to ordinary CI inventory; **GAP** |
| NCR-27 | INFO/P3 | ESLint configured but not executed as a gate; **GAP** |

### Deduplication rule
Report-1 HIDDEN-01/HIDDEN-02/HIDDEN-03/HIDDEN-04 are **not blindly added as active defects** where later current-head evidence shows mitigation; they remain regression/revalidation items. HIDDEN-05 remains active under F5. HIDDEN-06 is consolidated into A-32/NCR-11.

### Execution override
Before broad validation:
**NCR-01 → NCR-02/NCR-03/NCR-05 → NCR-04/NCR-06/NCR-07 → NCR-08..NCR-15 → NCR-16..NCR-23 → NCR-24..NCR-27 → current-head revalidation → final hardening SHA.**

Canonical status remains **HARDENING / RECONCILIATION — NOT VERIFIED**.


## 2026-09-25 — Final multi-report synchronization receipt

- Synchronization batch baseline: `7bb19fccba07843008ee410e10f4c405135dca91`.
- Canonical consolidated audit: `docs/audit/MULTI_REPORT_DEFECT_RECONCILIATION_2026-09-25.md`.
- NCR-01..NCR-27 are now recorded with severity, disposition and execution order.
- Stale/duplicate findings are explicitly retained only as REVALIDATION_REQUIRED where current-head evidence shows mitigation.
- Project state remains **HARDENING / RECONCILIATION — NOT VERIFIED**; broad certification remains blocked.
