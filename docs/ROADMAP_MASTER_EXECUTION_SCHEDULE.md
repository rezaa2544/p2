# ROADMAP MASTER EXECUTION SCHEDULE & CRITICAL PATH SPECIFICATION

**Document Version:** 1.0.0-R7.3  
**Repo Baseline:** `rezaa2544/p2`  
**Git Baseline Commit:** `73e652e3070b317ee84a47e6e8ef2d4871099295`  
**Engine Baseline:** Node.js `>=22.0.0` (Canonical runtime)  
**Database Baseline:** PostgreSQL 17 (Authoritative SSoT)  
**Cache Baseline:** Redis 8 (Ephemeral/Cache-only with Fail-Closed Semantics)

---

## §1. National Baseline & Architecture Envelope

The Payesh Master Execution Schedule is engineered to support the national scale baseline:

- **Total Registered Users:** 10,000,000 (10M)
- **Peak Concurrent Active Users:** 2,500,000 (2.5M)
- **Peak System Ingress:** 20,000 RPS (20k RPS)
- **Max Write Throughput:** 2,500 TPS (2.5k TPS)
- **Event Bus Throughput:** 25,000 events/sec (25k events/s)
- **Database Connection Pool:** 3,500 active connections (managed via PgBouncer)
- **Data Durability:** PostgreSQL 17 serves as the single authoritative Source of Truth (SSoT). Redis 8 acts strictly as an ephemeral L2 cache and distributed lock store with zero-data-loss fail-closed protection.

---

## §2. Total Planned Sprints & Arithmetic Breakdown

The master execution model encompasses **140 Total Planned Sprints** across Phases 0 through 9:

| Phase / Workstream | Sequence Range | Planned Sprints | Architectural Scope |
|---|---|---|---|
| **Phase 0–2** Core Foundation & DB Engineering | Sprints 01–20 | 20 Sprints | Relational PG SSoT, Schema, Migrations 001–020, Auth, Multi-Instance Lock |
| **Phase 3–5** Educational Intelligence & Scaling | Sprints 21–50 | 30 Sprints | Semantic Layer, Attendance/Grades Intelligence, Capacity Enforcement |
| **Phase 6–7** Canary Engine, Governance & Zero-Trust | Sprints 51–80 | 30 Sprints | Ed25519 Governance, Atomic Canary Engine, PostgreSQL Authority, Verification |
| **Phase 8.1–8.5** Production Readiness & Hardening | Sprints 81–115 | 35 Sprints | National Load Testing (k6/W18), Disaster Recovery, Multi-Region Federation |
| **Phase 9.0–9.5** National Cutover & Post-Go-Live | Sprints 116–140 | 25 Sprints | National Wiring Gate, Live Ingress Cutover, Continuous Observability |
| **TOTAL PLANNED SPRINTS** | **01–140** | **140 Sprints** | **100% Comprehensive Master Schedule** |

---

## §3. Critical Path & Execution Schedule Methodology (B-3 Remediation)

### Critical Path Determination
To eliminate schedule drift and maintain strict mathematical integrity:
- **Serial Execution Baseline (Canonical Critical Path):** **140 Sprints**.
- **Parallel Workstream Capability:** While certain workstreams (e.g. Phase 8.2 Regional Federation & Phase 8.3 Observability) are designated as **PARALLEL-SAFE**, parallel acceleration is classified strictly as a **PLANNED capability** rather than a measured calendar schedule.
- The master critical path calculation assumes serial execution order across all blocking gates:
  $$\text{Critical Path} = \sum_{i=1}^{N} \text{Duration}(\text{Sprint}_i) = 140 \text{ Sprints}$$

---

## §4. Master Execution Sequence & Dependency Graph (B-4 Remediation)

| Seq | Phase / Milestone | Planned Sprints | Required Dependencies | Blocking Exit Gate |
|---|---|---|---|---|
| 01 | Phase 0 Discovery & Architecture Baseline | Sprints 01–05 | None | G0: Architecture Freeze |
| 05 | Phase 1 PostgreSQL SSoT & Schema 001–010 | Sprints 06–15 | Seq 01 | G1: PG SSoT Enforced |
| 10 | Phase 2 Auth & Tenant Isolation | Sprints 16–25 | Seq 05 | G2: Zero-Trust Auth |
| 15 | Phase 3 Sync Engine & Delta Compression | Sprints 26–40 | Seq 10 | G3: A01 Delta Sync |
| 20 | Phase 4 Observability & Redis 8 L2 Cache | Sprints 41–55 | Seq 15 | G4: Metrics & Tracing |
| 21 | Phase 8.1 Production Hardening Baseline | Sprints 56–65 | Seq 20 | G5: Prod Verifier Green |
| 22 | Phase 8.2 Multi-Region Federation | Sprints 66–75 | Seq 21 | G6: Multi-Region Sync |
| 23 | Phase 8.3 Disaster Recovery & PITR | Sprints 76–85 | Seq 21 | G7: RPO=0 / RTO<30s |
| 25 | Phase 8.4 National Load Testing (20k RPS) | Sprints 86–100 | Seq 22, Seq 23 | G8: k6 National Pass |
| 28 | Phase 8.5 Exit & Final Hardening | Sprints 101–115 | Seq 25 | **G9: Phase 8.5 Exit Gate** |
| **29** | **Phase 9.0 Wiring Gate (National Ingress Cutover)** | **Sprints 116–125** | **28, G3, G4, G9** | **G10: Phase 9.0 Cutover Approval** |
| 30 | Phase 9.5 Post-Cutover Operations | Sprints 126–140 | Seq 29 | G11: National Sign-Off |

### HARD ARCHITECTURAL CONSTRAINT (B-4 REMEDIATION)
> **Phase 9.0 Wiring Gate MUST NOT START before Phase 8.5 Exit.**  
> As formally specified in Sequence 29, the dependency graph explicitly links Sequence 29 to `28, G3, G4, G9`. Re-baselining or initiating Phase 9.0 before Phase 8.5 exit (`Seq 28`) is strictly prohibited by automated gate validation.

---

## §5. Verification & Audit Trail

All changes to the Master Execution Schedule are subject to automated verification against git HEAD:
- **Code Commit SHA:** `0b53ec0f72bfa70b423b5a4e3901d802dc0db54d`
- **Doc Commit SHA:** `73e652e3070b317ee84a47e6e8ef2d4871099295`
- **Verification Command:** `node tools/production-truth-gate.js`
