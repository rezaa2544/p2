# IDOR / Object-Ownership Audit — Evidence Report

**Date:** 2026-09-24 · **Repo:** `p2` @ `4bff3bcb757162f040e82ffa26f3d40e46eb7a36` (main tip, pinned)
**Environment:** production-mode app (NODE_ENV/PAYESH_ENV=production), PG17 `payesh_db_idor` + Redis, 2-school fixture (S1: ids 1–4,6–10,16–18,20 · S2: ids 3,5,11–15,19), 13 actors (superadmin, 2 managers, 2 teachers, 6 students, 3 parents, 1 edu-office)
**Method:** (1) static inventory of all ID-addressed routes → (2) 124-case runtime matrix (owner / non-owner / same-tenant / cross-tenant / cross-role / forged ID) → (3) DB-persistence verification via psql for every write → (4) blast-radius measurement for every write that landed → (5) regression-pin tests.
**Status: NOT CERTIFIED (by task rule).** This report and its PASS/FAIL lines are **inputs to the three-AI verification gate only** (`tools/strict-verification-gate.js`). No evidence = no pass.

---

## 1. Summary

| ID | Class | Severity | Endpoint(s) | One-liner |
|----|-------|----------|-------------|-----------|
| **W-1** | cross-owner WRITE (same tenant) | **HIGH** | `PATCH /api/v1/students/:id` | Teacher writes IEP on a student of a class they do **not** teach — persisted to PG |
| **W-2** | cross-owner WRITE (same tenant) | **HIGH** | `POST /api/sync` (users/IEP) | Same W-1 hole via the offline-sync path — persisted to PG |
| **W-3** | ownership FORGERY → cross-tenant READ | **CRITICAL** | `POST /api/sync` (parent_links ins) | Parent forges `parent_id` of a `parent_links` row (any user, incl. other-tenant users and managers) → forged-to user gains read access; cross-tenant student read demonstrated |
| **R-1** | cross-owner READ (same tenant) | **HIGH** | `/api/v1/analytics/student-timeline`, `/parent-360` (+ all `assertCanSeeSchool` reports) | Teacher reads detailed analytics (identity, grades, attendance, parent context) of **any** student in the school — no class scoping |
| **W-4** | secret exposure | **HIGH** | `GET /api/v1/bootstrap` | Live session **JWT** returned in the GET response body (`user.token`) and cached in Redis 5 min |
| **S-1** | functional bug (prod-only), masking | MEDIUM | `GET /api/students/:id` (legacy) | Parent always 404 in **production** PG mode — code queries non-existent `users.parent_id`; fail-closed masks the schema drift |

**Confirmed NOT vulnerable (negative results, all evidenced):** cross-tenant isolation on REST/sync (uniform `403 PHASE6_TENANT_ISOLATION_BREACH`), superadmin/manager/edu-office boundaries, forged `alg:none` JWT (401), unauthenticated access (401), admin backup & SMS (superadmin-only 403 for managers), `delete-account` (self-only, no ID param), `/api/public-report` (aggregates only, no PII, anon-safe), school-intelligence / regional-intelligence / reports / pull tenant guards, `sync` `by`-forgery (batch poisoned, 403 `forged_by`), tenant-move via sync (403), student-role writes (403), cross-tenant parent-link **creation** (403 — the student-side school check works), destructive parent-link `del` by non-owner (403).

---

## 2. Bug packages (confirmed defects)

### W-1 — Teacher IEP write on non-taught student (REST) — HIGH
- **Location:** `server/routes/students.js:211` (teacher IEP branch of `PATCH /api/v1/students/:id`) + `server/policy.js:306` (teacher branch of `inScope`).
- **Repro:** `T1 (teacher, homeroom class 1, schedule class 2) PATCH /api/v1/students/20 {"iep_notes":"…"} (student 20 ∈ class 5)` → **200** `{"ok":true,…,"iep_notes":"…"}`.
- **Evidence:** run-3 case C01 (`idor-evidence.jsonl`); PG gate case W-1/W-1d (`tests/idor-runtime.js`); DB before/after verified via psql each run.
- **Expected:** 403/404 (deny) — teacher scope = classes actually taught (`teacherClassIds`).
- **Root cause:** for `users` records the teacher branch of `inScope` computes `sid = rec.student_id` → `null` (a student's own row has no `student_id`), `rec.teacher_id` → `null`, so it falls through to `rec.school_id === u.school_id` (**policy.js:306**) — a school-only match. The class/homeroom relationship is never evaluated for the IEP path.
- **Minimal remediation:** in the teacher IEP path (REST + sync), resolve the target student's class via `enrollments` and require `teacherClassIds(store, u.id).has(classId)` (same check the attendance/grades paths already apply); deny otherwise.
- **Regression:** `tests/idor-regression.js` → `W-1` (unit, `restWriteGate`) + `tests/idor-runtime.js` → `W-1`/`W-1d` (live + PG persistence). Both RED while defect present.

### W-2 — Same hole via /api/sync — HIGH
- **Location:** `server/sync.js` (IEP exception `iepUsersUpdate` + delegated `inScope`) — same policy root cause as W-1.
- **Repro:** `T1 POST /api/sync {"ops":[{"uid":"…","c":"users","t":"upd","id":20,"data":{"iep_notes":"…"},"by":4,…}]}` → **200** `results[0].ok=true`; **PG: user 20 `iep_notes` updated** (verified).
- **Evidence:** K02 (run-3b sync matrix), PG gate W-2/W-2d; DB value traced `ATTACK-WRITE-1 → sync-iep-attack → REGRESSION-W1 → REGRESSION-W2` across runs (each a real commit).
- **Root cause / remediation / regression:** as W-1 (shared fix covers both paths; sync must call the same class-scoped check).

### W-3 — Parent forges `parent_links.parent_id` → privilege escalation + cross-tenant read — CRITICAL
- **Location:** `server/policy.js:213` (insert: `rec = data`) + `server/policy.js:266` (Round-89 self-ownership guard) + `server/idor.js:47` (parents exempt from the school-tenant check on student reads).
- **Repro:** `PA (parent 17, S1) POST /api/sync {"ops":[{"c":"parent_links","t":"ins","data":{"parent_id":19,"student_id":7},"by":17,…}]}` → **200 ok**; **PG: new row (parent_id=19, student_id=7) persisted** (count 0→1). Repeated variants also landed: (19→6), and **(manager 3, S2 →6)** — a role-elevation forge.
- **Evidence:** K06, W-3/W-3d (PG gate, live 0→1), blast-radius file `idor-evidence-w3.jsonl`.
- **Impact chain (all demonstrated):**
  1. Any parent can link **any user id** as parent of any of their own children (same-tenant write, persisted).
  2. The forged-to **parent of another school** then reads that student: `PC (19, S2) GET /api/v1/students/6 (S1)` → **200** with PII (W-3e) — **cross-tenant read** via the forged link (`idor.js:47` exempts parents from the school check; read scope = `childrenOfParent` only).
  3. A forged-to **manager** link persists (W-3j) — integrity damage; current manager read paths are school-scoped (no read granted today), but the link pollutes the parent graph and any parent-scoped feature.
- **Root cause:** on inserts, `inScope` sets `rec = data` (policy.js:213), so the guard `if (coll==='parent_links' && !rec && data && Number(data.parent_id) !== u.id) return false` (policy.js:266) is **dead code for inserts** (`!rec` never true). Scope then degrades to "student is one of my children" (`kids.has(sid)`) — which is true, so any `parent_id` passes. (Observed asymmetry explained exactly: (17→8) denied because 8 ∉ PA's children; (19→6)/(3→6) allowed because 6 ∈ PA's children.)
- **Minimal remediation:** use the *existing-record* indicator for the guard — `if (coll==='parent_links' && !existing && data && Number(data.parent_id) !== u.id) return false;` (i.e., test `existing`, not `rec`). Additionally consider a tenant check on the *linked* user's school for parent-link creation.
- **Regression:** `tests/idor-regression.js` → `W-3a`/`W-3b` (+controls) · `tests/idor-runtime.js` → `W-3`/`W-3d` (live + PG count). All RED while defect present.
- **Cleanup note:** the audit DB now contains forged rows `parent_links (19,6) (19,7) (3,6)` and `users.20.iep_notes='REGRESSION-W…'` — attack evidence left in place per evidence policy; owner cleanup: `DELETE FROM parent_links WHERE (parent_id,student_id) IN ((19,6),(19,7),(3,6));` and restore IEP values.

### R-1 — Teacher reads any same-school student's analytics — HIGH
- **Location:** `server/routes/semantic-analytics.js:68` `assertCanSeeSchool` (teacher/counselor branch, line 88–95: school match only) — used by `student-timeline`, `parent-360`, `intervention-warnings`, `teacher-evidence` and the school-level reports.
- **Repro:** `T1 GET /api/v1/analytics/student-timeline?school_id=1&student_id=20` → **200** with 3 real events (attendance + grade payloads); `T1 …/parent-360?school_id=1&student_id=20` → **200** (student identity + academic data).
- **Evidence:** run-3 I01/I13; sweep SW22–SW26; PG gate R-1a/R-1b.
- **Expected:** 403 — teacher analytics scope = students of classes actually taught (the model's own rule, per `policy.teacherClassIds` and `studentRecordOk`).
- **Root cause:** `assertCanSeeSchool` implements the comment "محدودهٔ تدریس" (teaching scope) as a **school-level** check only.
- **Minimal remediation:** for teacher/counselor, after the school match, resolve `student_id → class (enrollments)` and require `teacherClassIds(store, user.id).has(classId)` (or route through `policy.studentRecordOk`).
- **Regression:** `tests/idor-runtime.js` → `R-1a`/`R-1b` + control `CTRL-4` (own homeroom stays 200). RED while defect present.
- **Note:** the same guard family is what made the *cross-tenant* analytics probes pass (SW21 403) — the tenant layer is intact; the defect is the **missing class-level scoping inside the tenant**.

### W-4 — Session JWT exposed in bootstrap body + Redis cache — HIGH
- **Location:** `server/middleware/projection.js:40–45` (`projectUserByRole` full-clone branch deletes only `password`) + `server/routes/bootstrap.js` (embeds `req.user` via `projectUserByRole(user, user.role, true)`; response cached `cache.setBootstrapCache(user.id, data, 300)`).
- **Repro:** `PA GET /api/v1/bootstrap` → 200; body `user.token` = **full HS256 session JWT** (24 h validity) — observed for every role (teacher projection branch is whitelisted and safe; self/manager/edu_office branches leak).
- **Evidence:** SW16 (full body captured, token redacted in report) + PG gate W-4.
- **Impact:** bearer token in a **GET** response body → captured by HTTP logs, proxies, client error dumps, SPA state; the same token is written to the **Redis bootstrap cache** (5 min) — a second exposure surface.
- **Minimal remediation:** strip session internals from the projection (`delete clone.token; delete clone.jti;` — or build the user payload from a field allowlist) and never cache a token-bearing payload.
- **Regression:** `tests/idor-regression.js` → `W-4a/b/c` (unit) · `tests/idor-runtime.js` → `W-4` (live). RED while defect present.

### S-1 — Legacy parent read broken in production (schema drift, masked by fail-closed) — MEDIUM (functional)
- **Location:** `server/policy.js:417` — `SELECT id FROM users WHERE role = $1 AND parent_id = $2` inside `resolveStudentScopeOpts` (parent branch).
- **Repro:** production-mode instance + `PA GET /api/students/6` (own child) → **404** on every call; app log on every parent request: `column "parent_id" does not exist`. Same instance, dev-mode boot → **200** (error swallowed in non-prod).
- **Evidence:** run-3 A08; prod probe (10.9.13.x) 404×3 (children 6,7 + non-child 8); dev-mode in-process 200; unit pin S-1u (mock PG without the column throws under prod flags).
- **Root cause:** the PG `users` table has **no `parent_id` column** (the parent chain lives in `parent_links` — query r1 in the same function already uses it). The legacy query r2 references a column that no longer exists; in production the catch rethrows → `apiStudent` → 404 fail-closed, which **masks** the schema drift and breaks a legitimate parent feature.
- **Minimal remediation:** remove query r2 (or resolve the legacy chain through `parent_links`/`parent_verifications` explicitly); add a migration-consistency check so code queries never reference absent columns.
- **Regression:** `tests/idor-regression.js` → `S-1u` (deterministic, prod-flags, mock PG) · `tests/idor-runtime.js` → `S-1` (dev-mode control). RED while defect present.

---

## 3. Triaged non-defects (evidence recorded)

| Case | Observation | Disposition |
|------|-------------|-------------|
| J08 | `400` on school-1 tuition route | By design — school 1 has no tuition capability (feature flag) |
| L03 | `501 pg_authoritative` on admin backup in PG mode | By design — backup served from PG, JSON endpoint disabled |
| F01–F05, G01–G05 | Run-3 harness saw 404s; **manual + fresh-instance re-runs correct** (200 legit / 403 `out_of_scope` / 404 cross-tenant) | Transient harness state — **not a product defect** (re-verified in `idor-evidence-round3b.jsonl`) |
| I18 | teacher-evidence with foreign `teacher_id` → 200 empty | Minor enumeration surface — no data returned; note only |
| I22 | per-case guard → 200 empty | OK (guard works, empty dataset) |
| K01/K03–K05 | sync role/scope denials | Correct (403 `out_of_scope`) |
| W-3b (17→11) | cross-tenant link **creation** denied | Correct — the student-side school check blocks cross-tenant targets |
| W-3g (del 19→11) | destructive del by non-owner denied | Correct (403) |
| SW01–SW12, SW21 | school-intelligence / regional / reports / pull / timeline cross-tenant → 403 | Tenant guard working |
| SW17–SW18 | `/api/public-report` (anon) → aggregates only | No PII — OK |
| L04/L05 | forged `alg:none` JWT → 401; anon legacy → 401 | OK |
| L01/L02 | backup/SMS as manager → 403 | OK (superadmin-only) |
| `delete-account` | self-only (no ID parameter; own-session erasure) | OK |
| bell/now | cross-tenant query → 200 empty (fixture has no bell rows) | Inconclusive — no demonstrated leak; **note:** endpoint has no tenant check visible; verify once bell data exists |
| `subjects`/`announcements` unscoped in pull/bootstrap | `UNSCOPED_PUBLIC_COLLECTIONS` (shared curriculum catalog) | By design (line pull.js:244) — **note:** if announcements ever carry school-specific content, revisit |

## 4. Environment / hardening observations (no defect, evidence recorded)

- **OTP anti-abuse works as designed and persisted:** 5 sends/15 min/phone, 20/day/phone rolling, 60 s cooldown, IP limits, progressive login delay, consumed-code tombstones, origin-IP (anti-hijack) binding — all exercised during the audit; counters persist in Redis across restarts.
- **Sync single-writer mirror fail-closed:** a second app instance attached to the same PG/Redis makes sync ops fail `503 sync_mirror_failed` (no partial state) — correct; note for ops: one writer per mirror.
- **Run-3 F/G 404 anomaly** resolved as transient (not reproducible on two fresh instances) — documented so the gate doesn't chase it.
- **`mapProvinceToken` raw-token fallback** (minor): error message quality when province code is a raw token (static finding, retained from earlier sweep).
- **`server/data/payesh.json`** is a git-ignored generated artifact; the audit instance hydrated 87 collections from PG.

## 5. Deliverables & how to run

| Artifact | Path | State |
|----------|------|-------|
| Consolidated evidence (178 rows, 5 sources) | `/home/user/idor-evidence-consolidated.jsonl` | complete |
| Raw evidence sets | `/home/user/idor-evidence.jsonl` (run-3, 124 cases) · `idor-evidence-round3b.jsonl` (F/G re-run) · `idor-evidence-sync.jsonl` (K matrix) · `idor-evidence-w3.jsonl` (W-3 blast radius) · `idor-evidence-sweep.jsonl` (SW01–26) | complete |
| **Regression pins — unit (CI-safe, no DB)** | `tests/idor-regression.js` | **RED by design: 8 failed / 5 passed** until product fixed |
| **Regression pins — live PG gate** | `tests/idor-runtime.js` | **RED by design: 9 failed / 7 passed** until product fixed (needs `DATABASE_URL` + `REDIS_URL`; single-writer: stop other instances; flush `rate:otp:*` before login-heavy runs) |

Run: `node tests/idor-regression.js` · `DATABASE_URL=… REDIS_URL=… node tests/idor-runtime.js`
Exit codes: 0 = all secure (fixed) · 1 = pinned defect red · 2 = BLOCKED (never green).

**No server code was modified.** Additions to the repo are the two test files only (verified via `git status`).

## 6. Status (per task rule)

**NOT CERTIFIED — CERTIFIED is forbidden for this agent.** Every finding above is evidenced (HTTP status + body + DB state); every PASS in §3 is a runtime observation, not a certificate. This report, the evidence files, and the red regression pins are the **input to the three-AI verification gate** (chatgpt / arena / atriа per `tools/strict-verification-gate.js`).
