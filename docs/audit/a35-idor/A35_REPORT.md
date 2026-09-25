# A-35 — Authorization Bypass / Data-Leak Audit (A-AUTHZ-03/04/05)

**Date:** 2026-09-25 · **PIN (reviewed):** `4bff3bcb757162f040e82ffa26f3d40e46eb7a36` · **Fix commit on GitHub:** `e05d021` on base `2baa7c1` (remote had advanced past the PIN before push; A-35 files unchanged upstream, fix re-verified 15/15 on the new base) · **Audit bundle commit:** `31145f0` · **Branch:** `main`
**Method:** static mapping (policy.js/sync.js/auth.js/index.js/model.json) → live runtime proof (2-school fixture, 20 users, PG+Redis, prod env) → reproduce → fix → red→green regression → adversarial retest.
**Status:** 4 confirmed defects (1 CRITICAL, 2 MEDIUM, 1 LOW functional) — **all fixed, all regression-pinned, adversarially retested.** Not a certification; feeds the 3-AI verification gate.

---

## 1. Exploits (live, pre-patch, at PIN)

### A35-P1 — CRITICAL — Cross-tenant parent link forge + reassignment (W-3 alive at HEAD)
- **Vector 1 (manager ins):** `POST /api/sync` as M1 (S1 manager): `parent_links ins {parent_id:19 (S2), student_id:6 (S1)}` → **200 op=ok** (evidence `idor-evidence-a35-main.jsonl` A35-31).
- **Vector 2 (parent upd, NO manager needed):** `parent_links upd {id:<own child link>, parent_id:19}` as PA (S1 parent) → **200 op=ok** (round2 A35-36f).
- **Effectiveness (post-restart/store hydration):** S2 parent PC reads S1 student:
  `GET /api/v1/users/6` → **200** `{"id":6,"full_name":"دانش‌آموز 1-1","role":"student","school_id":1,"active":true}` (A35-33r, A35-36g); original parent PA → **404** (access *lost*, A35-36h). Same-school cross-family transfer (17→18) also accepted (A35-36r).
- **Bounded (verified):** legacy `/api/students/:id` 404 in prod (S-1 `users.parent_id` missing column fails closed; would leak in non-prod); `grades?student_id=` / `attendance?student_id=` are PG-SQL school-scoped → empty; analytics timeline → 403.

### A35-P2 — MEDIUM — Foreign class/teacher references accepted (integrity)
- `attendance ins {student_id:20 (S1), class_id:3 (S2), school_id:1}` → **200 ok** (A35-20; row verified in PG, id 52).
- `grades ins {student_id:20, class_id:3, school_id:1}` → **200 ok** (A35-21r).
- `schedule ins {teacher_id:4 (S1), class_id:3 (S2), school_id:2}` → **200 ok** (A35-10r); reverse `teacher_id:5 (S2) → class_id:1 (S1)` → **200 ok** (A35-23r).
- **No read/write escalation (proven, incl. post-hydration):** T1 scope probes on c3 all 404/empty (classes/:id, classes list, students list, students/:id, attendance/grades lists, hw 404, report 403); T1 writes on S2 rows → 403 out_of_scope. Foreign rows are inert cross-tenant data-integrity violations (list reads are school-filtered, A35-20b: row invisible to S2 teacher).

### A35-P3 — MEDIUM — Phone format variants split SMS rate buckets
With `PAYESH_SMS_PHONE_LIMIT=2`: base form `09121000010` exhausts (3rd send → **429**), then variants `+989121000010`, `00989121000010`, `9121000010` each → **200 (sent)** — fresh bucket per raw-string form (A35-50/51). Per-phone send limit + 24h daily cap bypassable with N format variants (SMS-bomb/availability). **No auth bypass:** code hash binds to raw phone → cross-format code replay impossible (login user-lookup already uses tail-10).

### A35-P4 — LOW (functional) — NULL-school self-read broken
`GET /api/v1/users/16` as EO (edu_office, school NULL) → **404** (readOk null-school check precedes self check).

## 2. Root causes
1. **P1:** `parent_links` not in `OWNERSHIP_KEYS` (sync.js) → parent `upd` passes fieldGate with `parent_id` mutable; `inScope` (policy.js) resolves school only from student→enrollment→class, **never checks the parent's school**; parent read paths (`readOk` users branch, `studentRecordOk`) use `childrenOfParent` with **no school anchor**. Plus: in-memory store hydration lag makes grants effective after any restart (stale-state = fail-closed, which is why same-session reads 404 until hydration).
2. **P2:** `inScope` validates only the row's primary scope (`data.school_id` / student chain); secondary referents (`schedule.teacher_id`, `grades/attendance.class_id`) are FK-valid but cross-tenant-unchecked. ("valid FK ≠ authorization" violated.)
3. **P3:** `apiSendCode`/`apiLogin` build cooldown/code/rate keys from the **raw** phone string (`cd[phone]`, `codes[phone]`, `rateLimit identifier`, `sha256(code+'|'+phone)`), while user resolution uses tail-10 → same human, N buckets.
4. **P4:** `readOk` users directory: `if (rec.school_id == null) return false;` before any self check.

## 3. Patch (commit `b3833a4`, 3 files, +245/−6)
- `server/policy.js` `inScope` (manager branch): **parent_links** — effective parent (data or rec) must be a known parent with school == student's school, checked **before** the `s==null` student fallback (which early-returns for school-less collections); **schedule** — teacher.school == class.school == row school (row school = stamped or class-derived, else reject); **grades/attendance** — class.school == student.school (fallback: row school). Teacher branch (depth): hw/vclass class.school == teacher.school; student-based writes require student.school == teacher.school (defeats forged-schedule expansion even after hydration). Parent branch: `parent_id` in `parent_links` data must equal the parent's own id (ins **and** upd → reassignment blocked); student school anchored.
- `server/policy.js` `readOk`/`studentRecordOk`: parent read paths anchored on session school (pre-patch forged data cannot grant reads); users directory: self-read allowed (fixes P4).
- `server/auth.js`: `canonicalPhone()` (digits, tail-10) applied at both `apiSendCode` and `apiLogin` entry for all auth keys + code hash → one phone = one bucket.
- `tests/a35-regression.js`: 15 live pins (8 SEC exploit-rejections incl. canonical-bucket + OTP single-use; 7 CTRL legitimate operations).

## 4. Regression (red → green)
- **RED (unpatched, fresh fixture, unique uids):** `5 PASS, 9 FAIL` — SEC-1/2/4/5/6 (accepted 200 ok), SEC-7 (bucket split), SEC-3 (reassignment accepted), CTRL-6 (404).
- **GREEN (patched, same pins):** **`15 PASS, 0 FAIL, 0 SKIP`** — re-verified on the exact committed code (`git diff b3833a4 -- server/policy.js server/auth.js` = empty).
- No fake green: SKIPs counted separately (0); expectation corrections (sync batch 200+op-level `role_denied` = legitimate denial) documented per probe.

## 5. Adversarial retest (patched build, full matrix)
- **main (37 probes):** all exploit ops rejected `403 out_of_scope`; no chain executed; stale-role downgrade → immediate 403/404 (PG session re-read); stale OCC 409; OTP replay 401; uid replay `duplicate_ignored`; logout invalidation 401. Residual MISMATCHes = known harness expectation-model items (200+role_denied; OTP stale-state artifact — standalone repro: 200→401 ✓).
- **round2:** A35-10r/21r/23r/36r/36s → all **403 out_of_scope**; link state unchanged (17→6).
- **round3:** foreign schedule ins → 403; cross-tenant reassignment → 403; post-hydration reads clean.
- **phone (limit=2):** variants after exhaustion → **429** (was 200).
- **Repo suites:** `p11-phone-auth` 21/0 ✅; `check-authz` 6/0 ✅; `phase-b-tenant` (21/7) and `reports-tenant-isolation` (7/4) red sets **byte-identical on unpatched HEAD** → pre-existing, not patch-induced.

## 6. Verified controls (no bypass found)
teacher A→B (reads 404, writes 403/404); manager A→B (`out_of_scope`/403); foreign-teacher row inert post-hydration (all T1 c3 surfaces 404/empty); EO geometry (S2 notifications 403); NULL-school directory (404 to others, 403 role-gated writes, own-office writes OK); parent grades/attendance lists SQL-scoped (empty); timeline 403; session/OTP/uid/OCC replay & staleness all fail-closed.

## 7. Evidence
- `/home/user/idor-evidence-a35-main.jsonl` (round 1, 40 probes) · `idor-evidence-a35-round2.jsonl` (16) · `idor-evidence-a35-round3.jsonl` (7) · `idor-evidence-a35-phone.jsonl` (pre-patch 200-variants) + post-patch 429 output captured in session log.
- Repro fixtures: `a35-overlay.js` + `env-bootstrap.sh` (rebuild ~25s). Harnesses: `idor-a35-{main,round2,round3,phone}.js` (all uid-per-run, OTP injection via Redis `payesh:otp:state` with canonical keys).
- Commit: `b3833a4e017f97fd0a9bd9e10f67a3f2dca492cc` on `main` (parent `4bff3bcb…`). Working tree additionally holds prior-session obs/audit files (uncommitted, untouched by this commit).

## 8. Push confirmation (GitHub)
- Pushed 2026-09-25: `2baa7c1..31145f0 main -> main` (https://github.com/rezaa2544/p2).
- Fix commit `e05d021` (server/policy.js +62/−6, server/auth.js +14/−2, tests/a35-regression.js +175) — same content as the local pre-push commit `b3833a4`, new SHA because it was re-based onto the advanced remote tip `2baa7c1` (12 upstream commits; none touched the A-35 files or the inScope call path).
- Audit bundle `31145f0`: 22 files (+2541) under docs/audit/a35-idor/ + 3 IDOR runtime harnesses in tests/.
- Regression re-run on the pushed base: **15 PASS / 0 FAIL / 0 SKIP** (live app, PG+Redis, prod env).
