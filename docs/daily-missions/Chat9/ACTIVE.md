# Daily Mission Queue — Chat9

**Date:** 2026-09-14  
**Owner:** Chat9 — Behavioral simulation / audit  
**Status:** ACTIVE  
**Rule:** Execute M1→M2→M3→M4 sequentially; do not wait for a new prompt unless genuinely BLOCKED.

## M1 — Reproduce current behavioral baseline
- Re-read the latest Chat9 audit/simulation reports and verify their claims against current main.
- Identify the highest-value behavioral scenarios still lacking current evidence.

## M2 — School simulation coverage
- Execute safe school-level simulations available in the repo, prioritizing end-to-end workflows and realistic data/role combinations.
- Record exact inputs, commands and outcomes.

## M3 — Failure/edge-case verification
- Exercise safe boundary, invalid-state, concurrency and recovery-adjacent scenarios relevant to school workflows.
- Diagnose real defects; do not invent findings.

## M4 — Audit delivery package
- Build a current behavioral coverage matrix: proven / failed / NOT-RUN / environment-dependent.
- Report concrete defects or evidence gaps with exact paths and reproduction steps; do not fix outside an explicit implementation Mission.

### Common rules
No feature ownership, no P0/P1 renumbering or closure, no invented production evidence. If one stage blocks, continue independent simulations.

**Report:** `docs/daily-reports/Chat9/2026-09-14.md`
