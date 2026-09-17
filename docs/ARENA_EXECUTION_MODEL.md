# Payesh — Git-Driven Arena Execution Model

**Status:** ACTIVE  
**Effective:** 2026-09-17  
**Authority:** ChatGPT — Independent Senior Auditor / National GO-NO-GO  
**Coordinator:** Chat 1 — coordinator when available  
**Execution:** Named Arena chats with parallel failover

## 1. Purpose

GitHub is the operational source of truth for daily execution. Chat memory is not a project-state store.

Arena roles are **default ownership metadata, not exclusive execution locks**. The project must remain productive when any Arena or coordinator session fails.

## 2. Control loop

`PLAN → PARALLEL EXECUTION → TEST → COMMIT → PUSH WHEN POSSIBLE → TAKEOVER → INTEGRATION → AUDIT`

Independent Missions may run concurrently.

A report is a claim. Repository evidence is proof. Integration verifies whether changes can safely land together.

## 3. Canonical paths

### Active mission/work pool

`docs/daily-missions/<CHAT_NAME>/ACTIVE.md`

These files identify the default work pool and role scope. They are **not global locks** and do not prevent safe takeover by another Arena.

### Historical missions

`docs/daily-missions/<CHAT_NAME>/archive/`

### Arena reports

`docs/daily-reports/<CHAT_NAME>/YYYY-MM-DD.md`

### Daily audit

`docs/daily-audits/YYYY-MM-DD.md`

## 4. Mission states

Each Mission independently follows:

`PLANNED → ACTIVE → EXECUTING → TESTED → REPORT_SUBMITTED → COMMITTED → PUSHED/DELIVERY-BLOCKED → INTEGRATION → VERIFIED`

Multiple Missions may be ACTIVE simultaneously.

If evidence is insufficient:

`REPORT_SUBMITTED → REWORK_REQUIRED`

A failed push does not block unrelated Missions.

## 5. Mission rules

Every Mission should specify:

- Mission ID
- Default Owner / Arena
- Base SHA or current-base requirement
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

The default owner may be unavailable. In that case, another Arena may take over after evidence-first recovery.

No Arena may invent unrelated product scope, close a P0/P1 without authority, or declare National GO.

## 6. Evidence promotion

Evidence remains monotonic and explicit:

`CLAIMED` → `IMPLEMENTED` → `TESTED LOCALLY` → `COMMITTED` → `PUSHED` → `PR OPEN` → `MERGED` → `VERIFIED ON MAIN` → `VERIFIED IN STAGING` → `PRODUCTION PROVEN`

Local green ≠ CI/staging/production proof.

## 7. Coordinator rules

Chat1 coordinates when available. It is not a single point of failure and is not a global sequencing gate.

Chat1 should reconcile claims, identify collisions, prioritize work, and prepare integration order.

It must not impose:

`Mission N must push/merge before independent Mission N+1 may start.`

If Chat1 is unavailable, Arenas continue safe work from the work pool and may perform takeovers.

## 8. Arena delivery authority

Every Arena is responsible for its own delivery when a live session permits:

`IMPLEMENT → TEST → COMMIT → PUSH → PR → CHECKS/REVIEW → MERGE → VERIFY MAIN → REPORT`

If remote delivery is unavailable, mark only that delivery operation `NOT-RUN` and continue independent work.

If the original Arena becomes unavailable, a takeover Arena may perform the delivery chain.

## 9. Takeover / failover

A takeover requires:

1. inspect current main and visible branches;
2. inspect prior report/checkpoint and commit evidence;
3. identify last trustworthy state;
4. preserve valid changes;
5. avoid destructive reset/revert;
6. continue the same Mission or its clearly identified queued work;
7. record `TAKEOVER-FROM` and reason;
8. commit/push from the available session when possible.

No permission from the unavailable Arena is required.

## 10. Scope and collision safety

Execution locks are removed; engineering safety is not.

Before modifying shared files, inspect current state and keep the diff minimal. Overlap is resolved during integration. A collision must not freeze unrelated work.

Forbidden:
- blind `git add -A`;
- force-push/history rewrite;
- deleting valid work from another Arena;
- fabricated evidence;
- secrets/tokens in repository/prompts;
- unauthorized P0/P1 changes;
- National GO declaration by an Arena.

## 11. Stop rules

An Arena may stop its own session because its scope is complete, the session ends, an external operation is unavailable, or no safe scoped work remains.

It must never convert that stop into a fleet-wide stop.

`PUSH FAILED` = delivery failure for that attempt, not fleet failure.

## 12. Auditor rules

ChatGPT independently audits completed, incomplete, takeover, delivery, and integration states.

ChatGPT decides National GO/NO-GO.

## 13. National gate

National status remains **NO-GO** until canonical P0 gates are independently closed with sufficient evidence and ChatGPT approves the release decision.

## 14. Source hierarchy

1. `docs/ROADMAP.md`
2. `docs/NATIONAL_ROADMAP_PROGRESS.md`
3. `docs/P0_BLOCKER_TRACKER.md`
4. `docs/ARCHITECTURE_REVIEW.md`
5. `docs/EXECUTION_CONTROL_PROTOCOL.md`
6. `docs/PARALLEL_FAILOVER_EXECUTION_PROTOCOL.md`
7. this document

## 15. Principle

**No Arena is a single point of failure. No Mission is a fleet-wide lock. Parallelize safe work, take over failed sessions, preserve evidence, and integrate deliberately.**
