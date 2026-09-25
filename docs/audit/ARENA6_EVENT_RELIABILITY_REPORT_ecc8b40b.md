# Arena 6 — Event Reliability Audit (Outbox / Queue / Workers)

| Field | Value |
|---|---|
| Auditor | Arena 6 — Event Reliability Auditor |
| Date | 2026-09-22 (Asia/Tehran) |
| Repository / Branch | `rezaa2544/p2` / `main` |
| Current HEAD | `ecc8b40b5d533d77c6ebad63ca0854119873c504` (tree clean before/after) |
| Environment | Node v22.14.0, memory mode live; **no PostgreSQL/Redis locally** (PG claims = static + CI E3 evidence) |
| Scope | `server/outbox.js`, `server/worker.js`, `server/delete-service.js`, `server/sync.js` (client queue), `server/sms.js` (notify_queue), `migrations/014_outbox_dlq.sql`, event suites + CI wiring |

---

## 1. Event Flow Analysis

### 1.1 Three distinct queues (do not conflate)

| Queue | Producer | Store | Consumer | Delivery contract |
|---|---|---|---|---|
| **Transactional Outbox** (view 8) | `delete-service.js` → `outbox.append(evt[, client])` — with PG: INSERT inside the **same transaction** as the delete (`ON CONFLICT (id) DO NOTHING` + unique-violation id-retry); memory: push to `store.outbox` (cap 1000) | RAM `store.outbox` + PG mirror `server_outbox` | `server/worker.js` tick (1s): `fetchPendingBatch` → handler → `mark` | At-least-once intended; only registered handler today = `*.deleted` → `cache.invalidateCollection` (idempotent) |
| **Client offline sync queue** | Browser/offline client | IndexedDB/local (client) | POST `/api/sync` batches; server dedups by `uid` (`__processed_uids` / `isUidProcessed`) | Client retries on 401/500 (stay `failed`+pending), rejects on 403/duplicate (`rejected`/`synced`) — see `deadletter` contract D1–D11 |
| **notify_queue (SMS)** | sync ops (`notify_queue` collection) | store + PG | `sms.js` send by `qid` → `sent/cancelled/rejected` | status-gated; out of worker tick |

### 1.2 Outbox lifecycle (Current HEAD)

```
append ──► status=pending (id: PG seq | Redis INCR | local counter)
              │  mirror INSERT server_outbox (PG) / snapshot (memory)
              ▼
fetchPendingBatch ──► ATOMIC CLAIM:  PG: CTE UPDATE … SET status='processing'
              │                        (SELECT … FOR UPDATE SKIP LOCKED → UPDATE → RETURNING)
              │                        memory: sync flip pending→processing   [OUTBOX-002, commit 5d76e184]
              ▼
worker.tick (sequential for-loop, inFlight Set, running re-entry guard)
              ├─ no handler for type ──► continue  ← ★ claim already flipped! (see F-1)
              ├─ handler OK  ──► mark(processed, processed_at)   [RAM Object.assign + best-effort PG UPDATE]
              └─ handler throw ──► retry_count++, status→pending (next tick)
                                    at maxRetries (default 5, PAYESH_WORKER_MAX_RETRIES)
                                    → moveToDlq (DLQ row + mark dead_letter) → mark(failed) ★overwrites dead_letter
              ▼
Boot (PG only): replayPendingFromPg() — SELECT … WHERE status='pending' only → refill RAM (idempotent by id set)
```

**Recovery matrix as designed vs as built:**

| Crash point | Memory mode | PG mode |
|---|---|---|
| After append, before claim (`pending` on disk/table) | ✅ recovered (probe X1) | ✅ recovered (boot replay; CI phase2-outbox-failover proves with real PG on this SHA) |
| After claim, before mark (`processing`) | ❌ **STUCK forever** (live repro X2b ×2) | ❌ **STUCK forever** (static: claim commits `processing`; replay+fetch select `pending` only; no reaper anywhere — X4a–d) |
| After mark | ✅ terminal | ✅ terminal (RT4 fix: mark lands on PG even when RAM row absent) |

### 1.3 Guarantee-by-guarantee map

| Guarantee | Where enforced | Verdict |
|---|---|---|
| Atomic claim (no double-claim) | PG: single-statement CTE + SKIP LOCKED; memory: synchronous status flip; worker: `running` + `inFlight` | **VERIFIED** (unit + c3 20/20 + my 3-worker race) |
| At-least-once | append-in-tx + replay + retry | **PARTIALLY VERIFIED — claim-window VIOLATED** (F-1) |
| Idempotent consume | ingest `uid` dedup; handler = cache invalidate | **VERIFIED** for current handlers (dup delivery still occurs for dup enqueues — by design) |
| Retry | retry_count → pending; max → failed + DLQ; events never deleted | **VERIFIED** (live) |
| Crash recovery | pending path only | **PARTIALLY VERIFIED** (pending ✅ live+CI; processing ❌) |
| Observability | depth(), health, metrics | **PARTIALLY VERIFIED** — processing hidden (F-3); freeze only via health (F-2) |

---

## 2. Failure Cases (scenario results)

### S1 — Normal
append → tick → `processed` once across repeated ticks; `processed_at` set; depth correct.
**→ PASS (N1–N3).**

### S2 — Duplicate
- Same logical event enqueued twice → two ids → **both delivered** (at-least-once permits; consumer contract requires idempotency — real handler pattern idempotent). **PASS with documented caveat.**
- 3 concurrent worker instances, same store, 1 event → **exactly 1 delivery**; same-worker parallel ticks → re-entry guard (2× skippedBusy). **PASS (C1/C2).**
- Server ingest duplicate `uid` → `duplicate_ignored` → synced (`sync-dup-claim` 7/7, `deadletter` D9). **PASS.**

### S3 — Crash
- **Before claim**: `pending` persisted → restart → processed. **PASS** (X1 memory live; CI `phase2-outbox-failover` real-PG on this SHA).
- **After claim** (`processing` persisted/committed): restart → 3 ticks → `calls=0`, status stays `processing` → **EVENT LOST. REPRODUCED ×2 runs (X2b); PG path identical by static contract (X4a–d); PG live = MEASUREMENT GAP.**
- **Control**: claim happened in RAM only, disk still `pending` → recovered (X3) — loss requires claim committed/persisted, i.e. the whole handler-execution window.

### S4 — Retry
- Always-fail handler: rc 1→2→3 at maxRetries=3 → terminal `failed`, **DLQ row present**, event never deleted, never re-claimed. **PASS (R1–R6).**
- Transient fail → success: processed with `retry_count=1` kept. **PASS (T1).**
- Minor: worker path ends `failed` (overwrites moveToDlq’s `dead_letter`); direct `moveToDlq` (CI test path) ends `dead_letter` — two terminal labels for one contract (F-5).

### S5 — Concurrency
- Atomic claim exclusivity: **PASS** (probe C1/C2; `c3-remediation-regression` 20/20 incl. OUTBOX-002 suite; PG CTE static).
- **No-handler + concurrency interaction → REGRESSION:** event type without a handler is **claimed → flipped `processing` → skipped → orphaned**. `wave8-outbox` **O4 RED (14/15)** at HEAD in 3 environments (workspace ×2 runs, fresh clone, worktree); **bisect: green at `5d76e184^`, red at `5d76e184`** (the OUTBOX-002 fix itself).
- **Hang:** handler that never resolves → tick never settles → `running` stuck → all later ticks skipped → event stays `processing`; **no handler timeout, no auto-recovery**; health exposes growing `lastTickAgeMs` (prod threshold 30s). **REPRODUCED (H1–H3).**

### S6 — Boundary / outage (honest NOT-RUNs)
- Cap 1000: oldest **pending** events silently dropped in memory mode (CAP2 live; PG worker claims from table → dev-mode-only loss).
- `queue-outage-drill`: 7✅/0❌/**4 NOT-RUN** (`QOD_LIVE_PG` unset) exit 2 — honest.
- `chaos-drill-queue-outage`: `INFRA_REQUIRED postgresql-17 + redis-server` exit 2 — honest.
- `phase2-outbox-failover` without PG: exit 1 by contract (“dependency missing = FAIL, never fake-green”) — honest.

---

## 3. Evidence

| ID | Check | Command | Expected | Actual | Runs | Level | Status |
|---|---|---|---|---|---|---|---|
| A6-E01 | Normal flow | `node arena6-outbox-probe.js` N1–N3 | processed once | ✅ 3/3 | 2 | E3 local | VERIFIED |
| A6-E02 | Duplicate enqueue/consume | probe DUP1a–c | both delivered, consumer idempotent | ✅ | 2 | E3 local | VERIFIED |
| A6-E03 | Concurrent workers race | probe C1–C2 (3 workers ∥) | exactly 1 delivery | ✅ 1 delivery | 2 | E3 local | VERIFIED |
| A6-E04 | Retry→DLQ→terminal | probe R1–R6, T1 | rc++, failed, DLQ, never deleted | ✅ (final label `failed`) | 2 | E3 local | VERIFIED |
| A6-E05 | Crash before claim | probe X1 | recovered | ✅ | 2 | E3 local | VERIFIED |
| A6-E06 | **Crash after claim** | probe X2b | recovered (at-least-once) | **❌ calls=0, stuck `processing`** | **2** | E3 local (memory) | **REPRODUCED** |
| A6-E07 | PG recovery-path static contract | probe X4a–d vs `server/outbox.js` | some path requeues `processing` | **none: replay/fetch = `WHERE status='pending'` only; no reaper in server/, tools/, index.js boot** | 1 | E3 static | **REPRODUCED (static)** |
| A6-E08 | **No-handler event untouched (O4)** | `node tests/wave8-outbox.js` | 15/15 | **14/15, O4 ❌** (event ends `processing`) | workspace×2 + fresh clone = **3 envs** | E3 local | **REPRODUCED** |
| A6-E09 | Regression introduction point | worktree `5d76e184^` vs `5d76e184` | green before / red after | **15/15 ✅ → 14/15 ❌** | 1×2 SHAs | E3 local | **REPRODUCED (bisect)** |
| A6-E10 | OUTBOX-002 suite still green | `node tests/c3-remediation-regression.test.js` | 20/20 | **20/20 ✅** (fresh clone too) | 2 | E3 local | VERIFIED (fix intent holds; collateral O4 broken) |
| A6-E11 | Hang / no timeout | probe H1–H3 | recovery or timeout | **❌ frozen ≥3.2s, ticks skipped, no timeout** | 2 | E3 local | **REPRODUCED** |
| A6-E12 | Stuck events invisible to metrics | `depth()` after no-handler tick | visible as backlog | `pending=0, legacy=1` — counted as **`legacy`**, and PG gauge counts `WHERE status='pending'` only (`metrics.js:616`) | 2 | E3 local | **REPRODUCED** |
| A6-E13 | Memory cap head-drop | probe CAP1–2 | document loss | 1005 append → oldest 5 `pending` dropped | 2 | E3 local | VERIFIED (dev-only) |
| A6-E14 | CI pending-crash + DLQ (real PG) | Actions run #1205 `ecc8b40b`, step «Outbox crash/restart replay + real DLQ row» | pass | **passed (failed step was only 27 `npm test`)** | 1 | **E3 CI (live PG)** | VERIFIED (pending path only — test inserts `status='pending'` artifact by design) |
| A6-E15 | Ingest idempotency / client DLQ | `sync-dup-claim` 7/7 · `deadletter` 18/18 · `sync-dlq-retry` 7/7 · `sync-queue-caps` 36/36 | green | ✅ all exit 0 | 1 | E3 local | VERIFIED |
| A6-E16 | Queue chaos w/ real infra | `chaos-drill-queue-outage` / `queue-outage-drill` | run | **INFRA_REQUIRED / 4 NOT-RUN, exit 2** (honest) | 1 | — | **MEASUREMENT GAP** (no local PG/Redis; not in CI either) |
| A6-E17 | Event suites CI membership | `grep` workflows for wave8/deadletter/sync-dup/queue-outage | registered | **NONE referenced by any workflow** | 1 | E3 static | **FAILED (CI blind spot)** |
| A6-E18 | PG claim-then-crash live repro | — | — | **not executable (no PG)** — static+memory evidence only | 0 | — | **MEASUREMENT GAP / NEEDS RECHECK on live PG** |

Logs: `/tmp/arena6-probe.log`, `/tmp/arena6-probe-r2.log`, `/tmp/a6-*.log`, `/tmp/w8-pre.log`, `/tmp/w8-post.log`, `/tmp/fresh-w8.log`. Probe script: `/home/user/arena6-outbox-probe.js`.

---

## 4. Risks

| Risk ID | Severity | Mechanism | Impact | Evidence |
|---|---|---|---|---|
| **A6-F1a** | **CRITICAL** | Claim commits `processing`; **no reaper, no unclaim-on-skip, replay/fetch = pending-only** → crash-after-claim orphans the event **forever** | **At-least-once violated = silent event loss** (cache-invalidation events lost → stale cross-instance cache; any future event type loses guaranteed follow-up) | A6-E06 (live ×2), A6-E07 (static) |
| **A6-F1b** | **CRITICAL** | Same root: `fetchPendingBatch` flips **before** the handler check → **no-handler events orphaned on first poll** | Documented multi-consumer contract («رویدادهای بدون هندلر دست نمی‌خورند») broken; adding any new event type without instantly registering a handler = permanent poison; **regression introduced by the OUTBOX-002 fix itself** (`5d76e184`) and still red at HEAD | A6-E08 (3 envs), A6-E09 (bisect) |
| **A6-F2** | **HIGH** | No handler timeout; sequential `await` in tick; `running` never clears on hang | One hung handler freezes the **entire worker permanently**; no auto-recovery — only health signal (`lastTickAgeMs`, default unhealthy after 30s) | A6-E11 |
| **A6-F3** | **MEDIUM** | `depth()` buckets `processing` → `legacy`; PG gauge counts `pending` only | Stuck/lost events **invisible** to `payesh_outbox_depth` and health queue counts → observability blind spot exactly where the loss lives (no alert can fire) | A6-E12 |
| **A6-F4** | **HIGH (process)** | None of wave8/deadletter/sync-dup/queue-drills referenced by any workflow; parity contract only budgets orphans (485) | Regression **shipped through the whole org undetected** while OUTBOX-002’s own suite (c3) stayed green — classic split-brain coverage | A6-E17 + E08/E10 |
| **A6-F5** | **LOW** | Worker marks `failed` **after** `moveToDlq` marks `dead_letter` | Two terminal labels for one path; dashboards filtering `dead_letter` miss worker-path poison pills (DLQ row itself exists) | A6-E04 observation |
| **A6-F6** | **LOW (dev-only)** | Memory `OUTBOX_CAP=1000` head-drop includes **pending** | Silent loss under backlog in JSON-store mode (prod boots refuse memory mode, so exposure = dev/test) | A6-E13 |
| **A6-R1** | EXTERNAL | Live-PG claim-crash window + queue-outage/chaos drills need PG+Redis | PG-mode F-1a live proof and chaos outage behavior **unverified in this environment** | A6-E16, E18 |

**Not risks (hardened, verified):** atomic claim exclusivity · ingest uid idempotency · retry ladder + DLQ row + never-delete · pending-crash replay (memory live + real-PG CI on this SHA) · honest NOT-RUN/FAIL exits on missing infra (no fake green in these suites).

---

## 5. Status

| # | Item | Status |
|---|---|---|
| 1 | **At-least-once delivery** | **FAILED** — claim-window loss REPRODUCED (memory live ×2; PG static). Pending-window path VERIFIED (CI E3 real PG). |
| 2 | **Idempotency** | **VERIFIED** (ingest uid dedup, current handler idempotent, no double-process on repeat ticks) — with caveat: duplicate *enqueue* ⇒ duplicate *delivery* is by-design |
| 3 | **Duplicate processing** | **VERIFIED** — concurrency races 1-delivery (probe ×2, c3 20/20); sequential redelivery only after crash-before-mark (correct at-least-once behavior) |
| 4 | **Atomic claim** | **VERIFIED** — PG CTE+SKIP LOCKED static, memory sync flip, 3-worker race clean; c3 OUTBOX-002 20/20 |
| 5 | **Retry** | **VERIFIED** — rc ladder, terminal at max, DLQ row, never deleted, transient-then-success works; label inconsistency = F-5 (LOW) |
| 6 | **Crash recovery** | **PARTIALLY VERIFIED** — pending ✅ (live+CI); **processing ❌ REPRODUCED (F-1a)**; PG live recheck = MEASUREMENT GAP |
| 7 | **No-handler / multi-consumer contract** | **REPRODUCED (DEFECT)** — wave8 O4 red at HEAD, bisected to `5d76e184` (F-1b) |
| 8 | **Worker hang resilience** | **REPRODUCED (DEFECT)** — no timeout, no recovery (F-2) |
| 9 | **Queue observability** | **PARTIALLY VERIFIED** — health exposes freeze; **depth metrics hide `processing`** (F-3) |
| 10 | **Queue-outage chaos (live)** | **MEASUREMENT GAP / EXTERNAL BLOCKER** — honest NOT-RUN (F-R1) |
| 11 | **CI coverage of event suites** | **FAILED** — zero event-queue suites in workflows (F-4) |

### Overall — Outbox/Queue/Worker reliability at `ecc8b40b`:

# `FAILED`

(core guarantee at-least-once broken in the claim window + a live suite regression at HEAD + the blind spot is metrically invisible)

**Roadmap Reconciliation Required:** F-1a/F-1b (defects), F-4 (CI registration gap). Arena does not change roadmap status.

**Minimal remediation hand-off (for implementation team — not applied by Arena):**
1. **F-1:** unclaim on handler-skip (`status→pending` when no handler) **and** add claim reaper: boot + periodic `UPDATE server_outbox SET status='pending' WHERE status='processing' AND processed_at IS NULL AND created_at < now()-interval` (or claim-token/lease column with expiry); extend `replayPendingFromPg` to `status IN ('pending','processing')` with age guard. Regression: wave8 O4 green + new crash-after-claim test (memory **and** live PG) + cap on re-delivery.
2. **F-2:** `Promise.race` timeout per handler → treat as failure (retry ladder), never leave `running` stuck.
3. **F-3:** add `processing` bucket to `depth()` + include it in PG gauge; alert on `processing` age.
4. **F-4:** register wave8 (+mutations), deadletter, sync-dup-claim, sync-dlq-retry, queue-outage-drill in `node.js.yml`; raise-or-reclassify orphan budget.
5. **F-5:** stop overwriting `dead_letter` (worker final status unify) and pin one terminal-label contract in a test.

---
*Arena 6 — Event Reliability Auditor · SHA `ecc8b40b` · Evidence: 18-row matrix, probe runs ×2, worktree bisect ×2 SHAs, 3 environments for O4.*
