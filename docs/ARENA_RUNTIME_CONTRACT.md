# Arena Runtime Contract — Non-Terminal Execution

**Status:** ACTIVE  
**Effective:** 2026-09-14

This contract closes the recurring failure mode where an Arena completes M1–M4, receives a re-validation round, emits an unchanged report, and stops.

## Invariants

1. An active Mission is **non-terminal** after M4.
2. A re-validation/round prompt does not reset, close, or re-open M1–M4.
3. If M1–M4 are already complete, the next state is `CONTINUATION PASS`, not `REPORT_ONLY`.
4. `awaiting coordinator`, `awaiting audit`, `awaiting merge path`, `session policy`, `push not attempted`, `unchanged`, and `re-validation stands` are not stop states by themselves.
5. A response/report is invalid as a completion signal unless it records either a concrete scoped action performed or the required second independent no-work proof.
6. Remote failure blocks only the affected remote operation. Local scoped work must continue.
7. When self-merge rules permit, the Arena owns the delivery chain and must not wait for a coordinator/user prompt.
8. Every checkpoint must include a concrete `next scoped action` unless the second-pass no-work proof has genuinely established that none exists.

## State machine

`BOOTSTRAP → M1 → M2 → M3 → M4 → CONTINUATION → CONTINUATION → ...`

There is no `M4 → STOP` transition.

The only valid stop transitions are:

- `CONTINUATION → WORK_WINDOW_ENDED`
- `CONTINUATION → NO_SCOPED_WORK_PROVEN`

`NO_SCOPED_WORK_PROVEN` requires the independent second pass described in `docs/ARENA_CONTINUATION_POLICY.md`.

## Stale local state

A stale observed local `main` SHA is evidence of checkout drift, not project truth. The Arena must recover current Mission/policy when possible and must not use stale local state as a reason to idle.

## Governance boundary

This contract does not authorize scope invention, P0/P1 closure/reclassification, Roadmap changes, cross-Arena ownership adjudication, or National GO.
