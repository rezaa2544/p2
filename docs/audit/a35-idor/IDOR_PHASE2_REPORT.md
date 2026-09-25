# IDOR / Object-Ownership Audit — PHASE 2 (Re-issued) — Findings & Evidence Addendum

**Date:** 2026-09-25 · **Repo pin:** `4bff3bcb757162f040e82ffa26f3d40e46eb7a36` (HEAD at task start; no tracked files modified by this audit — only new `tests/idor-runtime-r4.js` + evidence/harness files)
**Environment:** freshly provisioned `payesh_db_idor` (bootstrap 2026-09-25: PG17 + Redis, 21 migrations, small seed) + idempotent audit overlay (users 16-20, class 5, homeroom T1→class 1, schedule, parent_links 17→6/17→7/19→11, provinces with codes so the tenant guard resolves, office for EO). App runs in **PG-live mode** (production env for the external instance; in-process dev gate for the regression pins).
**Status:** **NOT CERTIFIED** — per standing rule, no CERTIFIED is emitted. Every PASS/finding below is an *input to the three-AI verification gate*. No evidence = no pass.

---

## 1. Scope & Method

Re-issued scope: inventory **all** ID-addressable objects; test **R/W/D × {owner, non-owner, same-tenant, different-tenant, same-school, different-school, different-role}** for: student, parent, teacher, class, homeroom, school, attendance, grades, intervention, reports. Independently reproduce **A-19** and **A-21** from the Atria carry-over register (`docs/audit/ATRIA_PHASE_A_CARRYOVER.md`).

Executed: **126 evidence rows** across 5 tagged sources (`idor-evidence-phase2.jsonl`: run4=83, run4b=22, w2r4=4, ivctl=3, pins-r4=14). Ten live actors (SA, M1/M2 managers, T1/T2 teachers, ST6 student, EO, PA/PB/PC parents) with per-actor IPs; honest sync envelopes (`by` = session id — see §7-O1); every accepted write verified at the PostgreSQL row level; red-by-design regression pins in `tests/idor-runtime-r4.js` (PG gate, in-process server, 14 cases: 6 secure-green / 8 RED at HEAD).

---

## 2. Inventory — every ID-addressable object

| Object | Read by ID | Write by ID | Delete by ID | Notes |
|---|---|---|---|---|
| **student** | `GET /api/v1/students/:id`, `GET /api/students/:id` (legacy) | `PATCH /api/v1/students/:id`; sync `users ins/upd/del` | `DELETE /api/v1/students/:id`; sync `users del` | role=student users |
| **parent** | `GET /api/v1/users/:id` | `PATCH /api/v1/users/:id`; sync | sync `users del` | role=parent users |
| **teacher** | `GET /api/v1/users/:id`; `analytics/teacher-evidence?teacher_id=` | same as parent | same as parent | role=teacher users |
| **user (any)** | `GET /api/v1/users/:id` | `PATCH /api/v1/users/:id`; sync `users *` | `DELETE /api/v1/users/:id`; sync | |
| **class** | `GET /api/v1/classes/:id`, list | `PATCH /api/v1/classes/:id`; `POST /api/v1/classes`; sync `classes *` | `DELETE /api/v1/classes/:id`; sync | model: ins/upd/del = manager, superadmin |
| **homeroom** | `class.homeroom_teacher_id` (in class GET) | via class PATCH/POST (`homeroom_teacher_id` field); sync | via class write | **no referential validation** (A-21) |
| **school** | reports/analytics `?school_id=`; `bootstrap`; `pull` | sync `schools ins/upd/del` | sync `schools del` | no direct REST `/:id` route |
| **attendance** | list `GET /api/v1/attendance` (by student/class/school) | `PATCH /api/v1/attendance/:id`; `POST /api/v1/attendance`; sync | `DELETE /api/v1/attendance/:id`; sync | partitioned PG table |
| **grades** | list `GET /api/v1/grades` | `PATCH /api/v1/grades/:id`; `POST /api/v1/grades`; sync | `DELETE /api/v1/grades/:id`; sync | partitioned PG table |
| **intervention** | `analytics/intervention-warnings?school_id=` (school-level); `store.interventions` read in analytics | sync `discipline ins/upd/del` (model: ins/upd = manager, teacher, SA; del = manager, SA); `interventions` collection **not in model** | sync `discipline del` | value validation requires Gregorian ISO `date` |
| **reports** | `GET /api/v1/reports/{attendance,academic,finance,teachers}?school_id=` | `report_logs` via sync (log-only) | — | |
| **sync conflicts** | `GET /api/sync/conflicts` (session-tenant-scoped) | `POST /api/sync/resolve-conflict` | — | `?school_id` param ignored (session scope applies — safe) |
| **enrollment** | via student/user reads | sync `enrollments ins/upd/del` (manager, SA) | sync | `class_id` field — **A-21 class_id surface** |

Also probed (negative): no REST DELETE on intervention-warnings (404/405); `interventions` sync collection rejected (`unknown_collection`); `?school_id` cross-tenant parameter handling.

---

## 3. A-19 — student-timeline / parent-360 missing `student_id` ownership (INDEPENDENT REPRO — reproduced)

**Register claim (Atria A-19, Medium/authorization):** "student-timeline validates teacher against school but not the requested `student_id`". **≡ phase-1 R-1.**

**Repro (fresh env, current HEAD):**
- `T1 GET /api/v1/analytics/student-timeline?school_id=1&student_id=20` → **200** with full timeline payload (student 20 ∈ class 5; T1 teaches c1-homeroom + c2 — NOT in charge). Evidence `idor-evidence-run4.jsonl#A19-01`.
- `T1 GET /api/v1/analytics/parent-360?school_id=1&student_id=20` → **200** with `student_identity` + `attendance_overview` + parent data. Evidence `#A19-02`.
- Controls: T1→student 6 (taught) 200 (`A19-03`); T2 (diff school)→S1 student 403 `PHASE6_TENANT_ISOLATION_BREACH` (`A19-04`); M2 cross-tenant 403 (`A19-06`); PA→non-child 403 (`A19-08`); PA→own-child 403 **by role gate** (endpoint not parent-surfaced — `SEMANTIC_ANALYTICS_FORBIDDEN`, expected, `A19-07`).
- Regression pins (red by design): `P2-A19a`, `P2-A19b` in `tests/idor-runtime-r4.js` — both FAIL (200 vs expected 403/404) at HEAD.

**Root cause:** `server/routes/semantic-analytics.js:68` `assertCanSeeSchool` — teacher/counselor branch (L88-95) matches **`user.school_id === school_id` only**; the comment claims teaching scope but no class/taught-student check. Used by ~10 reports incl. timeline & parent-360. Tenant boundary is enforced (school mismatch → 403); the **intra-school student boundary is not**.

**Severity:** High (PII: full attendance/grade/discipline timeline + parent-360 of any same-school student to any same-school teacher).
**Minimal remediation:** in the teacher/counselor branch, additionally require the requested student to be in a class where the teacher is homeroom (`classes.homeroom_teacher_id`) or scheduled (`schedule.teacher_id, class_id` ∩ student's `enrollments`).
**Residual risk:** other semantic-analytics reports with the same helper inherit the same gap until the shared helper is fixed (all consumers should be re-swept after the fix).

---

## 4. A-21 — `class_id` / `homeroom_teacher_id` written without sufficient ownership validation (INDEPENDENT REPRO — reproduced, 5 variants)

### A-21.1 `homeroom_teacher_id` — no referential validation (REST, persisted)

| # | Op | Result | Evidence |
|---|---|---|---|
| A21-01 | M1 `PATCH /api/v1/classes/2 {homeroom_teacher_id: 5}` — **cross-school** teacher (5 ∈ S2) on S1 class | **200** + PG: `classes(2).homeroom_teacher_id=5, version=2` | run4 |
| A21-02b | M1 `PATCH /api/v1/classes/2 {homeroom_teacher_id: 20}` — **a student** as homeroom | **200** | run4b |
| A21-03b | M1 `PATCH /api/v1/classes/2 {homeroom_teacher_id: 999999}` — **non-existent user** (dangling ref) | **200** | run4b |
| A21-04b | M1 `POST /api/v1/classes {name, grade, school_id:1, homeroom_teacher_id: 5}` — cross-school homeroom at **create** | **201** (new class with S2 homeroom) | run4b |

**Root cause:** `server/routes/classes.js:223` (`updateClass`) / `:173` (`createClass`): `next.homeroom_teacher_id = body.homeroom_teacher_id ? Number(...) : null` — the referenced user is **never validated** for existence, role (`teacher`), or same-school. Gates that *do* exist and work: role gate (`restWriteRoleOk`, manager/SA only — teacher PATCH → 403 `A21-06`; sync `classes upd` by teacher → `role_denied` op `A21-07b`), scope gate (cross-tenant → 404/out_of_scope `A21-05`, `A21-11b`).

**Severity:** High (integrity: a class can be homeroom-assigned to a student/nonexistent user; cross-tenant teacher reference pollutes teacher-facing data and any homeroom-scoped authorization that trusts this field).
**Minimal remediation:** on write, load `users` row: must exist, `role='teacher'` (or manager), `school_id === class.school_id`, `active`. Apply in both `createClass` and `updateClass` (and the sync mirror path).
**Regression pin:** `P2-A21a` (red at HEAD: 200 vs expected reject; fixture auto-restored).

### A-21.2 `class_id` — cross-tenant enrollment (sync, persisted)

| Op | Result | Evidence |
|---|---|---|
| M1 (S1 manager) sync `enrollments ins {student_id:20, class_id:3, school_id:1}` — enrolls an **S1 student into an S2 class** | **200 ok** + PG row created (`enrollments(19)`: student 20, class 3 (S2), school 1) | run4b `A21-12b`; row verified & cleaned |
| T1 sync `enrollments ins` (any class) | 403 (role: manager/SA only) | `A21-13b` ✓ protected |

**Root cause:** scope check for `enrollments ins` evaluates the **student's/school's** school match (S1=S1 ✓) but the `class_id` foreign reference is never checked against the class's `school_id`. A manager can bind a same-tenant student to a different tenant's class.
**Severity:** High (tenant-boundary data leak/corruption: student appears in another school's class rosters, homeroom scope, attendance/grade joins).
**Minimal remediation:** validate `class_id` exists and `classes.school_id === enrollment.school_id` (and student's school) before commit.
**Regression pin:** `P2-A21b` (red at HEAD: 200/ok vs expected 403; row auto-cleaned).

---

## 5. Phase-1 defects re-verified on current HEAD (fresh env)

| Defect | Re-verification | Result |
|---|---|---|
| **W-1** (High) teacher IEP REST write on non-taught student | `T1 PATCH /api/v1/students/20 {iep_notes:'ROUND4-W1'}` → **200** + PG marker (run4 `ST-09`); pin `P2-W1` red | **REPRODUCED** (students.js:211 teacher-IEP branch; policy.js:306 school-fallback) |
| **W-2** (High) teacher IEP **sync** write on non-taught student | `T1 sync users upd id:20 {iep_notes:'ROUND4-W2'}` (honest `by`) → **200 ok** + PG marker (w2r4 `W2-final`); pin `P2-W2` red | **REPRODUCED on current HEAD** (control: same op on taught student 6 also 200 — code path confirmed, scope check absent) |
| **S-1** (Med, prod-only) parent legacy read 404 | `PA GET /api/students/6` (legacy, prod env) → **404**; app log: `column "parent_id" does not exist` (live PG error in idor.js scope resolution) | **REPRODUCED** (run4b `LG-01`; v1 route `GET /api/v1/students/6` → 200 unaffected — `ST-01`) |
| **S-2** (Med) parent write own child → 404 instead of 403 role | `PA PATCH /api/v1/students/6 {full_name}` → **404 not_found** | **REPRODUCED** (run4 `ST-11`) |

**W-3 (CRITICAL, phase 1)** was not re-probed this phase (forged `parent_links` via sync) — its root-cause files are unchanged at HEAD (`policy.js:213/266`, `idor.js:47`); the honest-`by` envelope (new `forged_by` gate, sync.js:808-812) does **not** touch the parent-tenant exemption at idor.js:47, so the phase-1 result stands as input to the gate. Re-run recommended in the gate round.

---

## 6. NEW defects found this phase

### R-5 (Medium, functional, PG-mode) — attendance CREATE always 503: `late` column missing

- `T1 POST /api/v1/attendance {student_id:6, class_id:1, school_id:1, status:'present', date:'1405-01-03'}` (own homeroom class, all gates passed) → **503 `pg_unavailable`** (run4 `AT-08`; pin `P2-R5` red).
- **Root cause:** `createAttendance` (`server/routes/attendance.js`) builds the record with `late: Number(body.late || 0)`, but the PG `attendance` table (18 cols: `class_id, created_at, date, exit_at, exit_minutes, id, late_at, late_minutes, note, school_id, source, status, student_id, taken_at, updated_at, version, chg_id, deleted_at`) has **no `late` column** → `42703 column "late" does not exist` on every insert (reproduced directly in PG). Schema/model drift: `authz/model.json` attendance fields have `late_at`/`late_minutes`, not `late`.
- **Aggravator (misleading failure):** the route's `catch` returns `pgDown()` — a generic 503 "database unavailable" — with **no logging of the underlying error** (observability blind spot; schema drift indistinguishable from PG outage).
- **Impact:** in any PG deployment, **no attendance record can be created** via REST (partitioned-table path). Memory mode unaffected.
- **Remediation:** map to the existing columns (`late_at`/`late_minutes` or drop `late`) and log the real error instead of `pg_unavailable`.

### R-6 (High, data integrity) — identity-sequence desync ⇒ PK collision ⇒ silent record overwrite

- **Live impact in this audit (self-inflicted, documented):** during the matrix run, `M1 POST /api/v1/students` returned id **20** — colliding with the pre-existing explicit-id fixture user 20 → `ON CONFLICT (id) DO UPDATE` **overwrote user 20** (name→`audit-doomed`), then the owner-DELETE roundtrip **destroyed user 20**. Same for class 5 (create → id 5 → fixture class overwritten). Both required manual restore.
- **Root cause chain:**
  1. `ids.js` `pgNext` (L63-80) uses `nextval()` on the **owned identity sequence** (`users_id_seq` …).
  2. `GENERATED BY DEFAULT AS IDENTITY` sequences are **not advanced by explicit-id inserts** — the standard pattern for seeds/fixtures/restores (including this repo's own overlay workflow; `tools/seed-relational-small.js` resets sequences, but any out-of-band explicit-id insert — DBA backfill, partial backup/restore, multi-instance seeding — leaves the sequence behind).
  3. The forward-sync guard that exists (`bootstrapSeq` → `setval` forward, ids.js:41-54) is **dead code for identity columns** — it only runs in the fallback path when `pg_get_serial_sequence` lookup fails, which it never does for identity PKs.
  4. The insert paths then silently resolve the collision: non-partitioned tables use `INSERT … ON CONFLICT (id) DO UPDATE` (`db.js` `persistOpWithClient`); partitioned tables use UPDATE-by-id-first with a 23505 retry-UPDATE whose comment explicitly documents "last writer wins".
- **Reproduction (deterministic):** insert victim `users(9001)` with explicit id; `setval(users_id_seq, 9000, true)` (simulates lag); `M1 POST /api/v1/students` → 201 with `id=9001` → **victim row now carries the new student's data** (pin `P2-R6a` + `P2-R6b` — RED at HEAD: `victim=R6-NEW-… newId=9001`).
- **Severity:** High — silent destruction/overwrite of arbitrary existing users/classes/attendance/grades whenever the sequence lags the table; no error, no audit trail on the overwrite; a 201 to the client.
- **Minimal remediation:** before `nextval`, ensure `setval(seq, GREATEST(last_value, (SELECT max(id) FROM table)))` (forward-only, idempotent, under the existing advisory lock); reject (not overwrite) on unexpected 23505 for app-created records.
- **Aggravator:** rejected sync ops on non-namespaced collections also **consume ids** from the shared `users` namespace (id allocation precedes the gates) — minor id gaps, but it widens the collision window.

---

## 7. Confirmed-protected surfaces (matrix summary — current HEAD)

| Surface | Probes (evidence ids) | Result |
|---|---|---|
| Tenant isolation, reports | `SC-01`, `RP-01` (M2→S1) | 403 `PHASE6_TENANT_ISOLATION_BREACH` ✓ |
| Tenant isolation, semantic analytics | `A19-04/06/10` | 403 same code ✓ |
| Student REST R/W/D | `ST-01…ST-15`, `ST-16b/17b/18b` | non-owner 404, cross-tenant 404, role gates 403, owner create→delete 200 ✓ (write-side defects = W-1/W-2, §5) |
| Parent/teacher (users) R/W/D | `US-01…US-13` | cross-tenant 404, self 200, IEP-on-parent **403** (`US-09` — W-1 family does not extend to non-student records) ✓; manager PII field `job` → `field_denied` (`US-08`, recorded); manager parent-delete 200 = **by design** (model `users.del = manager, superadmin`) — `US-13` |
| Class role gate | `A21-06` (REST 403), `A21-07b` (sync `role_denied`) | ✓ teacher cannot write class metadata |
| Class cross-tenant R/W/D | `A21-05/10/11b` | 404 / 404 / 403 `out_of_scope` ✓ |
| School W/D cross-tenant (sync, honest by) | `SC-04b/05b/06b` | 403 `out_of_scope` ×3 ✓ |
| Attendance R/W/D scope | `AT-01…AT-07` | own-class 200 (control), non-taught 403 `out_of_scope`, cross-tenant 404, student-role 403 ✓ (create defect = R-5) |
| Grades R/W/D scope | `GR-01…GR-06` | same pattern, all ✓ |
| Intervention/discipline | `IV-01b` (non-taught 403), `IV-03b` (cross-tenant 403), `IV-04b` (`interventions` → `unknown_collection`), `IVCTL-1` (owner ins → 200 ok + PG row), delete requires `base_version` (OCC) | authz ✓; W-path works for in-scope owner |
| Sync conflicts list | `CF-01…CF-05` | 3 S1 conflicts exist; S2 manager sees **none** (tenant-scoped SQL `school_id = $1`), explicit `?school_id=1` ignored (session scope — no leak) ✓ |
| Sync envelope integrity | run4 `A21-07/11/12/13, SC-04/05/06, IV-01…04` (no `by`) | all 403 `forged_by` — the new `by`≠session gate works (sync.js:808-812) ✓ (see O1) |
| OCC | `A21-02/03/08` → 409 + `sync_conflicts` rows (ids 16-18) ✓ |
| WAF/auth basics | (phase-1 L04/L05 pattern unchanged) | n/a this phase |

**Controls (green in pin file):** cross-tenant report 403, parent→non-child 404, parent→own-child 200, teacher class-write 403.

---

## 8. Observations (not counted as defects)

- **O1 — `by` envelope is mandatory & checked:** any sync op without `by` (or with `by`≠session) is rejected `forged_by` before any gate. All phase-2 sync probes used honest `by` values; the run-4 batch without `by` proved only the envelope gate (its "403" rows are **not** authz evidence and are tagged as such in the jsonl).
- **O2 — id consumption before gates:** non-namespaced collections (e.g. `discipline`, `enrollments`) allocate from the shared `users` id namespace before field/scope gates → rejected ops consume ids (R-6 aggravator).
- **O3 — `resolve-conflict` NULL-school edge:** manager cross-tenant guard (conflicts.js:118-120) is skipped when `c.school_id IS NULL` — any manager could adjudicate a school-less conflict row. No NULL-school rows are produced by current code paths; register as edge for the gate.
- **O4 — bootstrap/JSON-store interaction:** `keepBootstrap` (index.js:280-295) seeds PG **from the JSON store** when PG is empty and the store has users. A stale `payesh.json` (this workspace carried the 09-24 phase-1 store) would be mirrored into a fresh PG — env-hygiene risk for reproducible fixtures. This phase's PG was pre-seeded, so the guard did not fire.
- **O5 — WAF in report mode** at boot (`PAYESH_WAF_MODE=report`) — pre-existing, out of scope.
- **O6 — `discipline.date`** must be Gregorian ISO (validate.js "reasonable year") — fixture dates like `1405-01-01` are rejected for sync writes (`bad_date`); REST paths accept Jalali strings. Inconsistent date contract (minor).

---

## 9. Bug packages (register DoD: repro → root cause → remediation → regression → executed result)

All packages: HEAD `4bff3bcb`, environment `payesh_db_idor` (fresh bootstrap + overlay), PG-live mode, executed 2026-09-25, evidence in `idor-evidence-phase2.jsonl` (tagged rows) + pin file `tests/idor-runtime-r4.js` (exit 1 = red, as expected while unfixed).

| ID | Sev | Title | One-line repro (actor, op, expect vs actual) | Root cause | Minimal remediation | Regression pin |
|---|---|---|---|---|---|---|
| A-19 | High | timeline/parent-360 missing student_id scope | T1, timeline s1/student20 (non-taught): deny vs **200+payload** | semantic-analytics.js:68 L88-95 school-only | taught-student check in teacher branch | P2-A19a/b (RED) |
| A-21.1 | High | homeroom_teacher_id unvalidated (4 variants) | M1, class PATCH homeroom=5 (S2 teacher)/20 (student)/999999: reject vs **200+PG** | classes.js:223/:173 no referential check | validate ref user exists/teacher/same-school/active | P2-A21a (RED) |
| A-21.2 | High | cross-tenant class_id on enrollment | M1, sync enr ins student20→class3 (S2): deny vs **200 ok+PG row** | scope checks student/school, not class ref | validate class.school_id == enrollment.school_id | P2-A21b (RED) |
| W-1 | High | IEP REST write non-taught (re-verified) | T1, students PATCH 20 iep: deny vs **200+PG** | students.js:211 + policy.js:306 | same as phase-1 package | P2-W1 (RED) + phase-1 pins |
| W-2 | High | IEP sync write non-taught (re-verified on HEAD) | T1, sync users upd 20 iep: deny vs **200 ok+PG** | sync users-upd IEP path lacks taught check | same as phase-1 package | P2-W2 (RED) + phase-1 pins |
| R-5 | Med | attendance CREATE 503 in PG mode (schema drift + swallowed error) | T1, attendance POST (own class): 201 vs **503 pg_unavailable** | route writes `late`; table has `late_at`/`late_minutes`; pgDown() hides 42703 | align columns + log real error | P2-R5 (RED) |
| R-6 | High | sequence desync → PK collision → silent overwrite | setval lag + create student: fresh id vs **id=9001, victim overwritten** | pgNext nextval w/o max(id) guard; bootstrapSeq dead for identity; ON CONFLICT/23505-retry overwrite | forward-only setval guard + reject on 23505 | P2-R6a/b (RED) |

**Residual risk (all):** fixes must be validated across REST + sync + the partitioned-table paths; A-19's shared helper affects ~10 reports; R-6 affects every identity namespace (users/classes/attendance/grades) and every deployment that ever seeds explicit ids.

---

## 10. Verification gate inputs

- Pin command: `DATABASE_URL=postgres://… REDIS_URL=redis://… node tests/idor-runtime-r4.js` — exit 1 expected while defects present (8 RED / 6 green). Pre-run: flush `payesh:otp:state` + `rate:*` (cooldown 429s); single-writer on the DB.
- Raw evidence: `idor-evidence-phase2.jsonl` (126 rows, 5 sources) + per-run files.
- Environment re-provisioning: `bash /home/user/env-bootstrap.sh payesh_db_idor` + overlay (idempotent SQL embedded in the pin's `ensureFixture()`).
- **No CERTIFIED. All results above are inputs to the three-AI verification gate only.**
