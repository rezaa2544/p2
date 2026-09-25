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


## 2026-09-24 — Cross-report additions

The multi-AI reconciliation adds the following explicit closure work around the existing A-01..A-23 queue. These are **not replacements** for A-18/A-20; they are integration/revalidation obligations:

- **A-24 — Sync/Offline branch reconciliation:** independent remediation exists off-main; reconcile onto current main, re-run A-18/A-20, and prove stale-write/newer-state invariants on the merged/current SHA. Legacy/LWW, crash durability, reconnect, and production multi-host limits remain unverified until separately exercised.
- **A-25 — Outbox/worker current-head revalidation:** reconcile the previously reported F-1a/F-1b/F-2/F-3/F-4/F-5 findings against current main; close only with exact-SHA regression/runtime evidence.
- **A-26 — Security/CI false-green closure:** reconcile F-S04/F-S01/F-S02/F-S05/F-S07/F-S09/F-S10/F-S11/F-S13/F-S16 and related hardening items against current main; no blanket allowlist.
- **A-27 — DR/E4 closure:** current-SHA DR-01 refresh plus E4 PG/Redis restore/failover, independent failure domains, RPO/RTO acceptance, and alert/on-call recovery evidence.
- **A-28 — Architecture/scale revalidation:** RAM-authoritative control planes, explicit authority mode, legacy tenant enforcement, national-scale load/soak and measured capacity.
- **A-29 — Roadmap integrity reconciliation:** Redis/Node version drift, unsupported critical-path duration, and Phase 9.0 dependency wording from the schedule audit.

These additions remain subject to the same disposition contract and do not permit Phase A carry-over closure until evidence is complete.


## 2026-09-25 — Multi-Report / Current-HEAD Reconciliation Addendum

**Current main HEAD:** `4938631633c9c578db2679905fd46c4daaedd80a` (`4938631`).

یافته‌های گزارش‌های Arena/ChatGPT/Atria با کد واقعی current main مقایسه شدند. هیچ موردی صرفاً با گزارش تاریخی سبز نشده است.

### A-30 — Strict Verification Gate integrity / certification bypasses
V-01..V-12 باید در خود Gate بسته شوند: empty-registry bypass؛ evidence binding ناقص؛ عدم enforce استقلال واقعی سه reviewer؛ عدم enforce `allowed_statuses`؛ نادیده‌گرفتن `BLOCKED_UNTIL...`؛ binding فقط به local HEAD؛ scanner ناقص؛ quality-gateهای self-attested در intelligence؛ certification input injection؛ human-approval fail-open روی فیلدهای غایب؛ empty zero-ranking compliance؛ و نبود schema اجباری برای evidence/reviewer/run/command/exit/artifact/hash/runtime.

**Disposition:** OPEN / HIGH-CRITICAL. Gate باید قبل از هر certification fail-closed شود.

### A-31 — Intelligence semantic/certification residuals
I-02..I-09: no-data می‌تواند HEALTHY/LOW_RISK/100% شود؛ peak-day و attendance fabrication؛ approval/accuracy false-positive؛ `|| true` در platform integration؛ hard-coded platform metrics؛ و E2E simulation با `verified:true`. همچنین `intelligence-release-certification.js` بخشی از quality gates را self-attested می‌سازد.

**Disposition:** OPEN. نیازمند no-data/empty/malformed/real-route/certification-negative tests روی current HEAD.

### A-32 — SMS PostgreSQL mirror schema drift + restart duplicate
`server/sms.js` در current HEAD هنوز `queue_id` و `provider_msg` را در `sms_log` mirror می‌کند، درحالی‌که migration/schema inventory فعلی وجود این ستون‌ها را اثبات نمی‌کند. گزارش Arena E2E نشان داده بود که این می‌تواند 200/sent را بدون mirror PG و سپس duplicate send/debit پس از restart ایجاد کند.

**Disposition:** HIGH / REPRODUCE ON CURRENT HEAD. Live PG send، schema/row/wallet/queue/audit و restart/idempotency باید اثبات شوند.

### A-33 — PG authorization delegation flags drift
`asset_staff`، `lib_staff` و `is_head` در authz model/policy مصرف می‌شوند، اما parity آنها با PG users schema/migrations اثبات نشده است. گزارش Arena نشان داد PG hydration می‌تواند این flags را از بین ببرد و delegated action را 403 کند.

**Disposition:** HIGH / REPRODUCE ON CURRENT HEAD. Seed→PG→login→delegated action + positive control + persisted-state proof.

### A-34 — Sync authorization parity / twin-gate bypass
Arena-2 روی branch غیرmerged `6018dd76` سه نقص را زنده بست: foreign teacher در `schedule.teacher_id`/homeroom می‌توانست teacher scope را آلوده کند؛ teacher `inScope` school scope کافی نداشت؛ و manager می‌توانست global conflict را از مسیر resolve بازنویسی کند.

**Disposition:** HIGH/CRITICAL / MERGE-RECONCILE REQUIRED. Patch باید با `4938631` reconcile شود و سپس REST+sync+conflict runtime regression اجرا شود.

### A-35 — Mission-5 authz findings reappearing
A-AUTHZ-03/04/05 در گزارش Arena-2 به‌عنوان بازظهور ادغام‌نشده ثبت شدند: over-read نگهبان/راننده، NULL school anchor برای parent/student، و دو identity برای دو شکل شماره تلفن. Fix قدیمی merge نشده است.

**Disposition:** CURRENT-HEAD REPRODUCTION + disposition required.

### A-36 — PostgreSQL migration/test infrastructure
F-PG-05: migration 012 در `wave23-reports-pg` با 2D000؛ F-PG-06: پس از seed زنجیره ledger در 009 می‌شکند و به 8/21 می‌رسد؛ F-PG-07: `pull.js:134` table identifier را raw concatenate می‌کند و QA13 قرمز است.

**Disposition:** HIGH/MEDIUM/LOW respectively; live PG reproduction + regression required.

### A-37 — Test inventory debt beyond A-07..A-17
Arena-10: پس از اصلاح false-greenهای اصلی، inventory هنوز 513 ZERO-CHECK، 311 ORPHAN، 54 MOCK و حدود 40 swallowed `catch{}` دارد. این اعداد به‌خودی‌خود defect واحد نیستند، اما certification-path و gate suites باید مالک‌دار و executable باشند.

**Disposition:** OPEN / TEST-INTEGRITY PROGRAM.

### A-38 — Current-head Registry rebind
Registry فعلی هنوز evidence را به `e4584806` bind می‌کند و فقط Atria review دارد؛ current main `4938631` است. هیچ evidence تاریخی نباید به current HEAD ارتقا یابد.

**Disposition:** BLOCKED UNTIL REBIND. پس از A-30، registry برای current HEAD باید از نو evidence بگیرد و ChatGPT + Arena + Atria را مستقل ثبت کند.

### A-39 — Reliability/DR acceptance criteria
F-1a..F-5 و drillهای Redis outage / PG outage / worker crash / queue saturation / notification growth / graceful shutdown باید صریحاً در A-25/A-27 باقی بمانند. اینها duplicate item نیستند؛ acceptance criteria تکمیلی‌اند.

**قانون:** هیچ‌یک از A-30..A-39 به‌دلیل گزارش تاریخی green محسوب نمی‌شود.


## 2026-09-25 — Current-main synchronization note

Main has moved beyond the 2026-09-25 reconciliation baseline through PR #415/#416 and subsequent documentation synchronization commits. The A-30..A-39 queue therefore remains active and must be evaluated against the final hardening SHA, not automatically against 4938631 or e4584806.

### Current interpretation of recent evidence
- A-31: verification/publication work is now merged, but semantic/certification residuals remain evidence-gated.
- A-34: prior sync authorization fixes/evidence exist, but closure requires current-main reconciliation and REST+sync+conflict regression.
- A-35: product remediation and evidence bundle are present in main history; exact-current-head re-verification is still required.
- A-24: Arena current-head publication demonstrates strong scoped runtime evidence, but its global invariant remains NOT VERIFIED because legacy missing-base/LWW behavior intentionally fails 30 cells and E4/multi-host/device durability remain outside proof.
- A-38: registry remains stale by design until the final hardening SHA is frozen.

### Do not close the queue from publication alone
The repository now contains substantially more evidence, but publication ≠ certification. Every disposition still requires exact SHA, root cause, fix or explicit disposition, regression, execution result, artifact and independent review where required.
