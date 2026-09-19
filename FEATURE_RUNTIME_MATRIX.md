# FEATURE RUNTIME MATRIX — Phase 7.0 Discovery

## 1. Executive Summary
This matrix evaluates the runtime completeness of all critical security, governance, routing, and database features in `https://github.com/rezaa2544/p2` (branch `main`). Each feature is audited across its full path: `HTTP Request` -> `Middleware` -> `Router/Service` -> `Authority Layer` -> `Database (PostgreSQL 17)` -> `Audit Ledger`.

---

## 2. Feature Runtime Completeness Matrix

| Feature Domain | HTTP Entry | Middleware Pipeline | Service Handler | Authority Layer | Database Persistence | Audit Ledger | Runtime Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Canary Traffic Routing** | ✅ Wired (`server/index.js`) | ✅ Wired (`server/waf.js`) | ⚠️ Partial (`phase6-canary-engine.js`) | ❌ Uses In-Memory Map | ⚠️ Static (`phase6_canary_configs`) | ✅ Wired (`phase6_audit_events`) | **PARTIAL (RAM Authority)** |
| **Tenant Isolation Boundary** | ✅ Wired (`/api/*`) | ✅ Wired (`server/middleware/scope.js`) | ✅ Wired (`server/policy.js`) | ⚠️ In-Memory Fallback Map | ✅ Wired (`schools`, `users`) | ✅ Wired (`server/audit.js`) | **PARTIAL (Needs PG `tenant_policy`)** |
| **Replay & Nonce Protection** | ✅ Wired (`/api/*`) | ✅ Wired (`server/auth.js`) | ✅ Wired (`jti` checks) | ⚠️ Redis/RAM Nonce Store | ❌ Missing `governance_ledger` | ✅ Wired (`server/audit.js`) | **PARTIAL (Needs PG `governance_ledger`)** |
| **Optimistic Concurrency Control (OCC)** | ✅ Wired (`/api/sync`) | ✅ Wired (`server/sync.js`) | ✅ Wired (`base_version` checks) | ✅ PostgreSQL `version` Column | ✅ Wired (`users`, `classes`, `grades`) | ✅ Wired (`sync_conflicts`) | **FULL SSoT IMPLEMENTED** |
| **Outbox Event Processing** | ✅ Wired (`server/index.js`) | ✅ Wired (`server/outbox.js`) | ✅ Wired (`worker.js`) | ✅ PostgreSQL `server_outbox` | ✅ Wired (`server_outbox`, `dlq`) | ✅ Wired (`server/audit.js`) | **FULL SSoT IMPLEMENTED** |
| **Account Lockout & OTP Rate Limit** | ✅ Wired (`/api/auth/*`) | ✅ Wired (`server/rate-limit.js`) | ✅ Wired (`server/otp-store.js`) | ✅ Redis + DB Fail-Closed | ✅ Wired (`otp.json` / PG) | ✅ Wired (`server/audit.js`) | **FULL SSoT IMPLEMENTED** |

---

## 3. Detailed Path Audits

### A. Canary Routing Path Analysis
- **HTTP Entry**: Handled at `server/index.js` request handler.
- **Middleware**: Inserts `x-canary-cluster` response headers.
- **Defect Identified**: Cluster health metrics and rollback target weights are stored in RAM (`this.clusters = new Map()`) inside `phase6-canary-engine.js`. Node restart resets canary weights and cluster status.
- **Required Fix**: Route canary routing state through PostgreSQL `canary_state` table.

### B. Tenant Isolation Boundary Analysis
- **HTTP Entry**: Checked on all `/api/*` endpoints.
- **Middleware**: `server/middleware/scope.js` extracts tenant context (`school_id`, `province_id`).
- **Defect Identified**: `server/infrastructure/national-region-control-plane.js` uses `_nationalRegionStore` map in memory for provincial scope rules.
- **Required Fix**: Query tenant scope policy from PostgreSQL `tenant_policy` table.

### C. Replay Protection & Signature Analysis
- **HTTP Entry**: Signed requests pass through `server/auth.js`.
- **Middleware**: Checks `jti` and request timestamp freshness (`iat` clock skew guard).
- **Defect Identified**: Nonce replay store relies on Redis/in-memory expiration maps without transactional DB backing.
- **Required Fix**: Persist signed operation nonces to PostgreSQL `governance_ledger` table with `UNIQUE(nonce)` constraint.
