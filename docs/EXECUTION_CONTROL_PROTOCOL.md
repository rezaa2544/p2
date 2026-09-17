# Payesh — National Execution Control Protocol

**Status:** ACTIVE  
**Authority:** ChatGPT — Independent Senior Auditor / National GO-NO-GO  
**Coordinator:** Chat 1 — Coordinator / Online Supervisor when available  
**Execution:** Chat2–Chat10, with failover/takeover allowed  
**Effective:** 2026-09-17

## 0. EXECUTION MODE — PARALLEL, FAILOVER-SAFE

The project no longer uses a single-Arena or single-Coordinator execution gate.

The daily 20-Mission boards are a **priority/work pool**, not a global serial lock. Chat1 coordinates when available, but an Arena does not have to wait for Chat1, another Arena, a push, a PR, or a merge when an independent scoped action can safely proceed.

An Arena role is a default owner, not an exclusive lock. If an Arena or session fails, another available Arena may take over its unfinished Mission after evidence-first state recovery.

The operational loop is:

`PLAN → EXECUTE IN PARALLEL → TEST → COMMIT → PUSH WHEN POSSIBLE → TAKEOVER IF NEEDED → RECONCILE AT INTEGRATION → AUDIT`

## 1. Canonical project sources

1. `docs/ROADMAP.md` — master engineering roadmap.
2. `docs/NATIONAL_ROADMAP_PROGRESS.md` — Wave owner/status/dependency/evidence matrix.
3. `docs/P0_BLOCKER_TRACKER.md` — canonical P0 no-go tracker.
4. `docs/ARCHITECTURE_REVIEW.md` — current technical P1 inventory.
5. `docs/DAILY_20_MISSION_PROTOCOL.md` — daily work-pool and execution model.
6. `docs/PARALLEL_FAILOVER_EXECUTION_PROTOCOL.md` — parallel/takeover rules; this is the controlling execution overlay.
7. `docs/ARENA_EXECUTION_MODEL.md` — supporting execution/evidence model.
8. `docs/ARENA_CONTINUATION_POLICY.md` — supporting safety guidance.
9. `docs/ARENA_RUNTIME_CONTRACT.md` — runtime safety model.
10. `docs/ARENA_CONTROL_PLANE_RECOVERY.md` — recovery guidance.
11. `docs/ARENA_REGISTRY.md` — default Arena roles.

If documents disagree about whether work must wait, the parallel/failover rule governs: **independent safe work must not be blocked by an unavailable Arena or Coordinator.** Safety, scope, evidence, and National governance remain mandatory.

## 2. Daily operating model

Chat1 normally:
- reads the boards;
- prioritizes work;
- coordinates overlapping changes;
- reconciles evidence;
- prepares integration order.

Chat1 is **not a single point of failure**.

If Chat1 is unavailable, Arenas may continue clearly scoped board work or take over another unavailable Arena's Mission. They must record the takeover and preserve evidence.

If one Arena is blocked, unrelated Arenas continue.

## 3. Mission state

The previous strictly serial state machine is replaced by per-Mission state tracking:

`PLANNED → ACTIVE → EXECUTED → TESTED → REPORTED → COMMITTED → PUSHED/DELIVERY-BLOCKED → INTEGRATION → VERIFIED`

Multiple independent Missions may be ACTIVE simultaneously.

A Mission being `DELIVERY-BLOCKED` does not block another independent Mission.

A Mission may be taken over by another Arena after evidence-first recovery.

## 4. Mandatory Mission delivery

For every Mission, the executing Arena should:

1. perform only the scoped work;
2. run required tests/checks;
3. write evidence/report;
4. commit Mission-scoped changes;
5. push when the live environment permits;
6. report exact SHA and delivery state.

A failed push is `NOT-PUSHED` for that attempt. It is not a fleet-wide blocker.

If push is unavailable, preserve the work in a durable repository artifact when possible and continue independent work. A later live session may deliver it.

## 5. Takeover / failover

If an Arena/session becomes unavailable:

1. another Arena may take over;
2. inspect `main`, branches, reports and commits;
3. establish the last trustworthy state;
4. preserve valid prior work;
5. do not reset/revert merely to re-anchor;
6. continue the same Mission or clearly queued board Mission;
7. record `TAKEOVER-FROM` and the reason;
8. commit/push from the available session when possible.

No permission from the unavailable Arena is required.

## 6. Scope and collision safety

Removing execution locks does **not** remove engineering safety.

- no `git add -A` over unrelated work;
- no force-push/history rewrite;
- no silent deletion of another Arena's valid work;
- inspect shared-file overlap before modifying high-collision files;
- keep changes minimal and traceable;
- reconcile conflicts before integration.

File ownership is advisory coordination metadata, not a reason to freeze the fleet. If two Arenas touch the same file, integrate/reconcile; do not stop unrelated work.

## 7. Evidence rules

Every claim remains evidence-backed:

`CLAIMED` / `IMPLEMENTED` / `TESTED LOCALLY` / `COMMITTED` / `PUSHED` / `PR OPEN` / `MERGED` / `VERIFIED ON MAIN` / `VERIFIED IN STAGING` / `PRODUCTION PROVEN`

`NOT-RUN` must state the exact operation and reason.

`PUSHED` and `MERGED` require Git evidence. Local green tests do not prove CI, staging, or production.

## 8. Chat1 coordination

Chat1 should coordinate, not gate.

It may sequence conflicting work and integration, but it must not create a global rule equivalent to:

`Mission N must push/merge before Mission N+1 can start.`

That rule is removed.

Independent Missions can run concurrently. Integration can happen later using explicit evidence and conflict handling.

## 9. Stop rule

An Arena may stop when:
- its current scoped work is complete and handed back;
- its session ends;
- the current operation is externally unavailable;
- no safe scoped work remains in its available work pool.

It must not stop unrelated fleet execution merely because another Arena is blocked.

A network failure stops the affected network operation, not the Mission fleet.

## 10. Security / governance invariants

These are intentionally **not removed**:

- no secrets/tokens in prompts or repository;
- no fabricated evidence;
- no unauthorized P0/P1 status changes;
- no National GO/NO-GO by an Arena or Chat1;
- no unsafe history rewrite;
- no silent cross-Arena data loss.

ChatGPT remains the sole National GO/NO-GO authority.

## 11. End-of-day audit

ChatGPT independently audits:
- all active/completed Missions;
- takeover events;
- commits/pushes/PRs/merges;
- failures and NOT-RUN items;
- integration conflicts;
- P0/P1 impact;
- remaining work.

Unmerged work is not falsely promoted to merged, but it also does not block independent progress.

## 12. Principle

**One failed chat must never make the rest of the project idle.**

Parallelize safe work. Take over unavailable work. Preserve evidence. Integrate deliberately. Keep National governance independent.
