# PAYESH — Architecture Evolution Roadmap

**Status:** CANONICAL / ACTIVE / EVOLUTION TRACK
**Date:** 2026-09-25
**Repository:** rezaa2544/p2

## Purpose
This document registers twelve modern architecture patterns for Payesh. It is a controlled evolution roadmap, not a mandate to rewrite the current system. Existing architecture remains the baseline until measured evidence and an Architecture Review justify change.

## Priority P0 — evaluate and prepare now
### 1. Modular Monolith + Vertical Slices
Hard boundaries around domains/features while keeping one deployable application.
### 2. Event-Driven Architecture
Publish domain events so consumers can react asynchronously without direct coupling.
### 3. Transactional Outbox
Persist a business change and its event atomically, then publish/retry asynchronously.
### 4. OpenTelemetry / End-to-End Tracing
Follow a request through API → auth → PostgreSQL → Redis → queue → worker → intelligence.
### 5. Policy-as-Code / Central Policy Layer
Centralize authorization, tenant scope and object ownership decisions.

## Priority P1 — after P0 foundations and evidence
### 6. Selective CQRS
Separate write models from optimized read models only where high-volume reads justify it.
### 7. Workflow / Saga
Coordinate long-running multi-step flows with explicit state, retry, resume and compensation.

## Conditional / Research Track
### 8. Event Sourcing
Consider only where audit/replay requirements justify the added complexity.
### 9. Microservices
Independently deploy and scale domains only when measured evidence requires it. Modular Monolith remains the default.
### 10. Kubernetes
Adopt only when measured operational requirements justify the complexity.
### 11. Service Mesh
Adopt only after a substantial multi-service topology exists and needs mTLS/traffic policy/observability.
### 12. Zero-Trust Service Boundaries
Require explicit identity, authorization, tenant and ownership checks between internal components.

## Additional modernization candidates registered for future assessment
- TypeScript: gradual migration for contracts, shared types and new vertical slices.
- React + Next.js: selective adoption for new UI vertical slices where benefits justify coexistence and migration cost.
- Three.js: only for a concrete 3D visualization or educational use case.
- Go: selective service extraction only when a bounded context has measured throughput, latency, isolation or deployment requirements.
- Redis: distributed cache/ephemeral state; never a replacement for PostgreSQL source of truth.
- Elasticsearch: derived search/read index for suitable full-text or analytics workloads; not transactional source of truth.
- Distributed database: research only after capacity, geography, consistency and SLA evidence.

The complete capability backlog is in docs/FUTURE_UPGRADES_AND_CAPABILITY_ROADMAP.md.
The mandatory code organization contract is in docs/CODEBASE_STRUCTURE_STANDARD.md.

## Adoption order
Modular Monolith → Event-Driven + Outbox → OpenTelemetry → Policy-as-Code → Selective CQRS → Workflow/Saga → conditional research
Zero-Trust boundaries are cross-cutting.

## Non-goals
- No blanket migration to microservices.
- No blanket CQRS.
- No Event Sourcing for all data.
- No Kubernetes/service mesh merely because they are modern.
- No architecture rewrite during active Atria remediation without explicit Architecture Review.
- No frontend rewrite merely to adopt a fashionable framework.
- No replacement of PostgreSQL merely to introduce a distributed database/search engine.

## Definition of architecture adoption
Problem → Evidence → Architecture Decision → Bounded Implementation → Regression/Contract Tests → Runtime Evidence → Review
Documentation of a pattern is not evidence that it has been implemented or certified.

## Relation to execution plan
Current defect sequence remains authoritative:
Atria Critical/High → Phase A Carry-over Closure → Atria Medium → Atria Low → Full Multi-AI Validation → Capability Matrix → Role Matrix → E2E → Failure/Recovery → Performance → Final Certification
The architecture track is subordinate to these gates unless an explicit Architecture Review changes the sequence.