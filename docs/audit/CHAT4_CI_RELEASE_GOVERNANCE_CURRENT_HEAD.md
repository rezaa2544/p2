# CHAT 4 — CI / Release Governance / Verification Evidence — Current-HEAD Audit

```
Historical report SHA : c29e3073cabc6b2644595ee99f5203011cc9f06a  (superseded)
Audit performed on    : ce990836b98052d1f7c5bb9bfa5293bf16725193  → committed as 0d245b9c
Audit date            : 2026-09-21
Scope                 : QA / release governance ONLY
Skill applied         : .claude/skills/evidence-integrity-and-commit-accounting
```

> **Rule enforced throughout:** current HEAD outranks every historical SHA. No finding is
> declared a defect unless it was reproduced on current HEAD in this session. No finding is
> reopened merely to agree with a previous report.

---

## A — Baseline

```
HEAD:          ce990836b98052d1f7c5bb9bfa5293bf16725193  (audit start)
               0d245b9c2dcadb92d16fffce5e9371cc021f8d03  (after this package's commit)
origin/main:   ce990836 at start — local was 23 behind, fast-forwarded
working tree:  DIRTY at session start with 3 snapshot artifacts (see F-QA-09), restored
Node:          v20.20.2 in sandbox  /  v22.23.2 installed to /tmp for canonical execution
npm:           10.8.2  /  10.9.8 with Node 22
engines:       node >= 22.0.0
tags at HEAD:  none
```

The 23 incoming commits were **documentation only** (`git diff --stat` = 8 files, 653
insertions, all under `docs/`). No code drift occurred between the historical report and
this audit.

---

## B — Finding Matrix

| Finding | Current evidence | Reproduced? | Severity | Disposition |
|---|---|---|---|---|
| **F-QA-02** | File unchanged at HEAD: 22 lines, `VERIFIED`, cites `b0b55a13` whose own Node.js CI **#1074 = failure**; commit is **76 behind main**; 0 run IDs, 0 test counts, 0 exit codes | **YES** | **P0** | **FIXED** — declaration retracted, replaced with traceable evidence; gate kept NOT VERIFIED |
| **F-QA-03** | Last 20 Node.js CI runs: **17 completed, 17 success, 0 failure** (3 pending at read time). **#1155 (id 35579534157) on current HEAD = success, 28/28 steps, 0 skipped** | **NOT REPRODUCED** | — | **CURRENTLY GREEN** — historical 65% flake not observed on current HEAD; boot timeout did not recur |
| **F-QA-01** | `phase8.2-verified` → `401d02b2`; that SHA has **no Node.js CI run** (only 2 failing Fortify). `phase8.2-final-main` → `fbe178be`, which carries one success (#1093, PR) and one failure (#1095, push) | **YES** | **P1** | **OPEN — tag not moved** (audit-only per brief) |
| **F-QA-08** | `tools/redis-backup.sh:49-52` — flock contention ⇒ `exit 0`. Local reproduction: lock held externally ⇒ **exit 0, 0 backup files**. Documented cron `0 */6 * * *` would see success | **YES** | **P1** | **FIXED** — exit 75 (EX_TEMPFAIL) + regression test B7/B7b/B7c |
| **F-QA-05** | `npm test` = 2 suites; `node.js.yml` invokes **28 distinct `node tests/*.js` entrypoints**; **931 `.js` files under `tests/`** (520 top-level + 411 in subdirs) | **YES** | **P2** | **OPEN — TEST/CI PARITY GAP documented** (no code change; correct fix is an explicit CI contract) |
| **F-QA-04** | Codacy #316 (latest, current HEAD): `No rules found` ×12, `Failed analysis for eslint/pmd/pmd-legacy` ×3 each, `ConfigurationNotFoundError` ×3, **0 security findings**. No ESLint config in repo. `.codacy.yml` disables pmd yet pmd still ran. `max-allowed-issues: 2147483647`. Fortify: missing `FOD_*` secrets | **YES** | **P2** | **OPEN — governance/configuration weakness, NOT a vulnerability** |
| **F-QA-06** | Step `Live-Redis suite (otp-redis — fails without Redis)` runs against a real `redis:8` service with `--health-cmd redis-cli ping`, health-interval 5s, retries 20; job-level `REDIS_URL=redis://127.0.0.1:6379` | **NOT REPRODUCED** | INFO | **CLOSED — naming is accurate in CI context.** Only nuance: outside CI with `REDIS_URL` unset the suite exits 0 on the in-memory path |
| **F-QA-07** | `package.json` = **1.0.0**; newest semver tag = **v1.0.1**; `git describe` = `phase8.2-final-main-60-gce990836`; **1918 commits since v1.0.1**; **CHANGELOG absent** | **YES** | **P2** | **OPEN — release hygiene.** No false release produced; no gate depends on it |
| **F-QA-09** | Session started with `D monitoring/alert-rules.yml` (symlink, mode 120000), `M tools/migrate-ledger.js` and `M tools/production-verifier.sh` (100755→100644). Total content delta = **1 line** (the symlink target). **Third occurrence** | **YES** | INFO | **TOOLING ISSUE — not a repository defect.** Restored via `git checkout --`; verified 120000/100755/100755 on remote |
| **F-QA-10** | `monitoring/alert-rules.yml` is a **symlink** → `../infra/observability/alert-rules.yml`; `infra/observability/prometheus.yml:20-22` loads **both** `alert-rules.yml` and `alerts.yml` | n/a | — | **WITHDRAWN / NO BLOCKER — confirmed still correct.** Nothing changed. Residual: `monitoring/alert-rules.yaml` (12 alerts) unreferenced |

---

## C — CI Evidence

### C.1 Current HEAD `ce990836`

```
SHA:       ce990836b98052d1f7c5bb9bfa5293bf16725193
workflow:  Node.js CI
run ID:    35579534157  (#1155)
status:    completed
jobs:      build (22.x) = success
steps:     28 total / 28 success
skipped:   0
failure:   none
```

```
SHA:       ce990836   workflow: Security Program (SAST·SCA·SBOM·DAST·Secret)
run ID:    35579534188  (#1047)   status: completed   conclusion: success
```

```
SHA:       ce990836   workflow: Codacy Security Scan
run ID:    35579534166  (#316)    status: completed   conclusion: FAILURE
failure:   tooling/configuration — "No rules found" ×12, no ESLint config; 0 security findings
```

```
SHA:       ce990836   workflow: Fortify
run ID:    35579533039  (#348)    status: completed   conclusion: FAILURE
failure:   FOD_* credentials absent (workflow's own skip-condition did not prevent failure)
```

### C.2 Determinism sample — last 20 Node.js CI runs

`#1136`…`#1152` all **success** (17 completed, 0 failure); `#1153`–`#1155` were pending at
first read, `#1155` subsequently completed **success**. Step-level check of `#1152`
(id resolved via API) also showed **28/28 success, 0 skipped**, confirming the gates ran
rather than being bypassed.

> The historical 65% pass rate and the `fbe178be` PR-vs-push divergence are **not
> reproduced on current HEAD**. They remain valid history for their own SHAs.

### C.3 Local execution on current HEAD (Node v22.23.2)

| Command | Exit | Result |
|---|---|---|
| `npm ci` | 0 | 118 packages, 1s |
| `npm run build` | 0 | `dist/payesh.html` 1636.8 KB |
| `npm test` | 0 | 35/35 + 547/547, ~50s |
| `node tests/redis-backup.js` (pre-fix script) | **1** | **9/11 — B7, B7c fail** |
| `node tests/redis-backup.js` (post-fix) | 0 | **11/11** |
| `node tests/disaster-recovery-coverage.js` | 0 | 47/47 |
| `bash -n tools/redis-backup.sh` | 0 | syntax clean |

---

## D — Changes

```
file:       tools/redis-backup.sh
change:     flock contention now exits 75 (EX_TEMPFAIL) to stderr instead of exit 0
reason:     F-QA-08 reproduced — cron could never see a permanently skipped backup
test:       tests/redis-backup.js B7/B7b/B7c — 9/11 exit 1 before, 11/11 exit 0 after
commit SHA: 0d245b9c2dcadb92d16fffce5e9371cc021f8d03
```

```
file:       tests/redis-backup.js
change:     added B7 (non-zero on contention), B7b (no backup produced), B7c (code 75 ≠ 1)
reason:     regression coverage — the suite was 8/8 green with zero contention coverage
test:       self; also re-ran disaster-recovery-coverage 47/47 and npm test 547/547
commit SHA: 0d245b9c2dcadb92d16fffce5e9371cc021f8d03
```

```
file:       docs/audit/PHASE_8_2_FINAL_VERIFICATION_REPORT.md
change:     retracted the unsupported "VERIFIED" declaration; replaced with run IDs,
            step counts, local exit codes, and an explicit NOT VERIFIED gate block
reason:     F-QA-02 — cited commit b0b55a13 had a FAILING Node.js CI (#1074)
test:       n/a (document); every figure cross-checked against the Actions API
commit SHA: 0d245b9c2dcadb92d16fffce5e9371cc021f8d03
```

**Not changed, deliberately:** the `phase8.2-verified` tag (brief says audit, not cosmetic
movement); alert configuration (F-QA-10 withdrawn); `npm test` wiring (F-QA-05 needs a CI
contract decision, not a unilateral edit); Codacy/Fortify workflows (governance decision).

**Recorded, out of scope:** `tools/redis-backup.sh` is mode `100644` in HEAD while the
documented cron entry invokes it as an executable path (`/opt/payesh/tools/redis-backup.sh`).
Pre-existing; not altered by this package.

---

## E — Final Disposition

```
Phase 8.2 Exit = NOT VERIFIED
Phase 8.3      = BLOCKED
Production GO  = NOT DECLARED
```

Two findings moved on evidence: **F-QA-02 fixed** (unsupported claim retracted) and
**F-QA-08 fixed** (real fake-green, reproduced then closed with a regression test).
**F-QA-03 is currently green** on this HEAD and is downgraded from "flaky" to
"not reproduced here" — history preserved, not erased. **F-QA-06 closed** as accurate
naming. **F-QA-10 remains withdrawn.** F-QA-01, F-QA-05, F-QA-04 and F-QA-07 stay open;
none of them is a vulnerability, and none was fixed cosmetically to make a report agree.

The chain `code → tests → CI → security workflows → release/tag → verification report →
Phase 8.2 gate evidence` is now **sound up to and including CI**, and **broken at the
release/tag and security-workflow links**: the tag carries no CI evidence, and two security
workflows produce no usable signal in either direction.

---

**Auditor:** Chat 4 — CI / Release Governance / Verification Evidence
**Date:** 2026-09-21
**Evidence basis:** GitHub Actions API + local execution on Node v22.23.2; every run ID cited
