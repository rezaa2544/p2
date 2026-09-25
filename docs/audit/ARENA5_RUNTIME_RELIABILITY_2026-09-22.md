# Arena 5 — Runtime Reliability Audit

Anchor: Current HEAD `ecc8b40b5d533d77c6ebad63ca0854119873c504` (workspace snapshot has no `.git`; SHA is the session clone anchor, not re-derived this turn).
Date: 2026-09-22. Auditor scope: Redis, workers, background jobs. No project code was modified.

Environment class: **E3 only**. Local Redis 8.0.2 on `127.0.0.1:6391` (no AOF, no RDB) and PostgreSQL 17.11 on `127.0.0.1:5433` (`/tmp/pg-a5`, user `payesh`, trust). Probe runtime: nvm Node **v22.23.2**. `/usr/bin/node` is v20.20.2 and was not used for probes.
**E4 NOT VERIFIED.** Nothing here is multi-node, staging, or production-equivalent. Do not upgrade these results to E4.

Probe `ok: true` in the JSON artifacts means the observation matched the expected contract **or the expected defect**. It is not a product-health pass.

Artifacts (outside the repo, not committed):

- `/home/user/arena5-runtime-probe.js` → `/tmp/arena5-results.json`
- `/home/user/arena5-followup.js` → `/tmp/arena5-followup.json`
- `/home/user/arena5-pg-probe.js` (executed against live PG 17)
- `/home/user/arena5-pg-dup.js` (two PG clients)
- `/home/user/arena5-pg-split.js` (continuation: lock-hold vs claim CTE)
- `/home/user/arena5-late-write.js` + `/home/user/arena5-rename-delay.c` (continuation: timeout during `rename`)
- `/home/user/arena5-redis-seq.js` (continuation: non-persistent Redis sequence restart)

`pg-mem` cannot execute the claim CTE (`WITH … UPDATE` unsupported) and cannot bind `$2`. Those attempts are **not evidence**. They were abandoned.

Rule 15: this audit is **not** a 5-task × 5-distinct-pass matrix. Required scenarios were executed, and the continuation added a lock-split, a widened-window persist timeout, and a Redis sequence restart. A 5×5 re-run was not performed. That is a measurement limit of this assignment, not a product pass.

---

## 1. Components Tested

| Component | What was exercised | What was not |
|---|---|---|
| `server/redis.js` | `init`, `get`/`set`, `ping`, `ready`, `isRedis`, `sAdd`/`sMembers` on injected command error, client reconnect after process restart | Redis Cluster, Sentinel, AOF/RDB persistence, multi-node failover |
| `server/cache.js` | L1 hit after `FLUSHALL`, L2 miss after L1 clear, cross-process `invalidateSchool` while Redis is up | National-scale key cardinality, epoch TTL expiry at 3600s |
| `server/rate-limit.js` + `server/auth.js` | `checkRateLimit` and live `POST /api/auth/send-code` while Redis is down | Login path, weighted sync limiter |
| `server/outbox.js` + `server/worker.js` | Memory claim, retry, in-process duplicate workers, cap 1000; **live PG 17** claim CTE, crash-shaped recovery, two-client claim, poison → DLQ | Two OS worker processes under lock wait that splits a batch; lease expiry (no lease exists) |
| `server/index.js` health surface | `/api/health`, `/api/readiness`, `/api/liveness` with Redis up and killed; non-production and `PAYESH_ENV=production` | Readiness under real `DATABASE_URL` (HTTP servers ran JSON-store; PG probe was a direct client) |
| `server/worker-service.js` + `server/workers/heavy.js` | Timeout during in-flight `renameSync` (harness-widened window; product files unmodified) | A natural sub-millisecond race on a fast disk without a delay. Not claimed. |
| `migrations/014_outbox_dlq.sql` | Table `server_outbox` / `server_outbox_dlq` created and written on PG 17.11 | Migration runner transaction/rollback (out of this arena’s runtime scenarios) |

Live HTTP servers (both stopped after the probe):

- `127.0.0.1:31991` — `REDIS_URL` set, no `NODE_ENV` / `PAYESH_ENV`, store `/tmp/payesh-a5.json`.
- `127.0.0.1:31992` — `PAYESH_ENV=production`, `ALLOW_MEMORY_FALLBACK=1`, `PAYESH_BEHIND_PROXY=1`, `PAYESH_HTTPS=1`, `PAYESH_JWT_SECRET` set, **no** `DATABASE_URL`.

---

## 2. Scenarios

| ID | Required scenario | How it was run | Result class |
|---|---|---|---|
| S1 | Redis unavailable | Kill Redis after a healthy `init`; call `get`, `ready`, `ping`, `checkRateLimit`, `sAdd` | Fail-closed on get/rate-limit **REPRODUCED**. Misleading `ping` **REPRODUCED**. `sAdd` silent RAM fallback **REPRODUCED**. |
| S7 | Redis unavailable, live HTTP | Same outage against ports 31991 and 31992 | Health 503 both. Readiness 200 when production flag unset; 503 when `PAYESH_ENV=production`. `alive: true` in both bodies. OTP send-code **503** `redis_required`. |
| S2 | Restart / recovery (Redis) | `SHUTDOWN` + restart, no AOF | Client reconnects. Key `payesh:probe:k` is null. |
| S3 | Stale cache | `setBootstrapCache` then `FLUSHALL`; separate peer process + `invalidateSchool` | L1 serves `stale-v1` until cleared. Cross-process invalidation works while Redis is up. |
| S4 / PG | Worker crash | Claim on PG 17, then new outbox (empty RAM) calls `replayPendingFromPg` + `fetchPendingBatch`. Orphan `processing` row id 9001 inserted directly. | **REPRODUCED**: replayed 0, reclaimed 0, status stays `processing`. |
| S5 / PG-DUP / PG-SPLIT | Duplicate job | Two in-process memory workers; two PG clients, 30 rows; then one transaction holding 8 row locks while the claim CTE runs | Overlap 0. Split observed: locked 2001–2008 skipped, 2009–2020 claimed. Not a defect. |
| S5a | Retry | Handler throws twice, then succeeds (memory) | `processed`, `retry_count=2`. |
| S6 / F3 | Timeout / heartbeat | Hung handler; `isHealthy(30)` vs default `isHealthy()`; stopped worker | Short threshold goes false. Default 30s stays true at 51ms. Stopped worker reports healthy. |
| F4 | Heavy-worker timeout | First attempt: timeout during snapshot post. Continuation: `PAYESH_WORKER_TIMEOUT_MS=400` and a harness delay on libc `rename` of this target only | **REPRODUCED** (A5-09). Caller rejected at 436ms; later `renameSync` replaced `{"recovered":true}` with the worker snapshot. |
| F2 | Queue cap | 1001 memory `append`s | Oldest pending dropped. RAM-only. |
| F1 | pg-mem claim | Abandoned | **NOT VERIFIED** via pg-mem. Superseded by live PG. |

---

## 3. Evidence

### Redis unavailable

`/tmp/arena5-results.json`:

- S1c `get` → `REDIS_UNAVAILABLE` (no silent RAM hit).
- S1d `ready()` → `false` when `REDIS_URL` is set (`server/redis.js` `isProduction()` treats a configured URL as fail-closed even without `PAYESH_ENV`).
- S1e `ping()` → `{"ok":true,"driver":"memory","alive":true}`.
- S1f `checkRateLimit` → `REDIS_UNAVAILABLE`.
- S1g injected Redis error on `sAdd` → `{added:1, members:["42"]}` in process memory.
- S7b health **503**, `cache:"unavailable"`, worker object still `healthy:true`.
- S7c readiness **200**, `redis.driver=memory`, `alive:true`, `live:false`, `required:false`.
- S7d `POST /api/auth/send-code` phone `09992630039` → **503** `{"code":"redis_required","error_code":"REDIS_UNAVAILABLE"}`.
- F5 (`PAYESH_ENV=production`, Redis killed): readiness **503**, health **503**, body still `alive:true`, `live:false`, `required:true`.

Call sites: `server/redis.js` `ping()` returns the memory object whenever `isRedis()` is false; `sAdd` / `sMembers` / `sRem` catch Redis errors and do not call `prodRethrow`. Readiness (`server/index.js` ~999–1021) uses `redis.ping().ok` plus `PAYESH_ENV`/`NODE_ENV`, not `redis.ready()`, and does not consult the worker.

### Worker crash (live PostgreSQL 17.11)

`node /home/user/arena5-pg-probe.js` (exit 0):

```
CLAIM    evt 1 claimed; row status=processing
RECOVERY replayed=0, reclaimed=0, row left processing retry_count=0, RAM queue length 0
ORPHAN   id 9001 inserted as processing; replayed=0, reclaim=[], status stays processing
```

`replayPendingFromPg` selects only `status = 'pending'` (`server/outbox.js`). `fetchPendingBatch` (no client) sets `status = 'processing'` in the same statement, before the handler runs (`server/worker.js` `tick`). There is no lease column, no sweeper, and boot replay does not see `processing`. A crash, kill, or restart after claim and before `mark()` leaves the row forever. `/api/health` queue depth is `store.outbox.length` (RAM). After restart that array is empty, so the stuck row is invisible.

Memory-mode equivalent (S4c): claim sets `processing`; a new process `fetchPendingBatch` returns 0; status stays `processing`. Same hole, different store.

### Duplicate job

- S5b memory, two workers, one store: 10 claims, `dup=[]`.
- `arena5-pg-dup.js`, two connections, 30 pending rows: `{"a":30,"b":0,"overlap":0,"counts":[{"status":"processed","n":30}]}`.

No double processing observed. Continuation (`arena5-pg-split.js`) closed the interleaving gap: connection A held `FOR UPDATE` on ids 2001–2008 inside an open transaction; connection B ran the production claim CTE with `LIMIT 20`. B claimed 2009–2020 only (`overlap: 0`). After A rolled back, 2001–2008 were still `pending` and 2009–2020 stayed `processing`. `SKIP LOCKED` skipped the locked rows. This is E3, two connections, one Postgres. Not E4.

### Timeout / heartbeat

- S6a hung handler: `isHealthy(30)` → false; `health().healthy` still **true** because `health()` calls `isHealthy()` with the default **30000ms**.
- S6b later `tick` → `skippedBusy: true` (does not refresh `lastTickAt` — the early return is before the timestamp update).
- F3 at 51ms into a hang: `defaultHealthy: true`.
- S6c after `stop()`: `isHealthy()` → **true** (`if (!timer) return true`).
- F4 first attempt: `TIMEOUT worker op timeout` then file still `{"sentinel":true}`. That attempt timed out during the 6.8MB snapshot `postMessage`, before `atomicWrite`. It is **not** evidence against the race.
- F4 continuation (`arena5-late-write.js`, exit 0): product timeout 400ms, product `createHeavyWorker` / `heavy.js` unmodified. A harness `LD_PRELOAD` (`arena5-rename-delay.c`) held libc `rename` of `/tmp/a5-late-target.json` for 2000ms so the window could be written into. Stderr: `holding rename of /tmp/a5-late-target.json for 2000 ms`. Result:

```
call rejected at 436ms: "worker op timeout"
atTimeout:      {"sentinel":true}
afterFallback:  {"recovered":true}     (in-place write by the caller after reject)
lateOverwrite:  {"marker":"worker-old","n":7}
finalBody:      {"marker":"worker-old","n":7}
```

The delay is harness-only. It does not add a code path. It widens the real gap between `pending.delete(id)` in `worker-service.js` `call()` and `fs.renameSync` in `heavy.js` `atomicWrite`. A natural sub-millisecond collision on a fast disk was **not** separately caught. Do not describe this as an unmodified timing hit. Do describe the mechanism as reproduced: timeout does not cancel the worker, and the late rename replaced a newer file.

`server/index.js` `persistStore` catch (about lines 472–477) calls `persistStoreSync()`, which writes the same `STORE_FILE` via tmp+rename. That function was not invoked in this probe (an in-place write was used so the harness delay would not also stall the fallback rename). The cited catch is the production caller that can lose that race.

### Retry (works)

S5a: two thrown failures then success → `status=processed`, `retry_count=2`. No backoff; next attempt is the next tick (default 1000ms), cap `maxRetries` 5.

### Recovery (partial)

- Redis client reconnect after restart: S2a `isRedis true`, ping PONG. Ephemeral keys gone (S2b). Expected for a cache. Not a durable RPO. Continuation `arena5-redis-seq.js` showed the outbox id counter is not cache-safe: after `SHUTDOWN NOSAVE` + restart, the next non-PG `append` reused id 1. See A5-08.
- PG outbox recovery of `pending` was **not** the failing case. Recovery of `processing` failed (evidence above).
- Cross-process cache invalidation while Redis is up: S3c peer FIRST `"before"`, SECOND `null`.

### DLQ terminal status (live PG)

Poison handler, `maxRetries=2`:

```
outbox id 22 status=failed retry_count=2 last_error=boom
dlq    outbox_id=22 error_message=boom retry_count=1
```

`moveToDlq` writes the DLQ row and `mark`s `dead_letter`, then `worker.js` `mark`s `failed` with the incremented count. Final source status is `failed`, not `dead_letter`. DLQ `retry_count` is the pre-increment value on the event object.

### Test drift (confidence, not a runtime pass)

`tests/infrastructure/phase6/failure-resilience.test.js` `testOutboxWorkerCrashResilience` uses `isPostgres: () => false`, never kills a worker, and still logs “Crash Recovery” and “PASSED 100%”. `tests/c3-remediation-regression.test.js` Task 1 claims atomic processing transition against `db: null` only. `tests/phase2-outbox-failover.js` inserts a **pending** crash artifact and calls `moveToDlq` directly (expects `dead_letter`), which is not the `worker.tick` path that overwrites to `failed`.

---

## 4. Bugs

Coding-team cards. Not fixed in this audit.

### A5-01 — Claimed outbox rows stuck `processing` after crash

- **Severity:** High
- **Status:** REPRODUCED (E3, PostgreSQL 17.11 and memory mode)
- **Location:** `server/outbox.js` `fetchPendingBatch` (CTE sets `processing`); `replayPendingFromPg` (`WHERE status = 'pending'` only); `server/index.js` boot call to `replayPendingFromPg`; `server/worker.js` `tick` (handler runs only after claim). No lease / sweeper anywhere in these files.
- **Reproduction:** Start PG 17 as in this audit (`127.0.0.1:5433`, user `payesh`). `node /home/user/arena5-pg-probe.js` with nvm Node 22 from `/home/user/repo` so `pg` resolves. Or insert `status='processing'` and call `replayPendingFromPg` then `fetchPendingBatch`.
- **Expected:** At-least-once recovery. A row claimed but not marked is returned to `pending` (or reclaimed) after process death, and then processed once.
- **Actual:** `replayed: 0`, `reclaimed: 0`, row remains `processing`. Orphan id 9001 same. RAM queue empty, so `/api/health` `queue.outbox` does not show it.
- **Root cause:** Claim and execution are not one transaction, and the only restorer ignores the status the claim writes. The comment on `replayPendingFromPg` describes at-least-once for rows still `pending`. The claim path leaves that window by design.
- **Minimal remediation:** Add `claimed_at` (or reuse `processed_at` only for completion — do not overload it). On boot, `UPDATE … SET status='pending' WHERE status='processing' AND claimed_at < now() - lease`. Do not select those rows in the hot claim until the lease expires. Alert on `processing` count. Include `processing` in health from SQL, not from RAM length.
- **Regression requirement:** Two connections, claim, kill the claimant before `mark`, restart, assert the row is processed exactly once and does not stay `processing`. Assert `/api/health` or an outbox metric shows the stuck count before recovery. Roadmap Reconciliation Required.

### A5-02 — Readiness and `ping().alive` disagree with a configured-but-down Redis

- **Severity:** Medium
- **Status:** REPRODUCED (E3 HTTP)
- **Location:** `server/redis.js` `ping()` (memory `{ok:true, alive:true}` when not connected); `server/index.js` `/api/readiness` (~1008–1021) uses `ping().ok` and `PAYESH_ENV`/`NODE_ENV` only. `/api/health` uses `redis.ready()`, which is false whenever `REDIS_URL` is set and Redis is down.
- **Reproduction:** `REDIS_URL=redis://127.0.0.1:6391`, no `PAYESH_ENV`, boot server, kill Redis, `GET /api/health` and `GET /api/readiness`. Repeat with `PAYESH_ENV=production` plus the fallback/TLS flags used on port 31992.
- **Expected:** A configured Redis that is down is not `alive: true`. Readiness and health agree on whether the dependency is required.
- **Actual:** Non-production + `REDIS_URL`: health **503** `cache:"unavailable"`, readiness **200** `alive:true live:false required:false`. Production flag: both **503**, body still `alive:true`. OTP path itself fail-closes (S7d), so this is a probe/contract bug, not an auth bypass.
- **Root cause:** Two different “is production?” predicates. `redis.isProduction()` is true if `REDIS_URL` or `DATABASE_URL` is set. Readiness ignores that and trusts `ping().ok`, which is true in the memory fallback branch.
- **Minimal remediation:** `ping()` when `isConfigured() && !isAlive()` must return `ok:false` (keep `driver` honest). Readiness should treat configured-but-down Redis as not ready, matching `ready()`, including when `PAYESH_ENV` is unset. Do not report `alive:true` for a refused connection.
- **Regression requirement:** Matrix of (`REDIS_URL` set/unset) × (`PAYESH_ENV` production/unset) × (Redis up/killed) for health, readiness, and `ping` fields. Roadmap Reconciliation Required.

### A5-03 — `sAdd` / `sMembers` / `sRem` swallow Redis errors

- **Severity:** Medium
- **Status:** REPRODUCED (injected command error, S1g)
- **Location:** `server/redis.js` `sAdd`, `sMembers`, `sRem` — `catch` falls through to process-local sets. No `prodRethrow`, no `prodNoRedis`. Unlike `get`/`set`/`incr`.
- **Reproduction:** `__setClientForTests` with `sadd` rejecting, or kill Redis while `isRedis()` is still true and call `sAdd`. Probe actual: `{added:1, members:["42"]}`.
- **Expected:** Configured Redis error fails closed (`REDIS_UNAVAILABLE`), same as `get`.
- **Actual:** Returns 1 and mutates the process-local set. School→user cache index can diverge across instances; invalidation then misses members that only exist in another process.
- **Root cause:** Set helpers were left on the old silent-fallback path after BUG-2 / B5 fail-closed was applied to the scalar commands.
- **Minimal remediation:** Same `prodRethrow` + configured-down throw as `get`. Do not write the local set when `activeMode !== 'memory'`.
- **Regression requirement:** Redis command error and Redis process down, production and `REDIS_URL`-only, assert throw and unchanged local set. Roadmap Reconciliation Required.

### A5-04 — Stopped outbox worker is reported healthy

- **Severity:** Low
- **Status:** REPRODUCED (in-process, S6c). Not re-checked on the live SIGTERM HTTP path this session.
- **Location:** `server/worker.js` `isHealthy`: `if (!timer) return true`. `/api/health` calls `isHealthy()` with no argument (~1035).
- **Reproduction:** `createWorker(...).start(); stop(); isHealthy()` → true. `health().healthy` true, `active` false.
- **Expected:** A worker that was started and then stopped is not healthy. Idle-never-started can remain a separate state if tests require it — but it must not be the same boolean as “running and fresh”.
- **Actual:** `!timer` short-circuits to healthy, so a cleared interval looks fine. Hung-but-running is a different case: default threshold hides a stall for 30s (see risks). That 30s lag matched the code default; it is not filed as a logic bug.
- **Root cause:** “No timer” was treated as manual/test mode and as healthy.
- **Minimal remediation:** `isHealthy` returns false when `stop()` has been called after `start()`, or when `active` is false and the worker was supposed to be scheduled. Expose `active` in the readiness gate if the outbox worker is a required side effect.
- **Regression requirement:** start → stop → `GET /api/health` worker.healthy false; never-started test hook still explicit. Roadmap Reconciliation Required.

### A5-05 — Poison path ends `failed`, not `dead_letter`; DLQ retry_count is stale

- **Severity:** Low
- **Status:** REPRODUCED (PG 17, `arena5-pg-probe.js` DLQ section)
- **Location:** `server/worker.js` `tick` catch: `moveToDlq(evt, errMsg)` then `mark(evt.id, { status: 'failed', retry_count: rc })`. `moveToDlq` records `evt.retry_count` before that increment and marks `dead_letter` first.
- **Reproduction:** Handler always throws, `maxRetries=2`, tick until terminal. Observed id 22: outbox `failed` / `retry_count=2`; DLQ row `retry_count=1`.
- **Expected:** One terminal status. Contract comments and `tests/phase2-outbox-failover.js` say source row becomes `dead_letter`. DLQ retry_count matches the attempt that exhausted the budget.
- **Actual:** Source row is `failed`. DLQ row exists (isolation works) but retry metadata is one behind. Queries for `status='dead_letter'` miss poison pills. `depth()` has no `processing` or `dead_letter` bucket (both fall through to `legacy`, and only over RAM).
- **Root cause:** Two writers, worker wins. `moveToDlq` is given the pre-increment object.
- **Minimal remediation:** Pass `rc` into `moveToDlq`. Do not `mark('failed')` after a successful DLQ move; leave `dead_letter` or make `failed` the only status and update the phase2 assertion to match. One status, one count.
- **Regression requirement:** Exhaust retries on PG; assert source status, DLQ row, and equal retry_count. Roadmap Reconciliation Required.

### A5-06 — Phase 6 “crash recovery” test does not crash or recover

- **Severity:** Medium (confidence / fake-green). Not a second runtime defect.
- **Status:** REPRODUCED as a test-gap (file read + the runtime hole in A5-01)
- **Location:** `tests/infrastructure/phase6/failure-resilience.test.js` `testOutboxWorkerCrashResilience`. Also `tests/c3-remediation-regression.test.js` Task 1 (`db: null` only).
- **Reproduction:** Read the test. It appends to a fake memory store, fetches a batch, calls `moveToDlq`, prints “Crash Recovery” and “PASSED 100%”.
- **Expected:** A test named crash recovery kills a worker after claim and asserts the row is not stuck.
- **Actual:** No process death, no PostgreSQL, no `processing` restorer. A green run of this file does not cover A5-01.
- **Root cause:** The scenario name was attached to a memory happy-path.
- **Minimal remediation:** Replace or supplement with the A5-01 regression. Do not count this file as evidence of crash recovery.
- **Regression requirement:** See A5-01. Roadmap Reconciliation Required.

### A5-07 — Memory outbox silently drops the oldest pending event at 1000

- **Severity:** Medium if the process is the only queue (`ALLOW_MEMORY_FALLBACK=1`, no `DATABASE_URL` — that shape booted on port 31992). Low for a real PG primary: the splice is RAM-only; the PG insert is separate and was not shown to delete rows.
- **Status:** REPRODUCED (F2, memory)
- **Location:** `server/outbox.js` `append`, `OUTBOX_CAP = 1000`, `splice(0, length - 1000)`.
- **Reproduction:** 1001 `append`s on a memory outbox. Actual: length 1000, `payload.i===0` gone, all remaining still `pending`.
- **Expected:** Over-cap is rejected loudly or spilled. Oldest unprocessed work is not discarded.
- **Actual:** Oldest pending event removed from the only queue. No metric, no error.
- **Root cause:** Comment says the outbox is a queue not a log, and the cap is unconditional.
- **Minimal remediation:** Refuse append over cap in memory mode (fail the mutation), or drop only `processed`/`failed`. Never drop `pending`/`processing` without a counter.
- **Regression requirement:** 1001 pending appends → either error or first id still present. Roadmap Reconciliation Required.

### A5-08 — Redis restart reuses outbox ids; `mark()` updates the first row

- **Severity:** Medium (High if this process is the queue: `REDIS_URL` set, no `DATABASE_URL`). Not the PG id path. `nextPgId` uses `payesh_outbox_id_seq` when `db.isPostgres()` is true. This bug is the `nextId` Redis `INCR` path.
- **Status:** REPRODUCED (E3, Redis 8.0.2, no AOF)
- **Location:** `server/outbox.js` `nextId` (`payesh:outbox:seq`); `mark()` uses `store.outbox.find(e => e.id === id)` (first match). `server/worker.js` claims to `processing` before the handler, then `mark`s by that id.
- **Reproduction:** `node /home/user/arena5-redis-seq.js` (nvm Node 22). Script starts Redis on 6391 with `--appendonly no --save ""`, appends two jobs, `SHUTDOWN NOSAVE`, restarts, appends a third.
- **Expected:** Ids stay unique across a Redis restart, or a collision is rejected. `mark(id)` updates the event that was just handled.
- **Actual:** `first:1, second:2, afterRestart:1`, `ids:[1,2,1]`, `dup:[1]`. Worker `seen` contained both payloads with id 1 (`first` and `after-restart`). After tick: first row `processed`, third row still `processing` (the handler ran; `mark` wrote the first row). `seqAfter` get threw `Stream isn't writeable and enableOfflineQueue options is false` while `isRedis()` was already true — reconnect flag races the socket.
- **Root cause:** Sequence key has no durability on this Redis, and id equality in RAM is not unique. `find` binds the mark to the oldest row.
- **Minimal remediation:** Do not use a non-persistent Redis counter as a durable id. If Redis is the id source, require AOF and treat a missing key after a previous high-water mark as fatal. `mark` must update the specific object (or `WHERE id=$1` plus a generation), not the first RAM match.
- **Regression requirement:** Restart Redis with no AOF between two appends; assert the second id does not collide, and a handler completion does not leave the new row `processing`. Roadmap Reconciliation Required.

### A5-09 — Heavy-worker timeout does not cancel `renameSync`

- **Severity:** Medium
- **Status:** REPRODUCED (E3). Window widened by a harness delay. Natural fast-disk timing not separately caught.
- **Location:** `server/worker-service.js` `call()` timer (`pending.delete` + reject `worker op timeout`, no `terminate()`). `server/workers/heavy.js` `atomicWrite` (`writeFileSync` then `renameSync`). Caller: `server/index.js` `persistStore` `.catch` → `persistStoreSync()` onto the same path.
- **Reproduction:** Compile `arena5-rename-delay.c` to a shared object. `LD_PRELOAD` that object, `A5_DELAY_RENAME_SUBSTR=a5-late-target`, `A5_DELAY_RENAME_MS=2000`, `PAYESH_WORKER_TIMEOUT_MS=400`, `node /home/user/arena5-late-write.js`. Product sources were not edited.
- **Expected:** A timed-out persist does not afterwards replace the file. The worker is cancelled, or `renameSync` is skipped once the caller has given up.
- **Actual:** Promise rejected at 436ms with `worker op timeout` while the file was still `{"sentinel":true}`. Caller wrote `{"recovered":true}`. About 2s later the file was `{"marker":"worker-old","n":7}` — the snapshot from the timed-out call. Late success message is dropped (`if (!p) return`), so the caller is not told the overwrite happened.
- **Root cause:** The timeout is a caller-side promise rejection. The worker thread keeps running `atomicWrite`. Nothing fences `renameSync` against a newer write of the same path.
- **Minimal remediation:** On timeout, `terminate()` the worker (and fail in-flight ops) before any fallback write. Or generation-check the target and do not rename if the caller has already fallen back. Do not run `persistStoreSync` against a path a live worker may still rename.
- **Regression requirement:** Timeout during `atomicWrite`, then a newer write of the target, then assert the target is still the newer bytes after the worker finishes. Must fail if the worker is left alive. Roadmap Reconciliation Required.

---

## 5. Reliability Risks

These are not extra confirmed bugs. Do not treat them as REPRODUCED failures.

1. **E4 gap.** Single local Redis and single local Postgres. No Sentinel/Cluster, no second app node, no fencing, no restore drill. **E4 NOT VERIFIED.** Any HA, RPO, or RTO claim remains unproven. Roadmap Reconciliation Required if a roadmap item calls this production-ready.

2. **Redis durability for cache keys.** S2b: after restart the cache key is null. Acceptable for a cache. The outbox sequence case is no longer only a risk — it is A5-08. `isRedis()` can flip true before the socket accepts commands (observed `Stream isn't writeable` on the restart window).

3. **L1 stale window (observed, documented).** S3a: after `FLUSHALL`, `getBootstrapCache` returned `stale-v1` because L1 (`server/cache.js` `getBootstrapCache`, TTL 60s) does not re-check the epoch. L2 does. S3c showed pub/sub invalidation works when Redis is up. This is the 60s lag the invalidation comment already states, plus a flush/crash case where the epoch key is gone and L1 still hits. Class: **GOVERNED LIMITATION** of the 60s L1, not an unbounded stale bug, while pub/sub is healthy. Unbounded only if combined with A5-01 and a handler that was the sole invalidator. Current delete/update routes also call `invalidateCollection` inline, so a stuck `*.deleted` outbox job is not the only invalidation path.

4. **Heavy-worker late rename** is A5-09, not an open risk. What remains unproven is a collision with no harness delay, on the 6.8MB store, where the timeout fires in the few milliseconds around `renameSync` by itself. Do not cite the first F4 attempt as a negative proof.

5. **Outbox has no per-job timeout.** A hung handler holds `running` until it returns. Further ticks are `skippedBusy` and do not refresh `lastTickAt`, so the default 30s `isHealthy()` will eventually go false. `/api/health` uses that default, so a stall is invisible for up to 30s. `/api/readiness` does not look at the worker at all, so a load balancer using only readiness will keep sending traffic. Detection lag is by design of the constant; the readiness blind spot is the operational risk.

6. **Retry storm bound.** Failures are retried every `intervalMs` (default 1s) up to 5 with no jitter. Bounded, but a down dependency is hit at 1 Hz per worker per event. Not observed as an incident.

7. **Tick errors swallowed.** `setInterval(() => { tick().catch(() => {}); })` drops a thrown tick. Claim SQL failure falls back to the RAM array (`worker.js` empty `catch`). In PG-live that can process a stale RAM view or skip the error. Not separately fault-injected beyond the recovery probe.

8. **`fetchPendingBatch(client)` does not set `processing`.** The `client` branch is `SELECT … FOR UPDATE SKIP LOCKED` only. `worker.tick` does not pass a client, so this branch was not on the live path. Latent double-claim if a future caller uses it and commits before the handler finishes. **NOT VERIFIED** as a runtime duplicate.

9. **Health queue is RAM.** `processing` / `dead_letter` are not first-class in `depth()`. Stuck PG rows do not show up after restart. Observability blind spot for A5-01. Roadmap Reconciliation Required.

10. **Comment drift.** `server/rate-limit.js` header still says unexpected errors fail open. The body fail-closes when Redis or `DATABASE_URL` is configured. Live send-code matched the body (503), not the comment. Do not “fix” the code to match the stale comment.

11. **Another agent’s VERIFIED is not this audit’s VERIFIED.** No external VERIFIED claim was re-litigated beyond the tests above. Where those tests say crash recovery passed, this run disagrees: show both (test log vs PG probe). Winner is the PG probe.

---

## 6. Status

| Item | Status | Note |
|---|---|---|
| Arena 5 overall | **PARTIALLY VERIFIED** | Required scenarios were actually run on E3. Not a 5×5 matrix. Not E4. |
| Redis unavailable | **REPRODUCED** | Fail-closed get / rate-limit / send-code. Defects A5-02, A5-03 also reproduced. |
| Worker crash | **REPRODUCED** | A5-01 on PostgreSQL 17.11 and memory mode. |
| Duplicate job (PG claim) | **VERIFIED** | No overlap. Continuation split: 8 locked rows skipped, 12 claimed. Not a product defect. |
| Duplicate id after Redis restart | **REPRODUCED** | A5-08. Non-PG `nextId` only. PG sequence path not this bug. |
| Timeout (outbox heartbeat) | **PARTIALLY VERIFIED** | Short threshold works. Default 30s hides a 51ms hang (expected constant). Stopped worker healthy: A5-04. |
| Timeout (heavy worker late overwrite) | **REPRODUCED** | A5-09. Harness widened the `rename` window. Natural fast-disk timing not separately caught. |
| Recovery (Redis reconnect) | **PARTIALLY VERIFIED** | Client reconnects. Keys lost. Outbox id counter resets (A5-08). |
| Recovery (PG `processing`) | **FAILED** | Restorer does not see claimed rows. Same defect as A5-01. |
| Retry then success | **VERIFIED** | Memory worker, one case. |
| DLQ isolation | **PARTIALLY VERIFIED** | Row is copied to `server_outbox_dlq`. Terminal status/count wrong (A5-05). |
| Multi-node / staging / production-equivalent | **E4 NOT VERIFIED** | **EXTERNAL BLOCKER / OWNER DECISION REQUIRED** if a production GO depends on this arena. |
| pg-mem as outbox harness | **BLOCKED** | Engine cannot run the claim SQL. Not used as evidence. |
| Roadmap | **Roadmap Reconciliation Required** | A5-01 through A5-09, the E4 gap, and the phase6 test name. Do not upgrade roadmap status from this report. |

Approved-status note: nothing in this arena is `FIXED & VERIFIED`. No code was changed. A prior test file printing “PASSED 100%” for crash recovery is an unvalidated claim; the live PG result disagrees.

Redis 6391 was left **down** by the probes (`SHUTDOWN NOSAVE`). That is probe residue, not a product finding. Restart only if a later scenario needs it: `redis-server --port 6391 --bind 127.0.0.1 --save "" --appendonly no --daemonize yes --dir /tmp --pidfile /tmp/redis-6391.pid --logfile /tmp/redis-6391.log`. PostgreSQL on 5433 was still accepting connections at the end of the PG probe.
