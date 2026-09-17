# شیفت کاری ۲ — Chat4

Base reference: `main@d262b4e624a021f478fd965dc29edd972dec9302`

Rules: one active mission at a time; scope isolation; no `git add -A`; no force-push; raw test exits; NOT-RUN is not PASS; push/merge evidence required; never touch another Arena's owned files; merge only after reconciliation.

| # | Mission ID | مأموریت | Acceptance |
|---:|---|---|---|
| 1 | `C4-01` | Redis live baseline | live vs fallback explicitly classified |
| 2 | `C4-02` | Redis key namespace/TTL audit | critical prefixes/TTL/invalidation/locks covered |
| 3 | `C4-03` | Redis failover | safe failure/recovery measured |
| 4 | `C4-04` | Cache stampede | single-flight/NX bounded under concurrency |
| 5 | `C4-05` | Cache invalidation | epoch prevents stale reads |
| 6 | `C4-06` | Redis memory policy | config matches workload/docs |
| 7 | `C4-07` | PgBouncer/pool saturation | wait/timeout behavior measured |
| 8 | `C4-08` | DB hotpath optimization | one confirmed slow query/index fixed with EXPLAIN |
| 9 | `C4-09` | Partition maintenance | grades/attendance partitions and retention verified |
| 10 | `C4-10` | Partition concurrency | boundary concurrency no deadlock/data loss |
| 11 | `C4-11` | Worker backpressure | queue/memory bounded under overload |
| 12 | `C4-12` | Static-cache correctness | mtime/size/LRU invalidation verified |
| 13 | `C4-13` | Event-loop hotspot | one confirmed blocking path improved |
| 14 | `C4-14` | Capacity benchmark reproducibility | one command + dataset/environment manifest |
| 15 | `C4-15` | Load scenario readiness | endpoint/auth/config drift detected |
| 16 | `C4-16` | National dataset reproducibility | schema/count/checksum deterministic |
| 17 | `C4-17` | Infra config lint | nginx/WAF/Redis/DB syntax + unsafe defaults |
| 18 | `C4-18` | Network timeout policy | critical outbound calls bounded |
| 19 | `C4-19` | Performance regression gate | intentional slowdown fails |
| 20 | `C4-20` | Performance release gate | full infra/perf evidence packet |

## Execution contract
`PLANNED → ASSIGNED → ACTIVE → EXECUTED → REPORTED → COMMITTED → PUSHED → PR/MERGE → VERIFIED → NEXT`

A mission is not complete until its exact SHA, test exits, PR/merge state and touched-file scope are recorded.
