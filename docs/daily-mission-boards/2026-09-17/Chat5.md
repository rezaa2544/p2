# شیفت کاری ۲ — Chat5

Base reference: `main@16182f8cb9a9146fbc25c05ac4a9768f4f2d9702`

Rules: one active mission at a time; scope isolation; no `git add -A`; no force-push; raw test exits; NOT-RUN is not PASS; push/merge evidence required; never touch another Arena's owned files; merge only after reconciliation.

| # | Mission ID | مأموریت | Acceptance |
|---:|---|---|---|
| 1 | `C5-01` | Full test inventory | files/counts/raw exits match |
| 2 | `C5-02` | Test runner truthfulness | skip/failure/banner traps removed |
| 3 | `C5-03` | Regression gate ordering | stale artifacts fail before write-mode build |
| 4 | `C5-04` | Mutation baseline guard | invalid baseline cannot run |
| 5 | `C5-05` | A01/sync regression | all failures classified |
| 6 | `C5-06` | Authz regression | tenant/is_head positive+negative |
| 7 | `C5-07` | DB migration regression | empty DB→current schema reproducible |
| 8 | `C5-08` | Artifact parity regression | source/build/index/write-perms/guide |
| 9 | `C5-09` | Security regression | secret + security suites truthful |
| 10 | `C5-10` | Offline regression | queue/delta/restart fault tests |
| 11 | `C5-11` | Redis regression split | fallback vs live evidence separate |
| 12 | `C5-12` | Performance regression | repeat p95/p99 and compare baseline |
| 13 | `C5-13` | Chaos harness audit | S1–S10 executable/evidence prerequisites |
| 14 | `C5-14` | Recovery test audit | backup/restore/PITR/failover readiness |
| 15 | `C5-15` | Critical E2E | login→attendance→grade→report→parent |
| 16 | `C5-16` | Accessibility regression | critical keyboard/focus/labels |
| 17 | `C5-17` | Security negative controls | authz/SSRF/secret/tenant mutants killed |
| 18 | `C5-18` | Flake detection | repeat selected suites and assign owners |
| 19 | `C5-19` | CI/local parity | one documented parity gap closed |
| 20 | `C5-20` | QA release verdict | raw exits/env/skips/unresolved defects |

## Execution contract
`PLANNED → ASSIGNED → ACTIVE → EXECUTED → REPORTED → COMMITTED → PUSHED → PR/MERGE → VERIFIED → NEXT`

A mission is not complete until its exact SHA, test exits, PR/merge state and touched-file scope are recorded.
