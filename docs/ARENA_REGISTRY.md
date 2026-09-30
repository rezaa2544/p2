> ## 🔴 CURRENT EXECUTION OVERRIDE — 2026-09-24
> registry مالکیت عملیاتی است و ترتیب canonical را override نمی‌کند. در زمان Atria sweep، ownership عملیاتیِ همان ناحیه به Atria محدود است؛ سایر Arenaها فقط scope مستقل و non-overlapping را اجرا کنند.
> مرجع وضعیت: `docs/CURRENT_PROJECT_INTELLIGENCE.md`.

---

# Payesh — Arena Registry

**Status:** ACTIVE  
**Effective:** 2026-09-14

This registry defines operational ownership for the Git-driven execution loop. It does not override canonical roadmap ownership; conflicts are escalated to ChatGPT.

| Chat | Operational role | Primary domain | Rule |
|---|---|---|---|
| Chat 1 | Coordinator / Online Supervisor | Cross-Arena reconciliation, mission control, evidence verification | Does not self-declare National GO; does not start implementation outside issued Mission; may use the coordinator continuity envelope for control-plane work |
| Chat 2 | Feature / application execution | Application features assigned by Mission | No feature expansion outside Mission; continuity fallback limited to existing evidenced application failures and regression work |
| Chat 3 | Sync / data-write / application reliability | A01, sync/offline, write-path correctness | P0-1 overlap requires explicit adjudication before merging competing implementations; fallback limited to existing evidenced write/sync failures |
| Chat 4 | Performance / infrastructure | Redis, workers, observability, load infrastructure, deployment | Live/national claims require corresponding environment evidence; fallback limited to existing evidenced infra/performance work |
| Chat 5 | QA / chaos / quality gate | Test strategy, failure testing, acceptance evidence | Independent verification; report failures honestly; fallback limited to existing QA/acceptance failures and safe local reproductions |
| Chat 6 | Release / database / merge control | PostgreSQL enforcement, release gates, migration/merge evidence | Never mark a gate closed without source + evidence; fallback includes existing release/database/config-gate defects |
| Chat 7 | Merge queue / documentation gate monitoring | Merge hygiene, freeze/statistics-sync monitoring, documentation integration | Does not merge or alter historical freeze artifacts without explicit Mission; fallback limited to existing documentation/gate integrity work |
| Chat 8 | Integration / governance | Merge hygiene, docs/evidence reconciliation, integration control | Protect main from conflicting or stale evidence; fallback limited to evidence/integration hygiene, not ownership adjudication |
| Chat 9 | Behavioral simulation / audit | School simulation, behavioral verification, audit reproduction | No feature ownership; findings require evidence and explicit owner before remediation; fallback limited to reproduction/verification |
| Chat 10 | Operations / reliability | SLO, incident response, DR/RTO/RPO, operational readiness | Unsourced RTO/RPO values remain UNSOURCED; fallback limited to existing reliability/runbook/evidence gaps |

## Assignment rule

A Chat works from its current `docs/daily-missions/<Chat>/ACTIVE.md` whenever that Mission is recoverable.

**Continuity exception:** if the exact active Mission is temporarily unrecoverable after the prescribed recovery attempt, the Chat may work only within the bounded standing authorization in `docs/ARENA_CONTINUITY_AUTHORIZATION.md`. This is not a new Mission and does not permit scope invention.

The registry is a role map plus the identity of the applicable fallback envelope; it is not permission for unrelated work.


## CURRENT OPERATING OVERLAY — 2026-09-30

The registry above remains the role map; this overlay defines the current monitoring mode.

- Atria owns the active remediation lane and may not be duplicated on the same invariant by another executor.
- Hermes is the independent verifier/supervisor and is invoked at material checkpoints rather than after every Atria prompt.
- The 11 Arena + 5 ChatGPT views form the 16-view discovery network described in docs/PREQUISITES.md §132 and are activated by targeted scope/checkpoint.
- Chat1/coordination metadata must never become a global blocker; safe independent work may proceed when dependencies and collision boundaries are explicit.
- No agent may declare National GO/NO-GO or promote historical evidence to current certification.
- Current status must always be read from docs/CURRENT_PROJECT_INTELLIGENCE.md and execution order from docs/CURRENT_WORK_EXECUTION_PLAN.md.

Current HEAD binding: 7c147d3e58687059b248417d348f63cdbf0155d5.

## FINAL OPERATING MODEL OVERLAY — 2026-09-30

The 16-view Arena/ChatGPT network is a **targeted independent discovery and challenge layer**, not a mandatory parallel executor for every Atria mission.

Activation occurs when Hermes or ChatGPT identifies a specialist scope, disputed claim, security/data-integrity concern, architectural uncertainty, or evidence gap requiring independent examination. Outputs must remain non-overlapping, evidence-bound and reconciled against the same current HEAD.

The governing chain is: **Atria executes → Hermes verifies/challenges → 16-view network investigates selected gaps → ChatGPT reconciles and decides.**

## ARENA METHOD LAYER — 2026-10-01

The Arena registry now uses a method layer in addition to its role/workstream layer. This layer is adapted from the external arena-skill methodology and is intentionally implementation-agnostic.

### Strategy-card library
A challenge may combine one reasoning mode, one workflow and one strategy posture. The reference library contains 15 reasoning modes × 12 workflows × 12 strategy postures (2,160 possible combinations). This is a selection library, not 2,160 agents.

Use only combinations that are orthogonal to the mission. Examples:
- evidence-first + test-first + maximal-rigour for certification/evidence disputes;
- inversion + build-then-break + defensive for security/failure claims;
- systems-thinking + requirements-checklist + completeness for end-to-end capability gaps;
- first-principles + decomposition + fewest-moving-parts for architecture/root-cause disputes.

### Fixed challenge contract
For one Arena challenge, every participant receives the same task/context envelope, including exact SHA, scope, constraints and evidence boundary. Strategy cards may change the reasoning approach but never the mission facts or acceptance criteria.

### Adversarial round pattern
Where useful, use:
candidate → attack → defend with evidence → independent judge → unresolved objections → revalidation.
A fatal verified flaw in a critical invariant blocks closure. A tournament/bracket result, reviewer count or internal score cannot certify correctness by itself.

### Baseline and persistence
If a previous report/fix is being challenged, use blind baseline comparison where practical. Preserve the challenge packet and objections so the work can resume after context reset. Current-head evidence remains authoritative.

### Activation / cost rule
The 11 Arena views remain independent workstreams, not a standing tournament. Activate a small non-overlapping subset for routine material uncertainty; expand only for critical/disputed/recurrent findings. Never use the Arena method to duplicate an active Atria remediation scope.

### Relationship to Hermes
Arena challenges discover and attack; Hermes independently verifies the resulting claims; ChatGPT reconciles and decides. Arena cannot promote a finding to VERIFIED and cannot close a gate.
