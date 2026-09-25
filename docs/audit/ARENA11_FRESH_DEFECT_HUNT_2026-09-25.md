# Arena 11 — Fresh Defect Hunt (Independent Report)

**Independent of all other Arena reports.** Every claim below was reproduced live at current HEAD against real PostgreSQL 17 + Redis 8 (production mode). No historical evidence was trusted; no grep-only conclusion; no mock; no `CERTIFIED`.

---

## 1. Exact current HEAD

| Item | Value |
|---|---|
| HEAD commit SHA | `66928be6227567f3d92b2c93a2d5f8146a4601b8` |
| `origin/main` (live) | `66928be6227567f3d92b2c93a2d5f8146a4601b8` — **HEAD == live main** |
| Commit time | 2026-09-23 16:57:54 +0330 |
| Working tree | `server/`, `migrations/`, `tests/` **byte-identical** to HEAD. The only tracked diffs are exec-bit/mode artifacts on `infra/`, `tools/`, `monitoring/` (snapshot chmod noise, zero content change). **No repository code was modified by this review.** |
| Runtime | PostgreSQL 17.11 (isolated `initdb`/`pg_ctl`), Redis 8.0.2, Node 22.21.1, `PAYESH_ENV=production` + `NODE_ENV=production` + `DATABASE_URL` + `REDIS_URL`. SMS gateway stubbed only (`PAYESH_SMS_PROVIDER=mock`, the code's own contract). |

---

## 2. Fresh findings (not in the A-30..A-39 / prior-Arena set)

Five new defects were found, all distinct from the previously reported set (A–E). Verified-control results were recorded and are **not** re-reported as defects.

| # | Severity | Finding |
|---|---|---|
| **F1** | **P0** | First-boot bootstrap (empty PG + JSON store) silently drops 14,370 rows, leaves identity sequences at `1`, and the **first `create()` silently OVERWRITES seed row id=1 (the superadmin) via `ON CONFLICT (id) DO UPDATE` upsert. |
| **F2** | **P1** | Legacy `GET /api/students/:id` is **dead for parents in PG mode** — scope resolution queries a `users.parent_id` column that does not exist → parent's own child returns 404 while `/api/v1/students/:id` returns 200. |
| **F3** | **P1** | `GET /api/v1/pull?collections=parent_links` returns the **full cross-school family adjacency (527 rows)** to *any* authenticated role (student, teacher, parent) — tenant isolation + sensitive-PII leak. |
| **F4** | **P1** | Analytics **region-branch guards skip the manager check** (`quality-governance`, `longitudinal-intelligence`): a school-1 manager reads district-11 aggregates with `200`, while the `school_id=3` branch correctly returns `403`. |
| **F5** | **P1** | The outer **province guardrail locks out the entire `edu_office` role** from every `/api/v1/*` endpoint (`403 تخطی از حریم استانی`) — province is derived only from `school_id`, never from `office_id`. |
| — | (controls) | Passed and recorded as not-defects: regional-intelligence manager-deny, reports scoping, admin backup/restore fail-closed, `/metrics` bearer gate, phase5/canary role gates, sync-conflict scoping, stale-PATCH OCC, public-report no-PII. |

Findings **A–E** of the prior runs (SMS mirror schema drift, cross-restart duplicate SMS, delegated-permission flags lost, health/readiness divergence, no `commandTimeout`/`statement_timeout`) were re-checked at HEAD and are **unchanged** — they are out of scope here and not duplicated.

---

## 3. Reproduction evidence (first-hand, live)

Environment before each run was a **fresh empty PostgreSQL** (only `schema.sql` + migrations) unless noted.

**F1 — bootstrap data loss + superadmin overwrite**

1. Boot log (server's own message):
   `[store] PG is empty and a bootstrap JSON store is present — hydration SKIPPED (P0-BUG-04 guard); seeding PG from the bootstrap store now (one-time)...`
   `[store] bootstrap→PG seed done: 19319 row(s) / 70 table(s) — skipped 14370 non-mappable row(s)`
2. Table counts after boot: `users=1040/1040`, `attendance=10460`, **`classes=0`, `grades=0`**.
3. Identity sequences all left at `last_value=1, is_called=false` (`users_id_seq`, `classes_id_seq`, `attendance_id_seq`).
4. `POST /api/v1/users {full_name:'مهاجم', role:'teacher'}` (manager) → **`201 {id:1}`**, and PG row id=1 changed from `مدیر کل سامانه|superadmin|09999838444` to `مهاجم|teacher|09990000001` — **total row count stayed 1040 (overwrite, not insert).**
5. Second create → `201 {id:2}` overwrote seed manager id=2 (`حسین هاشمی` → `ا_2|teacher`).
6. Original superadmin and manager creds both fail afterward (manager id=2 → `429`). **No error is emitted at any step.**

Skip root causes were reproduced in isolation:
- `INSERT INTO classes … grade='دهم'` → `ERROR: invalid input syntax for type integer` (schema `grade INTEGER`; seed JSON holds `grade:'دهم'`, a Persian text). Classes (36 rows) are lost because **every** row carries this value.
- `grades` table is **partitioned** (`grades_y2026`) with composite PK `(id, created_at)`: the per-row fallback `ON CONFLICT (id) DO UPDATE` → `ERROR: no unique or exclusion constraint matching the ON CONFLICT specification`. Grades also FK-reference `classes`, already emptied by the classes failure.

**F2 — legacy parent IDOR dead in PG mode**

- Parent 17 → `GET /api/students/16` (own child) → **`404 not_found`**; same parent → `GET /api/v1/students/16` → **`200`**.
- API log: `[POLICY] PG parent_links query failed: column "parent_id" does not exist` and `[IDOR] PG scope resolution failed: column "parent_id" does not exist`.
- Schema: `public.users` has no `parent_id` column (no migration adds one); `policy.resolveStudentScopeOpts` parent branch executes `SELECT id FROM users WHERE role=$1 AND parent_id=$2`, which throws in production.

**F3 — pull leaks family adjacency**

With seeded PG, authenticated requests to `GET /api/v1/pull?collections=parent_links`:
- **student** → `200`, `rows_exposed=527`; **teacher** → `200`, `rows_exposed=527`; **parent** → `200`, `rows_exposed=527`.
- Sample row delivered to a student: `{"parent_id":17,"student_id":16,"relation":"پدر"}`.
- Control: the same route scopes `schools` correctly (`manager pull schools → [1]`), proving the scope filter works for `school_id`-tagged collections but **not** for `parent_links`.

**F4 — manager reads other districts**

Manager of school 1 (school-3's district = 11):
- `quality-governance?school_id=3` → **403** (control); `quality-governance?region_id=11` → **200** `{scope:'district', summary:{region_id:11, total_schools_evaluated:1, …}}`.
- `longitudinal-intelligence?entity_id=3&entity_type=school` → **403** (control); `entity_id=11&entity_type=region` → **200** `{trend_map:{region_id:11,…}}`.
- Control `regional-intelligence?region_id=11` → **403** `REGIONAL_TENANT_ISOLATION_VIOLATION: role manager is not authorized to access regional network`.

**F5 — edu_office global lockout**

`edu_office` id=1027 (`office_id=1`, office `province_id=1` «کردستان», `school_id=null`) logs in `200`, then every `/api/v1/*` probe returns **403** `PHASE6_TENANT_ISOLATION_BREACH` / `تخطی از حریم استانی`:
`bootstrap`, `students`, `reports/attendance?school_id=1`, `analytics/school-intelligence?school_id=1`, `analytics/regional-intelligence?region_id=1`, `pull?collections=schools` → all 403. The analytics guards themselves model edu_office access (region match), proving the lockout contradicts the intended role contract.

---

## 4. Root cause

**F1.** `server/index.js` first-boot guard keeps the JSON bootstrap and calls `seedPgFromBootstrap()`, which (a) inserts **explicit-id rows but never advances the sequences** (`setval`) — unlike the repo's own `tests/chaos-drill-lib.js::seedPg` and `tools/w18-load-pg.sh`, which both call `setval(pg_get_serial_sequence(…), MAX(id))`; (b) performs **no type coercion** on `_id`/typed columns (e.g. `classes.grade` INTEGER vs seed `'دهم'`); and (c) **swallows every per-chunk / per-row failure into a `skipped` counter** — fail-silent. On the next create, `ids.nextId → pgNext → nextval(users_id_seq)` returns `1`, and `db.persistOpsBatch` `ins` runs `INSERT … ON CONFLICT (id) DO UPDATE` (an upsert), which **overwrites** the live row id=1 while the REST handler reports `201`.

**F2.** `policy.resolveStudentScopeOpts()` parent branch queries `users.parent_id`, a column that exists only in the JSON store, not in the PG schema (`server/schema.sql`; no migration adds it). `idor.js` treats the failure as fail-closed `404` (log-only), masking the drift. The `/api/v1/*` resource block reaches the same gate through a different (hydration-limited) path, which is why the two surfaces diverge.

**F3.** `pull.js` allows any store-backed collection (`targetCols = requestedCols.filter(c => store[c] != null || ALL_COLLECTIONS.includes(c))`) and `filterCollectionForSession` has no `parent_links` branch, so the default branch `r.school_id == null || r.school_id === schoolId` passes all 527 school-less rows for every role.

**F4.** `enforceQualityGovernanceAccessGuard` / `enforceLongitudinalAccessGuard` only check the manager **when `targetSchoolId != null`**; the `region_id` branch validates `edu_office` and `superadmin` but returns `true` for a manager. The outer `assertTenantBoundary` does not compensate (see below).

**F5.** The `/api/v1/*` pre-guard derives the actor's province only from `actor.school_id` (inline block + `resolveActorProvince`), never from `office_id`; for `edu_office` (`school_id=null`) `province_code` stays undefined, `effProv` falls back to `'07'`, and `assertTenantBoundary` fail-closes with “unknown actor province + explicit target = breach” → every v1 request 403s.

---

## 5. Severity (evidence-based)

- **F1 — P0.** Silent corruption of the primary identity (superadmin) + partial data loss (classes/grades) on the sanctioned first boot. The failure is silent (`201` + no error), the exact fail-silent/false-green pattern. A fresh `PAYESH_STORE` + fresh PG (the documented deployment-adjacent path) reaches it automatically.
- **F2 — P1.** Correctness/availability regression: parents cannot see their children through the legacy surface in any real PG deployment; no security bypass, but a contract-breaking schema drift that self-logs and returns 404.
- **F3 — P1.** Tenant isolation + sensitive-PII leak: any authenticated principal enumerates the parent↔student adjacency across all schools.
- **F4 — P1.** Tenant isolation breach: a manager can read district/region scopes outside their school. Payload is aggregate/simulated today, but the boundary contract is broken.
- **F5 — P1.** Fail-closed overreach: the whole `edu_office` role is non-functional under PG, contradicting the role model that authorizes it. Not a bypass, but a silent environment-difference outage.

---

## 6. Fix (safe, minimal, reviewer-side only — NOT applied)

1. **F1:** after `seedPgFromBootstrap` (and any explicit-id seeding), advance every identity sequence: `SELECT setval(pg_get_serial_sequence(T,'id'), COALESCE(MAX(id),1)) FROM T`. Coerce/deny values before insert (reject non-integer `grade`/typed columns rather than silently dropping the row), and **surface `skipped` as a loud error or hard fail** in production. Most importantly, the `ins` upsert `ON CONFLICT (id) DO UPDATE` should never silently overwrite — prefer `ON CONFLICT (id) DO NOTHING RETURNING id`, and 409/error when no id was assigned.
2. **F2:** drop or gate the `users.parent_id` query in `resolveStudentScopeOpts` (the parent branch already builds child ids from `parent_links`; the `users.parent_id` leg is legacy-only and should be removed or degraded to a no-op so the `parent_links` leg is authoritative).
3. **F3:** add a `parent_links` branch to `filterCollectionForSession` (manager/school: links whose students belong to own school; parent: own `parent_id`; student: self; others: empty) **and** remove `store[c] != null` as a servability criterion so unauthorized collections cannot be pulled at all.
4. **F4:** in each analytics guard, mirror the manager school-branch check into the region branch (manager with a `region_id` target → deny, as `regional-intelligence` already does), or run `assertTenantBoundary`-equivalent province/school checks for region targets.
5. **F5:** in the `/api/v1/*` pre-guard and `resolveActorProvince`, resolve province for `edu_office`/office-scoped roles from `office_id → offices.province_id` (the offices record already carries it), and pass the correct province into `assertTenantBoundary`.

---

## 7. Regression (how each fix should be regression-pinned)

1. **F1:** boot empty-PG+JSON → assert `classes=36`, `grades=12555`, `MAX(id)` == next `nextval`, and first `POST /api/v1/users` inserts (not overwrites) with id > MAX. Assert no “non-mappable” rows.
2. **F2:** parent role → legacy `/api/students/<ownChildId>` returns 200 in PG mode and equals `/api/v1/students/:id` behavior.
3. **F3:** for student/teacher/parent roles assert `parent_links` exposure is 0 / own-only; snapshot the default-branch behavior for every collection not in `ALL_COLLECTIONS`.
4. **F4:** manager with `region_id`/`entity_type=region` must 403 on all analytics routes (parity with `regional-intelligence`).
5. **F5:** edu_office via office-scoped routes returns non-403 (200/404 by contract) for its own province; cross-province still 403.

---

## 8. Unresolved risks

- **Bootstrap data loss is silent.** Any operator who boots the shipped JSON store against a fresh PG loses most academic data (classes/grades) with no error — only a boot log line mentions “14,370 non-mappable rows”. This is the worst-form of fail-silent.
- **F1 is latent beyond bootstrap.** Any future explicit-id seeding that omits `setval()` will silently upsert-overwrite live rows on the next create — the `ON CONFLICT (id) DO UPDATE` upsert is a loaded footgun for id-generation drift.
- **Guardrail composition.** The outer `/api/v1/*` province guardrail both silently denies legitimate roles (F5) and is bypassable on region-targeted analytics routes (F4) — two opposite-direction failures from one design.
- **pull default-branch scope.** `filterCollectionForSession`'s default `school_id == null || …` may expose other school-less collections beyond `parent_links`; not exhaustively enumerated here.

## 9. Files changed

**None** — no repository code, tests, or configuration were modified. Reviewer artifacts added to the workspace only:
`arena-hunt2-probe.js`, `arena-hunt2b-probe.js`, `arena-hunt3-idseq.js`, `arena-hunt4-bootstrap.js`, `arena-hunt5-overwrite.js`, `arena-hunt6-cascade.js`, `arena-hunt7-pull-idor.js`, `arena-hunt8-grades.js`, `arena-hunt9-boot2.js`, `arena-hunt10-eduo.js`, `arena-hunt11-eduolock.js`, `arena-hunt12-skip.js`, `arena-hunt13-gradesroot.js`, `arena11-fresh-hunt-evidence.json`.

## 10. Commit SHA

`66928be6227567f3d92b2c93a2d5f8146a4601b8`
