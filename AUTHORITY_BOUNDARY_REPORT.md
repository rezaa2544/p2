# AUTHORITY BOUNDARY REPORT — Phase 7.0 Discovery

## 1. Executive Summary
This report documents all in-memory data structures (`new Map()`, module-level state, global objects) across the `server/` codebase in `https://github.com/rezaa2544/p2` (branch `main`). It classifies every instance into **Forbidden RAM Authority** (business/security state held in RAM) vs **Allowed RAM Use** (transient request counters, LRU cache buffers, single-flight promise locks), establishing the mandatory boundary for Phase 7 Zero Trust Rebuild.

---

## 2. In-Memory Store Inventory & Classification

### A. Forbidden RAM Authority (Business / Security / Governance / Routing State in Memory)

| File Path | Memory Store Symbol | Current Role in Code | Violation / Architectural Risk | Phase 7 Authority Migration Plan |
| :--- | :--- | :--- | :--- | :--- |
| `server/infrastructure/national-capacity-enforcement.js` | `const activeReservations = new Map();` | Capacity reservation tracking | State lost on Node process restart; multi-instance desync | Migrate to PostgreSQL `canary_state` / PG row locks |
| `server/infrastructure/national-region-control-plane.js` | `const _nationalRegionStore = new Map();` | Tenant scope & region policy store | Tenant scope policy held in RAM map | Migrate to PostgreSQL `tenant_policy` table |
| `server/infrastructure/national-traffic-fabric.js` | `const _nationalTrafficWeights = new Map();` | Canary cluster traffic weighting | Routing weight authority held in process memory | Migrate to PostgreSQL `canary_state` table |
| `server/infrastructure/phase6-canary-engine.js` | `this.clusters = new Map()`, `this.rollbackSnapshots = new Map()` | Canary cluster state & rollback targets | Cluster health & rollback targets lost on crash | Migrate to PostgreSQL `canary_state` & `governance_ledger` |
| `server/infrastructure/provincial-pilot-scaling.js` | `const _provincialStateStore = new Map();` | Provincial pilot scaling state | Pilot scaling state desynchronized across instances | Migrate to PostgreSQL `tenant_policy` table |
| `server/infrastructure/change-management.js` | `const changeRegistry = new Map();` | Governance change control registry | Unsigned in-memory change log | Migrate to PostgreSQL `governance_ledger` table |
| `server/infrastructure/event-processing-layer.js` | `const eventHandlersRegistry = new Map();` | Event handler authority | In-memory handler registry | Wire directly to PostgreSQL Outbox worker |
| `server/operations/national-operations-center.js` | `const activeIncidents = new Map();` | Active incident response tracker | Incidents lost on restart | Migrate to PostgreSQL `system_audit` table |

---

### B. Allowed Transient RAM Use (Non-Authority Operational Buffers)

| File Path | Memory Store Symbol | Operational Purpose | Lifetime & Cleanup Mechanism |
| :--- | :--- | :--- | :--- |
| `server/cache.js` | `localUserBootstrapCache` | L1 LRU memory cache for bootstrap queries | TTL 60s + max 2048 entries + Redis pub/sub invalidation + epoch validation |
| `server/cache.js` | `inflight` | Single-flight request deduplication map | Deleted immediately in `finally` block upon promise resolution |
| `server/cache.js` | `localFallbackRateLimits` | Local sliding window rate limiter during Redis outages | Bounded transient sliding window counter |
| `server/ids.js` | `chains` | In-process request mutex queue per namespace | Cleared as queued promises resolve |
| `server/metrics.js` | `metrics`, `dropCounts` | Prometheus metrics telemetry collectors | Exclusively for monitoring telemetry |
| `server/static-cache.js` | `cache` | Static asset buffer LRU cache | Bounded LRU cache keyed by file mtime/size |
| `server/attack-detector.js` | `actors` | IP sliding window attack window tracking | Bounded transient window counter |
| `server/routes/*.js` | Local function `new Map()` | Request-scoped JSON aggregation | Created inside request scope and GC'd on HTTP completion |

---

## 3. Zero Trust Authority Architecture Reset Principles

1. **PostgreSQL 17 as Sole Authority**:
   - Process memory (`RAM`) and `Redis` must NEVER serve as authority for permissions, roles, tenant policies, routing weights, versions, governance logs, or session authority.
2. **Fail-Closed Caching Strategy**:
   - `Redis` serves exclusively as a read-through cache (`CACHE ONLY`). On Redis outage in production, operations that require distributed coordination must fail closed (HTTP 503) rather than allowing uncoordinated fallback logic (`{ allowed: true, fallback: true }`).
3. **Unified Authority Layer**:
   - All state mutations and policy checks must go through `server/infrastructure/authority/` (`postgres-authority.js`, `cache-adapter.js`, `transaction-manager.js`, `audit-ledger.js`).
