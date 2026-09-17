# شیفت کاری ۲ — Chat6

Base reference: `main@16182f8cb9a9146fbc25c05ac4a9768f4f2d9702`

Rules: one active mission at a time; scope isolation; no `git add -A`; no force-push; raw test exits; NOT-RUN is not PASS; push/merge evidence required; never touch another Arena's owned files; merge only after reconciliation.

| # | Mission ID | مأموریت | Acceptance |
|---:|---|---|---|
| 1 | `C6-01` | Docs stats current baseline | counted files vs manifest exact |
| 2 | `C6-02` | Docs-count policy | daily reports no longer corrupt normal stats |
| 3 | `C6-03` | Docs-refs policy | historical absent-path evidence handled safely |
| 4 | `C6-04` | RC45 prerequisites | marker/stats/refs preconditions machine-checkable |
| 5 | `C6-05` | RC45 bump | only after prerequisites; freeze/stats/secret green |
| 6 | `C6-06` | Release branch discipline | stale/shared branch preflight |
| 7 | `C6-07` | True-merge attribution gate | all mission commits reachable after merge |
| 8 | `C6-08` | P0 tracker refresh | current status + evidence SHA |
| 9 | `C6-09` | Production checklist refresh | no green checkbox without evidence |
| 10 | `C6-10` | Backup/PITR release gate | missing live prerequisites stay NOT-RUN |
| 11 | `C6-11` | Migration release gate | immutable migration/recovery evidence |
| 12 | `C6-12` | Rollback/forward recovery drill | isolated DB integrity preserved |
| 13 | `C6-13` | Release artifact manifest | shipped hashes reproducible |
| 14 | `C6-14` | Release provenance | artifact→source→generator trace |
| 15 | `C6-15` | Deployment config audit | required vars documented and aligned |
| 16 | `C6-16` | SLO release prerequisites | threshold mismatch machine-detected |
| 17 | `C6-17` | Release incident runbook | rollback/partial migration fail-closed steps |
| 18 | `C6-18` | Clean release rehearsal | no production deployment |
| 19 | `C6-19` | RC candidate verification | QA/security/perf all same SHA |
| 20 | `C6-20` | Release handback | exact blockers + next actions |

## Execution contract
`PLANNED → ASSIGNED → ACTIVE → EXECUTED → REPORTED → COMMITTED → PUSHED → PR/MERGE → VERIFIED → NEXT`

A mission is not complete until its exact SHA, test exits, PR/merge state and touched-file scope are recorded.
