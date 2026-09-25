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
