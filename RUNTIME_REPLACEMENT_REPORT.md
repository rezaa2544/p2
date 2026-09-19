# RUNTIME REPLACEMENT REPORT — Phase 7.6

## 1. Executive Summary
This report documents the caller graph, runtime boot path, and HTTP-to-SSoT wiring for the five core control plane modules: `cache.js`, `rate-limit.js`, `phase6-canary-engine.js`, `national-traffic-fabric.js`, and `change-management.js`. It details the replacement of legacy in-memory state with the unified PostgreSQL Authority Layer (`server/infrastructure/authority/`).

---

## 2. Runtime Boot Path & Execution Chain

```
                       HTTP / HTTPS Request
                                │
                                ▼
                       [HTTP Server Boot]
                     (server/index.js : 1620)
                                │
                                ▼
                   [WAF & Abuse Rate Limiting]
              (server/waf.js, server/rate-limit.js)
                                │
                                ▼
                 [Tenant Scope & Identity Guard]
                   (server/middleware/scope.js)
                                │
                                ▼
                [Canary Traffic & Route Decision]
         (server/index.js -> phase6-canary-engine.js)
                                │
                                ▼
                 [PostgreSQL Authority Engine]
     (server/infrastructure/authority/postgres-authority.js)
                                │
                                ▼
                 [PostgreSQL 17 Database SSoT]
          (canary_state, governance_ledger, tenant_policy)
                                │
                                ▼
                [Response & Audit Ledger Append]
                   (server/infrastructure/authority/audit-ledger.js)
```

---

## 3. Module Caller Graph & SSoT Authority Mapping

### A. `server/cache.js`
- **Callers**: `server/index.js`, `server/routes/classes.js`, `server/routes/grades.js`, `server/routes/students.js`, `server/routes/users.js`, `server/delete-service.js`, `server/sync.js`, `server/ids.js`, `server/otp-store.js`, `server/waf.js`.
- **Role**: Read-through L1/L2 cache buffer for Bootstrap payloads, Single-flight promise lock (`inflight`), and Cache invalidation pub/sub (`invalidateCollection`, `invalidateUser`).
- **Authority Binding**: PostgreSQL is SSoT for all writes; cache is updated/invalidated strictly post-commit. In production, Redis unavailability fails closed with HTTP 503 `REDIS_UNAVAILABLE`.

### B. `server/rate-limit.js`
- **Callers**: `server/auth.js`, `server/index.js`, `server/sync.js`.
- **Role**: Atomic Redis fixed-window rate limiter (`checkRateLimit`).
- **Authority Binding**: Throws `redisGone()` (HTTP 503 `REDIS_UNAVAILABLE`) when Redis is unavailable in production mode.

### C. `server/infrastructure/phase6-canary-engine.js`
- **Callers**: `server/index.js`, `server/routes/system.js`, `server/monitoring/production-observability.js`, `server/monitoring/national-observability-plane.js`.
- **Role**: Canary cluster traffic routing (`routeRequest`).
- **Authority Binding**: `routeRequest` queries `authority.getCanaryState(clusterId)` and PostgreSQL `canary_state` SSoT to resolve `version` and `weight`. Injects mandatory HTTP response headers:
  - `X-Canary-ID`
  - `X-Canary-Cluster`
  - `X-Canary-Version`

### D. `server/infrastructure/national-traffic-fabric.js`
- **Callers**: `server/index.js`, `server/routes/system.js`, `server/monitoring/national-observability-plane.js`.
- **Role**: National traffic fabric coordination (`refreshTrafficFromSoT`).
- **Authority Binding**: Synchronizes traffic state from PostgreSQL SSoT (`authority.getCanaryState()`).

### E. `server/infrastructure/change-management.js`
- **Callers**: `server/routes/system.js`, `server/infrastructure/authority/index.js`.
- **Role**: Governance change control registry (`recordChangeRequest`).
- **Authority Binding**: Records change requests into PostgreSQL `governance_ledger` and `system_audit` via `authority.verifyAndRecordGovernanceNonce()` and `authority.appendSystemAudit()`.

---

## 4. Production Code Replacement Verification

Target Production Replacement Executed in `server/index.js`:
- Enforced `assertTenantBoundary()` middleware across all `/api/v1/*` routes.
- Enforced PostgreSQL `canary_state` version checks and header injection on HTTP responses (`X-Canary-ID`, `X-Canary-Cluster`, `X-Canary-Version`).
- Enforced HTTP 503 `REDIS_UNAVAILABLE` fail-closed behavior on rate limiting and cache outages in production mode.
