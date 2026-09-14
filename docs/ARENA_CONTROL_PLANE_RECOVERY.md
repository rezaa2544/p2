# Arena Control-Plane Recovery — Non-Blocking Bootstrap

**Status:** ACTIVE  
**Effective:** 2026-09-14

## Purpose

This protocol handles stale or partially disconnected Arena workspaces. A missing local Mission, stale local `main`, or temporary GitHub/network failure is a **control-plane recovery condition**, not an automatic Mission stop.

## Recovery state

When an Arena cannot read its local `docs/daily-missions/<CHAT_NAME>/ACTIVE.md`:

1. Do **not** invent a new Mission and do **not** claim the project Mission is missing yet.
2. Inspect local refs/history for the latest known Mission and canonical control documents.
3. Attempt to recover the exact Mission from current `main` when remote/API access exists.
4. If remote/API access is unavailable, record only that remote recovery operation as `NOT-RUN` and continue **control-plane recovery work**: inspect refs, commit ancestry, local policy copies, prior report/checkpoint state, and unresolved evidence already present in the workspace.
5. Do not make implementation/code changes merely to create work while Mission authorization is unresolved.
6. If exact Mission recovery is still unavailable after the required recovery attempt, **activate `CONTINUITY-FALLBACK`** under `docs/ARENA_CONTINUITY_AUTHORIZATION.md`. This is a pre-authorized bounded role envelope, not a new Mission.
7. Once the exact active Mission is recovered, resume that Mission immediately and stop using fallback scope.
8. Only enter `BLOCKED` when the exact Mission is genuinely unavailable/expired/contradictory, the applicable continuity envelope has no safe work, all permitted control-plane recovery actions are exhausted, and an external decision/dependency is actually required.

## Important distinction

`MISSION FILE NOT FOUND LOCALLY` ≠ `MISSION DOES NOT EXIST`.

`FETCH FAILED` ≠ `NO AUTHORIZED WORK EXISTS`.

`STALE CHECKOUT` ≠ `PROJECT STATE IS STALE`.

`NO ACTIVE MISSION RECOVERED` ≠ `NO SAFE ROLE-LOCAL WORK EXISTS`.

Remote delivery failure affects only remote delivery. It never converts an otherwise executable Mission or continuity envelope into a terminal state.

## No-work proof

A no-work claim still requires the independent second pass required by `docs/ARENA_CONTINUATION_POLICY.md`. Recovery mode and continuity-fallback are not stop states by themselves.

## Governance boundary

Recovery/fallback mode never authorizes scope invention, P0/P1 closure or reclassification, Roadmap changes, cross-Arena ownership adjudication, or National GO.
