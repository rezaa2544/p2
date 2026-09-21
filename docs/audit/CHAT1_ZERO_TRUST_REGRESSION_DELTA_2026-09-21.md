# Chat 1 Zero-Trust Regression Audit Delta — 2026-09-21

## Evidence boundary

Independent report supplied in this session:
- audited SHA: `6762d84b3c25f317ead7f2c3b95c5aa0b94e2951`
- current repository HEAD: `fbe178be7c99ddb6c068eee4f7b389a6b9e7aeab`

Therefore findings from the report are **historical-to-current candidates**, not current-main verdicts, unless reproduced on `fbe178be`.

## Findings added to the work register

| ID | Finding | Current status | Required action |
|---|---|---|---|
| RT1-01 | `tests/session8-audit-async-io.js` allegedly regresses because `createAudit()` performs synchronous directory initialization in async mode | **REPRODUCTION REQUIRED** | Run the exact suite on current HEAD; if red, inspect `server/audit.js` and remediate without weakening the invariant |
| RT1-02 | `tests/api/runner.js` allegedly fails standalone after R1 unless `PAYESH_ALLOW_DEV_MEMORY_AUTHORITY=1` is set | **REPRODUCTION REQUIRED / TEST-HARNESS DRIFT CANDIDATE** | Run standalone and with explicit dev flag; decide whether runner should self-declare its test-only authority mode or migrate to live PG |
| RT1-03 | `tests/wave1-reads.js` allegedly contains a stale `readCollection()` expectation after P0-01 | **REPRODUCTION REQUIRED** | Run current suite; inspect whether the assertion is still present and whether the intended contract is now the DB-native/scoped read seam |
| RT1-04 | `tests/wave23-reports-pg.js` allegedly uses a handwritten migration runner incompatible with PG17 migration 012 | **REPRODUCTION REQUIRED** | Run against PG17 on current HEAD; if reproduced, route migrations through the canonical ledger runner or update the test harness consistently |
| RT1-05 | Broad fake-green scan reported zero skip constructs, no assertion-masking empty catches, and secret-scan 12/12 | **HISTORICAL EVIDENCE — RECHECK CURRENT HEAD** | Re-run the static audit on `fbe178be` before using these counts as current gate evidence |
| RT1-06 | Report claims Phase 8.2 S3/S4 are pending and G6 blocked | **RECONCILES WITH CURRENT ROADMAP** | Keep Phase 8.2 at PARTIAL / Exit NOT VERIFIED until current-main S3/S4 evidence is reconciled |

## Roadmap impact

1. These findings do **not** reopen completed Phase 8.1 work automatically.
2. They create a bounded **Phase 8.2 Evidence-Reconciliation / Regression Reproduction** work package.
3. No remediation is to be merged merely to make a historical audit green; each change requires reproduction, root cause, targeted fix, and regression evidence.
4. Phase 8.3 remains blocked by the Phase 8.2 exit gate and, independently, by E4 staging / realistic-scale evidence requirements.
5. The report's claims about 49/49 R1, 32/32 R2, 14/14 R21, etc. are treated as historical evidence at SHA `6762d84`; current-main CI evidence remains the authoritative source for current status.

## Execution order

```
M0-R1  Reproduce RT1-01..04 on fbe178be
M0-R2  Re-run fake-green/static hygiene checks on fbe178be
M0-R3  Reconcile results with current CI #1093 and Phase 8.2 artifacts
M1     Fix only reproduced regressions/drift
M2     Complete S3 alert/on-call evidence
M3     Complete S4 PG/Redis restore + measured RPO/RTO
M4     Issue Phase 8.2 Exit Gate
      ↓
Phase 8.3 provisioning / E4 staging
```

**Decision rule:** a finding changes roadmap status only after current-HEAD reproduction or authoritative runtime/CI evidence.
