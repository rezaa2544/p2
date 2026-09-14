# Payesh — Arena Registry

**Status:** ACTIVE  
**Effective:** 2026-09-14

This registry defines operational ownership for the Git-driven execution loop. It does not override canonical roadmap ownership; conflicts are escalated to ChatGPT.

| Chat | Operational role | Primary domain | Rule |
|---|---|---|---|
| Chat 1 | Coordinator / Online Supervisor | Cross-Arena reconciliation, mission control, evidence verification | Does not self-declare National GO; does not start implementation outside issued Mission |
| Chat 2 | Feature / application execution | Application features assigned by Mission | No feature expansion outside Mission; national blockers take precedence when assigned |
| Chat 3 | Sync / data-write / application reliability | A01, sync/offline, write-path correctness | P0-1 overlap requires explicit adjudication before merging competing implementations |
| Chat 4 | Performance / infrastructure | Redis, workers, observability, load infrastructure, deployment | Live/national claims require corresponding environment evidence |
| Chat 5 | QA / chaos / quality gate | Test strategy, failure testing, acceptance evidence | Independent verification; report failures honestly |
| Chat 6 | Release / database / merge control | PostgreSQL enforcement, release gates, migration/merge evidence | Never mark a gate closed without source + evidence |
| Chat 7 | Merge queue / documentation gate monitoring | Merge hygiene, freeze/statistics-sync monitoring, documentation integration | Does not merge or alter historical freeze artifacts without explicit Mission |
| Chat 8 | Integration / governance | Merge hygiene, docs/evidence reconciliation, integration control | Protect main from conflicting or stale evidence |
| Chat 9 | Behavioral simulation / audit | School simulation, behavioral verification, audit reproduction | No feature ownership; findings require evidence and explicit owner before remediation |
| Chat 10 | Operations / reliability | SLO, incident response, DR/RTO/RPO, operational readiness | Unsourced RTO/RPO values remain UNSOURCED |

## Assignment rule

A Chat may work only from its current `docs/daily-missions/<Chat>/ACTIVE.md`.

This registry is a role map, not a permission to act without a Mission.
