# Payesh — Project Dashboard

**Last reviewed:** 2026-09-25  
**Canonical execution fallback:** this file + current Git HEAD + current Ground Truth.

## Current position

**Active gate:** hardening and closure before full multi-AI validation.  
**Immediate sequence:** A-30 Gate Hardening → A-31..A-36 closure → A-37 test-integrity closure → A-38 registry rebind → A-39 reliability/DR evidence → independent validation → capability/role/E2E/DR/performance → final certification.

> This dashboard is a compact execution map. It must not override current code/evidence or the canonical roadmap.

## Kanban

### TODO
- [ ] Merge/reconcile completed A-30..A-39 work into one current mainline.
- [ ] Close remaining A-30 Strict Verification Gate bypasses.
- [ ] Close A-31 intelligence semantic-certification residuals.
- [ ] Reconcile A-34/A-35 authorization and sync findings.
- [ ] Resolve A-32/A-33/A-36 PG/SMS/infrastructure findings.
- [ ] Close A-37 test inventory debt and false-green paths.
- [ ] Rebind A-38 verification registry to the actual current HEAD.
- [ ] Execute A-39 reliability/DR acceptance drills.
- [ ] Run independent ChatGPT + Arena + Atria verification against the same current HEAD.
- [ ] Run final E2E, failure/recovery, performance and certification gates.

### IN PROGRESS
- [ ] Repository-level external memory system implementation.

### DONE / EVIDENCE-BOUND
- [x] External-memory architecture defined.
- [x] Durable decision log created.
- [x] Daily task ledger created.
- [x] Architecture map created.
- [x] CHANGELOG created.
- [x] GitHub Issue workflow documented.

## Agent ownership note

ChatGPT 7 is **not** an active executor for this workstream. Its assigned work was transferred to **Arena 10** and must not be conflated in status reports.

## Session handoff

When this file is updated, record:
- current HEAD
- work completed since the previous handoff
- evidence produced
- blockers
- next exact action


## CURRENT-HEAD UPDATE — 2026-09-25

**Verified repository HEAD:** `38ecab9599168f8d53b0dcd89d77009dd7596f94`.
**Project state:** HARDENING / RECONCILIATION — **NOT VERIFIED**.

### Current status
- [x] Memory system merged (PR #414).
- [x] A-31 verification publication merged (PR #415).
- [x] Current-head Sync/OCC evidence publication merged (PR #416).
- [x] A-35 remediation commits/evidence are present in main history.
- [ ] A-30 Strict Gate closure.
- [ ] A-31 semantic/certification residual closure on the final SHA.
- [ ] A-32 SMS PG mirror/restart/idempotency closure.
- [ ] A-33 PG authorization-flag persistence parity.
- [ ] A-34 Sync authorization parity reconciliation + current-head regression.
- [ ] A-35 current-head re-verification after merged remediation.
- [ ] A-36 live PG migration/identifier infrastructure closure.
- [ ] A-37 executable test-inventory/gate closure.
- [ ] A-38 registry rebuild for the final hardening SHA + three independent reviewers.
- [ ] A-39 E4 reliability/DR drills and measured acceptance.

### Evidence truth
The registry is **not current**: it remains bound to `e4584806`. The current main SHA is `38ecab9`. This is intentional and prevents historical evidence from being misrepresented as current-head certification.

### Exact next work sequence
**Option 1 — Preferred: evidence-first hardening:** A-30 gate → A-31..A-36 targeted fixes/reconciliation → A-37 test integrity → A-38 registry rebuild → A-39 E4 drills → three-AI validation → broad certification.

**Option 2 — parallel infrastructure preparation:** while A-30..A-36 are being closed, provision the isolated PG/Redis E4 environment and test fixtures for A-39, but do not mark any later phase complete until the hardening gate closes.

**Option 3 — investigation-only:** if an environment/dependency blocks a fix, record root cause, reproduction and exact unblocker as BLOCKED; do not convert it to PASS or silently defer it.

### Definition of Done for every future item
**Finding → Reproduce → Root Cause → Fix → Regression Test → Execute → Evidence → Independent Review → Current-HEAD Rebind.**


## FINAL SYNCHRONIZATION RECEIPT — 2026-09-25
**Exact main HEAD after this synchronization series:** `7c1a4ce3c29810910bfee72e17358d81032c33ea`.
This SHA includes the synchronization updates themselves. The verification registry remains intentionally bound to `e4584806c1af2a1e5db648c8452580a8fa8cbcec` until the hardening SHA is frozen and evidence is regenerated; therefore this receipt is a project-state update, not a certification.


## ROOT-CAUSE PRIORITY — 2026-09-25

### New P0 objective
Eliminate defect recurrence, not merely close defect IDs.

A cross-report review identified repeated mechanisms: incomplete invariant scope, incomplete configuration/path inventory, stale evidence after main moves, twin policy implementations, compatibility branches, and false-green test paths.

Authoritative program: docs/audit/ROOT_CAUSE_REAPPEARANCE_PROGRAM_2026-09-25.md

### New execution rule
Before declaring any recurring/high-risk item closed:
Reproduce → identify why previous fix failed to prevent recurrence → fix at source → audit alternate paths → adversarial regression → current-final-HEAD evidence → independent review.

### P0 tasks added
- [ ] Build Invariant Registry for A-18/A-20/A-22/A-24/A-34/A-35.
- [ ] Build permanent Reappearance Regression Suite.
- [ ] Define mutation/auth/failure configuration inventories.
- [ ] Enforce evidence invalidation after material merge.
- [ ] Converge OCC/ownership/tenant/revocation/conflict to authoritative policy contracts.


## SUPERVISING ENGINEER CONTROL — 2026-09-25

**Canonical control:** docs/external-memory/SUPERVISING_ENGINEER.md

New mandatory rule: agent repository work is not DONE until the required commit is verified on remote; if the instruction requires main, merge is also mandatory. Unpushed/unmerged work must be reported as incomplete.

Every future execution prompt must contain a Delivery Contract:
STATUS / COMMIT / PUSHED / PR / TARGET / TESTS / EVIDENCE.

This control exists because previous prompts required push but the requirement was not mechanically enforced at handoff.



## FRESH DEFECT PRIORITY — 2026-09-25

Canonical register: `docs/audit/MASTER_DEFECT_PRIORITY_2026-09-25.md`.

### P0
- [ ] F1 — bootstrap/PG seed data-loss + identity-sequence/upsert corruption; root-cause fix.
- [ ] A-30 — Strict Verification Gate closure.
- [ ] A-37 — test-integrity / false-green closure.

### P1
- [ ] F4 — analytics region authorization bypass.
- [ ] F2 — legacy parent PG schema drift.
- [ ] A-31 — intelligence semantic/certification residuals.
- [ ] A-32 — SMS/PG mirror/restart/idempotency.
- [ ] A-33 — PG delegation persistence parity.
- [ ] A-34 — sync authorization parity.
- [ ] A-35 — Mission-5 authz recurrence.
- [ ] A-36 — PG migration/test infrastructure.
- [ ] A-18/A-20/A-24 — sync/OCC/conflict root-cause closure.
- [ ] A-38 — final registry rebind.

### Revalidation only
- [ ] F3 — parent_links pull exposure mitigation, final regression.
- [ ] F5 — edu_office province-resolution mitigation, final regression.

### Atria ownership
- [ ] Atria-1: F1/F2/F4 + A-31..A-36 + product/runtime security/data root causes.
- [ ] Atria-2: A-30/A-37/A-39 preparation + A-01..A-17/A-23 test/CI/operational carry-over + A-38 preparation.

**Project state:** HARDENING / RECONCILIATION — NOT VERIFIED. Broad validation remains blocked.
