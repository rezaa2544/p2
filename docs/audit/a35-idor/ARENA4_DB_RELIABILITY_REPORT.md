# Arena 4 — Database Reliability Auditor — Report

**Target:** `rezaa2544/p2` @ `main`, HEAD `ecc8b40b` (clean tree; no project code modified — read/execute/diagnose only)
**Environment (E3, integrated/local):** PostgreSQL 17 (:5432, scratch DBs `payesh_db_audit{,2,3,4}`), Redis 8 local, Node 22.23.1, schema built by repo's own `tools/migrate-ledger.js` + `tools/seed-relational-small.js`, bulk-loaded 2,015 users / 120,030 grades / 60,050 attendance for index & concurrency workloads. All scratch DBs dropped after the audit; tree left clean.
**Scope honored:** transaction boundary, rollback, atomicity, isolation, race condition, duplicate writes, migration safety (apply/rollback/reapply), index usage. Five passes: Functional / Boundary / Failure / Recovery / Regression.

---

## 1. Database Findings

### F-DB-01 — Lost update + false success ack on the `/api/sync` write path (OCC TOCTOU)
- **What:** The server-side optimistic-concurrency guard for sync updates is a **read-then-write check in separate transactions**, and the final PG `UPDATE` is **unconditional** (last-writer-wins, no row-count check). Two concurrent writers with the same `base_version` can **both** be acked `200 ok:true` while one write is silently discarded; a concurrent `del` can erase an `upd` that was also acked `ok:true`.
- **Root cause (exact):** `server/sync.js:1089` builds the mirror op as `mirror.push({ uid: op.uid, c: op.c, t: 'upd', data: rec })` — it **drops `base_version` and `id`**. Consequently in `server/db.js:755-770` the conditional branch (`UPDATE … WHERE id=$n AND version=$base` + `rowCount===0 → occ_conflict/409`) is **unreachable on the sync path**; execution always falls to the **unconditional LWW UPDATE at `db.js:779` with no `rowCount` check**. The pre-check at `sync.js:913-925` (fresh `db.readOne` → compare `base_version` vs current) is the *only* guard, and it is a textbook TOCTOU window.
- **Consequence:** offline-first clients (the product's core model) get a **protocol lie**: ack ≠ persisted state. A client that "won" its write may have been overwritten, and a client whose record was deleted still sees success. No `sync_conflicts` row is written (the check passed), so the built-in conflict machinery never fires.
- **Severity driver:** this is the app's primary write path; multi-client editing of the same student/profile is a normal scenario.

### F-DB-02 — Non-atomic migration-ledger window; canonical runner dead-ends on 012 crash recovery
- **What:** **All 20** up-migrations contain an internal `COMMIT`, so `tools/migrate-ledger.js` takes the `hasInternalTx` branch and appends the ledger `INSERT` as a **separate transaction after the migration commits** — a crash between the two leaves the migration **applied but unrecorded**.
- **Recovery behavior differs per migration:** idempotent ones self-heal (empirically verified for 001 and 004: re-run is a no-op, then recorded, exit 0). Migration **012** (partitioning + data move — the heaviest) **intentionally refuses re-apply** with a fail-fast `ALREADY_APPLIED` guard at the top of the file (zero side effects — DB state stays consistent), and the 012 header documents that only `tools/seed-relational-small.js:143` tolerates that sentinel. **`tools/migrate-ledger.js` does not** → `up` exits 1 with `MIGRATION_EXECUTION_FAILED`, the ledger row is never inserted, and the runner is **stuck until manual ledger repair (INSERT) or down+up**.
- **Risk:** a process death inside 012's window (the one migration that is *not* safely re-runnable) is an operator-intervention event on the authoritative tooling.

### F-DB-03 — Client-data errors surface as 503 `sync_mirror_failed`
- **What:** a sync op that violates a DB constraint (FK, unique) is caught by PG inside the atomic batch → batch rolls back (no orphans — verified) → but the HTTP status is **503** (retry semantics) rather than a 4xx/409 conflict. Because the failed uid is left unmarked (by design, `sync.js:1209+`), the client's retry replays and **503s again indefinitely** until the payload is fixed — the client cannot distinguish transient from permanent failure from the status line.
- **Impact:** data integrity is safe; error semantics/observability are wrong.

### F-DB-04 — Outbox: no-handler events stranded in `processing` forever, invisible to health
- **What:** the batch claim marks *all* claimed rows `processing`; the tick loop skips no-handler rows without releasing the claim; no stale-`processing` reaper exists and boot-replay only touches `pending` → such events are stranded permanently (verified across a full server restart) while `/api/health` reports `queue.outbox: 0` (pending-only count). Contradicts the worker's own documented "left untouched" intent.
- **Severity driver:** silent event loss in the outbox pipeline (typo'd event type, consumer not yet deployed, consumer removed by bad deploy) with a false "queue empty" health signal.
- **Full details + repro + remediation:** Addendum B2.

### Verified-clean (no finding)
- **Batch atomicity:** a batch mixing valid + invalid ops fails closed with **zero partial writes** (verified at PG level).
- **Duplicate writes:** uid replay → `duplicate_ignored` (exactly-once); natural-key duplicates (phone/national_id) are blocked by partial unique indexes `uq_users_phone_active` / `uq_users_national_id_active` — no duplicate accounts possible at the DB layer.
- **Transaction boundary:** `server/db.js` `transaction()` = BEGIN/COMMIT with ROLLBACK on failure (rollback error logged, never masks the primary error), client always released. Isolation = READ COMMITTED (PG default; no explicit level set). No dirty reads possible; the TOCTOU above is the isolation-relevant gap.
- **Deadlock handling:** PG detects reverse-order lock cycles (40P01 in ~1s, verified at DB level); the app surfaces persist-layer failures as 503 + full rollback (no corruption, no hang, server stays alive). No app-level deadlock retry (transient deadlocks are client-visible 503s — acceptable, noted).
- **Crash recovery:** kill -9 **mid-batch** (500 ops) → **0 rows, 0 uid-markers persisted** (atomic), clean restart. PG outage → readiness `not_ready` + recovery without server restart (verified earlier this session, same SHA).
- **Migration tooling (positive):** apply 20/20 exit 0; re-apply idempotent ("Applied 0", exit 0); checksum-tamper detection (`MIGRATION_CHECKSUM_MISMATCH`, exit 1); out-of-order detection (`MIGRATION_OUT_OF_ORDER`, exit 1); full `down-all` rollback clean (schema + ledger empty); failed migrations are not ledger-recorded.
- **Index usage (120k-row workload):** delta-sync query (`created_at/updated_at` window + `ORDER BY updated_at, id`) → per-partition `updated_at` index scans + Incremental Sort, ~70 ms even with a 6-month window + LIMIT; per-student grades → `school_id_student_id` partition indexes, ~2.5 ms; per-school+date attendance, per-school users — all index-driven (<0.3 ms). Partitioned tables (012) carry full per-partition index sets; `*_old` remnants from the 012 bake period are documented (Phase D is manual by design).
- **Data integrity:** FK-violating grade insert → rolled back, zero orphans; Persian/emoji round-trip exact.

## 2. Risk Level

| Finding | Risk | Rationale |
|---|---|---|
| F-DB-01 lost update / false ack | **HIGH** | Silent data loss + protocol lie on the core offline-sync write path; exploitable by ordinary concurrent use (two clients, same record), no auth/attack needed |
| F-DB-02 012 ledger-window dead-end | **MEDIUM** | Operational: safe DB state, but authoritative runner stuck after a crash in the heaviest migration; requires runbook + manual repair |
| F-DB-03 503 for client data errors | **LOW** | Error semantics only; no data risk (atomicity holds) |
| F-DB-04 outbox no-handler events stranded in `processing`, invisible to health | **MEDIUM** | Silent pipeline loss of events + false "queue empty" signal; no corruption; manual recovery possible |
| Migration apply/rollback/reapply, atomicity, crash recovery, indexes | **LOW (residual)** | Verified working; residual = 012 `*_old` manual-drop step and absence of app-level deadlock retry |

## 3. Evidence (all E3, HEAD `ecc8b40b`)

**F-DB-01 (reproduction, 3 independent trials):**
1. `users` id=4, base=5: two concurrent sync upds (same `base_version=5`, different uids) → **both `200 {"ok":true}`**, final `version=7` (Δ=**2**), **both uids present in `server_processed_uids`** → both writes physically persisted over one another, double-ack. Repeated: base=7 → same outcome (Δ=2, both acked).
2. Control: same test ×10 concurrent, same base → exactly **1** success + **9** `stale_base`, Δ=1 → the guard *can* work when reads serialize; the failure is the race window, not absence of logic.
3. `del` vs `upd` race on the same row, 4 rounds → **4/4 both acked `ok:true`, row deleted** (the update's ack was false).
4. Two 2-row interleaved batches (X→Y vs Y→X) → all 4 ops `ok:true`, all 4 persisted; the later batch's values overwrote the earlier's entirely, both clients "won".
5. Code proof: `sync.js:1089` (mirror op without `base_version`/`id`) → `db.js:755-770` conditional UPDATE unreachable → `db.js:779` unconditional UPDATE, no `rowCount` check.

**F-DB-02 (reproduction):**
1. All 20 up-migrations contain internal `COMMIT` (grep) → `migrate-ledger.js` always uses the non-atomic `hasInternalTx` script path for this repo.
2. Fresh DB: raw-apply 001 (no ledger row) → `up` → exit 0, "Applied 20" (001 no-op'd via `IF NOT EXISTS`, then recorded) → self-heal for idempotent migrations.
3. 004: `ADD COLUMN` blocks wrapped in `DO $$ … IF NOT EXISTS … END $$` → idempotent (verified on re-run).
4. **012:** full `up` (20) on fresh DB → delete ledger rows 012–020 (simulate crash after 012's commits, before ledger insert) → `up` → **exit 1**, `ERROR: ALREADY_APPLIED: migration 012 partition swap is already in place` → `MIGRATION_EXECUTION_FAILED`; ledger stuck at 001–011; DB state consistent (post-swap + `*_old` remnants). Sentinel tolerated in `seed-relational-small.js:143`, **absent** in `migrate-ledger.js` (grep: 0 hits).

**F-DB-03 (reproduction):** FK-violating grade (`student_id=999999`) via sync → `503` (`sync_mirror_failed` shape, op `ok:false`), `SELECT count(*) FROM grades WHERE student_id=999999` → **0** (rollback clean). Unique-phone duplicate insert → same 503 path, row count stays 1.

**Positive verifications (commands/observations):**
- `migrate-ledger.js up` fresh: `Applied 20 migration(s)`, exit 0, `schema_migrations` = 20 rows; re-run: `Applied 0`, exit 0.
- Ledger tamper: `UPDATE schema_migrations SET checksum='deadbeef' WHERE version='010'` → `up` exit 1 `MIGRATION_CHECKSUM_MISMATCH …`; delete row 005 → `up` exit 1 `MIGRATION_OUT_OF_ORDER`.
- `down-all` → 19/19 rolled back over remaining ledger rows, exit 0, only `schema_migrations` table left, ledger 0.
- Atomicity: batch `[valid ins, valid ins, cross-tenant upd]` → `403 out_of_scope`; PG count of the two valid inserts = **0**; cross-tenant row untouched.
- Replay: same uid twice → second `duplicate_ignored`; PG rows = 1.
- Boundary: 501 ops → `413 batch_too_large`; 500 ops → 200, 500/500 ok, PG rows = 500; 300-char `full_name` → `validation_failed`, 0 rows; Unicode round-trip exact.
- Crash: 500-op batch fired, `kill -9` at ~200 ms → client connection error, **0 rows / 0 uid markers**, restart → health 200, API functional.
- Deadlock (DB level, two clients): reverse-order row locks → `40P01 deadlock detected` after ~1002 ms, victim aborted, winner's update intact, no corruption.
- Indexes (120k grades / 60k attendance): `EXPLAIN (ANALYZE)` on the app's hot shapes — delta-sync: Index Scan on `grades_y202x_updated_at_idx` per partition + Incremental Sort, 76 ms (1-day window) / 69 ms (6-month window, LIMIT 5000); per-student grades: Index Scan `school_id_student_id_idx` per partition, 2.5 ms; attendance by school+date 0.23 ms; users by school+role 0.09 ms. No Seq Scan on any hot path.
- PG-outage recovery (same SHA, earlier phase of this session): service stop → readiness `not_ready`/`db.alive:false`, authenticated calls 401, service start → 200 without server restart.

## 4. Failed Scenarios (what actually broke)

| # | Scenario | Result | Finding |
|---|---|---|---|
| 1 | 2 concurrent same-`base_version` updates of one record | **Both acked `ok:true`, both persisted, version Δ=2** — silent last-writer overwrite, no conflict recorded | **F-DB-01 — FAILED** |
| 2 | Concurrent `del` + `upd` of one record (×4) | **4/4 both acked `ok:true`; record deleted** — update ack was false | **F-DB-01 — FAILED** |
| 3 | Two interleaved multi-op batches (X→Y / Y→X) | All ops acked; later batch overwrote earlier batch's writes entirely, both clients "won" | **F-DB-01 — FAILED** |
| 4 | Crash inside 012's ledger window (applied, unrecorded) → `up` | **exit 1 `ALREADY_APPLIED` → runner stuck**, ledger unrepairable by the tool (manual INSERT or down+up required) | **F-DB-02 — FAILED** (DB state itself consistent) |
| 5 | Sync op violating FK / unique constraint | **503 instead of 4xx/409**; retry loops on 503 until payload fixed | **F-DB-03 — degraded** |
| 6 | Outbox event with no registered handler (1 claim cycle, ~180 ticks, server restart) | **Claimed → stuck `processing` permanently; health shows `queue.outbox: 0`** — silent pipeline loss + false empty-queue signal | **F-DB-04 — FAILED** |
| 7 | Poison-pill → DLQ path (empirical) | Not triggerable in E3 black box without code changes (only handler fails open in dev; boot gate blocks no-Redis) — code+schema verified | **MEASUREMENT GAP (NEEDS RECHECK in staging)** |

**Scenarios that did NOT fail (negative results, equally important):** batch partial-write (atomic, 0 rows after 403), duplicate uid replay (exactly-once), duplicate phone/national_id (unique indexes block), 501-op batch (413), 500-op batch (all committed), kill -9 mid-batch (atomic, clean restart), PG crash (clean recovery), deadlock (40P01 victim semantics, no corruption), migration re-apply (idempotent), checksum/out-of-order tamper (detected), rollback (clean), index usage (no Seq Scan on hot paths at 120k rows).

## 5. Recommendations

1. **F-DB-01 (fix first, HIGH):**
   - Minimal: propagate `id` and `base_version` into the mirror upd op — `server/sync.js:1089` → `mirror.push({ uid: op.uid, c: op.c, t: 'upd', id: rec.id, base_version: op.base_version, data: rec })` — so `db.js:755-770`'s conditional UPDATE + `occ_conflict` path actually executes; also add a `rowCount===0` guard on the LWW path (`db.js:779`) so a vanished record is never silently acked.
   - Stronger (same release if possible): perform check-and-write in **one** transaction (`SELECT … FOR UPDATE` inside `persistOpsBatch`, or `UPDATE … WHERE version=$base` as the *only* gate) to eliminate the TOCTOU window even for LWW collections.
   - Regression: CI test — N concurrent same-base upds ⇒ exactly one success; del-vs-upd ⇒ at most one op acked.
2. **F-DB-02 (MEDIUM):** make `migrate-ledger.js` tolerate the 012 `ALREADY_APPLIED` sentinel the way `seed-relational-small.js:143` does (record the ledger row, warn loudly), **and/or** add a runbook entry: "012 applied-but-unrecorded → verify post-swap state → `INSERT INTO schema_migrations …` with the file's sha256". Longer term: wrap ledger insert with the migration where the DB allows it (avoid internal `COMMIT`s in new migrations; the runner's atomic branch already handles them).
3. **F-DB-03 (LOW):** map constraint violations inside sync batches to **409** with the constraint name (batch stays atomic; per-op `ok:false` + `code:'constraint_violation'`); reserve 503 for genuine mirror/infrastructure failures. Add a contract test.
4. **Hygiene (no defect, keep it that way):** add the concurrency scenarios above to the PG test suite in CI (they are currently untested — the race is latent by design of the pre-check); document the 012 Phase-D `*_old` drop step with a check (`pg_indexes` scan for `%_old%`) in the DR runbook.
5. **Not required:** app-level deadlock retry (40P01 → 503 + client retry is sound); isolation-level change (READ COMMITTED is correct given fix #1's single-transaction check-and-write).

## 6. Status

| Item | Status |
|---|---|
| Migration apply (fresh, 20/20, ledger) | **VERIFIED** |
| Migration reapply (idempotency) | **VERIFIED** |
| Migration rollback (`down-all`, clean schema + empty ledger) | **VERIFIED** |
| Migration integrity detection (checksum tamper, out-of-order) | **VERIFIED** |
| Migration crash-window recovery — idempotent migrations (001/004) | **VERIFIED** |
| Migration crash-window recovery — 012 via `migrate-ledger.js` | **FAILED** (F-DB-02, REPRODUCED; DB state consistent, tooling stuck) |
| Transaction boundary / rollback / atomicity (batch all-or-nothing) | **VERIFIED** |
| Duplicate writes (uid replay, natural keys) | **VERIFIED** |
| Isolation — concurrent writers, same base_version | **FAILED** (F-DB-01, REPRODUCED — lost update + double ack) |
| Isolation — del vs upd race | **FAILED** (F-DB-01 family, REPRODUCED — false ack) |
| Deadlock behavior (40P01, victim abort, no corruption) | **VERIFIED** |
| Crash recovery (kill -9 mid-batch; PG outage) | **VERIFIED** |
| Index usage (hot paths @ 120k rows) | **VERIFIED** |
| FK integrity / Unicode round-trip / batch limit boundary (413 @ 501) | **VERIFIED** |
| Client-data-error status semantics (FK/unique → 503) | **FAILED** (F-DB-03, REPRODUCED — low severity) |
| E4 / production-equivalent evidence | **NOT VERIFIED** (no staging access — EXTERNAL BLOCKER) |

**Overall: PARTIALLY VERIFIED** — the database substrate (PostgreSQL layer, migrations, atomicity, indexes, crash recovery, backup/restore round-trip) is solid and verified, but the **application's sync write path fails its own concurrency contract (F-DB-01, HIGH)**, the authoritative migration runner has a crash-recovery dead-end on 012 (F-DB-02, MEDIUM), client-data errors surface as 503 (F-DB-03, LOW), and the outbox strands no-handler events in a permanently invisible `processing` state (F-DB-04, MEDIUM). Roadmap reconciliation required for F-DB-01 / F-DB-02 / F-DB-03 / F-DB-04; Arena does not promote any roadmap status.

---

## Addendum A — continued passes (same HEAD `ecc8b40b`, E3)

Executed after the initial report, closing the remaining verification items:

**A1 — `/metrics` gate in production mode: VERIFIED.** Server booted with `NODE_ENV=production PAYESH_ENV=production PAYESH_BEHIND_PROXY=1 PAYESH_METRICS_TOKEN=<secret>`:
- Token set: correct `Bearer` → **200 from loopback AND non-loopback source** (real socket `169.254.0.21`); wrong/empty bearer → **403** (`timingSafeEqual` compare, `metrics.js:752-769`); `X-Forwarded-For` spoof ignored (gate keys on socket address).
- Token **not** set + production → `/metrics` **404 from every source** (boot banner: "DISABLED — set PAYESH_METRICS_TOKEN") — fail-closed, unlike dev mode (loopback-only).
- Positive boot-gate findings (fail-closed, verified live): production with shared state **refuses to boot** without explicit shared `PAYESH_JWT_SECRET` (≥32 bytes); refuses without TLS (`PAYESH_TLS_CERT/KEY` or `PAYESH_BEHIND_PROXY=1`); warns on `NODE_ENV`/`PAYESH_ENV` mismatch.
- OTP state in Redis stores **SHA-256 hash only** (`payesh:otp:state` → `codes.<phone>.h`) — plaintext codes not recoverable from the datastore.

**A2 — IP rate limiting: VERIFIED.** 12 `send-code` calls from one IP (12 distinct phones, so per-phone caps don't interfere): requests 1–10 → `200 sent`, requests 11–12 → **`429 rate_limited`** — exactly the configured `IP_SEND_MAX=10` / 900 s window (`server/auth.js:173,256`).

**A3 — Idempotency (uid dedup) across process crash: VERIFIED.** Sync insert uid `rr-1` (200 ok, PG row=1, `server_processed_uids` marker=1) → `kill -9` → restart → **replay of same uid → `duplicate_ignored`, row count stays 1** → dedup state survives crashes (PG-backed), no duplicate write.

**A4 — Environment note:** sandbox reset lost `.git` and exec bits; repo re-verified against a fresh clone of `ecc8b40b` (SHA `ecc8b40b5d53…`) and restored byte-identical (`git status` clean, 0 modified/0 deleted).

---

## Addendum B — backup/restore round-trip, outbox pipeline, DLQ (same HEAD `ecc8b40b`, E3)

**B1 — pg_dump/pg_restore round-trip integrity: VERIFIED.** Fresh DB with 3,015 users / 30,030 grades / 50 attendance / 2 schools → `pg_dump -Fc` (exit 0) → `pg_restore` into a second DB (exit 0, 0 errors). Comparison: all 12 checked tables **identical row counts**; ordered-row **md5 checksums identical** (users/grades/schools); **500 indexes / 225 constraints / 104 partitions** preserved; sequence set identical (md5 of `pg_sequences` list). No false-positive restore: the restored DB is byte-equivalent on data for the checked tables.

**B2 — NEW FINDING F-DB-04 (MEDIUM, REPRODUCED): outbox events without a registered handler are claimed, stranded in `processing` forever, and invisible to health.**
- **What:** `fetchPendingBatch` (outbox.js:246-252) claims up to 50 `pending` rows in one CTE and marks **all** of them `processing` — including rows whose `type` has no handler in this worker. The tick loop then hits `if (!h) continue;` (worker.js) and **never restores them to `pending`**. Since only `pending` rows are ever claimed again, and **no stale-`processing` reaper exists anywhere in the codebase** (grep-verified; `replayPendingFromPg` at boot replays only `pending`), such an event is stuck in `processing` **permanently, across restarts** — retained in the table (data not deleted, per the worker's stated invariant) but never processed, never retried.
- **Compounding observability gap:** `/api/health` queue depth counts `pending` rows only → reports `queue.outbox: 0` while the stranded event sits at `processing`. An operator sees an "empty" queue.
- **Contradicts documented intent:** worker.js header (line ~11) states "رویدادهای بدون هندلر دست نمی‌خورند" (no-handler events are left untouched) — the implementation *does* touch them (claims them). Doc/implementation divergence.
- **Reproduction (exact):** insert `('nohandler.never','ghosts',…,'pending')` → after one tick: `status='processing', retry_count=0` → after ~180 ticks (500 ms interval): unchanged → full server restart (Redis restored): **still `processing`** → health shows `queue.outbox: 0`.
- **Trigger conditions in production:** any outbox type emitted ahead of its consumer, a typo'd event type, or a consumer removed by a bad deploy. Silent pipeline loss of that event (recoverable only by manual `UPDATE … SET status='pending'`).
- **Minimal remediation:** (a) in the tick loop, when `!h`, immediately `outbox.mark(evt.id, {status:'pending'})` (release the claim) — or (b) a stale-`processing` reaper (rows in `processing` older than N minutes without `processed_at` → back to `pending`, idempotent); (c) expose the `processing` count (and oldest age) in health/depth so the blind spot is visible; (d) regression test: unknown-type event must be `pending` (or an explicit terminal `skipped` state) after 2 ticks and counted in depth.
- **Status:** REPRODUCED (MEDIUM). Data integrity of *processed* events is unaffected; the gap is silent pipeline loss + false "queue empty" signal.

**B3 — Outbox DLQ (poison-pill) path: code VERIFIED, empirical trigger = MEASUREMENT GAP (honest).**
- Code path verified end-to-end by reading + schema: failure → `retry_count++` → at `retry_count ≥ maxRetries` (default 5, env-tunable) → `status='failed'` + `moveToDlq(evt, errMsg)` → row copied to `server_outbox_dlq` (full forensics: `error_message`, `retry_count`, `failed_at` — table from migration 014) with source marked `dead_letter`; failed events are **never deleted** (worker invariant, honored in code). Claim is `FOR UPDATE SKIP LOCKED` single-statement (no double-claim under multi-worker — consistent with the earlier exactly-once verification).
- **Why no empirical trigger:** the only registered handler (`*.deleted` → cache invalidation) cannot be made to throw in an E3 black box without modifying project code (forbidden by my role): with Redis up it succeeds; with Redis down the dev-mode cache fallback absorbs the failure (event processed, rc=0 — verified live: poison event went `processed` under Redis outage); with `REDIS_URL` absent the server **refuses to boot** (cache readiness fail-closed — itself verified). Hence: DLQ behavior is verified by code+schema only → **NEEDS RECHECK** in a staging environment where a real gateway failure can be injected.

**B4 — Additional boot-gate evidence (positive):** server with `DATABASE_URL` but no `REDIS_URL` in production semantics → `[FATAL] Cache readiness failed: REDIS_URL is required … (in-memory fallback is dev-only)` → **refuses to start** (fail-closed, correct).

**B5 — Environment note (second sandbox reset):** PG17/Redis reinstalled via apt, Node 22.23.1 reinstalled, DB rebuilt from the same migrations/seeders; repo re-verified byte-identical to fresh clone of `ecc8b40b` (0 modified / 0 deleted).

Status table additions: *Backup/restore round-trip integrity* — **VERIFIED**; *Outbox no-handler event lifecycle* — **FAILED** (F-DB-04, REPRODUCED); *Outbox DLQ poison path* — **NEEDS RECHECK** (code VERIFIED; empirical trigger MEASUREMENT GAP — no fault-injection possible without code changes); *Cache boot gate without Redis (prod)* — **VERIFIED**.

*Environment: scratch DBs dropped, server stopped, working tree clean (re-verified against fresh clone of `ecc8b40b`). All evidence reproducible from §3 + Addenda commands on a fresh clone.*
