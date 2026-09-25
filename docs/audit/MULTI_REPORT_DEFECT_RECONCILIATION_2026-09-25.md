# Payesh — Multi-Report Defect Reconciliation
## 2026-09-25

**Baseline reviewed:** `main @ 467d9c751f8e4b854737c8da99a96ffd8cb88763`  
**Source set:** independent reports 1–5 supplied for reconciliation.  
**Purpose:** deduplicate findings, distinguish current-HEAD evidence from stale/historical claims, and inject all material findings into the canonical remediation plan.

> Rule: a report finding is not automatically an active defect. Current source evidence and exact-HEAD evidence control the disposition. Historical findings that were already fixed are retained as revalidation items, not duplicated open fixes.

## A. Continuous consolidated list of newly surfaced defects

| # | Canonical ID | Severity | Finding | Current disposition |
|---|---|---|---|---|
| 1 | NCR-01 | **CRITICAL / P0** | `server/index.js` contains a syntax-corrupt splice in `seedPgFromBootstrap`; `node --check` fails around the fallback placeholder construction and the server cannot be loaded. | **CONFIRMED @ 467d9c7 — immediate blocker** |
| 2 | NCR-02 | **HIGH / P1** | `parent_links` authorization checks parent/student school equality but does not bind the operation to the acting manager's own `school_id`; a manager can potentially modify links belonging to another school. | **CONFIRMED BY CURRENT SOURCE — fix required** |
| 3 | NCR-03 | **HIGH / P1** | Bootstrap user projection can carry the live session JWT because the self/manager/edu_office projection clones the user object and removes only `password`; bootstrap then returns/caches the projection. | **CONFIRMED BY CURRENT SOURCE — fix required** |
| 4 | NCR-04 | **HIGH / P1** | `/api/v1/system/security-health` can construct a positive `HEALTHY` status from configuration/default state without fresh runtime evidence. | **CONFIRMED SOURCE FINDING — fix required** |
| 5 | NCR-05 | **HIGH / P1** | Phase-3 certification eligibility uses `externallyVerified === true` while the preceding `&&` expression returns the verification-signature string rather than a boolean; certification can therefore remain permanently rejected. | **CONFIRMED BY CURRENT SOURCE — fix required** |
| 6 | NCR-06 | **HIGH / P1** | Parent-360 route authorizes a teacher at school level but does not independently enforce teacher→student/class ownership before returning the full student/family profile. | **CONFIRMED SOURCE PATH — adversarial regression required** |
| 7 | NCR-07 | **HIGH / P1** | Intervention warning summary passes the raw school-wide `rec.cases` array to `summarizeSchoolInterventions` after filtering only the per-case warnings, allowing aggregate counselling information to cross the teacher scope boundary. | **CONFIRMED SOURCE PATH — fix required** |
| 8 | NCR-08 | **HIGH / P1** | Virtual/non-attendance-day policy is enforced in Sync but the REST attendance path lacks the same invariant, creating REST/Sync authorization/business-rule asymmetry. | **REPORTED + SOURCE GAP REQUIRES CURRENT-HEAD REGRESSION** |
| 9 | NCR-09 | **HIGH / P1** | Conflict resolution must keep target-data mutation and `sync_conflicts.status=resolved` inside one authoritative transaction; any remaining split path can leave data applied while the conflict stays open. | **CURRENT CODE HAS TRANSACTIONAL PG PATH; retain as adversarial regression / revalidate** |
| 10 | NCR-10 | **HIGH / P1** | Migration `022_users_staff_flags.sql` adds PG columns but lacks the repository's rollback companion and migration-structure contract, weakening rollback/ledger integrity. | **CONFIRMED CURRENT SOURCE — fix required** |
| 11 | NCR-11 | **HIGH / P1** | SMS code writes `queue_id/provider_msg/error` into `sms_log` while current migration history lacks those columns; live evidence in the report shows PG insert failure and a swallowed mirror error. | **CORROBORATED CURRENT-HEAD EVIDENCE — fix required** |
| 12 | NCR-12 | **HIGH / P1** | Comprehensive `test:all` runner can terminate before executing the suites because of strict environment/documentation preflights; this can make the advertised comprehensive gate execute zero tests. | **CONFIRMED IN AUDIT EVIDENCE — fix required** |
| 13 | NCR-13 | **HIGH / P1** | `tests/run.js` syntax gate parses only `src/js/*`; backend `server/**/*.js` syntax corruption can survive while the syntax test reports green. | **CONFIRMED CURRENT SOURCE — fix required** |
| 14 | NCR-14 | **HIGH / P1** | Region authorization remains fragmented: region-bearing specialized/system paths can perform role checks without proving that the requested region belongs to the actor. This is an alternate-path recurrence of F4, not a separate root cause. | **CONFIRMED/REPORTED RECURRENCE — fold into F4 closure** |
| 15 | NCR-15 | **MEDIUM / P2** | Some edu_office analytics guards have been reported to treat `office_id` numerically as `region_id`, creating identity confusion and bypassing the canonical province-resolution path. | **CURRENT-SOURCE RECHECK REQUIRED; retain as F5 alternate-path item** |
| 16 | NCR-16 | **MEDIUM / P2** | Client persistence changed update semantics so `base_version` is stamped on LWW-style updates, creating a regression against the pinned R95 contract. | **CURRENT-HEAD regression evidence reported — reconcile contract** |
| 17 | NCR-17 | **MEDIUM / P2** | Conflict API test expects 403 for an unknown-field payload while the implementation deliberately returns 400; code/test contract is inconsistent and the adversarial battery remains red. | **CONFIRMED CONTRACT DRIFT — resolve one canonical status contract** |
| 18 | NCR-18 | **MEDIUM / P2** | New strict-gate test asserts a G4b failure condition that the hardened gate does not emit, producing a permanent test/gate contract mismatch. | **CONFIRMED TEST/IMPLEMENTATION DRIFT** |
| 19 | NCR-19 | **MEDIUM / P2** | `tests/a35-regression.js` contains a machine-local absolute ioredis path, making the regression suite non-portable outside the original development environment. | **CONFIRMED SOURCE DEFECT** |
| 20 | NCR-20 | **MEDIUM / P2** | F4 remediation lacked a direct manager→foreign-region negative regression assertion in the reported test inventory. | **CONFIRMED COVERAGE GAP — fold into F4 regression** |
| 21 | NCR-21 | **MEDIUM / P2** | `parent-360.js` compares `attendanceRate < 80` even when `attendanceRate === null`; JavaScript coercion can classify NO_DATA as CRITICAL. | **CONFIRMED CURRENT SOURCE — fix required** |
| 22 | NCR-22 | **MEDIUM / P2** | Security adversarial A-18..A-22 test regex is malformed/over-escaped and can produce false failures or fail to detect the intended call shape. | **REPORTED + CURRENT SOURCE TEST REVIEW REQUIRED** |
| 23 | NCR-23 | **MEDIUM / P2** | Build drift: `index.html` can diverge from `src/js/*` when frontend sources change without rebuilding the single-file artifact. | **REPORTED BUILD-GATE DEFECT — current gate must be made deterministic** |
| 24 | NCR-24 | **LOW / P3** | `wave3-parity.js` can crash on an empty store instead of returning a controlled NOT-RUN/empty-state result. | **CONFIRMED TEST ROBUSTNESS ISSUE** |
| 25 | NCR-25 | **LOW / P3** | Superadmin navigation expectation is stale relative to the current client authorization/menu source and remains red on the audited SHAs. | **CONFIRMED PRE-EXISTING TEST DRIFT** |
| 26 | NCR-26 | **INFO / P3** | k6 performance suites are outside ordinary Node syntax/test inventories and are not automatically wired into the normal CI gate. | **CONFIRMED PROCESS/GATE GAP** |
| 27 | NCR-27 | **INFO / P3** | ESLint configuration exists without a corresponding lint script/CI invocation, so its presence does not provide an executed quality gate. | **CONFIRMED PROCESS/GATE GAP** |

## B. Findings from reports that are duplicates or already mitigated

These are retained for revalidation/closure evidence, but must **not** be duplicated as new open fixes:

- Report-1 HIDDEN-01 (classes DELETE IDOR): current `server/routes/classes.js` now calls `policy.inScope`; retain as a current-head adversarial regression under A-35/A-34.
- Report-1 HIDDEN-02 (unrestricted edu_office intelligence): later current-head evidence indicates the main school-intelligence path has been hardened; keep as an alternate-path inventory item, not as a blindly active defect.
- Report-1 HIDDEN-03 (four intelligence endpoints requiring `region_id`): source state differs across reports; keep as **REVALIDATION_REQUIRED**, not confirmed without exact-head reproduction.
- Report-1 HIDDEN-04 (OCC opt-in bypass): current source/test evidence shows the four named REST routes have been hardened to strict OCC in later work; keep as **REVALIDATION_REQUIRED**.
- Report-1 HIDDEN-05 (unconstrained offices): current `officeCoversSchool` still returns true when all geographic IDs are absent; this remains active and is mapped to F5/authorization root cause.
- Report-1 HIDDEN-06 (SMS restart/idempotency): retained under A-32 and NCR-11; the stronger current-head finding is schema/mirror failure plus restart/replay convergence.
- Report-5 B-01 / HD-03 (Sync vs REST authorization and parent pull): overlaps F3/A-34 and must be revalidated on current HEAD rather than duplicated.
- Report-5 B-02 / HD-02 (PG sequence): overlaps F1 and NCR-01; current F1 remediation is non-executable while `server/index.js` remains syntactically invalid.
- Report-5 B-03 / HD-04 (NULL vs ZERO): overlaps A-31 and NCR-21; retain the more specific current-source parent-360 defect.

## C. Priority / execution consequence

### P0 — immediate blockers
1. NCR-01 — restore a parseable/bootable `server/index.js`.
2. NCR-03 — eliminate credential-bearing session objects from API projections/cache.
3. NCR-02 — bind parent_links writes to the acting manager's school.
4. NCR-05 — repair certification boolean/evidence eligibility.
5. NCR-06/NCR-07 — close teacher access to Parent-360 and intervention aggregates.
6. NCR-12/NCR-13 — repair the detection surface so backend failures cannot be green while CI executes zero suites.

### P1 — security/data/reliability closure
7. NCR-08 — unify virtual-day invariant across REST and Sync.
8. NCR-09 — prove conflict resolution atomicity with failure injection.
9. NCR-10 — complete migration 022 rollback/contract.
10. NCR-11 — repair SMS PG schema + durable idempotency/restart semantics.
11. NCR-14/NCR-15 — complete F4/F5 alternate-path authorization inventory and centralize region resolution.

### P2/P3 — contract/test/quality closure
12. NCR-16..NCR-23.
13. NCR-24..NCR-27.

## D. Required verification after fixes

Every NCR item requires:
`current HEAD → reproduction → fix → positive test → negative/adversarial test → alternate-path test → current-SHA evidence`.

No historical audit result is promoted automatically.

## E. Project status

**HARDENING / RECONCILIATION — NOT VERIFIED**

The new findings increase the open remediation surface. Broad certification remains blocked until the P0/P1 queue is fixed or explicitly dispositioned and current-head evidence is regenerated.

**No production-readiness claim is made by this reconciliation.**
