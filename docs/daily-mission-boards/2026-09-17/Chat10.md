# شیفت کاری ۲ — Chat10

Base reference: `main@d262b4e624a021f478fd965dc29edd972dec9302`

Rules: one active mission at a time; scope isolation; no `git add -A`; no force-push; raw test exits; NOT-RUN is not PASS; push/merge evidence required; never touch another Arena's owned files; merge only after reconciliation.

| # | Mission ID | مأموریت | Acceptance |
|---:|---|---|---|
| 1 | `C10-01` | Current ops baseline | deployment/observability/backup/DR/on-call evidence |
| 2 | `C10-02` | RTO/RPO evidence model | exact measurement method, no invented values |
| 3 | `C10-03` | Backup inventory | jobs/location/encryption/retention |
| 4 | `C10-04` | Restore drill | isolated restore + checksum/timing |
| 5 | `C10-05` | PITR drill | isolated point-in-time recovery |
| 6 | `C10-06` | DR runbook | one missing operational step closed |
| 7 | `C10-07` | Observability stack validation | Prometheus/Alertmanager/Grafana aligned |
| 8 | `C10-08` | Alert coverage audit | failure modes mapped to alerts |
| 9 | `C10-09` | Trace correlation | trace_id end-to-end on one path |
| 10 | `C10-10` | On-call readiness | every critical alert has response path |
| 11 | `C10-11` | Health/readiness audit | dependencies reflected truthfully |
| 12 | `C10-12` | Graceful shutdown | SIGTERM/SIGINT no committed-work loss |
| 13 | `C10-13` | Disk pressure drill | isolated low-disk behavior + alert |
| 14 | `C10-14` | Memory pressure drill | isolated bounded behavior |
| 15 | `C10-15` | Operational rate-limit audit | thresholds documented/observable |
| 16 | `C10-16` | Deployment smoke | clean artifact health checks reproducible |
| 17 | `C10-17` | Config drift audit | code/config/docs required-vars aligned |
| 18 | `C10-18` | Incident postmortem template | incident→cause→fix→test→impact→prevention |
| 19 | `C10-19` | Ops release rehearsal | candidate operational readiness |
| 20 | `C10-20` | Ops handback | evidence + unsourced gaps + live prerequisites |

## Execution contract
`PLANNED → ASSIGNED → ACTIVE → EXECUTED → REPORTED → COMMITTED → PUSHED → PR/MERGE → VERIFIED → NEXT`

A mission is not complete until its exact SHA, test exits, PR/merge state and touched-file scope are recorded.
