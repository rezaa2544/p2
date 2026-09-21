# Chat 3 — Historical Findings vs. Current-HEAD Impact Audit

**Audit Date:** 2026-09-21  
**Auditor Role:** Chat 3 (Independent Architecture & Zero-Trust Infrastructure Auditor)  
**Repository:** `rezaa2544/p2`  
**Current HEAD Baseline:** `be05905d9747f51647e87813f4e374793421122b`  
**Base Commit of Historical Chat 3 Work:** `138cd1d9b03278fcf15c6476faa497fe89d275af`  
**Historical Discovered Files (Unpushed / Local-Only in Chat 3):**
- `tests/outbox-concurrency-live-pg.test.js`
- `tests/worker-health-observability.test.js`
- `tests/redis-down-alerting.test.js`
- `tests/runtime-multiworker-crash-proof.test.js`
- `tests/cold-cache-revocation.test.js`

**Absolute Ground-Truth Governance Rule:**
```text
NOT IN CURRENT REPOSITORY — DO NOT RECONSTRUCT
```
Per standing governance policy, this mission does **not** reconstruct, hallucinate, or synthesize lost commit history or fake test replacements. Instead, this audit evaluates the substantive architectural, security, and functional impact of Chat 3's historical findings directly against the current canonical repository HEAD (`be05905d`).

---

## ۱. Executive Summary & Repository Reality

An exhaustive query of the GitHub REST API across all branches, tags, and commits for `rezaa2544/p2` confirms:
1. **GitHub Remote Upstream Reality:** The 5 test files cited in historical Chat 3 reports have **0 commits on GitHub**. They were authored locally in a sandboxed agent environment and were **never pushed** to `origin/main` due to credential barriers and a subsequent non-fast-forward divergence (78 commits added by other chats between `138cd1d9` and `8e90e5f6`, and currently 83 commits up to `be05905d`).
2. **Current-HEAD Divergence & Defect Reality:** Current `origin/main` (`be05905d`) is in a broken CI state (**Node.js CI Run #1175 FAILED** on step 8: `M1 Runtime Probes & Scrape Regression`).
3. **Relevance of Chat 3 Findings:** Despite the absence of Chat 3's commit objects on remote, **9 of the 12 core architectural defects identified by Chat 3 remain active, reproducible, or unverified in current HEAD (`be05905d`)**.

---

## ۲. Detailed Finding-by-Finding Impact Audit

---

### Finding 1: OUTBOX-002 — `FOR UPDATE SKIP LOCKED` Called Without Transaction Client

- **Historical Claim (Chat 3):**  
  `server/outbox.js:fetchPendingBatch` defines `const q = client || db;` and executes `SELECT ... FOR UPDATE SKIP LOCKED`. In `server/worker.js:tick()`, `fetchPendingBatch(50)` is invoked with no `client` argument (`client=null`). Outside an explicit `BEGIN...COMMIT` transaction block, PostgreSQL autocommits the query immediately upon execution and releases all row-level locks. Consequently, concurrent worker processes experience zero claim exclusivity, leading to duplicate processing and race conditions.

- **Current HEAD Evidence (`be05905d`):**  
  - Source File: `server/outbox.js:221-233`
    ```javascript
    async function fetchPendingBatch(batchSize = 50, client = null) {
      if (isPg()) {
        const q = client || db;
        const res = await q.query(
          `SELECT id, type, collection, record_id, actor_id, version, payload, retry_count, last_error
           FROM server_outbox
           WHERE status = 'pending'
           ORDER BY id ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED;`,
          [Math.min(500, Math.max(1, batchSize))]
        );
        return (res && res.rows) || [];
      }
    ```
  - Source File: `server/worker.js:56`
    ```javascript
    events = await outbox.fetchPendingBatch(50);
    ```

- **Current Implementation & Test Status in HEAD:**  
  Neither `tests/outbox-concurrency-live-pg.test.js` nor `tests/runtime-multiworker-crash-proof.test.js` exists in current HEAD. The active test suite has **zero multi-worker concurrency tests** validating row-lock exclusivity against live PostgreSQL.

- **Reproduction on Current HEAD:**  
  Two concurrent workers invoking `tick()` against `server/worker.js` with 10 pending events in PostgreSQL 17 both fetch the identical 10 events because neither worker marks them `processing` inside an open transaction.

- **Risk:**  
  **CRITICAL (P0 Data Integrity / Duplicate Execution).** Under horizontal scaling ($N > 1$ worker instances), outbox events (including delete cascades, audit emissions, and webhooks) are processed multiple times concurrently.

- **Status:** **ACTIVE DEFECT / CONFIRMED IN CURRENT HEAD**

- **Required Action:**  
  Refactor `fetchPendingBatch` to accept an atomic claim CTE:
  ```sql
  WITH claimed AS (
    SELECT id FROM server_outbox
    WHERE status = 'pending'
    ORDER BY id ASC LIMIT $1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE server_outbox o
  SET status = 'processing', locked_at = NOW(), worker_id = $2
  FROM claimed c WHERE o.id = c.id
  RETURNING o.*;
  ```

---

### Finding 2: M1 Observability — `publishRuntimeProbes()` & Scrape-Time Gauge Exposition

- **Historical Claim (Chat 3):**  
  Dynamic scrape-time probes were dead paths; `/metrics` failed to refresh `payesh_redis_up`; `redisMod.ping()` return object `{ ok: false }` was truthy in JavaScript, preventing `payesh_redis_up` from dropping to `0` during outages; Alertmanager webhook was an unconfigured placeholder.

- **Current HEAD Evidence (`be05905d`):**  
  - In commit `24e04596`, Chat 1 added `await metrics.publishRuntimeProbes();` to `server/index.js:956`.
  - In commit `b5e3549a`, Chat 2 expanded `ROUTE_EXACT` in `server/metrics.js`.
  - **However, the truthiness bug in `server/metrics.js:591-594` was NOT fixed:**
    ```javascript
    const ok = await _safe(() => redisMod.ping(), false);
    pingMs = Number(process.hrtime.bigint() - t0) / 1e6;
    if (!ok) up = 0;
    ```
    In `server/redis.js:800`, on connection failure `ping()` returns `{ ok: false, error: err.message }`. In JavaScript, an object is always truthy (`!({ ok: false }) === false`). Thus, `if (!ok) up = 0;` never executes!
  - **Current Upstream CI Regression:**  
    In commit `be05905d`, Chat 1 added `tests/runtime-probes-scrape-regression.test.js`. In line 63, the test asserts:
    ```javascript
    assert.ok(res.body.includes('payesh_redis_up 0'), 'Exposition must contain payesh_redis_up 0');
    ```
    In GitHub Actions (Node.js CI Run #1175), Redis is running and healthy (`payesh_redis_up 1`). The test crashes with:
    `AssertionError [ERR_ASSERTION]: Exposition must contain payesh_redis_up 0`.

- **Current Implementation & Test Status in HEAD:**  
  `tests/runtime-probes-scrape-regression.test.js` exists in HEAD, but **it is defective and causes CI to fail** (Run #1175 FAILED). Chat 3's robust dual-state test (`tests/redis-down-alerting.test.js`) is NOT in HEAD.

- **Reproduction on Current HEAD:**  
  Run `REDIS_URL="redis://127.0.0.1:6379" node tests/runtime-probes-scrape-regression.test.js` when Redis is running: crashes with exit 1. Simulate Redis ping failure returning `{ ok: false }`: `payesh_redis_up` reports `1`.

- **Risk:**  
  **HIGH (Operational Blindness & CI Broken).** Broken CI gate on `origin/main`; monitoring reports Redis as UP during real command/connection failures.

- **Status:** **ACTIVE DEFECT & CI BLOCKER IN CURRENT HEAD**

- **Required Action:**  
  In `server/metrics.js:594`, change check to: `if (!ok || ok.ok === false) up = 0;`. Update `tests/runtime-probes-scrape-regression.test.js` to assert dynamic state rather than hardcoding `0`.

---

### Finding 3: WORKER-001 — Health Endpoints Green During Background Worker Stall

- **Historical Claim (Chat 3):**  
  `/api/health` and `/api/readiness` inspect only `redis.ready()` and `db.ping()`. If the background worker thread or event loop stalls, encounters unhandled promise rejections, or stops processing outbox events, health probes still return HTTP 200, preventing orchestrators (Kubernetes/Systemd) from restarting the stalled instance.

- **Current HEAD Evidence (`be05905d`):**  
  - Source File: `server/index.js:1001-1025`
    ```javascript
    const rdy = redis.ready();
    let dbp = { ok: false, driver: 'unknown', alive: false };
    try { dbp = await db.ping(); } catch (e) { ... }
    const dbAlive = !!(dbp && dbp.ok);
    const isHealthy = rdy && dbAlive;
    ...
    return sendJson(res, isHealthy ? 200 : 503, body);
    ```
  - `server/worker.js` does NOT export a stall telemetry status (`is_stalled`, `last_tick_age_ms`).
  - `/api/health` contains zero telemetry regarding worker liveness or queue lag.

- **Current Implementation & Test Status in HEAD:**  
  `tests/worker-health-observability.test.js` is NOT in current HEAD. No active test in HEAD asserts HTTP 503 on worker loop freeze.

- **Reproduction on Current HEAD:**  
  Simulate worker stall by disabling worker ticker or setting event loop lag $>5000\text{ms}$. Send `GET /api/health` -> returns HTTP 200 OK.

- **Risk:**  
  **HIGH (Undetected Outbox Starvation).** Workers silently freeze while Kubernetes keeps routing traffic to the instance.

- **Status:** **CONFIRMED GAP IN CURRENT HEAD**

- **Required Action:**  
  Export worker health telemetry from `server/worker.js` and incorporate `worker.isHealthy()` into `server/index.js:1008`.

---

### Finding 4: SEC-001 / REDIS-001 / G-09 — Cold-Cache Revocation & PostgreSQL SSoT

- **Historical Claim (Chat 3):**  
  JWT revocation is stored in Redis L2 (`revoked:<jti>` and `sessver:<userId>`). On Redis cold-restart, crash, or eviction, revoked sessions fail open across peer nodes until tokens expire. PostgreSQL SSoT (`users.active=0`) must be verified as the authoritative durable killswitch.

- **Current HEAD Evidence (`be05905d`):**  
  - Source File: `server/revocation.js:33-44`
    ```javascript
    async function isRevoked(jti) {
      if (!jti || typeof jti !== 'string') return false;
      try {
        return (await redis.get(DENY_PREFIX + jti)) != null;
      } catch (e) {
        ...
        return false; // Fail-open across nodes on Redis error
      }
    }
    ```
  - Schema File: `server/schema.sql` does NOT have `users.security_version`.
  - Governance Document: `docs/R6_R7_DECISIONS.md` marks R6-A10 as `TARGET/POLICY — NOT IMPLEMENTED`.
  - Authoritative Killswitch: `server/auth.js:127` executes `db.readOne('users', p.sub)` and rejects deactivated users with a 0-second window.

- **Current Implementation & Test Status in HEAD:**  
  `tests/cold-cache-revocation.test.js` is NOT in current HEAD. The cold-restart drill exists only in historical audit logs.

- **Reproduction on Current HEAD:**  
  Revoke token via `revocation.revokeSession(jti)`. Execute `FLUSHDB` on Redis. Call `isRevoked(jti)` from a fresh node instance -> returns `false` (fails open). Deactivate user in PostgreSQL (`users.active = 0`) -> `sessionFrom(req)` returns `null` (401 Unauthorized, immediate 0s mitigation).

- **Risk:**  
  **MEDIUM (Governed Accepted Risk).** Governed under R6-A7/R6-A8 policies, but lacks continuous CI regression coverage for cold-cache flush scenarios.

- **Status:** **CONFIRMED ARCHITECTURAL LIMITATION (GOVERNED)**

- **Required Action:**  
  Maintain PostgreSQL SSoT enforcement. Implement `users.security_version` in Phase 8.4 schema evolution.

---

### Finding 5: G-13 / F-QA-08 — `tools/redis-backup.sh` Lock Contention Fake-Green

- **Historical Claim (Chat 3):**  
  `tools/redis-backup.sh:51` executed `exit 0` upon `flock` acquisition failure, reporting false success to cron and CI when no backup was taken.

- **Current HEAD Evidence (`be05905d`):**  
  - In commit `0d245b9c`, Chat 4 updated `tools/redis-backup.sh:51-56`:
    ```bash
    BACKUP_LOCK_BUSY_EXIT="${BACKUP_LOCK_BUSY_EXIT:-75}"
    exec 9>"${BACKUP_LOCK}"
    if ! flock -n 9; then
      log "اجرای دیگری در جریان است — هیچ پشتیبانی گرفته نشد (کد ${BACKUP_LOCK_BUSY_EXIT})." >&2
      exit "${BACKUP_LOCK_BUSY_EXIT}"
    fi
    ```
  - In `tests/redis-backup.js`, checks `B7`, `B7b`, and `B7c` were added to verify exit code 75 (`EX_TEMPFAIL`).

- **Current Implementation & Test Status in HEAD:**  
  Implemented and tested. `node tests/redis-backup.js` executes and passes **11/11**.

- **Reproduction on Current HEAD:**  
  Acquire lock in external process and invoke `tools/redis-backup.sh` -> returns exit code 75 (non-zero).

- **Risk:**  
  **RESOLVED.** Fake-green eliminated on `origin/main`.

- **Status:** **VERIFIED IN CURRENT HEAD (RESOLVED BY CHAT 4)**

- **Required Action:**  
  None on core logic. (Note: `tests/redis-backup.js` incurs a 15s delay due to unclosed stdio in `spawnSync`; optimize in future test maintenance).

---

### Finding 6: PGB-001 — PgBouncer Connection Scaling (2000 vs 3500 Clients)

- **Historical Claim (Chat 3):**  
  `infra/postgres/pgbouncer/pgbouncer.ini` specified `max_client_conn = 2000` and `default_pool_size = 25`, below the national capacity model requirement of 3,500 clients and 80 server connections.

- **Current HEAD Evidence (`be05905d`):**  
  - In commit `89cec08c`, Chat 1 updated `infra/postgres/pgbouncer/pgbouncer.ini:23-24`:
    ```ini
    max_client_conn = 3500
    default_pool_size = 80
    ```
  - In commit `f37022e1`, Chat 4 updated `tests/ha-config.js` to validate 3500.

- **Current Implementation & Test Status in HEAD:**  
  `tests/wave10-pgbouncer.js` passes **22/22**. `tests/ha-config.js` passes **94/94**.

- **Reproduction on Current HEAD:**  
  Grep `pgbouncer.ini` -> `max_client_conn = 3500`. Run `node tests/wave10-pgbouncer.js` -> 22/22 PASS.

- **Risk:**  
  **CONFIGURATION RESOLVED / MULTI-NODE LOAD TEST GAP.** Parameter locked in config (E3), but empirical 3,500 client concurrency remains unmeasured at E4.

- **Status:** **CONFIG VERIFIED (E3) / E4 LOAD TEST GAP**

- **Required Action:**  
  Execute multi-node synthetic client load test in Phase 8.3.

---

### Finding 7: M2 / DR-001 — PostgreSQL PITR Dependence on pgBackRest

- **Historical Claim (Chat 3):**  
  Physical PostgreSQL PITR restoration (`tools/pitr-restore.sh`) fails immediately with exit code 1 if `pgbackrest` is not installed on the host. Live restore drills cannot run in environments lacking pgBackRest.

- **Current HEAD Evidence (`be05905d`):**  
  - Source File: `tools/pitr-restore.sh:43`
    ```bash
    command -v "${PBR_BIN:-pgbackrest}" >/dev/null 2>&1 || die "FAIL: pgbackrest در PATH نیست..."
    ```
  - Binary `pgbackrest` is NOT installed in standard container image.
  - No physical WAL archive storage is mounted.

- **Current Implementation & Test Status in HEAD:**  
  Application snapshot DR (`tests/wave16-dr.js`) passes 75/75 (E3). Physical PostgreSQL WAL PITR is NOT exercised in CI.

- **Reproduction on Current HEAD:**  
  Run `./tools/pitr-restore.sh --latest` -> fails with `FAIL: pgbackrest در PATH نیست` (exit 1).

- **Risk:**  
  **E4 DRILL GAP.** Physical WAL replay is not validated in automated test batteries.

- **Status:** **E4 NOT VERIFIED (CONFIRMED AS TARGET/POLICY)**

- **Required Action:**  
  Package pgBackRest inside dedicated test containers for Phase 8.3 disaster recovery drills.

---

### Finding 8: M3 — Redis Sentinel HA Failover Quorum

- **Historical Claim (Chat 3):**  
  Redis Sentinel compose configuration (`infra/redis/docker-compose.sentinel.yml`) and failover script (`tools/failover-redis.sh`) exist, but no live Sentinel quorum is deployed in standard runtime or CI.

- **Current HEAD Evidence (`be05905d`):**  
  - `tools/failover-redis.sh:31` polls `127.0.0.1:26379,127.0.0.1:26380,127.0.0.1:26381`.
  - Only standalone Redis 8 (`127.0.0.1:6379`) runs in standard environments.

- **Current Implementation & Test Status in HEAD:**  
  `tests/ha-config.js` validates static YAML syntax (94/94 PASS, E1/E2). Live Sentinel failover is NOT executed.

- **Reproduction on Current HEAD:**  
  Run `./tools/failover-redis.sh --dry-run` -> fails with `FAIL: هیچ sentinel پاسخگو نیست` (exit 1).

- **Risk:**  
  **E4 FAILOVER GAP.** Automated Redis master failover has not been demonstrated in a live cluster drill.

- **Status:** **E4 NOT VERIFIED**

- **Required Action:**  
  Deploy 3-node Sentinel stack in dedicated staging cluster before national rollout.

---

### Finding 9: DB-001 — Tenant Boundary Query Amplification

- **Historical Claim (Chat 3):**  
  `assertTenantBoundary` and province mapping execute multiple database queries per request, creating query amplification risks under high RPS.

- **Current HEAD Evidence (`be05905d`):**  
  - In commit `62254cff`, Chat 2 removed one duplicate `getTenantPolicy` call in `server/infrastructure/phase6-production-hardening.js`.
  - `authority.assertTenantPolicy()` still queries PostgreSQL authority synchronously.

- **Current Implementation & Test Status in HEAD:**  
  Code deduplication applied (E1). Empirical latency under 20,000 RPS has not been measured.

- **Reproduction on Current HEAD:**  
  Code inspection of `server/infrastructure/phase6-production-hardening.js:176` confirms call to `authority.assertTenantPolicy()`.

- **Risk:**  
  **PERFORMANCE CAPACITY RISK.** Without query caching or read-replica offloading, authority queries may saturate PostgreSQL pool.

- **Status:** **PARTIALLY MITIGATED (CODE) / MEASUREMENT REQUIRED (LOAD)**

- **Required Action:**  
  Implement bounded in-memory LRU cache for tenant policies in Phase 8.4.

---

### Finding 10: MIG-001 — Migration Runner Non-Atomic `psql` & Ledger Insertion

- **Historical Claim (Chat 3):**  
  In `tools/migrate-ledger.js`, when `usePsql` is active, `execFileSync('psql', ...)` runs first, followed by a separate `INSERT INTO schema_migrations` query. An untimely crash between these two statements corrupts migration state tracking.

- **Current HEAD Evidence (`be05905d`):**  
  - Source File: `tools/migrate-ledger.js:143-148`
    ```javascript
    if (usePsql) {
      execFileSync('psql', [pgUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-f', file.path], { stdio: 'inherit' });
      await client.query(`
        INSERT INTO schema_migrations (version, name, applied_at, checksum)
        VALUES ($1, $2, NOW(), $3);
      `, [file.version, file.name, file.checksum]);
    }
    ```

- **Current Implementation & Test Status in HEAD:**  
  The `else` branch (pure JS SQL runner) is atomic (`BEGIN...COMMIT`), but the `usePsql` branch remains two disconnected transactions.

- **Reproduction on Current HEAD:**  
  Kill migration process immediately after `psql` completes: schema changes exist in DB, but `schema_migrations` has no record. Re-running throws table collision errors.

- **Risk:**  
  **LOW/MEDIUM (Operator Operational Risk).** Manual recovery required if server crashes during deployment.

- **Status:** **CONFIRMED ACTIVE CRASH WINDOW IN CURRENT HEAD**

- **Required Action:**  
  Append the ledger `INSERT` statement directly into the SQL payload executed by `psql` inside a single transaction.

---

### Finding 11: National Scale Capacity (20K RPS Across 32 Nodes)

- **Historical Claim (Chat 3):**  
  National capacity figures (10M registered, 2.5M concurrent, 20K RPS, 25K events/s) are mathematical extrapolations, not empirically measured cluster benchmarks.

- **Current HEAD Evidence (`be05905d`):**  
  - `docs/SLO.md` and `docs/ROADMAP_MASTER_EXECUTION_SCHEDULE.md` classify capacity as `TARGET/POLICY — MEASUREMENT REQUIRED`.
  - Zero multi-datacenter distributed load test reports exist on HEAD.

- **Current Implementation & Test Status in HEAD:**  
  No test in current HEAD simulates 20,000 RPS.

- **Reproduction on Current HEAD:**  
  Inspect documentation and benchmarks: confirmed as targets.

- **Risk:**  
  **CAPACITY GOVERNANCE RISK.** Promoting target metrics to verified capacity without load testing violates Rule 7 and Rule 10.

- **Status:** **MEASUREMENT GAP / NOT VERIFIED**

- **Required Action:**  
  Conduct distributed k6/JMeter load testing in Phase 8.3.

---

### Finding 12: E3 vs. E4 Evidence Level Classification

- **Historical Claim (Chat 3):**  
  Previous audit reports improperly labeled single-node container tests as "E4 Runtime Proof". Under Rule 7, single-node tests with local PostgreSQL and Redis are strictly **E3 (Integrated Runtime)**. **E4** requires a multi-node cluster with physical chaos injection.

- **Current HEAD Evidence (`be05905d`):**  
  - Rule 7 of `docs/ENGINEERING_EXECUTION_AND_VERIFICATION_POLICY.md` establishes:
    $$\text{E3 = Integrated Runtime (Single host / loopback / container)}$$
    $$\text{E4 = Production-Equivalent Multi-Node Cluster + Real Chaos Injection}$$
  - The runtime environment is a single container host (`127.0.0.1`).

- **Status:** **POLICY CONFIRMED — E4 REMAINS NOT VERIFIED ACROSS ALL AREAS**

---

## ۳. Comprehensive Comparison Matrix: Chat 3 Claims vs. Current HEAD (`be05905d`)

| Finding ID | Area | Historical Chat 3 Claim | Status in Current HEAD (`be05905d`) | Evidence Level | Current Risk |
|---|---|---|---|:---:|---|
| **OUTBOX-002** | Concurrency | `FOR UPDATE SKIP LOCKED` non-exclusive outside transaction | **CONFIRMED ACTIVE DEFECT** in `server/worker.js:56` | **E3** | **CRITICAL:** Duplicate event execution across workers |
| **M1-PROBES** | Observability | Scrape-time gauges missing; ping object truthiness bug | **CONFIRMED DEFECT & CI FAILURE** (Run #1175 failed) | **E3** | **HIGH:** Monitoring blindness; broken CI pipeline |
| **WORKER-001**| Observability | Health endpoints return 200 during worker stall | **CONFIRMED GAP** in `server/index.js:1008` | **E3** | **HIGH:** Silent outbox queue stalls in production |
| **SEC-001** | Revocation | Redis cold restart fails open across nodes | **CONFIRMED ARCHITECTURAL LIMIT** (Governed risk) | **E3** | **MEDIUM:** Revoked token exposure until expiration |
| **G-13** | Backup | `redis-backup.sh` exit 0 on flock contention | **RESOLVED** by Chat 4 (Commit `0d245b9c`, code 75) | **E3** | **RESOLVED:** Verified 11/11 in `tests/redis-backup.js` |
| **PGB-001** | Capacity | PgBouncer config 2000 vs 3500 target | **CONFIG RESOLVED** (Commit `89cec08c`, 3500/80 locked) | **E1/E3** | **LOW:** Config ready; empirical load test needed |
| **M2 / DR** | Disaster Recovery | Physical PITR requires unavailable `pgbackrest` | **E4 NOT VERIFIED** (`tools/pitr-restore.sh` fails) | **E1/E3** | **MEDIUM:** Restore drills rely on JSON snapshot only |
| **M3 / HA** | High Availability | Redis Sentinel failover has no live quorum | **E4 NOT VERIFIED** (`tools/failover-redis.sh` fails) | **E1/E3** | **MEDIUM:** Sentinel failover untested in live cluster |
| **DB-001** | Performance | Tenant guard query amplification | **PARTIALLY MITIGATED** (Commit `62254cff` deduplication) | **E3** | **MEDIUM:** Unmeasured DB saturation under high RPS |
| **MIG-001** | Migrations | Non-atomic `psql` + ledger insert crash window | **CONFIRMED ACTIVE CRASH WINDOW** in `tools/migrate-ledger.js` | **E3** | **LOW/MEDIUM:** Deployment recovery required on crash |
| **SCALE-20K**| Capacity | 20,000 RPS is an unmeasured extrapolation | **CONFIRMED MEASUREMENT GAP** | **E1** | **GOVERNANCE:** Must not be declared verified |
| **E3 vs E4** | Governance | Single-node runtime proofs are E3, not E4 | **CONFIRMED POLICY** (Rule 7 strictly enforced) | **Policy** | **GOVERNANCE:** Anti-greenwashing compliance |

---

## ۴. Required Action Plan for Repository Governance

1. **Immediate P0 Action (Fix CI on `origin/main`):**  
   Remediate `tests/runtime-probes-scrape-regression.test.js` (introduced in commit `be05905d`) and `server/metrics.js:594` to unblock GitHub Actions Node.js CI Run #1175.
2. **Immediate P1 Action (Fix OUTBOX-002 Concurrency Defect):**  
   Refactor `server/worker.js` and `server/outbox.js` to execute atomic claim-and-lock updates via CTE (`UPDATE server_outbox ... WHERE id IN (SELECT id ... FOR UPDATE SKIP LOCKED)`).
3. **P1 Action (Worker Health Telemetry):**  
   Integrate worker loop liveness and lag monitoring into `/api/health` in `server/index.js`.
4. **Phase 8.2 Gate Determination:**  
   Phase 8.2 Exit status remains strictly **NOT VERIFIED**. Phase 8.3 remains **BLOCKED**.
