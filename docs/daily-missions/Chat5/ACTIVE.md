# Daily Mission Queue — Chat5

**Date:** 2026-09-14  
**Owner:** Chat5 — QA / chaos / quality gate  
**Status:** ACTIVE  
**Rule:** Execute M1→M2→M3→M4 sequentially; do not wait for a new prompt unless genuinely BLOCKED.

## M1 — P0-1 independent verification
- Verify current-main PostgreSQL enforcement and Wave-1 gate tests.
- Distinguish implementation, local test evidence, CI and staging proof.
- Produce exact acceptance gaps.

## M2 — Test battery and failure analysis
- Run all safe, relevant existing QA/gate suites available in the repo.
- Prioritize authz, smoke, server, write-path and regression suites relevant to current main.
- Record exact commands/results; diagnose real failures without masking them.

## M3 — P0/P1 acceptance matrix
- Map canonical P0 gates and current technical P1 inventory to existing tests/evidence.
- Identify untested acceptance criteria and the smallest safe tests that would close each gap.
- Do not close or renumber blockers.

## M4 — QA delivery package
- Re-check changed evidence and reports from today's Arena work.
- Produce a concise independent QA verdict: proven / unproven / failed / NOT-RUN.
- Give exact next verification actions for ChatGPT.

### Common rules
No P0 closure, no Roadmap rewrite, no invented staging/production evidence. The Queue is a minimum path, not a stop condition. After M4, continue unresolved QA, regression, test-battery, acceptance and evidence work within this Mission until no independent scoped work remains. For Mission-scoped test/documentation/code changes that do not close/reclassify P0/P1, Chat5 owns commit → push → PR → checks → merge → main verification and must not wait for another prompt. Do not merge a change whose merge itself closes/reclassifies a P0/P1 or requires governance adjudication. If one stage is blocked, continue independent stages. NOT-RUN must include the exact reason.

**Report:** `docs/daily-reports/Chat5/2026-09-14.md`
