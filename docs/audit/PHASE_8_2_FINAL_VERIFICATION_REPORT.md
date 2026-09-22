# Phase 8.2 Final Verification Report

> **STATUS OF THIS DOCUMENT — CORRECTED 2026-09-21 (Chat 4, QA / Release Governance).**
>
> The previous revision of this file (published in commit `401d02b2`) declared
> `Status: VERIFIED` / `Final Verdict: VERIFIED` for commit
> `b0b55a13539dc917779d39053bfb8d2277428cc0`, with no run ID, no test counts and no
> raw output.
>
> That declaration was **not supported by the CI record and has been retracted.**
> Evidence: the cited commit's own `Node.js CI` run **#1074 FAILED**
> (`GET /repos/rezaa2544/p2/actions/runs?head_sha=b0b55a13...` → Node.js CI #1074 =
> `failure`, Codacy #235 = `failure`, Fortify #257 = `failure`). At the time of this
> correction that commit is **76 commits behind `main`**.
>
> Nothing below upgrades Phase 8.2. This revision replaces an unsupported claim with
> traceable evidence and an explicit **NOT VERIFIED** gate status.

---

## 1. Scope and method

This document reports **only what was executed or read from the GitHub Actions API**.
Documentation, commit messages, tags and prior reports are treated as claims, never as
evidence — per `.claude/skills/evidence-integrity-and-commit-accounting` (Type-A runtime
evidence, E0–E4 discipline).

## 2. Baseline

| Field | Value |
|---|---|
| Report revision date | 2026-09-22 |
| Current main SHA at reconciliation | `6460e55dfbea4a5cfe82a5d79f7106e367778ed3` |
| Current-head GitHub Actions | **no workflow run returned** |
| Current-head combined status | **no status checks returned** |
| Canonical engine | Node >= 22.0.0 |

This report must not reuse historical CI runs as current-head evidence.

## 3. CI evidence on the reviewed commit

| Workflow | Run | ID | Conclusion |
|---|---|---|---|
| **Node.js CI** | **#1155** | `35579534157` | **success — 28/28 steps, 0 skipped, 0 failed** |
| Security Program (SAST · SCA · SBOM · DAST · Secret) | #1047 | `35579534188` | success |
| Push on main | #367 | `35579532989` | success |
| Codacy Security Scan | #316 | `35579534166` | **failure — tooling/configuration, see §6** |
| Fortify | #348 | `35579533039` | **failure — missing `FOD_*` credentials, see §6** |

Gates confirmed executed (not skipped) inside #1155: migration chain 001→latest ·
rollback chain · clean re-apply · live-PG migration ledger (E3) · Live-PG suites ·
Live-Redis · Redis outage ⇒ auth fail-closed · OCC 10 concurrent writers · outbox
crash/restart + DLQ · Runtime Truth RT-01…RT-10 · Production Truth Gate · Phase 7
verifier T1–T7 · Phase 8.1 batteries A/B/C/D · R1/R2/R21 · `npm run build` · `npm test`.

## 4. Local reproduction on the reviewed commit

Executed in a clean workspace on Node **v22.23.2**:

| Command | Exit | Result |
|---|---|---|
| `npm ci` | 0 | 118 packages, lockfile v3, no install scripts |
| `npm run build` | 0 | `dist/payesh.html` — 1636.8 KB |
| `npm test` | 0 | **35/35** structural + **547/547** smoke, ~50s |
| `node tests/redis-backup.js` | 0 | **11/11** (includes the new B7 contention gate, §5) |

> `npm test` green is **not** equivalent to CI green: `npm test` wires 2 suites, while
> `node.js.yml` invokes 28 distinct test entrypoints against live `postgres:17` and
> `redis:8`. This asymmetry is recorded as **TEST/CI PARITY GAP** (F-QA-05) and is not
> resolved by this document.

## 5. Defect fixed in this revision cycle

**F-QA-08 — `tools/redis-backup.sh` reported success while taking no backup.**

- Reproduced on the reviewed commit: holding the lock in another process and invoking
  the script produced **exit 0 with zero backup files**. Cron (`0 */6 * * *`, line 14 of
  the script) could therefore never detect a permanently skipped backup.
- Fix: lock contention now exits **75** (`EX_TEMPFAIL`), deliberately distinct from `1`
  (real failure), and logs to stderr.
- Regression test: `tests/redis-backup.js` B7/B7b/B7c. Verified to **fail 9/11 (exit 1)
  against the pre-fix script** and pass **11/11 (exit 0)** after the fix.

## 6. Security workflow status — configuration, not vulnerability

Codacy #316 fails with `IllegalArgumentException: No rules found` (×12),
`Failed analysis for eslint/pmd/pmd-legacy` (×3 each) and
`ConfigurationNotFoundError: No ESLint configuration found`. Repository grep confirms no
`.eslintrc*` / `eslint.config.*` exists. `.codacy.yml` disables `pmd`/`pmd-legacy`, yet
those engines still execute — the config is not being honoured by the action.

**Zero security findings were reported by the tool.** Fortify fails for absent `FOD_*`
secrets. Both are **governance/configuration weaknesses**, not evidence of a
vulnerability — and equally, not evidence of the absence of one: effective SAST coverage
from these two workflows is currently nil. `codacy.yml` also sets
`max-allowed-issues: 2147483647`, which would suppress an issue-count gate if the tool
ever ran successfully.

## 7. Gate status

```
Phase 8.2 Exit   = NOT VERIFIED
Phase 8.3        = BLOCKED
Production GO    = NOT DECLARED
```

Open items that prevent a Phase 8.2 exit claim (owned by other packages, listed here only
so this document is not read as a clearance): S3 alert→on-call→runbook drill not
executed; S4 restore evidence contract not satisfied; R6 Redis-outage claims still rest on
test paths that skip without a live Redis; `phase8.2-verified` tag has no Node.js CI run
on its SHA (F-QA-01).

## 8. What this document does and does not assert

- **Asserts:** historical CI/runtime evidence cited above belongs to its stated SHA only.
- **Current-head fact:** `6460e55dfbea4a5cfe82a5d79f7106e367778ed3` has no GitHub Actions run returned by the current review and no combined status checks returned.
- **Does not assert:** Phase 8.2 completion, E4 DR, production readiness, or measured national-scale capacity.

---

**Final Gate Owner status:** Phase 8.2 Exit = NOT VERIFIED; Phase 8.3 = BLOCKED; Production GO = NOT DECLARED.
