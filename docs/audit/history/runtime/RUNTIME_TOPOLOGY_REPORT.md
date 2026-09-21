# RUNTIME TOPOLOGY REPORT — Phase 7.0 Discovery

## 1. Executive Summary
This report maps the actual HTTP request entry points, middleware chains, routing decisions, service handlers, database access layers, and audit paths in `https://github.com/rezaa2544/p2` (branch `main`). It identifies all active HTTP wires as well as orphaned features (modules present in the codebase that lack full HTTP request wiring or live authority connection).

---

## 2. End-to-End HTTP Flow Map

```
                          HTTP / HTTPS Request
                                    │
                                    ▼
                          [HTTP Server & TLS]
                        (server/index.js : 1620)
                                    │
                                    ▼
                     [WAF & Abuse Protection Gate]
                  (server/waf.js, server/abuse-guard.js)
                                    │
                                    ▼
                    [Rate Limiting & Attack Detector]
               (server/rate-limit.js, attack-detector.js)
                                    │
                                    ▼
                [JWT Authentication & Session Revocation]
                  (server/auth.js, server/revocation.js)
                                    │
                                    ▼
                     [Field-Level Authorization Gate]
                          (server/policy.js)
                                    │
                                    ▼
                   [Route Routers & Domain Logic]
                  (server/routes/*.js, server/sync.js)
                                    │
                                    ▼
                   [Single Source of Truth (SSoT)]
                     (PostgreSQL 17 Database Engine)
                                    │
                                    ▼
                 [L1 Memory / L2 Redis Caching Layer]
                      (server/cache.js, redis.js)
                                    │
                                    ▼
                 [Outbox Event Worker & Audit Ledger]
                  (server/outbox.js, server/audit.js)
```

---

## 3. Detailed Component Topology

### A. HTTP Entry Point & Boot Wiring
- **Primary File**: `server/index.js`
- **Port Bounding**: Binds to `0.0.0.0` or `HOST` environment variable (default `127.0.0.1:9005` in dev, configurable via `PORT`).
- **HTTP/HTTPS Gate**: In `production` environment (`PAYESH_ENV=production`), enforces HTTPS certificates or `PAYESH_BEHIND_PROXY=1` (reverse proxy header trust). Fail-fast with `process.exit(1)` if neither is present.

### B. Middleware Pipeline Chain
1. **Request Metric & Timing**: `metrics.attach(server)` tracking in-flight requests and HTTP latency histograms (`server/metrics.js`).
2. **WAF & Security Headers**: Enforces Security Headers (HSTS, CSP, X-Content-Type-Options, Frame-Options) and evaluates threat scores (`server/waf.js`).
3. **Replay & Nonce Verification**: Replay protection middleware verifying request timestamp and jti/nonce uniqueness (`server/auth.js`).
4. **JWT Verification**: Parses HttpOnly cookie `payesh_token` or `Authorization: Bearer` header, checks signature and JTI revocation status against `server/revocation.js`.
5. **Tenant & Scope Isolation**: Sets `req.user`, `req.school_id`, `req.role`, and applies tenant isolation boundaries (`server/middleware/scope.js`).

### C. Service & Router Layer
- Router files located in `server/routes/`: `users.js`, `classes.js`, `students.js`, `attendance.js`, `grades.js`, `reports.js`, `system.js`, `analytics.js`.
- Sync Engine: `server/sync.js` handling client/server delta synchronization, batch transactions, optimistic concurrency control (`base_version`), and conflict resolution.

### D. Single Source of Truth (Database & Audit)
- Database Access: `server/db.js` providing connection pool management to PostgreSQL 17.
- Event Outbox: `server/outbox.js` inserting events into `server_outbox` table during write transactions.
- Audit Trail: `server/audit.js` logging security, authentication, and governance events to PostgreSQL / local audit files.

---

## 4. Orphaned & Disconnected Feature Audit

The following features were discovered in `server/infrastructure/` and `server/security/` that exist as module code but lack complete HTTP runtime wiring or rely on in-memory authority rather than PostgreSQL SSoT:

| Orphaned / Disconnected Module | Description | Missing Runtime Wire |
| :--- | :--- | :--- |
| `server/infrastructure/national-capacity-enforcement.js` | Capacity reservations stored in RAM | HTTP endpoints modify RAM `activeReservations` map rather than PostgreSQL `canary_state` / PG locks |
| `server/infrastructure/national-region-control-plane.js` | Region routing & tenant control plane | Holds `_nationalRegionStore` map in memory without PG `tenant_policy` table backing |
| `server/infrastructure/national-traffic-fabric.js` | Canary traffic weighting fabric | Binds traffic weights to RAM `_nationalTrafficWeights` map instead of PG `canary_state` |
| `server/infrastructure/phase6-canary-engine.js` | Canary cluster orchestration engine | Stores cluster state & rollback snapshots in RAM maps |
| `server/infrastructure/provincial-pilot-scaling.js` | Provincial scaling store | In-memory `_provincialStateStore` map not wired to PostgreSQL |
| `server/infrastructure/change-management.js` | Governance change registry | In-memory `changeRegistry` map not backed by PG `governance_ledger` |
| `server/operations/national-operations-center.js` | Incident response tracking | In-memory `activeIncidents` map not persisted to PG `system_audit` |

---

## 5. Conclusion & Action Item
To eliminate this class of architecture failure, all business state, routing authority, governance change logs, and tenant policy decisions must be re-wired from RAM maps to PostgreSQL 17 tables via a unified `server/infrastructure/authority/` layer.
