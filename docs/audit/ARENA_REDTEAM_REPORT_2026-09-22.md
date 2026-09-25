# ARENA — Independent Red-Team / Deep Verification Report

## 1. Identity

| Item | Value |
|---|---|
| Arena ID | Arena-Deep-Verify 2026-09-22 |
| Task | Full-repo independent audit, adversarial test, failure proof on Current HEAD |
| Date | 2026-09-22 (Asia/Tehran) |
| Repository | `rezaa2544/p2` |
| Branch | `main` (== `origin/main`, ahead/behind 0/0) |
| Current HEAD | `ecc8b40b5d533d77c6ebad63ca0854119873c504` |
| origin/main | `ecc8b40b5d533d77c6ebad63ca0854119873c504` |
| Working Tree | clean |
| Local runtime | Node v22.21.1, PostgreSQL 17.11, Redis 8.0.2 (matches CI services) |
| Evidence tier | **E3** (single-node sandbox). E4 not available → `E4 NOT VERIFIED`. |

---

## 2. Scope

1. Current-HEAD CI truth (GitHub Actions API vs. local reproduction).
2. Canonical `npm test` gate (`tests/run.js` + `tests/smoke.js`).
3. Production gates: truth-gate, production-verifier.sh, R1/R2/R21, server17, batteries A/C/D.
4. RT1-01…RT1-04 current-HEAD reproduction (Chat 1 items).
5. Fake-green / skip / orphan-test hunting (parity contract, self-skip suites, empty-catch scan).
6. Governance items: Git tag integrity (F-QA-01), Codacy threshold (RT2-01), E4 tooling presence, CircleCI drift.

**What was NOT in scope:** db-level security exploit hunting against every route, full mutation-testing of the client app, live E4 hardware drills (no docker/kubectl/aws in this sandbox).

---

## 3. Evidence Matrix (selected — full command log in appendix)

| ID | Check | Command | Expected | Actual | Runs | Evidence | Status |
|---|---|---|---|---|---|---|---|
| M1 | `npm test` (run.js) | `node tests/run.js` | 35/35 exit 0 | **35/35 exit 0** | 2 | local | VERIFIED |
| M2 | `npm test` (smoke.js) | `node --expose-gc --max-old-space-size=2048 tests/smoke.js` | 547/547 exit 0 | **546/547 exit 1 — ENOENT TODO_BEFORE_PRODUCTION.md** | 3 | local + CI | **FAILED** |
| M3 | Current-HEAD CI | GitHub API `actions/runs?branch=main` | Node.js CI green | **Node.js CI = failure (run 35657129976, only failed step: `Run npm test`)** | — | API | **FAILED** |
| M4 | Build | `npm run build` / `build:check` | exit 0 | exit 0, `dist/payesh.html` 1636.8 KB, write-perms match | 1 | local | VERIFIED |
| M5 | Parity contract | `node tests/ci-test-parity-contract.js` | 10/10 | **10/10 exit 0** (485 orphans == budget 485) | 1 | local | VERIFIED (was RED 09-21 20:04→20:38) |
| M6 | Truth gate | `node tools/production-truth-gate.js` (live PG+Redis) | 44/44 | **44/44 VERDICT VERIFIED** (incl. Redis kill→503, PG stop→fail-closed, replay→403) | 1 | local | VERIFIED |
| M7 | Phase 7 verifier | `bash tools/production-verifier.sh` | 37/37 | **37/37 VERDICT VERIFIED** | 1 | local | VERIFIED (was CI-RED 09-21 19:28–21:12, fixed by `2c878746`) |
| M8 | R1 / R2 / R21 / c3 | 4 suites | all pass | 49/49 · 32/32 · 8/8 · 20/20 | 1 each | local | VERIFIED |
| M9 | server17 | `node tests/server17.js` | 70/70 | 70/70 | 1 | local | VERIFIED |
| M10 | Outbox / OCC / RT-01..10 | 3 suites | 10/10 each | 10/10 · 10/10 · 37/37 | 1 each | local | VERIFIED |
| M11 | Ledger live-PG | `node tests/schema-migrations-live-pg.test.js` (clean DB) | 14/14 | 14/14 (first dirty-DB run failed — environment artifact, reproduced clean-pass) | 2 | local | VERIFIED |
| M12 | RT1-01 (audit async IO) | `node tests/session8-audit-async-io.js` | 5/5 | 5/5 | 2 | local | VERIFIED |
| **M13** | **RT1-03 (wave1-reads) w/ live PG** | `DATABASE_URL=… node tests/wave1-reads.js` | 18/18 | **14/18 exit 1** | 2 | local | **FAILED — conflicts with Chat1 "VERIFIED"** |
| **M14** | **RT1-04 (wave23-reports-pg) w/ live PG** | `DATABASE_URL=… node tests/wave23-reports-pg.js` (clean DB) | report pass | **`invalid transaction termination` exit 1** | 2 (clean DB) | local | **FAILED — conflicts with Chat1 "VERIFIED"** |
| M15 | wave10 pg-live | with/without PG binaries in PATH | 19/19 | 19/19 with bins; **0/0 self-skip + exit 0** without | 2 | local | MEASUREMENT GAP (orphan) |
| M16 | Empty-catch scan | grep server/ | 0 silent swallows | **166 catch blocks; several silent** (audit.js/admin.js) | 1 | static | MEASUREMENT GAP |
| M17 | F-QA-01 tag integrity | `git rev-parse phase8.2-verified` + CI query | tag ⇒ SHA with CI evidence | tag ⇒ `401d02b2` (8 behind HEAD), **0 Node-CI runs, 2 red Fortify** | 1 | git + API | **NOT VERIFIED (still OPEN)** |
| M18 | RT2-01 Codacy threshold | grep `.github/workflows/codacy.yml` | sane gate | **`max-allowed-issues: 2147483647`** | 1 | static | **OPEN (security gate vacuous)** |
| M19 | E4 tooling | `which docker kubectl aws` | present | **absent** | 1 | env | EXTERNAL BLOCKER |
| M20 | CircleCI | `.circleci/config.yml` | real pipeline | **"say-hello" stub only** | 1 | static | MEASUREMENT GAP |

Full command log and per-suite transcripts available in the workspace (`/home/user/repo` execution history).

---

## 4. Findings

### DEF-001 — **P0 / BLOCKING** — `npm test` FAILS at Current HEAD (smoke.js ENOENT)

- **Location:** `tests/smoke.js:2862` reads `path.join(__dirname,'..','TODO_BEFORE_PRODUCTION.md')`; file deleted from repo root by commit `2f3b23c3` ("docs: archive and categorize legacy root documentation", 2026-09-21T20:07Z, now under `docs/audit/history/audit/`).
- **Reproduction:** `npm ci && npm test` (Node ≥22) → `❌ یادآور: محصول رمز کاربری ندارد … ENOENT: no such file or directory, open '…/TODO_BEFORE_PRODUCTION.md'` → **546/547, exit 1**. Reproduced 3× locally; identical failure in GitHub Actions run `35657129976` at step "Run npm test".
- **Root cause:** documentation housekeeping moved a file that a mutation-locked smoke test treats as a fixed path. The test's *intent* (guard the conditional bcrypt debt note) is intact, but its *contract* (root-relative path) was silently broken by the doc move. A "doc-lock" test is coupled to an unversioned path.
- **Impact:** The canonical CI gate is permanently red. Every `npm test` in CI exits 1. This blocks any legitimate "green HEAD" claim and any Phase-8.2 exit evidence produced by CI.
- **Evidence tier:** E3 (local + GitHub Actions API).
- **Ownership:** coding team (test path fix or symlink) — NOT a doc-only fix; the lock path must be made robust.

### DEF-002 — **P0 / BLOCKING** — CI has been red on `main` for 20/20 runs since 09:48Z 2026-09-21; four masked root causes; Ground Truth docs do not reflect it

- **Location:** `main` CI. Last green Node.js CI = run `35585331055` (`755715bd`, 2026-09-21T09:48Z). Every subsequent run to `ecc8b40b` (21:25Z) is **failure** (20/20).
- **Masking chain (each failure hid the next):**
  1. `ab2b20c6` (19:28) → Phase 7 production verifier goes RED (fixed 21:14 by `2c878746`).
  2. `5d76e184` (20:04) adds `tests/c3-remediation-regression.test.js` without registering it → **parity contract RED** (fix `82a4cb59` 21:03; that fix run itself hit a one-off "Migration chain" failure).
  3. `2f3b23c3` (20:07) breaks `smoke.js` (DEF-001) — hidden behind #2 until 21:14.
  4. At HEAD `ecc8b40b` only DEF-001 remains → CI still RED.
- **Reproduction:** GitHub API job-step matrix for runs 35645064740…35657129976 (captured; see appendix table).
- **Impact:** Committed "Ground Truth" (`docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md`) still cites "Last verified CI run: Node.js CI #1093 — successful" and "CI روی HEAD فعلی VERIFIED" without stating that current HEAD has **no green CI whatsoever** — a stale-verifier / doc-vs-reality drift that violates `Historical Evidence ≠ Current Evidence`.
- **Ownership:** Tech Lead (roadmap reconciliation) + coding team (fix DEF-001).

### DEF-003 — **P1** — test↔documentation path-lock fragility (enabler of DEF-001)

- **Location:** `tests/smoke.js` "یادآور" test; `.claude/skills/*`, `docs/AI_PROMPT.md` still reference root `TODO_BEFORE_PRODUCTION.md` (moved). At least 15 doc references now point to the old path.
- **Root cause:** two independent sources of truth for one file path; no test asserts *where* the lock file lives, only that the root copy exists.
- **Remediation suggestion (minimal):** make the smoke lock resolve the file via a single constant that the doc-tree move also updates, or restore a small root `TODO_BEFORE_PRODUCTION.md` placeholder pointing to the archived copy, or change the smoke test to `fs.existsSync`-guard with explicit assertion on the canonical path. **Regression requirement:** `npm test` must be 547/547 and CI green on the fix SHA.

### DEF-004 — **P1 / CROSS-AGENT CONFLICT** — `wave1-reads.js` (RT1-03) FAILS with live PostgreSQL

- **Location:** `tests/wave1-reads.js` sections A and D.
- **Reproduction:** `DATABASE_URL="postgres://…" node tests/wave1-reads.js` → **14/18, exit 1** (failures: "init memory driver", "readCollection mirrors store per collection — schools تعداد نابرابر", "readOne mirrors store find-by-id — readOne کاربر ۳۰", "real-PG SELECT verification — users باید از PG برگردد"). Without `DATABASE_URL` → 18/18 (PG branch prints `⏭️ no live PostgreSQL … NOT executed` and still counts as PASS).
- **Root cause:** the suite assumes "memory driver" when it lacks PG, and assumes pre-seeded PG with the exact fixture ids when PG IS present — but it neither seeds PG nor re-seeds the memory store after `db.init(store)` connects to PG. The memory-mode and PG-mode assertions are mutually exclusive in one process. Its PG-branch “pass” is a **soft skip** (logs not-executed, still green).
- **Conflicting claim:** Chat 1 (`docs/audit/CHAT1_…_RECONCILIATION_REPORT.md` §RT1-03) declared `CURRENTLY VERIFIED` with "18/18 passed" — that outcome only holds in the no-PG (skip) environment. With a live dependency the suite is red (14/18).
- **Note:** not wired anywhere (npm test / CI) → red state is invisible to gates. Per the orphan budget it counts as "accepted drift".
- **Ownership:** coding team (make the suite deterministic: seed PG from its own fixture or make PG-branch self-contained); Tech Lead (reconcile Chat 1 verdict).

### DEF-005 — **P1 / CROSS-AGENT CONFLICT** — `wave23-reports-pg.js` (RT1-04) crashes with live PostgreSQL

- **Location:** `tests/wave23-reports-pg.js:77-84` (hand-rolled migration runner) sending `migrations/001_initial.sql` (which contains `BEGIN;`/`COMMIT;`) through a single `client.query()`.
- **Reproduction:** clean `payesh_ci` DB + `DATABASE_URL=… node tests/wave23-reports-pg.js` → **`error: invalid transaction termination` exit 1** at the 001 multi-statement query. Reproduced 2× on clean DB, so it is not dirty-state.
- **Root cause:** the test's own migration runner treats every migration as a single `client.query()`; migrations with explicit transaction control (001, 012, 013, 002/003/…) are psql/ledger-territory (the runner only special-cases `\gset` meta-commands, but not `BEGIN/COMMIT` files). This is exactly the "migration runner old/incompatible" class flagged in RT1-04.
- **Conflicting claim:** Chat 1 §RT1-04 declared `CURRENTLY VERIFIED` citing `WAVE23_REQUIRE_PG=1 → exit 3` (the **fail-closed/no-PG** path) and `schema-migrations-live-pg` — it never ran the **PG-present pass path**, which crashes.
- **Impact:** the Wave-23 report SQL generator cannot produce its E3 evidence on a live PG; its absence is hidden (orphan).
- **Ownership:** coding team (route meta/transaction migrations through psql `-f`, like the canonical ledger does); Tech Lead (reconcile).

### DEF-006 — **P2 / MEASUREMENT GAP** — 485 orphan test files ratcheted, not resolved

- **Location:** `tests/ci-test-parity-contract.js` (`ORPHAN_BUDGET = 485`). At HEAD: 524 top-level test files, 39 executed by npm test + CI, **485 never executed**.
- **Reproduction:** `node tests/ci-test-parity-contract.js` prints `524 فایل تست سطحبالا | 39 اجراشونده | 485 اجرانشده`.
- **Impact:** the two suites that genuinely fail with real dependencies (DEF-004, DEF-005) sit inside this unmonitored set. The parity contract *documents* the gap but the budget is set exactly equal to the current orphan count (a ratchet that only triggers on *new* files, never forces existing red/grey suites to be run). This is a sanctioned blind spot for "current-HEAD verification" claims.
- **Ownership:** Tech Lead — decide a plan (e.g., tag every orphan with a category: run-in-CI / manual-evidence / legacy-archive).

### DEF-007 — **P2** — `wave10-pg-live` self-skips to green when PG server binaries are absent from PATH

- **Location:** `tests/wave10-pg-live.js:83-88` — `if (!BIN || !hasPgModule()) { … process.exit(0); }`.
- **Reproduction:** without `/usr/lib/postgresql/17/bin` on PATH → `wave10-pg-live: 0/0 (skip)؛ سبزِ نهایی: ✅`, exit 0. With binaries → 19/19.
- **Assessment:** this is a *documented* env-gate, not a hidden skip, and it is at least honest. But since the suite is an orphan, its "skip" is indistinguishable from "passed" in any gate. `MEASUREMENT GAP`, not `FAILED`.

### DEF-008 — **P3 / MEASUREMENT GAP** — silent empty catch blocks in server code

- **Location:** `server/abuse-guard.js` (8×), `server/attack-detector.js:52`, `server/audit.js:227/242/277/313/319/355`, `server/admin.js:29/94/100/103/138`. 166 catch-all blocks total in `server/`; a subset swallow failures with no telemetry (audit/abuse/metrics self-calls).
- **Assessment:** observable-side failures (defense-in-depth telemetry) are intentionally best-effort in several spots, but some are on the primary path (audit log init/rotation). No fake green proven for the *gate* path. Logged for triage; not a P0.

### GOV-01 — **P1 / GOVERNANCE** — `phase8.2-verified` tag has no CI evidence on its SHA

- Tag `phase8.2-verified` → `401d02b2ab9a…` (8 commits behind HEAD `ecc8b40b`). GitHub API: 0 Node.js CI runs for that SHA; only 2 runs exist and both are **Fortify failure**. F-QA-01 remains **OPEN** exactly as the consolidated workplan states. Confirmed independently.

### GOV-02 — **P1 / SECURITY** — Codacy scan threshold is vacuous (RT2-01 still OPEN)

- `.github/workflows/codacy.yml:55` → `max-allowed-issues: 2147483647`. On HEAD. Confirmed.

### GOV-03 — **EXTERNAL BLOCKER** — E4 evidence physically unavailable here

- `docker`, `kubectl`, `aws` all absent in this sandbox (consistent with Chat 4's declared blocker). No capacity to execute production-equivalent multi-node DR/HA drills. **E4 NOT VERIFIED / OWNER DECISION REQUIRED** stands.

### GOV-04 — **P3** — CircleCI config is an unused "say-hello" stub

- `.circleci/config.yml` is the template hello-world job; no production parity. A security/CI "second lane" claim would have no backing. Informational.

---

## 5. Five-Pass Verification (Rule 15)

**Task 1 — Current-HEAD CI & canonical gate** → Pass 1 functional (`npm test` local) · Pass 2 GitHub-API run status (35657129976 = failure) · Pass 3 per-step job matrix (26 steps green, step 27 `npm test` red) · Pass 4 minimal repro + file-existence probe · Pass 5 regression-locating (`git log --follow` + `merge-base --is-ancestor`) + 3rd re-run. **Result: FAILED (DEF-001/002), 3× reproduced.**

**Task 2 — Production gates & zero-trust** → Pass 1 functional (truth-gate 44/44, verifier 37/37) · Pass 2 negative/failure injection (Redis SIGKILL → 503 fail-closed; PG stop → 401; replay → 403; kill -9 restart recovery) · Pass 3 boundary (boot-policy suites 14+9+17+10+14+10) · Pass 4 independent re-run (server17 70/70, R1 49, R2 32, R21 8, c3 20) · Pass 5 clean-DB re-run of ledger (14/14 after environment reset). **Result: VERIFIED (E3) — with the caveat that `npm test` still fails.**

**Task 3 — RT1 reproduction** → Pass 1 no-dep run (wave1 18/18 via skip) · Pass 2 live-PG run (14/18 → red) · Pass 3 clean-DB re-run (wave23 crash reproduced 2×) · Pass 4 static root-cause (test runner vs migration BEGIN/COMMIT; harness seed logic) · Pass 5 cross-agent reconciliation (Chat1 verdict vs my evidence → conflict recorded). **Result: FAILED (DEF-004, DEF-005).**

**Task 4 — Fake-green / skip / swallow hunting** → Pass 1 parity contract (485=485 ratchet) · Pass 2 self-skip probe (wave10 0/0 vs 19/19) · Pass 3 soft-skip audit (wave1 "NOT executed" = PASS) · Pass 4 empty-catch grep (166) · Pass 5 orphan-vs-executed inventory (grep across workflows). **Result: MEASUREMENT GAP (DEF-006/007/008).**

**Task 5 — Governance & roadmap** → Pass 1 tag integrity (F-QA-01) · Pass 2 Codacy threshold (RT2-01) · Pass 3 E4 tooling absence · Pass 4 CircleCI stub · Pass 5 ground-truth-vs-CI-reality drift (DEF-002). **Result: NOT VERIFIED for tag integrity; governance items remain OPEN.**

---

## 6. Cross-Agent Conflicts

| Item | Other agent's claim | Arena evidence | Verdict |
|---|---|---|---|
| RT1-03 (wave1-reads) | Chat 1: `CURRENTLY VERIFIED` (18/18) | **14/18 exit 1 with live PG**; 18/18 only in no-PG soft-skip mode | **CONFLICT — Chat 1 not reproducible** |
| RT1-04 (wave23-reports-pg) | Chat 1: `CURRENTLY VERIFIED` (exit-3 fail-closed evidence only) | **`invalid transaction termination` exit 1 with live PG (clean DB, 2×)** | **CONFLICT — Chat 1 not reproducible** |
| "CI روی HEAD فعلی VERIFIED" / "CI #1093 successful" (Ground Truth) | truth doc | HEAD `ecc8b40b` Node.js CI = **failure**; 20/20 red since 09:48Z 2026-09-21 | **CONFLICT — stale verifier** |
| F-QA-01 tag, RT2-01 Codacy, E4 absent | Chat 4/5 documented OPEN | re-confirmed OPEN/absent at HEAD | agree |
| RT1-01 (audit async IO) | Chat 1 VERIFIED | 5/5 exit 0 at HEAD | agree |

No conflict resolution is performed here — both sides' evidence is presented per protocol; Tech Lead decides.

---

## 7. Roadmap Impact

**Roadmap Reconciliation Required.** Current-HEAD facts contradict committed roadmap text:

- "CI روی HEAD فعلی VERIFIED" → must become `NOT VERIFIED` (CI red) until DEF-001 is fixed and a green run exists on the fix SHA.
- RT1-03 / RT1-04 stay `REPRODUCTION REQUIRED → REPRODUCED (red)`; must be re-opened in the workplan (they were closed via CONFLICTED evidence).
- Phase 8.2 Exit = **NOT VERIFIED** (unchanged — and now additionally blocked by a red canonical gate).
- Phase 8.3 = **BLOCKED** (unchanged).
- Production GO = **NOT DECLARED** (unchanged; reinforces no-go).
- F-QA-01, RT2-01, RT2-03/E4 blocker: unchanged (OPEN).

Arena does **not** upgrade or downgrade roadmap statuses directly — this section is a reconciliation request to the Tech Lead only.

---

## 8. Recommended Next Action

**Coding team (in order):**
1. **DEF-001 first (unblocks everything):** repair the `smoke.js` bcrypt-lock to reference the canonical `TODO_BEFORE_PRODUCTION.md` location (constant/symlink/placeholder). Require `npm test` = 547/547 and a **green Node.js CI run on the fix SHA** (F-QA-02/03 discipline).
2. DEF-004: make `wave1-reads.js` deterministic under DATABASE_URL (self-seed PG or isolate memory/PG modes) — and either wire it to CI or formally archive it.
3. DEF-005: fix `wave23-reports-pg.js` migration runner to execute transactional migrations via psql `-f` (parity with canonical ledger), then run it against live PG and capture the E3 numbers.
4. DEF-006/007: triage the 485-orphan set; assign each file a disposition (CI / manual-evidence / archive).
5. GOV-01/GOV-02: re-point or rename `phase8.2-verified`; set a real Codacy threshold.

**Tech Lead:**
6. Rewrite/annotate the Ground Truth "CI" row and the RT1-03/04 rows against this report's evidence; re-verify after push (permanent Chat↔Roadmap reconciliation rule).
7. E4 DR/HA (M1/M2/M3) remains **EXTERNAL BLOCKER**; no status upgrade without production-equivalent infrastructure.

---

## 9. Final Verdict

### `FAILED` — with sub-verdicts:

- Definitely-VERIFIED at HEAD (E3): truth-gate 44/44, production-verifier 37/37, R1/R2/R21, server17 70/70, outbox/OCC/RT-01..10, boot-policy batteries, migration chain/ledger, build + build:check, parity-contract 10/10.
- **FAILED (BLOCKING):** canonical `npm test` is red at Current HEAD (`ecc8b40b`) due to `TODO_BEFORE_PRODUCTION.md` ENOENT; CI has been red for 20/20 runs since 09:48Z 2026-09-21 across four masked root causes; Ground Truth docs do not reflect this.
- **FAILED (cross-agent):** RT1-03 (`wave1-reads` 14/18) and RT1-04 (`wave23-reports-pg` transaction-termination crash) both reproduce as red against live PostgreSQL, contradicting Chat 1's "CURRENTLY VERIFIED".
- **NOT VERIFIED:** `phase8.2-verified` tag (F-QA-01) — tag precedes any CI evidence.
- **MEASUREMENT GAP:** 485 orphan test files (incl. the failing ones) never run by any gate; wave10 self-skip; 166 catch blocks, some silent.
- **EXTERNAL BLOCKER:** E4 production-equivalent evidence (docker/k8s/aws absent here).
- Phase 8.2 Exit: **NOT VERIFIED** · Phase 8.3: **BLOCKED** · Production GO: **NOT DECLARED**.

> **No Fake Green.** The project is *not* healthy at Current HEAD: its own canonical test gate is broken and its CI has not been green for ~12 hours. This must be fixed and re-verified before any VERIFIED status is claimed on this SHA.

---

### Appendix A — CI failure timeline (Node.js CI, branch `main`, GitHub API)

| Time (Z) | SHA | Failed step |
|---|---|---|
| 09:48 | `755715bd` | (last GREEN) |
| 19:28 | `ab2b20c6` | Phase 7 verifier |
| 19:30 | `885f9117` | Phase 7 verifier |
| 19:41 | `be16cbe9` | Phase 7 verifier |
| 20:02 | `bb13c7a4` | Phase 7 verifier |
| 20:04 | `5d76e184` | TEST/CI parity contract (+c3 test) |
| 20:05 | `3634d08a` | parity contract |
| 20:08 | `70fef22e` / `91cb550b` / `3464ab8c` | parity contract |
| 20:16 | `32ed0137` | parity contract |
| 20:26 | `36aea0ff` | parity contract |
| 20:30 | `69682315` | parity contract |
| 20:37 | `2f3b23c3` | parity contract (smoke broken by this commit) |
| 20:38 | `2211ba45` | parity contract |
| 21:03 | `82a4cb59` | Migration chain (fix commit, transient) |
| 21:04–21:12 | `ce722505` / `514ea2e7` / `0b31ec06` | Phase 7 verifier |
| 21:14 | `2c878746` | **`npm test` (smoke ENOENT) — DEF-001 first visible** |
| 21:25 | `ecc8b40b` (HEAD) | **`npm test` (smoke ENOENT)** |

### Appendix B — Environment & commands

```
git clone https://github.com/rezaa2544/p2.git  → HEAD ecc8b40b5d533d77c6ebad63ca0854119873c504
Node v22.21.1 (engines >=22 enforced); npm ci (0 vulnerabilities)
PostgreSQL 17.11 + Redis 8.0.2 installed in sandbox (parity with CI services)
Migration chain: tools/migrate-ledger.js up → 20 migrations, 114 tables; down-all → 0 residue
Key commands: npm run build · npm run build:check · node tests/run.js · node --expose-gc --max-old-space-size=2048 tests/smoke.js
               node tools/production-truth-gate.js · bash tools/production-verifier.sh
               DATABASE_URL=postgres://payesh:payesh@127.0.0.1:5432/payesh_ci node tests/wave1-reads.js
               DATABASE_URL=... node tests/wave23-reports-pg.js
GitHub API: /repos/rezaa2544/p2/actions/runs + /actions/runs/{id}/jobs
```
