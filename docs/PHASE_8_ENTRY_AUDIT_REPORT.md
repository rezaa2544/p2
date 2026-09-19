# PHASE 8 ENTRY AUDIT REPORT
## Independent Principal Architect + Red Team Security Auditor — Zero-Trust Readiness Assessment

**Auditor Role:** Independent Principal Architect + Red Team Security Auditor (Phase 8 initiation)
**Repository:** `https://github.com/rezaa2544/p2` (branch `main`)
**Audited HEAD:** `4530d753a46b402712acea9087877ffa3cd11a33`
**Audit Environment:** Debian 13 (trixie), Node v20.20.2 (server suites) + Node v22.14.0 (smoke/jsdom-30), PostgreSQL 17.11 (Debian), Redis 8.0.2 — matches the Phase 7.6 audit environment specification
**Audit Date:** 2026-09-20 (۲۹ شهریور ۱۴۰۵)
**Method:** Zero-trust — every claim re-derived from source code and re-executed at runtime on live PostgreSQL + Redis. No claim from prior phases was accepted on documentation alone.

---

## خلاصه اجرایی (Persian Executive Summary)

این ممیزی ورودی فاز ۸ با رویکرد زیروتراست انجام شد: تمام گیت‌های فاز ۷.۶ به‌طور مستقل روی PostgreSQL 17.11 و Redis 8.0.2 واقعی بازاجرا و بازتولید شدند. **تمام گارانتی‌های اصلی فاز ۷.۶ (SSoT پستگرس، اتمیسیتی قناری، ایزولاسیون تننت، fail-closed ردیس و پستگرس) در سطح شواهد E3/E4 تأیید شدند** — از جمله گیت حقیقت تولید (۴۴/۴۴ VERIFIED) که مستقیماً روی HEAD فعلی بازتولید گردید. با این حال، ممیزی ۲۵ یافته باقی‌مانده (R1–R25) را شناسایی کرد که هیچ‌کدام مسدودکنندهٔ معماری نیستند، اما دقیقاً دامنهٔ کار فاز ۸ را تعریف می‌کنند: پنج ماژول کنترل‌پلن هنوز RAM-authoritative هستند، گیت‌های بوت دو متغیر محیطی ناهمگون دارند، حالت پیش‌فرض WAF فقط-گزارش است، و سوئیت رگرسیون ۱۲۷تایی هنوز در CI خودکار نشده است. حکم نهایی: **PHASE 8: READY** با شرایط ورودِ الزامی برای هر زیرگیت.

---

## 1. Current Verified Baseline

### 1.1 Commit-State Verification (Zero-Trust Check #0)

| Item | Claimed in Initiation Prompt | Actually Verified in Repo | Verdict |
|---|---|---|---|
| CODE_COMMIT | `766be4b8...` | `766be4b8` exists ("fix(phase7.6-r.7.2): remediate canary atomic evidence and server17 regressions") — `server/` + `tests/` only | ✅ MATCH |
| DOC_COMMIT | `d32915f3...` | `d32915f3` exists but is the **R.7.2** handoff commit ("docs(handoff): record phase 7.6-r.7.2 blocker remediation") | ⚠️ PARTIAL |
| HEAD | `d32915f3` | **Actual HEAD is `4530d753`** ("feat(skills): unify all 22 engineering and AI agent skills") — one commit ahead of the claimed HEAD; working tree clean; local == origin/main | ⚠️ DRIFT |
| "PHASE 7.6-R.7.3 officially closed" | Claimed | **No R.7.3 report exists anywhere in the repository**; last documented closure in `HANDOFF.md` is R.7.2 | ⚠️ NO ARTIFACT |

**[E2/Evidence-Type-B]** — `git show --stat` for both SHAs; `grep -rn "R.7.3" --include="*.md"` → zero hits.
**Impact:** Bookkeeping drift only. The skills commit `4530d753` touches `.claude/skills/` and `skills/` documentation only (54 files, no `server/`, no `tests/`, no `migrations/`), so the verified code baseline `766be4b8` remains the effective production code state at HEAD. **No production code changed after the audited CODE_COMMIT.** This must be recorded (R25) but does not invalidate the baseline.

### 1.2 Independently Reproduced Evidence (all re-executed 2026-09-20)

| # | Gate / Suite | Claimed | Reproduced | Evidence Level | Notes |
|---|---|---|---|---|---|
| V1 | `migrations/001→020` applied to empty PostgreSQL 17.11 via `psql -v ON_ERROR_STOP=1` | clean chain | **20/20 clean, exit 0** | [E3] | 113 tables created |
| V2 | `tools/production-truth-gate.js` (5 gates: Git / Schema 3-cycle UP-DOWN-UP / Runtime+Chaos / PG-outage fail-closed / Honesty) | VERIFIED | **44/44 — VERDICT: VERIFIED at HEAD `4530d753`** | [E4] | Including live `pg_ctlcluster` stop → writes fail-closed 401; honesty gate documents 5 remaining RAM-authority maps |
| V3 | `tests/canary-atomic-postgres-live-runtime.js` (trigger-injected audit-INSERT failure on real PG) | 10 PASS | **10/10 PASS** | [E3/E4] | `Before: weight=10, audit=0` → failure → `After: weight=10, audit=0` (atomic ROLLBACK) → happy path commits `weight=25, audit=1` |
| V4 | `tests/server17.js` | 70 PASS | **70/70 PASS** | [E2/E3] | Full live-server behavioral battery (O8 OTP guard, field-level authz, sessions) |
| V5 | `tests/migration-sequence.js` | 19 PASS | **19/19 PASS** | [E2] | Static DDL/sequence contract guard |
| V6 | `tests/migrate-pg-constraints.js` | 14 PASS | **14/14 PASS** | [E2] | DDL invariant + data checks |
| V7 | `tests/unified-production-verifier.js` | 14 PASS | **14/14 PASS — but only with `DATABASE_URL` un-exported; 13/14 FAIL with `DATABASE_URL` exported** | [E2] | Deterministic env-conditional result — see R17 |
| V8 | `tests/canary-atomic-mock-harness.js` | 4 PASS | **4/4 PASS** (labeled `[MOCK]`/E2) | [E2] | Mock separation respected |
| V9 | `tests/canary-atomic-runtime.js` | — | **6/6 PASS** | [E2] | |
| V10 | `tests/run.js` | — | **35/35 PASS** | [E2] | Structure/guard tests |
| V11 | `tests/smoke.js` | 547 PASS | **547/547 PASS** (Node v22.14.0; on Node 20 it fails loudly: jsdom-30 requires ≥22) | [E2] | Loud-fail design confirmed — no fake-green |
| V12 | Claimed aggregate "127/127" | 127 | **14+70+19+14+10 = 127 — reproduced** (with V7 caveat) | [E3] | |

### 1.3 Live Production-Mode Drills (executed by this auditor against a running `PAYESH_ENV=production` server with real PG + Redis)

| # | Drill | Expected | Observed | Level |
|---|---|---|---|---|
| D1 | Production boot gates: no `DATABASE_URL` → exit(1); PG not ready → refuse `listen()`; authority not attached → refuse `listen()`; no TLS and no proxy declaration → exit(1); self-signed cert → exit(1) | fail-fast | All gates present in `server/index.js:1626–1797` and consistent with observed boot log | [E3] (code-verified + boot-observed) |
| D2 | Cross-tenant request (manager of school 1 → `?school_id=3`) | 403 | `403 PHASE6_TENANT_ISOLATION_BREACH` | [E3] |
| D3 | Cross-province request (`x-province-code: 04`) | 403 | `403 PHASE6_TENANT_ISOLATION_BREACH` | [E3] |
| D4 | Own-school request | 200 | `200` | [E3] |
| D5 | IDOR probe: manager reads out-of-scope student `/api/students/244` | 404 (no existence leak) | `404` | [E3] |
| D6 | Redis killed (`service redis-server stop`) → `/api/auth/send-code`, `/api/auth/login` | 503 fail-closed | `503 REDIS_UNAVAILABLE / redis_required` — no silent RAM pass | [E3] |
| D7 | Redis killed → `/api/readiness` | 503 not_ready | `503` with `redis.live=false, required=true` | [E3] |
| D8 | PostgreSQL stopped → session/protected paths | fail-closed | `401` on session paths (PG is authoritative for identity), readiness `503`, log: `[FATAL] PostgreSQL is not active in production — JSON/in-memory persistence stays DISABLED`. **No RAM/JSON fallback.** | [E3] |
| D9 | PostgreSQL stopped → sync write | fail-closed | `401 no_session` | [E3] |
| D10 | `/metrics` in production without `PAYESH_METRICS_TOKEN` | disabled | `404 not_found` | [E3] |
| D11 | `demo_code` echo in production | never | Code-verified: `if(!isProd && DEMO_CODE_ECHO)` (`server/auth.js:285`) | [E2] |
| D12 | PG restart recovery | resume | Pool reconnects, requests return to 200 | [E3] |

### 1.4 Architecture Boundary — Verified Current State

**PostgreSQL-authoritative (verified at E3/E4):** canary weights + audit (`phase6_canary_configs`, `phase6_audit_events` — single transaction `UPDATE + INSERT`), replay ledger (`phase6_replay_ledger` — `ON CONFLICT DO NOTHING` nonce consumption), tenant policy (`tenant_policy`), authority state (`authority_state`), user identity/status on session path (PG `readOne`), domain data (80 collections), migrations 001–020, ops-kv traffic fabric.

**RAM as cache-only with PG refresh per decision (verified):** `phase6-canary-engine.js` `routeRequestSoT` refreshes from PostgreSQL before every HTTP routing decision; writes fail closed when authority is detached (`AUTHORITY_UNAVAILABLE`, 503). The old 50 ms split-brain cache window (Phase 7.6 RED finding) is eliminated.

**RAM-authoritative remnants (documented in the truth gate's honesty section, 5 maps):** see R1.

**Secret hygiene:** `.gitignore` covers `.env*`, `server/data/` (store, JWT key, audit log); `tests/secret-scan.js` (11 checks) in regression; no credentials found in tracked runtime paths during this audit.

---

## 2. Remaining Risks (Zero-Trust Findings)

Severity: 🔴 High (must fix before production certification) · 🟠 Medium (fix inside Phase 8) · 🟡 Low (track/accept explicitly).

### Architecture Boundary & Hidden Trust Assumptions

- **R1 🟠 — Five control-plane modules remain RAM-authoritative at runtime:** `provincial-pilot-scaling._provincialStateStore`, `change-management.changeRegistry`, `national-capacity-enforcement.activeReservations`, `national-operations-center.activeIncidents`, `event-processing-layer.processedIdempotencyKeys`. They boot-hydrate from `authority_state` and write-through on some transitions (`persistChange` → `putState`), but there is **no cross-instance runtime invalidation** (no Redis pub/sub for these maps). In a multi-instance deployment, instance B does not see a change created on instance A until restart (e.g., `approveChangeRequest` on B throws `INVALID_CHANGE` for a change created on A). Documented honestly in the truth gate, but unremediated.
- **R2 🟠 — Authority `requireDb()` fails silent when `DATABASE_URL` is unset:** every authority function returns `null`/empty instead of erroring when neither attached nor `DATABASE_URL`-configured (`postgres-authority.js:26–30`). Protection is exclusively the boot gates in `server/index.js`. Any entry point that bypasses the server boot (scripts, workers, future harnesses) silently operates authority-less. Zero-trust requires the authority to be explicit about its mode.
- **R3 🟠 — Tenant guard is enforced only on `/api/v1/*`:** `assertTenantBoundary` runs in the `/api/v1/` dispatcher (`server/index.js:1113–1140`). Legacy paths (`/api/sync`, `/api/students/:id`, `/api/health-index`, `/api/admin/*`) rely on per-module scoping (verified present: `sync.js` record scope + `WRITE_PERMS`, `idor.js`, `routes/students.js policy.inScope`) — but there is **no single enforcement point**; a newly added legacy-style route can silently skip tenant guarding. Defense exists, but it is fragmented rather than systematic.

### Production Boot & Configuration Trust

- **R4 🟠 — Asymmetric production flags:** the TLS gate keys off `PAYESH_ENV`; Redis persistence policy keys off `NODE_ENV` and URL presence; the boot warning text ("the Redis gate follows NODE_ENV") is stale relative to the current `redis.js` logic (URL presence now dominates). `PAYESH_ENV=production` alone yields TLS enforcement but mismatch only warns — boot continues. DEPLOY.md §3 says "set BOTH" — the system should enforce it instead of warning.
- **R5 🔴 — `DATABASE_URL` set + `REDIS_URL` missing ⇒ zombie server:** reproduced live — the server boots, listens, logs `[FATAL] Cache readiness failed: REDIS_URL is required…`, and then serves `503` on `/api/health` **forever** without exiting. Every other production boot violation fails fast (`process.exit(1)`); this one degrades to a permanently not-ready process. An operator discovers it only through monitoring. Must fail fast (or be explicitly and loudly accepted).
- **R6 🟠 — Session revocation is fail-open by design under Redis outage** (`revocation.js` §5): `isRevoked`/`getSessionVersion` swallow Redis errors → distributed logout/"revoke-all" is deferred until Redis returns (bounded by 8 h JWT TTL + per-process local denylist). Deliberate and documented — but a Phase 8.4 review must formally accept or bound it (e.g., shorten TTL, add revocation-through-PG fallback).
- **R7 🟡 — Sync backpressure is advisory under Redis outage:** `REDIS_REQUIRED` is caught, audited (`sync_backpressure_degraded_redis_down`), and the write proceeds (auth is the hard gate). Documented; needs an abuse-analysis sign-off for multi-tenant worst case.
- **R8 🟡 — Magic defaults in the tenant guard:** hardcoded province fallback `'07'` (Tehran) and ad-hoc `province_id → code` mapping (`school_id`-based heuristics) in `server/index.js:1126–1137`. A province-less/school-less actor currently lands in a fail-closed branch (verified), but the behavior is incidental rather than specified.
- **R9 🟡 — Permissive default `tenant_policy` seed:** migrations seed `{match: actor_province}` for every province, no deny rows. Isolation today comes from the actor-binding checks; the policy table adds little until deployments write real restrictive rows. Production certification must require a tenant-policy review per deployment.

### Single Points of Failure & Scalability

- **R10 🟠 — PostgreSQL SSoT is a single instance in all current E3/E4 evidence.** HA artifacts exist (`infra/postgres/docker-compose.ha.yml`, replication init, `pgbackrest` template, `tools/failover-postgres.sh`) and DR docs/runbooks exist (E1), but **no live PG failover drill has been executed and evidenced at E4 in the phase record.**
- **R11 🟠 — Same for Redis:** sentinel/cluster code and tests exist (`redis-sentinel-failover.js`, `redis-cluster.js`), but production-equivalent failover evidence is E2/E3-max in the record.
- **R12 🟡 — Single-process serving model** for statics + API; multi-instance machinery (outbox, OCC, distributed rate-limit, pub/sub cache) is tested (wave18w19 multi-node live test), but no E4 sustained multi-node soak exists.
- **R13 🟡 — Cold-boot seeding takes ~60–120 s on modest hardware (18,850 rows one-time seed),** and the truth gate's boot health-poll budget is 66 s (220×300 ms) — the gate failed twice in this audit environment purely on boot-duration, before passing on the third run with correct env. The margin is too thin for CI/CD runners of varying speed.
- **R14 🟡 — `routeRequestSoT` queries PostgreSQL on every routed HTTP request** (correctness-first; the old 50 ms cache window was removed). This is the right call for correctness, but per-request PG round-trips on the routing hot path need load-validation (and likely a short, invalidation-coupled cache epoch) in Phase 8.3.

### Security Debt

- **R15 🔴 — WAF defaults to `report` (detect-only):** `PAYESH_WAF_MODE=enforce` must be set per deployment; WAF internal error falls back to report (fail-open, documented). Combined with R16, edge controls are only as strong as per-deployment env discipline.
- **R16 🟠 — The env-conditional verifier bug:** `tests/unified-production-verifier.js` Step 5 detaches the authority and Step 6's "Tenant policy allows valid matching scope" then depends on whether `DATABASE_URL` is exported: **14/14 without it, 13/14 with it** (deterministically reproduced). The prior "14 PASS" evidence was produced in a no-`DATABASE_URL` shell. This is a test-harness bug (authority left detached after the fail-closed probe), but it also means the headline "127/127" is environment-conditional — an evidence-integrity defect that Phase 8.1 must fix.
- **R17 🟡 — Engine contract inconsistency:** `package.json` engines `>=20.0.0`, but the jsdom-30 smoke chain requires Node ≥22 (CI pins 22.x; smoke on Node 20 fails loudly by design). Engines should be `>=22`.
- **R18 🟡 — Unauthenticated `/api/public-report`** serves aggregate school report cards by design (verified aggregate-only, no PII fields in `public-report-core.js`), but it is reachable without auth and needs its own rate-limit/abuse review (Phase 8.4).
- **R19 🟡 — Known missing login rate cap for bulk-import (Excel) paths** (documented in `TODO_BEFORE_PRODUCTION.md` §2.2 note) — verify whether still applicable after phone-auth-only design.

### Operational Maturity Gaps

- **R20 🔴 — The 127-test regression battery is not automated in CI:** `.github/workflows/node.js.yml` runs a different live-PG/Redis set + `npm test` (run.js + smoke.js); `server17.js`, `unified-production-verifier.js`, `migration-sequence.js`, `migrate-pg-constraints.js`, and the canary-atomic suites are **manual** evidence runs. The R.7.x evidence protocol depends on operator discipline.
- **R21 🟠 — No machine-recorded migration ledger:** `tools/migrate-helper.js` itself documents "no machine record of which migration ran on which environment" (`docs/MIGRATION_AUDIT.md` §5). CI re-plays the full chain per run; production needs `schema_migrations` bookkeeping.
- **R22 🟠 — Observability is built but undrilled at E4:** OTel tracing, metrics with bearer token, runtime monitor, attack detector exist; `docs/INCIDENT_PLAYBOOK.md`, `ONCALL_SCHEDULE.md`, alerting docs are E1 (documentation). No evidence of a live alert firing → human action drill.
- **R23 🟡 — Documentation sprawl:** 450+ markdown files at root and `docs/`, 44 `DOCS_FREEZE_v1.0.0-rcN` files, multiple overlapping phase reports. Discovery/consistency risk for new operators (mitigated partly by `docs/DOCS_INDEX.md` and docs-health tests).
- **R24 🟡 — Single `index.html` artifact (1.6 MB) served per request** — static-cache layer exists; CDN plan is E1 only.
- **R25 🟡 — Governance bookkeeping drift:** initiation prompt asserted HEAD/DOC_COMMIT/R.7.3 state that does not match the repository (see §1.1). Harmless here (skills-docs-only delta), but the phase-control protocol should require the *auditor* to re-derive HEAD, as done in this audit.

---

## 3. Required Actions — PHASE 8 ROADMAP PROPOSAL

### PHASE 8.1 — Operational Hardening (entry: immediately; exit gate: all 🔴 items closed)

| ID | Action | Closes |
|---|---|---|
| A1 | Fail-fast on `REDIS_URL` missing when `DATABASE_URL`/production is set (make the `[FATAL] Cache readiness failed` path `process.exit(1)`, mirroring the PG gate) | R5 |
| A2 | Wire the full regression battery (server17, unified-production-verifier, migration-sequence, migrate-pg-constraints, canary-atomic live+mock, run.js, smoke.js) into CI as a named job with PG17+Redis services | R20 |
| A3 | Fix `unified-production-verifier.js` Step 6 env-conditionality (re-attach authority or restore `DATABASE_URL` handling) and add a CI lane that runs it **with** `DATABASE_URL` exported | R16 |
| A4 | Decide + implement WAF production posture: default `enforce` in production boot (with safe-list) or a documented per-deployment checklist item with a boot-time loud warning when report-mode in production | R15 |
| A5 | Unify production env semantics: one canonical `isProduction()` across TLS/Redis/DB gates; stale warning text updated; mismatch = boot failure in production | R4 |
| A6 | Make authority mode explicit: `requireDb()` throws when unconfigured *unless* an explicit `PAYESH_AUTHORITY=disabled` dev opt-in is set; audit all non-server entry points (workers, scripts) | R2 |
| A7 | Raise `engines` to `>=22` to match the real toolchain | R17 |
| A8 | Add `schema_migrations` ledger table + apply/record tooling for production environments | R21 |

### PHASE 8.2 — Observability & Incident Response (entry: after 8.1 exit or in parallel)

| ID | Action | Closes |
|---|---|---|
| B1 | Deploy alerting on: health/readiness flips, Redis/PG disconnect counters, `sync_backpressure_degraded_redis_down`, `AUTHORITY_UNAVAILABLE`, WAF verdict spikes, audit-ledger write failures | R22 |
| B2 | Execute a live alert→on-call→runbook drill with timestamped evidence (E4) for: Redis outage, PG outage, canary rollback, tenant-breach attempt | R22, R10 |
| B3 | SLO definitions + error-budget dashboard wired to the existing metrics endpoint | R22 |
| B4 | Formal acceptance (or bounding) of revocation fail-open window and advisory backpressure under outage — signed risk decision with compensating controls (e.g., TTL reduction option) | R6, R7 |

### PHASE 8.3 — Performance & Scale Validation (entry: after 8.1)

| ID | Action | Closes |
|---|---|---|
| C1 | Load test on the `routeRequestSoT` per-request PG refresh path; measure p95/p99; if needed introduce invalidation-coupled short cache epoch (never the old blind TTL) | R14 |
| C2 | Multi-instance soak (≥2 nodes, shared PG+Redis) exercising the 5 RAM-authority control planes to quantify divergence windows; then either migrate them to authority write-through-per-mutation + pub/sub invalidation, or scope-lock them to single-instance admin tooling | R1 |
| C3 | Cold-boot seeding performance (target <30 s) and truth-gate boot budget raised to a robust margin (or seed moved to a pre-boot job) | R13 |
| C4 | Public-report abuse/rate-limit review | R18 |
| C5 | CDN/static-cache validation for the single-file artifact | R24 |

### PHASE 8.4 — Advanced Security Review (entry: after 8.1; before 8.5)

| ID | Action | Closes |
|---|---|---|
| D1 | Centralize tenant enforcement: route registry requiring an explicit scope/tenant annotation per route (new routes cannot ship unguarded) | R3 |
| D2 | Remove magic province defaults; explicit actor-province resolution with fail-closed on unknown | R8 |
| D3 | Per-deployment `tenant_policy` hardening kit (deny-by-default templates, verification script) | R9 |
| D4 | External-style adversarial review of the remaining RAM control planes (race/divergence abuse), JWT/OTP flows under outage, and the public-report surface | R1, R6, R18 |
| D5 | Re-run secret scan + dependency audit (`npm audit`, supply-chain test) against the Phase 8.1 tree; verify token-revocation runbook (user instruction: tokens stay valid and in place — no revocation performed) | — |

### PHASE 8.5 — Production Certification Gate (final)

Entry only when 8.1–8.4 exit criteria hold. Certification requires, at minimum, the Phase 8 Gate Criteria in §6 — all at the stated evidence levels, independently reproduced.

---

## 4. Evidence Plan

Every future claim in Phase 8 is classified and capped by evidence level (per `evidence-integrity-and-commit-accounting` skill, Rule Set 3):

| Level | Definition | Allowed use |
|---|---|---|
| [E1] | Documentation only | Design intent, plans, runbooks — never a PASS/VERIFIED claim |
| [E2] | Mock/test simulation (jsdom, mock DB, mock authority) | Logic/atomicity reasoning, regression guards — must be labeled `[MOCK]`/`[UNIT]` |
| [E3] | Real integration runtime (live PostgreSQL 17.11 / Redis 8.0.2, real server process) | Behavioral claims: fail-closed, isolation, atomicity, routing |
| [E4] | Production-equivalent runtime proof (E3 + chaos injection/multi-instance/HA drill, independently reproducible, with command log + SHA) | Phase gate verdicts, certification |

**Rules:**
1. No claim may exceed its evidence level; E1 language ("designed to", "documented") is mandatory for E1 items.
2. Every E3/E4 claim cites: exact command(s), environment (versions), commit SHA, and raw output excerpt (Type A/B/C evidence per the skill).
3. Env-conditional results must state the env (the V7 lesson from this audit).
4. Mock and real suites must never share a verdict line without labels.
5. The regression battery must run **with** `DATABASE_URL` and `REDIS_URL` exported (production-like), not only without.

---

## 5. Commit Plan

Strict separation is maintained (no overlap allowed):

- **CODE_COMMIT** — executable changes only (`server/`, `tests/`, `migrations/`, `tools/`, CI workflow). During Phase 8.1: A1–A8 land as code commits, each referencing the risk IDs they close. The current audited code baseline is `766be4b` (still the effective production-code state at HEAD `4530d753`).
- **DOC_COMMIT** — documentation/handoff only (`docs/`, `*.md`, skills). **This report + its HANDOFF entry = the Phase 8 DOC_COMMIT.** No executable files are touched by it.
- **TEST_COMMIT** — where a change is purely test-harness (e.g., A3), it may be split from code changes when review clarity demands; otherwise test changes ride with their code commit and are declared in the commit body.

Verification protocol per commit: `git status --short` (clean before/after), `git diff --stat HEAD^`, `git rev-parse HEAD` recorded in the report; push to `origin/main` mandatory (user directive).

---

## 6. Phase 8 Gate Criteria

**Phase 8.1 exit:** zero 🔴 findings open (R5, R15, R20 closed at E3); CI green on the full battery with PG+Redis services and `DATABASE_URL` exported; boot fail-fast verified for every production env violation (TLS, PG, Redis, authority-attach, env-mismatch) at E3.

**Phase 8.2 exit:** alert→action drill executed at E4 with timestamped evidence; SLOs published; R6/R7 risk decisions signed.

**Phase 8.3 exit:** load-test report at E3/E4 with p95/p99 under stated workload; multi-instance soak with quantified (and accepted or eliminated) control-plane divergence; cold-boot <30 s.

**Phase 8.4 exit:** centralized tenant enforcement shipped with a guard test that fails on any unannotated route; adversarial review report with all new findings triaged; tenant-policy hardening kit verified on a real deployment config.

**Phase 8.5 exit (Production Certification):**
1. All Phase 8.1–8.4 exit criteria hold.
2. Full regression battery green **in CI** (not manual), at E3.
3. Production truth gate 44/44 VERIFIED at the final CODE_COMMIT.
4. Live PG failover drill AND Redis failover drill at E4 (or formally accepted single-instance with data-loss bounds).
5. Zero 🔴/🟠 findings open; all 🟡 explicitly accepted with owner + review date.
6. Independent red-team re-certification of the final tree (new audit, zero-trust, same standard as this one).
7. Commit accounting clean: CODE_COMMIT and DOC_COMMIT SHAs distinct, declared, and pushed.

---

## 7. Final Status

```
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║              PHASE 8 ENTRY AUDIT — FINAL STATUS                      ║
║                                                                      ║
║   PHASE 8:  READY                                                    ║
║                                                                      ║
║   Basis: All Phase 7.6 core guarantees were independently            ║
║   reproduced at E3/E4 on live PostgreSQL 17.11 + Redis 8.0.2         ║
║   (truth gate 44/44 VERIFIED at HEAD 4530d753; canary atomicity,    ║
║   tenant isolation, Redis/PG fail-closed all re-proven).            ║
║   No architecture blockers remain.                                   ║
║                                                                      ║
║   Conditions: Phase 8 entry is granted for the hardening track       ║
║   (8.1–8.5). The three 🔴 findings (R5 zombie server, R15 WAF        ║
║   default, R20 manual battery) and the governance drift (R25)        ║
║   MUST be closed at the 8.1 gate before any production               ║
║   certification claim. Production certification itself remains       ║
║   NOT GRANTED until the Phase 8.5 criteria are met at E4.            ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

**Evidence appendix (auditor's raw command log, condensed):** migration chain 20/20 exit 0; `production-truth-gate.js` → `44/44 VERDICT: VERIFIED, HEAD: 4530d753...`; `canary-atomic-postgres-live-runtime.js` → `10 PASS / 0 FAIL` (rollback `SUCCESS`, audit rows `0`); `server17.js` → `70 سبز / 0 قرمز`; `migration-sequence.js` → `19/19`; `migrate-pg-constraints.js` → `14 موفق / 0 ناموفق`; `unified-production-verifier.js` → `14 PASS / 0 FAIL` (no `DATABASE_URL`) and `13 PASS / 1 FAIL` (with `DATABASE_URL`); `run.js` → `35/35`; `smoke.js` → `547/547` (Node 22.14.0); live drills D1–D12 as tabulated in §1.3.

— *Independent Principal Architect + Red Team Security Auditor, Phase 8 Initiation, 2026-09-20.*
