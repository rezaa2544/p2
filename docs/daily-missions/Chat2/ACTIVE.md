# Daily Mission Queue — Chat2

**Date:** 2026-09-14  
**Owner:** Chat2 — Feature / application execution  
**Status:** ACTIVE  
**Rule:** Execute M1→M2→M3→M4 sequentially; do not wait for a new prompt unless genuinely BLOCKED.

## M1 — Feature backlog reconciliation
- Re-read current roadmap/application scope and verify implemented vs claimed feature work.
- Identify the highest-priority feature work that is explicitly unblocked and within Chat2 ownership.

## M2 — Implement the selected unblocked feature slice
- Implement only the explicitly evidenced, unblocked feature slice found in M1.
- Add/adjust focused tests and preserve existing contracts.

## M3 — Regression and integration hardening
- Run relevant feature, API, schema and regression tests.
- Fix failures caused by the Mission scope; do not expand scope.
- Verify diff and repository cleanliness.

## M4 — Delivery verification
- Reconcile implementation with Roadmap and main/PR state.
- Commit/PR according to project rules and record exact evidence.

### Common rules
No P0/P1 changes, no roadmap rewrite, no unrelated refactor. If the selected feature is blocked, document why and execute independent verification work from the same domain rather than idling.

**Report:** `docs/daily-reports/Chat2/2026-09-14.md`
