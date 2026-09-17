# Daily 20-Mission Execution Protocol

**Status:** ACTIVE  
**Authority:** ChatGPT — Independent Senior Auditor / National GO-NO-GO  
**Coordinator:** Chat 1 — coordinator when available, not a global execution gate  
**Execution:** Chat2–Chat10 with parallel execution and takeover  
**Effective:** 2026-09-17

## Why the model changed

The previous deterministic one-Mission-at-a-time handshake created an unintended fleet bottleneck: one unavailable session, one failed push, or one blocked Arena could prevent otherwise independent work from progressing.

That behavior is removed.

The 20 Missions are now a **daily work pool**. They remain pre-scoped and evidence-driven, but independent Missions may execute in parallel. Arena ownership is a default owner, not an exclusive reservation.

## Daily flow

`ChatGPT audit → 20-Mission work pool → Arenas execute independently/in parallel → TEST → COMMIT → PUSH WHEN POSSIBLE → TAKEOVER IF NEEDED → INTEGRATE → ChatGPT audit`

Chat1 coordinates priorities and integration when available, but execution does not depend on Chat1 being online.

## Mission state

Each Mission independently tracks:

`PLANNED → ACTIVE → EXECUTED → TESTED → REPORTED → COMMITTED → PUSHED/DELIVERY-BLOCKED → INTEGRATION → VERIFIED`

Multiple Missions may be ACTIVE at once when their scopes are safe to run concurrently.

## Delivery rule

For every completed Mission the Arena must:

1. perform only the scoped work;
2. run required tests/checks;
3. record exact evidence;
4. commit Mission-scoped changes;
5. push when the live session permits;
6. report exact SHA and delivery state.

`PUSH FAILED` means only `DELIVERY-BLOCKED` for that delivery attempt. It does not stop other Missions.

## Failover rule

If any Arena or session fails, another available Arena may take over its unfinished Mission.

The takeover Arena must:

- inspect main/branches/reports/commits;
- establish the last trustworthy state;
- preserve valid work;
- avoid reset/revert unless explicitly required by a safe integration procedure;
- continue the same Mission when incomplete;
- record `TAKEOVER-FROM`, prior SHA/branch and reason;
- commit/push from the available live session when possible.

A new session does **not** imply a new Mission.

## Chat1 responsibility

Chat1 remains the coordinator and online supervisor when available. It should:

- maintain the work-pool view;
- prioritize high-value work;
- identify file collisions;
- reconcile evidence;
- prepare integration order;
- route takeover when an Arena fails.

Chat1 must **not** block independent work waiting for another Mission to push or merge.

Chat1 is not a single point of failure.

## Arena responsibility

Every Arena may execute an available scoped Mission without waiting for Chat1 when:

- the Mission is clearly identifiable;
- scope is known;
- no active overlapping change is being made by another known Arena, or takeover is being performed;
- the Arena can produce evidence.

If an Arena is unsure whether work overlaps, inspect the repository and choose the smallest safe scope; do not freeze unrelated work.

## Scope safety

The removal of execution gates does not authorize scope invention.

No Arena may:
- invent unrelated product work;
- silently change P0/P1 status;
- declare National GO;
- use another Arena's unverified claim as evidence;
- destroy another Arena's valid work;
- use `git add -A` blindly;
- force-push or rewrite history;
- place secrets/tokens in prompts or files.

## Shared files

Shared-file collisions are handled as integration problems.

Before modifying a high-collision file:
- inspect current main;
- inspect recent commits/branches when available;
- keep the diff minimal;
- record expected overlap;
- reconcile before landing.

A shared file does not justify stopping unrelated Missions.

## Evidence

A Mission report must contain:

- Mission ID;
- exact scope;
- files changed;
- tests/checks with raw exit codes;
- commit SHA;
- branch;
- push/PR/merge state;
- NOT-RUN items and exact reasons;
- takeover information if applicable;
- remaining independently executable work.

`NOT-RUN` applies only to the operation that was not run.

`PUSHED`, `MERGED`, and `VERIFIED ON MAIN` require actual Git evidence.

## Stop rule

An Arena may stop its own work when its current scope is complete, the live session ends, or the required operation is externally unavailable.

It must not interpret its own stop as a fleet stop.

It must not wait for another Arena before performing safe independent work.

## National gate

This protocol does not change National governance. ChatGPT remains the independent National GO/NO-GO authority.

Local success, merged code, and completed daily Missions do not by themselves imply National GO.

## End-of-day

ChatGPT audits the whole work pool, including:
- completed Missions;
- incomplete Missions;
- takeover events;
- unpushed local work;
- pushes/PRs/merges;
- integration conflicts;
- tests and NOT-RUN items;
- P0/P1 impact.

## Principle

**No single chat is a single point of failure. No single push failure freezes the fleet. Parallelize safely, take over when necessary, and integrate with evidence.**
