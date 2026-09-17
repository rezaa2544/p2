# شیفت کاری ۲ — Chat3

Base reference: `main@16182f8cb9a9146fbc25c05ac4a9768f4f2d9702`

Rules: one active mission at a time; scope isolation; no `git add -A`; no force-push; raw test exits; NOT-RUN is not PASS; push/merge evidence required; never touch another Arena's owned files; merge only after reconciliation.

| # | Mission ID | مأموریت | Acceptance |
|---:|---|---|---|
| 1 | `C3-01` | A01 canonical contract | invariants aligned with PG source-of-truth |
| 2 | `C3-02` | Wave-1 sync/write integration | approved write path integrated; multi-instance tests |
| 3 | `C3-03` | Sync validation boundary | malformed/unauthorized payloads fail before DB |
| 4 | `C3-04` | Idempotency audit | replay produces one logical write |
| 5 | `C3-05` | OCC audit | stale version => 409 and no partial write |
| 6 | `C3-06` | Delta cursor boundaries | equal timestamp/chg_id/pagination/skew cases |
| 7 | `C3-07` | Tombstone lifecycle | retention/full-resync contract tested |
| 8 | `C3-08` | Offline queue recovery | restart/network fault converges |
| 9 | `C3-09` | Bounded delta resume | truncation cannot silently lose data |
| 10 | `C3-10` | Conflict payload contract | stable server/client conflict schema |
| 11 | `C3-11` | Sync error taxonomy | explicit codes + HTTP semantics |
| 12 | `C3-12` | Batch atomicity | mid-batch failure leaves no partial commit |
| 13 | `C3-13` | Outbox consistency | business row and event commit/rollback together |
| 14 | `C3-14` | Replay/recovery drill | interrupted sync converges |
| 15 | `C3-15` | Multi-instance PG drill | write A/read B/update B/read A |
| 16 | `C3-16` | Payload/backpressure test | bounded memory/latency + explicit rejection |
| 17 | `C3-17` | IndexedDB integrity | corruption/migration recovery |
| 18 | `C3-18` | Sync observability | pull/push/conflict/retry metrics bounded |
| 19 | `C3-19` | Sync performance benchmark | p50/p95 before/after + correctness |
| 20 | `C3-20` | Sync release gate | full A01/sync evidence packet |

## Execution contract
`PLANNED → ASSIGNED → ACTIVE → EXECUTED → REPORTED → COMMITTED → PUSHED → PR/MERGE → VERIFIED → NEXT`

A mission is not complete until its exact SHA, test exits, PR/merge state and touched-file scope are recorded.
