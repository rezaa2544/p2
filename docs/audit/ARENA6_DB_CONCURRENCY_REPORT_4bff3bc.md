# Arena Database/Concurrency Report — E3 @ `4bff3bcb757162f040e82ffa26f3d40e46eb7a36`

**Role:** Database/Concurrency Agent — focus **A-01 / A-02 / A-03 / A-04 / A-06 / A-24** across queries, transactions, pool, indexes, N+1, collection scans, concurrency, deadlocks, stale reads, races, locks, multi-instance.
**Rules applied:** Performance PASS without measurement is forbidden (none issued); statuses from the allowed list only; runtime reproduction required where feasible; no project code modified; E3 only (E4 NOT VERIFIED); `Roadmap Reconciliation Required` flagged for defects.

---

## 0. Verdict

| Item | Status | Core evidence |
|---|---|---|
| A-01 regional O(schools×collections), PG path reads store | **REPRODUCED** | PG log `ERROR: column "region_id" does not exist` on every request → silent store fallback; latency 24 ms → 164 ms → **10 016 ms** at 102/402/1902 schools |
| A-02 health-index scan, no real PG path | **REPRODUCED** | zero PG refs; PG-vs-mirror staleness live (PG=102 schools, endpoint=2); latency 13.8 → 135.2 → **9 892 ms** (repeat session: 2 901 ms — same seconds-scale defect, machine variance) |
| A-03 six queries on main pool vs queryRead | **PARTIALLY VERIFIED** | six `WHERE school_id=$1` on main pool in PG log; pool pinned at 20 conns; conc curve 8.1→51.6→79.5→**239.9 ms** (c1/8/16/64, all 200); **no interference** measured on sync/auth (idle≈hammer) and **no saturation failure** up to c64 |
| A-04 ids lock released before push (memory) | **REPRODUCED** (module level) | real `server/ids.js`: 299/300 duplicate ids (memory harness) vs **0/300** on live PG sequences; **HTTP full-stack: 0 duplicates in 200×60 bursts on both memory/JSON and PG** — window not hit at HTTP scale (reported as-is) |
| A-06 sms_log/notify_queue unbounded + reread per request | **REPRODUCED** | no retention anywhere; health 3.1→**14.5 ms** with 200 k queue rows; sms send 15→**48 ms** with 200 k log rows; boot heap 113→**425 MB** |
| A-24 (stale client / reconnect / concurrent writes) | **NOT IN CURRENT REPOSITORY — DO NOT RECONSTRUCT** | zero `A-24` hits repo-wide; carryover table ends at A-23. The three named scenarios were executed as **general subsystem tests** (below), not as A-24 verification |
| stale client / reconnect / concurrent writes (general) | **VERIFIED** (E3 scope) | see §6 — conflict_preserved + durable sync_conflicts; 1 winner/15 rejected, zero lost updates; signed cursor + cookie survive restart; catch-up delivered the exact row |
| Deadlocks | **PARTIALLY VERIFIED** | outbox `FOR UPDATE SKIP LOCKED` live 10/10; no adversarial deadlock stress performed |
| Multi-instance | **VERIFIED** (E3 scope) | `phase2-occ-multi` green (Redis), `outbox-lease-race-live` 10/10, cross-instance hydrate path (`findForApply`) exercised by suites |

**Roadmap Reconciliation Required** (A-01..A-06 defects + findings F-DBC-05..08).

## 1. Environment (rebuilt this session; sandbox had been reset)

- PG 17.11 reinstalled (cluster `17/main`), Redis 7 reinstalled, role/db `payesh`, Node v22.14.0 toolchain, `npm ci` exit 0.
- Fresh DB: `migrate-ledger up` **21/21 (1876 ms)** → seed **40/40 (1362 ms)**. Post-seed: `schema_migrations` **destroyed by seed's `PG_SEED_FRESH` reset** (F-PG-06 pattern reconfirmed: ledger absent while objects exist).
- Server on PG+Redis: `Hydrated 25–27 collections`, health 200; SMS in `PAYESH_SMS_PROVIDER=mock PAYESH_SMS_DRY_RUN=1` mode for A-06.

## 2. A-01 / A-02 — collection scans (benchmarked)

Fixture `tools/ap-fixture.js` (schools 101..N, district_id=777, 2 classes + 20 grades + 20 attendance per school); server restarted per scale point; tool `tools/bench-ap.js`, keep-alive, warmup 2.

**Scale curve (conc=1, this session):**

| schools (grades rows) | health-index avg/p95 | regional avg/p95 | school-intel (6-query) avg |
|---|---|---|---|
| 102 (2 030) | 13.80 / 16.45 ms | 24.03 / 27.08 ms | 7.44 ms |
| 402 (8 030) | 135.22 / 230.82 ms | 163.94 / 217.54 ms | 8.68 ms |
| 1 902 (38 030) | **9 891.52 / 12 214.86 ms** (1.58 MB) | **10 015.85 / 12 532.80 ms** | 8.75 ms |

Repeat measurement of the same fixture on the same HEAD earlier this conversation: 12.24/21.01 ms → 123.87/154.73 ms → **2 901/3 031 ms**. Absolute values vary with sandbox CPU; both runs put the 1 902-school case in the **seconds** range and show the same superlinear shape (≈ schools × collection rows), while the PG-query endpoint stays flat (~7–10 ms). No performance PASS is claimed — the pattern fails.

- A-01 PG-path proof: `log_statement=all` → `ERROR: column "region_id" does not exist … SELECT * FROM schools WHERE region_id = $1 OR district_id = $1` (table has no `region_id`), caught → store fallback (server log: `[DB] Query execution error: column "region_id" does not exist` repeated).
- A-02 staleness proof: 100 schools + ~2 000 grades inserted into PG while server running → endpoint still reported 2 schools / regional school_count 0 until restart (mirror is the only source).

## 3. A-03 — pool under concurrent load

| conc | avg ms | p95 ms | statuses |
|---|---|---|---|
| 1 | 8.11 | 11.57 | 48/48 200 |
| 8 | 51.61 | 96.07 | 48/48 200 |
| 16 | 79.53 | 116.04 | 48/48 200 |
| 64 | 239.89 | 314.32 | 96/96 200 |

- Six queries per request captured in PG log (grades/attendance/classes/schedule/counselor_refs/teacher_notes `WHERE school_id=$1`).
- `pg_stat_activity` during c64 hammer: **idle=20 (pool fully open), active=1** — all 20 pool connections established, queries sub-ms, queue drains.
- **Interference probe (the claim's "auth/sync" risk):** sync single-op writes idle 19–25 ms vs **under hammer 19–22 ms**; send-code idle 16 ms vs under hammer 19 ms. **No measurable interference** at tested loads; no acquire-timeout errors ≤ c64. → PARTIALLY VERIFIED: structural pressure real, failure/interference NOT reproduced.
- Note: without a configured replica, `queryRead` falls back to the same primary pool (route fix alone would not isolate reads).

## 4. A-04 — memory/JSON vs PG comparison

| arm | layer | N | result |
|---|---|---|---|
| memory (in-process, real `server/ids.js`, caller pattern with awaits before push) | harness `tools/a04-repro.js` | 300 | **299 duplicate rows (all id=1)**; unique=1 |
| memory (same harness, N=50) | harness | 50 | **49 duplicates** |
| PG sequence (same harness, `isPostgres()` wrapper) | harness | 300 | **0 duplicates**, unique=300 |
| **memory/JSON full-stack** (`server/seed.js` store, port 3132, no DATABASE_URL) | HTTP `tools/a04-http.js`, 200 concurrent single-op sync creates, P=60 | 200 | 200×200 OK, **0 duplicate ids in `server/data/payesh.json`** |
| PG full-stack (port 3131) | HTTP, same load | 200 | 200×200 OK, **0 duplicate ids in PG** (`count=200, count(DISTINCT id)=200`) |

Interpretation (honest): the release-before-push race is **deterministically reproducible at module level** when callers are queued into the id chain within one microtask storm (the mechanism the claim describes; JSON persistence would preserve any duplicates). At HTTP scale the window requires two handlers inside the chain between one caller's release and its push — not hit in 200×60 attempts per mode. PG sequences are race-free in both layers. Repo's `tests/id-collision.js` passes but uses a **mocked nextval** (no live race coverage).

## 5. A-06 — sms_log / notify_queue growth and reread

- **Static:** no retention/purge/delete for either table anywhere in `server/`/`tools/` (grep); tables indexed (`idx_sms_log_created_at`, `idx_notify_queue_*`) but **all consumers read `store.*`**, so indexes are never used by these paths.
- **Growth reproduced:** inserted **200 000 `notify_queue` + 200 001 `sms_log`** rows (no cap/retention errors — rows persist; ON_ERROR for identity sequence fixed via `setval`, see F-DBC-08).
- **Reread costs measured (store-scan consumers):**
  - `GET /api/health` (`notify_pending` filter over `store.notify_queue`): **3.1 ms → 14.5 ms avg** (queue 0 → 200 k).
  - `POST /api/sms/send` (`find` over queue + `usedToday` reduce over whole `store.sms_log`): **15 ms baseline → 48 ms** with 200 k log rows (the row was actually sent: `sent:1`).
  - Boot hydration of the 400 k rows: boot **4 754 ms**, **heap 113 MB → 425 MB** peak (GC later ~242 MB).
- **Side findings (measured):**
  - **F-DBC-06 — daily cap bypass in PG mode:** with `PAYESH_SMS_MAX_PER_DAY=10` and **200 900 parts already sent today**, send returned **200 (sent:1)** instead of `429 daily_cap`. Root cause: `usedToday` compares `l.created_at === today()` (`'YYYY-MM-DD'` string) against hydrated ISO timestamps → always 0.
  - **F-DBC-07 — mirror trim vs mirror-only readers:** P1-2 post-commit trim reverts non-whitelisted collections (default whitelist = `sync_conflicts` only) → live: DB pending=9 while `store.notify_queue` pending=1; **6/6 sends of post-boot queue items returned `skipped_already` (sent:0)** because `apiSend` reads only the mirror. Health underreports queue depth the same way. Functional read-your-write gap between PG authority and mirror-reading subsystems.
  - **F-DBC-08 — identity sequence lag:** `notify_queue_id_seq.last_value=50` while max id=57 (explicit-id sync inserts) → subsequent identity-default bulk insert failed with measured PK violations (`duplicate key … id=49/50`); repaired via `setval`. Mechanism of the lag not fully pinned → mechanism status **NOT VERIFIED**, collision itself measured.

## 6. Stale client / reconnect / concurrent writes (general tests — NOT A-24)

- **Stale client (OCC, grades = VERSIONED):** fresh `base_version:1` → 200 (version 1→2); **second write with the same stale base → 200 `conflict_preserved`, write NOT applied (version stayed 2), durable `sync_conflicts` row persisted (count=1)**.
- **Concurrent writes:** 16 parallel `upd` on the same record with the same base → **1× success + 15× `validation_failed`, final version bumped exactly once, zero lost updates**.
- **Reconnect:** initial `GET /api/v1/pull` → signed `next_cursor` (ttl 3600, chg_watermark captured); write → pull with old cursor: 200 catch-up; **server restart → old cookie still 200 and the same cursor accepted (200)** — signed cursors survive restarts; catch-up delivered the exact changed row (`17.25` present in delta). Server-time snapshot is taken pre-read (anti-skip design observed in `pull.js`).

## 7. Twelve-area matrix @4bff3bc

| # | Area | Evidence | Status |
|---|---|---|---|
| 1 | Queries | 7 raw `await db.query` in routes; no loop-await N+1 found; wave10 audit **13/14 (QA13 red: `pull.js:134` concat)**; A-01 dead-column query | PARTIALLY VERIFIED |
| 2 | Transactions | `db.transaction` call sites; sync P1-14 atomic batch + undo; migration tx defects (seed/ledger F-PG-06 reconfirmed this session; 012 whole-file 2D000 known) | PARTIALLY VERIFIED |
| 3 | Constraints | `migrate-pg-constraints` **14/14**; seed FK/tenant checks 40/40 | VERIFIED (E3) |
| 4 | Indexes | 502-index schema; EXPLAIN: `grades_y2026_school_id_idx` Index Scan, `idx_sms_log_created_at` Index Scan — available but **unused by store-reading A-06 paths** | VERIFIED (E3) with noted gap |
| 5 | N+1 | no PG N+1 in loops; in-memory N+1-shaped scans = A-01/A-02 (measured seconds) | PARTIALLY VERIFIED |
| 6 | Pool | max 20, timeout 3000 ms; pinned 20 conns under load; c64 curve; no failure ≤c64; no replica → queryRead≡primary | PARTIALLY VERIFIED |
| 7 | Concurrency | A-03 curve; 16-way same-record writes (1 winner); backpressure/429 contract present in sync | VERIFIED (E3) |
| 8 | Deadlocks | SKIP LOCKED live 10/10; ids advisory-lock bootstrap; no deadlock observed/induced | PARTIALLY VERIFIED |
| 9 | Stale reads | A-02 mirror staleness + F-DBC-07 (store1 vs DB9, send skips) — defects reproduced; pull delta freshness verified | VERIFIED that stale-read defects exist |
| 10 | Races | A-04 module-level repro; HTTP window not hit (0/200×60 both modes); OCC last-writer guards held | PARTIALLY VERIFIED |
| 11 | Locks / tx boundaries | ids chain+cache lock (gap before push); outbox lease (10/10 live); sync undo/post-commit trim boundaries analyzed with runtime proof | PARTIALLY VERIFIED |
| 12 | Multi-instance / r/w consistency | `phase2-occ-multi` green; outbox lease across instances green; signed cursor/cookie continuity across restart; mirror-vs-PG consistency defects F-DBC-06/07 | PARTIALLY VERIFIED (defects reproduced) |

## 8. Suite inventory (this session, live PG/Redis, walls measured)

| Suite | Result | Wall |
|---|---|---|
| `tools/migrate-ledger.js up` (fresh) | 21/21 OK | 1876 ms |
| `pg-relational-seed.js` | 40/40 PASS (ledger side-effect reconfirmed) | 1362 ms |
| `wave3-query.js` | 13/13 | 163 ms |
| `wave10-query-audit.js` | **13/14 FAIL (QA13)** | 41 ms |
| `migrate-pg-constraints.js` | 14/14 | 114 ms |
| `outbox-lease-race-live.js` | **10/10 PASS (live lease)** | 5647 ms |
| `phase2-occ-multi.js` | PASS (exit 0) | 10 552 ms |
| `id-collision.js` | PASS (mock nextval — not live coverage) | 98 ms |
| `delta-sync-hardening.js` | 19/19 | 6315 ms |

Not run: full `run-all-tests.sh`, adversarial deadlock/stress suites, E4 items. No skips counted as passes.

## 9. Findings register (this report)

- **F-DBC-01 = A-01** (HIGH): dead `region_id` PG branch + O(schools×collections) store scan; remediation: real columns/aggregated SQL; regression: sub-linear latency gate.
- **F-DBC-02 = A-02** (HIGH): health-index has no PG path, stale mirror; remediation: PG aggregates + read-your-write test gate.
- **F-DBC-03 = A-03** (MEDIUM): six main-pool reads, no isolation (no replica ⇒ queryRead no-op); remediation: queryRead **and** replica together; regression: route assertion + conc-latency budget.
- **F-DBC-04 = A-04** (HIGH at module level): lock released before push; remediation: bind lock to insert or forbid memory fallback for id issuance; regression: harness gate (0 dups) — HTTP burst harness kept as extra.
- **F-DBC-05 = A-06** (MEDIUM/operational): unbounded sms_log/notify_queue + per-request full scans (health +367 %, send +213 % at 200 k, +312 MB heap); remediation: retention policy + SQL-side aggregates (indexes exist) + paged reads; regression: latency budget at 200 k rows.
- **F-DBC-06** (MEDIUM/correctness): PG-mode SMS daily-cap bypass (string vs timestamp `usedToday`) — measured 200-not-429 with 200 900 parts/day and cap=10; remediation: date-trunc comparison; regression: 429 expected.
- **F-DBC-07** (HIGH/functional): post-commit mirror trim vs mirror-only consumers — post-boot queue items invisible to `/api/sms/send` (6/6 skipped) and health undercounts pending; remediation: send/health must read PG (or queue must be prune-safe); regression: create→send without restart.
- **F-DBC-08** (MEDIUM/data-integrity): identity sequence lag behind explicit-id sync inserts → measured PK collisions on default-identity inserts; mechanism **NOT VERIFIED**; remediation: persist path should `setval` or use defaults consistently; regression: insert-after-sync must not collide.
- **A-24**: `NOT IN CURRENT REPOSITORY — DO NOT RECONSTRUCT`.

## 10. Non-claims / gaps

- No performance PASS anywhere; curves fail their gates. Sandbox CPU variance: N1902 measured 2.9 s and 9.9 s on two runs of the same HEAD/fixture — both seconds-scale.
- A-04 HTTP window not reproduced (0/200×60 per mode) — reported as NOT REPRODUCED at that layer, not as fixed.
- Deadlock area lacks adversarial stress; multi-instance evidence is suite-level (Redis-backed), not a physical 2-node deployment. **E4 NOT VERIFIED.**

## 11. Files

- Report: `/home/user/ARENA6_DB_CONCURRENCY_REPORT_4bff3bc.md`
- Probes (untracked, `p2/tools/`): `ap-fixture.js`, `bench-ap.js`, `a04-repro.js`, `a04-http.js`.
- Prior deliverables kept: `ARENA6_POSTGRES_SPECIALIST_REPORT_4bff3bc.md`, `ARENA6_SECURITY_AUDIT_REPORT_5d4a48f.md`.
