# Arena PostgreSQL Specialist Report — E3 @ `4bff3bcb757162f040e82ffa26f3d40e46eb7a36`

**Mission:** PostgreSQL Specialist (queries, transactions, constraints, indexes, N+1, pool, concurrency, deadlocks, stale reads, race conditions, transaction boundaries, read/write consistency) + independent verification of A-01..A-04 from `docs/audit/ATRIA_PHASE_A_CARRYOVER.md`, with **runtime benchmarks** for regional analytics, health index, parallel queries, ID generation.
**Environment:** E3 (live PostgreSQL 17.11 + Redis 7 in-sandbox; first live-PG runtime of this campaign). `CERTIFIED` is forbidden by the user; no performance PASS is claimed without measurement.
**Evidence rule applied:** no A-item is completed from code inspection alone; every disposition below carries a runtime reproduction or a measurement. `Roadmap Reconciliation Required` is flagged (I do not upgrade roadmap status myself).

---

## 0. Verdict (statuses from the allowed list only)

| Item | Status | One-line evidence |
|---|---|---|
| A-01 (regional O(schools×collections); PG path reads `store.*`) | **REPRODUCED** | PG log shows `ERROR: column "region_id" does not exist` for the route's query → silent fallback to store; latency 21 ms → 155 ms → **3031 ms** at 102/402/1902 schools |
| A-02 (`health-index.js` store-scan, no real PG path) | **REPRODUCED** | zero PG refs in file; live: PG=102 schools while endpoint still reports 2 (mirror staleness); latency 12 ms → 124 ms → **2901 ms** |
| A-03 (six queries on main pool, not `queryRead`) | **PARTIALLY VERIFIED** | six `WHERE school_id=$1` queries on main pool captured in PG log per request; concurrency latency ×10.7 at 16 (8.4→89 ms), ×35 at 64 (296 ms); **pool failure (3 s acquire-timeout) not reached** — no 5xx at any tested load |
| A-04 (`ids.js` releases lock before push → duplicate IDs) | **REPRODUCED** | real `server/ids.js`, memory path: N=300 concurrent handlers → **299 duplicate ids** (all id=1); N=50 → 49 dups; control on live PG sequences: **0 dups / 300** |
| Migration chain recoverability (post-seed) | **REPRODUCED** | `migrate-ledger up` on seed-reset DB exits 1 at 009 (`chk_report_logs_kind already exists`), ledger stuck at 8/21 while 114 tables exist |
| `tests/wave23-reports-pg.js` (live gate) | **REPRODUCED** | EXIT 1: `invalid transaction termination` (2D000) applying 012 whole-file via `client.query` |
| `tests/wave10-query-audit.js` (QA13) | **REPRODUCED** | 13/14: raw concatenated `db.query` in `server/pull.js:134` |
| A-01..A-04 performance PASS claims | **MEASUREMENT GAP → n/a** | measurements exist (§4) and they **fail** the pattern, not pass; no PASS is claimed |
| Production-scale / replica behavior | **GOVERNED LIMITATION** | demo-scale fixture, no read replica configured (see §7) |

**Overall: the four carried-over A-claims are independently confirmed (A-03 partially — degradation measured, failure not reached). `Roadmap Reconciliation Required`.**

---

## 1. Scope & ground rules honored

- HEAD `4bff3bc` (origin/main, clean) is truth; carryover definitions from `docs/audit/ATRIA_PHASE_A_CARRYOVER.md` (A-01..A-04 rows). Deferred ≠ certified safe.
- No project code was modified. Findings delivered as structured defects (§5). Probes are untracked additions: `tools/ap-fixture.js`, `tools/bench-ap.js`, `tools/a04-repro.js`.
- No test was weakened, skipped, or faked; failures are reported as failures. No `VERIFIED` without runtime evidence; no `CERTIFIED`.

## 2. Environment built (measured)

- PostgreSQL **17.11** installed; cluster `17/main` on :5432; role/db `payesh` (SUPERUSER). Redis 7 installed (`PONG`).
- `npm ci` exit 0 (Node v22.14.0 toolchain).
- `tools/migrate-ledger.js up` on fresh DB: **21/21 applied, exit 0** → inventory: **114 tables** (partitioned `grades`/`attendance` by RANGE(created_at) + yearly partitions), **502 indexes**, **501 constraints**.
- `tests/pg-relational-seed.js`: **40/40 PASS, wall 1254 ms** (demo-scale: 2 schools, 15 users, 30 grades, 50 attendance).
- Server boot on PG+Redis: `Hydrated 26 collections`, `[AUTHORITY] attached`, `[CANARY] hydrated`, `/api/health` 200. (Boot in PG mode requires `REDIS_URL` — fail-closed readiness, P0-13; in-memory fallback is dev-only.)

## 3. A-01..A-04 — definitions, static proof, runtime reproduction

### A-01 — regional analytics O(schools×collections); "PG path" still reads `store.*`
- **Static @4bff3bc:** `server/routes/analytics.js` region branch: PG-fetches schools (`SELECT * FROM schools WHERE region_id=$1 OR district_id=$1`, ~l.221) inside try/catch; the per-school loop (~l.232-237) reads **`store.grades/attendance/classes/schedule/counselor_refs/teacher_notes`** with `.filter()` over the whole collection per school → O(schools × collection rows).
- **Runtime proof 1 (PG path is dead):** with `log_statement=all`, one request to `/api/v1/analytics/regional-intelligence?region_id=777` produced in the PG log:
  `ERROR: column "region_id" does not exist … STATEMENT: SELECT * FROM schools WHERE region_id = $1 OR district_id = $1` — **`schools` has no `region_id` column** (columns: …county_id, district_id…). The catch silently falls back to the store scan. The PG branch executes and errors on **every** request.
- **Runtime proof 2 (store-scan cost):** see benchmark curve §4 — 21.01 ms (102 schools) → 154.73 ms (402) → **3030.99 ms avg / 3388 ms p95 (1902)** while response stays ~1.4 KB aggregate ⇒ work is server-side scanning.
- **Disposition: REPRODUCED.** Remediation: query real columns (`county_id/district_id` … or add region mapping), replace per-school whole-collection filters with one grouped SQL aggregation (or a Map index built once per request); regression: benchmark gate asserting regional latency is sub-linear in school count + a test asserting no `store.*` read in the PG branch.

### A-02 — `health-index.js` same scan pattern, no real PG path
- **Static:** `grep` for pg/db/isPostgres in `server/health-index.js` = **0 hits**; handler reads `store.schools` and `computeHealth(gather(store, school.id))`.
- **Runtime:** after inserting 100 fixture schools + ~2000 grades **into PG while the server ran**, `/api/health-index` still returned **2 schools** and regional returned **school_count=0** (PG had 102/2030) → live **stale-read** of the mirror; only a restart (rehydrate) reflects new rows. List-mode latency: 12.24 → 123.87 → **2901.16 ms avg / 4000 ms p95** (1.58 MB body) at 102/402/1902 schools — same O(schools×collections) shape.
- **Disposition: REPRODUCED.** Remediation: implement a real PG path (indexed aggregates per school) with store fallback only for non-PG mode; regression: (i) write row in PG → endpoint reflects it without restart (read-your-write), (ii) latency gate vs scale.

### A-03 — six parallel queries on main pool instead of `queryRead`
- **Static:** `analytics.js` school branch runs six `Promise.all(db.query('SELECT * FROM … WHERE school_id=$1'))` (grades, attendance, classes, schedule, counselor_refs, teacher_notes) on the **main pool** (`PG_POOL_MAX` default **20**, `connectionTimeoutMillis` 3000). `semantic-analytics.js` likewise uses `db.query`. `queryRead` (db.js:366) routes to a read-replica pool **only when `readConnectionString` is configured**; otherwise it is the same primary pool.
- **Runtime:** PG log under one request to `/api/v1/analytics/school-intelligence?school_id=101` captured exactly the six statements (grep count = 6) plus auth lookups.
- **Load (measured, N≈1902 fixture, single school = ~20 grades):** see §4 concurrency curve — avg 8.36 ms (c1) → 28.12 (c4) → 62.65 (c8) → 89.07 (c16) → **296.24 ms (c64)**; **all 200s (48/48, 96/96)**; during c16 a `pg_stat_activity` sample showed **20 pooled connections** (pool full) + 1 active; total DB connections 21.
- **Disposition: PARTIALLY VERIFIED** — main-pool usage and saturation pressure are confirmed (pool pinned at max, latency grows ~linearly), but the failure mode (acquire >3 s → errors) was **not reproduced**: offered HTTP load cannot outrun the pool with these query sizes. No PASS is claimed. Remediation: route the six reads through `queryRead` **and** configure a read replica (without a replica, `queryRead` changes nothing — documented); regression: assert route uses `queryRead` + conc-laterncy budget test.

### A-04 — `ids.js` releases lock before caller push → duplicate IDs (memory store)
- **Static:** `server/ids.js` `nextId`: process-chain serializes the `nextId` **body**; `finally { release(); }` (and `guardedMaxPlusOne`'s lock release in its own `finally`) fires **before** the caller stores the record (`sync.js` `data.id = await serverId(op.c)` … awaits … push; also `occ.js`, `sms.js`).
- **Runtime (real module, `createIds({db:null})`, real caller pattern — gap of 1–5 ms of awaited work):**
  - memory: **N=300 → 1 unique id, 299 duplicates (all id=1)**; N=50 → 49 duplicates;
  - control, same harness against live PG sequences (`db.isPostgres=()=>true`): **N=300 → 300 unique, 0 duplicates**.
- Repo's `tests/id-collision.js` passed (EXIT 0, 103 ms) but is **mock-driven** (stubbed `nextval`) — it does not exercise this race.
- **Disposition: REPRODUCED** (memory-fallback path). Remediation: hold the lock/chain until the caller's insert commits (return `{id, commit}` API), or forbid the memory path for id-critical writes (PG sequence as the only source); regression: the harness above as a gate (0 duplicates required).

## 4. Benchmarks (real measurements — demo-scale fixture, no performance PASS claimed)

Fixture: schools 101..N with `district_id=777`, 2 classes + 20 grades + 20 attendance rows each, inserted via `tools/ap-fixture.js`; server restarted to rehydrate; sequential requests, warmup 2, keep-alive; tool `tools/bench-ap.js`.

**Scale curve (conc=1):**

| schools (grades rows) | health-index avg / p95 | regional avg / p95 | school-intel (6-query) avg |
|---|---|---|---|
| 102 (2 030) | **12.24** / 17.66 ms | **21.01** / 26.64 ms | 6.90 ms |
| 402 (8 030) | **123.87** / 161.44 ms | **154.73** / 212.71 ms | 8.38 ms |
| 1 902 (38 030) | **2 901.16** / 4 000.42 ms (1.58 MB) | **3 030.99** / 3 388.32 ms | 10.03 ms |

→ health/regional scale ≈ schools × collection-rows (superlinear, ~240× from 19× schools); the PG-query endpoint stays flat. **This is the measurement for A-01/A-02.**

**A-03 concurrency (school-intelligence, same fixture):**

| conc | avg ms | p95 ms | statuses |
|---|---|---|---|
| 1 | 8.36 | 12.12 | 48/48 200 |
| 4 | 28.12 | 68.90 | 48/48 200 |
| 8 | 62.65 | 103.53 | 48/48 200 |
| 16 | 89.07 | 116.17 | 48/48 200 (pool sample: 20 idle/1 active) |
| 64 | 296.24 | 433.75 | 96/96 200 |

**A-04 ID generation:** memory N=300 → **299 dups**; memory N=50 → 49 dups; PG N=300 → 0 dups (tool `tools/a04-repro.js`).

## 5. Findings (structured)

**F-PG-01 / A-01 — HIGH — `server/routes/analytics.js` region branch.** Repro: request regional with log_statement on → PG error + store fallback; latency 3 s at 1902 schools. Root cause: nonexistent `region_id` column in the query + per-school whole-collection `.filter()` scans. Remediation: real columns/aggregation SQL; regression: sub-linear latency test + no-`store.*` assertion in PG branch. → *Roadmap Reconciliation Required*.

**F-PG-02 / A-02 — HIGH — `server/health-index.js`.** Repro: PG row inserted → endpoint unchanged until restart; 2.9 s at 1902 schools. Root cause: pure store scan, zero PG path. Remediation: indexed PG aggregates + fresher-than-boot reads; regression: read-your-write test + scale gate. → *Roadmap Reconciliation Required*.

**F-PG-03 / A-03 — MEDIUM — `server/routes/analytics.js` (and `semantic-analytics.js`).** Repro: six main-pool queries/request in PG log; pool pinned at 20 under conc 16; latency ×35 at conc64. Root cause: reads not on `queryRead`; no replica configured so `queryRead` would fall back to primary anyway. Remediation: `queryRead` + replica configuration as paired work; regression: route-uses-queryRead assertion + conc-latency budget. → *Roadmap Reconciliation Required* (PARTIALLY VERIFIED).

**F-PG-04 / A-04 — HIGH (memory mode) — `server/ids.js`.** Repro: `tools/a04-repro.js` memory arm: 299/300 duplicates; PG control 0/300. Root cause: lock/chain released before caller push. Remediation: bind lock lifetime to record insertion, or disallow memory fallback for id issuance; regression: harness gate (0 dups). → *Roadmap Reconciliation Required*.

**F-PG-05 — MEDIUM — `tests/wave23-reports-pg.js` + `migrations/012_partition_grades_attendance.sql`.** Repro: suite EXIT 1 (`invalid transaction termination`, 2D000) at `c.query(sql)` (line 80); isolated per-file loop fails **only on 012** via whole-file `client.query`, because 012 contains `CALL payesh_copy_*_009()` procedures with internal `COMMIT` executed inside the driver's implicit multi-statement transaction; the suite's psql-routing regex only matches the now-removed `\gset` meta-lines (stale after the Chat-2 refactor) so 012 never routes to psql. Seeder avoids this via statement-at-a-time execution. CI workflows do not run this suite (only `scripts/run-all-tests.sh` marks it REQUIRED when live PG exists) → latent red hidden from CI. Remediation: route 012 to psql (or statement-split like the seeder); regression: suite green under `run-all-tests.sh` with live PG. *012's comment "runs with ANY standard SQL client" is true only for statement-at-a-time clients — whole-file driver exec breaks.*

**F-PG-06 — HIGH (ops/dev-staging) — migration ledger chain after the seed suite.** Repro chain (all measured): fresh `up` = 21/21 ledger rows → `tests/pg-relational-seed.js` runs the seeder with `PG_SEED_FRESH=1` → **`DROP SCHEMA public CASCADE`** destroys `schema_migrations`, and the seeder re-applies objects with its **own runner that never writes the ledger** (zero ledger references in `tools/seed-relational-small.js`) → any later `migrate-ledger up` / `schema-migrations-live-pg.test.js` (via `ensureLedgerTable` → `migrateUp`) applies 001–008 then **hard-fails at 009**: `constraint "chk_report_logs_kind" already exists` (009 DDL is not idempotent; the `ALREADY_APPLIED` recovery path does not match this error) → **ledger permanently stuck at 8/21 with 114 objects present** (observed on two independent DBs: `payesh` and `iso_probe`). CI stays green only because job order runs the seed suite last on an ephemeral DB. Remediation: make 009+ idempotent (IF NOT EXISTS/DO blocks) **or** make the seeder's runner write ledger rows; extend the `ALREADY_APPLIED` recovery; regression: `up → seed → up` cycle test must exit 0.

**F-PG-07 — LOW — `server/pull.js:134`.** `wave10-query-audit` QA13 red (13/14): `db.query('… FROM "' + t + '"')` string-concatenated table name. `t` iterates the `CHG_TABLES` allowlist (injection surface bounded), but it violates the suite's builder-only SQL contract. Remediation: move the watermark query into the SQL builder (or identifier-validation helper); regression: QA13 green.

## 6. Twelve-area matrix @4bff3bc (E3, live PG unless noted)

| # | Area | Evidence | Status |
|---|---|---|---|
| 1 | Queries | 38 raw `await db.query` across routes (top: classes/bootstrap ×2); analytics six-query + region query; QA13 red (F-PG-07); EXPLAIN shows partition-aware index use on 2026 partitions, seq on (small/empty) 2025 | PARTIALLY VERIFIED (contract red reproduced; plans acceptable) |
| 2 | Transactions | `db.transaction` in 4 call sites (db.js, delete-service, index.js:214, outbox:363); outbox lease live suite **10/10** (5.6 s); migration tx findings F-PG-05/06 | PARTIALLY VERIFIED (migrations chain broken post-seed) |
| 3 | Constraints | 501 constraints inventoried; `migrate-pg-constraints` **14/14** (79 ms); seed FK/tenant checks 40/40 (orphan + cross-tenant rejected) | VERIFIED (E3 scope) |
| 4 | Indexes | 502 indexes; hot-path EXPLAIN captured (Index Scan on `grades_y2026_school_id_idx`, `attendance_y2026_school_id_idx`; Append+seq on empty 2025 partitions); suites wave3-query* assert index-backed paths (47 checks green) | VERIFIED (E3 scope) |
| 5 | N+1 | No `await db.query` inside loops found (grep); the N+1-*shaped* cost is in-memory: A-01/A-02 whole-collection scans (measured, F-PG-01/02) | PARTIALLY VERIFIED (PG-side clean; store-side defect reproduced) |
| 6 | Pool | max=20 default, connTimeout 3000 ms; `queryRead` = replica-only else primary; A-03: pool pinned at 20, latency curve §4, no errors ≤c64 | PARTIALLY VERIFIED (F-PG-03) |
| 7 | Concurrency | `phase2-occ-multi` **EXIT 0** (9.8 s, Redis multi-instance OCC); outbox lease 10/10; A-03 curve | VERIFIED (E3 scope) |
| 8 | Deadlocks | Outbox `FOR UPDATE SKIP LOCKED` (outbox.js:284,305) exercised live 10/10; ids advisory-lock bootstrap; no deadlock/abort observed in any suite run | PARTIALLY VERIFIED (no adversarial deadlock stress performed) |
| 9 | Stale reads | **Runtime:** PG=102 schools vs endpoint=2 until restart (F-PG-02); `stale-path-contract` **5/5** (28 ms) covers file-path staleness contracts | VERIFIED that the mirror-stale behavior exists (it is the A-02 defect) |
| 10 | Race conditions | A-04 memory: 299/300 dups (reproduced); PG control 0/300; id-collision suite green but mock; OCC suites green | PARTIALLY VERIFIED (memory path defect reproduced; PG path good) |
| 11 | Transaction boundaries | Migration boundary defects: 009 non-idempotent + ledger/persist mismatch (F-PG-06), 012 procedure COMMIT vs implicit txn (F-PG-05); suite R21 atomic-rollback check passed before final FATAL; seed runs statement-at-a-time | PARTIALLY VERIFIED (defects reproduced) |
| 12 | Read/write consistency | `queryRead` used at only 5 sites vs 38 raw reads; no replica configured → no split-brain risk here; delta-sync watermark (`pull.js` MAX(chg_id)) present; A-02 demonstrates **read-your-write violation** against PG on the mirror path | PARTIALLY VERIFIED (mirror inconsistency reproduced; replica N/A) |

## 7. Suite inventory this session (live PG/Redis @4bff3bc, walls measured)

| Suite | Result | Wall |
|---|---|---|
| `pg-relational-seed.js` | 40/40 PASS (but see F-PG-06) | 1254 ms |
| `wave3-query.js` / `query2` / `query3` / `parity` | 13/13, 13/13, 25/25, 20/20 PASS | 149/137/108/188 ms |
| `wave10-query-audit.js` | **13/14 FAIL (QA13)** | 33 ms |
| `migrate-pg-constraints.js` | 14/14 PASS | 79 ms |
| `schema-migrations-live-pg.test.js` | **FAIL — FATAL at 009 (post-seed DB)** | 687 ms |
| `outbox-lease-race-live.js` | 10/10 PASS (live Redis+PG) | 5603 ms |
| `id-collision.js` | PASS (mock nextval — see A-04) | 103 ms |
| `data-integrity-occ-migration.js` | PASS | 60 ms |
| `wave23-reports-pg.js` | **FAIL — 2D000 on 012 (F-PG-05)** | 360 ms |
| `wave23-reports-sql.js` | 110/110 PASS | 45 ms |
| `phase2-occ-multi.js` | PASS | 9818 ms |
| `schema-migrations-ledger.test.js` | 8/8 PASS (in-memory unit — contrasts with live F-PG-06) | 34 ms |
| `stale-path-contract.js` | 5/5 PASS | 28 ms |
| `migrate-ledger.js up` (fresh) / (post-seed) | **21/21 OK** / **EXIT 1 at 009** | — |

Not run this session (gaps, not skips-by-choice): remaining non-DB suites, `run-all-tests.sh` full sweep, any E4/physical-infra items. No item above was counted green from inspection.

## 8. Explicit non-claims

- No performance PASS anywhere: the measured curves **fail** the patterns under test; A-03's failure mode was not reached (hence PARTIALLY VERIFIED, not VERIFIED).
- No `CERTIFIED`. No `VERIFIED` beyond the scoped E3 statements above. **E4 NOT VERIFIED** (no physical infra in scope).
- Fixture is demo-scale (`tools/relational-seed-manifest.json`: "NOT a national dataset"); absolute ms numbers are machine-specific; the **scaling shape** is the finding.
- No read replica existed, so `queryRead`-without-replica behavior equals primary (documented in F-PG-03).

## 9. Roadmap Reconciliation Required

Findings F-PG-01..F-PG-05 and F-PG-06 map to carryover rows A-01..A-04 (Medium) plus migration/test-infra defects. Per register rules I do **not** upgrade any roadmap status; reconciliation is flagged for the Tech Lead / register owner.

## 10. Files

- This report: `/home/user/ARENA6_POSTGRES_SPECIALIST_REPORT_4bff3bc.md`
- Probes (untracked in `p2/tools/`): `ap-fixture.js` (scale fixture), `bench-ap.js` (endpoint/concurrency bench), `a04-repro.js` (A-04 race harness, memory + PG arms).
- Prior mission deliverable (kept): `/home/user/ARENA6_SECURITY_AUDIT_REPORT_5d4a48f.md`
- Raw logs in `/tmp/ap_*.log` (ephemeral).
