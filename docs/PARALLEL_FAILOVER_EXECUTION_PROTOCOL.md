# Payesh — Parallel / Failover Execution Protocol

**Status:** ACTIVE  
**Purpose:** eliminate single-Arena and single-Coordinator execution bottlenecks while preserving evidence, scope safety, and National governance.

## 1. Core rule

An Arena role is a **default owner, not an exclusive lock**.

A Mission is a **work item, not a permanent reservation**.

If Chat1, Chat2, … Chat10 is unavailable, another available Arena may continue an unfinished Mission when it can safely establish the current repository state and the Mission scope.

**Failure of one chat must never stop unrelated project work.**

## 2. What is removed

The following are no longer execution gates:

- waiting for Chat1 before doing the next independently available work;
- requiring Mission N to be fully pushed/merged before another independent Mission can start;
- treating one Arena being BLOCKED as a reason for other Arenas to stop;
- treating a session ending as a project stop;
- treating a remote push failure as a reason to stop all local execution;
- requiring a new user prompt for every independent next action;
- exclusive Arena ownership as a prerequisite for takeover.

## 3. What remains mandatory

Removing execution locks does **not** remove engineering safety:

- no `git add -A` when unrelated changes exist;
- no force-push or history rewrite;
- no silent reset/revert of another Arena's work;
- no fabricated CI/staging/production evidence;
- no secret/token material in repository or prompts;
- no false `PUSHED`, `MERGED`, or `VERIFIED ON MAIN` claims;
- P0/P1 status changes and National GO/NO-GO remain governed by ChatGPT;
- conflicting edits must be reconciled before merge;
- each change must have a traceable Mission/report/commit.

These are **safety invariants**, not work locks.

## 4. Parallel work

Any Arena may work on any Mission that is:

- not already actively being modified by another known live Arena on overlapping files; or
- explicitly handed over; or
- recoverable from repository evidence after the previous Arena/session became unavailable.

Non-overlapping Missions may execute in parallel without waiting for reconciliation of unrelated Missions.

## 5. Takeover protocol

When taking over another Arena's Mission:

1. inspect `main`, relevant branches, commits, reports and working-tree state;
2. identify the last trustworthy SHA/evidence;
3. identify files already changed by the previous Arena;
4. preserve valid work; do not restart from zero;
5. run only the minimum checks needed to establish the current state;
6. continue the same Mission or its explicitly queued next Mission;
7. create a takeover note in the report with `TAKEOVER-FROM`, previous SHA/branch, and reason;
8. commit and push from the current live session when possible.

A takeover does not require permission from the unavailable Arena.

## 6. Session failure

`SESSION ENDED`, stale chat context, missing local branch, or dead remote access is an **operational condition**, not a project-wide stop.

The replacement Arena must use repository evidence as the source of truth.

If the previous work was only local and no artifact survived in Git, the replacement Arena may reconstruct the change from available reports/patch text/evidence. It must label reconstruction explicitly and re-run the required tests.

## 7. Push failure

A failed push means only:

`THIS DELIVERY ATTEMPT = NOT-PUSHED`

It does **not** mean:

`ARENA BLOCKED`

and it does not prevent other Arenas from working.

When a live session becomes available, delivery may be performed by the original Arena or by a takeover Arena.

## 8. Mission sequencing

The daily board is a **priority/work pool**, not a global serial execution lock.

Chat1 may coordinate and prioritize, but coordination is not a prerequisite for independent execution.

If Chat1 is unavailable, another Arena may select the next clearly scoped board item within its role or take over an unavailable Arena's work, recording the decision.

## 9. Shared-file protection

Concurrency is controlled by **file overlap and Git evidence**, not by blocking the whole fleet.

Before modifying a shared/high-collision file:

- inspect current `main`;
- inspect recent commits;
- inspect active branches if visible;
- keep the diff minimal;
- record expected overlap in the report;
- rebase/merge/reconcile before final landing as required.

A collision is a merge problem, not a reason to freeze unrelated work.

## 10. Reporting

Every hand-back must state:

- Mission ID;
- current status;
- takeover status if applicable;
- exact files changed;
- tests and raw exit codes;
- commit SHA;
- push/PR/merge status;
- blockers that affect only the specific operation;
- next independently executable action.

`NOT-RUN` is scoped to the operation that was not run.

## 11. Authority

ChatGPT remains the independent Senior Auditor and National GO/NO-GO authority.

Chat1 remains coordinator when available, but **Chat1 is not a single point of failure**.

No Arena may declare National GO.

## 12. Operating principle

**Parallelize where safe. Take over where necessary. Never idle the fleet because one chat failed.**

The desired flow is:

`PLAN → EXECUTE IN PARALLEL → TEST → COMMIT → PUSH WHEN POSSIBLE → TAKEOVER IF NEEDED → RECONCILE AT INTEGRATION → AUDIT`
