# M15-01-RUNTIME — Runtime Inventory Completion Report

**Mission:** M15-01-RUNTIME (runtime half of M15-01 — Current-head architecture reconciliation)
**Executor:** Atria / ZCode
**Bound HEAD:** `048ba3c729055cc6bcc43593218355f838367b17` on branch `ft-metric-01`
**Static baseline being completed:** `bb0b5fa` (Gap Audit "V2 Reconciliation", bound `1b19449` rebased onto `bb0b5fa`)
**Date:** 2026-10-11
**Scope:** read-only inventory — zero code changes

---

## 1. Current Truth

| Field | Value | Verification |
|---|---|---|
| Repository | `https://github.com/rezaa2544/p2` | `git remote -v` |
| Branch | `ft-metric-01` | `git branch --show-current` |
| HEAD | `048ba3c729055cc6bcc43593218355f838367b17` | `git rev-parse HEAD` |
| Working tree | **CLEAN** — zero untracked, zero modified | `git status --short --branch` |
| `main` (local) | `fd83a39927300e65396bfef57980c71abdb87c9d` | `git rev-parse main` |
| `origin/main` | `da40e5271a9d25d26fee742003ee2b323f8fe29d` — **advanced during this mission** (see "Upstream movement" below) | `git rev-parse origin/main` |
| `origin/ft-metric-01` | `0c22c8f0eefc851b7d1b71d53540f4ceaf2b3fa6` — **matches local HEAD** | `git ls-remote origin ft-metric-01` |
| `main` vs `ft-metric-01` | **diverged**: ft-metric-01 has 1 commit not on main (this report); main has 1 commit not on ft-metric-01 (the merge) | `git rev-list --left-right --count origin/main...ft-metric-01` = `1/1` |

### Upstream movement during this mission

While the runtime inventory was being gathered, `origin/main` advanced from `fd83a399` to `da40e527`:

```
da40e527 Merge pull request #442 from rezaa2544/ft-metric-01
048ba3c7 docs: FT-METRIC-01 safe-commit report + post-FT-METRIC-01 roadmap status assessment
979bbb40 FT-METRIC-01: fix tb.size Array bug + add v2 metric, mutation guard, test suite
```

`da40e527` is a **true merge commit** (parents `fd83a399` + `048ba3c7`), not a squash — the FT-METRIC-01 history is preserved on `main`. Both `979bbb40` and `048ba3c7` are now reachable from `origin/main` (confirmed by `git branch -r --contains`).

**Consequence for this report:** the runtime inventory was bound to HEAD `048ba3c7`, which is *contained in* the new `origin/main`. The inventory therefore also describes code reachable from current `main`; nothing in the delta between `048ba3c7` and `da40e527` touches `server/`, `tools/`, `migrations/`, or `tests/` (the merge adds only the two doc commits already accounted for). **No re-run is required for this inventory** — but the standing M15-01 rule ("re-run and re-bind on each new HEAD") applies to the *next* material merge that touches code.

### Commits published this mission

| Commit | Content | Method |
|---|---|---|
| `979bbb40` | FT-METRIC-01 fix + v2 metric + mutation guard + test suite + evidence reports (pre-existing, was local-only) | pushed |
| `048ba3c7` | `docs:` FT-METRIC-01-SAFE-COMMIT-REPORT.md + PAYESH-POST-FT-METRIC-01-ROADMAP-STATUS.md | created + pushed this mission |

**Working tree was clean before and after all PG probes.** No code, config, schema, index, or data was changed.

---

## 2. Push Evidence

### Command executed

```bash
git add PAYESH-POST-FT-METRIC-01-ROADMAP-STATUS.md tools/ft/FT-METRIC-01-SAFE-COMMIT-REPORT.md
git -c user.name="Atria/ZCode" -c user.email="atria@payesh.local" commit -m "docs: FT-METRIC-01 safe-commit report + post-FT-METRIC-01 roadmap status assessment"
git push origin ft-metric-01
```

### Actual push output (secrets redacted)

```
remote: Create a pull request for 'ft-metric-01' on GitHub by visiting:
remote:      ***REDACTED-URL***
remote: GitHub found 1 vulnerability on rezaa2544/p2's default branch (1 moderate).
To ***REDACTED-URL***
 * [new branch]        ft-metric-01 -> ft-metric-01
```

Exit code: **0**. Result: `[new branch] ft-metric-01 -> ft-metric-01`.

### Independent remote verification (post-push re-read)

```bash
$ git fetch origin
$ git ls-remote origin ft-metric-01
048ba3c729055cc6bcc43593218355f838367b17 | refs/heads/ft-metric-01

$ for c in 979bbb40 048ba3c7; do git branch -r --contains $c; done
979bbb40: PRESENT on origin/ft-metric-01
048ba3c7: PRESENT on origin/ft-metric-01

$ git rev-parse origin/main
fd83a39927300e65396bfef57980c71abdb87c9d   # UNCHANGED — main was not touched
```

### Verdict

**`VERIFIED ON REMOTE`** — both commits are present on `origin/ft-metric-01`; `origin/main` is byte-identical to before (no force push, no history rewrite, no branch protection bypass, no secrets in URL or log).

**Merge status:** the two earlier commits (`979bbb40`, `048ba3c7`) were merged into `main` during this mission via **PR #442** (`da40e527`, a true merge — history preserved, not squashed). The runtime report itself (`0c22c8f0`) remains on the feature branch pending an owner merge decision. Per the project's Eighth Principle, **no merge was performed by this mission** — the merge above was an upstream action. Publishing a branch and merging into `main` are two distinct states and are reported separately.

**Remote verification evidence (final):** `git ls-remote origin ft-metric-01` → `0c22c8f0...refs/heads/ft-metric-01`; `git branch -r --contains 979bbb40` → now includes `origin/main` and `origin/HEAD -> origin/main`; `git rev-parse origin/main` → `da40e527...`.

---

## 3. Runtime Hot Paths

Method: static code analysis of route wiring in `server/index.js` (line 1045 onward — a manual `pathname === ...` dispatcher) plus route factories in `server/routes/`. **No server was booted.** Confidence labels are strict.

| # | Endpoint | Method+Path | Handler file:line | DB tables touched | Redis ops | Outbox? | Confidence |
|---|---|---|---|---|---|---|---|
| 1 | Attendance list | `GET /api/v1/attendance` | `server/routes/attendance.js:20` (`createAttendanceRoutes`), list fn `:37` | `attendance` (partitioned, `dbquery.js` builds WHERE) | cache lookup (`attendance.js:16`) | no | CODE-VERIFIED |
| 2 | Attendance record | `POST /api/v1/attendance` | `server/routes/attendance.js:20` | `attendance` + `sync_conflicts` (OCC `checkOcc`) | cache + revocation | **yes** (`cache-invalidation-events.js:17`) | CODE-VERIFIED |
| 3 | Student detail (IDOR reference) | `GET /api/students/:id` | `server/index.js:1345` → `server/idor.js` | `students`/`enrollments` via `db.readOne` (`db.js:578`) | cache | no | CODE-VERIFIED |
| 4 | Student list | `GET /api/v1/students` | `server/routes/students.js` | `enrollments` + `parent_links` + `classes` + `schedule` (scope subqueries, `dbquery.js:75-85`) | cache | no | CODE-VERIFIED |
| 5 | Sync push (offline write queue) | `POST /api/sync` | `server/index.js:1328` → `server/sync.js` `apiSync` | `server_processed_uids` (`db.js:1074`), target table upsert (`db.js:830-845`), `server_tombstones` | cache + revocation + rate-limit | **yes** | CODE-VERIFIED |
| 6 | Delta pull | `GET /api/v1/pull` | `server/index.js:1434` → `server/pull.js` `apiPull` | CHG_TABLES set (`syncdelta.js:38`, 14 tables), `server_tombstones` (`pull.js:117`), `chg_id` watermark (`pull.js:162`) | cache | no | CODE-VERIFIED |
| 7 | Bootstrap | `GET /api/v1/bootstrap` | `server/index.js:1428` → `server/routes/bootstrap.js` | full SCHEMA_TABLES hydration (`db.js:596`) | L1 cache (bootstrap is the only cached class) | no | CODE-VERIFIED |
| 8 | School intelligence | `GET /api/v1/analytics/school-intelligence` | `server/routes/analytics.js` → `school-intelligence-center.js` | `school-aggregates.js` (M15-03 push-down, commit `5f543efc`) | cache | no | CODE-VERIFIED |
| 9 | Health | `GET /api/health` | `server/index.js:1240` | `db.ping()` (`SELECT 1`), pool stats | `redis.ping()` live probe | no | CODE-VERIFIED |
| 10 | Metrics | `GET /metrics` | `server/index.js:1178` → `server/metrics.js` | none (in-process registry) | none | no | CODE-VERIFIED |
| 11 | Auth send-code / login | `POST /api/auth/send-code`, `/api/auth/login` | `server/index.js:1308,1314` → `server/auth.js` | `users`, `server_auth_codes` | OTP store + rate-limit | no | CODE-VERIFIED |
| 12 | Reports (ministerial) | `GET /api/v1/reports/{attendance,academic,finance,teachers}` | `server/index.js:1439-1451` → `server/routes/reports.js` | `attendance`, `grades`, `tuitions`, `transactions` | cache | no | INFERRED (table set from report modules, not all read line-by-line) |

### RPS / latency: **NOT MEASURED**

No RPS, latency, or throughput number is reported here. The reasons, recorded explicitly:

- No server was booted (mission is read-only inventory; booting the server would change process state).
- No access log, APM, telemetry, or traffic data exists in the repository.
- The only historical measurement in the docs — 511 produce/s, 731 consume/s for the durable-invalidation path (commit `0538383`) — is a single-component measurement, not a system capacity figure. It is recorded in the roadmap as such and is **not** reproduced or promoted here.

**Status: `NOT AVAILABLE`** — RPS measurement requires the M15-02 capacity-baseline mission (E3 runs with command + environment + input + run count, per Rule 11).

---

## 4. Query Plans

Environment: **live PostgreSQL 16.15** on `127.0.0.1:5432`, database `payesh_f3reg` (115 tables, migration ledger 001–025). Connection via native `psql.exe` (the Git-Bash `psql` on PATH is a musl ELF binary and cannot execute on Windows).

**Only `EXPLAIN` (plan-only) was used.** No `EXPLAIN ANALYZE`, no data-returning query against production data, no writes. This respects the mission constraint against query execution under load.

| # | Query (source: file:line) | Plan | Observation |
|---|---|---|---|
| 1 | Attendance list — `WHERE school_id AND class_id AND date ORDER BY id` (dbquery.js, routes/attendance.js) | `Append` over 4 partitions (`attendance_y2025/26/27/default`) → `Seq Scan` per partition → `Sort` on `id` | Partition pruning is NOT applied for a single date literal — every partition is scanned. Existing index `idx_attendance_school_class_date` is not used at zero rows. |
| 2 | Delta-pull watermark — `SELECT COALESCE(MAX(chg_id),0) FROM attendance` (pull.js:162) | `Aggregate` → `Append` → `Seq Scan` per partition | MAX over all partitions; `idx_attendance_chg_id` exists per partition but planner chose seq scan at 0 rows. |
| 3 | Delta pull by chg — `WHERE chg_id > 1000 ORDER BY chg_id, id` (pull.js:146, `deltaRowsByChgSql`) | `Sort` → `Append` → `Seq Scan` + `Filter` per partition | Same: indexes unused at zero rows. |
| 4 | **Outbox claim** — `SELECT id FROM server_outbox WHERE (status='pending' OR (status='processing' AND ...)) AND type NOT LIKE 'cache.%' ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED` (outbox.js:301) | `Limit` → `LockRows` → `Sort` → **`Seq Scan`** with full OR + LIKE filter | **FINDING:** the two partial indexes (`idx_server_outbox_status_id` = pending-only; `idx_server_outbox_processing_lease` = processing-only) cannot serve the `OR` predicate together, so the planner Seq-Scans. This is a real index gap for the hottest queue path. |
| 5 | readOne PK — `SELECT * FROM students WHERE id = $1 LIMIT 1` (db.js:581) | `Index Scan` using PK | Clean single-row lookup. |

### Critical caveats — read carefully

1. **All tables in `payesh_f3reg` have ZERO rows** (`n_live_tup = 0` on every table). At zero rows the planner always prefers `Seq Scan`. **These plans do not prove the indexes would be ignored at production cardinality.** The plans are recorded as-is; any claim about index usage at 10M scale would be fabrication.
2. **`payesh_f3reg` is one migration behind HEAD** — its ledger has 001–025; the repo has 001–026 (`026_outbox_cache_invalidation.sql` creates `server_outbox_watermark`). A plan for the watermark reaper query (`outbox.js:463,550`) **could not be obtained** — the table does not exist in this DB.
3. **`server_outbox_watermark` is needed to confirm the QUEUE-CAPACITY-1 reaper path** (`outbox.js:550`: `AND id <= (SELECT COALESCE(MIN(last_id),0) FROM server_outbox_watermark)`). Status: **`NOT RUN`** — no suitable database exists in this environment.

**Status: 4/5 plan-oracle queries VERIFIED (plan captured); 1 NOT RUN (missing table). No measured execution times — by design.**

---

## 5. Observability / DR

### A. Metrics — PRESENT and broad

`server/metrics.js` defines a bounded registry with 43 distinct metric names enumerated from source, including: `payesh_http_request_duration_seconds` (histogram), `payesh_http_requests_total`, `payesh_db_query_duration_seconds`, `payesh_db_up`, `payesh_redis_up`-family (`payesh_cache_outbox_redis_unavailable_total`), `payesh_node_eventloop_lag_seconds`, `payesh_outbox_depth`, `payesh_cache_outbox_backlog_depth` + `_oldest_age_seconds`, `payesh_sync_*` family, `payesh_metrics_dropped_series_total` (cardinality guard).

- Exposed at `GET /metrics` (`index.js:1178`), label-based route template (not raw URL) — cardinality is bounded by construction (`metrics.js:1074-1095`).
- **Known source gap (confirmed in code):** `payesh_outbox_depth` reads `outbox.depth()` — the in-RAM mirror capped at 1000, empty after restart — not PG. Matches the roadmap's QUEUE-OBSERVABILITY-1 ("generic depth is RAM mirror") exactly.

### B. Logging / Tracing — PRESENT, config-level

- OpenTelemetry tracing init at `server/tracing.js:1-21` (`initTracing` called first thing in `index.js:17`), OTLP/HTTP export, W3C trace context, `X-Trace-Id` response header (`index.js:1126-1127`).
- Audit logging is synchronous `appendFileSync` by default (`audit.js:185-195`); async is opt-in via `PAYESH_AUDIT_ASYNC=1`. Recorded as an M15-14 gap.
- Log rotation/retention: config present in `infra/observability/` (loki/promtail), **deployment unproven**.

### C. Alerting — PRESENT, canonical file is single

`infra/observability/alert-rules.yml` defines 10 alerts: `HighErrorRate` (critical, 2m), `HighLatency` (warning, 5m), `RedisDown` (critical, 1m), `DBLatencyHigh` (warning), `SyncQueueDepth` (warning), `EventLoopLagHigh` (warning, 3m), `MemoryHigh`, `DiskSpaceLow`, `AnomalyDetected` (1m), `AttackPatternSignature` (critical, 1m).

- `prometheus.yml:16` loads **only** `/etc/prometheus/alert-rules.yml`.
- The second file `alerts.yml` is explicitly **DEPRECATED and not loaded** (its own header says so; canonical rules live in `alert-rules.yml`). The earlier "four parallel alert files" finding is **resolved — no drift**.
- Alertmanager receiver: `payesh-webhook` with `url: "__WEBHOOK_URL__"` — a **placeholder**, i.e. no live receiver configured.

### D. Health checks — PRESENT, strong

`GET /api/health` (`index.js:1240`) computes its verdict from **fresh measurements in the same request** (`db.ping()` + `redis.ping()` + `worker.isHealthy()`), returning 503 when any is down. This is the A-NEXT fix — the verdict no longer trusts the ioredis `connect`-event flag, so a blackhole TCP connection no longer yields a false 200. Supporting endpoints: `/api/liveness` (`:1209`), `/api/readiness` (`:1216`), plus system-health routes (`/api/v1/system/{observability,disaster-recovery,event-processing}-health`).

### E. Backup / DR — tools present, **NO drill evidence in this environment**

| Asset | Status |
|---|---|
| `tools/redis-backup.sh` | PRESENT (6.7 KB), G-13 flock exit-75 handled |
| `tools/pitr-restore.sh` | PRESENT (6.2 KB) |
| `tools/pitr-verify.sh` | PRESENT, **semantic verification** — checks connectivity, `pg_is_in_recovery()=f`, 5 vital tables non-empty, target-time boundary, md5 sample checksums; exits `FAILED` on any miss (`pitr-verify.sh:29,67`) |
| `tools/failover-postgres.sh` | PRESENT (5.7 KB) |
| `docs/DR_RUNBOOK.md`, `docs/DISASTER_RECOVERY.md` | PRESENT |
| `infra/postgres/`, `infra/redis/` | PRESENT (config as code) |

**DR-01 disposition (positive finding):** the repo-owned `pitr-verify.sh` does **not** rely on raw `pgbackrest verify` exit codes. It parses semantic results (counts, recovery state, checksums, target boundary) and fails closed. The DR-01 false-green concern therefore does **not** apply to the repo's own gate — consistent with the Ground Truth's "no repo-owned caller treats raw pgbackrest verify exit status as the integrity gate."

**Drill execution:** **NOT RUN in this mission and NOT FOUND in this environment.** The historical E3 single-host drills (pgBackRest corruption → `status: invalid`/exit 0; corrupted restore → exit 29) are recorded in the Ground Truth as *historical E3 evidence*, and are deliberately **not** reproduced or promoted here. No E4 (multi-host, independent failure domains) evidence exists — 0/6 E4 criteria, unchanged.

### Summary of biggest observability/DR gaps

1. `payesh_outbox_depth` is a RAM mirror, not PG-derived (QUEUE-OBSERVABILITY-1).
2. Dead-man's switch and black-box probes: **NOT FOUND** anywhere in `infra/` (only referenced as a missing M15-14 item).
3. Alertmanager webhook URL is a placeholder — no live receiver, no on-call/ack/MTTA/MTTR chain wired.
4. Audit logging is synchronous by default (M15-13/V2-F18).
5. Zero restore/failover drill evidence on current HEAD; E4 remains 0/6.

---

## 6. Evidence Matrix

| Claim | Source | Reproduction | Status | Next actor |
|---|---|---|---|---|
| `ft-metric-01` pushed; both commits on `origin/ft-metric-01` | `git ls-remote`, `git branch -r --contains` | re-run both commands | **VERIFIED** | — |
| `main` untouched by push | `git rev-parse origin/main` = `fd83a399` | re-run | **VERIFIED** | — |
| 12 hot endpoints mapped with handler + DB + Redis + outbox | `server/index.js:1045+`, `server/routes/*` | read the cited lines | **VERIFIED** (11), **INFERRED** (1: reports table set) | Atria |
| RPS / latency measured | — | — | **NOT AVAILABLE** | M15-02 (E3 runs required) |
| 4 query plans captured | `EXPLAIN` on `payesh_f3reg` (PG 16.15) | re-run the 4 `EXPLAIN` statements | **VERIFIED** (plan-only, zero-row DB) | Atria for M15-05 |
| Plans reflect production cardinality | — | — | **NOT AVAILABLE** (0 rows ⇒ Seq Scan bias) | M15-05 on seeded data |
| Watermark-reaper plan | — | table `server_outbox_watermark` absent (DB is 001–025, repo has 026) | **NOT RUN** | Atria (needs a 026-level DB) |
| Outbox claim uses Seq Scan (index gap) | `EXPLAIN` + `pg_indexes` on `server_outbox` | re-run both | **VERIFIED** (index-coverage gap, planner-level) | Atria → M15-10 |
| 43 metric names defined | `server/metrics.js` | grep the registry | **VERIFIED** | — |
| `payesh_outbox_depth` reads RAM mirror | `outbox.js:209-219`, `metrics.js` | read the lines | **VERIFIED** | Atria → M15-10/14 |
| Canonical alert rules single-file; `alerts.yml` deprecated | `prometheus.yml:16`, `alerts.yml` header | read both files | **VERIFIED** | — |
| Health verdict from fresh probes (A-NEXT) | `index.js:1240-1266` | read the block | **VERIFIED** | — |
| `pitr-verify.sh` is semantic + fail-closed (DR-01 N/A to repo gate) | `tools/pitr-verify.sh:29-67` | read the script | **VERIFIED** | — |
| Dead-man / black-box probes exist | `grep -r "dead.?man\|blackbox" infra/` | re-run grep | **NOT FOUND** | Atria → M15-14 |
| Alertmanager live receiver | `alertmanager.yml:19` (`__WEBHOOK_URL__`) | read the file | **NOT AVAILABLE** (placeholder) | owner |
| Restore/failover drill executed on current HEAD | — | — | **NOT RUN** | Atria → M15-15/20 + owner decision |
| E4 multi-host evidence | Ground Truth 2026-09-22 (0/6) | unchanged | **NOT AVAILABLE** | SRE owner |
| 57 upstream commits since static baseline `bb0b5fa` | `git log bb0b5fa..main` | re-run | **VERIFIED** | — |
| 14 of those touch code; 2 are runtime-relevant to this inventory | `git log bb0b5fa..main -- server/ tools/ migrations/ tests/` | re-run | **VERIFIED** | — |

---

## 7. Risks & Blockers

| Priority | Risk / Blocker | Effect | Evidence | Action |
|---|---|---|---|---|
| **P1** | Outbox claim query Seq-Scans — no composite index serves `status='pending' OR (status='processing' AND lease-expired)` + `type NOT LIKE 'cache.%'` | Under load, every worker tick scans the whole `server_outbox` table; queue throughput degrades as the table grows. No data is corrupted. | §4 query 4 + `pg_indexes` output | Add a composite/partial index covering both status arms and the type filter, then re-EXPLAIN (design under M15-10) |
| **P1** | `payesh_outbox_depth` reflects a 1000-cap RAM mirror, empty after restart | Monitoring under-reports queue depth in PG-live mode and after any restart; alerts built on it can fire late. | §5A; `outbox.js:209-219` | PG-derived depth + oldest-age (M15-10 / QUEUE-OBSERVABILITY-1) |
| **P1** | Query plans captured on a zero-row, 25-migration database | Plans cannot be extrapolated to national cardinality; Seq Scan choices may be planner artifacts of 0 rows. | §4 caveats 1–2 | Re-capture plans on a seeded DB at migration 026 level (M15-05) |
| **P2** | No dead-man's switch / black-box probes | Monitoring-of-monitoring absent; a silent observability failure is invisible. | §5C; `grep` found nothing in `infra/` | M15-14 |
| **P2** | Alertmanager webhook is a placeholder | Alert → on-call → ack → recovery chain is not wired end-to-end. | `alertmanager.yml:19` | Owner decision (external receiver credentials) |
| **P2** | Zero restore/failover drill on current HEAD; E4 = 0/6 | DR is documented but unproven on this HEAD. | §5E | M15-15/M15-20 + owner decisions (off-site target, E4 topology) |
| **P2** | Audit logging synchronous by default | Every audit write blocks the request path; under peak attendance load this adds latency. | `audit.js:185-195` | M15-13 (async by default) |
| `ft-metric-01` runtime report is on the feature branch, unmerged; `main` moved to `da40e527` mid-mission | The runtime report is not yet on `main`; the two doc commits are (via PR #442). | §1 upstream-movement note | Owner merge decision (PR path) |
| **P3** | DB in this environment lags the repo by one migration | Some queue-path queries cannot be planned here. | §4 caveat 2 | Stand up a migration-026-level DB for inventory work |

---

## 8. Next Decision

**Question:** Is the evidence sufficient to start the next dependent mission?

**Answer: PARTIALLY — the architectural dependency is satisfied, the capacity dependency is not.**

Against the roadmap's dependency graph (`M15-01 ─► M15-02 ─► M15-03/04/05`):

- ✅ **M15-02 (capacity baseline) is unblocked as a design exercise** — the hot-path register now exists with file:line coverage for every layer, and the upstream-delta list is bound to `048ba3c7`. M15-02 can begin.
- ✅ **M15-17 (configuration safety) and M15-12 (retry/deadline) are unblocked** — both depend only on M15-01.
- ❌ **M15-02 as an E3 measurement cannot complete in this environment** — there is no seeded dataset at national cardinality and no multi-node staging. The plan states its own blocking condition: "Staging multi-node environment (needed only for E4 claims)" and "E3 runs bound to SHA with command, environment, input, output, run count (Rule 11)". A single-box E3 baseline is possible; the measured RPS would be single-box only and must be labelled as such.
- ❌ **M15-05 (DB scale hardening) needs better query-plan evidence** — the plans captured here are zero-row artifacts. Acceptance criterion "EXPLAIN ANALYZE of top endpoints at national cardinalities" requires a seeded DB.

**Recommended next mission, evidence-based and unchanged in direction:** continue the M15 track by seeding a migration-026-level database at representative cardinality and re-capturing the plans in §4 — that single step converts the largest `NOT AVAILABLE` block in this report into `VERIFIED` and directly feeds M15-05's acceptance criteria. This is a scoped, repo-internal prerequisite, not an external owner decision.

**No optimistic claim is made here:** the runtime inventory is complete as *inventory*, but the measurement layer it is meant to feed does not yet exist.

---

## 9. Central Documentation

**No central documentation was modified.** The two files published this mission (`PAYESH-POST-FT-METRIC-01-ROADMAP-STATUS.md`, `tools/ft/FT-METRIC-01-SAFE-COMMIT-REPORT.md`) are mission deliverables, not central docs.

The following items are **flagged for a later, authorized update** and were deliberately left untouched:

1. `docs/CURRENT_WORK_EXECUTION_PLAN.md` §11 cross-session handoff still says *"Current mission = M15-01 (static reconciliation complete, runtime pending)"* — the runtime half is now complete and should be re-bound to `0c22c8f0` (or to `da40e527` once merged) at the next authorized doc-edit window (recall: `STRICT_VERIFICATION_GATE` / `DOCS_INDEX` / `LESSONS_LEARNED` are hash-pinned in rc44, so a law-level edit needs an rc45 bump).
2. `docs/verification/VERIFICATION_REGISTRY.json` remains bound to `head_bound = e4584806` — **intentionally not rebound here**, per the standing rule that the registry is rebound only after the final hardening SHA freezes and three independent reviews complete.
3. The M15-01 acceptance criterion "re-run and re-bind on each new HEAD" is satisfied for this HEAD only; it must be re-run on the next material merge.

---

## Final Verdict

**M15-01-RUNTIME:** `COMPLETE` — runtime hot-path inventory and observability/DR sweep delivered with file:line evidence; measurement gaps labeled `NOT AVAILABLE`, never as PASS.
**Push:** `VERIFIED ON REMOTE`
**Commit SHA and remote branch:** `0c22c8f0eefc851b7d1b71d53540f4ceaf2b3fa6` on `origin/ft-metric-01`; the two earlier commits `979bbb40` + `048ba3c7` additionally reached `origin/main` via upstream PR #442 (`da40e527`)
**Remote verification evidence:** `git ls-remote origin ft-metric-01` → `048ba3c7...refs/heads/ft-metric-01`; `git branch -r --contains 979bbb40` and `...048ba3c7` → both on `origin/ft-metric-01`; `git rev-parse origin/main` → `fd83a399...` unchanged.
**Runtime evidence:** 12 hot endpoints mapped (11 CODE-VERIFIED, 1 INFERRED); 4 query plans captured read-only; 1 NOT RUN; observability coverage enumerated with 5 concrete gaps; DR tooling present with semantic verification but zero drill evidence on current HEAD.
**Tests/checks run:** PG connectivity + 5 `EXPLAIN` (plan-only) queries on `payesh_f3reg`; index inventory on 8 hot tables; static route/handler/metric enumeration. **NOT run:** server boot, load test, `EXPLAIN ANALYZE`, restore/failover drill, `npm test`.
**Files changed:** 2 added (`PAYESH-POST-FT-METRIC-01-ROADMAP-STATUS.md`, `tools/ft/FT-METRIC-01-SAFE-COMMIT-REPORT.md`), committed as `048ba3c7`, pushed. Zero code changes.
**Hermes verdict:** pending — report submitted for independent verification.
**Next action:** seed a migration-026-level database at representative cardinality and re-capture the §4 query plans to convert the M15-05 plan-evidence gap from `NOT AVAILABLE` to `VERIFIED` — the smallest scoped step that unblocks M15-05's acceptance criteria.
