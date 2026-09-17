# شیفت کاری ۲ — Chat9

Base reference: `main@d262b4e624a021f478fd965dc29edd972dec9302`

Rules: one active mission at a time; scope isolation; no `git add -A`; no force-push; raw test exits; NOT-RUN is not PASS; push/merge evidence required; never touch another Arena's owned files; merge only after reconciliation.

| # | Mission ID | مأموریت | Acceptance |
|---:|---|---|---|
| 1 | `C9-01` | SIM-04 A reproduction | clean main exact evidence; no fix |
| 2 | `C9-02` | SIM-04 B reproduction | clean main exact evidence; no fix |
| 3 | `C9-03` | SIM-04 C reproduction | clean main exact evidence; no fix |
| 4 | `C9-04` | Failure owner routing | file/line + Chat2/3/5 owner |
| 5 | `C9-05` | Failure-message audit | one swallowed/ambiguous path fixed |
| 6 | `C9-06` | Retry-storm simulation | backoff/idempotency prevents amplification |
| 7 | `C9-07` | DB outage simulation | fail-closed and no corruption |
| 8 | `C9-08` | Redis outage simulation | behavior matches documented fallback |
| 9 | `C9-09` | Queue outage simulation | backlog recovery/no event loss |
| 10 | `C9-10` | Network partition simulation | no duplicate logical write |
| 11 | `C9-11` | Clock-skew simulation | no cursor loss/duplication |
| 12 | `C9-12` | Partial-response simulation | resume converges |
| 13 | `C9-13` | Corrupt-cache simulation | safe invalidate/reload |
| 14 | `C9-14` | Migration interruption simulation | forward recovery |
| 15 | `C9-15` | Backup restore simulation | timed only if actually executed |
| 16 | `C9-16` | Security failure simulation | unauthorized/SSRF/secret negative cases |
| 17 | `C9-17` | Observability failure simulation | missing signal not green |
| 18 | `C9-18` | Chaos evidence schema | setup/fault/expected/observed/recovery/limits |
| 19 | `C9-19` | Failure-path regression gate | NOT-RUN semantics explicit |
| 20 | `C9-20` | Reliability handback | failures/fixes/live prerequisites |

## Execution contract
`PLANNED → ASSIGNED → ACTIVE → EXECUTED → REPORTED → COMMITTED → PUSHED → PR/MERGE → VERIFIED → NEXT`

A mission is not complete until its exact SHA, test exits, PR/merge state and touched-file scope are recorded.
