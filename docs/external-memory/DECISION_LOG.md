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
