# Arena Independent Verification / Red-Team Report — `rezaa2544/p2` @ `main`

## 1. Identity

- **Agent:** Arena (independent verification / red-team agent, Zero-Trust framework)
- **Role constraint honored:** read-only on project code. No project file was modified to "fix" anything; all findings were reproduced/diagnosed/failure-proven, and bug packages are handed to the coding team.
- **Target:** `rezaa2544/p2` branch `main`, **HEAD pinned at `ecc8b40b`** (cloned fresh, working tree clean at start; `origin/main` == local main).
- **Valid history:** Chats 1–4 only (RT1 production truth on 514ea2e; RT2 red-team/hardening; Chat 3 defect remediation; Chat 4 DR/HA/E4). All historical claims re-tested against **current HEAD** — no historical evidence accepted as current evidence.
- **Date:** 2026-09-22 (Asia/Tehran). **Environment (E3, integrated/local):** Node 22.23.1, PostgreSQL 17 (main cluster :5432, dedicated scratch DB `payesh_rt_live` seeded via repo's own `tools/seed-relational-small.js`), Redis 8 local :6379, pgbackrest 2.55.1, GitHub Actions API (public CI status). **E4 NOT VERIFIED** (no physical multi-node/staging access — EXTERNAL BLOCKER, owner decision).

## 2. Scope

- **A. Claim audit:** re-executed every material claim from Chats 1–4 against current HEAD (RT1-01…05, DR-01, F-RT-A-01, F-RT-B-01, F-QA-08, OUTBOX-002, ground-truth doc, ROADMAP).
- **B. Deep code paths:** auth (OTP/JWT/cookies), tenant boundary enforcement, `/api/sync` op pipeline (validation → scope → OCC → commit/undo), outbox workers, rate limiting, metrics gate, migration runner, backup tooling.
- **C. Adversarial:** 36-check battery (A: auth/OTP abuse, B: JWT forgery, C: tenant/role escalation, D: malformed input, E: limits/metrics) + crash/outage chaos.
- **D/E. Reproduction & evidence:** every defect below has a failure proof (exact commands, inputs, expected/actual, exit codes) at §3–§4. Evidence levels: **E2** = code+static, **E3** = integrated local runtime (all runtime claims here are E3; none promoted to E4).
- **Full-repo scan** performed: 945 test files, 119 server files, 782 docs, 24 migrations, 24 CI scripts.

## 3. Evidence Matrix

| # | Claim / check | Source | SHA tested | Method | Result | Evidence | Status |
|---|---|---|---|---|---|---|---|
| 1 | "CI on current HEAD is VERIFIED/green" | ground-truth doc, ROADMAP.md | `ecc8b40b` | GitHub Actions API + local `npm test` | GitHub run 35657129976 **conclusion=failure** at `Run npm test`; local: run.js 35/35, smoke 546/547 (ENOENT `TODO_BEFORE_PRODUCTION.md` at `tests/smoke.js:2862`), exit 1 | E2+E3 | **FAILED / REPRODUCED** |
| 2 | RT1-01 session/OTP semantics | Chat 1 | `ecc8b40b` | re-run `tests/rt1-01-*.js` | 5/5 pass | E3 | VERIFIED |
| 3 | RT1-02 concurrent logins (30) | Chat 1 | `ecc8b40b` | re-run | 30/30 pass | E3 | VERIFIED |
| 4 | RT1-03 refresh/rotation | Chat 1 | `ecc8b40b` | re-run | 18/18 pass | E3 | VERIFIED |
| 5 | RT1-04 migration suite in CI | Chat 1 | `ecc8b40b` | re-run `tests/wave23-reports-pg.js` + CI grep | test **fails** ("invalid transaction termination"); canonical ledger proves invariants (76/76); test **not referenced by any CI script** | E3 | REPRODUCED (stale test + parity gap) |
| 6 | RT1-05 static repo health | Chat 1 | `ecc8b40b` | re-run | 12/12 pass | E3 | VERIFIED |
| 7 | DR-01: pgbackrest `verify` on corrupted backup | Chat 4 | tool 2.55.1 | corrupted 3 pages of full backup; 5× `verify` | **exit 0, silent, 5/5** (Chat 4 saw "INVALID CHECKSUM" text but also exit 0) → verify does not gate; 0 `verify` callers in repo (independent grep); `restore` fail-closed: **exit 95** (Chat 4: exit 29, different corruption mode) | E3 | REPRODUCED (both evidence sets agree: no gate) |
| 8 | F-RT-A-01: grades index missing (P1) | Chat 2/3 | `ecc8b40b` | EXPLAIN at 100k rows | Index Scan present | E3 | REFUTED |
| 9 | F-RT-B-01: redis-backup.sh AOF glob | Chat 4 | `ecc8b40b` | real Redis 8 AOF-on instance, 2000 writes, backup, corrupt AOF, restore | glob `*.aof` misses `*.base.rdb`+`appendonly.aof.manifest` → restored instance **refuses to start**, script **exit 0** (fake green). NEW sub-facet: AOF-off + appendonlydir exists → **exit 1** spurious red after RDB success | E3 | REPRODUCED (expanded) |
| 10 | F-QA-08: backup lock contention | Chat 3 | `ecc8b40b` | 2 concurrent runs, stale-lock removal | contention → **exit 75** (fail-loud); no fake green | E3 | FIXED & VERIFIED |
| 11 | OUTBOX-002: at-least-once risk | Chat 2/3 | `ecc8b40b` | independent proof: 2 workers × 200 events | **exactly-once: 400/400 processed, 0 duplicates, 0 residual** | E3 | FIXED & VERIFIED |
| 12 | Tenant boundary on fresh seed | (new hunt) | `ecc8b40b` | fresh seed (repo seeder) → manager+teacher → all `/api/v1/*` | **403 `TENANT_BOUNDARY_VIOLATION` for ALL non-superadmin on every v1 endpoint** (see §4 F-RT-A-02) | E3 | **REPRODUCED (NEW HIGH)** |
| 13 | JWT forgery surface | adversarial | `ecc8b40b` | forged role/expired/bad-iss/bad-aud/stale-iat/alg-none/tampered/garbage vs real key | all **401**, zero 500s | E3 | VERIFIED (secure) |
| 14 | Tenant/role escalation | adversarial | `ecc8b40b` | cross-tenant read/update/delete, role-escalated sync ops, forged `by` | 403/404 + `out_of_scope`/`forged_by`, **zero PG writes** by attacker | E3 | VERIFIED (secure) |
| 15 | Sync idempotency/OCC | adversarial | `ecc8b40b` | replay same uid; stale `base_version` | `duplicate_ignored` (1 row); `stale_base` conflict surfaced, server state unchanged | E3 | VERIFIED |
| 16 | Malformed JSON handling | adversarial | `ecc8b40b` | non-JSON bodies on send-code/login/sync | **500 `server_error`** (expected 400) | E3 | REPRODUCED (defect, LOW) |
| 17 | Rate limiting | adversarial | `ecc8b40b` | OTP brute-force 12 attempts; sync backpressure | 5-attempt OTP kill (429/locked); sync 429 `sync_backpressure` + Retry-After | E3 | VERIFIED |
| 18 | Redis outage resilience | chaos | `ecc8b40b` | `redis-cli shutdown nosave` under traffic | send-code **503 `redis_required`** (fail-closed); auto-recovery after redis restart, no server restart | E3 | VERIFIED |
| 19 | PostgreSQL outage resilience | chaos | `ecc8b40b` | `sudo service postgresql stop` under traffic | readiness `not_ready`, `db.alive:false`; authenticated calls 401 (no silent data); recovery → 200, no restart | E3 | VERIFIED |
| 20 | Crash recovery (kill -9) | chaos | `ecc8b40b` | live session → kill -9 → restart → same cookie | session survives: `/me` 200, list 200 (PG session + keyfile + PG jti denylist) | E3 | VERIFIED |
| 21 | /metrics gate | adversarial | `ecc8b40b` | non-loopback source IP; loopback + spoofed `X-Forwarded-For` | real remote: **403 forbidden**; XFF ignored (socket `remoteAddress` used, `server/metrics.js:752`) | E3 | VERIFIED (secure; documented LB caveat) |
| 22 | Student data self-projection | adversarial | `ecc8b40b` | student lists `/api/v1/students`; GETs another student's row | only own row (id=6); other → **404** (no info leak) | E3 | VERIFIED |
| 23 | `ci/pending` CodeQL patch | Chat 4 | `ecc8b40b` | inspect `ci/pending/security-sast-sca.patch` | SAST pending workflow-scoped token; SCA already live in security.yml | E2 | GOVERNED LIMITATION |
| 24 | Fake-green static scan | hunt | `ecc8b40b` | grep `.skip/it.skip/test.skip/SKIP=` in tests; empty-catch in server | **no skip constructs**; empty catches only in fire-and-forget telemetry (audit/metrics/webhook) | E2 | VERIFIED (clean) |
| 25 | Observability during attack | chaos | `ecc8b40b` | server health after attack battery | `attack_patterns_blocked:1`, `suspicious_sessions:1` — runtime monitor caught red-team traffic | E3 | VERIFIED (positive) |

## 4. Findings (Bug Packages)

### F-RT-001 — P0 — CI RED at current HEAD — Status: **REPRODUCED**
- **Location:** `tests/smoke.js:2862` reads `TODO_BEFORE_PRODUCTION.md`; file moved to `docs/` by commit `2f3b23c3`; test not updated.
- **Repro:** `npm test` (or GitHub Actions `Node.js CI`) at `ecc8b40b` → `ENOENT … TODO_BEFORE_PRODUCTION.md` → smoke 546/547 → **exit 1**. GitHub run **35657129976 conclusion=failure**, failed step `Run npm test`. Same SHA: Codacy SAST also red (35657130038).
- **Expected:** exit 0. **Actual:** exit 1. Runs: local ≥3, GitHub 1 (public).
- **Root cause:** path drift after file move.
- **Minimal remediation:** point the read at `docs/TODO_BEFORE_PRODUCTION.md` (or restore root copy); add a repo-path test to CI so such moves fail loudly.
- **Regression requirement:** CI green on the fixing commit + `npm test` exit 0 locally.
- **Impact:** every "production-ready / CI green" claim is currently false.

### F-RT-A-02 — HIGH — fresh-seed tenant lockout — Status: **REPRODUCED** (NEW)
- **Location:** `server/index.js:1175-1190` (v1 guard, token derivation line 1182) → `server/infrastructure/phase6-production-hardening.js` `assertTenantBoundary` (:135) → `server/infrastructure/authority/postgres-authority.js` `assertTenantPolicy` (:235, throw :237) / `getTenantPolicy` (:108).
- **Repro (E3):** fresh DB + repo's own `tools/seed-relational-small.js` → `schools.province_id` is **NULL** (seeder output) → login as manager (09121000010) **or** teacher (09121000020) → **every** `/api/v1/*` endpoint → **403 `TENANT_BOUNDARY_VIOLATION`**. Superadmin unaffected.
- **Expected:** 200 for in-scope reads. **Actual:** 403 on all v1 endpoints for all non-superadmin users. Runs: ≥5 (manager ×2, teacher ×2, post-restart controls).
- **Root cause:** guard computes province token `String(sch.province_id).padStart(2,'0')` → literal `'null'` for NULL; `tenant_policy` (migration 019) seeds province rows `'00'`–`'25'` with `school='*'` → **no row matches 'null'** → fail-closed throw. Secondary: `sch.province_code` (line ~1184) reads a **non-existent column** (dead/broken code — falls through silently).
- **Counterfactual proof:** `UPDATE schools SET province_id=1 WHERE id IN (1,2)` + server restart → teacher **200**, manager **200**, manager sees **only school-1 rows** (isolation intact) → confirms the guard logic is otherwise sound; NULL province is the sole trigger.
- **Minimal remediation:** (a) seeder/migration must populate `schools.province_id` (fail seeder if NULL); (b) guard must treat NULL province as explicit fail-closed config error with a distinct code (not the generic boundary violation), and remove the dead `province_code` read.
- **Regression requirement:** fresh-seed integration test: seeder run → manager + teacher login → ≥1 v1 read returns 200, cross-tenant read 403/404.

### F-RT-B-01 — MEDIUM — redis-backup.sh AOF backup fake-green — Status: **REPRODUCED** (Chat-4 claim confirmed + expanded)
- **Location:** `tools/redis-backup.sh` — AOF stage copies `appendonly.aof*`/`*.aof` glob.
- **Repro (E3):** Redis 8 with AOF enabled, 2000 writes → run script → exit 0; corrupt an AOF chunk; point a fresh instance at the backup → **instance refuses to start** (missing `appendonly.aof.manifest` + `*.base.rdb`). Script **exit 0 = fake green**.
- **NEW sub-facet:** AOF **off** while `appendonlydir` exists (Redis 7/8 creates it) → script **exit 1** after successful RDB stage — spurious red that would mask the RDB success in dashboards.
- **Minimal remediation:** copy **all** files in `appendonlydir` (manifest + base + incr), verify by starting a throwaway instance from the backup, and branch correctly on `appendonly` config (no dir → skip AOF stage, don't fail).
- **Regression requirement:** round-trip test (backup → corrupt-detected restore check → exit non-zero on bad backup; exit 0 only on verified-good backup).

### F-RT-B-02 — LOW — malformed JSON → 500 on all POST routes — Status: **REPRODUCED** (NEW)
- **Location:** `server/index.js:633` `readBody` rejects `bad_json`; no per-handler try/catch maps it to 400; global dispatcher catch → 500 `server_error`.
- **Repro (E3):** `curl -X POST -d 'not json' /api/auth/send-code|/api/auth/login|/api/sync` → **500** on all three (expected 400).
- **Impact:** clients cannot distinguish server crash from bad input; 500s pollute error metrics/alerting.
- **Minimal remediation:** in dispatcher, map `bad_json` (and body-size) errors to 400 before the global 500 path.
- **Regression requirement:** contract test: non-JSON/oversized bodies → 400 on every POST route.

### DR-01 — P0 (DR) — pgbackrest verify does not gate on corruption — Status: **REPRODUCED** (independent; both evidence sets presented)
- **Repro (E3, this agent):** pgbackrest 2.55.1, full backup to local repo; corrupted 3 pages in the backup file → `pgbackrest verify` ×5 → **exit 0, no output** (silent). `pgbackrest restore` → **exit 95** (fail-closed). Independent grep: **zero** callers of `verify` in repo/workflows → no existing gate is fooled today.
- **Chat-4 evidence (preserved, not overridden):** verify printed "INVALID CHECKSUM" but also **exit 0**; restore exit 29.
- **Discrepancy statement:** the two environments differ in verify's *output* (silent vs checksum text) but **agree on the security-critical fact: exit 0 on corrupted backup**. Both presented; no winner auto-declared.
- **Minimal remediation (owner decision):** DR job must run `verify` and treat exit≠0 **or** any INVALID/verify warning as failure; consider `--dry-run` restore canary. Until then, DR RPO/RTO claims remain **NOT VERIFIED**.

### RT1-04 — MEDIUM — stale migration test + CI parity gap — Status: **REPRODUCED**
- **Location:** `tests/wave23-reports-pg.js` (hand-rolled migration runner) vs `migrations/012_partition_grades_attendance.sql` (Chat-2 fix removed `\gset`; file contains an internal `COMMIT`).
- **Repro (E3):** test run → **fails** ("invalid transaction termination") on current HEAD. Canonical `tools/migrate-ledger.js` runner applies 012 cleanly and the test's invariants pass **76/76** → the *invariants* are sound; the *test harness* is stale.
- **Parity gap:** no CI script references this test (grep across `.github/workflows` + CI scripts = 0 hits) → it never runs in CI, so it rotted undetected.
- **Minimal remediation:** either delete (covered by canonical ledger path) or port the runner to `tools/migrate-ledger.js`; add the PG suite to CI.
- **Regression requirement:** `npm test` must include the PG suite (or document explicit deprecation commit).

### Minor / observations (no bug package required)
- **M-1 (LOW):** `package-lock.json` committed with `engines.node ">=22"` while `package.json` says `">=22.0.0"`; any `npm install` rewrites the lockfile (observed during setup). Align the two strings.
- **M-2 (LOW):** in-process test harness with `DATABASE_URL` set + empty PG emits an unhandled rejection (`canaryHydrated`) **after** the suite reports green — misleading tail output; boot gate itself fails closed correctly (verified).
- **OBS-1:** `server/revocation.js` fails **OPEN** on Redis errors while `apiLogin` path fails **CLOSED** (503) — asymmetric fail posture, documented in code as deliberate; flag as **GOVERNED LIMITATION** for owner sign-off (a revocation check that can't reach Redis letting a session through is defensible for liveness but should be an explicit ADR).
- **OBS-2 (positive):** runtime monitor recorded red-team activity (`attack_patterns_blocked`, `suspicious_sessions`) — observability is not blind to attacks.
- **OBS-3:** `ci/pending/` holds CodeQL SAST patch awaiting workflow-scoped token — **GOVERNED LIMITATION** (owner decision), consistent with Chat-4.
- **Doc drift (E2, REPRODUCED):** ground-truth doc and ROADMAP.md pin "Current HEAD" to stale SHAs (`fbe178be`/`2211ba45`) and assert "CI on current HEAD | VERIFIED" — false at `ecc8b40b` (see F-RT-001). Docs must be regenerated after the CI fix.

## 5. Five-Pass Verification (Rule 15)

Task: "Adversarial verification of current HEAD `ecc8b40b`" — 5 independent passes:

| Pass | Scope | Evidence | Outcome |
|---|---|---|---|
| **P1 Functional** | Full `npm test` (run.js 35/35), RT1-01/02/03/05 re-runs, live API: send-code→login→me→list→logout for all 4 roles; sync CRUD with PG persistence checks | §3 rows 1–4, 6, 12 (post-fix), 22 | PASS (1 exception: smoke 546/547 = F-RT-001) |
| **P2 Boundary** | `ops > MAX_BATCH` → 413 `batch_too_large`; empty ops → 200; unknown fields/phones → 400; student self-projection (own row only, other row 404); metrics gate at exact batch limits | §3 rows 14, 17, 22 | PASS |
| **P3 Negative/Malformed** | 8 JWT forgery variants vs real key (all 401, no 500); non-JSON bodies → **500 (defect F-RT-B-02)**; malformed sync ops → correct 400/`malformed_op`; forged `by` → 403 `forged_by`; stale OCC → `stale_base` | §3 rows 13, 14, 15, 16 | 1 DEFECT (F-RT-B-02), rest PASS |
| **P4 Concurrency/Chaos/Recovery** | OUTBOX-002 independent 2-worker proof (400 events exactly-once); Redis outage (503 fail-closed + auto-recovery); PG outage (not_ready + 401 + recovery, no restart); kill -9 crash → restart → same session valid | §3 rows 11, 18, 19, 20 | PASS |
| **P5 Independent Regression Re-run** | Re-executed Chat-1/3/4 artifacts on current SHA: RT1 suite, F-QA-08 lock repro, F-RT-B-01 AOF repro, DR-01 verify repro, ground-truth/ROADMAP audit | §3 rows 5, 7, 9, 10 | PASS as re-run; findings as listed |

No pass required a "technically impossible" exemption. E3 ceiling respected: **no E4 claim made.**

## 6. Cross-Agent Conflicts

1. **Ground-truth doc / ROADMAP "CI green on current HEAD = VERIFIED"** vs **GitHub Actions run 35657129976 (failure) + local exit 1** at the same SHA `ecc8b40b`. Both evidence sets presented; the live CI record + 3 local runs are the stronger, more recent evidence → the doc claim is stale (predates `2f3b23c3` file move). Status of the doc claim: **FAILED**.
2. **Chat-4 DR-01** (verify prints INVALID CHECKSUM, exit 0; restore exit 29) vs **this agent** (verify silent exit 0 ×5; restore exit 95). Discrepancy in output details and restore code (different corruption mode/environment); **both agree verify exit 0 → no gate**. No winner auto-declared on the exit-code detail; the security-critical conclusion is concordant.
3. **Chat-1 RT1-04 "migration suite VERIFIED"** (on 514ea2e) vs **current HEAD** where the test file fails and is absent from CI. Not a contradiction in time — the test rotted after Chat 1 — but the claim does **not** hold on current HEAD: **REPRODUCED (stale)** on `ecc8b40b`.
4. **Chat-4 F-RT-B-01** confirmed independently and expanded (new spurious-red sub-facet). No conflict.

## 7. Roadmap Impact (Roadmap Reconciliation Required — Arena does NOT promote status)

- **F-RT-001 (P0, REPRODUCED):** blocks any "ready for production" gate; ROADMAP's CI-green line is false until fixed+green CI on the fixing commit.
- **F-RT-A-02 (HIGH, REPRODUCED, NEW):** fresh-seed deployments lock out all non-superadmin staff — must enter backlog with regression test before any staging/seed-based rollout.
- **DR-01 (P0, REPRODUCED):** DR readiness (RPO/RTO/verify) remains **NOT VERIFIED** pending owner decision on verify gating; DR claims in docs should be downgraded accordingly.
- **RT1-04 (MED, REPRODUCED):** test-rot + CI parity item (CI must run the PG suite).
- **F-RT-B-01 (MED, REPRODUCED):** backup-integrity claim unverified until round-trip verification added.
- **GOVERNED LIMITATIONS (owner decisions):** CodeQL SAST pending token (ci/pending); revocation fail-open ADR sign-off; E4 (staging/multi-node) access for production-equivalent evidence.

## 8. Recommended Next Action (ordered)

1. **Fix F-RT-001 first** (≈5-line path fix in `tests/smoke.js:2862` or restore the file) → commit → CI green on that SHA. Nothing else should be claimed production-adjacent until this is green.
2. **Fix F-RT-A-02:** seeder/migration backfill of `schools.province_id` (seeder fails on NULL) + guard fail-closed-on-NULL with distinct code + remove dead `province_code` read + fresh-seed regression test.
3. **Fix F-RT-B-02** (map `bad_json` → 400 in dispatcher) and **F-RT-B-01** (full `appendonlydir` copy + verify-on-restore + AOF-off branch).
4. **RT1-04:** port or delete the stale test; add PG suite to CI (parity rule: any test in `tests/` must be in a CI script or explicitly marked `NOT-RUN` with reason).
5. **DR-01 owner decision:** gate DR job on `pgbackrest verify` exit code; re-measure and document RPO/RTO with the gate in place.
6. **Docs:** regenerate ground-truth + ROADMAP at the new SHA (they currently pin stale SHAs and a false CI claim).
7. Re-run Arena's 36-check battery + chaos passes on the fixing commit (regression requirement for all packages above).

## 9. Final Verdict

| Item | Verdict |
|---|---|
| Repository CI at `ecc8b40b` | **FAILED** (F-RT-001, REPRODUCED — GitHub + local, 3 runs) |
| Core runtime (auth, tenant isolation, sync OCC/idempotency, outbox exactly-once, rate limiting, metrics gate) | **VERIFIED** (E3) |
| Resilience (Redis down / PG down / kill -9 crash → recovery, session durability) | **VERIFIED** (E3) |
| Tenant boundary on fresh seed | **FAILED** (F-RT-A-02, REPRODUCED — full lockout of non-superadmin staff) |
| Backup tooling integrity (redis-backup.sh AOF) | **FAILED** (F-RT-B-01, REPRODUCED — fake green) |
| DR verification gate | **NOT VERIFIED** (DR-01, REPRODUCED — verify exit 0 on corruption; 0 callers; owner decision required) |
| Migration test parity (RT1-04) | **REPRODUCED** (stale test, not in CI) |
| JWT/authorization/tenant-escalation attack surface | **VERIFIED** (no bypass found; 36/36 adversarial checks correct except the two defects above) |
| **Overall production readiness** | **FAILED — not production-ready at `ecc8b40b`**: CI red, fresh-seed tenant lockout, and ungated DR verification. Core runtime quality is high; the blockers are narrow and fixable. E4 production-equivalent evidence: **NOT VERIFIED** (no staging access — EXTERNAL BLOCKER). |

*End of report — Arena, 2026-09-22. All evidence reproducible from §3/§4 commands on a clean clone of `ecc8b40b`.*
