# Daily Mission Queue — Chat6

**Date:** 2026-09-14  
**Owner:** Chat6 — Release / database / merge control  
**Status:** ACTIVE  
**Rule:** Execute M1→M2→M3→M4 sequentially; do not wait for a new prompt unless genuinely BLOCKED.

## M1 — Release/P0 evidence audit
- Verify current main, open PRs and six canonical P0 states.
- Reconcile tracker claims with actual PR/commit/main evidence.

## M2 — PostgreSQL release readiness
- Inspect migrations, schema, startup/runtime enforcement and release gates related to PostgreSQL source-of-truth.
- Identify concrete missing release controls/tests.
- Do not merge or close P0-1.

## M3 — Merge queue preparation
- For relevant open PRs, inspect base/head, changed files, conflicts, CI and dependency order.
- Produce a safe merge sequence for authorized work.

## M4 — Release control package
- Re-verify today's completed work against main/PR evidence.
- Produce release-readiness matrix and exact blockers/next actions.

### Common rules
No force-push, no history rewrite, no P0 closure, no invented CI/staging evidence. The Queue is a minimum path, not a stop condition. After M4, continue release/database/merge-readiness work within this Mission until no independent scoped work remains. For Mission-scoped PRs that do not close/reclassify P0/P1, Chat6 is authorized and expected to complete commit → push → PR → checks/conflict resolution → merge → main verification without waiting for another prompt. **Do not merge or close P0-1 itself, and stop for any governance adjudication.** Network failures are NOT-RUN. If one stage blocks, continue independent stages.

**Report:** `docs/daily-reports/Chat6/2026-09-14.md`
