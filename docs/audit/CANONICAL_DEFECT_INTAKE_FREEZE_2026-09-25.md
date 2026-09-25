# Payesh — Canonical Defect Intake Freeze Before Atria-1
## 2026-09-25

**Repository:** rezaa2544/p2  
**Purpose:** Freeze the defect inventory immediately before receiving the Atria-1 report. No code remediation is authorized from this synchronization step.

## Current baseline

The repository's live `main` must be treated as the only execution baseline. The supervising-engineer delivery rule remains:

`Finding → Reproduce on current HEAD → Root Cause → Invariant → Alternate paths → Fix → Regression → Current-SHA evidence → Independent review`

The project remains **HARDENING / RECONCILIATION — NOT VERIFIED**. Historical PASS/FIXED evidence is not current certification.

## User-requested primary register

The user explicitly asked that the previously consolidated **37-item register** be retained as the primary working list. Those 37 entries are preserved in the conversation-level handoff and are not to be forgotten or silently removed.

The primary register consists of:
- NCR-01..NCR-27 from `docs/audit/MULTI_REPORT_DEFECT_RECONCILIATION_2026-09-25.md`
- the additional current/open/revalidation findings identified during the final review: F1/F2/F4 and the current-source/session, Parent-360, intervention, test-integrity and related findings that were expanded into the 37-item working list.

## IMPORTANT — completeness audit result

A final repository-document review shows that **37 must NOT be treated as the entire universe of unresolved work**.

The repository still contains an authoritative unresolved carry-over queue that predates the multi-report NCR list:

### A-01..A-23 carry-over

Source of truth:
`docs/audit/ATRIA_PHASE_A_CARRYOVER.md`

These include:
- A-01 analytics PostgreSQL scaling/scanning
- A-02 health-index PG path/performance
- A-03 analytics query-pool pressure
- A-04 concurrent memory-store ID allocation
- A-05 backup disabled-by-default operational warning
- A-06 unbounded SMS/notification storage
- A-07 PostgreSQL test self-skip / false-green
- A-08 zero-check `process.exit(0)` suites
- A-09 Codacy ineffective issue threshold
- A-10 CodeQL workflow not executing the expected scan
- A-11 Fortify workflow false-green risk
- A-12 canonical test-runner integration gap
- A-13 incomplete test parity/orphan inventory
- A-14 date-dependent false-green test
- A-15 constant assertion in offline sync test
- A-16 dead Buffer equality assertion
- A-17 `assert(true,...)` false-green assertions
- A-18 conflict/version rewind invariant
- A-19 student-timeline object ownership gap
- A-20 incomplete OCC coverage across PATCH mutations
- A-21 class/homeroom ownership validation
- A-22 Redis revocation fail-open risk
- A-23 fixed intelligence metric fallback requiring independent disposition

### A-24..A-29 reconciliation obligations

Also preserved in `docs/audit/ATRIA_PHASE_A_CARRYOVER.md`:
- A-24 Sync/Offline branch reconciliation
- A-25 outbox/worker current-head revalidation
- A-26 security/CI false-green reconciliation
- A-27 DR/E4 closure
- A-28 architecture/scale revalidation
- A-29 roadmap integrity reconciliation

### A-30..A-39 hardening gate

The repository also retains the canonical hardening queue:
- A-30 Strict Verification Gate integrity
- A-31 Intelligence semantic/certification integrity
- A-32 SMS PostgreSQL mirror/restart/idempotency
- A-33 PostgreSQL authorization delegation parity
- A-34 Sync authorization parity / twin-gate authorization
- A-35 Mission-5 authorization recurrence
- A-36 PostgreSQL migration/test infrastructure
- A-37 test-integrity / zero-check / orphan / mock / swallowed-catch closure
- A-38 current-head verification-registry rebind
- A-39 E4 reliability/DR acceptance

These are not automatically additional independent bugs: many overlap the 37 primary findings. They are retained because dropping them would lose previously identified acceptance criteria and regression obligations.

## Intake rule until Atria-1 report arrives

1. **Do not start remediation from this synchronization.**
2. **Do not mark any item fixed, verified, or certified.**
3. **Do not delete or collapse A-01..A-39 merely because an NCR item appears similar.**
4. When Atria-1 arrives, reconcile its findings against:
   - the 37-item primary register,
   - F1..F5,
   - A-01..A-29 carry-over,
   - A-30..A-39 hardening queue,
   - current Git `main` HEAD.
5. Only after that reconciliation may duplicate findings be merged into one root-cause item.
6. Atria-1 findings must be classified as **NEW / DUPLICATE / SUBSUMED / MITIGATED / REVALIDATION_REQUIRED / NOT_REPRODUCED / BLOCKED** with exact evidence.
7. No historical evidence may be promoted to current HEAD.
8. After reconciliation, produce one canonical execution queue before fixing code.

## Current status

**WAITING FOR ATRIA-1 REPORT — NO CODE FIXES STARTED FROM THIS INTAKE.**

The next action is report reconciliation, not immediate implementation.

## Source-of-truth documents

- `docs/audit/MULTI_REPORT_DEFECT_RECONCILIATION_2026-09-25.md`
- `docs/audit/MASTER_DEFECT_PRIORITY_2026-09-25.md`
- `docs/audit/ATRIA_PHASE_A_CARRYOVER.md`
- `docs/CURRENT_WORK_EXECUTION_PLAN.md`
- `docs/CURRENT_PROJECT_INTELLIGENCE.md`
- `docs/external-memory/SUPERVISING_ENGINEER.md`
- `docs/external-memory/PROJECT_DASHBOARD.md`
- `docs/external-memory/DAILY_TASKS.md`
- `docs/external-memory/DECISION_LOG.md`

**Rule:** the Atria-1 report is an input to reconciliation; it does not itself certify completion.
