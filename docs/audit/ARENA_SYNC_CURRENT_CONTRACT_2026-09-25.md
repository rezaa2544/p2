# Current-HEAD Sync/OCC remediation contract — Arena, 2026-09-25

Base: `4938631633c9c578db2679905fd46c4daaedd80a`, freshly fetched main.
Independent branch; no historical Arena/DR branch dependency. Tech Lead alone merges.

## Explicit owner decision

User selected **production/strict only**: require valid bases for all client
update/delete operations, including formerly receipt-order LWW. Preserve missing-base
legacy compatibility outside production/strict. Therefore the global invariant is
still **FAILED** for legacy; it must not become a blanket green claim.

Strict means PAYESH_STRICT_BASE_VERSION=1, PAYESH_ENV=production or NODE_ENV=production.
All five PATCH routes retain their strict requirement. Invalid provided bases are
rejected before DB persistence. Queue updates/deletes carry their original bases
across replay; sequential offline edits advance predicted versions rather than
silently rebasing a stale intent on server state.

PostgreSQL conflict resolution locks the conflict and live target. Incoming may
apply only if the conflict's observed server version is still current. Missing or
changed targets return409; choosing server returns live authoritative state. Target
CAS and resolved status commit together. Failed persistence returns503, never a
success ACK. Cache publication follows commit. Resolution is not a privilege or
ownership reassignment path.

Sync persistence carries base_version into SQL CAS. Multi-op dependent edits retain
order. UID claims precede all batch effects in the same transaction. Concurrent
losers roll back the entire mixed batch and receive retryable503; the retry observes
durable duplicate UIDs and processes remaining intents. This is not a promise of
exactly-once delivery; it is protection against duplicate committed effects under
the tested UID contract.

## Runtime regression

`tests/current-head-sync-pg.cjs` starts independent production-module HTTP workers,
uses a unique disposable PostgreSQL schema, reads authoritative state, and performs
real SIGKILL/restart and Chromium renderer-crash tests. Requires Node22, pg,
Playwright/Chromium, and SYNC_DATABASE_URL. It does not silently skip missing DB or
browser prerequisites. `RUN_BROWSER=0` is an explicit narrower diagnostic, not
browser clearance. Pass an output directory as first argument.

The audit intentionally returns1 while known legacy invariant failures remain.
Inspect each ledger cell, not the process status alone. Tests use a minimal schema
and fixed manager session: not authenticated full-app, migration-chain, production
multi-host, real-device power-loss, or E4 proof. Baseline and final evidence are
retained separately outside the repository with exact tested SHA and commands.
Dirty-tree development runs are not evidence for the unmodified base SHA.

Fresh main baseline reproduced stale conflict payload overwrite with a nondecreasing
counter, concurrent duplicate UID inserts, malformed-base503, and legacy/LWW stale
overwrite. Existing wave4-sync-all-collections AC11 also fails on the pristine base;
its historical no-query expectation requires separate reconciliation, not suppression.

**Roadmap Reconciliation Required.** Strict Gate, current-SHA independent reviews,
CI parity, rollout/migration compatibility, and external topology remain separate
requirements. No certification or production GO follows from these changes.
