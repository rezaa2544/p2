# Payesh — Git-Driven Arena Execution Model

**Status:** ACTIVE  
**Effective:** 2026-09-14  
**Authority:** ChatGPT — Independent Senior Auditor / National GO-NO-GO  
**Coordinator:** Chat 1 — Acting Coordinator / Online Supervisor  
**Execution:** Named Arena chats

## 1. Purpose

GitHub is the operational source of truth for daily execution. Chat memory is not a project-state store.

Each Arena receives its authorized work from a mission file in Git, executes only that scope, and records its final report in Git. ChatGPT audits the evidence and authorizes the next mission.

## 2. Control loop

`AUDIT → MISSION → ARENA EXECUTION → REPORT → RECONCILIATION → CHATGPT AUDIT → NEXT MISSION`

A report is a claim. Repository evidence is proof. Only an accepted audit closes the mission.

## 3. Canonical paths

### Active mission

`docs/daily-missions/<CHAT_NAME>/ACTIVE.md`

There must be at most one active mission per Arena.

### Historical missions

`docs/daily-missions/<CHAT_NAME>/archive/`

An accepted/rejected mission is archived by the Coordinator after audit. The active file is replaced only by an authorized new mission.

### Arena reports

`docs/daily-reports/<CHAT_NAME>/YYYY-MM-DD.md`

One final report per Arena per mission/day unless the mission explicitly requires a separate evidence artifact.

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

A lower level must never be reported as a higher level.

Examples:

- Local green ≠ CI green.
- CI green ≠ staging proof.
- Staging proof ≠ production proof.
- Uncommitted work ≠ complete.
- A report sentence ≠ repository evidence.

## 7. Coordinator rules

Chat 1 is the online supervisor. For every Arena report it must reconcile:

- branch/ref
- commit SHA
- diff
- tests and exact results
- CI status when available
- PR status
- merge state
- current `main`
- scope compliance

If GitHub/network access fails, mark the affected evidence `NOT-RUN`; never infer success.

Chat 1 may recommend disposition but cannot independently declare National GO.

## 8. Auditor rules

ChatGPT audits the repository and the reconciled reports at the end of each cycle. ChatGPT decides whether a mission is accepted and what mission follows.

If a mission is materially incomplete, the next mission is remediation/reverification rather than unrelated feature work.

## 9. National gate

National status remains **NO-GO** until the canonical P0 gates are closed with sufficient evidence and ChatGPT approves the release decision.

Feature completeness is not national readiness.

## 10. Source hierarchy

The following remain canonical unless explicitly adjudicated:

1. `docs/ROADMAP.md`
2. `docs/NATIONAL_ROADMAP_PROGRESS.md`
3. `docs/P0_BLOCKER_TRACKER.md`
4. `docs/ARCHITECTURE_REVIEW.md`
5. `docs/EXECUTION_CONTROL_PROTOCOL.md`
6. This document and the current daily Mission files

When historical documents conflict, do not silently rewrite history. Record the conflict and escalate it.

## 11. Anti-drift

At mission start, Chat 1 re-reads the canonical sources and verifies the active mission against current `main`.

Arena chats must read their active mission at the beginning of every working session. If the file is missing, stale, contradictory, or not authorized, they stop and report `BLOCKED`.

## 12. Daily operating rule

The user should not have to distribute bespoke daily task prompts. The common Arena prompt points each chat to its own `ACTIVE.md` mission and report path. Only the chat name changes.
