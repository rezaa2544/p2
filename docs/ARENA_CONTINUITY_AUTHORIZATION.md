# Payesh — Arena Continuity Authorization

**Status:** ACTIVE  
**Effective:** 2026-09-14  
**Purpose:** eliminate Mission/control-plane deadlocks without authorizing uncontrolled product work.

## 1. Why this exists

A daily `ACTIVE.md` Mission is still the preferred and primary authorization. However, a missing local Mission combined with stale checkout or unavailable GitHub can otherwise create a deadlock: the Arena is forbidden to invent a Mission, yet has no safe authorized work path.

This document creates a **standing continuity envelope**. It is not a daily Mission, does not replace an active Mission, and does not authorize scope invention. It is a bounded fallback authorization for safe, role-local maintenance and evidence work while Mission recovery is unavailable.

## 2. Activation

An Arena enters **CONTINUITY-FALLBACK** only when all are true:

1. its expected `docs/daily-missions/<CHAT>/ACTIVE.md` cannot be read locally;
2. exact recovery from current `main` was attempted when remote/API access was available, or remote recovery is currently unavailable;
3. local refs/history and canonical control documents were inspected;
4. no contradictory Mission is visible locally.

The Arena must record the recovery attempt and then immediately select work from its role envelope below.

A recovered active Mission always takes precedence and the Arena must resume it immediately.

## 3. Universal limits

Continuity-fallback may NOT:

- invent, rename, close, or reclassify P0/P1 items;
- declare National GO/NO-GO;
- change the Roadmap merely to create work;
- resolve cross-Arena ownership conflicts;
- make destructive live/production changes;
- claim staging/production evidence from local execution;
- alter another Arena's branch or unowned implementation;
- force-push or rewrite history;
- create a daily Mission to justify the work.

Continuity-fallback MAY:

- inspect and reconcile existing repository evidence;
- run existing tests/audits/checks;
- repair a clearly evidenced defect in an existing test/tool/documentation path when that repair is inside the role envelope;
- add focused regression tests/fixtures for an existing evidenced defect;
- harden existing implementation without expanding product scope;
- update evidence/checkpoints/reports;
- commit and use the normal delivery chain for authorized changes;
- continue local work when one remote operation fails.

If no safe role-local action exists, perform a second independent evidence pass before claiming `NO_SCOPED_WORK_PROVEN`.

## 4. Role envelopes

| Chat | Standing fallback scope |
|---|---|
| Chat 1 | Cross-Arena repository reconciliation; verify Mission/report/branch/commit/diff/test/PR state; recover or repair control-plane evidence; maintain mission/report consistency. **No product implementation. No National GO.** |
| Chat 2 | Existing application-feature defects evidenced by failing tests/checks; focused regression tests; application hardening directly tied to an existing failure. No new feature expansion. |
| Chat 3 | Existing sync/offline/write-path failures; focused write-path regression tests; correctness hardening directly tied to existing evidence. P0-1 competing changes require adjudication. |
| Chat 4 | Existing performance/infrastructure/Redis/worker/observability test or tooling failures; local load/regression verification; non-live hardening directly tied to evidence. No production capacity claims. |
| Chat 5 | Existing QA/acceptance/chaos-test failures; focused fixtures and deterministic reproductions; verification of existing gates. No destructive live chaos. |
| Chat 6 | Existing release/database/merge/configuration gate failures; migration/release-tool hardening; focused database/release regression tests; merge-evidence integrity. Never close a gate without source + evidence. |
| Chat 7 | Existing documentation/freeze/statistics/merge-queue gate failures; consistency and reference repairs; documentation evidence reconciliation. No historical artifact rewriting without explicit Mission. |
| Chat 8 | Existing integration/governance evidence conflicts; stale/duplicate report detection; merge-hygiene and documentation integration repairs; protect main from conflicting evidence. No ownership adjudication. |
| Chat 9 | Existing behavioral simulation/audit failures; reproduce and isolate findings; focused simulation/audit fixtures and evidence. No feature ownership or remediation outside an explicit owner. |
| Chat 10 | Existing operations/reliability/runbook/SLO/DR verification gaps; focused reliability tests and runbook hardening; evidence recovery. RTO/RPO values remain UNSOURCED unless sourced. No destructive live chaos. |

## 5. Work selection order

Within the applicable role envelope, select the highest-value existing item in this order:

1. unblock an already-known NOT-RUN check;
2. reproduce and isolate an existing failure;
3. fix a clearly evidenced defect;
4. add a focused regression test/fixture;
5. harden the affected path;
6. run regression/integration verification;
7. reconcile delivery/evidence state;
8. perform the second independent pass.

Do not create work solely to avoid being idle.

## 6. Evidence and delivery

Every fallback checkpoint must state:

- `CONTINUITY-FALLBACK` and the recovery condition;
- exact action and scope;
- command/test and result;
- changed paths and diff;
- commit SHA when committed;
- remote operation as `PUSHED` or `NOT-RUN — reason`;
- `next scoped action`.

Local green is local evidence only. Unpushed work is not main evidence.

When a change is fully within the envelope and normal self-merge rules are satisfied, the owning Arena may complete `commit → push → PR/checks → merge → verify main` without waiting for Chat 1 or the user.

## 7. Return to normal Mission mode

As soon as the exact active Mission is recovered, stop using fallback scope and resume that Mission. Fallback work does not reset M1–M4 and does not create a new Mission state.

The runtime state remains:

`BOOTSTRAP → CONTROL-PLANE RECOVERY → CONTINUITY-FALLBACK? → M1 → M2 → M3 → M4 → CONTINUATION → ...`

There is still no `M4 → STOP` transition.
