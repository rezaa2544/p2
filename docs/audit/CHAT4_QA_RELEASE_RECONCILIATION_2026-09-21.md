# CHAT4 — QA / Release / CI-CD / Reproducibility Reconciliation Delta

**Date:** 2026-09-21  
**Source:** Chat 4 independent QA / Release Engineering audit  
**Audited baseline:** `fe633395` (audit traversed `38c63c1e → 138cd1d9 → fe633395`)  
**Audit commit:** `c29e3073cabc6b2644595ee99f5203011cc9f06a`  
**Mode:** audit-only; no implementation changes.

## Evidence boundary

Chat 4 applies a zero-trust rule: a claim is VERIFIED only when executed in the audit session or read from GitHub Actions API evidence. The report establishes clean Node 22 reproduction and identifies release/evidence-layer defects. It explicitly does **not** upgrade Phase 8.2 exit, G8.3-IN/OUT, or Production GO.

## Findings and roadmap disposition

| ID | Finding | Disposition | Roadmap action |
|---|---|---|---|
| F-QA-01 | `phase8.2-verified` points to `401d02b2` with no Node.js CI run | CONFIRMED / BLOCKING RELEASE LABEL | Do not treat tag as exit evidence; re-point or rename only after a CI-backed gate SHA exists |
| F-QA-02 | Final Verification Report declares VERIFIED while citing `b0b55a13`, whose Node.js CI #1074 failed; report has no run IDs/counts/raw evidence | CONFIRMED / P0 | Retract/rewrite report with SHA, run_id, per-suite counts and raw excerpts; Phase 8.2 exit remains NOT VERIFIED |
| F-QA-03 | Same `fbe178be` passed #1093 and failed #1095; GATE 3 boot timeout; 65% pass rate over sampled 20 runs | CONFIRMED / P1 | Fix/adapt boot timeout or pre-seed, then measure deterministic pass rate over ≥20 runs before calling CI green |
| F-QA-04 | Codacy/Fortify failures are scanner/config/credential failures, not vulnerability findings | CONFIRMED / NON-BLOCKING SECURITY EVIDENCE GAP | Repair credentials/config or explicitly retire these scanners from the gate; never count their red runs as security evidence |
| F-QA-05 | 520 test files but `npm test` wires only 2 suites; CI parity and Node ≥22 requirement are undocumented | CONFIRMED / REPRODUCIBILITY FOLLOW-UP | Add `test:ci` or equivalent documented local CI-parity path and document Node ≥22 |
| F-QA-06 | `otp-redis` passes on in-memory path when `REDIS_URL` absent; CI sets Redis URL | CONFIRMED / EVIDENCE-PRECISION | Rename/gate the step so its Redis dependency is explicit |
| F-QA-07 | package version 1.0.0 vs newest v1.0.1; no CHANGELOG | CONFIRMED / RELEASE GOVERNANCE | Establish coherent version/tag/changelog policy before release certification |
| F-QA-08 | `tools/redis-backup.sh` exits 0 on flock contention without backup | CONFIRMED / P1 | Fix exit/retry behavior; prerequisite for trustworthy S4 restore evidence |
| F-QA-09 | Snapshot restore can drop symlink/exec bits | CONFIRMED / WORKSPACE HYGIENE | Every agent must inspect status/mode changes; never use `git add -A` blindly |
| F-QA-10 | Prior alert-file findings corrected: `monitoring/alert-rules.yml` is symlink; Prometheus loads both canonical rule files | CORRECTION / RISK WITHDRAWN | Remove the withdrawn silent-alert claim; retain only orphan-file cleanup if desired |

## Existing-gate reconciliation

Chat 4 independently confirms:
- clean Node 22.23.2 install/build/test: `npm ci`, build, build:check, `npm test` 35/35 + 547/547, zero skips;
- R1 49 PASS, R2 32 PASS, R21 ledger 8 PASS, S2 metrics 4 PASS, server17 70/0;
- live-PG tests fail closed when PostgreSQL is absent;
- last fully green CI cited by the audit is #1098 on `138cd1d9`, 28/28 with zero skips;
- Phase 8.3 infrastructure exists, but empirical load validation is none.

These are strong runtime/CI evidence for the tested SHAs, but they do **not** close S3/S4 or the Phase 8.2 exit gate.

## Mandatory execution order after Chat 4

1. **F-QA-02:** replace unsupported Final Verification evidence package.
2. **F-QA-03:** stabilize GATE 3 and measure ≥20 runs.
3. **F-QA-01:** only then make the verification tag semantically valid.
4. **F-QA-08:** fix backup fake-green before S4.
5. **Existing M1:** live alert → on-call → acknowledgement → runbook → recovery E4 drill.
6. **Existing M2/M3:** E4 PostgreSQL + Redis restore/failover, verifier, measured RPO/RTO.
7. **Existing Chat 3 work:** OUTBOX-002 two-worker reproduction, DB-001 query/request measurement, OUTBOX-001 event coverage contract.
8. **Then:** Gate 8.2 VERIFIED → Phase 8.3 empirical staging/load work.

## Explicit non-blockers / corrections

- Codacy/Fortify failures do not establish a security vulnerability.
- The previously alleged orphan/silent-alert risk from the symlink is withdrawn.
- The Node 22 gate is an anti-fake-green control, not a test defect.
- No Phase 8.3 capacity number may be promoted from TARGET/POLICY to MEASURED by this report.

**Decision:** Phase 8.2 Exit remains **NOT VERIFIED**. Phase 8.3 remains **BLOCKED**. No Production GO.
