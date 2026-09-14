# Daily Mission Queue — Chat7

**Date:** 2026-09-14  
**Owner:** Chat7 — Merge queue / documentation gate monitoring  
**Status:** ACTIVE  
**Rule:** Execute M1→M2→M3→M4 sequentially; do not wait for a new prompt unless genuinely BLOCKED.

## M1 — Open PR queue audit
- Inspect current open PRs, changed files, bases/heads, conflicts and CI state.
- Identify safe vs blocked integration candidates.

## M2 — Documentation gate audit
- Verify freeze-marker, docs-stats-sync, metadata and refs gates on current main where available.
- Trace concrete causes of failures/drift.

## M3 — Integration hygiene
- Identify duplicate/stale reports, unrelated changes and documentation inconsistencies that can affect safe merge.
- Prepare precise corrections, but do not alter historical freeze artifacts without authorization.

## M4 — Merge-readiness package
- Re-check current queue and produce an evidence-first merge order/risk list for ChatGPT.

### Common rules
No force-push, no historical deletion, no P0 closure. The Queue is a minimum path, not a stop condition. After M4, continue open-PR, documentation-gate, integration-hygiene and evidence work within this Mission until no independent scoped work remains. When a safe Mission-scoped PR is ready, Chat7 may and should complete the delivery chain itself: commit → push → checks → merge → main verification. Do not merge if the change closes/reclassifies P0/P1, alters historical freeze artifacts without authorization, or requires governance adjudication. If network blocks a check, mark NOT-RUN and continue local/documentation work.

**Report:** `docs/daily-reports/Chat7/2026-09-14.md`
