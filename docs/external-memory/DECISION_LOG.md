# Payesh — Decision Log

This is the durable record of **why** material project decisions were made.

## 2026-09-25 — External memory architecture

**Decision:** Implement a seven-layer external memory system around the repository.

**Why:** Chat context is finite and deep debugging can displace earlier project context. Durable project state therefore needs explicit external artifacts.

**Layers:** project flow, daily tasks, decisions/specifications, code defects, transient notes, visual architecture, and exact change history.

**Repository implementation:** dashboard, daily task ledger, decision log, architecture diagram, CHANGELOG, and GitHub issue workflow.

**Boundary:** This system does not replace the canonical roadmap, current-head ground truth, or Strict Verification Gate.

## Decision template

### YYYY-MM-DD — <title>

**Decision:**  
**Context:**  
**Alternatives considered:**  
**Why chosen:**  
**Impact:**  
**Evidence / references:**  
**Follow-up:**  
