# ARCHITECTURE RESET DECISION — Phase 7.0 Gate

## 1. Executive Summary
This document records the official architectural decision for Phase 7 of `https://github.com/rezaa2544/p2` (branch `main`). Based on the empirical discoveries documented in `RUNTIME_TOPOLOGY_REPORT.md`, `AUTHORITY_BOUNDARY_REPORT.md`, `DATABASE_TRUTH_REPORT.md`, and `FEATURE_RUNTIME_MATRIX.md`, we evaluate whether the system can be patched incrementally or requires a **Full Architecture Reset**.

---

## 2. Evaluation Criteria Matrix

| Evaluation Criterion | Threshold Condition | Audit Discovery Result | Verdict |
| :--- | :--- | :--- | :--- |
| **RAM Authority Presence** | Any business state, routing weight, or security policy stored in Node RAM maps (`new Map()`) | Discovered in `national-capacity-enforcement.js`, `national-region-control-plane.js`, `national-traffic-fabric.js`, `phase6-canary-engine.js`, `provincial-pilot-scaling.js`, `change-management.js` | **VIOLATED (FAIL)** |
| **Orphaned Features** | Modules present in codebase but disconnected from HTTP runtime or DB SSoT | Disconnected RAM maps in infrastructure & operations control plane modules | **VIOLATED (FAIL)** |
| **Fake Green Test Invocations** | Tests passing via `process.exit(0)` on missing dependencies or unperformed assertions | Discovered `process.exit(0)` skips in test files when optional dependencies are absent | **VIOLATED (FAIL)** |
| **Missing Runtime Wiring** | Security policies or routing decisions relying on un-persisted memory state | Replay nonces, canary cluster weights, and tenant region policies lack transactional DB persistence | **VIOLATED (FAIL)** |

---

## 3. Official Architectural Verdict

```
   ┌─────────────────────────────────────────────────────────┐
   │                                                         │
   │    VERDICT: FULL ARCHITECTURE RESET REQUIRED (PHASE 7)   │
   │                                                         │
   └─────────────────────────────────────────────────────────┘
```

### Justification
Patching individual symptoms will not eliminate class-of-failure defects. System reliability and Zero Trust security guarantees require PostgreSQL 17 to serve as the single, immutable Source of Truth (SSoT) for all state, routing, and policy decisions.

---

## 4. Phase 7 Zero Trust Execution Roadmap

Following this decision, implementation will proceed strictly in the mandated order:

1. **Step 1: Single Source of Truth Authority Layer (`server/infrastructure/authority/`)**
   - Create `postgres-authority.js`, `cache-adapter.js`, `transaction-manager.js`, `audit-ledger.js`.
2. **Step 2: Database Migration (`migrations/017_phase7_authority_foundation.sql` & `.down.sql`)**
   - Add `canary_state`, `governance_ledger` (with `UNIQUE(nonce)`), `tenant_policy`, and `system_audit` tables.
3. **Step 3: Runtime HTTP Re-Wiring**
   - Re-wire canary engine, tenant region control plane, capacity enforcement, and replay protection to query PostgreSQL via the Authority Layer.
4. **Step 4: Strict Redis Caching Policy**
   - Enforce `CACHE ONLY` Redis policy with fail-closed HTTP 503 behavior on Redis outages for coordinated distributed operations (eliminating uncoordinated `{ allowed: true, fallback: true }` overrides).
5. **Step 5: Test Infrastructure Rebuild**
   - Eliminate `process.exit(0)` skips across all test suites so missing dependencies trigger hard assertion failures (`throw Error()`). Create `tools/production-verifier.sh` to execute the full T1–T7 test matrix.
6. **Step 6: Production Verification & Final Certification Report**
   - Execute runtime verification and generate `ROOT_ARCHITECTURE_RESET_FINAL_REPORT.md`.
