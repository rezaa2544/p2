# Arena — Deep Repository Reconnaissance & Current-HEAD Baseline Report
## پایش (Payesh) — rezaa2544/p2 @ main

**Date:** 2026-09-22
**Mission:** Full-repository reconnaissance for deep program understanding + current-HEAD evidence baseline (predecessor to the verification/red-team phase)
**Role:** Arena deep independent-verification / red-team agent (reconnaissance pass)

---

## 1. Identity

| Field | Value |
|---|---|
| Repository | `rezaa2544/p2` |
| Branch | `main` |
| Current HEAD (verification anchor) | `ecc8b40b5d533d77c6ebad63ca0854119873c504` |
| origin/main | `ecc8b40b5d533d77c6ebad63ca0854119873c504` (verified by clone + re-fetch; no drift) |
| Working tree | clean |
| Local environment (E3) | Node **v22.23.2** (nvm-installed; matches CI matrix `22.x`), npm 10.9.8, git 2.47.3, python3 |
| Infra available locally | **none** (no PostgreSQL, no Redis, no docker) — all live-PG/live-Redis suites are BLOCKED locally, NOT skipped-as-pass |
| GitHub Actions access | public API (unauthenticated) — used for CI evidence only |

## 2. Scope

- Read/analyzed: `server/index.js` (1859 L, full), `server/db.js` (1028 L, full), `tests/run.js` (287 L, full), `tests/smoke.js` (7947 L, structure + failing test in full), `.github/workflows/node.js.yml` (231 L, full), `.github/workflows/codacy.yml` (61 L, full), `docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md` (498 L, full), `docs/PROJECT_OVERVIEW.md` (892 L, full), `README.md`, `AGENTS.md`, `CLAUDE.md`, `package.json`.
- Enumerated/mapped: `server/` (119 JS files), `src/js/` (95 modules via `_order.json`), `tests/` (532 files), `migrations/` (20 numbered pairs → 90 tables in 001), `tools/` (864 KB), `authz/` (model.json, write-perms.json), `docs/` (487 files).
- Executed: `npm ci`, `npm test` (full), 8 static CI steps, targeted git archaeology, GitHub Actions API queries.
- **NOT** executed (require live PG/Redis): all `live-PG`/`live-Redis` suites, `tools/production-truth-gate.js` (needs PG), `tools/production-verifier.sh` (needs PG), chaos drills. Status: **BLOCKED (local infra absent)** — their CI results at the anchor SHA are recorded instead.
- Out of scope this pass: code modification (none performed), E4 work (not requested), deep module-by-module review of all 119 server files (done for core; remaining mapped by surface).

## 3. Architecture understanding (how the program works)

### 3.1 Two-layer product
**پایش/Payesh** — Persian/RTL school-management platform (Jalali calendar; 9 roles: superadmin, edu_office, manager, teacher, student, parent, counselor, driver, guard) with an **offline-first client** and an **integrated server platform**.

**A. Client / offline distribution**
- 95 JS modules in `src/js/` (order pinned by `_order.json`) + styles + templates → `build.js` → single-file `index.html` (offline; zero external requests; Vazirmatn font base64-embedded; `sw.js` service worker; `manifest.json`).
- Data layer: in-memory collections `db.*` + IndexedDB persistence (`03-idb-persistence.js`) + op log (`log`) + sync queue (`SYNC.queue`, localStorage).
- Concurrency: per-record `version` (insert→1, update→+1) with `base_version` on queued ops for versioned collections (R95); LWW for others.
- Auth model: **no password** — login = phone + OTP code + national ID match (IdmSystem). The `password` field exists only as an archived record/backup column; a smoke test locks that no code reads it at login.
- Domain breadth: classes/subjects/attendance/grades/schedule/bell, student lifecycle (promotion/transfer/graduation/archive), pre-registration funnel, tuition/installments/scholarships, library/assets/visitors, dorm, bus service (no GPS), virtual classes, homework, counselor queue + pattern-based at-risk detection, exams (incl. national-final rule for 9th/12th), reports, plans/paywall, audit/activity, superadmin tools.

**B. Server / integrated platform** (`server/`, Node ≥22, zero-framework HTTP)
- `index.js`: request pipeline = URL-parse guard → security headers + per-request CSP nonce → **canary routing (fail-closed 503)** → metrics → trace id → **WAF (report/enforce)** → **CSRF same-origin gate** → **R97 enumeration guard** (Redis counters; warn→500 ms→2 s→revoke) → route dispatch. Boot gates (production): no `DATABASE_URL` ⇒ fatal; DB init failure ⇒ fatal; Redis failure + production/PG ⇒ fatal; shared backend without `PAYESH_JWT_SECRET` ⇒ fatal; JWT secret <32 B ⇒ fatal; production requires TLS or explicit proxy flag. `listen()` waits for DB readiness + canary hydration from PG.
- Auth: JWT HS256 in HttpOnly/SameSite=Lax cookies; OTP store (Redis or PG, fail-closed in production); session revocation denylist (`jti`, 8 h GC); previous-secret rotation window; demo code echo only in dev.
- Sync (`/api/sync`): applies the client's offline op queue with tenant/role/field gates (`sync.js`: canWrite/canOp/fieldGate/inScope, protected-field policy, virtual-day violations), idempotency via `server_processed_uids`, OCC on versioned tables (409 on `base_version` mismatch), atomic batch persistence in one PG transaction (fail-closed in production, F1), conflicts API with adjudication.
- Data (`db.js`): unified layer over PostgreSQL pool + optional read replica (queryRead with reprobe) + JSON in-memory fallback (dev-only; production fail-closed, P0-1). Hydration from PG at boot with guards (B7: empty PG never wipes non-empty memory; capped/skipped hydration disables file persistence, PR#94). Partitioned-table upsert path (PAYESH_PARTITIONED_TABLES). `chg_id` internal column stripped from all outbound rows.
- Outbox + worker: mutation outbox persisted in PG; worker (1 s tick, 5 retries, DLQ row after exhaustion) processes handlers; crash/restart replay; worker liveness pulse (`lastTickAt`, `isHealthy`) — `/api/health` returns 503 when frozen.
- Observability: `/api/liveness|readiness|health`, `/metrics` (Prometheus; bearer-token gated in production; `payesh_redis_up` truthiness fixed), OTel tracing, audit log (0600, rotation 1000/10 MB, sanitized).
- Operations: graceful shutdown (drain, 10 s budget), periodic auto-backup (retention 10), PG/Redis DR tooling (pgBackRest, Sentinel, PITR scripts), national capacity gate (Phase 5, fail-closed 429), tenant/province isolation (Phase 6), PostgreSQL authority (Phase 7), zero-trust batteries (Phase 8: R1/R2/R5/R21).
- Migrations: 20 numbered up/down pairs (`migrations/`), applied by `tools/migrate-ledger.js` (ledger table `schema_migrations`; DDL + ledger insert in one transaction — MIG-001 fix); CI runs full up chain, full down-all (zero residue), re-apply.

### 3.2 Test infrastructure
- `npm test` = `tests/run.js` (35 static/structural guards: structure, build bit-parity check-then-build, offline guarantees, RTL/Jalali invariants, add/insert persistence guards, function-uniqueness, syntax) + `tests/smoke.js` (jsdom; 547 behavioral tests: real login flow, per-role rendering of all routes, offline sync, import wizard, lifecycle, authz, counselor, bus, dorm, bell, grades import, etc.).
- Node ≥22 enforced by the runners (fail loud, never silent-skip).
- CI `Node.js CI` (node.js.yml): Node 22 + PG17 + Redis8 services → static governance contracts (parity, release-version, M1 probes) → migration up/down-all → live-PG suites → live-Redis + Redis-outage fail-closed → two-instance OCC → outbox crash/DLQ → Phase 6.5 RT-01…10 → Production Truth Gate → Phase 7 verifier T1–T7 → Phase 8.1 batteries A–D → R1/R2/R21/c3 suites → `npm run build` → `npm test`.
- 532 test files; live-PG/live-Redis suites fail by design without infra (no fake green).
- Secondary workflows: Security Program (SAST/SCA/SBOM/DAST/secret — green at anchor), Codacy (red at anchor — see F-002), CodeQL (green), Fortify (green), npm publish (not triggered).

### 3.3 Governance model (docs)
- Source-of-truth order: Current HEAD → runtime+tests/CI → machine contracts → current ground truth → docs → historical reports.
- E3 (local/CI) vs E4 (production-equivalent multi-node) strictly separated; Rule 15 = 5 tasks × 5 distinct passes; chat↔roadmap reconciliation contract (every chat report reconciled to Current HEAD, status changes require SHA + evidence + owner + next action).
- Current ground truth (2026-09-21, authored at `fbe178be`, last reconciled for Chat 4 at `2211ba45`): **Phase 8.2 = PARTIAL, Exit = NOT VERIFIED; Phase 8.3 = BLOCKED; no Production GO; E4 DR/HA = NOT VERIFIED (E3 evidence only)**. Open blockers: F-QA-02/03/01/08, M1 (alert/on-call E4), M2/M3 (PG/Redis restore-failover E4 + measured RPO/RTO), OUTBOX-002 proof, DB-001 measurement, OUTBOX-001 contract, RT1-01…05 recheck.

## 4. Evidence matrix (baseline at anchor SHA)

| # | Command / source | Environment | Expected | Actual | Status |
|---|---|---|---|---|---|
| E1 | `git clone` + `git rev-parse HEAD origin/main` | local | HEAD = origin/main = `ecc8b40b…` | yes (both, plus re-fetch) | VERIFIED (E3) |
| E2 | `npm ci` | local, Node 22.23.2 | install ok | ok, 0 vulnerabilities | VERIFIED (E3) |
| E3 | `npm test` (tests/run.js) | local, Node 22.23.2 | 35/35 | **35/35 PASS** | VERIFIED (E3) |
| E4 | `npm test` (tests/smoke.js) | local, Node 22.23.2 | 547/547 | **546/547 — 1 FAIL, exit 1** (ENOENT `TODO_BEFORE_PRODUCTION.md`) | **REPRODUCED** (E3) — see F-001 |
| E5 | 8 static CI steps (parity, release-version, M1 probes, migration-sequence, migrate-pg-constraints, schema-migrations-ledger, migration-009-negative, secret-scan) | local, Node 22.23.2 | all green | all green (10/10, 19/19, 14/14, 12/12, etc.) | VERIFIED (E3) |
| E6 | GitHub Actions — Node.js CI run **#1205** on `ecc8b40b5d` | CI (PG17+Redis8) | green | **FAILURE** — every step green except final `Run npm test` (identical failure to E4) | REPRODUCED (E3/CI) — see F-001 |
| E7 | GitHub Actions — Node.js CI runs **#1160…#1205** (46 consecutive push runs, 2026-09-21 10:05→21:25 UTC) | CI | green main | **all FAILURE**; first red = #1160 on `89cec08c` failing `Phase 7 production verifier T1–T7` (later green again at #1205 — transient/that-commit); last green = **#1159 on `755715bd`** | REPRODUCED (E3/CI) — see F-001 context |
| E8 | GitHub Actions — Codacy Security Scan run **#366** on `ecc8b40b5d` | CI | green | **FAILURE** at `Run Codacy Analysis CLI` step (despite `max-allowed-issues: 2147483647`; third-party scanner/CLI erroring — consistent with known RT2-01/F-QA-04) | REPRODUCED (E3/CI) — see F-002 |
| E9 | Git archaeology: `git log --follow TODO_BEFORE_PRODUCTION.md` | local | locate file move | commit **`2f3b23c3`** (2026-09-22 00:07 +0330) moved root file → `docs/audit/history/audit/`; file still contains `bcrypt` ×4 | VERIFIED (E3) |
| E10 | live-PG / live-Redis suites, truth-gate, production-verifier, chaos drills | local | — | **BLOCKED** (no PG/Redis in sandbox); CI evidence at anchor used instead (all green at #1205 except final step) | BLOCKED (local) / VERIFIED via CI (E3/CI) |

## 5. Findings

### F-001 — `npm test` red on current main: smoke guard ENOENT after docs archive (P1)
- **Status:** REPRODUCED (E3 local ×1 + E3 GitHub Actions CI #1205 ×1 + git-archaeology root cause ×1)
- **Severity:** P1 — main's primary test gate is red; blocks merge/CI gate; invalidates any "green CI at current HEAD" claim; breaks a governance lock.
- **Exact location:** `tests/smoke.js:2837-2858` (test `یادآور: محصول رمز کاربری ندارد — ستون آرشیوی در ورود خوانده نمی‌شود`); the failing line reads `path.join(__dirname, '..', 'TODO_BEFORE_PRODUCTION.md')` (repo root).
- **Reproduction:** `npm ci && npm test` → run.js 35/35, smoke `546/547`, `❌ … ENOENT: no such file or directory, open '/…/TODO_BEFORE_PRODUCTION.md'`, exit 1.
- **Expected:** 35/35 + 547/547 (the last assertion locks the *conditional bcrypt debt* note inside `TODO_BEFORE_PRODUCTION.md`).
- **Actual:** ENOENT → test fails; `npm test` exit 1.
- **Root cause:** doc/cod
e drift — commit `2f3b23c3bd89934d23b26d03595f6e87b71fba08` ("docs: archive and categorize legacy root documentation", 2026-09-22 00:07:22 +0330) moved `TODO_BEFORE_PRODUCTION.md` from repo root to `docs/audit/history/audit/` without updating the test's path. ~20 other references (docs/AI_PROMPT.md, docs/ARCHITECTURE_DECISIONS.md, docs/FIXES_ACTION_PLAN.md, .claude/skills/payesh-standards/SKILL.md, .claude/skills/security-review-payesh/SKILL.md, …) still cite the root path as a live document.
- **Impact:** (a) Node.js CI red on main (#1198..#1205 fail at `Run npm test`; main red continuously since #1160 with an earlier, now-resolved Phase-7-verifier failure); (b) the bcrypt-debt governance lock is no longer enforced (file archived; test throws instead of asserting); (c) the archived location contradicts docs that treat the file as an active work-item register.
- **Minimal remediation (for coding team — not applied by this agent):** restore the active register at root or repoint the test + all references to one canonical live path (keep the `bcrypt` conditional-debt note in a live doc, e.g. the ground-truth doc or a new `docs/TODO_BEFORE_PRODUCTION.md`), then re-run `npm test` and CI.
- **Regression requirement:** after fix, `npm ci && npm test` = 35/35 + 547/547 on Node 22.23.2 with zero skips, **and** a green Node.js CI run at the fix SHA (all steps incl. `Run npm test`).

### F-002 — Codacy Security Scan workflow red at current HEAD (P3, tooling)
- **Status:** REPRODUCED (E3/CI — run #366 on `ecc8b40b5d`), step `Run Codacy Analysis CLI` fails despite `max-allowed-issues: 2147483647`.
- **Severity:** P3 / TOOLING — third-party scanner error (token/CLI), not a code vulnerability signal; consistent with known RT2-01 ("max-allowed-issues int-max" policy question) and F-QA-04 (NON-BLOCKING/TOOLING in ground truth).
- **Location:** `.github/workflows/codacy.yml:48`.
- **Impact:** security workflow red on main; scanner coverage effectively absent.
- **Recommendation:** track under RT2-01/F-QA-04; either repair scanner config/token or explicitly retire the workflow from the security gate (per policy: a red scanner is not vulnerability evidence, but a permanently red lane is an observability blind spot).

### Observations (no defect asserted)
- **O-01:** Main has been CI-red for 46 consecutive runs (~11.3 h, 2026-09-21 10:05→21:25 UTC) across **two distinct causes** (Phase-7 verifier at #1160 — transient, later green; TODO-file at #1198+ — still open at anchor). The ground-truth doc (authored before these commits) still cites "Last verified CI run: Node.js CI #1093 — successful" — stale; per the reconciliation contract the ground truth must be updated with the current CI state before the next chat mission.
- **O-02:** Chat 4's "35/35 + 547/547, zero skips" (Node 22.23.2) was valid at its baseline SHAs (`fe633395`/`138cd1d9` era) but is **not reproducible at the anchor SHA** — historical evidence, superseded by F-001 (not a fake-green at the time; a regression introduced afterwards).
- **O-03:** Open PR #334 (dependabot jsdom 30.0.1→30.1.0) also fails Node.js CI (#1206) for the same base-main reason.
- **O-04:** Locally, only the smoke test fails; all static suites, the build parity check (`build.js --check` inside run.js), and the build itself pass — the client/server static surface is healthy at the anchor.

## 6. Cross-agent conflicts (claims vs current-HEAD evidence)

| Claim (source) | Baseline | Current-HEAD check | Resolution |
|---|---|---|---|
| "npm test = 35/35 + 547/547, zero skips" (Chat 4, `docs/audit/CHAT4_QA_RELEASE_RECONCILIATION_2026-09-21.md`) | `fe633395` / last green CI `138cd1d9` (#1098) | **546/547** at `ecc8b40b` (F-001) | Conflict: claim stale vs current HEAD; current HEAD evidence wins (policy §1). Not retraction of Chat 4's baseline measurement — regression occurred at `2f3b23c3`. |
| "Last verified CI run: Node.js CI #1093 — successful" (ground truth §2) | `fbe178be` | main red since #1160; last green #1159 (`755715bd`); anchor run #1205 = failure | Stale statement; Roadmap Reconciliation Required. |
| "Phase 8.2 S2 = VERIFIED as DELIVERED; Exit = NOT VERIFIED; Phase 8.3 BLOCKED; no Production GO" (Chats 3/4/5 + ground truth §13–17) | various SHAs | unchanged at anchor (no contradicting runtime evidence found this pass; live suites green at #1205 up to the final step) | No conflict; statuses remain valid, but the **red main** is a new, unreconciled fact. |
| "truth-gate 44/44", "R1 49 PASS / R2 32 / R21 8 / S2 4 / server17 70/0" (ground truth / Chat 4) | older SHAs | green at anchor CI #1205 (steps success) | Consistent at anchor via CI (E10). |

## 7. Roadmap impact

- **Roadmap Reconciliation Required (mandatory flag):**
  1. Ground truth §2 "Last verified CI run" is stale → must be updated to: last green #1159/`755715bd`; anchor #1205 = FAILURE (`Run npm test`); main red #1160→#1205.
  2. F-001 is a new in-repo defect (test/doc drift) not tracked in the consolidated five-chat workplan → should enter the workplan with an owner (suggested: docs/test maintenance) and a regression requirement (green `npm test` + green CI at fix SHA).
  3. F-002/Observation of red Codacy lane: track under RT2-01/F-QA-04 (governance/tooling), no gate impact per existing policy.
- **No status upgrade is proposed** for any phase; Phase 8.2 Exit remains NOT VERIFIED and Phase 8.3 remains BLOCKED per existing evidence (unchanged by this pass).

## 8. Recommended next action

1. **Fix F-001 first** (trivial scope: repoint/restore the TODO register + update references) — it unblocks the main gate and restores the bcrypt-debt lock. This is a coding task; as the verification agent I will not modify code unless the Tech Lead explicitly assigns it.
2. Re-verify after fix: local `npm ci && npm test` (35/35 + 547/547) + a green Node.js CI run at the fix SHA (Rule 15 pass set: functional, boundary = no other root-path refs, negative = archive path still works, re-run ×2, independent = CI).
3. Reconcile ground truth §2 CI state + add F-001 to the consolidated workplan (per the permanent chat↔roadmap contract).
4. Then proceed to the assigned deep-verification phase (E3 live-PG/Redis suites require PG+Redis provisioning — locally BLOCKED; on CI they are green at anchor up to the final step).

## 9. Final verdict

**RECONNAISSANCE COMPLETE — BASELINE ESTABLISHED.**
- Deep architectural understanding achieved (client offline layer, server platform, PG/Redis data path, sync/occ/idempotency, security pipeline, test/CI infrastructure, governance model) — see §3.
- Current-HEAD baseline: static layer + build green (E3/E5); **`npm test` red on main (F-001, P1, REPRODUCED locally and in CI #1205)**; Codacy lane red (F-002, tooling); live-PG/Redis suites BLOCKED locally / green via CI at anchor except the final step.
- One new defect to reconcile into the roadmap (F-001) + one stale CI statement (ground truth §2). No phase status changes proposed; Phase 8.2 Exit = NOT VERIFIED and Phase 8.3 = BLOCKED stand.
- **No Production GO. No E4 claims.**
