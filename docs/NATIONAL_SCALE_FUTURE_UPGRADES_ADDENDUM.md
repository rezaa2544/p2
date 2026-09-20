# NATIONAL SCALE & FUTURE UPGRADES ARCHITECTURE ADDENDUM

**Document Version:** 1.0.0-R7.3  
**Repo Baseline:** `rezaa2544/p2`  
**Git Commit Baseline:** `73e652e3070b317ee84a47e6e8ef2d4871099295`  
**Runtime Requirement:** Node.js `>=22.0.0`  
**Database Authority:** PostgreSQL 17 (SSoT)  
**Distributed Cache:** Redis 8 (Fail-Closed)

---

## §1. National Baseline Targets

| Metric Parameter | Target National Capacity | Technical Implementation |
|---|---|---|
| **Registered User Base** | 10,000,000 (10M) | PostgreSQL Partitioned Users Table |
| **Peak Concurrent Users** | 2,500,000 (2.5M) | Stateless Node 22 API Gateway Nodes |
| **Peak Ingress Throughput** | 20,000 RPS | Nginx Edge + L1/L2 Redis 8 Caching |
| **Max Write Throughput** | 2,500 TPS | Transactional Outbox + PgBouncer |
| **Event Stream Capacity** | 25,000 events/s | Distributed Async Event Queue |
| **DB Connection Capacity** | 3,500 active conns | PgBouncer Transaction Pooling (Port 6432) |

---

## §2. Key Architectural Invariants

1. **PostgreSQL as Authoritative Source of Truth:**  
   PostgreSQL 17 is the single authoritative store for all state mutations, tenant policies, canary configurations, and audit event logs. In-memory Maps or RAM data structures are strictly prohibited from making authoritative security or routing decisions.

2. **Redis 8 Ephemeral & Cache-Only Semantics:**  
   Redis 8 functions strictly as an ephemeral L2 cache, rate-limiter, and distributed lock manager. When Redis is unreachable in production (`NODE_ENV=production`), operations strictly fail closed returning `503 REDIS_UNAVAILABLE` without falling back to local memory.

3. **Node.js 22 Engine Standardization:**  
   The runtime environment is standardized on Node.js `>=22.0.0`. All dependencies (including `jsdom` 30) and CI job matrix definitions (`.github/workflows/node.js.yml`) enforce Node 22 execution.

4. **Phase 9.0 Wiring Dependency:**  
   Phase 9.0 National Cutover cannot commence until Phase 8.5 Exit Gates (`28, G3, G4, G9`) are 100% verified green.
