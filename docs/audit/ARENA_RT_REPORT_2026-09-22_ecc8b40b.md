# ARENA — Deep Independent Verification / Red-Team Report

---

## 1. Identity

| Field | Value |
|---|---|
| Arena ID | Arena Red-Team Agent (independent audit session, 2026-09-22) |
| Task | Full-repository independent audit: Audit / Deep Test / Adversarial / Failure Proof / Evidence / Report (Rule 15: 5 Tasks × 5 Passes) |
| Date | 2026-09-22 (Asia/Tehran) |
| Repository | `rezaa2544/p2` |
| Branch | `main` |
| Current HEAD | `ecc8b40b5d533d77c6ebad63ca0854119873c504` |
| origin/main | `ecc8b40b5d533d77c6ebad63ca0854119873c504` (verified via `git ls-remote`, clone, and a re-`fetch` mid-mission; identical) |
| Working Tree | Clean at mission start; clean at mission end (test side-effects on `docs/DOCS_HEALTH_REPORT.md` / `docs/DOCS_CONSISTENCY_REPORT.md` detected and reverted with `git checkout --`; no project code changed by this agent) |
| Environment | Linux sandbox, Node v20.20.2 (system) + Node v22.14.0 (installed to `/tmp` to satisfy `engines >=22`), npm 10.9.2. **No PostgreSQL, no Redis, no Docker available locally.** Network egress available (GitHub API used for Actions evidence). |
| Independent replica | Fresh clone #2 at `/home/user/fresh-p2`, same SHA, own `npm ci` |

---

## 2. Scope

Exactly what was examined on Current HEAD (`ecc8b40b`):

1. **Test suite execution & CI/local parity** — canonical `npm test`, `tests/run.js`, `tests/smoke.js`, `tests/ci-test-parity-contract.js`, `scripts/run-all-tests.sh`, GitHub Actions history on `main`.
2. **Server boot / health / failure paths** — live boots of `server/index.js` (JSON-store mode), `/api/health|readiness|liveness`, `/metrics`, CI Battery D + `r5` + `server17`, crash/restart/drain/dup-port.
3. **Auth / AuthZ / security boundaries** — real OTP login flow, JWT forgery battery, OTP tombstone boundary, single-use OTP race, CSRF origin gate, authz model suites, security suite battery.
4. **Migrations & data integrity** — static migration gates, up/down pair symmetry, `tools/migrate-ledger.js` fail-loud behavior, checksum & internal-transaction handling, `delta-schema-gaps`, CI live-PG step evidence.
5. **Documentation / Ground Truth / claim drift** — docs-governance suite battery (8 suites), freeze manifest, doc-refs baseline, openapi drift, config audit, Ground Truth & Chat-report SHA reconciliation vs HEAD, E4 gate claims.

**Out of scope / not available locally:** any live-PG, live-Redis, multi-node, or physical E4 execution (see Evidence Level column; GitHub Actions E3 used where applicable).

---

## 3. Evidence Matrix

| ID | Check | Command | Expected | Actual | Runs | Evidence | Status |
|---|---|---|---|---|---|---|---|
| E-01 | Canonical `npm test` on clean HEAD | `npm test` (Node 22.14.0) | exit 0 | **exit 1**; run.js 35/35; smoke **546/547** (1 fail) | 3 (workspace ×2, fresh clone ×1) | E3 local | **FAILED** |
| E-02 | CI on Current HEAD | GitHub Actions run **#1205** (`ecc8b40b`) | success | **failure**, step 27 `Run npm test` | 1 (API) | E3 CI | **FAILED** |
| E-03 | CI streak on main | Actions workflow runs | — | Last green = **run 1159** (`755715bd`, 09-21 09:48Z); **46 of 47 subsequent runs failed** (1160–1206) | 1 (API, 100-run page) | E3 CI | **VERIFIED (red streak)** |
| E-04 | Node<22 must fail loud | `node tests/run.js` on Node 20.20.2 | exit 1, explicit message | exit 1 + «عمداً قرمز می‌شویم» | 2 | E3 local | **VERIFIED (guard real)** |
| E-05 | Parity contract on HEAD | `node tests/ci-test-parity-contract.js` | 10/10 | 10/10, exit 0; 524 tests / 39 executed / **485 orphan** | 2 | E3 local | **VERIFIED** |
| E-06 | Parity catches orphan-test injection | isolated copy + `tests/zz-orphan-inject-…js` | red | exit 1 (486>485) | 1 | E3 local (isolated) | **VERIFIED (guard real)** |
| E-07 | Parity catches dead workflow ref | isolated copy, workflow → ghost test | red | exit 1 (`ارجاع مرده`) | 1 | E3 local (isolated) | **VERIFIED (guard real)** |
| E-08 | Build parity catches src drift | mutate registered module in isolated copy → `node build.js --check` + `tests/run.js` | red | both exit 1, first-diff located | 1 | E3 local (isolated) | **VERIFIED (guard real)** |
| E-09 | Smoke assertion not vacuous | A: HEAD ⇒ red; B: restore archived TODO at root ⇒ **547/547 exit 0**; C: bcrypt redacted ⇒ red | as stated | A=1, **B=0 (547/547)**, C=1 | 3 | E3 local (isolated) | **VERIFIED (assertion real; root cause = path)** |
| E-10 | Determinism under concurrency | 2× parallel smoke in isolated copies | identical verdicts | both 546/547, same assertion | 2 | E3 local | **VERIFIED** |
| E-11 | `run-all-tests.sh` default env (no `DATABASE_URL`) | `env -u DATABASE_URL bash scripts/run-all-tests.sh` | run tests (or documented guard) | **exit 1, line 79 `DATABASE_URL: unbound variable`** (set -u) — before dirty-tree guard | 3 | E3 local | **REPRODUCED** |
| E-12 | `run-all-tests.sh` pristine tree with `DATABASE_URL` set | `DATABASE_URL=… bash scripts/run-all-tests.sh` | run tests | **exit 5** (docs-stats stale) — preflight blocks runner on pristine HEAD | 1 (+1 dirty variant) | E3 local | **REPRODUCED** |
| E-13 | Docs-stats freeze check on pristine HEAD | `node tools/docs-stats-sync.js --freeze --check` | exit 0 | **exit 1**: map 439→466, sub 40→61, active 412→460, sum 479→527; freeze manifest 465 stale | 2 (workspace + fresh) | E3 local | **REPRODUCED** |
| E-14 | Doc-refs on pristine HEAD | `node tools/docs-refs-check.js --check` | 0 fresh stale | **exit 1: 166 fresh stale refs** (238 total, 75 grandfathered) | 2 | E3 local | **REPRODUCED** |
| E-15 | Docs-governance suite battery | 8 × `node tests/docs-*.js / openapi-drift / config-audit` | 8/8 green | **only `docs-health` green (0)**; refs/consistency/freeze/index/metadata/openapi/config = exit 1 | 2 (fresh-clone subset confirms) | E3 local | **FAILED (7/8)** |
| E-16 | Test side-effects on tracked files | run docs suites → `git status` | clean | `docs/DOCS_HEALTH_REPORT.md` + `docs/DOCS_CONSISTENCY_REPORT.md` modified (writers: docs-health/consistency/freeze/index suites); reverted by agent | 1 | E3 local | **VERIFIED (defect: non-idempotent suites poison dirty-guard)** |
| E-17 | Server boot (JSON mode) + health honesty | boot + GET health/readiness/liveness | honest drivers | 200s; `db.driver=memory`, `cache=memory-dev`, `redis.live=false,required=false` disclosed | 4 boots | E3 local | **VERIFIED** |
| E-18 | `/metrics` loopback-only | GET /metrics via non-loopback IP | deny | **403 forbidden** (loopback 200) | 1 | E3 local | **VERIFIED** |
| E-19 | CANARY boot log truthfulness | boot without DATABASE_URL | log must match reality | **logs «hydrated from PostgreSQL (…7 clusters)» with no PG**; clusters = `DEFAULT_CLUSTERS` | 2 (workspace + fresh) | E3 local | **REPRODUCED (misleading log)** |
| E-20 | Malformed JSON → status class | POST `/api/auth/send-code|login`, `/api/sync` with broken JSON | 400 bad_json | **500 server_error** + `audit('error')` + metrics `code="500"` (contrast: `too_large`→413 via same catch) | 2 envs × 3 endpoints | E3 local | **REPRODUCED** |
| E-21 | Battery D (boot-policy suites) | 6 suites, no PG/Redis | green | all exit 0 (14/14, 10/10, 10/10 …) | 2 (fresh clone) | E3 local | **VERIFIED** |
| E-22 | `r5-prod-redis-boot-gate` w/o PG | `node tests/r5-…` | NOT-RUN (not pass) | **exit 2** explicit «NOT-RUN … missing dependency is a FAIL, never a fake green» | 2 | E3 local | **MEASUREMENT GAP (honest)** |
| E-23 | CI live steps on Current HEAD | Actions #1205 steps 1–26 | — | **all passed**: migration up/down/re-apply, ledger, live-PG suites, otp-redis, redis fail-closed, OCC 2-instance, outbox failover, RT-01..10, truth gate, phase7 verifier, batteries A–D, build | 1 (API) | E3 CI | **VERIFIED (E3)** |
| E-24 | Dup-port boot | second instance same PORT | fail loud | exit 1 (EADDRINUSE) | 1 | E3 local | **VERIFIED** |
| E-25 | SIGKILL → restart recovery | kill -9, restart, probe | health 200, store intact | 200; users 1040, schools 6 | 1 | E3 local | **VERIFIED** |
| E-26 | SIGTERM drain under traffic | 200 reqs + SIGTERM | clean drain, exit 0 | «draining … clean … exit 0» (51ms); post-exit probes refused | 1 | E3 local | **VERIFIED** |
| E-27 | JWT forgery battery | tampered payload / `alg=none` / garbage / wrong-key | 401 | all **401 no_session** | 1×4 | E3 local | **VERIFIED** |
| E-28 | CSRF origin gate | evil `Origin` on login & send-code | deny | **403 csrf_origin_mismatch**; same-origin 200 | 1×3 | E3 local | **VERIFIED** |
| E-29 | OTP cooldown & enumeration shape | re-send <60s; unknown phone | 429; equal-shape | 429; unknown phone 200 `sent` (equal shape) | 1×2 | E3 local | **VERIFIED** |
| E-30 | OTP tries boundary (tombstone) | 4 wrong + real ⇒ survive; 5 wrong ⇒ dead | 200 vs code gone | **200 after 4 wrong**; after 5 wrong `otp.json` shows code in `tomb`, absent from `codes` | 1×2 | E3 local + state proof | **VERIFIED** |
| E-31 | Single-use OTP race | 6 parallel logins, one real code | exactly 1 success | **1×200, 5×401** | 1 | E3 local | **VERIFIED** |
| E-32 | Authz model parity & suites | check-authz, authz-model, public-security, session-revocation, otp-ratelimit | green | exit 0; 394 actions parity OK; 255/255; 10/10; 16/16; 49/0 | 1 | E3 local | **VERIFIED** |
| E-33 | Security battery | secret-scan, security, security2, red-team, waf-mutations, xss-guard, rate-limit-mutations, session-revocation-mutations | green | all exit 0 | 1 | E3 local | **VERIFIED** |
| E-34 | `wave5-authz` on HEAD (memory mode) | `node tests/wave5-authz.js` | docs claim 37/37 | **29/37 exit 1**; `/api/v1/*` → **503 AUTHORITY_UNAVAILABLE** (tenant_policy needs PG authority) | 2 (fresh clone same) | E3 local | **REPRODUCED (env-dependent; with-PG = UNVERIFIED)** |
| E-35 | OTP mutation kit on HEAD | `node tests/otp-ratelimit-mutations.js` | all mutations killed | **7/11 killed, exit 1**: M3–M6 `const rX=await…` patterns «الگو پیدا نشد» (auth.js now `let rX;`+try/catch); guard-line duplicates kill correctly; baseline green | 1 (312 s, adequate timeout) | E3 local | **REPRODUCED (stale patterns ⇒ structurally never-green)** |
| E-36 | Migration static gates | migration-sequence, migrate-pg-constraints, schema-migrations-ledger, migration-009-negative | green | all exit 0 (14/14 etc.) | 2 (fresh clone) | E3 local | **VERIFIED** |
| E-37 | Migration pair symmetry / gaps | filesystem analysis | 20↔20, no gaps | 20 up / 20 down, versions 1–20 complete, no orphan/missing | 1 | E3 local | **VERIFIED** |
| E-38 | migrate-ledger fail-loud w/o DB | `node tools/migrate-ledger.js up` (no DATABASE_URL) | fail loud | **exit 1** «FATAL: DATABASE_URL or PGURL … required» | 1 | E3 local | **VERIFIED** |
| E-39 | Internal-transaction fix on HEAD | grep `hasInternalTx` in tools/migrate-ledger.js (fix `514ea2e7`) | present up+down | present at lines 146–147 & 212–213 | 1 | E3 local (static) | **VERIFIED (static; live proof = CI step 9–11 pass E-23)** |
| E-40 | `delta-schema-gaps` on HEAD | `node tests/delta-schema-gaps.js` | 12/12 | **11/12 exit 1**: SG11 `res.setHeader is not a function` (conflicts.js:21-23 added by `6807cd60`; test mock res stale) | 2 (fresh clone same) | E3 local | **REPRODUCED** |
| E-41 | Live-PG/Redis/OCC/outbox/E4 locally | — | — | **not executable** (no PG/Redis/Docker in sandbox) | 0 | — | **MEASUREMENT GAP / EXTERNAL BLOCKER (E4)** |
| E-42 | E4 DR/HA claim | Chat 4 gate doc on HEAD-lineage | — | Gate doc itself: **«E4 NOT VERIFIED — 0/6»**, honest E3-only classification | 1 (doc read) | Historical clue | **VERIFIED (as NOT VERIFIED)** |
| E-43 | Ground Truth doc vs HEAD | read `docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md` | matches Current HEAD | claims **`fbe178be…`** + «CI #1093 VERIFIED»; actual HEAD `ecc8b40b`, CI red since ~run 1160 | 1 | E3 local + Actions | **FAILED (documented drift)** |
| E-44 | Chat reports vs HEAD | SHA headers of Chat1/3/4 reports | reconciled to HEAD | SHAs `514ea2e` / `be16cbe9` / `2211ba45` — all ancestors, **none states `ecc8b40b`**; no report claims VERIFIED for current HEAD | 1 | E3 local | **VERIFIED (historical; not current)** |

---

## 4. Findings

### F-01 — `npm test` is RED on clean Current HEAD (release gate broken)
- **Bug ID:** ARENA-T1-F01
- **Severity:** **CRITICAL**
- **Location:** `tests/smoke.js:2862` (reads `TODO_BEFORE_PRODUCTION.md` at repo root); file moved by commit `2f3b23c3` → `docs/audit/history/audit/TODO_BEFORE_PRODUCTION.md`
- **Reproduction:** fresh clone @ `ecc8b40b` → `npm ci && npm test` ⇒ exit 1; smoke **546/547**, failing assertion «یادآور: محصول رمز کاربری ندارد …» with `ENOENT … TODO_BEFORE_PRODUCTION.md`
- **Expected:** exit 0 / 547-547 (or an updated test pointed at the archived path)
- **Actual:** exit 1; independently confirmed by GitHub Actions **run #1205 step 27** and by 3 local runs across 2 clones
- **Root cause:** root-doc archival commit moved the file without updating the smoke guard path (`2f3b23c3` did not touch `tests/smoke.js`)
- **Impact:** canonical test command and main CI red; every subsequent claim of “CI green on current HEAD” is false; merge gate effectively failed for 46+ runs
- **Minimal remediation:** point `tests/smoke.js:2862` at `docs/audit/history/audit/TODO_BEFORE_PRODUCTION.md` (file still contains `bcrypt` ×4 — assertion semantics preserved), or restore the root file if it is still canon; then confirm 547/547 + CI run
- **Regression requirement:** add a test asserting every path read by smoke exists (or a startup path-inventory guard); require CI green on the fix commit
- **Evidence Level:** E3 (local ×3 + GitHub Actions E3)
- **Ownership:** implementation team (test fix) / Tech Lead (merge)

### F-02 — Master regression runner `scripts/run-all-tests.sh` unusable on HEAD (3 stacked blockers)
- **Bug ID:** ARENA-T1-F02
- **Severity:** **HIGH**
- **Location:** `scripts/run-all-tests.sh` line 79 (`$DATABASE_URL` under `set -u`); docs-stats preflight (exit 5); docs-refs preflight (exit 6)
- **Reproduction:** (a) `env -u DATABASE_URL bash scripts/run-all-tests.sh` ⇒ **exit 1 «unbound variable»** ×3; (b) with `DATABASE_URL` set on pristine tree ⇒ **exit 5 «DOCS STATS STALE»**; (c) would next hit exit 6 (166 fresh stale refs)
- **Expected:** suite executes (dirty-tree guard exit 3 only when tree dirty)
- **Actual:** runner dies before a single test runs, in default environments and even on a pristine tree
- **Root cause:** unguarded variable after Phase-2 probe insertion + docs freeze/map/refs drifted (see F-03/F-04) without the runner preflights being exercised by CI
- **Impact:** the only full-repository regression entry point is dead ⇒ “run-all-tests green” cannot be produced on HEAD; orphan-suite mass (485) stays unexercised
- **Minimal remediation:** `${DATABASE_URL:-}` at line 79; `node tools/docs-stats-sync.js --freeze` + regenerate baseline for the 166 refs (with reasons) or fix refs; add both preflights to CI so they cannot rot
- **Regression requirement:** a CI smoke that executes `run-all-tests.sh` preflight section headlessly
- **Evidence Level:** E3
- **Ownership:** implementation team

### F-03 — Docs freeze/manifest drift on pristine HEAD
- **Bug ID:** ARENA-T1-F03
- **Severity:** **MEDIUM**
- **Location:** `docs/DOCUMENTATION_MAP.md`, `docs/DOCS_FREEZE_v1.0.0-rc44.md`; tools `docs-stats-sync.js`, `docs-freeze-marker` (11/14)
- **Reproduction:** `node tools/docs-stats-sync.js --freeze --check` ⇒ exit 1 (439→466, 40→61, 412→460, 479→527; manifest “465 docs” stale); freeze rows 361 vs 465
- **Evidence:** E3 ×2 envs; root cause: doc commits 09-21/22 (incl. `2f3b23c3` archiving 117 files) without stats/freeze sync (last map sync 09-18, freeze 09-17)
- **Impact:** blocks F-02 runner; “frozen” manifest no longer describes the library
- **Status:** **REPRODUCED** — Ownership: docs governance / implementation team

### F-04 — 166 fresh stale documentation references (incl. audit reports citing nonexistent tests)
- **Bug ID:** ARENA-T1-F04
- **Severity:** **MEDIUM–HIGH** (evidence integrity)
- **Location:** 118 docs; examples: `docs/audit/CHAT3_*` → `tests/cold-cache-revocation.test.js`, `tests/outbox-concurrency-live-pg.test.js`, `tests/redis-down-alerting.test.js`, `tests/runtime-multiworker-crash-proof.test.js`, `tests/worker-health-observability.test.js` — **none exist at HEAD**; `docs/audit/CHAT5_*` → `tests/prom/redis_down_test.yml`, `tests/sentinel-revocation.js` (absent)
- **Reproduction:** `node tools/docs-refs-check.js --check` ⇒ exit 1, «تازه: 166»
- **Root cause:** baseline (75) predates bulk archival/moves; audit reports cite tests that are **NOT IN CURRENT REPOSITORY**
- **Impact:** readers following Chat3/Chat5 evidence hit dead paths — direct «Historical Evidence ≠ Current Evidence» violation materialized in links; docs-refs gate (runner exit 6) blocked
- **Status:** **REPRODUCED** — remediation: fix refs or regenerate `tools/docs-refs-baseline.json` with per-item justification; **do not** reconstruct missing tests from reports (Rule 2)
- **Evidence Level:** E3

### F-05 — Misleading CANARY boot log (claims PostgreSQL hydration without PG)
- **Bug ID:** ARENA-T2-F01
- **Severity:** **LOW–MEDIUM** (observability truthfulness)
- **Location:** `server/index.js:734` — unconditional success log after `globalCanaryEngine.initDb(db)`; in memory mode `refreshCacheFromPg` falls through silently; cluster set = constructor `DEFAULT_CLUSTERS` (`server/infrastructure/phase6-canary-engine.js:143-156`)
- **Reproduction:** boot with no `DATABASE_URL` ⇒ log `"[CANARY] weights hydrated from PostgreSQL (cluster_weights SSoT, 7 clusters)"` — ×2 environments
- **Expected:** log must state source actually used («defaults / memory cache»), or hydration claim only when `db.isPostgres()`
- **Impact:** operator/audit could cite a canned line as SSoT proof; contradicts the file’s own comment “observable proof the SSoT load ran”
- **Status:** **REPRODUCED** — E3 — Ownership: implementation team

### F-06 — Client malformed JSON classified as HTTP 500 (SLO/alert pollution)
- **Bug ID:** ARENA-T2-F02
- **Severity:** **MEDIUM**
- **Location:** `server/index.js:646` rejects `bad_json` → generic handler `:1629` sends **500 server_error** + `audit('error')`; `too_large` correctly mapped to 413 at `:1622` (R96 P0-5 fix applied to one branch only)
- **Reproduction:** `POST /api/auth/send-code|login`, `/api/sync` with broken JSON ⇒ 500 (workspace + fresh clone); metrics record `code="500"`
- **Expected:** **400 `{code:"bad_json"}`**, audit class client-error
- **Impact:** attacker/client garbage inflates 5xx rate ⇒ `docs/SLO.md` §1 alert (5xx > 0.1% over 5m ⇒ NOC on-call) can be triggered by trivial traffic; real server errors drowned in noise; no test covers server-side bad_json (only client-side helper tests exist)
- **Status:** **REPRODUCED** — E3 — regression req: negative tests for bad_json → 400 on all JSON POST routes
- **Ownership:** implementation team

### F-07 — P0 tenant-isolation suite orphaned + stale vs current architecture + doc claims unqualified
- **Bug ID:** ARENA-T3-F01
- **Severity:** **HIGH**
- **Location:** `tests/wave5-authz.js` (37 tests: tenant isolation, BOLA, IDOR); `.github/workflows/*` (not referenced); `docs/NATIONAL_ROADMAP_PROGRESS.md:24`, `docs/audit/history/operations/HANDOFF.md`, `docs/daily-reports/*` claiming **37/37**
- **Reproduction:** `node tests/wave5-authz.js` @ HEAD, default JSON-store mode ⇒ **29/37 exit 1** (×2 clones). Direct probe: all `/api/v1/{users,students,classes,grades,attendance}` ⇒ **503 `AUTHORITY_UNAVAILABLE: tenant_policy cannot be evaluated without attached PostgreSQL authority`** while suite expects 403/404/201 memory-mode answers (T16–T22, T24)
- **Root cause:** R2/R3 zero-trust made tenant authority PG-only; suite expectations & docs not updated; suite inherits ambient `DATABASE_URL` (green-with-PG / red-without-PG — contract not self-pinned); **CI never runs it**
- **Evidence conflict:** 37/37 (docs, historical) vs 34/37 (`POST_MERGE_AUDIT_2026-09-10`) vs **29/37 (Current HEAD, this agent)**; with-live-PG on HEAD = **NOT VERIFIED** here
- **Impact:** the flagship IDOR/BOLA/tenant gate is outside the merge gate; roadmap row «Authorization ✅ 37/37» unsupported on HEAD
- **Status:** **REPRODUCED (memory mode) / NEEDS RECHECK (live PG)** — Roadmap Reconciliation Required
- **Ownership:** implementation team + Tech Lead (CI registration)

### F-08 — OTP mutation suite structurally never-green (stale grep patterns)
- **Bug ID:** ARENA-T3-F02
- **Severity:** **MEDIUM**
- **Location:** `tests/otp-ratelimit-mutations.js` entries M3–M6 (`const rDaily|rPh|rIp|rLi = await …`) vs `server/auth.js:253-257,311-312` (`let rDaily, rIp, rPh;` + assignment inside B5 try/catch)
- **Reproduction:** `node tests/otp-ratelimit-mutations.js` ⇒ **7/11 killed, exit 1**: four entries «الگو پیدا نشد», guard-line duplicates kill correctly, baseline green (run time ~312 s)
- **Impact:** `pass = killed===MUTS.length` can never be true ⇒ permanent red = alarm fatigue (invites someone to delete entries ⇒ coverage loss); distributed rate-limit mutations only covered by duplicate guard-line entries; not in CI
- **Status:** **REPRODUCED** — E3 — fix patterns to match current source (or de-duplicate entries); require exit 0
- **Ownership:** implementation team

### F-09 — `delta-schema-gaps` SG11 red: stale mock vs security-fix interface
- **Bug ID:** ARENA-T4-F01
- **Severity:** **MEDIUM**
- **Location:** `tests/delta-schema-gaps.js` SG11 mock `res` vs `server/conflicts.js:21-23` (`res.setHeader` added by `6807cd60` «resolve all 10 security and database contract gaps»)
- **Reproduction:** `node tests/delta-schema-gaps.js` ⇒ **11/12 exit 1**, `res.setHeader is not a function` (×2 clones)
- **Expected:** 12/12 — resolve-path stamps `updated_at` (the actual invariant)
- **Impact:** conflict-resolution stamping invariant untested at HEAD; suite not in CI
- **Status:** **REPRODUCED** — E3 — fix mock (`setHeader: () => {}` or real Response stub)
- **Ownership:** implementation team

### F-10 — Documentation governance battery 7/8 red & entirely outside CI
- **Bug ID:** ARENA-T5-F01
- **Severity:** **MEDIUM–HIGH**
- **Location:** `docs-refs-check` (26/29), `docs-consistency` (machine block stale, migration index vs disk), `docs-freeze-marker` (11/14), `docs-index-coverage` (74/75, HANDOFF missing at root), `docs-metadata` (16/17 orphans), **`openapi-drift` (8/9 — «شمار عملیات کد = ۳۱» spec/code operation count mismatch)**, `config-audit` (13/15 undocumented env vars); only `docs-health` green (0)
- **CI membership:** **none of these suites referenced by any workflow**
- **Reproduction:** ×2 envs (fresh-clone subset confirms refs/freeze/openapi/config/health)
- **Impact:** API contract drift + undocumented config vars escape the merge gate; pairs with F-02 to form a fully dormant governance layer
- **Status:** **REPRODUCED** — E3 — register in CI (static, seconds-long, no services needed)
- **Ownership:** implementation team + Tech Lead

### F-11 — Ground Truth document stale relative to Current HEAD & CI reality
- **Bug ID:** ARENA-T5-F02
- **Severity:** **MEDIUM**
- **Location:** `docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md` (README-linked as «حقیقت جاری»)
- **Conflict:** claims **Current HEAD `fbe178be…`** and **«Node.js CI #1093 — successful / CI VERIFIED»**; actual HEAD **`ecc8b40b`** (27 commits later), and main CI has failed in **46/47 runs since #1159**
- **Impact:** the canonical “current truth” layer is itself out of date ⇒ new agents bootstrapping from README inherit a false green CI belief
- **Status:** **FAILED (as “current”)** — remediation: re-baseline the Ground Truth to `ecc8b40b` + actual Actions status (red, cause F-01) in the same cycle (docs already mandate chat-to-roadmap reconciliation)
- **Evidence Level:** E3 (local file + GitHub API)

### F-12 — Test suites write tracked files (dirty-tree self-poisoning)
- **Bug ID:** ARENA-T1-F05
- **Severity:** **LOW–MEDIUM**
- **Location:** writers in `tests/docs-health.js`, `tests/docs-consistency.js`, `tests/docs-freeze-marker.js`, `tests/docs-index-coverage.js` → `docs/DOCS_HEALTH_REPORT.md`, `docs/DOCS_CONSISTENCY_REPORT.md`
- **Reproduction:** run docs suites ⇒ `git status` shows 2 modified tracked files (reverted by agent); next `run-all-tests.sh` would abort **exit 3 DIRTY TREE**
- **Status:** **REPRODUCED** — E3 — make suites write-only-on-`--write` or output to untracked path
- **Ownership:** implementation team

### Explicit non-findings (verified healthy — evidence, not sentiment)
- Node≥22 gate, parity contract (orphan/dead-ref/budget), build:check drift detection, smoke assertion substance (A/B/C probe) — all **guard-real**, E-04..E-09.
- Health/readiness honesty (memory drivers disclosed), metrics loopback 403, static traversal 404, 413 body cap, dup-port fail-loud, SIGKILL/SIGTERM recovery, store integrity — E-17..E-26.
- JWT forgery battery, CSRF 403, OTP cooldown/enumeration/tombstone/race — E-27..E-31.
- Authz + security suite battery green (check-authz, authz-model 255/255, public-security, session-revocation, otp-ratelimit 49/0, secret-scan, red-team, waf/xss/rate-limit mutations) — E-32..E-33.
- Migration static gates, 20↔20 pair symmetry, fail-loud no-DB, checksum + internal-tx handling on HEAD — E-36..E-39.
- CI steps 1–26 green on `ecc8b40b` (live-PG/Redis/OCC/outbox/RT/gates/batteries) — E-23, **E3 CI** (not E4).
- E4 gate honesty (0/6, E4 NOT VERIFIED) — E-42.

---

## 5. Five-Pass Verification (Rule 15)

### Task 1 — Test Suite Execution & CI/Local Parity
| Pass | Dimension | Result |
|---|---|---|
| P1 | Functional | `npm test` @ HEAD ⇒ **exit 1** (546/547) — E-01; CI #1205 confirms — E-02 |
| P2 | Boundary | Node 20 ⇒ loud exit 1 (E-04); parity 10/10 on HEAD w/ orphan budget exactly at 485 (E-05) |
| P3 | Negative / Failure-injection | Orphan-test inject ⇒ parity red (E-06); dead workflow ref ⇒ parity red (E-07); src drift ⇒ build:check + run.js red (E-08); smoke A/B/C triple-probe (E-09) |
| P4 | Concurrency / Chaos / Recovery | Dual parallel smoke identical verdicts (E-10); run-all-tests guards probed: dirty variant + **unbound-var crash ×3** + docs-stats exit 5 (E-11, E-12); test side-effect dirties tree (E-16) |
| P5 | Independent regression / re-run | Fresh clone: npm ci 0, **npm test 1 (same assertion)**, build:check 0, run.js 35/35, parity 10/10; third workspace run identical (E-01) |

### Task 2 — Server Boot, Health & Failure Paths
| Pass | Dimension | Result |
|---|---|---|
| P1 | Functional | 4 boots; health/readiness/liveness honest; static 200 (E-17); metrics loopback-only (E-18) |
| P2 | Boundary | 100 parallel health ⇒ 100×200; 5 MB body ⇒ 413 in 4 ms; 404 shapes correct; **CANARY log false claim** (E-19) |
| P3 | Negative / Failure | Malformed JSON ⇒ **500** (E-20); evil-path traversal 404; auth endpoints 400/401 shapes; Battery D green; r5 honest NOT-RUN exit 2 (E-21, E-22) |
| P4 | Concurrency / Crash / Recovery | Dup-port exit 1; SIGKILL→restart healthy+store intact; SIGTERM drain clean exit 0 (E-24..E-26) |
| P5 | Independent regression | Battery D + server17 (70/70) re-run on fresh clone; **T2-F1/F2 reproduced on fresh clone** (E-19, E-20) |

### Task 3 — Auth / AuthZ / Security Boundaries
| Pass | Dimension | Result |
|---|---|---|
| P1 | Functional | send-code (dev echo) → login (NID mismatch rejected without consuming code) → /me; HttpOnly cookie, 8 h JWT |
| P2 | Boundary | Cooldown 429; unknown-phone equal-shape 200; **OTP tombstone: alive after 4 wrong (200), dead at 5 wrong (state proof)** (E-29, E-30) |
| P3 | Negative | Tampered/none/garbage/wrong-key JWT ⇒ 401; CSRF evil origin ⇒ 403; 8× wrong codes 401 then IP window 429 (layered) (E-27..E-29) |
| P4 | Concurrency | **6 parallel logins, one OTP ⇒ 1×200 / 5×401** (E-31) |
| P5 | Independent regression | check-authz + authz-model 255 + public-security + session-revocation + otp-ratelimit + 8-suite security battery green (E-32, E-33); **wave5-authz 29/37 red ×2** (E-34); **otp-ratelimit-mutations 7/11 structurally red** (E-35) |

### Task 4 — Migrations & Data Integrity
| Pass | Dimension | Result |
|---|---|---|
| P1 | Functional | 4 static migration gates green ×2 envs (E-36) |
| P2 | Boundary | 20↔20 pairs, versions 1–20 gapless; ledger FATAL exit 1 without DB (E-37, E-38) |
| P3 | Negative | migration-009-negative green; checksum-mismatch detector present; `hasInternalTx` fix on HEAD; **delta-schema-gaps SG11 red ×2** (E-39, E-40) |
| P4 | Concurrency / live | **No local PG** ⇒ OCC multi-instance & live chain NOT runnable here (E-41) → covered only by CI steps 9–11 pass on HEAD (E-23, E3, not E4) |
| P5 | Independent regression | All 4 green gates reproduced on fresh clone; delta 11/12 reproduced on fresh clone (E-36, E-40) |

### Task 5 — Documentation / Ground Truth / Claim Drift
| Pass | Dimension | Result |
|---|---|---|
| P1 | Functional | Docs battery: **1/8 green** (docs-health only) (E-15) |
| P2 | Boundary | Freeze rows 361 vs 465; map 439→466; openapi op count 31 mismatch (E-13, E-15) |
| P3 | Negative | 166 fresh stale refs incl. audit reports → nonexistent tests (E-14); config-audit undocumented vars |
| P4 | Cross-claim / “concurrency” of evidence | Ground Truth SHA/CI-VERIFIED vs reality (E-43); Chat1/3/4 report SHAs all ≠ HEAD; no report claims VERIFIED at `ecc8b40b` (E-44); E4 gate honest 0/6 (E-42) |
| P5 | Independent regression | Fresh-clone re-run: refs/freeze/openapi/config red, health green — identical (E-15) |

---

## 6. Cross-Agent Conflicts

| # | Claim (source) | Evidence on Current HEAD | Resolution |
|---|---|---|---|
| C-1 | «CI روی HEAD فعلی: VERIFIED — Node.js CI #1093 موفق» (`ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md`) | Actions: last green **#1159**; **#1205 on `ecc8b40b` = failure (step 27 npm test)**; 46/47 red since | **Ground Truth loses to runtime evidence** (its own §1 rule). Doc must be re-baselined. |
| C-2 | «Current HEAD = `fbe178be…`» (same doc) | HEAD = `ecc8b40b` (27 commits later) | Drift — F-11 |
| C-3 | «wave5-authz 37/37» (NATIONAL_ROADMAP_PROGRESS, HANDOFF, daily reports) | **29/37 exit 1** at HEAD w/o PG; with-PG **NOT VERIFIED** here | Claim is historical & env-unqualified; roadmap row needs downgrade/qualification — F-07 |
| C-4 | POST_MERGE_AUDIT 09-10: 34/37 «pre-existing T18/T20/T21» | Now **8 failures** (T16-T22,T24) — failure set grew after R2/R3 tenant-authority change | Both true at their SHAs; current = 29/37 — F-07 |
| C-5 | Chat1 RT1 report @ `514ea2e`; Chat4 DR @ `2211ba45`; E4 gate @ `be16cbe9` | All ancestors of HEAD; **none reconciled to `ecc8b40b`**; E4 gate honestly «NOT VERIFIED 0/6» | Historical clues only; E4 stance confirmed unchanged |
| C-6 | `PHASE_8_2_FINAL_VERIFICATION_REPORT`: header `Status: VERIFIED` vs body «Phase 8.2 Exit = NOT VERIFIED» | Internal tension preserved; matches Ground Truth PARTIAL stance | Keep **PARTIAL / exit NOT VERIFIED**; header remains confusing — recommend Tech Lead clarification |
| C-7 | CI failure chain reconstructed (this agent) | #1195-1199 step 6 parity (c3 unregistered → fixed `82a4cb59`); #1200-1201 step 9 migration (fixed `514ea2e7`); #1202-1203 step 20 phase7 verifier (fixed `2c878746`); **#1204+ step 27 npm test (UNFIXED — F-01)** | Each historical red was patched in sequence; current residual cause = F-01 |

No conflict was auto-declared “winner” other than via Current HEAD + runtime/Actions evidence per policy §1 of the Ground Truth itself.

---

## 7. Roadmap Impact

**Roadmap Reconciliation Required — YES.**

- **New blocker class on Current HEAD:** canonical test command red (F-01) + full-regression runner broken (F-02) + docs governance 7/8 red & CI-dormant (F-10) + P0 tenant suite orphaned/stale (F-07). Any roadmap line implying “CI green on current HEAD” or “full regression runnable” must be downgraded to **FAILED / NOT VERIFIED** until F-01..F-04 are fixed and a green run exists.
- **Phase 8.2:** remains **PARTIAL / exit NOT VERIFIED** — this audit neither upgrades nor contradicts it (no new E4 evidence; local PG/Redis = **MEASUREMENT GAP**; EXTERNAL BLOCKER unchanged for physical E4).
- **Phase 8.3:** stays **BLOCKED** (8.2 gate open items unchanged; additionally CI must return to green first).
- **E4:** **E4 NOT VERIFIED — EXTERNAL BLOCKER / OWNER DECISION REQUIRED** (no multi-node/staging infra in this environment; Chat4’s 0/6 stance not contradicted).
- Arena does **not** promote any roadmap status.

---

## 8. Recommended Next Action (ordered)

1. **P0 — Tech Lead:** fix F-01 (`tests/smoke.js` path → `docs/audit/history/audit/TODO_BEFORE_PRODUCTION.md`), land with CI green proof on the merge commit (run id + SHA). This single fix unblocks the entire CI chain (all earlier steps already pass on `ecc8b40b`).
2. **P0 — Implementation:** fix F-02 (`${DATABASE_URL:-}`), then F-03 (`docs-stats-sync --freeze`) and F-04 (fix or re-baseline 166 refs — itemized, no silent bulk-baseline) so `run-all-tests.sh` can execute end-to-end; archive one full-suite log as evidence.
3. **P1 — Implementation:** F-06 (`bad_json` → 400 + negative tests), F-05 (CANARY log honesty), F-09 (SG11 mock), F-08 (mutation patterns), F-12 (docs suites idempotent writes).
4. **P1 — Tech Lead:** register in CI (all static, seconds, no services): `wave5-authz` (with **self-pinned env contract**: explicit live-PG required ⇒ exit 2 when absent), docs battery (F-10), `delta-schema-gaps`, `otp-ratelimit-mutations`; audit the 485-orphan set for other P0 suites and prioritize registration.
5. **P1 — Docs governance:** re-baseline Ground Truth to `ecc8b40b` + true CI status; re-qualify 37/37 wave5 claims; reconcile Chat reports’ SHAs to the fix commit (Rule: chat-to-roadmap reconciliation in same cycle).
6. **P2 — Owner decision:** schedule E4 infrastructure window (external dependency) — until then all E4 lines stay NOT VERIFIED.

---

## 9. Final Verdict

# `FAILED`

**Basis (Evidence, not sentiment):**
- Canonical `npm test` exits 1 on clean Current HEAD `ecc8b40b` — reproduced 3× across 2 independent clones and independently confirmed by GitHub Actions run #1205 (step 27). Main CI: last green #1159, 46/47 subsequent runs failed.
- The full-repository regression entry point (`scripts/run-all-tests.sh`) cannot start on HEAD (unbound-var exit 1 ×3; pristine-tree exit 5 at docs-stats).
- The P0 tenant-isolation suite is outside CI and red (29/37) in the default documented dev mode; two more verification assets (otp-ratelimit-mutations, delta-schema-gaps) are structurally/stale red; docs governance battery 7/8 red and CI-dormant; Ground Truth document’s own HEAD/CI claims are stale.

**Sub-verdicts:** E3 (local+CI) as stated per matrix row · **E4: `E4 NOT VERIFIED` — `EXTERNAL BLOCKER / OWNER DECISION REQUIRED`** · Live-PG/Redis behavior beyond CI steps: `MEASUREMENT GAP` locally (CI E3 accepted where steps passed on `ecc8b40b`).

**Counter-evidence recorded (project is not “broken everywhere”):** security/auth batteries green, boot/recovery semantics sound, migration static layer sound, anti-fake-green guards (Node gate, parity contract, build check, smoke substance, r5 NOT-RUN) proven real under injection. The failure is concentrated in the **verification surface itself** — exactly the class this red-team exists to catch before Production.

---
*End of report — Arena Red-Team, 2026-09-22, SHA `ecc8b40b5d533d77c6ebad63ca0854119873c504`, working tree clean.*
