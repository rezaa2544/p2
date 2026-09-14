# Payesh — Git-Driven Arena Execution Model

**Status:** ACTIVE  
**Effective:** 2026-09-14  
**Authority:** ChatGPT — Independent Senior Auditor / National GO-NO-GO  
**Coordinator:** Chat 1 — Acting Coordinator / Online Supervisor  
**Execution:** Named Arena chats

## 1. Purpose

GitHub is the operational source of truth for daily execution. Chat memory is not a project-state store.

Each Arena receives its authorized work from a mission file in Git, executes only that scope, and records its report in Git. ChatGPT audits the evidence and authorizes the next mission.

## 2. Control loop

`AUDIT → MISSION → ARENA EXECUTION → REPORT → RECONCILIATION → CHATGPT AUDIT → NEXT MISSION`

A report is a claim. Repository evidence is proof. Only an accepted audit closes the mission.

The active Queue is a minimum work sequence, not an automatic stop condition. After its final stage, the Arena continues safe unresolved work within the same authorized scope until the work window ends or no independent scoped work remains.

**M4 completion is never, by itself, a stop reason.**

## 3. Canonical paths

### Active mission

`docs/daily-missions/<CHAT_NAME>/ACTIVE.md`

There must be at most one active mission per Arena.

### Historical missions

`docs/daily-missions/<CHAT_NAME>/archive/`

An accepted/rejected mission is archived by the Coordinator after audit. The active file is replaced only by an authorized new mission.

### Arena reports

`docs/daily-reports/<CHAT_NAME>/YYYY-MM-DD.md`

Reports contain stage/pass checkpoints and final status. A missing report must not itself stop authorized work.

### Daily audit

`docs/daily-audits/YYYY-MM-DD.md`

ChatGPT records the independent end-of-day audit and the disposition of every active mission.

## 4. Mission states

`PLANNED → ACTIVE → EXECUTING → REPORT_SUBMITTED → AUDIT_PENDING → ACCEPTED`

If evidence is insufficient:

`REPORT_SUBMITTED → AUDIT_PENDING → REJECTED → REWORK_REQUIRED`

`REJECTED` does not become `ACCEPTED` through chat explanation. New evidence is required.

## 5. Mission rules

Every mission must specify:

- Mission ID
- Owner / Arena
- Base SHA
- Source references
- P0_REF when applicable
- Scope
- Forbidden scope
- Dependencies
- Acceptance criteria
- Required tests
- Required evidence
- Git / PR rules
- Definition of Done
- Expected report path

No Arena may invent a new mission, widen scope, close a P0/P1, or declare National GO.

## 6. Evidence promotion

Evidence levels are monotonic and explicit:

`CLAIMED` → `IMPLEMENTED` → `TESTED LOCALLY` → `PUSHED` → `PR OPEN` → `MERGED` → `VERIFIED ON MAIN` → `VERIFIED IN STAGING` → `PRODUCTION PROVEN`

A lower level must never be reported as a higher one.

Examples:

- Local green ≠ CI green.
- CI green ≠ staging proof.
- Staging proof ≠ production proof.
- Uncommitted work ≠ complete.
- A report sentence ≠ repository evidence.

## 7. Coordinator rules

Chat 1 is the online supervisor. For every Arena report it must reconcile branch/ref, commit SHA, diff, tests, CI, PR, merge state, current `main`, and scope compliance.

If GitHub/network access fails, mark the affected evidence `NOT-RUN`; never infer success.

Chat 1 may recommend disposition but cannot independently declare National GO.

## 8. Arena delivery authority

Within an active Mission, the owning Arena is responsible for completing the normal Git delivery chain without waiting for another prompt:

`IMPLEMENT → TEST → COMMIT → PUSH → PR → CHECKS/REVIEW → MERGE → VERIFY MAIN → REPORT`

Self-merge is allowed when the change is fully within Mission scope, required tests/checks are satisfied or explicitly `NOT-RUN`, there is no unresolved conflict, and the merge does not itself close/reclassify a P0/P1 or decide National GO.

Merge must stop and escalate for P0 closure, P0/P1 status changes, cross-Arena ownership conflicts, or material governance adjudication.

## 9. Continuation / no-work proof

After M4, the Arena enters `CONTINUATION LOOP`.

For each loop it must inspect the active Mission and select the highest-value unresolved scoped action: implementation, failure repair, focused tests/fixtures, hardening, regression/integration verification, PR maintenance, delivery, main verification, or evidence recovery.

It may claim that no scoped work remains **only after a second independent pass** over acceptance criteria, relevant code/tests/docs, PR/CI state, NOT-RUN/environment limitations and unresolved findings. The report must state what was checked and why no independent action remains.

`complete`, `finished`, `awaiting coordinator`, `awaiting audit`, `awaiting prompt`, or `nothing else` are not valid stop reasons by themselves.

A network failure, stale local checkout, missing local report, or unavailable optional check blocks only that operation. Recover from current `main` where possible and continue independent work.

## 10. Auditor rules

ChatGPT audits the repository and reconciled reports at the end of each cycle. ChatGPT decides whether a mission is accepted and what mission follows.

## 11. National gate

National status remains **NO-GO** until the canonical P0 gates are closed with sufficient evidence and ChatGPT approves the release decision.

Feature completeness is not national readiness.

## 12. Source hierarchy

1. `docs/ROADMAP.md`
2. `docs/NATIONAL_ROADMAP_PROGRESS.md`
3. `docs/P0_BLOCKER_TRACKER.md`
4. `docs/ARCHITECTURE_REVIEW.md`
5. `docs/EXECUTION_CONTROL_PROTOCOL.md`
6. `docs/ARENA_CONTINUATION_POLICY.md`
7. This document and current daily Mission files

When historical documents conflict, do not silently rewrite history. Record the conflict and escalate it.

## 13. Anti-drift / self-healing

At mission start, Chat 1 re-reads the canonical sources and verifies the active mission against current `main`.

Arena chats must read their active mission at the beginning of every working session. If the local file is missing or stale, they must first refresh/recover the exact file from current `main`; local checkout drift is not by itself a Mission blocker. Only a genuinely missing/expired/contradictory Mission on current `main` is a blocker.

## 14. User operating model

The user should not have to distribute bespoke daily task prompts. The common Arena prompt points each chat to its own `ACTIVE.md` mission and report path. Only the chat name changes.

The Arena must keep executing until the work window ends or the second-pass no-work proof establishes that no independent authorized action remains.
