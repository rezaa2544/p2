# Daily Mission Queue — Chat10

**Date:** 2026-09-14  
**Owner:** Chat10 — Operations / reliability  
**Status:** ACTIVE  
**Rule:** Execute M1→M2→M3→M4 sequentially; do not wait for a new prompt unless genuinely BLOCKED.

## M1 — Operational evidence baseline
- Verify current DR, recovery, SLO, RTO/RPO and operational-readiness artifacts on main.
- Classify every numeric target as SOURCED / UNSOURCED / HISTORICAL.
- Record the exact evidence locations and NOT-RUN limitations.

## M2 — Recovery/runbook hardening
- Inspect recovery procedures, failure modes, dependencies and drill prerequisites.
- Improve documentation/runbooks only where explicitly supported and safe; never invent targets.
- Add a concrete gap/checklist/verification artifact when a safe scoped improvement is available.

## M3 — Reliability readiness
- Map operational gaps to P0-3/P0-5 and current architecture.
- Build safe local validation/checklists for recovery and incident response where possible.
- Add focused local tests/fixtures/tooling only when they are directly within this Mission and do not invent live-environment proof.

## M4 — Operational readiness package
- Re-verify all evidence and produce a concrete readiness matrix with blockers and required real-environment proofs.
- Do not declare P0 closure or National GO.

## Mandatory continuation semantics

The M1→M4 queue is a **minimum path**. It is never a terminal state.

If a later prompt says `re-validation`, `round N`, `unchanged`, or reports that M1–M4 were already completed, **do not restart the Mission and do not stop**. Preserve the active Mission state and immediately begin the next `CONTINUATION PASS`.

The first continuation pass must inspect, in order: unfinished recovery/runbook work; Mission-scoped failures; missing focused tests/fixtures; hardening opportunities; regression/integration verification; PR/delivery state; main verification; and missing evidence/report checkpoints.

A statement such as `M1–M4 not re-executed`, `complete`, `awaiting coordinator`, `awaiting audit`, `session policy`, or `nothing else` is **not** a valid stop condition. If no obvious code change exists, perform the required second independent no-work pass before stopping and record exactly what was checked.

If GitHub/network is unavailable, mark only the affected push/PR/check/merge operation `NOT-RUN` and continue all independent local Mission work. Do not treat an unavailable remote operation as a reason to close the session.

For Mission-scoped documentation, runbook, test or safe tooling changes, Chat10 owns `commit → push → PR → checks → merge → verify main → report` and must execute that chain without waiting for another prompt. Self-merge is permitted under the canonical policy when the change is fully in scope, required checks/tests are satisfied or explicitly NOT-RUN, there is no unresolved conflict, and the merge does not close/reclassify P0/P1 or decide National GO.

## Governance boundaries

- Unsourced RTO/RPO remains UNSOURCED.
- No destructive live chaos without explicit authorization.
- No P0/P1 closure, renumbering, reclassification, Roadmap rewrite, cross-Arena ownership adjudication, or National GO.
- The owning Arena must not invent a new Mission.
- The canonical common prompt and `docs/ARENA_CONTINUATION_POLICY.md` override weaker stop interpretations.

**Report:** `docs/daily-reports/Chat10/2026-09-14.md`
