# Payesh Change Log

Material changes to the Payesh project are recorded here in reverse chronological order.

## 2026-09-30

### Fixed — B-PG: PostgreSQL blackhole resilience and mid-migration crash recovery

- **B-PG-1a (`server/db.js`):** both `pg.Pool` instances (primary and read replica) now set `connectionTimeoutMillis` (`PG_TIMEOUT_MS`/`PG_TIMEOUT`, default 3000), `query_timeout` (`PAYESH_PG_QUERY_TIMEOUT_MS`, default 10000) and keepAlive options. `db.ping()` and `db.healthCheck()` probe with an explicit `query_timeout` (`PAYESH_PG_PING_TIMEOUT_MS`, default 2000).
- **B-PG-1b (`server/infrastructure/phase6-canary-engine.js`):** `refreshCacheFromPg()` runs in the `onRequest` hot path of every HTTP request. Its `_sotCacheAt` field was written but never read, so the TTL gate was dead code and every request paid a synchronous `SELECT * FROM phase6_canary_configs;` before route dispatch. Added a real freshness gate (`PAYESH_CANARY_SOT_TTL_MS`, default 2000) plus an outage backoff (`PAYESH_CANARY_SOT_BACKOFF_MS`, default 30000) on the read path only; every authority write calls `invalidateSotCache()` and `refreshCacheFromPg({force:true})`, so the gates bound read staleness and never block a fail-closed write.
- **B-PG-2 (`tests/b-pg-health-blackhole.js`, new):** two-tree TCP-blackhole probe. Fixed tree: 11/11 checks pass, exit 0 — 0 client hangs, slowest 6022ms, median ~3011ms, every response is ok:false / HTTP 503 (the endpoint reports its own outage), recovery to 200 OK once the partition clears. Legacy tree (all timeout knobs disabled, incl. `PG_TIMEOUT_MS=0`): 8/8 responses hang, slowest 9017ms, exit 1.
- **B-PG-3 (`tests/b-pg-migration-midflight-kill.js`, new):** two-tree probe that kills the backend precisely between migration 012's committed partition swap and its ledger INSERT, on the pg-client path (this host has no `psql` binary — the D-4 environment). Fixed tree: 9/9 checks pass, exit 0 — the rerun detects 012's own `ALREADY_APPLIED` guard and records the ledger row with a matching checksum. Legacy tree: detection was gated on `usePsql`, so a psql-absent host could not recover; reproduced RED, exit 1.
- Updated the stale assertion in `tests/data-integrity-occ-migration.js` so task 5 binds the post-D-4 detection shape (`ALREADY_APPLIED` surfaced through stderr on both the psql and pg-client paths) instead of the removed `usePsql` gate.

Evidence: full regression `npm test` 547/547 passing, exit 0; eslint on all five changed files reports 0 errors. See `docs/PREQUISITES.md` §133 for the complete mission record and Lessons 22–23.

## 2026-09-25

### Added — External project memory system

- Added a repository-side seven-layer external-memory foundation.
- Added project dashboard / Kanban fallback.
- Added daily task ledger.
- Added durable decision log.
- Added architecture map source.
- Added GitHub issue workflow guidance.
- Established the rule that task completion requires repository/evidence support, not agent self-attestation.

See: `docs/external-memory/PROJECT_MEMORY_SYSTEM.md`.


## 2026-09-25

### Updated — Current project intelligence and execution state

- Synchronized project intelligence and external-memory status to main HEAD `38ecab9599168f8d53b0dcd89d77009dd7596f94`.
- Recorded merged PR #415 (A-31 verification publication) and PR #416 (current-head Sync/OCC evidence publication).
- Recorded that A-35 remediation/evidence is present in main history but still requires exact-current-HEAD re-verification.
- Preserved verification registry binding to `e4584806` until a final hardening SHA is frozen and evidence is regenerated.
- Added root-cause-driven A-30..A-39 next-step plan and explicit three-AI validation dependency.


## FINAL SYNCHRONIZATION RECEIPT — 2026-09-25
**Exact main HEAD after this synchronization series:** `7c1a4ce3c29810910bfee72e17358d81032c33ea`.
This SHA includes the synchronization updates themselves. The verification registry remains intentionally bound to `e4584806c1af2a1e5db648c8452580a8fa8cbcec` until the hardening SHA is frozen and evidence is regenerated; therefore this receipt is a project-state update, not a certification.


## 2026-09-25

### Added — Root-cause recurrence elimination
- Added docs/audit/ROOT_CAUSE_REAPPEARANCE_PROGRAM_2026-09-25.md.
- Recorded recurrence patterns across A-18/A-20/A-22/A-24/A-31/A-34/A-35/A-37.
- Added P0 controls: Invariant Registry, Reappearance Regression Suite, evidence invalidation, complete path/config inventories and authoritative policy contracts.
- Changed future reporting rule: FIXED is scoped unless the reason previous controls failed to prevent recurrence is identified and root-cause closure is proven.


## 2026-09-25

### Added — Supervising Engineer control
- Added docs/external-memory/SUPERVISING_ENGINEER.md.
- Added mandatory delivery contract and push/PR/merge completion rules.
- Recorded the root cause of prior push non-compliance as a missing enforcement/hand-off gate rather than a missing prompt instruction.



## 2026-09-25

### Added — Master defect priority and two-Atria remediation
- Added `docs/audit/MASTER_DEFECT_PRIORITY_2026-09-25.md`.
- Reconciled the latest fresh defect hunt against current main.
- Added current-main open root-cause findings F1/F2/F4 and marked F3/F5 for final revalidation rather than duplicate remediation.
- Established non-overlapping Atria-1 / Atria-2 remediation ownership.
- Changed execution order to root-cause remediation first, then independent test/certification.


## 2026-09-25 — Independent multi-report defect reconciliation

- Added canonical reconciliation: `docs/audit/MULTI_REPORT_DEFECT_RECONCILIATION_2026-09-25.md`.
- Consolidated independent reports into NCR-01..NCR-27 with severity and current-head disposition.
- Promoted current-head blockers (server syntax corruption, credential projection, parent_links manager scope, certification boolean trap, intelligence/privacy paths, CI/test detection gaps, migration/SMS schema drift) into the hardening queue.
- Explicitly prevented stale/duplicate report findings from being counted as new active defects when later current-head evidence shows mitigation; those remain REVALIDATION_REQUIRED.
- Updated Master Defect Priority, Current Work Execution Plan, Project Intelligence, Dashboard, Daily Tasks, Decision Log, and Supervising Engineer memory.
- Project status remains **HARDENING / RECONCILIATION — NOT VERIFIED**. No certification or production-readiness claim is made.


## 2026-09-25 — Final multi-report synchronization receipt

- Synchronization batch baseline: `7bb19fccba07843008ee410e10f4c405135dca91`.
- Canonical consolidated audit: `docs/audit/MULTI_REPORT_DEFECT_RECONCILIATION_2026-09-25.md`.
- NCR-01..NCR-27 are now recorded with severity, disposition and execution order.
- Stale/duplicate findings are explicitly retained only as REVALIDATION_REQUIRED where current-head evidence shows mitigation.
- Project state remains **HARDENING / RECONCILIATION — NOT VERIFIED**; broad certification remains blocked.
