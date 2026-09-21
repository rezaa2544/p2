# CHAT4 — QA / Release Engineering / CI-CD / Reproducibility / Evidence Integrity Audit

```
HEAD:          fe6333955... (audit ran across 38c63c1e → 138cd1d9 → fe633395)
BRANCH:        main
AUDIT DATE:    2026-09-21
MODE:          AUDIT-ONLY — zero code change
NODE USED:     v22.23.2 (canonical engine, installed into /tmp to enable real execution)
SKILL APPLIED: .claude/skills/evidence-integrity-and-commit-accounting (E0–E4, Type-A runtime evidence)
```

> **Zero-Trust rule applied:** nothing is `VERIFIED` here unless it was executed in this session or
> read from a GitHub Actions API response. Documentation, commit messages, tags and prior reports
> are treated as claims, never as evidence.

---

## 1. Executive Summary

The repository is **genuinely buildable, testable and reproducible from a clean environment** — this
was proven by execution, not inspection. A clean `npm ci` (118 packages, 2s), `npm run build`
(dist/payesh.html, 1636.8 KB), `npm run build:check` and the full `npm test` (35/35 + 547/547,
51s, exit 0) all succeeded on canonical Node 22. Twenty-eight of twenty-eight CI steps passed with
**zero skips** on commit `138cd1d9`. The engineering substrate is real.

Three problems dominate the QA picture, all of them in the **evidence and release layer**, not in
the code:

1. **The `phase8.2-verified` tag points to a commit with no Node.js CI run at all** (`401d02b2`).
   The only workflows that touched that SHA were two failing Fortify runs. A tag literally named
   "verified" is therefore not backed by verification evidence.
2. **`docs/audit/PHASE_8_2_FINAL_VERIFICATION_REPORT.md` declares `VERIFIED`** while citing commit
   `b0b55a13` — a commit **22 behind HEAD whose own Node.js CI run (#1074) FAILED**. The report is
   22 lines long and contains zero run IDs, zero test counts and zero raw output.
3. **CI is flaky at a 65% pass rate** (13 success / 7 failure over the last 20 runs). The most
   important instance: **the same commit `fbe178be` passed as #1093 (pull_request) and FAILED as
   #1095 (push)**. Root cause extracted from the raw log: a **boot timeout** in GATE 3 of the
   Production Truth Gate, not a logic defect.

Two findings from my own previous report must be **withdrawn or corrected** — the zero-trust rule
applies to me as well. See §5.3.

Codacy's failure was fully diagnosed and is **not a security defect**: the CLI aborts with
`IllegalArgumentException: No rules found` (no project token ⇒ no rule set loaded) and
`ConfigurationNotFoundError: No ESLint configuration found`. Zero security issues were reported.
Fortify fails identically for missing credentials — **8 of its last 8 runs failed**.

---

## 2. Current Ground Truth

| Item | Value | Proof |
|---|---|---|
| HEAD at audit end | `fe633395` | `git rev-parse HEAD` |
| Branch | `main` | `git branch --show-current` |
| Commits | 2237+ | `git rev-list --count HEAD` |
| Working tree | clean (after restoring snapshot artifacts, §5.4) | `git status --porcelain` |
| Sync | ahead 0 / behind 0 at each checkpoint | `git rev-list --count` |
| package version | `1.0.0` | `package.json` |
| engines | `node >= 22.0.0` | `package.json` |
| Lockfile | present, `lockfileVersion: 3` | `package-lock.json` |
| Install scripts | **none** (no pre/post-install) | `package.json` scripts audit |
| Tags | `national-baseline-start`, `v1.0.0`, `v1.0.1`, `phase8.2-verified`, `phase8.2-final-main` | `git tag` |
| CI on HEAD | Node.js CI **#1101 in_progress** at audit time | Actions API |
| Last completed green CI | **#1098 on `138cd1d9` — 28/28 steps, 0 skipped** | Actions API |

### 2.1 Tag ↔ evidence cross-check

| Tag | SHA | CI on that SHA | Verdict |
|---|---|---|---|
| `v1.0.0` | `b2428ad2` (2026-09-07) | historical | INFO — 1864 commits behind HEAD |
| `v1.0.1` | `522afe8f` (2026-09-07) | historical | INFO — package.json still says 1.0.0 (mismatch) |
| `phase8.2-verified` | `401d02b2` | **only 2 failing Fortify runs; NO Node.js CI** | **P1 — unsupported claim** |
| `phase8.2-final-main` | `fbe178be` | Node.js CI #1093 ✅ (PR) **and** #1095 ❌ (push) | **P1 — contradictory evidence** |

---

## 3. Test & CI Matrix

### 3.1 Independently executed in this session (Type-A runtime evidence, Node 22.23.2)

| Command | Exit | Duration | Result | Skips |
|---|---|---|---|---|
| `npm ci` | 0 | 2s | 118 packages, 0 EBADENGINE | — |
| `npm run build` | 0 | 1s | dist/payesh.html 1636.8 KB, 95 JS modules | — |
| `npm run build:check` | 0 | <1s | authz parity 394 actions | — |
| `npm test` | **0** | **51s** | **35/35 + 547/547** | **0** |
| `node tests/r1-eliminate-ram-authorities.test.js` | 0 | 108ms | **49 PASS** | 0 |
| `node tests/r2-postgres-authority-fail-closed.js` | 0 | 99ms | **32 PASS** | 0 |
| `node tests/schema-migrations-ledger.test.js` | 0 | 33ms | **8 PASS** | 0 |
| `node tests/observability-s2-metrics.test.js` | 0 | 39ms | **4 PASS** | 0 |
| `node tests/session-revocation.js` | 0 | 3.1s | **16 PASS / 0 FAIL** | **3 (D-a, D-b + 1)** |
| `node tests/server17.js` | 0 | 74.6s | **70 green / 0 red** | 0 |
| `node tests/otp-redis.js` | 0 | <1s | 16/16 — **in-memory path** | — |
| `node tests/otp-redis.js` with unreachable `REDIS_URL` | **1** | — | fails correctly | — |
| `node tests/schema-migrations-live-pg.test.js` | **1** | — | "cannot run without live PostgreSQL" | — |
| `node tests/canary-atomic-postgres-live-runtime.js` | **1** | — | "PostgreSQL unreachable" | — |

### 3.2 Node-version gate — an exemplary anti-fake-green control

Running `npm test` on Node 20.20.2 produces:

```
✋ Node >= 22.0.0 canonical engine required. Current: 20.20.2
   اجرای تست روی Node < 22 = skip پنهان = سبزِ کاذب — عمداً قرمز می‌شویم.
exit=1
```

This is the single strongest QA control in the repository: the suite **refuses to produce a
misleading green** on the wrong runtime. Note that `npm ci` itself only emits `EBADENGINE`
**warnings** and does not block — the enforcement lives in the test runner, which is the right place.

### 3.3 CI workflow inventory

| Workflow | Trigger | Services | continue-on-error | Gate strength |
|---|---|---|---|---|
| `node.js.yml` | push + PR | **postgres:17, redis:8 (real)** | none | **HARD GATE — 23 steps** |
| `security.yml` | push + PR + cron | — | 3 jobs (sca, sbom, dast) | SAST + secret are hard; rest documented best-effort |
| `codacy.yml` | push + PR + cron | — | none | currently always failing |
| `fortify.yml` | push | — | none | **8/8 last runs failed** |
| `codeql.yml` | — | — | none | not examined in depth (Chat 2/3 scope) |
| `npm-publish-github-packages.yml` | release | — | none | publish path |

### 3.4 CI #1093 forensic (the run named in the mission)

`run_id=35547816870` · `Node.js CI #1093` · head_sha `fbe178be` · branch `phase8.2-integrate-origin-main` · event **pull_request** · conclusion **success**.

All 23 functional steps reported `success`; **zero skipped**. Confirmed present and green:
`npm ci` · migration chain 001→latest · rollback chain · clean re-apply · live-PG ledger (E3) ·
Live-PG suites · Live-Redis · Redis outage ⇒ auth fail-closed · OCC 10 concurrent writers ·
outbox crash/restart + DLQ · Runtime Truth RT-01…RT-10 · Production Truth Gate · Phase 7 verifier
T1–T7 · Phase 8.1 batteries A/B/C/D · R1/R2/R21 · `npm run build` · `npm test`.

> **Caveat that must travel with this evidence:** #1093 ran on `fbe178be`, which is **not** the
> current HEAD. It is valid evidence *for that commit only*.

### 3.5 Test inventory vs actual execution — the structural gap

- **520 test files exist in `tests/`.**
- **`npm test` wires only 2 suites** (`tests/run.js` + `tests/smoke.js`).
- Everything else executes **only inside `node.js.yml`**.

Consequence: a developer running the documented command locally exercises a small fraction of the
suite. This is not fake-green — the CI does run them — but it means **local green ≠ repository green**,
and that distinction is not documented anywhere.

---

## 4. Fake-Green Findings

Every candidate was inspected in context rather than counted by grep.

| Pattern | Location | Verdict |
|---|---|---|
| `\|\| true` | `node.js.yml:115` — `service redis-server stop \|\| ... \|\| true` | **NOT fake-green.** Only tolerates a failed *stop* of a service; the real assertion `node tests/phase2-redis-fail-closed.js` runs unguarded on the next line. |
| `continue-on-error: true` | `security.yml` jobs `sca`, `sbom`, `dast` | **Accepted with documentation.** Header states these need a live npm registry / network. SAST and secret-scan jobs remain hard gates. |
| `exit 0` comment | `node.js.yml:24` | **Documentation of the hazard**, not an instance of it. |
| Node-version skip | `tests/run.js` | **Inverse of fake-green** — deliberately exits 1. |
| `tests/otp-redis.js` without `REDIS_URL` | exit 0 on in-memory path | **P2 — misleading CI step name.** Step is titled *"Live-Redis suite (otp-redis — fails without Redis)"*. With `REDIS_URL` set (as in CI) it does fail correctly; without it, it silently tests the memory path. The claim is true in CI, false as a general statement. |
| `catch(()=>{})` on decision paths | `server/`, `tools/` | None found on a decision path (re-confirmed; matches prior audit). |
| `tools/redis-backup.sh:51` | lock contention ⇒ `exit 0` | **P1 — genuine fake-green, still open** (carried from prior audit). |
| `process.exit(0)` in truth gate | `tools/production-truth-gate.js:497` | **Correct** — `process.exit(fail.length ? 1 : 0)`. |

### 4.1 CI failure propagation — verified, not assumed

- GitHub's default shell for `run:` is `bash -e`; a synthetic `node -e "process.exit(3)"` propagated
  exit 3 and aborted the subsequent command in a local `bash -e` reproduction.
- **Real-world proof:** in run **#1095**, the Production Truth Gate step failed and the **following
  9 steps were `skipped`**, including R1/R2/R21 and `npm test`. The pipeline is genuinely fail-closed.

> Distinction the mission asked for: **application fail-closed** (Redis/PG outage ⇒ 503) and
> **pipeline fail-closed** (step failure ⇒ job failure) are *both* confirmed, independently.

---

## 5. Reproducibility Findings

### 5.1 Dependency reproducibility — GOOD

Deterministic `npm ci` from `lockfileVersion: 3`; 118 packages; **no pre/post-install scripts**
(a meaningful supply-chain positive); 9 runtime deps, 2 dev deps. On Node 20 the install still
succeeds with `EBADENGINE` warnings — the mismatch is caught later, by the test runner.

### 5.2 Build reproducibility — GOOD

`node build.js` produced an identical single-file artifact on a clean tree in ~1s with no network
dependency. `build:check` independently re-validates help-text sync and the authorisation model
(394 actions, 199 writers).

### 5.3 Corrections to my own previous audit (zero-trust applied to myself)

| Prior claim (commit `38c63c1e`) | Ground truth now | Action |
|---|---|---|
| "**four** parallel alert-rule files" | `monitoring/alert-rules.yml` is a **symlink** to `infra/observability/alert-rules.yml`. Real distinct files: **three** (`alert-rules.yml` 11 alerts, `alerts.yml` 26 alerts, `monitoring/alert-rules.yaml` 12 alerts). | **CORRECTED** |
| "unverified which alert file production loads ⇒ silent-alert risk" | `infra/observability/prometheus.yml:20-22` loads **both** `alert-rules.yml` *and* `alerts.yml`. | **WITHDRAWN** — the risk does not exist as stated. `monitoring/alert-rules.yaml` (12 alerts) remains unreferenced. |

### 5.4 Environment artifact — recurring, must be known by every agent

At session start the working tree was dirty with:

```
 D monitoring/alert-rules.yml      ← symlink deleted
 M tools/migrate-ledger.js         ← exec bit 100755 → 100644
 M tools/production-verifier.sh    ← exec bit 100755 → 100644
```

Content diff was **zero**. This is a snapshot-restore artifact (symlinks and permission bits are not
preserved). Committing it would have been a real CI regression, since both tools are invoked directly.
Restored with `git checkout --`; verified `100755` on `origin/main` afterwards. **This is the second
occurrence.**

### 5.5 Answer to the mission's central question

> *"If an independent engineer clones the repository, starts from a clean environment and runs the
> documented commands, can they reproduce the same results?"*

**Yes — conditionally, and the conditions are not documented.**

- ✅ Clean install, build and `npm test` reproduce exactly — **on Node ≥ 22**.
- ❌ On Node 20 the suite refuses to run (correctly), but **no README/CONTRIBUTING states this**.
- ❌ Roughly **518 of 520 test files** are unreachable through documented commands; they require CI
  or manual invocation with live PostgreSQL and Redis.
- ❌ There is **no documented local path** to stand up postgres:17 + redis:8 equivalently to CI
  (no root `docker-compose.yml` for the test stack; `infra/postgres/docker-compose.ha.yml` serves HA, not CI parity).

---

## 6. Release Readiness

| Dimension | State | Evidence |
|---|---|---|
| Version metadata | `package.json` = **1.0.0** while newest tag is **v1.0.1** | direct read |
| CHANGELOG | **absent** | `ls` |
| Tag ↔ CI integrity | `phase8.2-verified` has **no CI run**; `phase8.2-final-main` has one ✅ and one ❌ on the same SHA | Actions API |
| Build artifact | reproducible, single-file, offline | executed |
| Migration up/down | 20 up / 20 down, all transactional, 3-cycle zero-residue **in CI** | #1095 log GATE 2 |
| Rollback | exercised in CI (`Rollback chain — latest → 001`) | #1093 steps |
| Health/startup | boot path exercised; **timed out once** under CI load | #1095 GATE 3 |
| Secrets/config | Codacy and Fortify credentials **absent** | workflow conditionals |

**Release verdict: NOT RELEASEABLE AS "VERIFIED" TODAY.** Not because the code is broken — it
demonstrably is not — but because the release metadata (tag, version, final report) makes claims the
CI record does not support.

---

## 7. Phase 8.2 QA Evidence Status

| Item | exists | tested | executed | captured | reproducible | auditable | Status |
|---|---|---|---|---|---|---|---|
| **S2 — R6/R7 decisions** | ✅ | partly | partly | ✅ docs | ⚠️ | ⚠️ | **PARTIAL** — Redis-outage claims rest on SKIPPED tests (`D-a`,`D-b`) |
| **S2 — SLO.md** | ✅ | n/a | n/a | ✅ | ✅ | ✅ | **DOCUMENTED, DISCIPLINED** (32× TARGET/POLICY vs 6× MEASURED) |
| **S2 — metrics** | ✅ | ✅ | ✅ **4/0 executed** | ✅ | ✅ | ✅ | **VERIFIED** |
| **S2 — alerts** | ✅ | ✅ loaded by Prometheus | ✅ | ✅ | ✅ | ⚠️ no owner/team | **PARTIAL** |
| **S3 — alert→on-call→runbook** | ⚠️ docs only | ❌ | ❌ | ❌ | ❌ | ❌ | **NOT VERIFIED** |
| **S4 — restore/DR** | tools exist | ❌ | ❌ | ❌ | ❌ | ❌ | **NOT VERIFIED** — no DB-identity proof mechanism |
| **Final Verification Report** | ✅ | — | — | ❌ | ❌ | ❌ | **REJECTED AS EVIDENCE** (§9 F-QA-02) |
| **Exit Gate 8.2** | — | — | — | — | — | — | **NOT OPEN** |

---

## 8. Phase 8.3 QA Readiness — infrastructure only

**This section makes no empirical claim. No load test was executed.**

| Component | Present | Notes |
|---|---|---|
| k6 suites | ✅ **5 suites** — `national-load-test`, `saturation-test`, `soak-24h-test`, `spike-mehr-test`, `chaos-redis-test` | authored; k6 binary not installed in any runner |
| Load tooling | ✅ `capacity-saturation-probe.js`, `delta-load-test.js`, `wave18-load-to-pg.js`, `w18-load-pg.sh` | present |
| Prometheus | ✅ `infra/observability/prometheus.yml` loading both rule files | real config |
| Grafana / dashboards | ✅ `grafana/`, `payesh-dashboard.json` | present |
| Loki / promtail / OTel | ✅ | present |
| PgBouncer | ✅ `infra/postgres/pgbouncer/pgbouncer.ini` | present |
| PostgreSQL HA | ✅ `docker-compose.ha.yml`, pgbackrest template, recovery template | present |
| Redis | ✅ `infra/redis/` | present |
| Abort thresholds / artifact capture | ⚠️ not verified | — |

**Classification: INFRASTRUCTURE READINESS — PARTIAL. Empirical validation: NONE.**
The 20k RPS / 2.5k TPS / 25k events/s / 3,500 connections / 25k IOPS / 300 MB/s / 45k Redis ops/s
envelope remains **TARGET/POLICY**; `docs/CAPACITY_MODEL.md` says so itself.

---

## 9. Findings

---
```
ID:          F-QA-01
Severity:    P1
Area:        Release integrity / tag evidence
Claim:       Tag `phase8.2-verified` marks a verified Phase 8.2 state.
Expected:    A green Node.js CI run on the tagged SHA.
Observed:    SHA 401d02b2 has NO Node.js CI run. Only 2 Fortify runs, both failed.
Evidence:    GET /actions/runs?head_sha=401d02b2... → fortify #283 ❌, #284 ❌
Reproduction: curl the Actions API with that head_sha
Impact:      A tag named "verified" carries no verification evidence; any downstream
             consumer treating it as a release marker is misled.
Root Cause:  Tag created from a documentation commit rather than a CI-validated one.
Remediation: Either move the tag to a SHA with a green Node.js CI run, or rename it
             (e.g. phase8.2-report-published) and document that it is not a gate.
Blocks:      Release labelling; Phase 8.2 exit claim
```
---
```
ID:          F-QA-02
Severity:    P0
Area:        Evidence integrity
Claim:       docs/audit/PHASE_8_2_FINAL_VERIFICATION_REPORT.md → "Final Verdict: VERIFIED"
Expected:    Run IDs, test counts, raw output, and a SHA whose CI passed.
Observed:    22-line file. Cites commit b0b55a13 — 22 commits behind HEAD — whose own
             Node.js CI run #1074 FAILED. Zero run IDs, zero counts, zero raw output.
Evidence:    file content; GET /actions/runs?head_sha=b0b55a13... → Node.js CI #1074 = failure
Reproduction: cat the file; curl the Actions API with that head_sha
Impact:      Highest-authority document in the audit trail asserts VERIFIED against a
             commit with failing CI. Directly violates the repository's own
             evidence-integrity skill (Type-A runtime evidence required).
Root Cause:  Report written as a declaration rather than an evidence package.
Remediation: Retract or rewrite with: SHA, run_id, per-suite counts, raw excerpts.
             Until then it must not be cited as Phase 8.2 exit evidence.
Blocks:      Phase 8.2 exit gate
```
---
```
ID:          F-QA-03
Severity:    P1
Area:        CI reliability
Claim:       CI reflects repository health.
Expected:    Deterministic outcome for a given commit.
Observed:    Same SHA fbe178be = SUCCESS as #1093 (pull_request) and FAILURE as #1095
             (push). Last 20 Node.js CI runs: 13 success / 7 failure = 65% pass rate.
Evidence:    Raw log of #1095, step "Production Truth Gate":
             "boot timeout: generated JWT secret" → "❌ [G3] بوت نمونه A" → exit 1,
             immediately after "[store] PG is empty ... seeding PG from the bootstrap
             store now (one-time)".
Reproduction: download run 35548316645 logs; compare with 35547816870
Impact:      A red CI cannot be distinguished from a real regression without manual
             log forensics; 9 downstream steps (incl. R1/R2/R21, npm test) were skipped.
Root Cause:  Boot wait budget in GATE 3 does not accommodate one-time PG seeding.
Remediation: Raise//make adaptive the boot timeout, or pre-seed before the gate; then
             measure pass rate over ≥20 runs.
Blocks:      Any claim that "CI is green"; Phase 8.2 exit
```
---
```
ID:          F-QA-04
Severity:    P2  (INFO for security posture)
Area:        Security scanning / CI configuration
Claim:       Codacy Security Scan failure indicates a security problem.
Expected:    Either findings, or a clean run.
Observed:    Tool-level configuration failure. Repeated
             "java.lang.IllegalArgumentException: No rules found" for pmd, pmd-legacy,
             eslint, and "ConfigurationNotFoundError: No ESLint configuration found in
             /src/tests/infrastructure/event-processing". ZERO security issues reported.
             Confirmed locally: no .eslintrc*/eslint.config.* exists in the repository.
             Fortify fails for the same class of reason: FOD_* credentials absent —
             8 of its last 8 runs failed.
Evidence:    raw log of run 35547816917, step "Run Codacy Analysis CLI"; local ls
Reproduction: unzip the run logs; grep for "No rules found"
Impact:      Two permanently-red workflows train reviewers to ignore red. No evidence
             of an actual vulnerability either way — scanning coverage is effectively nil.
Root Cause:  Missing CODACY_PROJECT_TOKEN and missing ESLint config; missing FOD_* secrets.
Remediation: Add an ESLint config + project token, or disable the workflows and state
             that SAST coverage comes from security.yml/codeql.yml instead.
Blocks:      Nothing directly — but it must NOT be counted as security evidence.
```
---
```
ID:          F-QA-05
Severity:    P2
Area:        Reproducibility / documentation
Claim:       Documented commands reproduce repository results.
Expected:    A documented local path to the CI result.
Observed:    520 test files exist; `npm test` wires 2 suites. The remaining ~518 run only
             inside node.js.yml with live postgres:17 + redis:8. No documented local
             stack for CI parity; no README statement of the Node >= 22 requirement.
Evidence:    grep of tests/run.js (6 file refs); ls tests/*.js (520); workflow inspection
Reproduction: npm test locally, compare step list with node.js.yml
Impact:      "Local green" materially overstates coverage; an independent engineer
             cannot reproduce the CI verdict from documentation alone.
Root Cause:  Test orchestration lives in CI rather than in an npm script.
Remediation: Add `npm run test:ci` (or compose file) mirroring node.js.yml, and document
             the Node 22 requirement in README/CONTRIBUTING.
Blocks:      Independent reproducibility claim
```
---
```
ID:          F-QA-06
Severity:    P2
Area:        CI step naming / evidence precision
Claim:       CI step "Live-Redis suite (otp-redis — fails without Redis)".
Expected:    Non-zero exit whenever Redis is absent.
Observed:    Without REDIS_URL the suite exits 0 on the in-memory path (16/16 green).
             With an unreachable REDIS_URL it correctly exits 1. In CI REDIS_URL is
             always set, so the gate is real there — the step NAME generalises falsely.
Evidence:    node tests/otp-redis.js → exit 0;
             REDIS_URL=redis://127.0.0.1:6399 node tests/otp-redis.js → exit 1
Reproduction: both commands above
Impact:      Anyone reading the step name would conclude the suite is Redis-gated
             unconditionally. It is environment-gated.
Root Cause:  createOtpStore falls back to memory when no redis handle is supplied.
Remediation: Rename the step, or make the test assert REDIS_URL is set.
Blocks:      Nothing; evidence-precision only
```
---
```
ID:          F-QA-07
Severity:    P2
Area:        Release metadata
Claim:       Repository has coherent versioning.
Expected:    package.json version >= newest tag; a changelog.
Observed:    package.json = 1.0.0; newest semver tag = v1.0.1; HEAD is 1864 commits
             beyond v1.0.1; no CHANGELOG file anywhere.
Evidence:    package.json; git tag; git rev-list --count v1.0.1..HEAD
Reproduction: the three commands above
Impact:      No machine-readable way to say what is released.
Root Cause:  Tagging decoupled from package metadata.
Remediation: Adopt one versioning policy; generate a changelog from CODE_COMMIT history.
Blocks:      Release engineering
```
---
```
ID:          F-QA-08
Severity:    P1
Area:        Fake-green (carried forward, still open)
Claim:       tools/redis-backup.sh performs a backup.
Expected:    Non-zero exit or retry when it cannot back up.
Observed:    Line 51: on flock contention it logs and `exit 0` with no backup taken.
Evidence:    file content (unchanged since prior audit)
Impact:      A scheduled backup can report success while producing nothing — the exact
             failure mode that destroys a restore drill's premise.
Remediation: exit non-zero, or wait for the lock.
Blocks:      S4 restore evidence
```
---
```
ID:          F-QA-09
Severity:    INFO (environment)
Area:        Workspace integrity
Claim:       —
Observed:    Snapshot restore silently drops symlinks and exec bits:
             monitoring/alert-rules.yml (symlink) deleted; tools/migrate-ledger.js and
             tools/production-verifier.sh demoted 100755 → 100644. Zero content change.
             Second occurrence this project.
Evidence:    git status / git diff at session start
Remediation: Every agent must run `git status` and inspect `git diff` for mode-only
             changes before committing. Never `git add -A` in this workspace.
Blocks:      Nothing if checked; would cause a CI regression if committed.
```
---
```
ID:          F-QA-10
Severity:    INFO (self-correction)
Area:        Evidence integrity — my own prior report
Claim:       My commit 38c63c1e asserted "four parallel alert-rule files" and
             "unverified which file production loads ⇒ silent-alert risk".
Observed:    monitoring/alert-rules.yml is a SYMLINK to infra/observability/alert-rules.yml
             (three distinct files, not four). prometheus.yml:20-22 loads BOTH
             alert-rules.yml and alerts.yml explicitly.
Evidence:    readlink; grep -A4 rule_files infra/observability/prometheus.yml
Action:      Prior finding D-6 is CORRECTED and its risk claim WITHDRAWN.
             monitoring/alert-rules.yaml (12 alerts) remains unreferenced — P3 leftover.
```
---

## 10. Required Remediation (dependency order, not preference)

1. **F-QA-02** — retract/rewrite the Final Verification Report. *Nothing downstream is trustworthy
   while the top-level evidence document is unsupported.*
2. **F-QA-03** — fix the GATE 3 boot timeout, then measure pass rate over ≥20 runs.
   *Until CI is deterministic, every other verdict is probabilistic.*
3. **F-QA-01** — re-point or rename `phase8.2-verified` (requires 2 to be meaningful).
4. **F-QA-08** — fix the `redis-backup.sh` fake-green (prerequisite for any S4 evidence).
5. **F-QA-05** — add `test:ci` + document Node 22 (enables independent reproduction).
6. **F-QA-04** — add ESLint config/token or retire Codacy+Fortify from the red set.
7. **F-QA-06**, **F-QA-07**, F-QA-10 leftover — naming, versioning, orphan alert file.

---

## 11. Final QA Matrix

| Area | Status | Evidence | Reproducible | CI Covered | Release Risk |
|---|---|---|---|---|---|
| Build | **VERIFIED** | executed, exit 0, 1636.8 KB artifact | ✅ | ✅ | LOW |
| Dependencies | **VERIFIED** | `npm ci` 118 pkgs, lockfile v3, no install scripts | ✅ | ✅ | LOW |
| Unit Tests | **VERIFIED** | 35/35 + 547/547 executed | ✅ | ✅ | LOW |
| Integration | **PARTIAL** | CI-only; not runnable locally | ❌ local | ✅ | MEDIUM |
| PostgreSQL | **NOT VERIFIED locally** | fail-closed correctly without DB; green in #1093/#1098 | ❌ local | ✅ | MEDIUM |
| Redis | **PARTIAL** | otp-redis green on memory path; fail-closed with bad URL | ⚠️ | ✅ | MEDIUM |
| Migrations | **VERIFIED (CI)** | 20up/20down, 3-cycle zero residue, rollback exercised | ❌ local | ✅ | LOW |
| R1 | **VERIFIED** | 49 PASS executed here | ✅ | ✅ | LOW |
| R2 | **VERIFIED** | 32 PASS executed here | ✅ | ✅ | LOW |
| R21 | **VERIFIED (unit)** | 8 PASS executed here; live-PG only in CI | ⚠️ | ✅ | LOW |
| OCC | **VERIFIED (CI)** | step green in #1093/#1098 | ❌ local | ✅ | MEDIUM |
| Outbox / DLQ | **VERIFIED (CI)** | step green in #1093/#1098 | ❌ local | ✅ | MEDIUM |
| Runtime Truth | **VERIFIED (CI)** | RT-01…RT-10 green | ❌ local | ✅ | MEDIUM |
| Production Truth | **FLAKY** | ✅ #1093/#1098, ❌ #1095 boot timeout | ❌ | ✅ | **HIGH** |
| Phase 8.1 | **VERIFIED (CI)** | batteries A–D green; B = 70/0 reproduced locally | ⚠️ | ✅ | LOW |
| Phase 8.2 | **PARTIAL** | S2 real; S3/S4 not started | ⚠️ | partial | **HIGH** |
| Phase 8.3 Readiness | **INFRASTRUCTURE PARTIAL** | 5 k6 suites, PgBouncer, Prometheus present; no execution | n/a | ❌ | n/a |
| CI/CD | **PARTIAL** | fail-closed proven; 65% pass rate | ✅ | — | **HIGH** |
| Security Scan | **NOT VERIFIED** | Codacy config-failure; Fortify 8/8 fail; security.yml green | ✅ | ⚠️ | MEDIUM |
| Release | **NOT READY** | tag/report/version mismatches | — | — | **HIGH** |

---

## 12. Exact Commands Used

```bash
# Baseline
git rev-parse HEAD; git branch --show-current; git status --porcelain
git tag --list; git rev-list --count HEAD
git fetch origin main --tags; git merge --ff-only origin/main

# Environment (canonical engine)
curl -sL https://nodejs.org/dist/v22.23.2/node-v22.23.2-linux-x64.tar.xz -o /tmp/n22.tar.xz
tar -xJf /tmp/n22.tar.xz -C /tmp/node22 --strip-components=1
export PATH=/tmp/node22/bin:$PATH   # node v22.23.2

# Clean reproduction
rm -rf node_modules && npm ci --no-audit --no-fund
npm run build && npm run build:check && npm test

# Independent claim reproduction
node tests/r1-eliminate-ram-authorities.test.js
node tests/r2-postgres-authority-fail-closed.js
node tests/schema-migrations-ledger.test.js
node tests/observability-s2-metrics.test.js
node tests/session-revocation.js
node tests/server17.js
node tests/otp-redis.js
REDIS_URL=redis://127.0.0.1:6399 node tests/otp-redis.js
node tests/schema-migrations-live-pg.test.js
node tests/canary-atomic-postgres-live-runtime.js

# CI forensics
curl -H "Authorization: Bearer $T" \
  https://api.github.com/repos/rezaa2544/p2/actions/runs/35547816870
curl -H "Authorization: Bearer $T" \
  https://api.github.com/repos/rezaa2544/p2/actions/runs/35547816870/jobs
curl -H "Authorization: Bearer $T" \
  https://api.github.com/repos/rezaa2544/p2/actions/runs/35547816917/logs -o codacy.zip
curl -H "Authorization: Bearer $T" \
  https://api.github.com/repos/rezaa2544/p2/actions/runs/35548316645/logs -o r1095.zip
curl -H "Authorization: Bearer $T" \
  "https://api.github.com/repos/rezaa2544/p2/actions/workflows/node.js.yml/runs?per_page=20"
curl -H "Authorization: Bearer $T" \
  "https://api.github.com/repos/rezaa2544/p2/actions/runs?head_sha=<SHA>&per_page=20"

# Config truth
grep -A4 rule_files infra/observability/prometheus.yml
readlink monitoring/alert-rules.yml
```

---

## 13. Evidence Index

| Claim | Command / workflow | Output | SHA |
|---|---|---|---|
| Clean install deterministic | `npm ci` | exit 0, 118 packages, 2s | `fe633395` |
| Build reproducible | `npm run build` | exit 0, dist/payesh.html 1636.8 KB | `fe633395` |
| Release gate green | `npm test` (Node 22) | exit 0, 35/35 + 547/547, 51s | `fe633395` |
| Suite refuses wrong runtime | `npm test` (Node 20) | exit 1, "سبزِ کاذب" message | `fe633395` |
| R1 intact | `node tests/r1-...test.js` | 49 PASS, exit 0 | `fe633395` |
| R2 intact | `node tests/r2-...js` | 32 PASS, exit 0 | `fe633395` |
| R21 unit intact | `node tests/schema-migrations-ledger.test.js` | 8 PASS, exit 0 | `fe633395` |
| S2 metrics real | `node tests/observability-s2-metrics.test.js` | 4 PASS / 0 FAIL, exit 0 | `fe633395` |
| Battery B intact | `node tests/server17.js` | 70 green / 0 red, exit 0 | `fe633395` |
| Redis-outage claims unproven | `node tests/session-revocation.js` | 16 PASS, **D-a/D-b SKIPPED** | `fe633395` |
| Live-PG tests fail-closed | `node tests/schema-migrations-live-pg.test.js` | exit 1, explicit refusal | `fe633395` |
| Full CI green, zero skips | Node.js CI #1093 | 23/23 steps success | `fbe178be` |
| Full CI green on later commit | Node.js CI #1098 | 28/28 steps, 0 skipped | `138cd1d9` |
| CI non-deterministic | Node.js CI #1095 vs #1093 | same SHA: failure vs success | `fbe178be` |
| Boot timeout root cause | #1095 raw log, GATE 3 | "boot timeout" → "❌ [G3] بوت نمونه A" | `fbe178be` |
| Pipeline fail-closed | #1095 step list | 9 steps `skipped` after failure | `fbe178be` |
| Codacy = config failure | #254 raw log | "No rules found"; "No ESLint configuration found" | `fbe178be` |
| Fortify always red | workflow runs API | 8/8 last runs failed | multiple |
| Tag unsupported | `runs?head_sha=401d02b2` | no Node.js CI run | `401d02b2` |
| Final report unsupported | `runs?head_sha=b0b55a13` | Node.js CI #1074 = failure | `b0b55a13` |
| Prometheus loads both rule files | `prometheus.yml:20-22` | two `rule_files` entries | `fe633395` |
| monitoring/alert-rules.yml is a symlink | `readlink` | `../infra/observability/alert-rules.yml` | `fe633395` |

---

## 14. Roadmap Changes

**No roadmap status is upgraded by this audit.**

Two changes are *justified by evidence* and are recommended as **downgrades/qualifications**, to be
applied by the roadmap owner (Chat 1) rather than by me:

1. Any roadmap row citing `docs/audit/PHASE_8_2_FINAL_VERIFICATION_REPORT.md` as evidence of
   Phase 8.2 completion must be marked **NOT VERIFIED** until F-QA-02 is remediated.
2. Any row treating `phase8.2-verified` as a gate artifact must be marked **PARTIAL** — the tag has
   no CI evidence (F-QA-01).

Everything else stays as it is. `Phase 8.2 Exit`, `G8.3-IN` and `G8.3-OUT` remain **NOT VERIFIED**.
No Production GO. Phase 8 is not complete.

---

### Audit integrity statement

- Zero code changes, zero implementation, zero restore execution, zero load tests.
- Only corrective action: `git checkout --` on three snapshot artifacts (§5.4), content diff zero.
- Node 22 was installed **outside the repository** (`/tmp/node22`) purely to execute the suite;
  the repository and lockfile were not modified.
- Two of my own prior findings were corrected/withdrawn (§5.3, F-QA-10).

**Auditor:** Chat 4 — Independent QA / Release / CI-CD / Reproducibility
**Date:** 2026-09-21
**Baseline:** `fe633395` (audit traversed `38c63c1e` → `138cd1d9` → `fe633395`)
