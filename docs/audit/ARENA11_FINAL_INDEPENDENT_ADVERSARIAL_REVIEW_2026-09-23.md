# ARENA 11 — FINAL INDEPENDENT ADVERSARIAL REVIEW

**Date:** 2026-09-23 (Asia/Tehran)
**Current HEAD (live remote `main`):** `5d4a48f7f3cc0bc8ba144c61fb3996e1b458a7f2`
**Local fix commit (NOT pushed):** `2ecd893` — parent `5d4a48f` — branch `main` (clean working tree)
**Verification environment:** Node.js v22.21.1 (CI parity `22.x`) · PostgreSQL 17.11 (CI `postgres:17`) · Redis 8.0.2 (CI `redis:8`) · Debian 13 x86_64 sandbox · **no Docker** (promtail/Loki runtime step not locally reproducible)

> Method note: every claim below was reproduced against the tree at `5d4a48f` with the fix set from `2ecd893` applied. Results at `5d4a48f` **before** the fixes are stated explicitly where they differ. Historical evidence, old SHAs (`ecc8b40b`, `aace95b7`, `172da62b`) and prior Arena/red-team reports were **not** reused as current-HEAD evidence.

---

## 1. FINAL EVIDENCE MATRIX

| Domain | Claim | Current SHA | Evidence | Environment | Run count | Expected | Actual | Status | Owner | Remaining dependency |
|---|---|---|---|---|---|---|---|---|---|---|
| Git / merge-state | `main` = `5d4a48f`, working tree clean, fix commit `2ecd893` sits on top | `5d4a48f` | `git ls-remote origin main` = `5d4a48f`; `git log --oneline -2` shows `2ecd893 → 5d4a48f`; `git status --short` empty | local repo | 2 | HEAD == live main, clean tree | MATCH | **VERIFIED** | — | — |
| Git / merge-state | Live main was NOT the old baseline | `5d4a48f` | stale clone re-checked: `origin/main` was `ecc8b40b` until explicit `git fetch`; live = `5d4a48f` | local + GitHub API | 2 | live main authoritative | MATCH | **VERIFIED** | — | — |
| CI (Node.js) | Node.js CI green on current main | `5d4a48f` | run `35846202478` conclusion `success`; earlier `172da62b` run `35782045259` was `failure` (step 8 verifier) | GitHub Actions | 2 | success | success | **VERIFIED** | — | — |
| CI (Security Program) | Secret scan job green | `5d4a48f` | run `35846202502` step `Secret scan (repo rules)` `failure`; local `node tests/secret-scan.js` exits 1 (ENOENT on `monitoring/alert-rules.yml`) | GitHub Actions + local Node 22 | 2 (1 CI fail + 1 local fail) | pass | **FAIL** | **REPO-OWNED DEFECT — FIXED LOCAL, UNPUSHED** | Tech Lead | push of `2ecd893` |
| CI (Codacy) | Codacy SARIF upload succeeds | `5d4a48f` | run `35846202773` step `Upload SARIF results file` `failure`; workflow uses `codacy/codacy-analysis-cli-action` + external token on `src/` | GitHub Actions (no token) | 2 | upload | **FAIL** | **EXTERNAL / BLOCKER** | Codacy + repo token owner | `CODACY_PROJECT_TOKEN`; local repro impossible (test-run rejected `directory` in logs at old SHA) |
| CI (observability-regression) | obs workflow green on current main | `5d4a48f` | no run at this SHA (path-gated trigger); prior `aace95b7` run `35781321695` `failure` | GitHub Actions + local | 1 | run+pass | **NOT RUN at SHA** | **NOT VERIFIED (path-gated)** | — | push of `2ecd893` touches `infra/observability/**` → triggers |
| Migration + OCC + Runtime | Clean install 001→latest applies | `5d4a48f` | `node tools/migrate-ledger.js up` → `Applied 21 migration(s)`, 114 public tables, `schema_migrations` count 21 | local PG 17 | 2 | 21 applied, tables>0 | MATCH | **VERIFIED** | — | — |
| Migration + OCC + Runtime | Rollback latest→001 clean | `5d4a48f` | `down-all` → 0 non-ledger tables left; re-apply 21 | local PG 17 | 1 | 0 tables left | MATCH | **VERIFIED** | — | — |
| Migration + OCC + Runtime | Migration-012 crash-window / ledger recovery | `5d4a48f` | `node tests/migration-012-crash-recovery-live.js` → `PASS` | local PG 17 | 1 | pass | MATCH | **VERIFIED** | — | — |
| Migration + OCC + Runtime | Function: bootstrap→PG seed + live-PG suites | `5d4a48f` | `pg-relational-seed` / `wave3-query` / `wave3-query3` / `wave3-parity` all exit 0 | local PG 17 | 1 | pass | MATCH | **VERIFIED** | — | — |
| Migration + OCC + Runtime | Boundary: OCC — exactly 1 of 10 concurrent writers wins | `5d4a48f` | `node tests/phase2-occ-multi.js` → `ok=1`, `conflict=9`, `version=2`, `sync_conflicts rows=9` | local PG 17 (2 real instances) | 1 | 1 winner / 9 conflicts | MATCH | **VERIFIED** | — | — |
| Migration + OCC + Runtime | Negative: Redis outage ⇒ auth fails CLOSED | `5d4a48f` | `node tests/phase2-redis-fail-closed.js` → `6/6`: send-code 200 → Redis kill → 503 `REDIS_UNAVAILABLE` (no fallback:true) → recovery 200 | local Redis 8 (killed) | 1 | 503 fail-closed | MATCH | **VERIFIED** | — | — |
| Migration + OCC + Runtime | PG outage ⇒ write fails closed | `5d4a48f` | `phase65-runtime-truth.js` RT-06: write 201 → PG stopped → 401/503 → PG back → 201 | local PG 17 (stopped) | 1 | fail-closed no 2xx | MATCH | **VERIFIED** | — | — |
| Redis + Outbox + DLQ + recovery | OTP state in Redis (P0-15) multi-instance | `5d4a48f` | `node tests/otp-redis.js` → 16/16 (with `REDIS_URL` set, as CI does) | local Redis 8 | 2 (1 fail w/o REDIS_URL env, 1 pass w/ env) | pass | MATCH (env-parity required) | **VERIFIED** | — | — |
| Redis + Outbox + DLQ + recovery | Outbox crash/restart replay + real DLQ row | `5d4a48f` | `node tests/phase2-outbox-failover.js` → 10/10: pending→crash→restart→processed; poison→`server_outbox_dlq` row | local PG 17 | 1 | replay + DLQ row | MATCH | **VERIFIED** | — | — |
| Redis + Outbox + DLQ + recovery | Outbox/Worker/Redis regression (7 passes + DLQ/Redis regressions) | `5d4a48f` | `node tests/outbox-runtime-reliability.test.js` → PASS (clean env; fails closed when `DATABASE_URL` set + Redis down — correct) | local Node 22 | 2 (1 expected fail-closed, 1 pass) | pass in clean env | MATCH | **VERIFIED** | — | — |
| Redis + Outbox + DLQ + recovery | Five-Task/Five-Pass independent battery | `5d4a48f` | `node tests/runtime-reliability-five-task.test.js` → 25/25 | local | 2 | pass | MATCH | **VERIFIED** | — | — |
| Production gates | Production Truth Gate | `5d4a48f` | `node tools/production-truth-gate.js` → `44/44 … VERDICT: VERIFIED`, HEAD printed `5d4a48f…` | local PG+Redis | 1 | VERIFIED | MATCH | **VERIFIED** | — | — |
| Production gates | Phase 7 production verifier T1–T7 | `5d4a48f` | `bash tools/production-verifier.sh` → `37 pass / 0 fail … VERDICT: VERIFIED` | local PG+Redis | 1 | VERIFIED | MATCH | **VERIFIED** | — | — |
| Production gates | Phase 8.1 batteries A–D + Zero-Trust R1/R2/R21 | `5d4a48f` | unified verifier, canary-atomic (×4), r5 boot-gate, server17 (70/70), migration-constraint (×4), r1/r2/ledger/c3, boot-policy (×6) — all exit 0 | local | 1 | pass | MATCH | **VERIFIED** | — | — |
| Production gates | `npm test` (run.js + smoke 547/547) + jsdom scrollTo 5/5 | `5d4a48f` | `npm test` exit 0, `تست دودی: 547/547`; `smoke-jsdom-runtime.test.js` 5/5 | local Node 22 | 1 | pass | MATCH | **VERIFIED** | — | — |
| Cross-domain (observability) | `monitoring/alert-rules.yml` is usable (not a dead symlink) | `5d4a48f` | **HEAD:** still symlink `120000` whose target = deprecation text (dead link; `secret-scan` crash). **Fix `2ecd893`:** regular file, marker content | local | 2 | readable marker | **DEFECT at HEAD → FIXED** | **VERIFIED (fixed local)** | Tech Lead | push `2ecd893` |
| Cross-domain (observability) | Prometheus `rule_files` contract guard | `5d4a48f` | HEAD regex `…alert-rules\.yml(?:\s*)$` false-red (requires rule_files = final block; `scrape_configs` follows). Fix: strict block-extraction; negative control (two rule_files) correctly rejected | local Node 22 | 3 (1 fail, 1 pass, 1 negative control) | pass | MATCH after fix | **VERIFIED (fixed local)** | Tech Lead | push `2ecd893` |
| Cross-domain (observability) | 8 roadmap signals covered by canonical alerts | `5d4a48f` | HEAD: 5 of 8 signals absent from canonical → wave14 T8e fail (95 suites red). Fix: restore `PayeshDbErrorRate`, `PayeshDbPoolSaturated`, `PayeshCacheHitRateLow`, `PayeshOutboxBacklog`, `PayeshMetricsCardinalityGuardFiring`; count contract 11→16 | local Node 22 | count audit + full run | pass | MATCH after fix | **VERIFIED (fixed local)** | Tech Lead | push `2ecd893` |
| Cross-domain (observability) | wave14 runtime suites green | `5d4a48f` | HEAD: `wave14-observability.js` 94/95 (T8e), mutations 12-mutant fail on T8e. Fix: 95/95 + 12/12 | local Node 22 | 2 (pre/post fix) | pass | MATCH after fix | **VERIFIED** | — | — |
| Cross-domain (observability) | semantic guard + dashboards | `5d4a48f` | `observability-semantic-guard.js` PASS; `observability-dashboards.js` 30/30 (post-fix) | local Node 22 | 1 | pass | MATCH | **VERIFIED** | — | — |
| Cross-domain (observability) | promtail→Loki runtime ingestion (Docker step) | `5d4a48f` | workflow `Verify Loki received both streams` — cannot reproduce without Docker; mismatched audit-label query semantics reviewed; not runnable locally | no Docker | 0 local | pass | **NOT VERIFIED (no Docker in sandbox)** | CI (GitHub-hosted) | Docker env or GitHub-hosted runner |
| Release/version | Release-version contract (tags ↔ package.json) | `5d4a48f` | 8/8 after fetching tag blobs; only owner-decision warnings remain (A0/A1/A2) | local (tag blobs fetched) | 2 (1 partial-clone artifact fail, 1 pass) | pass + warnings | MATCH | **VERIFIED** | — | — |
| Security (SAST/SCA/SBOM/DAST/WAF) | Repo-native security checks green | `5d4a48f` | CI jobs SAST / SCA / SBOM / DAST / WAF all `success`; `run.js` 35/35, `check-authz` 394 actions OK, `node --check` OK | CI + local | 1 | pass | MATCH | **VERIFIED** | — | — |
| DR/HA (E4) | Live DR/HA failover evidence on current HEAD | `5d4a48f` | `docs/audit/DR-01_*` reviews an older SHA; no E4 live infrastructure in sandbox; historical only | n/a | 0 | live E4 | absent | **E4 NOT VERIFIED / EXTERNAL BLOCKER** | Owner/DevOps | live cluster + drill infra |

---

## 2. Current Phase

- **Live code:** `main` = `5d4a48f` — upstream merged PRs #397/#398 (phase7 verifier migration-strip + verifier contract) after the `172da62b` baseline; Node.js CI now **green** at this SHA.
- **This review's local fix set:** `2ecd893` (unpushed) — resolves the remaining 3 repo-owned blockers: broken `monitoring/alert-rules.yml` symlink (breaks Secret scan), false-red `rule_files` guard (breaks obs static job), and the 5 missing roadmap-signal alerts + T8e retarget (breaks obs runtime job).
- **Program status claim in repo docs:** `docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md` is **stale** — it reconciles against `fcf6d6d`, not `5d4a48f`. Do not treat its "PARTIAL" CI line as current-HEAD evidence.

## 3. Completed Gates (reproduced at `5d4a48f` on the fixed tree)

- Node.js CI full cascade: migration chain (up 21 / down-all / re-up 21), migration-012 crash recovery, E3 ledger (14/14), live-PG suites, otp-redis (16/16), Redis fail-closed (6/6), OCC concurrency (10/10), outbox/DLQ recovery (10/10), Phase 6.5 Runtime Truth (37/37), Production Truth Gate (44/44 **VERIFIED**), Phase 7 verifier (37/37 **VERIFIED**), batteries A–D, Zero-Trust R1/R2/R21, `npm test` (smoke 547/547), jsdom scrollTo 5/5.
- Security Program jobs: SAST, SCA, SBOM, DAST, WAF — success (CI).
- Fortify AST Scan — success (CI). Push on main — success (CI).
- Post-fix local: secret-scan 13/13, observability-config 21/21, semantic-guard PASS, dashboards 30/30, wave14 95/95 + mutations 12/12, contract 8/8, `bash -n` OK.

## 4. Unverified Gates

- **Promtail→Loki runtime ingestion** (obs workflow `promtail-runtime` `Verify Loki received both streams`): needs Docker; **NOT VERIFIED locally**; the last CI run of the workflow (old SHA `aace95b7`) failed but that run predates the current HEAD.
- **Codacy SARIF upload**: cannot pass without the external `CODACY_PROJECT_TOKEN`; not reproducible locally.
- **E4 DR/HA live failover**: no live infra in this environment; repo E4 evidence is historical-SHA only.

## 5. Repo-owned Defects

| # | Defect | Introduced by | Status at HEAD `5d4a48f` | Fix |
|---|---|---|---|---|
| 1 | `tools/production-verifier.sh` line 325: `PORTC=3513` glued into `grep` pattern (dangling quote → `bash -n` fail) + dead duplicated T5/T6/T7/verdict tail | `b4a9a9a` | **FIXED upstream** (PR #397/#398); contract 8/8, verifier 37/37 VERIFIED | upstream |
| 2 | `boot_one()` comment inside `\`-continuation silently drops `PAYESH_STORE/KEY/DEMO_CODE/NODE_ENV` | `d5f0e97` | **FIXED upstream** (`env -u NODE_ENV -u PAYESH_ENV …` prefix) | upstream |
| 3 | `monitoring/alert-rules.yml` is a dead symlink (target = deprecation text) → `secret-scan` ENOENT, Security Program secret job red | `4ba299c` | **STILL PRESENT** | **fixed in `2ecd893`** (regular marker file) — UNPUSHED |
| 4 | `tests/observability-config.js` `rule_files` regex false-red (requires final block; `scrape_configs` follows) | `9d1d245` (+PR #352 no-op) | **STILL PRESENT** | **fixed in `2ecd893`** (strict block-extraction) — UNPUSHED |
| 5 | 5 roadmap-signal alerts retired without re-homing → wave14 T8e red (obs runtime job) | `9d1d245` | **STILL PRESENT** | **fixed in `2ecd893`** (restore 5 rules, canonical count 11→16, T8e retarget) — UNPUSHED |

## 6. External Blockers

| Blocker | Owner | Dependency | Required evidence | Exact blocker |
|---|---|---|---|---|
| Push of `2ecd893` | repo owner (rezaa2544) | write credential | merge/push of the fix branch | `git push` → `fatal: could not read Username for 'https://github.com'` (no token/netrc/credential helper in sandbox) |
| Codacy SARIF upload | Codacy + token owner | `CODACY_PROJECT_TOKEN` secret | a green `codacy-security-scan` run | upload step fails without valid project token |
| E4 DR/HA live verification | DevOps/SRE | live cluster + drill infra | live failover/recovery run at current SHA | no E4 infrastructure; repo E4 docs are historical-SHA |
| Docker-based promtail/Loki step | CI (GitHub-hosted) | Docker runtime | a green `promtail-runtime` run at `5d4a48f` | flag-template rollback; can't merge new CI job until HEAD verified green; here no Docker to run it |

## 7. Next Exact Action

1. **Push `2ecd893`** (branch `main`): `git push origin main` on `rezaa2544/p2` from a credential-bearing environment, or fast-forward via PR `fix/current-main-observability-secret-scan`.
2. On push, **verify three things turn green at the NEW SHA**: Security Program secret job, Codacy (only with valid token), and observability-regression (triggered by `infra/observability/**` path change) — including the Docker `promtail-runtime` step on a GitHub-hosted runner.
3. Re-run the obs runtime job's `wave14-observability.js` in CI to confirm T8e green with the restored canonical alarms.
4. When all referred-from-this-SHA workflows are green, re-reconcile the roadmap ground truth (currently stale at `fcf6d6d`) to the new SHA before any Production attestation.

---

**Bottom line:** No `VERIFIED` claim in this report is historical-only; every pass above was executed at `5d4a48f` (with the `2ecd893` fix set for the observability/secret-scan domains). Node.js CI, Runtime Reliability, Fortify, Push are green on live `main`. The remaining red on live `main` (Security Program secret job; Codacy) is explained by a repo-owned dead-symlink defect (fixed locally, awaiting push + credential) and an external token dependency, respectively. Production attestation remains contingent on pushing `2ecd893` and re-confirming the three workflows at the resulting SHA.
