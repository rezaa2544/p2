# Payesh — Master Defect Priority & Reconciliation
## 2026-09-25 — Supervising Engineer fresh repository audit

**Repository:** rezaa2544/p2  
**Audit baseline / current main at start:** `79b1d187275981c862876d36dad0909db67038b5`  
**Phase:** Hardening / Reconciliation — NOT VERIFIED  
**Execution policy:** defects are fixed before the broad multi-AI test/certification campaign. Historical PASS/FIXED is not current-head certification.

## 1. Audit result

A fresh source-level audit was reconciled against the canonical project-memory documents, the A-30..A-39 queue, Atria carry-over A-01..A-23, and the latest independent Arena fresh-defect report.

The audit found that the previous defect memory was **incomplete at the current execution level**: the latest independent hunt added F1..F5, while two of those findings (F3 and F5) are already addressed in the current main code and therefore move to **REVALIDATION_REQUIRED**, not to the open-fix queue. F1, F2 and F4 remain open in current main code.

### Current fresh findings

| ID | Severity | Current-main disposition | Root cause |
|---|---|---|---|
| **F1** | **P0** | **OPEN — FIX FIRST** | First-boot JSON→PG seed silently skips incompatible rows, does not advance identity sequences, and later ID allocation plus `ON CONFLICT (id) DO UPDATE` can overwrite seeded identity rows. |
| **F2** | **P1** | **OPEN** | Legacy parent scope still queries non-existent `users.parent_id` in PostgreSQL although `parent_links` is the real relationship source; production converts the schema drift into a 404. |
| **F3** | **P1** | **FIXED-SCOPED → REVALIDATION_REQUIRED** | The reported `parent_links` pull leak is mitigated in current code by a strict collection allowlist and no unscoped default serving. It must be regression-pinned on the final hardening SHA. |
| **F4** | **P1** | **OPEN** | Analytics quality/longitudinal region branches allow a school manager when only `region_id` is supplied; the outer tenant guard checks the manager's own school/province, not the requested region. |
| **F5** | **P1** | **FIXED-SCOPED → REVALIDATION_REQUIRED** | Current `resolveActorProvince()` now resolves `office_id → offices.province_id/province_code`; the old edu_office lockout path is addressed, but must be re-run after hardening. |

**Source evidence for F1–F5:** `docs/audit/ARENA11_FRESH_DEFECT_HUNT_2026-09-25.md`, whose runtime findings were produced at an earlier main SHA. F3/F5 disposition above is based on direct inspection of the current main source at the audit baseline.

## 2. Priority order for remediation

### P0 — systemic/root-cause defects
1. **F1 — Bootstrap/identity/persistence corruption**
   - Fix the complete invariant, not only the observed seed rows.
   - Validate explicit-ID seeding, sequence synchronization, type/schema compatibility, skipped-row handling, and ID collision semantics.
   - Eliminate silent per-row failure.
   - Make an identity collision impossible to turn into a successful overwrite.
   - Permanent regression: clean PG + bootstrap → complete expected row counts → sequence max/nextval parity → first create inserts a new ID.

2. **A-30 — Strict Verification Gate integrity**
   - The gate itself is part of the trust boundary.
   - Keep empty/partial registry, stale SHA, missing reviewer, injected reviewer PASS, missing human approval, malformed evidence, and vacuous evidence fail-closed.
   - Current registry is intentionally stale and must not be rebound until the final hardening SHA.

3. **A-37 — Test-integrity / false-green closure**
   - Complete the inventory of zero-check/orphan/mock/swallowed-catch paths.
   - Certification-critical suites must be executable and unavailable prerequisites must be NOT-RUN/BLOCKED, never PASS.
   - Do not use blanket allowlists to hide real defects.

### P1 — security/data/authorization/root-cause closure
4. **F4 — Region authorization bypass**
5. **F2 — PostgreSQL parent scope schema drift**
6. **A-31 — Intelligence semantic/certification residuals**
7. **A-32 — SMS→PG mirror/restart/idempotency**
8. **A-33 — PG authorization delegation persistence parity**
9. **A-34 — REST/sync authorization parity**
10. **A-35 — Mission-5 authorization recurrence**
11. **A-36 — PostgreSQL migration/test infrastructure**
12. **A-18/A-20/A-24 — Sync/OCC/conflict invariant and current-head reconciliation**
13. **A-38 — verification registry rebind, only after the final hardening SHA**

### P2/P3 — after P0/P1 root causes are closed
14. **A-39 — E4 reliability/DR acceptance**
15. **A-01..A-06 — analytics/performance/backup/notification operational findings**
16. **A-07..A-17 — remaining test-integrity and CI findings**
17. **A-23 — intelligence metric integrity if not already covered by A-31**
18. Remaining Phase-A carry-over and documented medium/low items must be dispositioned with reproduction/evidence, not silently dropped.

## 3. Previously identified defects that must remain in memory

The Atria carry-over register remains authoritative for A-01..A-23. The later A-30..A-39 queue remains authoritative for the hardening gate. Their status must be interpreted against current main, not their historical evidence SHA.

Important recurring/root-cause families:
- incomplete mutation/path inventories;
- configuration-specific and legacy-path gaps;
- twin authorization/OCC policy implementations;
- PG/JSON persistence and hydration parity;
- restart/replay/idempotency boundaries;
- stale evidence after main advances;
- false-green / orphaned test execution;
- fragmented tenant enforcement;
- infrastructure and migration assumptions not exercised on live PG.

## 4. Closure contract

No defect may be promoted directly from FIXED to CERTIFIED.

Required sequence:

**Finding → Reproduce on current HEAD → Root Cause → Invariant → All alternate paths/configurations → Minimal source fix → Permanent positive + negative/adversarial regression → Execute on current/final HEAD → Evidence bound to SHA → Independent review → Registry rebind**

For recurring defects, the report must additionally state **why the previous fix failed to prevent recurrence**.

## 5. Two-Atria execution ownership

To avoid duplicate fixes:

### Atria-1 — Product/security/data root causes
Owns, in priority order:
- F1
- F2
- F4
- A-31
- A-32
- A-33
- A-34
- A-35
- A-36
- A-18/A-20/A-24 where the scope is product/runtime remediation

### Atria-2 — Gate/test-integrity/reliability root causes
Owns, in priority order:
- A-30
- A-37
- A-39 preparation/acceptance work
- A-01..A-17 and A-23 remaining actionable test/operational findings
- A-38 preparation only; final rebind happens after the hardening SHA freezes

**Non-overlap rule:** Atria-1 and Atria-2 must not edit the same invariant/file simultaneously. If a dependency crosses ownership, one is executor and the other is reviewer; no duplicate fixes.

## 6. Findings already mitigated but requiring final revalidation

- F3 parent_links pull exposure — current allowlist/scoping code must be re-run.
- F5 edu_office province resolution — current office-based resolution must be re-run.
- Any historical A-18/A-20/A-35/A-31 fix is evidence-bound only to its tested SHA until re-executed on the final hardening SHA.

## 7. Phase transition

The project remains:

**HARDENING / RECONCILIATION — NOT VERIFIED**

Broad ChatGPT × Arena × Atria validation starts **only after the complete open defect queue above is fixed or explicitly dispositioned with evidence and the final hardening SHA is frozen.**

No production GO is implied by this document.


## 8. Supervising Engineer self-remediation — 2026-09-25

Direct fixes applied before Atria execution:
- **F1:** bootstrap seed now preserves legacy `classes.grade` semantics via `grade_level` when the DB column is numeric, advances PostgreSQL identity sequences after explicit-ID seeding, uses a fail-closed fallback insert, and raises `bootstrap_seed_incomplete` instead of silently reporting success when seed/sequence operations fail. The keep-bootstrap path no longer swallows seed failure.
- **F2:** removed the obsolete PostgreSQL `users.parent_id` query; `parent_links` is now the authoritative PG parent relationship for this scope.
- **F4:** both quality-governance and longitudinal-intelligence guards now explicitly reject school-manager requests carrying `region_id`.

**Code status:** FIXED-SCOPED / TEST PENDING. CI is pending on current HEAD; no runtime certification is claimed yet.

### Atria count update
The executor/reviewer team now includes **3 Atria agents**. Until their exact Atria-1/Atria-2/Atria-3 chat identities are mapped, Atria-3 is registered as **independent remediation/review slot — ownership to be assigned without overlapping Atria-1/Atria-2 invariants**.
