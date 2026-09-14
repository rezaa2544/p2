# Payesh — Arena All-Day Continuation Policy

**Status:** ACTIVE  
**Effective:** 2026-09-14

## Objective

A user should be able to send the common Arena prompt once at the beginning of a work session. An Arena must then keep doing useful, authorized work without waiting for the user, Chat1, or a new Mission until the session/work window ends.

## Mandatory execution loop

For every active Mission:

`BOOTSTRAP → M1 → M2 → M3 → M4 → CONTINUATION PASS → CONTINUATION PASS → ...`

Completing M4 is **never by itself a valid stop reason**.

If M1–M4 were already completed in an earlier round of the same active Mission, the Arena must **resume at CONTINUATION PASS**, not report the queue as a reason for stopping. A prompt described as `re-validation`, `round N`, `unchanged`, or similar does not reset, close, or suspend the active Mission.

## Continuation Pass

After M4, the Arena must repeatedly inspect its active Mission scope and perform the highest-value unfinished safe work, in this order where applicable:

1. finish incomplete implementation;
2. fix Mission-scoped test failures;
3. add missing focused tests/fixtures;
4. harden the existing implementation;
5. verify integration and regression behavior;
6. inspect and maintain its Mission-scoped PR;
7. push/refresh PR and run/recheck available checks;
8. merge when the self-merge rules permit it;
9. verify the resulting `main` state;
10. recover missing evidence and update the report/checkpoint.

After each pass, repeat the inspection. Do not declare completion merely because no obvious code change is immediately visible.

## No-work claim is exceptional

Before claiming that no further scoped work exists, the Arena must perform a second independent pass over:

- active Mission acceptance criteria;
- relevant code/tests/docs;
- open PRs and CI/check state;
- known NOT-RUN/environment limitations;
- unresolved findings from its own report and today's other evidence.

The report must list exactly what was checked and why no safe scoped action remains. A vague `complete`, `nothing else`, `awaiting coordinator`, `awaiting audit`, `session policy`, or `re-validation stands` is not a valid stopping state.

## Blocking

A single unavailable network call, stale checkout, missing local report, or failed optional check blocks only that operation. Recover from current `main`, continue independent work, and record the affected item as `NOT-RUN`.

No local/session-specific policy may override this continuation policy. A remote operation may be `NOT-RUN` without making the Mission `BLOCKED`.

Only a genuinely impossible Mission—missing/expired/contradictory on current `main`, or requiring an external governance decision with no independent work remaining—may enter `BLOCKED`.

## Delivery

For Mission-scoped changes that do not close/reclassify P0/P1 or decide National GO, the owning Arena is responsible for:

`commit → push → PR → checks → merge → verify main → report`

It must not wait for a user/coordinator prompt for these normal delivery steps.

If push/PR/merge is technically unavailable, the Arena must continue independent work and record only the affected operation as `NOT-RUN`; it must not use that limitation as a stop reason while scoped work remains.

## Governance boundary

Continuation never authorizes an Arena to invent scope, change the Roadmap, renumber/close P0/P1, resolve cross-Arena ownership disputes, or declare National GO.

## Required report semantics

Every checkpoint records:

- current stage/pass;
- work performed;
- exact tests/checks and results;
- commit/PR/merge state;
- NOT-RUN reason where applicable;
- next scoped action.

The Arena may stop only when the work window ends or the second-pass no-work test proves there is genuinely no independent authorized work left.
