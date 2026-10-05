# DESIGN — Durable Cross-Instance Cache Invalidation
## Mission N-36 / M15-CACHE-PACMA / M15-05 PACMA v2

**Baseline HEAD:** `1b19449f49a2952d2fbda99053f9af42f2cf4c6c` (verified)
**Author:** Atria (Executor) | **Verifier:** Hermes (independent) | **Decision:** ChatGPT Control Plane
**Status:** DESIGN — written BEFORE any production code change (mission §FIRST STEP)

---

## A. Current Flow (measured from HEAD `1b19449f`)

Three distinct write paths feed the cache layer. Each one invalidates differently.

### A.1 Sync path (`server/sync.js`, the dominant write path)

```
client POST /api/sync { ops:[...] }
  → validate → inScope/fieldGate/OCC pre-checks
  → apply loop: store mutation into `mirror` + `undo` (RAM)
  → db.persistSyncBatch(batchAll)         ← PG transaction (advisory locks + ops + uid claims)
  → on failure: rollbackUndo() + 503
  → on success: for (invq of invQueue)      cache.invalidateCollection(c, sid).catch(audit)
                for (uid of userInvQueue)   cache.invalidateUser(uid).catch(audit)
```

`invalidateCollection`/`invalidateUser` do: L1 clear + `redis.del` + `redis.publish(INVAL_CHANNEL)` (+ epoch `set` for school/global scope). **The invalidation is entirely fire-and-forget and entirely Pub/Sub-dependent for cross-instance propagation.** `db.persistSyncBatch` holds an open PG transaction client at line 1048, but no outbox row is appended there — the outbox is untouched by the sync path.

### A.2 REST paths (`server/routes/{users,students,attendance,classes,grades}.js`)

```
handler → policy/scope/OCC gates → db.persistOpsBatch([op]) → store.push + markDirty
        → cache.invalidateCollection(c, sid).catch(()=>{})
```

`persistOpsBatch` opens its own transaction (`db.js:1023-1039`), commits, returns; then the invalidation fires. Again: **no outbox row, no atomicity between PG commit and invalidation intent.**

### A.3 Delete path (`server/delete-service.js`)

```
softDelete → db.transaction(client => { persistOpWithClient(delOp); outbox.append(evt, client) })  ← ATOMIC (only path that is)
           → store.tombstones + splice + __deleted_records
           → cache.invalidateCollection / invalidateUser (fire-and-forget)
worker tick → fetchPendingBatch (FOR UPDATE SKIP LOCKED) → handler '*.deleted' → cache.invalidateCollection
```

This is the **only** path that already has DB-commit + outbox atomicity, and the **only** path with a durable consumer. It is the model to generalize.

### A.4 What is durable today vs. what is not

| Component | Durable? | Cross-instance? | Notes |
|---|---|---|---|
| PG table `server_outbox` + `server_outbox_dlq` | ✅ (migrations 014/021) | ✅ shared PG | id BIGSERIAL = global monotonic |
| Worker + lease fencing + DLQ | ✅ | ✅ (SKIP LOCKED claim) | but only consumes `*.deleted` |
| Redis Pub/Sub `payesh:pubsub:inval` | ❌ ephemeral | ✅ fast | lossy during outage |
| `pendingInvalidations` (M14-B01) | ❌ **process-local** | ❌ | dies with the process |
| epoch school/global (W11-2) | ✅ (Redis) | ✅ | user scope **missing** |
| L2 bootstrap entries | ✅ (Redis, TTL 300s) | ✅ | stale bounded by TTL only |

**The gap (mission statement):** a mutation on instance A invalidates Redis successfully, but the Pub/Sub message is lost (network blip, subscriber not yet attached, Redis `publish` during a partial outage, instance B's subscriber crashing). Instance B keeps serving the L2 entry for up to 300 s with **no durable fallback**. M14-B01 closed the same-instance case; the cross-instance case is open.

### A.5 Where Hermes' PACMA proposal matches HEAD and where it diverges

The PACMA doc (`docs/PAYESH_ADAPTIVE_CACHE_ARCHITECTURE.md`) is accurate about HEAD capabilities (L1/L2/epoch/pub-sub/pending). One correction for the record: the doc says the invalidation outbox is a *design* ("سطح ۳ — Durable … برای invariantهای حیاتی"). HEAD already contains a *functional* outbox + worker + DLQ + lease fencing — used exclusively by deletes. The design below therefore **reuses the existing machinery rather than building a new queue**, which is the lowest-risk route to durability.

---

## B. Proposed Flow

```
Mutation (sync batch | REST write | delete)
   │
   ▼
PG TRANSACTION ────────────────────────────────────────┐
   ├─ DB write (persistOpsBatchWithClient / delOp)      │  atomic
   ├─ outbox.append(cache.*_changed event, client)  ────┘  (all-or-nothing)
   │
   ▼ COMMIT
   │
   ├─► FAST PATH (best-effort, acceleration only):
   │      cache.invalidateUser / invalidateSchool / invalidateCollection
   │      → L1 clear + redis.del + epoch bump + redis.publish   ← existing code
   │
   └─► DURABLE PATH (worker tick, EVERY instance, async):
          SELECT cache events WHERE id > <per-instance watermark> ORDER BY id ASC
          → handler (idempotent invalidate: L1 clear + del + epoch + publish)
          → advance watermark (PG table, durable)
          → mark status='processed' (first-writer-wins)
```

**Pub/Sub stays the fast path.** The worker is the guarantee. Both paths converge on the same idempotent invalidate operations, so duplicate arrival is safe by construction.

Why every instance runs the handler rather than one claiming it: cache invalidation is **replicate-to-all** semantics, not competing-consumer semantics. A `FOR UPDATE SKIP LOCKED` claim would let exactly one node invalidate its own L1 and leave every other node's L1 stale — the exact bug this mission closes. The existing claim-based poller is preserved unchanged for `*.deleted` (genuinely competing-consumer).

---

## C. Transaction Boundary

The invariant (mission §6): **DB commit and outbox event must be atomic — never one without the other.**

| Path | Current boundary | Change |
|---|---|---|
| sync | `persistSyncBatch(ops)` own transaction; invalidation post-commit | add an optional in-transaction hook: `persistSyncBatch(ops, async (client) => outbox.append(evt, client))`. Hook failure ⇒ rollback ⇒ 503 ⇒ client retries (existing path). |
| REST | `persistOpsBatch([op])` own transaction | add the same optional hook to `persistOpsBatch`; routes pass the append through it. |
| delete | already atomic | unchanged (already the model); adds a `cache.user_changed` row in the same transaction when a user is deleted. |
| revocation | `invalidateUser` only | appends `cache.user_changed` best-effort after the session write (no PG mutation in this path beyond the session row — see below). |

Failure semantics preserved exactly: if the outbox INSERT fails (e.g. PG error), the whole transaction rolls back, `pgDown()` / `sync_mirror_failed` fires, and the client retries. **A committed mutation without an event is structurally impossible**, and an event without a committed mutation is impossible because the INSERT never committed. This satisfies I1 and the §6 contract without touching the response contract.

revocation.js is examined separately: it invalidates a user's cache on session revocation. Its PG write is the session/token row, and the cache invalidation is a side effect. Making the event atomic with the session row would require routing the session write through a client — out of scope and out of risk budget. It appends best-effort; the durable path still guarantees delivery. Recorded as an explicit, bounded exception.

---

## D. Event Schema

Reuses the existing `server_outbox` columns verbatim — **no schema change to the event columns**:

```sql
id BIGSERIAL, type VARCHAR(64), collection VARCHAR(64), record_id BIGINT,
actor_id BIGINT, version INTEGER, payload JSONB,
status, retry_count, last_error, created_at, processed_at, processing_at, processing_token
```

New event types (all share the `cache.` prefix so the poller can route them):

**`cache.user_changed`**
```jsonc
{ "type": "cache.user_changed",
  "collection": "users",
  "record_id": 42,                     // the changed user id (scope key)
  "actor_id": 5,
  "version": 187,                      // store.__server_version at mutation time
  "payload": { "scope": "user", "user_id": 42, "origin": "sync" } }
```

**`cache.school_changed`**
```jsonc
{ "type": "cache.school_changed",
  "collection": "grades",              // the collection that changed (audit trail)
  "record_id": 7,                      // school id
  "actor_id": 5,
  "version": 190,
  "payload": { "scope": "school", "school_id": 7, "origin": "rest" } }
```

**`cache.collection_changed`** (global / unscoped)
```jsonc
{ "type": "cache.collection_changed",
  "collection": "subjects",
  "record_id": null,
  "actor_id": 5,
  "version": 191,
  "payload": { "scope": "global", "origin": "sync" } }
```

Contract properties:
- **event_id** = `id` (PG sequence, globally monotonic across instances — already collision-proofed by `payesh_outbox_id_seq`, migration 004/014).
- **version/ordering** = `id` is the monotonic sequence; `version` mirrors `store.__server_version` for audit correlation only.
- **attempt/retry metadata** = existing `retry_count` / `last_error` / `processing_at` / `processing_token` columns, reused.
- **deduplicate-able** = handler is idempotent (del + epoch + publish are all order-independent, last-writer-wins) and per-instance watermark suppresses re-runs.
- **auditable** = rows persist until retention; DLQ on exhaustion.

---

## E. Producer Locations

| # | File | Event(s) | Boundary |
|---|---|---|---|
| P1 | `server/sync.js` (post-commit loop, ~line 1360) | one `cache.user_changed` per `userInvQueue` uid + one `cache.school_changed`/`cache.collection_changed` per `invQueue` entry | **in-transaction hook** on `persistSyncBatch` |
| P2 | `server/routes/users.js` | `cache.school_changed` (school scope) + `cache.user_changed` (target user) | hook on `persistOpsBatch` |
| P3 | `server/routes/students.js` | `cache.school_changed` | hook |
| P4 | `server/routes/attendance.js` | `cache.school_changed` | hook |
| P5 | `server/routes/classes.js` | `cache.school_changed` | hook |
| P6 | `server/routes/grades.js` | `cache.school_changed` | hook |
| P7 | `server/delete-service.js` | `cache.user_changed` when `collection === 'users'` | already-atomic transaction |

Deduplication at production time: the sync path already coalesces `invQueue` by `(collection, school_id)` and `userInvQueue` by uid, so one batch produces O(distinct scopes) events, not O(ops).

**Negative-proof switch:** `CACHE_DURABLE_VULN=1` makes the producers skip the append (the pre-N-36 world). This is the §12 VULNERABLE mode — same pattern as `B01_MUTATE=VULN`.

---

## F. Consumer / Worker Lifecycle

The worker (`server/worker.js`) gains a **second polling mode**. Nothing about the existing claim-based mode changes.

```
tick():
  phase 1 (UNCHANGED): fetchPendingBatch(50) → claim-based (SKIP LOCKED)
         → exclusive handlers ('*.deleted')
  phase 2 (NEW):       replicateBatch(watermark) → claim-less ordered scan
         → replicate handlers ('cache.*')
```

Phase 2 query (PG):
```sql
SELECT id, type, collection, record_id, actor_id, version, payload, retry_count
  FROM server_outbox
 WHERE type LIKE 'cache.%' AND id > $1
 ORDER BY id ASC
 LIMIT $2;
```

No `FOR UPDATE`, no status filter, no `SKIP LOCKED` — the watermark *is* the per-instance cursor. Memory mode: scan `store.outbox` with the same predicate.

**Watermark storage (durable, Redis-independent):**
```sql
CREATE TABLE server_outbox_watermark (
  instance_id TEXT PRIMARY KEY,
  last_id     BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
`instance_id` comes from `PAYESH_INSTANCE_ID` env, falling back to `hostname:pid`. This is a bounded-cardinality identifier (one row per live process), and a stale row for a dead instance is inert — a new process gets a new id and replays from 0, which is safe because handlers are idempotent.

Restart behaviour: on boot the instance reads its watermark and resumes. This is I16 (graceful restart deterministic) — no reliance on Redis, no reliance on process memory.

Handler registration (extend the existing map in `server/index.js`):
```js
handlers: {
  '*.deleted': async (evt) => { /* unchanged */ },
  'cache.user_changed':       async (evt) => cache.invalidateUser(evt.payload.user_id),
  'cache.school_changed':     async (evt) => cache.invalidateSchool(evt.payload.school_id),
  'cache.collection_changed': async (evt) => cache.invalidateCollection(evt.collection)
}
```
The handler type resolution already falls back to prefix matching via `handlerFor`; adding an explicit `'cache.*'` catch-all keeps the registry explicit.

---

## G. Retry Model

Cache events are invalidated-state operations, so retry semantics differ from the existing `maxRetries` model (which is designed for side-effecting deletes):

1. Handler succeeds → advance watermark, `mark(id, {status:'processed'})` first-writer-wins.
2. Handler throws **because Redis is unavailable** → do NOT advance the watermark, do NOT burn a retry slot, leave `status='pending'`. Next tick retries. Rationale: Redis outage is a transient infra condition, not an event defect; poisoning the event to the DLQ would permanently drop an invalidation that would have succeeded 30 s later.
3. Handler throws for a **non-Redis reason** (payload malformed, unknown scope) → `retry_count++`, and after `PAYESH_CACHE_MAX_RETRIES` (default 5) move to DLQ via the existing `moveToDlq` — never dropped.
4. Ordering is preserved: a failed event is a **sticky cursor**. Events behind it stay pending. This is deliberate (I11) and bounded by the backpressure model in §J.

A stuck event must not silently freeze invalidation forever: a gauge exposes `payesh_outbox_watermark_lag` (count of cache events past the watermark) and `payesh_outbox_replicate_lag_seconds` (age of the oldest unprocessed cache event). Both are alert inputs.

---

## H. Idempotency Model

Three independent layers, each sufficient alone:

1. **Operation idempotency** — `del`, `SET epoch`, `publish`, `Map.delete` are all order-independent and last-writer-wins. Running the same event 100 times converges to the same state as running it once.
2. **Per-instance watermark** — suppresses re-processing within one process across ticks and restarts.
3. **Epoch validation on read** — the L2 packet carries the epoch pair it was written under; a read rejects it if either epoch moved. This is the *defense in depth* that makes even a lost-but-later-replayed invalidation safe: the stale entry cannot survive an epoch bump, and epoch bumps now come from the durable path too.

Cross-instance duplicates: instance A and B can both process event 7 concurrently. Both bump the school epoch to *different* values. Both are strictly-newer than any packet written before, so every read misses stale data. Two distinct fresh epochs are equally correct — there is no requirement that all instances agree on an epoch value, only that stale packets disagree.

---

## I. Ordering / Version Model

- `id` (PG BIGSERIAL) is the single global monotonic sequence. Two instances appending concurrently get distinct, ordered ids from `payesh_outbox_id_seq` (already collision-proofed in `outbox.js` `nextPgId`).
- Within an instance, events are processed in ascending `id` order (query `ORDER BY id ASC`), so a user-change always lands before a later collection-change that supersets it.
- The watermark is monotonic and only advances on success, giving exactly-once *effect* per instance despite at-least-once delivery.
- No vector clocks, no per-entity version comparison is needed for correctness — the epoch mechanism already provides per-scope freshness, and `id` provides global ordering. The `version` column is retained purely as an audit/correlation handle to `store.__server_version`.

---

## J. Backpressure Model

Bounded in three layers, mirroring the M14-B01 escalation philosophy:

1. **Batch bound** — each tick processes at most `PAYESH_CACHE_REPLICATE_BATCH` (default 50) events; the loop yields between ticks. No unbounded in-tick work.
2. **Watermark-stick backpressure** — a Redis outage stalls the cursor, which is the correct behaviour (the events describe invalidations that could not be applied). Observed via `watermark_lag` / `replicate_lag_seconds` gauges.
3. **Escalation** — if the number of pending cache events exceeds `PAYESH_CACHE_BACKLOG_ESCALATE` (default 5000), the producer appends a single `cache.collection_changed` with `payload.escalation=true`, which bumps the **global epoch**. Every L2 packet written before that moment becomes unreadable cluster-wide, so even if the backlog is only partially drained, correctness no longer depends on draining it at all. This is the same fail-safe reasoning as M14-B01's `PENDING_CAP` escalation to `all`, lifted to the cross-instance layer. The threshold is a bounded-memory promise: the escalation makes the backlog *optional* to drain for correctness.

Non-goal (explicit): catching up a 10M-event backlog instantly. Correctness is decoupled from catch-up speed by the epoch fallback.

---

## K. Redis Failure Behaviour

| Condition | Behaviour |
|---|---|
| Redis down at mutation time | PG transaction commits (DB + outbox row) — **I14 holds**. Fast-path invalidate throws → M14-B01 `recordPending` (same-instance forced miss, existing). Event sits in outbox `pending`. |
| Redis down at worker tick | Handler throws REDIS_UNAVAILABLE → sticky cursor, no retry burn, next tick retries. Reads on this instance are already forced-miss by pending blocks. |
| Redis recovers | M14-B01 replay drains same-instance pending (2 s interval). Worker drains the backlog in batches → cross-instance invalidation lands. Pub/Sub re-subscribes. |
| Pub/Sub message lost, Redis up | Fast path missed it; the durable worker still delivers the invalidate to every instance. **This is the primary scenario the mission targets.** |
| PG down at mutation | Transaction rolls back, no event, no mutation. Existing `pgDown()` / 503 behaviour unchanged. |
| PG down at worker tick | Scan throws → tick aborts cleanly, next tick retries. Watermark untouched. |

Critical property: **Redis failure never causes a DB write to fail and never causes a cache entry to be served stale indefinitely.** The bound on staleness shifts from "TTL (300 s)" to "TTL (300 s) **OR** worker drain", and the epoch fallback makes even the TTL window safe once the worker has bumped the epoch.

---

## L. Instance Restart Behaviour

- Watermark read from PG at boot → deterministic resume point.
- `replayPendingFromPg()` (existing, F3 chaos-drill #185) already restores exclusive-event pending rows into `store.outbox` at boot; it is extended to also hydrate cache events past the watermark so the memory-mode worker sees them.
- L1 is process memory and is correctly empty after restart.
- L2 entries written before the restart remain valid only as long as their epoch pair still matches; any invalidation that occurred while the instance was down bumped an epoch and thus already invalidated them. **A restarted instance cannot serve stale data even if it missed every Pub/Sub message**, because the durable path re-applies invalidations past its watermark.

---

## M. user / school / global Semantics

Three explicit scope types, one event family:

| Event | Handler call | Redis side effects | Scope granularity |
|---|---|---|---|
| `cache.user_changed` | `invalidateUser(payload.user_id)` | `del payesh:cache:bootstrap:<uid>` + **`SET payesh:cache:epoch:user:<uid>` (NEW — §N-36-8)** + publish `type:'user'` | exactly one user's entry, no collateral |
| `cache.school_changed` | `invalidateSchool(payload.school_id)` | school epoch `SET` + `purgeSchoolL2` + publish `type:'school'` | all users of one school (existing) |
| `cache.collection_changed` | `invalidateCollection(collection)` | global epoch `SET` + publish `type:'all'` | cluster-wide (existing) |

School-scope is chosen over user-scope whenever the mutation touches a shared collection (grades/attendance/classes/students), because those reads are school-scoped. User-scope is used only for `users` mutations, where M14-B02 proved a school-scoped invalidate misses a school-transferred user's old entry. No scope is ever inferred from absence — `payload.scope` is explicit and required, and an unknown scope fails the handler rather than degrading to a global wipe (fail-closed, I9).

---

## N. Section 8 Decision — user-scope epoch: **REQUIRED, implement it**

The mission forbids picking A or B without reasoning. The reasoning, from HEAD evidence:

**The race that W11-2 already closed for school/global is open for users.** Concretely, against HEAD:

1. Instance A starts building user 42's bootstrap: it reads the DB (or a stale snapshot) and then calls `setBootstrapCache(42, data)`.
2. Between A's epoch-read (`redis.get(epochSchoolKey)`, `cache.js:272`) and A's `SET`, a mutation on instance B invalidates user 42: `del` + publish.
3. A's `SET` re-creates `payesh:cache:bootstrap:42` with `se`/`ge` stamped **after** B's invalidation — so the epoch check cannot flag it. The entry is stale and survives until TTL 300 s.

For school scope this is closed because B's `invalidateSchool` bumps `payesh:cache:epoch:school:<sid>` and any packet A writes *before* reading the new epoch mismatches. For user scope there is no such key, so A's late write is indistinguishable from a fresh one.

This is not hypothetical: it is the same single-flight-vs-invalidation interleaving W11-2's own header comment describes (`cache.js:18-23`), just at the scope W11-2 never covered. M14-B02's `invalidateUser` closed the *transfer* case but kept the TTL-bounded exposure (recorded as NF-1 residual in that mission).

**Therefore: A — a per-user epoch key `payesh:cache:epoch:user:<uid>` (TTL 3600, same generation function) is added.** `setBootstrapCache` stamps `ue` alongside `se`/`ge`; `invalidateUser` bumps it; reads reject a packet whose `ue` moved. Cost: one extra `GET` per cache write, one extra `SET` per user invalidation — bounded, and strictly correctness-before-hit-rate per PACMA P3.

An invariant test (§12 scenario set) proves it: a deliberately interleaved stale re-write is served under VULN and rejected under the fix.

---

## O. Observability

All metrics go through the existing `server/metrics.js` (which never throws — R1). Every label set is closed/bounded.

**Producer side**
- `payesh_cache_outbox_events_produced_total{scope}` — scope ∈ {user, school, global}; closed set.
- `payesh_cache_outbox_produce_failures_total` — outbox INSERT rejected (implies transaction rolled back).

**Consumer side**
- `payesh_cache_outbox_events_processed_total{outcome}` — outcome ∈ {processed, retried, dead_letter, duplicate}; closed set.
- `payesh_cache_outbox_redis_unavailable_total` — handler hit REDIS_UNAVAILABLE (sticky-cursor signal).
- `payesh_cache_outbox_watermark_lag` (gauge) — cache events with id > own watermark.
- `payesh_cache_outbox_replicate_lag_seconds` (gauge) — age of oldest unprocessed cache event for this instance.

**Health/queue side**
- `payesh_outbox_depth_total{status}` — existing `depth()` (pending/processed/failed/legacy); extended with `replicate_pending`.
- `payesh_outbox_oldest_pending_age_seconds` (gauge).
- `payesh_cache_outbox_retention_deleted_total` — rows reaped by retention.
- `payesh_cache_outbox_escalations_total` — backlog-driven global-epoch escalations.
- `payesh_cache_replay_total{path}` — path ∈ {pending_b01, outbox_replicate, boot}; distinguishes same-instance vs cross-instance recovery.
- `payesh_cache_duplicate_invalidations_total` — handler executed for an event already past a no-op state (idempotency live-check).

**Cardinality discipline:** no `collection`, no `school_id`, no `user_id`, no `instance_id` as a label. Instance identity is a table PK and a log field, never a metric label. Scope and outcome come from closed enumerations. This is the same rule `cache.js:340-342` already applies (`invalidateCollection` deliberately does not label by collection name).

**Retention (§9 answer):** OUTBOX_CAP=1000 bounds only the in-RAM `store.outbox` mirror. The PG table is unbounded today. A retention reaper runs per worker tick (throttled to `PAYESH_OUTBOX_RETENTION_INTERVAL_S`, default 300 s):

```sql
DELETE FROM server_outbox
 WHERE status = 'processed'
   AND id <= (SELECT COALESCE(MIN(last_id), 0) FROM server_outbox_watermark)
   AND processed_at < NOW() - ($1 * INTERVAL '1 second');
```

The `id <= MIN(last_id)` clause is the safety property: **a row is only reaped once every known instance has passed it.** A freshly-booted instance with watermark 0 holds reaping at 0 until it catches up, which is exactly the required behaviour. Default retention 6 h; DLQ rows are retained on their own `failed_at` index and reaped on a longer window.

Capacity answer for §9: I do **not** claim national-scale capacity from this design. What I will measure at current HEAD is: producer overhead per sync batch (one extra INSERT per distinct scope), worker scan cost (index-backed `id > watermark` limit 50), retention reaper cost, and watermark write cost. Those four numbers, measured, are the evidence; scaling them to 10M is a claim for M15-08 load/soak, not for this mission.

---

## P. Migration & Rollback

`migrations/022_outbox_cache_invalidation.sql` (+ `.down.sql`):
- `CREATE TABLE server_outbox_watermark` (PK instance_id, last_id, updated_at).
- `CREATE INDEX idx_server_outbox_cache_events ON server_outbox (id ASC) WHERE type LIKE 'cache.%'` — partial index, only the rows phase-2 scans.
- `CREATE INDEX idx_server_outbox_processed_retention ON server_outbox (status, processed_at) WHERE status = 'processed'` — backs the reaper.
- `.down.sql` drops both indexes and the table. Idempotent (`IF NOT EXISTS` / `IF EXISTS`), consistent with migrations 014/021 style.

Feature flag: `PAYESH_CACHE_DURABLE_INVALIDATION` (default **on**). When off, producers skip the append and the worker skips phase 2 — the exact pre-N-36 behaviour. This is the rollback lever and the VULN-mode companion.

---

## Q. Invariant Traceability (I1–I16)

| Inv | How this design satisfies it | Test |
|---|---|---|
| I1 PG authoritative | L2 is only populated from DB; every miss rebuilds from PG | existing + S15 |
| I2 not Pub/Sub only | durable outbox row + worker phase 2 | S02, S05 |
| I3 durable path exists | `server_outbox` + watermark replay | S05, S06 |
| I4 recovery from durable | boot watermark resume + `replayPendingFromPg` | S06 |
| I5 consumer down bounded | TTL + epoch fallback + backlog escalation | S04, S14 |
| I6 duplicate safe | idempotent ops + watermark + epoch | S07 |
| I7 no retry storm | sticky cursor, no retry burn on Redis-down, batch bound | S13 |
| I8 bounded & observable | gauges §O, closed labels, escalation | S13 metrics assertions |
| I9 tenant isolation | scope explicit, fail-closed on unknown, school epoch | S15 |
| I10 explicit semantics | §M, `payload.scope` required | S16 |
| I11 ordering | PG sequence + ascending scan + monotonic watermark | S08 |
| I12 no infinite outbox | retention reaper with watermark floor | S12 |
| I13 cleanup policy | §O retention + DLQ retention | S12 |
| I14 Redis failure ≠ DB failure | producers run inside PG tx; fast-path `.catch` preserved | S09 |
| I15 correctness > hit-rate | forced-miss on pending, epoch validation, VULN mode | S12, S17 |
| I16 deterministic restart | watermark in PG, L1 empty, boot replay | S06 |

---

## R. Scope Boundaries — explicitly NOT in this mission

- No new queue infrastructure (Redis Streams, Kafka, RabbitMQ). The PG outbox is the queue.
- No PACMA Policy Registry implementation (M15-CACHE-02).
- No admission-control / hot-key / quota work (M15-CACHE-03/06).
- No load/soak certification (M15-08) — capacity claims are deferred with explicit NOT VERIFIED.
- No change to the sync response contract, the REST response contract, or the client.
- No rebase, no force-push, no Mimosa bypass.
