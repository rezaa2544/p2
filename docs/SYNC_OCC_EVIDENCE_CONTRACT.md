# Sync / offline / conflict evidence contract — Arena, 2026-09-24

Baseline: `4bff3bcb757162f040e82ffa26f3d40e46eb7a36` (fresh main). Branch: `arena-sync/offline-occ-20260924`. This work does not depend on the unmerged DR branch. Arena owns implementation/reproduction/regression/commit/PR; Tech Lead alone owns merge.

**Status: TESTED locally, not independently cleared.** Strict Verification Gate remains NOT VERIFIED until exact-SHA evidence, the complete registry and independent ChatGPT/Arena/Atria reviews exist. No certification or production GO follows from these tests.

## Findings and changed contracts

### A-18 — conflict resolution

Baseline reproduction: conflict captured at server_version=2, current target version=9/score=20; accepting incoming returned 200 and wrote version=3/score=11. A persistence exception also previously left cache mutated and conflict resolved.

Resolution now reads the authoritative PostgreSQL conflict and target under transaction row locks. It does not use a cached conflict as authority. Incoming is allowed only if the live target version still equals the version adjudicated by that conflict. Stale conflicts return 409; deleted targets are not recreated. Data and resolved status commit together; storage failure returns 503 without publishing a cache update. Two simultaneous resolution/PATCH clients can commit at most one mutation at the contested version. Server-wins returns the **current** row, not the historical conflict snapshot.

Field/schema/role checks reuse the sync gate, and tenant checks cover both conflict and current target. Unknown collection/fields, forged identity, foreign/null-tenant manager access and malformed request envelopes are rejected. Server-owned version/timestamps are never taken from the incoming patch. A stale conflict requires a new human reconciliation against current data; repeatedly clicking the old incoming choice must not silently rebase it.

The list endpoint fails closed if its PostgreSQL read fails. Global/null-school conflicts require superadmin. The injected response writer is retained for production counting and existing unit fixtures. Memory-only resolved-cache retention creates bounded tombstones; this is not a claim of PostgreSQL audit retention policy.

### A-20 — PATCH inventory

The router exposes five versioned domain PATCH paths: students, classes, grades, attendance and users (`server/index.js`). All now opt into the same required-base contract in production or with `PAYESH_STRICT_BASE_VERSION=1`; previously only grades opted in. Explicit versions must be positive safe integer numbers, not coerced strings/booleans. PostgreSQL UPDATE uses an atomic id+version predicate and server-owned increment.

**Compatibility boundary:** development memory mode still allows missing versions when strict mode is disabled, matching the pre-existing compatibility contract. It is not production authority or an offline safety guarantee. Use strict mode for staging and all concurrency drills. Untracked collections with intentional receipt-order/LWW semantics are not certified as OCC-protected by this change.

### Sync commit / replay breaches

1. `base_version` was omitted from update/delete mirror operations: a second client could commit between precheck and persistence, then the older payload overwrote it. The final PostgreSQL write/delete now receives the original base, and update payloads are detached snapshots.
2. Independent sync contexts with one UID could both insert. A sync-only PostgreSQL transaction acquires sorted UID advisory locks, checks committed UIDs before any mutation, and commits all data/derived effects plus UID marks together. The losing concurrent attempt may receive 503; retry then receives duplicate_ignored without another mutation. UID persistence errors cannot become successful data acknowledgements.
3. Same-process in-flight UIDs were prematurely reported as already durable. Only overlapping-UID requests now wait for the previous commit/rollback; unrelated requests remain concurrent. If attempt one fails, the waiter can apply instead of losing the write.
4. A different-UID INSERT with an existing ID could upsert and rewind version to 1. Client sync INSERT is now creation-only; cache collision and PostgreSQL identity collision fail with record_exists, never update an existing row. Trusted non-sync persistence callers retain their existing upsert contract.

### Client merge / offline versioning

A late pull previously overwrote a newer row, and offline protection looked at `queueItem.c` although real entries are `{op,status}`. Pull now protects actual queued operations, rejects older timestamped responses before moving the cursor, and refuses lower-version rows, including matching rows in full snapshots. The source VM tests exercise real module code, not a reimplementation.

The client's tracked collection list matches the server's VERSION_TRACKED list. Structural edits capture the base, local version counters cannot be rewound by a patch's version field, and deletes capture base before removing the row. Client source was rebuilt with the standard build command into index.html/USER_GUIDE.html; the permission catalogue was not regenerated.

## Reproduction and verification

Prerequisites: Node 22+, npm dependencies, an explicitly authorized disposable PostgreSQL 17 database. Live suites require `SYNC_TEST_DATABASE_URL`; absence is failure, never skip. Each creates/removes an isolated schema; fixture sessions and minimal tables are disclosed. Do not point them at production.

```bash
node tests/sync-client-adversarial.js
SYNC_TEST_DATABASE_URL=postgres://user@127.0.0.1:25432/postgres node tests/sync-occ-adversarial-live.js
SYNC_TEST_DATABASE_URL=postgres://user@127.0.0.1:25432/postgres node tests/sync-replay-adversarial-live.js
node tests/strict-gate-empty-registry.js
```

- Live OCC: five freshly reset rounds; actual PostgreSQL + two HTTP listeners invoking production route factories; 135 named checks plus final-state assertions. Sessions are fixtures, not authentication proof.
- Live replay: five rounds; independent in-process sync contexts using actual PostgreSQL; 60 named checks plus final-state assertions. This does not substitute for a production multi-host/restart drill.
- Client: five isolated VM contexts; 75 checks on actual sources. Browser/queue regressions separately exercise the rebuilt application.
- Failure injections include stale and omitted bases, adversarial conflict payloads, concurrent resolutions/PATCH, duplicate UID races, write-vs-delete races, target/status transaction rollback and UID-store failure/recovery.
- CI explicitly runs these tests with the existing PostgreSQL service. CI execution is separate from local results and requires the pushed SHA.

## Strict gate blockers discovered

The baseline monitoring compatibility marker was stored as a symlink whose target was its six-line YAML comment. Reading it crashed the strict scanner. It is now a regular file with identical bytes; the canonical monitoring rules are unchanged. The gate also lacked a non-empty/unblocked registry requirement. Explicit negative checks and a regression now prevent empty registries from supplying clearance. The registry itself remains blocked; no reviewer evidence has been invented and no allowlist has been weakened.

The existing offline drill's constant S2c assertion was replaced by actual response assertions. Conflict-list fixtures now contain a real collection/record identity. The server18 teacher exam-duty test now checks the current per-operation role_denied contract **and unchanged stored row count**, rather than expecting the obsolete batch-wide rejection code.

## Reconciliation / ownership

**Roadmap Reconciliation Required.** A-18/A-20 carry-over entries are not automatically marked closed on main. Local fixes require exact final-SHA regression, reviewer evidence, authenticated push/PR, Tech Lead merge and merged-SHA verification. The project-wide strict gate also reports existing unapproved patterns outside this workstream; those remain with the assigned QA/Atria owners rather than being silently allowlisted here. Independent reviews are a required external dependency, not something Arena can simulate.

No complete browser/device crash durability, authentication, whole-schema ownership, multi-host, national-scale, capacity or production certification is claimed. Legacy LWW/unversioned development paths remain explicit limitations. Rollback is a reviewed revert of the scoped commit; no production data or service was changed.