# Daily Mission Queue — Chat4

**Date:** 2026-09-14  
**Owner:** Chat4 — Performance / infrastructure  
**Status:** ACTIVE  
**Rule:** Execute M1→M2→M3→M4 sequentially; do not wait for a new prompt unless genuinely BLOCKED.

## M1 — Capacity/infrastructure baseline
- Inventory Redis, workers, observability, load tooling and deployment prerequisites on main.
- Separate tooling from real staging/national proof.

## M2 — Performance test readiness
- Validate and harden safe local load/stress/spike/soak harnesses and data-generation tooling.
- Do not claim live capacity from sandbox execution.

## M3 — Observability readiness
- Inspect metrics/logging/tracing/SLO instrumentation relevant to P0-5.
- Add only clearly authorized, Mission-scoped improvements and tests.

## M4 — P0-2/P0-5 evidence package
- Run available safe tests, verify results and produce concrete infrastructure gaps and next actions.
- Record what requires a real staging/live environment.

### Common rules
No destructive live tests, no invented capacity/SLO proof, no P0 closure. The Queue is a minimum path, not a stop condition. After M4, continue safe local performance, infrastructure, observability, harness and evidence work within this Mission until no independent scoped work remains. When a Mission-scoped change is ready, Chat4 owns commit → push → PR → checks → merge → main verification; do not wait for another prompt. Do not merge changes that close/reclassify P0 or require governance adjudication. If live infrastructure is unavailable, continue local harness/readiness work.

**Report:** `docs/daily-reports/Chat4/2026-09-14.md`
