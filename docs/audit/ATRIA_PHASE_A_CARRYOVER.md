# ATRIA — Phase A Carry-over Register

**Status:** ACTIVE / CARRY-OVER  
**Date:** 2026-09-24  
**Repository:** `rezaa2544/p2`  
**Source:** `docs/audit/PHASE_B_DEFECT_HUNT_REPORT.md`  
**Purpose:** Preserve every unresolved item identified during Atria's first (Critical/High) sweep so none is lost when the execution plan advances to Medium/P2 and Low/P3. The source report calls out 22 deferred Medium/Low items; the fixed-value intelligence metric is tracked separately as A-23 because it appears in the report's remaining-risk discussion and must be independently dispositioned.

## Ground rule

These items were identified during the Phase A hunt but were intentionally left unresolved because they were outside the P0/P1 remediation scope, required broader remediation, or were classified as Medium/Low.

They are **not certified safe** merely because they were deferred.

Each item must receive one of:

- FIXED + regression/runtime evidence
- VERIFIED NOT A DEFECT
- ACCEPTED RISK with explicit rationale/owner
- BLOCKED with dependency
- HISTORICAL / REPRODUCTION REQUIRED
- DEFERRED with explicit reason and next gate

Definition of Done:

`Finding → Reproduce → Root Cause → Fix → Regression Test → Execute → Evidence → Review`

## Carry-over items

| ID | Area | Item | Required next action | Initial classification |
|---|---|---|---|---|
| A-01 | Analytics / PostgreSQL | Regional reports in `routes/analytics.js` use O(schools × collections) synchronous scanning; PG path still reads from `store.*` / capped mirror | Reproduce at realistic scale; redesign/fix if confirmed; measure event-loop/DB impact | Medium / performance |
| A-02 | Analytics / PostgreSQL | `health-index.js` has the same collection-scan pattern and lacks a real PG path | Reproduce and benchmark; implement safe path if confirmed | Medium / performance |
| A-03 | DB / concurrency | `routes/analytics.js` + `semantic-analytics.js` issue six parallel queries against the main pool instead of `queryRead`, risking pool saturation and interference with auth/sync | Reproduce pool pressure; measure saturation and request impact; fix/query-pool policy | Medium / performance |
| A-04 | IDs / concurrency | `ids.js:78-88` releases the lock before push, allowing duplicate IDs under concurrent memory-store requests | Concurrent reproduction; fix atomicity; regression test | Medium / correctness |
| A-05 | Backup / operations | Automatic backup is disabled by default without an explicit boot warning | Verify production contract; add safe warning/gate if required | Medium / operational |
| A-06 | Notifications / storage | `sms_log` / `notify_queue` can grow without bound and are reread per request | Reproduce growth/query cost; establish retention/paging/indexing strategy | Medium / operational |
| A-07 | Test integrity | `wave1-reads.js`, `wave3-query2.js`, `wave4-sync.js` self-skip PostgreSQL paths and report PASS | Make unavailable prerequisites explicit; prevent false-green results | Medium / CI |
| A-08 | Test integrity | Six suites use `process.exit(0)` and can print a final green result with 0/0 checks | Enumerate exact files; make zero-check execution fail or explicit skip | Medium / CI |
| A-09 | CI / Codacy | `.github/workflows/codacy.yml` uses `max-allowed-issues: 2147483647`, effectively preventing a useful failure gate | Verify intended policy; restore meaningful threshold/gate | Medium / CI |
| A-10 | CI / CodeQL | `.github/workflows/codeql.yml` only echoes and does not perform the expected scan | Verify intended security-scan contract; implement/restore executable scan | Medium / security tooling |
| A-11 | CI / Fortify | `.github/workflows/fortify.yml` can be green without an actual scan | Verify and restore real scan/gate or explicitly document external dependency | Medium / security tooling |
| A-12 | Test orchestration | `scripts/run-all-tests.sh` is not invoked by CI or `package.json` | Determine canonical test runner; integrate or explicitly retire | Medium / QA |
| A-13 | Test parity | `ci-test-parity-contract.js` only sees top-level `tests/*.js`; many nested test files remain invisible and the orphan budget can be misleading | Reconcile complete test inventory and parity contract | Medium / QA |
| A-14 | Test integrity | `tests/bell2.js:184` has a date-dependent Thursday/Friday skip that can appear as PASS | Replace with explicit skip/failure semantics and evidence | Medium / QA |
| A-15 | Test integrity | `tests/offline-sync-drill.js:183` uses `chk(..., true)` as a constant assertion | Remove false-green assertion and test actual behavior | Medium / QA |
| A-16 | Test integrity | `tests/chaos-drill-lib.js:384` compares with `=== Buffer.alloc(0)`, a dead comparison | Correct assertion and execute relevant chaos test | Medium / QA |
| A-17 | Test integrity | `tests/client-features.js:139` / `multigrade2.js:181` use `assert(true, ...)` | Replace with behavioral assertions | Medium / QA |
| A-18 | Sync / conflict | `conflicts.js:137-145` resolve-conflict can rewind version counters and bypass sync gates, potentially overwriting newer data | Reproduce with concurrent/versioned conflict; fix state/version invariants | Medium / data integrity |
| A-19 | Student timeline | `student-timeline` validates teacher against school but not the requested `student_id` | Adversarial ownership reproduction; enforce student relationship | Medium / authorization |
| A-20 | OCC | OCC is strict for grades but can be bypassed for other PATCH paths | Inventory every PATCH mutation; reproduce stale-write cases; enforce consistent contract | Medium / data integrity |
| A-21 | Ownership | `class_id` / `homeroom_teacher_id` can be written without sufficient ownership validation | Reproduce cross-owner mutation; enforce ownership/policy | Medium / authorization |
| A-22 | Session / Redis | `revocation.js` can fail-open when Redis is unavailable, affecting cross-instance logout/revocation | Reproduce Redis outage + revoked session; determine contract; fail closed where required | Medium / security |

## Additional carry-over explicitly called out by Atria

Atria also recorded the following as an explicit remaining-risk item; it is tracked separately as **A-23** and must not be treated as solved:

| ID | Area | Item | Required next action |
|---|---|---|---|
| A-23 | Intelligence / analytics integrity | `buildRegionalSnapshot.average_difficulty_p_value` uses a fixed fallback (`0.62` / `0.65`) | Reproduce, trace source semantics, determine whether the metric is valid or fabricated, then fix or explicitly disposition with evidence |
- The Phase B report noted that production readiness was not certified: PostgreSQL/Redis production drills and national-scale capacity evidence were not performed.
- The Phase B report explicitly stated that the six performance findings above were not fixed.

## Execution order

1. Resolve the carry-over security/data-integrity items first:
   A-18, A-19, A-20, A-21, A-22.
2. Resolve test/CI false-green items:
   A-07 through A-17.
3. Resolve operational/performance items:
   A-01 through A-06.
4. Resolve A-23 as part of intelligence validation.
5. Only after dispositioning all A-01 through A-23 may Atria claim that the Phase A carry-over queue is cleared.
6. Then proceed to the normal Low/P3 sweep and subsequently the independent Multi-AI validation campaign.

## Evidence rule

No item may be marked complete from code inspection alone when runtime reproduction is feasible.

The final disposition must include:

- exact HEAD SHA
- reproduction command/scenario
- expected vs actual
- root cause
- changed files
- regression test
- executed test result
- relevant CI/runtime evidence
- commit SHA
- residual risk

## Relationship to canonical plan

This register is a mandatory carry-over queue for:

`Atria Critical/High → Phase A carry-over closure → Atria Medium/P2 → Atria Low/P3 → Full Multi-AI Validation → Capability Matrix → Role Matrix → E2E → Failure/Recovery → Performance → Final Certification`

It does not replace the canonical execution plan; it makes the unresolved Phase A work explicit and prevents loss of scope.

## Arena Sync branch handoff — 2026-09-24 (not main closure)

A-18/A-20 have fresh reproductions and scoped candidate fixes on
`arena-sync/offline-occ-20260924`, based directly on main
`4bff3bcb757162f040e82ffa26f3d40e46eb7a36` (not the DR branch). See
`docs/SYNC_OCC_EVIDENCE_CONTRACT.md` for the changed contracts, five-round
real-PG test commands and limitations. The associated constant offline-drill
assertion was replaced with response checks; this is not blanket A-07..A-17 closure.

Disposition: **TESTED locally / independent gate NOT VERIFIED**, pending final-SHA
evidence, independent reviews, authenticated publication and Tech Lead merge.
Do not clear this carry-over queue from a branch test result. **Roadmap
Reconciliation Required** after review/merge; no certification or production GO.
