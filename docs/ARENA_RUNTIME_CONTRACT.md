# Arena Runtime Contract — Non-Terminal Execution

**Status:** ACTIVE  
**Effective:** 2026-09-14

This contract closes the recurring failure mode where an Arena completes M1–M4, receives a re-validation round, emits an unchanged report, or loses its local Mission file and stops.

## Invariants

1. An active Mission is **non-terminal** after M4.
2. A re-validation/round prompt does not reset, close, or re-open M1–M4.
3. If M1–M4 are already complete, the next state is `CONTINUATION PASS`, not `REPORT_ONLY`.
4. `awaiting coordinator`, `awaiting audit`, `awaiting merge path`, `session policy`, `push not attempted`, `unchanged`, and `re-validation stands` are not stop states by themselves.
5. A response/report is invalid as a completion signal unless it records either a concrete scoped action performed or the required second independent no-work proof.
6. Remote failure blocks only the affected remote operation. Local scoped work must continue.
7. A missing/stale local Mission is a **control-plane recovery condition**, not proof that the Mission does not exist.
8. `MISSION FILE NOT FOUND LOCALLY` and `FETCH FAILED` are not terminal states. The Arena must attempt exact Mission recovery. If exact recovery is temporarily unavailable, it must enter the bounded `CONTINUITY-FALLBACK` envelope in `docs/ARENA_CONTINUITY_AUTHORIZATION.md` rather than idle.
9. When self-merge rules permit, the Arena owns the delivery chain and must not wait for a coordinator/user prompt.
10. Every checkpoint must include a concrete `next scoped action` unless the second-pass no-work proof has genuinely established that none exists.
11. `CONTINUITY-FALLBACK` is a standing bounded authorization, not a new Mission and not permission to invent scope.

## Deterministic bootstrap gate

Before the first report, the Arena SHOULD run:

`node tools/arena-runtime-gate.js <Chat1..Chat10>`

The command is a deterministic aid for selecting `MISSION_MODE` versus `CONTINUITY_FALLBACK`. Its output `STOP_ALLOWED=NO` is authoritative for the runtime decision unless the work window has actually ended or the required second-pass no-work proof has been completed.

The command does not replace repository evidence, Mission contents, or governance review. It only prevents a missing/stale local Mission from being misinterpreted as a stop condition.

## State machine

`BOOTSTRAP → CONTROL-PLANE RECOVERY? → CONTINUITY-FALLBACK? → M1 → M2 → M3 → M4 → CONTINUATION → CONTINUATION → ...`

There is no `M4 → STOP` transition and no `MISSION-FETCH-FAILED → STOP` transition.

The only valid stop transitions are:

- `CONTINUATION → WORK_WINDOW_ENDED`
- `CONTINUATION → NO_SCOPED_WORK_PROVEN`
- `CONTROL-PLANE RECOVERY → BLOCKED` only after exact Mission recovery is genuinely impossible, the applicable continuity envelope has no safe work, all permitted recovery actions are exhausted, and an external decision/dependency is actually required.

`NO_SCOPED_WORK_PROVEN` requires the independent second pass described in `docs/ARENA_CONTINUATION_POLICY.md`.

## Stale local state

A stale observed local `main` SHA is evidence of checkout drift, not project truth. The Arena must recover current Mission/policy when possible and must not use stale local state as a reason to idle.

## Control-plane recovery

Canonical details are in `docs/ARENA_CONTROL_PLANE_RECOVERY.md`. Recovery may inspect refs/history, recover policy/Mission files, reconcile evidence, recover reports/checkpoints, and diagnose environment access.

If exact Mission recovery is unavailable after the required recovery attempt, the Arena may use only the role-local bounded work in `docs/ARENA_CONTINUITY_AUTHORIZATION.md`. It must not invent a Mission or manufacture unrelated product work.

## Governance boundary

This contract does not authorize scope invention, P0/P1 closure/reclassification, Roadmap changes, cross-Arena ownership adjudication, or National GO.
