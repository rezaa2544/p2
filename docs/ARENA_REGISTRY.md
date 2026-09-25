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
