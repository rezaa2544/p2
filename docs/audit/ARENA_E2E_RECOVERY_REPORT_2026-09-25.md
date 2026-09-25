# Arena E2E & Recovery Test — Evidence Report

**Date:** 2026-09-25 (user timezone Asia/Tehran)
**Runners:** `arena-e2e-harness.js` (v1) and `arena-e2e-harness-v2.js` (v2, expanded) · **Evidence:** `arena-e2e-evidence.json` + `arena-e2e-evidence-v2.json` (workspace)
**Repository:** `rezaa2544/p2` @ HEAD `66928be` (live `origin/main`, commit 2026-09-23 16:57:54 +0330)
**Method:** real dependencies end-to-end — PostgreSQL 17 + Redis 8 (isolated `initdb`/`pg_ctl`/`redis-server` via the repo's own `tests/chaos-drill-lib.js`), Node 22.21.1, `server/index.js` in **production mode** (`PAYESH_ENV=production`, `NODE_ENV=production`, `DATABASE_URL` + `REDIS_URL` set). No mocks for data stores; the only intentional stub is the SMS gateway (`PAYESH_SMS_PROVIDER=mock`), exactly the contract `server/sms.js` defines.

**v2 result (expanded assignment — 14-step happy path incl. revocation + 10 failure injections): 42 PASS · 4 FAIL · 0 BLOCKED — 74 checks of which 28 evidence records.**
(v1: 34 PASS · 2 FAIL · 0 BLOCKED, 62 checks.) Every FAIL is a real, live-evidenced defect/behavior at HEAD; nothing is marked `CERTIFIED`, and no check that could not be run was scored as PASS.

**Findings at HEAD: A** (SMS mirror schema drift) · **B** (cross-restart duplicate SMS/wallet debit) · **C** (delegated-permission flags lost in PG mode) · **D** (liveness**≠**readiness: `/api/health` reports 200 while `/api/readiness` reports 503) · **E** (no `commandTimeout`/`statement_timeout` — stalled Redis/DB hang requests unbounded).

---

## How login was completed honestly

Round 85 / P0-4 suppresses OTP `demo_code` echo in production (`server/auth.js` ~285: `if(!isProd && DEMO_CODE_ECHO)`). This is correct — and it is also why the repo's own `tests/chaos-drill-lib.js::loginAs` (`send-code → demo_code → login`) is **stale and broken at HEAD** for production mode.

The harness completes login through the **real SMS-delivery leg**: `send-code` persists only `sha256(code + '|' + phone)` into the Redis OTP store (`payesh:otp:state`, `server/otp-store.js` + `server/auth.js` ~192/280). The harness reads that store exactly as a gateway operator would and brute-forces the 6-digit code (`100000–999999`, no leading zeros — `crypto.randomInt(100000, 1000000)`) against the stored hash. Recovery takes ~9–16 ms per subject; the sent code is never echoed, no production behavior is weakened, and every login used the real persisted hash.

---

## Happy path (ordered 11-step scenario)

| # | Scenario step | Result | Evidence |
|---|---|---|---|
| 1 | **login** — send-code → SMS-leg code → login | ✅ | `send=200 login=200 {user id=2 حسین هاشمی role=manager school_id=1 phone_masked 0999****39}`; code recovered from persisted SHA-256 in Redis (9 ms) |
| 1a | auth — `/api/auth/me` session resolution | ✅ | `{user:{id:2, role:manager, school_id:1}}` (JWT, masked PII) |
| 2 | **authorization** — tenant isolation | ✅ | manager `GET /api/v1/classes` → 200, **0** foreign (school-2) of 9 rows; `?school_id=2` → `403 PHASE6_TENANT_ISOLATION_BREACH`; control: superadmin `?school_id=2` → 200 with 9 school-2 rows (gate is role-aware, not hard-coded). SQL anchor `c.school_id=$1` in `dbquery.buildClassesList` |
| 3 | **tenant selection** — bootstrap scoped | ✅ | `200`, 9 classes all `school_id=1`, 0 foreign; manager branch `SELECT … FROM classes WHERE school_id=$1` (`bootstrap.js`) |
| 4 | **business operation** — create class | ✅ | `POST /api/v1/classes` → `201 {id:37 grade:6}` |
| 5 | **database write** — PG-first commit | ✅ | `SELECT … FROM classes WHERE id=37` → `37|1|پایه ششم ب — E2E|6` (row physically in PostgreSQL) |
| 6 | **cache** — Redis dedupe/backing store | ✅ | sync write acked; `GET payesh:idempotency:<uid>` returns a value; `visitors` mirrored to PG (1 row) |
| 7 | **queue** — transactional outbox | ✅ | `DELETE /api/v1/classes/37` → 200 (soft delete); `server_outbox` row `type=classes.deleted status=pending`; worker claim fence (lease token) observed |
| 8 | **worker** — process event | ✅ | pending→processed in ~180 ms; metrics `payesh_worker_events_total{outcome="processed"}` = 1 |
| 9 | **notification** — SMS send | ⚠️ **FAIL** | `POST /api/sms/send {queue_ids:[1]}` → `200 {sent:1, credits_used:4, dry_run:false}` but **PG stayed empty** — see finding A |
| 9b | notification idempotency (in-process) | ✅ | duplicate `queue_id` → `skipped_already:1` (no double debit / double send within JSON SoT) |
| 10 | **report / intelligence** | ✅ | `/api/v1/reports/attendance` → 200 (DB-native SQL pushdown); `?school_id=2` → 403; `school-intelligence?school_id=1` → 200 snapshot; `school_id=2` → 403 |
| 11 | **logout** | ✅ | `POST /api/auth/logout` 200 → `/api/auth/me` 401; Redis denylist key `revoked:jt_…` present (distributed revocation) |

---

## Failure injections

| FI | Injection | Result | Evidence |
|---|---|---|---|
| **Redis down** | `shutdown nosave` | ✅ fail-closed | readiness `200→503` in 3 ms; body shows `redis:{alive:false, live:true, required:true}`; liveness stays 200 (process ≠ ready); `send-code` → `503 redis_required/REDIS_UNAVAILABLE` (rate-limit layer throws, `auth.js` maps to 503); a **valid** existing session still resolves `/api/auth/me` 200 (auth is PG-backed, not Redis-backed); recovery to 200 in ~169 ms |
| **DB down** | `pg_ctl -m fast stop` | ✅ fail-closed | readiness `200→503` in 4 ms, `db:{driver:postgres, alive:false}`; business write with a valid session → **401** (session resolution `readOne('users')` requires PG — see note); nothing fakes 200; recovery to 200 in ~8 ms; same session writes `201` after recovery (pool + session survive) |
| **Worker/process crash** | `SIGKILL` the node process | ✅ recovery | pending `server_outbox` row (crash window) → boot `replayPendingFromPg` drains it in ~95 ms → `processed` (F3 path); new process live |
| **Network timeout** | TCP proxy `swallow` | ✅ applied + retry-safe | client gets `client_timeout` (status 0) while server **applied + mirrored** (PG row exists) — the classic worst case; retry with same uid → `duplicate_ignored`, PG still exactly 1 row |
| **Duplicate request** | same uid sent twice | ✅ idempotency | 2nd → `duplicate_ignored`, PG has 1 row |
| **Partial failure** | batch with 1 valid + 1 invalid op / 1 cross-tenant | ✅ atomic | invalid op rejected per-op (`validation_failed`) while valid op committed; cross-tenant op makes the **whole batch fail-closed `403 out_of_scope`** with rollback — nothing committed (undo-log path) |
| **Restart** | `SIGKILL` + restart | ✅ integrity + ⚠️ **FAIL** | `schools 6→6`, preapps `2→2` (PG intact); fresh login 200; `/api/health` 200 db principal; **but notification was re-sent after restart** — see finding B |

---

## v2 expanded run — happy path (14 steps, incl. logout + revocation), 2026-09-25

The expanded assignment adds **revocation** and re-orders the scenario to 14 steps; every step now has a dedicated verification probe. All passed.

| # / step | Result | Evidence (v2, run 2026-09-25 07:11Z) |
|---|---|---|
| 1 login | ✅ | `send-code` 200 → code recovered from `payesh:otp:state` (sha256(code|phone), 10 ms) → `login` 200 (`set-cookie`); user id=2 حسین هاشمی, role=manager, school_id=1, masked phone `0999****39` |
| 2 auth | ✅ | `/api/auth/me` 200, `{id:2, role:manager, school_id:1}` (JWT session, PG-backed) |
| 3 authorization | ✅ | `GET /api/v1/classes` → 200, **0** foreign of 9; `?school_id=2` → `403 PHASE6_TENANT_ISOLATION_BREACH`; control: superadmin `?school_id=2` → 200 (9 school-2 rows) |
| 4 tenant check | ✅ | bootstrap scoped to actor school: `WHERE school_id=$1` (manager branch), 0 foreign |
| 5 business op | ✅ | `POST /api/v1/classes` → `201 {id:37 … school_id:1}` |
| 6 DB | ✅ | row committed in PostgreSQL: `PG='37|1|پایه ششم ب — E2E v2|6'` |
| 7 Redis | ✅ | sync write acked + idempotency key `payesh:idempotency:arena-e2e-cache-…` set; `visitors` mirrored to PG |
| 8 queue | ✅ | `DELETE` class → soft delete + transactional outbox (`server_outbox` `1|classes.deleted|pending`) |
| 9 worker | ✅ | pending→processed in ~99 ms; metric `payesh_worker_events_total{outcome="processed"}=1` |
| 10 notification | ⚠️ **FAIL** | `POST /api/sms/send` → `200 {sent:1, credits_used:4}` but PG `sms_log=0 rows`, `notify_queue=pending`, `wallet=500.00` — Finding A (unchanged at HEAD) |
| 10b notification idempotency | ✅ | duplicate `queue_id` → `skipped_already:1`, 0 credits |
| 11 report | ✅ | `/api/v1/reports/attendance` 200; `?school_id=2` → 403 |
| 12 intelligence | ✅ | `school-intelligence?school_id=1` 200; `?school_id=2` → 403 |
| 13 logout | ✅ | `POST /api/auth/logout` 200 → `/api/auth/me` **401** `no_session`; Redis denylist key `revoked:jt_…` present |
| 14 revocation | ✅ | revoked `jti` rejected `401`; **durable**: survives **restart** (Redis denylist) and **Redis outage** (PG session-row removal — see isolation probe A) |

## v2 expanded run — failure injections (10), 2026-09-25

| FI | Injection | Result | Evidence |
|---|---|---|---|
| **FI-1 Redis down** | `kill -9` | ✅ fail-closed | readiness `200→503` in 4 ms, `redis:{alive:false, live:true, required:true}`; `send-code` → `503 redis_required/REDIS_UNAVAILABLE`; **revoked session → 401 even with Redis down**; recover to 200 in **170 ms** |
| **FI-2 Redis blackhole** | silent TCP sink on the redis port (ioredis reconnects into it) | ✅ fail-closed + ⚠️ **FAIL (health)** | readiness **503** (`redis.alive:false`); `send-code` → 503 (no hang — offline queue disabled); **`/api/health` still 200 `ok:true` while readiness 503** — Finding D; recovery 200 in **194 ms** |
| **FI-3 DB down** | `pg_ctl -m fast stop` | ✅ fail-closed | readiness `200→503` `db.alive:false`; valid-session write → **401** (session resolution needs PG); recovery **8 ms**; same session writes `201` after recovery (pool + session survive) |
| **FI-4 DB timeout/blackhole** | `SIGSTOP` postmaster **+ all backends** | ⚠️ **FAIL (hang)** | requests **hang** (`client_timeout`, no finite 5xx) because `server/db.js` sets no `statement_timeout` — Finding E; SIGCONT → **200 in 13 ms** (pool uncorrupted) |
| **FI-5 worker crash** | seeded pending outbox + `SIGKILL` API | ✅ recovery | boot `replayPendingFromPg` drains `1 pending` in ~99 ms → `processed`; new process live |
| **FI-6 network timeout** | TCP proxy swallow | ✅ + RPO evidence | client timeout (status 0) while PG row **committed** (1 row); retry same uid → `duplicate_ignored`, still exactly 1 row |
| **FI-7 duplicate request** | same uid twice | ✅ idempotency | 2nd → `duplicate_ignored`, PG 1 row |
| **FI-8 partial failure** | batch: 1 valid + 1 invalid + 1 cross-tenant | ✅ atomic | invalid per-op rejected, valid committed; cross-tenant op → **whole batch 403 + rollback** (PG `ct-ok=0 ct-x=0`) |
| **FI-9 stale client** | PATCH with old `base_version` | ✅ OCC | first PATCH `200` (version→2); stale PATCH → `409 conflict` + **`sync_conflicts` SSoT row =1**; sync upd stale → `stale_base` (server-reference) |
| **FI-10 restart** | `SIGKILL` + restart | ✅ integrity + ⚠️ **FAIL (re-send)** | PG intact (`schools 6→6`, `preapps 2→2`); revoked session still 401; fresh login 200; **notification re-sent after restart** (`sent:1` again; PG `notify_queue` was still `pending`) — Finding B unchanged |

### RPO / RTO measured (v2)

| Metric | Value | Note |
|---|---|---|
| RTO Redis outage (down→ready) | **170 ms** | — |
| RTO Redis blackhole → back | **194 ms** | after sink FIN + Redis re-bind |
| RTO DB outage | **8 ms** | — |
| RTO full DB freeze → SIGCONT | **13 ms** | pool survives |
| RTO process restart → ready | **≈473 ms** | boot replay + listen |
| RPO network-timeout write | **0 rows lost** | committed before ack lost; retry deduped to exactly 1 row |
| RPO committed rows across restart | **0 rows lost** | exact row equality (`schools`, `preapps`) |
| RPO notification send decision across restart | **>0 — lost** | in-process `sent` reverted to `pending` in PG; re-send allowed (Finding A→B consequence) |

## Isolation probes (separating real findings from harness artifacts)

Because the first v2 run produced two numbers that looked wrong (blackhole "never recovers", freeze "write succeeded"), five dedicated isolation scripts were built and are persisted (`arena-iso-*.js`). They fix three harness artifacts before anything is reported:

- **Probe A — `arena-iso-revocation.js`:** revoked session → `401` with Redis **up** and **down** (logout deletes the PG session row; resolution is PG-backed). No fail-open bypass. ✅
- **Probe B — `arena-iso-recovery-v2.js`:** blackhole sink with socket teardown + full-postgres-tree freeze. Readiness **503** during blackhole, recovery **6 ms**; full freeze → `client_timeout`, recovery **9 ms**. (The first v2 "25 s / never" was a harness bug: the sink kept the port, so relaunched Redis never bound.)
- **Probe C — `arena-iso-hang.js`:** settled blackhole (8 s settle): readiness 503 fail-closed, `send-code` 503, **but `/api/health` 200** — the health/readiness divergence is real.
- **Probe D — `arena-iso-redisfreeze.js`:** healthy Redis **then** `SIGSTOP redis-server` → readiness / send-code / health **all hang** (`client_timeout`) until SIGCONT (recovery 9 ms). This is the real "no `commandTimeout`" window that a TCP sink cannot reproduce (the sink fails fast via the offline queue; a *healthy-then-silent* Redis has a live socket and a queued command that never returns).

---

## Findings

### Finding A — `POST /api/sms/send` reports `200 {sent:1}` but the mirror to PostgreSQL silently fails (schema drift) — **FAIL, real defect at HEAD**

- `server/sms.js` builds `sms_log` records with fields `queue_id` and `provider_msg` (lines ~148, ~166) and mirrors via `db.persistOpsBatch` (`Wave1-W` comments claim "the failure record also reaches postgres").
- `persistOpWithClient` (`server/db.js` ~741) issues `INSERT INTO sms_log (…provider_msg, queue_id…)` — the schema never defines these columns (`server/schema.sql` `sms_log` has `body, phone, school_id, status, user_id, parts, created_at, updated_at`; no migration adds `queue_id`/`provider_msg`).
- Result: the whole mirror transaction rolls back. Evidence captured live:
  - `POST /api/sms/send` → `HTTP 200 {"sent":1}` (client believes 1 SMS sent and 4 credits consumed),
  - PG `sms_log` = **0 rows**, `notify_queue.status` = **pending**, `sms_wallet.balance` = **500.00** (not debited),
  - audit log shows the swallow: `{"event":"sms_mirror_failed", …}` (proof the code audited its own failure),
  - direct probe: `INSERT INTO sms_log (…,provider_msg, queue_id,…)` → `ERROR: column "provider_msg" … does not exist`.
- Attribution: `server/sms.js` gains `queue_id`/`provider_msg` across `3952260`/`a954185`/`516c1e1` (request-validation + Wave1-W write-migration, round 105). No migration ever adds the columns to `sms_log`.
- Impact: in PG-live production the JSON store and PostgreSQL are **different sources of truth** for exactly the flow that matters most (payment/notification). It violates this codebase's own P0 idempotency posture.
- **Fake-green note:** the repo's own tests never catch this. `tests/server11-sms.js` asserts only the in-memory `store.sms_log` (no `DATABASE_URL`); `tests/wave1-writes.js` uses a **fake pool with a SQL recorder** and asserts the `INSERT INTO sms_log` string was generated — never that it commits against the real schema. The one live-PG suite (`tests/server17.js`) only checks `/api/sms/send` **validation** (400 cases), never a successful send against PG.

### Finding B — cross-restart duplicate SMS sends (downstream of A) — **FAIL, real defect at HEAD**

- In-process idempotency (A's `skipped_already`) works only against the JSON SoT (or the store hydrated from PG at boot).
- Because of A, the "sent" decision never lands in PG. After `SIGKILL` + restart, `store.notify_queue` rehydrates from PG where `status='pending'`.
- Sending `queue_id=1` again → `200 {sent:1}` a second time (same message, **4 more credits**, again not mirrored).
  - Before restart: `sent:1`; after restart same `queue_id`: `sent:1, skipped_already:0`.
- Real **idempotency + financial-integrity** bug: restarts (which operator tooling invites precisely at failure moments) re-charge the wallet. Both A and B are consequences of one schema/drift contract in `sms.js` vs `server/schema.sql`.

### Finding C — delegated-permission flags (`asset_staff` / `lib_staff` / `is_head`) are dropped in PG mode → delegated actions silently become `403` — **real defect at HEAD**

- `server/policy.js` gates three delegated capabilities on user flags: librarian (`lib_staff`, library2 contract), asset officer (`asset_staff`, assets-update), office head (`is_head`, edu-office management).
- These flags exist in the seed JSON SoT (`teacher id14 asset_staff=1`, `teacher id15 lib_staff=1`, three `edu_office is_head=1`) and in the authz model (`authz/write-perms.json` users.fields = 37 incl. `is_head`). **But the `users` PostgreSQL table has no such columns** (`user` has `iep_staff`, not `asset_staff`/`lib_staff`; `is_head` absent; no migration adds them).
- In PG-live mode boot hydration replaces `store.users` with PG rows (`db.js hydrateStoreFromPg`, `SCHEMA_TABLES` includes `users`), so the flags are **absent at authorization time** (`policy.js` reads `me.asset_staff !== 1` → false → `inScope` false).
- **Live evidence (probe `arena-probe-delegation.js`):**
  - `SELECT asset_staff FROM users` → `ERROR: column "asset_staff" does not exist` (PG hint suggests `iep_staff`);
  - seed teacher14 (`asset_staff=1` in JSON) → login `200` → asset write → **`403 out_of_scope`**; PG row unchanged (`repair`);
  - positive control manager → same op → `200`, PG row updated (`in_use`).
- Effect: the entire delegation model works only in memory-mode; under a real database the `E.5`/`E.4`/office-head roles all fail closed. This is fail-closed (safer than a bypass), but it means the feature is **dead in PG-live deployments** — a silent contract break.
- **Fake-green note:** every repo test for these flags (`tests/assets-mutations.js`, `assets2.js`, `library-mutations.js`, `library2.js`, `office-head-contract.js`, `chat9-behavior-regression.js`) is a **string-grep or vm-eval test** (e.g. asserts the source contains `u.asset_staff === 1`) — and none sets `DATABASE_URL`. No runtime test exercises a delegated write with a live PG. `tests/seed-completeness.js` asserts the flags on JSON seed only.

### Finding D — `/api/health` diverges from `/api/readiness` under a Redis outage (health gowns the gate) — **FAIL, real defect at HEAD**

- `server/index.js` `/api/health` computes `isHealthy = redis.ready() && dbAlive && workerHealthy`, where `redis.ready()` (`server/redis.js` ~300) returns `isProduction() ? isRedis() : true` and `isRedis()` is the **connection flag** `isRedisActive && client !== null`, set `true` on ioredis `'connect'` (TCP established) — not on a completed `PING`.
  - In the same handler the response body sets `redis:{alive: !!(rdp && rdp.ok)}` from the **actual** `await redis.ping()` (`redis.js` ~798) and `db.ready()`-style ping for the DB — i.e. health **computes** a real liveness for its body, then **ignores it** for the status code.
- **Live evidence (Probe C, settled blackhole):** `/api/readiness` → `503 {redis:{alive:false, live:true, required:true}}`, `/api/auth/send-code` → `503`, **`/api/health` → `200 {ok:true, cache:'redis', redis:{alive:false}}`** in the same second. The health response is self-contradictory: it claims `ok:true` while its own body says Redis is dead.
- Contrast — clean redis-down (`Probe A`/FI-1): `error`/`end` fires on the client, `isRedisActive=false`, so `ready()` goes false and health **does** 503. The blackhole (TCP accept, never reply) is exactly the case the `ready()` flag does not cover: the socket is `connect`ed but Redis never answers.
- Impact: orchestration that gates on `/api/health` (not `/api/readiness`) keeps routing traffic to a node whose Redis is gone. It is a **misleading health check** of precisely the class the assignment calls out.

### Finding E — no `commandTimeout` (Redis) / no `statement_timeout` (PG): a *stalled* dependency hangs requests unbounded instead of failing with a finite 5xx — **FAIL, real behavior at HEAD**

- `server/redis.js` ioredis base config (`buildRedisConfig`) sets `connectTimeout:3000`, `enableOfflineQueue:false`, `maxRetriesPerRequest:2`, `retryStrategy` capped at 2000 ms — but **no `commandTimeout`**. ioredis' own socket-level timeouts only apply while a command is queued offline; a command on a live socket whose peer goes silent waits **forever**.
- `server/db.js` pool config sets only `connectionTimeoutMillis` (`PG_TIMEOUT_MS`, default 3000); there is **no `statement_timeout`/`query_timeout`** for a pooled, already-connected client. `db.ping()` (`SELECT 1`) and every session-resolution `readOne('users')` therefore block indefinitely on a frozen engine.
- **Live evidence (Probe B, full-tree freeze):** `SIGSTOP` postmaster + 8 backends → `/api/readiness`, `send-code`, and any DB-backed route **hang** (`client_timeout` at the client, no server 5xx). SIGCONT → recovery in **9–13 ms** (no pool corruption — the failure is unbounded *latency*, not staleness).
- **Live evidence (Probe D, healthy-then-silent Redis):** `SIGSTOP redis-server` (socket stays open, replies stop) → `/api/readiness`, `/api/auth/send-code`, **and `/api/health`** all hang until SIGCONT; recovery **9 ms**.
- Distinction this report draws honestly: a **TCP blackhole sink** (port taken, `FIN` on kill) is *fail-closed fast* (offline queue disabled), but a **previously-healthy Redis that stops replying** is the unbounded-hang case. Both are real operational scenarios; only the second is currently unprotected.
- Impact: any freeze of the DB or Redis engine turns every dependent endpoint into a hang that only the client's timeout ends — no server-side bounded degradation, no 503, no circuit-break. Violates the repo's own "fail-closed in finite time" posture.

### Dismissed hypothesis (recorded for honesty)

- Suspected: `db.js` `upd` path appends `version = COALESCE(version,1)+1` and `server/schema.sql` has no `version` column → every update-mirror fails. **Disproved live:** migration `013_universal_occ_and_sequences.sql` loops `ALTER TABLE … ADD COLUMN version` over **all** public tables, so the column exists. Probe (`arena-probe-upd.js`) confirmed `visitors`/`preapps` updates → `200` and PG rows updated. Not a defect.

### Notes (not scored, but recorded)

- The repo's own `chaos-drill-lib.js::loginAs` is **stale at HEAD** (assumes `send-code` echoes `demo_code`). It is what produced the earlier drill `login=400` cascade. The drills were last touched in `3fb6647`, before Round 85's P0-4 OTP-echo suppression.
- `server/seed.js` generates some `visitors` rows containing empty-string timestamps, which fail `INSERT` into the `TIMESTAMPTZ` columns (`visitors_err` during `seedPg`). It does not affect the tested flows, but PG replication of seed `visitors` is incomplete.
- During a PG outage, REST routes return **401** (session resolution requires `pg readOne('users')`) while `/api/readiness` returns `503`. This is deliberate-design centralization of identity, but it means the load‑balancer sees a *readiness* signal while an end user with a valid cookie sees *unauthenticated* rather than *retry* — an observable UX/observability oddity worth flagging, not a data-integrity fault.
- Cross-tenant read attempts return an explicit `403 PHASE6_TENANT_ISOLATION_BREACH` rather than an empty 200 — good fail-closed behavior, confirmed on classes, reports, and school-intelligence.

---

## Workspace / budget

- Workspace total **76 MB** (< 100 MB). `node_modules` and the npm cache live outside the workspace at `/tmp/repo-node_modules`; the harness passes `NODE_PATH=/tmp/repo-node_modules` into the API child process.
- Persisted artifacts: `arena-e2e-harness.js` (v1), `arena-e2e-harness-v2.js` (v2, expanded), `arena-e2e-evidence.json` + `arena-e2e-evidence-v2.json` (full per-step evidence), `arena-iso-{revocation,recovery-v2,hang,redisfreeze}.js` (isolation probes A–D), `arena-probe-delegation.js` + `arena-probe-upd.js` (Finding C + dismissed-hypothesis probes), this report.

## How to re-run

```bash
# PostgreSQL 17 + Redis 8 must be installed (sudo apt-get install -y postgresql-17 redis-server)
export PATH=/tmp/node-v22.21.1-linux-x64/bin:/usr/lib/postgresql/17/bin:$PATH
node /home/user/arena-e2e-harness-v2.js          # expanded runner
node /home/user/arena-iso-redisfreeze.js          # Finding E (healthy→silent Redis hang)
node /home/user/arena-iso-revocation.js           # revocation under Redis outage
```

(If the sandbox is re-provisioned between turns — `/tmp` and system packages do not persist): re-install Postgres/Redis, re-extract Node 22.21.1 to `/tmp`, then `npm ci` inside `repo` and `mv node_modules /tmp/repo-node_modules` before running. The harness auto-detects the Node-modules location. Never run the v1 harness expecting `loginAs` to work: it is **stale at HEAD** (assumes `demo_code` echo) — use the v2 runner, which logs in through the real SMS-delivery leg.
