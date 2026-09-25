# Payesh — Decision Log

This is the durable record of **why** material project decisions were made.

## 2026-09-25 — External memory architecture

**Decision:** Implement a seven-layer external memory system around the repository.

**Why:** Chat context is finite and deep debugging can displace earlier project context. Durable project state therefore needs explicit external artifacts.

**Layers:** project flow, daily tasks, decisions/specifications, code defects, transient notes, visual architecture, and exact change history.

**Repository implementation:** dashboard, daily task ledger, decision log, architecture diagram, CHANGELOG, and GitHub issue workflow.

**Boundary:** This system does not replace the canonical roadmap, current-head ground truth, or Strict Verification Gate.

## Decision template

### YYYY-MM-DD — <title>

**Decision:**  
**Context:**  
**Alternatives considered:**  
**Why chosen:**  
**Impact:**  
**Evidence / references:**  
**Follow-up:**  


## 2026-09-25 — Current-head synchronization policy

**Decision:** The project intelligence and external memory must be synchronized after every material change/report, but the verification registry must remain evidence-bound and may intentionally lag until a hardening SHA is frozen.

**Why:** Main advanced from the previous audit SHA to `38ecab9` through PR #415/#416. Automatically carrying old verification statuses forward would create false certification.

**Current root cause of drift:** verification evidence was produced against discrete audit SHAs while subsequent merges moved main. The durable fix is not to rewrite history; it is to make every synchronization record explicit about its exact HEAD and require a deliberate registry rebind after hardening.

**Operational rule:** every material merge/report updates: Project Intelligence, Dashboard, Daily Tasks, Decision Log and CHANGELOG as applicable. The registry is updated only when its evidence contract is actually re-executed for the new SHA.

**Next gate:** A-30 through A-39 closure, then registry rebind and three-independent-reviewer validation.

## 2026-09-25 — Evidence-first execution strategy

**Decision:** Do not advance broad certification phases while hardening findings remain unresolved. Fix or reproduce first, preserve negative evidence, then certify only from the same frozen SHA.

**Reason:** The current Arena Sync report demonstrates why this matters: scoped fixes can pass targeted runtime batteries while the global invariant remains NOT VERIFIED because legacy behavior and untested production boundaries still fail the contract.

**Options recorded:**
1. Evidence-first hardening (default): close A-30..A-39 in dependency order.
2. Parallel E4 preparation: provision DR infrastructure while code/gate work proceeds, without promoting status.
3. Investigation-only for blocked items: document root cause and unblocker, with no artificial PASS.


## FINAL SYNCHRONIZATION RECEIPT — 2026-09-25
**Exact main HEAD after this synchronization series:** `7c1a4ce3c29810910bfee72e17358d81032c33ea`.
This SHA includes the synchronization updates themselves. The verification registry remains intentionally bound to `e4584806c1af2a1e5db648c8452580a8fa8cbcec` until the hardening SHA is frozen and evidence is regenerated; therefore this receipt is a project-state update, not a certification.


## 2026-09-25 — Root-cause recurrence becomes P0

Decision: Treat recurring/reappearing findings as a systemic engineering problem and prioritize root-cause elimination before broad certification.

Evidence: A-20 was later reproduced across five PATCH entities after earlier narrower classification; A-22 later exposed a configuration-specific Redis boot hole; A-18/A-24 evidence repeatedly crossed branch/SHA boundaries; A-34/A-35 exposed twin policy/current-head boundaries; A-31/A-37 exposed fallback and false-green mechanisms.

Root cause: observed-defect fixes have historically been narrower than the invariant they were intended to protect, while evidence and test coverage do not yet automatically follow every code/configuration/merge boundary.

Decision: establish Invariant Registry, Reappearance Regression Suite, automatic evidence invalidation, complete mutation/auth/failure inventories, and authoritative shared policy contracts.

Closure rule: FIXED is not root-cause closure. Use ROOT-CAUSE-CLOSED only when source fix + alternate-path audit + adversarial regression + current-final-SHA evidence + three independent reviews exist.


## 2026-09-25 — Mandatory Supervising Engineer control

**Decision:** Create docs/external-memory/SUPERVISING_ENGINEER.md as the canonical session-start and delivery-control document.

**Why:** Previous agent prompts explicitly required push, yet many agents stopped at analysis/commit/branch/PR without completing the required repository delivery. The failure was procedural/enforcement-related, not merely a GitHub availability issue.

**New rule:** push/PR/merge requirements are part of the task's Definition of Done. A verbal completion report without remote repository evidence is not completion.

**Future prompts:** include Delivery Contract and require exact remote commit/PR/merge identifiers.



## 2026-09-25 — Fresh repository defect audit and two-Atria remediation

**Decision:** Stop broad testing/certification and use the two Atria agents first for complete defect/root-cause remediation. 

**Reason:** The fresh repository audit found three current-main open defects not fully represented by the previous queue (F1, F2, F4), while two other fresh findings (F3, F5) already have current-main mitigations and therefore require revalidation rather than duplicate fixing. The project has also experienced recurrence caused by narrow fixes, incomplete path inventories and stale evidence boundaries.

**Priority:** F1 → A-30 → A-37 → F4 → F2 → A-31..A-36 → A-18/A-20/A-24 → A-38 → A-39 → remaining carry-over.

**Ownership:** Atria-1 owns product/security/data root causes; Atria-2 owns verification/test-integrity/reliability preparation and remaining CI/operational carry-over. Same invariant/file may not be concurrently modified by both.

**Closure rule:** Finding → Reproduce → Root Cause → Invariant/All Paths → Fix → Regression → Current-HEAD Evidence → Independent Review. Historical evidence is never promoted automatically.


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
