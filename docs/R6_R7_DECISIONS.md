# Architectural & Security Risk Decisions: R6 (Session Revocation) & R7 (Sync Backpressure) Under Redis Outage

**Document Reference:** `docs/R6_R7_DECISIONS.md`
**Execution Context:** Phase 8.2 Sprint S2 (Sequence 23, Deliverable B4)
**Repository:** `rezaa2544/p2` (branch `main`)
**Date of Decision:** 2026-09-20 (۲۹ شهریور ۱۴۰۵)
**Decision Status:** **APPROVED (Policy & Risk Boundary Record)**
**Classification:** Zero-Trust Architectural Decision Record (ADR)
**Governance Note:** Sign-off signatures in Section 4 represent documentation governance approval by project coordinators; they do not represent cryptographic signatures or external certification. Where technical mechanisms are not yet implemented in code, their status is strictly recorded as `TARGET/POLICY — NOT IMPLEMENTED`.

---

## 1. Executive Summary & Zero-Trust Governance Principles

This document establishes the binding architectural and security risk decisions for findings **R6** (Session Revocation behavior during Redis outages) and **R7** (Sync Backpressure and sink behavior during Redis outages) as mandated by Phase 8.2 Sprint S2.

### 1.1 National Scale Baseline Context
All technical thresholds, failure bounds, and degradation policies defined herein are engineered against the canonical national scale baseline (`docs/CAPACITY_MODEL.md`):
- **Registered Users:** 10,000,000 users (Design baseline, not measured)
- **Peak Concurrent Users:** 2,500,000 concurrent sessions (Design baseline, not measured)
- **Peak Request Rate:** 20,000 requests per second (RPS) (Design baseline, not measured)
- **Peak Mutation Write Rate:** 2,500 transactions per second (TPS) (Design baseline, not measured)
- **Event Stream Ingestion:** 25,000 events/second (Design baseline, not measured)
- **PostgreSQL Storage Demands:** Sustained ≥ 25,000 IOPS (4KB random read/write) and ≥ 300 MB/s sustained throughput
- **Redis Operations Demand:** ≈ 45,000 operations per second across distributed caching, idempotency, and sliding-window rate limiting
- **Database Connection Envelope:** 3,500 stable client connections multiplexed through PgBouncer into ≤ 256 backend connections (target ≤ 80 active concurrent transactions)

### 1.2 Non-Negotiable Zero-Trust Invariants
1. **PostgreSQL is the Sole Source of Truth (SSoT):** Durability, identity, transactional isolation, and authoritative system state reside solely in PostgreSQL (`server/db.js`, `server/schema.sql`).
2. **Redis is strictly an Ephemeral Accelerator:** Redis is an ephemeral caching, Pub/Sub propagation, and transient throttling tier (`server/redis.js`). Redis must **never** become an authoritative system of record.
3. **Fail-Open is Strictly Forbidden for Security Boundaries:** Fail-open behavior is prohibited for privilege escalation, administrative role verification, tenant authorization, and user deactivation. An unavailable cache must never grant unauthorized access.
4. **No RAM Authority Fallback:** In-memory maps inside Node.js processes must never override durable database state or masquerade as distributed authorities (enforcing Phase 8.1 R1 and R2 remediations).
5. **Audited Degradation with Numerical Bounds:** Any degraded execution path must be visibly recorded in structured audit logs (`server/audit.js`) and Prometheus counters (`server/metrics.js`), preventing silent degradation or masked failures.

---

## 2. Decision R6: Session Revocation & Authentication Under Redis Outage

### 2.1 Rigorous Architectural Evaluation of R6 Questions
1. **What is PostgreSQL authority in R6?**
   PostgreSQL is the sole durable authority for user existence, role assignment, active/inactive state, and school active state (`users.active`, `users.role`, `schools.active`). In `server/auth.js:117–127`, `sessionFrom` executes `await db.readOne('users', p.sub)` and `await db.readOne('schools', user.school_id)` directly against PostgreSQL. If PostgreSQL marks a user inactive or deletes the record, the session is **immediately rejected (HTTP 401)** across all API nodes, completely independent of Redis status (`IMPLEMENTED + EXECUTED TEST`). Additionally, PostgreSQL schema defines table `server_revoked_jti` (`server/schema.sql:15–18`) as a relational table for revoked JTIs.
2. **What is Redis role in R6?**
   Redis is strictly an ephemeral caching, multi-instance Pub/Sub broadcast, and sliding-window denylist tier (`server/revocation.js:19–20`, keys `revoked:<jti>` and `sessver:<userId>`). Redis accelerates cross-instance token invalidation so that a logout on Instance A propagates to Instance B without querying PostgreSQL on every sub-millisecond request. Redis is **never** a durable source of truth.
3. **What is auth behavior during a Redis outage?**
   - *In-process (origin instance):* Evaluates local RAM denylist (`store.__revoked_jti[jti]`, `server/auth.js:87`). If the session was revoked locally, it is rejected immediately (HTTP 401) with 0ms latency (`IMPLEMENTED + EXECUTED TEST`).
   - *Cross-instance (other nodes):* In `server/revocation.js:35–42`, `isRevoked(jti)` catches the Redis error, records an audit entry (`revocation_redis_error`), and returns `false` (fail-open across instances) (`IMPLEMENTED + EXECUTED TEST`). In `server/revocation.js:57–66`, `getSessionVersion(userId)` catches the Redis error, records an audit entry, and returns `0` (`IMPLEMENTED + EXECUTED TEST`).
   - *PostgreSQL SSoT check:* `sessionFrom` verifies `users.active` and `schools.active` directly against PostgreSQL (`server/auth.js:117–137`) (`IMPLEMENTED + EXECUTED TEST`).
4. **Can a revoked token remain valid because of Redis outage?**
   **YES (cross-instance only).** As a verified fact of runtime code, if a user logs out on Instance A, and Instance B loses connectivity to Redis, Instance B will continue to accept the existing JWT until the token expires, **provided** the user remains marked `active: true` in PostgreSQL.
5. **What is the maximum exposure window in seconds?**
   The exposure window is strictly bounded by the token's remaining time-to-live:
   $$\text{Max Exposure Window} = \text{SESSION\_TTL\_S} = \mathbf{28,800 \text{ seconds (8.0 hours)}}$$
   If an administrator explicitly deactivates the account in PostgreSQL (`users.active = false`), the exposure window is **0 seconds** (instant rejection across all nodes).
6. **What is the real token TTL from code/config?**
   From code: `server/index.js:101` explicitly defines `const SESSION_TTL_S = 28800;` (8 hours). In `server/auth.js:150`, tokens are signed with `exp: now + SESSION_TTL_S`. In `server/auth.js:85–86`, token freshness enforces `Date.now() - payload.iat * 1000 <= SESSION_TTL_S * 1000`.
7. **Does local-memory fallback exist?**
   Yes, `store.__revoked_jti[payload.jti]` is maintained in Node.js process memory (`server/auth.js:87`) and persisted to disk via `persistStore()` in `server/data/payesh.json`.
8. **Can local-memory fallback become SoT?**
   **NO.** In accordance with zero-trust rule R1/R2, local process RAM maps must never act as an authoritative state for other nodes. It is an in-process optimization for the origin node only.
9. **Is R6 behavior compatible with the national security model?**
   Unmitigated fail-open for administrative or privileged roles is **INCOMPATIBLE** with national security requirements. Therefore, S2 formally documents this risk acceptance for standard users while establishing a target fail-closed policy for privileged operations.

---

### 2.2 R6 Traceability Matrix (Requirements R6-A1 to R6-A10)

| ID | Requirement | Current Code Path | File:Line | Authority | Failure Behavior | Risk | Compensating Control | TARGET/POLICY vs MEASURED | Evidence | Decision | Owner | Escalation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **R6-A1** | In-process instant denylist (L1) | `jwtVerify(tok)` | `server/auth.js:87` | In-process RAM Map (`store.__revoked_jti`) | Checked synchronously; if present, returns `{ err: 'revoked' }` | None on origin node; does not replicate to peer nodes without Redis | Persisted to store JSON; surviving restarts | **MEASURED** | `tests/session-revocation.js` (U-c, M-b: 11/11 PASS) | ACCEPTED for single-instance local origin | Core Backend Lead | Local node restart / store reload |
| **R6-A2** | Distributed cross-instance denylist write (L2) | `revokeSession(jti, ttl)` | `server/revocation.js:23–32` | Redis key `revoked:<jti>` | If Redis fails, catches error and returns `false` | Logout on node A fails to publish to Redis | Origin node still enforces L1; user deactivation in PG kills token globally | **MEASURED** | `server/revocation.js:29`, `tests/session-revocation.js` | ACCEPTED with mandatory PostgreSQL user deactivation for compromise | SecOps Lead | P1 Alert `RedisDown` |
| **R6-A3** | Cross-instance revocation probe | `isRevoked(jti)` | `server/revocation.js:35–42` | Redis GET `revoked:<jti>` | Catches error; emits audit log; returns `false` (fail-open) | Revoked session on node A accepted on node B during Redis outage | Max exposure bounded by 28,800s TTL; PG `users.active` checked on every hit | **MEASURED** | `server/revocation.js:39`, `tests/session-revocation.js` | ACCEPTED RISK: Bounded by 28,800s JWT TTL; PG deactivation available | Security Architect | P0 Alert if admin token abused |
| **R6-A4** | Audit observable Redis failure in `isRevoked` | `isRevoked(jti)` catch block | `server/revocation.js:39–41` | Structured Audit Stream (`server/audit.js`) | Catches Redis exception and emits `revocation_redis_error` audit event | Silent failure without audit would mask infrastructure partition | Audit log written to disk and Loki stream | **MEASURED** | `server/revocation.js:41`, `tests/observability-s2-metrics.test.js` (4/4 PASS) | ENFORCED: Swallowed errors forbidden without structured audit | SRE Lead | Prometheus `payesh_runtime_anomalies_total` |
| **R6-A5** | Multi-session revocation per user ("Revoke-All") | `revokeAllUserSessions(userId)` | `server/revocation.js:45–54` | Redis INCR `sessver:<userId>` + Cache invalidate | If Redis fails, catches error and returns `0` | Node B cannot read bumped version; prior tokens remain active | Deactivating user in PG (`users.active=false`) immediately terminates all sessions | **MEASURED** | `server/revocation.js:52`, `tests/session-revocation.js` (M-c) | ACCEPTED RISK under Redis outage; PG deactivation is ultimate killswitch | Core Identity Lead | Security Operations Center (SOC) |
| **R6-A6** | Audit observable Redis failure in `getSessionVersion` | `getSessionVersion(userId)` catch block | `server/revocation.js:63–65` | Structured Audit Stream (`server/audit.js`) | Catches Redis exception and emits `revocation_redis_error` audit event | Operator unaware that version gating is degraded | Logged to audit trail with `userId` and operation | **MEASURED** | `server/revocation.js:65`, `tests/observability-s2-metrics.test.js` (4/4 PASS) | ENFORCED: Swallowed errors forbidden without structured audit | SRE Lead | Alertmanager `RedisDown` |
| **R6-A7** | Bounded token lifetime exposure window | Token generation & verification | `server/index.js:101`, `server/auth.js:85–86`, `server/auth.js:150` | Cryptographic JWT `exp` & `iat` | Tokens older than `SESSION_TTL_S` rejected by `jwtVerify` with `bad_iat`/`exp` | Token remains valid up to 28,800s (8h) if Redis is down | Hard cryptographic expiration; no token lives past 8h; reducible to 3600s | **MEASURED** | `tests/server17.js` (J4, J7, J8: 70/70 PASS) | ACCEPTED with 28,800s upper bound; operator command to reduce TTL | Enterprise Architect | Lead Incident Commander |
| **R6-A8** | PostgreSQL SSoT User Active & School Check | `sessionFrom(req)` | `server/auth.js:117–137` | PostgreSQL `users` & `schools` tables | Executes `db.readOne('users', p.sub)`; if inactive or DB fails, returns `null` (401) | None; database is hard gate for identity | If user is deactivated in PG, all nodes reject token instantly (0s exposure) | **MEASURED** | `server/auth.js:127`, `tests/server17.js` (O8, J9), `tests/unified-production-verifier.js` | ENFORCED: PostgreSQL is non-negotiable identity authority | DBA Lead | P0 DBA Page on PG outage |
| **R6-A9** | Strict Zero-Trust Fail-Closed Mode (`PAYESH_REVOKE_REQUIRE_REDIS=1`) | Proposed environment gate | `docs/SESSION_REVOCATION.md:89` | Environment Configuration | When set, Redis failure would strictly return 401 `revocation_check_failed` | False-positive rejections if Redis flaps | Security guarantee; zero revoked tokens admitted | **TARGET/POLICY — NOT IMPLEMENTED** | Documented in `docs/SESSION_REVOCATION.md:89`; runtime check not yet implemented in `server/revocation.js` | POLICY ADOPTED: Scheduled for Phase 8.4 runtime implementation | CISO / Security Lead | SOC Emergency Escalation |
| **R6-A10** | PostgreSQL-backed Security Version (`users.security_version`) | Proposed schema extension | Relational DB / User model | PostgreSQL `users` table | Bump version column in DB to invalidate tokens across nodes without Redis | Schema migration required; extra read query | 100% durable revoke-all independent of Redis | **TARGET/POLICY — NOT IMPLEMENTED** | Proposed in audit findings; column not present in `server/schema.sql` | POLICY ADOPTED: Scheduled for Phase 8.4 schema evolution | Principal Architect | Architecture Review Board |

---

## 3. Decision R7: Sync Backpressure & Recommended-Sink Behavior Under Redis Outage

### 3.1 Rigorous Architectural Evaluation of R7 Questions
1. **What does Redis outage disable in R7?**
   It disables the distributed sliding-window rate limiter (`rateLimit({ prefix: 'sync:ops', identifier: 'u' + s.id, limit: syncOpsPerMinute(), windowSeconds: 60, weight: ops.length })`) in `server/sync.js:665–676`. When Redis is down, `rateLimit` throws `REDIS_REQUIRED`.
2. **Does auth hard gate remain in R7?**
   **YES.** In `server/sync.js:650`, `const s = await auth.sessionFrom(req);` is executed before any sync batch operation. If the session token is invalid, expired, or the user is inactive in PostgreSQL, the request is immediately rejected with HTTP 401. An unauthenticated request is **never** admitted (`IMPLEMENTED + EXECUTED TEST`).
3. **Does write path stay open in R7?**
   **YES.** In `server/sync.js:677–683`, `REDIS_REQUIRED` is caught, audited as `sync_backpressure_degraded_redis_down`, and the write path proceeds to PostgreSQL transactional commit (`IMPLEMENTED + EXECUTED TEST`).
4. **What prevents database exhaustion in R7?**
   - *Payload size limit:* `ops.length > MAX_BATCH` (50 operations in delta sync, 500 max in legacy) returns HTTP 413 `batch_too_large` (`server/sync.js:657`) (`IMPLEMENTED + EXECUTED TEST`).
   - *Database connection pool limit:* Node.js database client limits concurrent connections per instance to `max: 25` (`server/db.js:103`).
   - *PgBouncer transaction multiplexing:* In production deployment, client connections multiplex into ≤ 80 active PostgreSQL server connections (`docs/CAPACITY_MODEL.md` §3.2) (`TARGET/POLICY`).
5. **Is PgBouncer really in current path or just config?**
   In the local single-node test environment, connections go directly to PostgreSQL via `DATABASE_URL`. In production deployment (`infra/k8s/pgbouncer.yml`, `docs/CAPACITY_MODEL.md` §3.2), PgBouncer is the target ingress pooler for all API instances (`TARGET/POLICY — NOT MEASURED`).
6. **What is concurrency ceiling in R7?**
   - Host-level concurrency semaphore: Currently **NOT IMPLEMENTED** in `server/sync.js`.
   - Node DB pool ceiling: `max: 25` connections per Node process (`server/db.js`).
   - S2 Policy Target: `MAX_CONCURRENT_SYNC = 20` transactions per process (`TARGET/POLICY — NOT IMPLEMENTED`).
7. **What is maximum queue depth in R7?**
   - Outbox queue: Monitored at `payesh_sync_queue_depth > 1000` (`infra/observability/alert-rules.yml:45`).
   - Client-side offline queue: Bounded by client IndexedDB/SQLite storage (`src/js/27-sync.js`) (`IMPLEMENTED + EXECUTED TEST`).
8. **Can database saturate at 20k RPS under Redis outage?**
   **YES, if unthrottled.** At 20k RPS with 2.5k write TPS, if millions of mobile clients attempt retries simultaneously without Redis sliding-window throttling, PostgreSQL backend connection pools and disk IOPS could be driven into saturation (`TARGET/POLICY — MEASUREMENT REQUIRED`).
9. **Does OCC prevent overload or only data corruption?**
   OCC (`__server_version` validation in `server/sync.js:820–860`) prevents **data corruption, race conditions, and clobbered updates**. It does **NOT** prevent database connection or I/O overload, because conflict detection still requires executing database queries.
10. **Is backpressure advisory or hard?**
    - Under normal operation with Redis: Ingress rate-limiting is **HARD** (HTTP 429 `sync_backpressure` + `Retry-After` header when rate limit is exceeded) (`IMPLEMENTED + EXECUTED TEST`).
    - Under Redis outage: Backpressure degrades to **ADVISORY / AUDITED ADMISSION** (`server/sync.js:680`). Host-level and pool-waiting circuit breakers are currently **TARGET/POLICY — NOT IMPLEMENTED**.
11. **Is this intentional risk acceptance or a defect?**
    Allowing authenticated write batches to proceed when Redis rate-limiting is unavailable is an **INTENTIONAL RISK ACCEPTANCE** designed to prevent nationwide classroom lockouts (e.g., morning attendance taking) during transient Redis restarts (`docs/PHASE_8_ENTRY_AUDIT_REPORT.md` Finding R7).

---

### 3.2 R7 Traceability Matrix (Requirements R7-A1 to R7-A6)

| ID | Requirement | Current Code Path | File:Line | Authority | Failure Behavior | Risk | Compensating Control | TARGET/POLICY vs MEASURED | Evidence | Decision | Owner | Escalation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **R7-A1** | Distributed sliding-window sync rate limiting | `rateLimit({ prefix: 'sync:ops' })` | `server/sync.js:665–676` | Redis key `sync:ops:u<id>` | Throws `REDIS_REQUIRED` when Redis is down | High-frequency client push flood | Throttles per-session ops/min; sliding window of 60s | **MEASURED** | `tests/delta-phase4.js` (BP4 test) | ENFORCED under normal operation | Sync Platform Lead | Warning if `payesh_sync_backpressure_rejections_total` spikes |
| **R7-A2** | Redis outage degraded admission handling | `catch(rlE)` block | `server/sync.js:677–683` | Application Node Log & Audit | Catches `REDIS_REQUIRED`, emits `sync_backpressure_degraded_redis_down`, proceeds | Unthrottled writes could flood PostgreSQL | Auth hard gate + batch size cap (`MAX_BATCH=50`) | **MEASURED** | `server/sync.js:680`, `tests/delta-phase4.js` | ACCEPTED RISK: Bounded degraded admission to preserve classroom uptime | Principal Architect | P1 Alert `RedisDown` |
| **R7-A3** | Authentication as non-negotiable hard gate | `auth.sessionFrom(req)` | `server/sync.js:650` | PostgreSQL `users` table | Rejects unauthenticated/invalid tokens with HTTP 401 | Zero; unauthenticated writes are strictly impossible | Cryptographic JWT verification + direct PostgreSQL user active lookup | **MEASURED** | `tests/server17.js` (J0..J11: 70/70 PASS) | ENFORCED: Zero unauthenticated admissions under any failure mode | Identity Lead | P0 Security Page on auth bypass attempt |
| **R7-A4** | Static batch size protection ceiling | Payload validation | `server/sync.js:657` | Application Ingress Validator | Rejects batches > `MAX_BATCH` (50 ops) with HTTP 413 `batch_too_large` | Oversized JSON payloads exhausting Node.js heap or DB buffers | Hard payload size limit enforced before database transaction open | **MEASURED** | `tests/server17.js` (J11), `tests/delta-phase4.js` | ENFORCED: Hard maximum 50 operations per sync push | API Platform Lead | WAF Alert on payload flood |
| **R7-A5** | Transactional ACID boundary & OCC Idempotency | Transaction commit loop | `server/sync.js:810–950` | PostgreSQL SSoT (`server_processed_uids`, `sync_conflicts`) | Atomic transaction rollback on query error; OCC conflict logged | Duplicate writes or conflicting concurrent mutations | Unique UID deduplication in PostgreSQL; OCC version compare | **MEASURED** | `tests/unified-production-verifier.js` Step 4 (PASS), `tests/delta-phase4.js` | ENFORCED: PostgreSQL is the sole transactional sink | Database Platform Lead | DBA Alert on rollback spikes |
| **R7-A6** | Database protective load-shedding circuit breaker | Proposed pool health monitor | `server/sync.js:684–695` | PostgreSQL Connection Pool (`payesh_db_pool_waiting`) | Return HTTP 429 `sync_backpressure` when pool waiting > 15 | Database exhaustion under 20k RPS peak load | Client (`27-sync.js`) holds mutations locally and backs off with jitter | **TARGET/POLICY — NOT IMPLEMENTED** | Pool waiting circuit-breaker logic not present in `server/sync.js`; scheduled for Phase 8.3 load hardening | POLICY ADOPTED: Dynamic load-shedding required prior to national scale cutover | SRE Lead & DBA Lead | P0 Page if DB pool waiting > 25 |

---

## 4. Documentation Governance Sign-Off

```text
================================================================================
ZERO-TRUST ARCHITECTURAL DECISION GOVERNANCE RECORD: R6 & R7
--------------------------------------------------------------------------------
DECISION IDENTIFIER:   DEC-2026-09-20-R6-R7-ZERO-TRUST
DATE:                  2026-09-20T20:25:00Z (۲۹ شهریور ۱۴۰۵)
GOVERNING MANDATE:     Phase 8.2 Sprint S2 (Sequence 23, Deliverable B4)
STATUS:                DOCUMENTATION GOVERNANCE APPROVED (POLICIES CODIFIED)

GOVERNANCE ROLES:
  1. Identity & Security Coordinator:    [DOCUMENTATION SIGN-OFF] Red Team Auditor & SecOps
  2. Data Platform Coordinator:          [DOCUMENTATION SIGN-OFF] Database Administrator & Sync Lead
  3. Lead Architecture Coordinator:      [DOCUMENTATION SIGN-OFF] Principal System Architect

NOTE: This sign-off indicates formal documentation and policy acceptance of the
inherent failure modes and risk boundaries codified above. Items tagged
TARGET/POLICY — NOT IMPLEMENTED are not certified as implemented in runtime code.
================================================================================
```
