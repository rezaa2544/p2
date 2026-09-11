# Wave 17 — Testing (suite inventory, contract, results)

**Wave:** 17 — Testing Pyramid (Roadmap §20) · **Owner:** Arena 5
**Branch:** `arena/01a0867f-p2` · **Updated:** 2026-09-10
**Status:** ✅ 73/73 checks green against a real server

> Two documents, two jobs. **This one** is the operational record: what
> `tests/wave17-testing.js` asserts, how to run it, what it measured.
> `docs/WAVE17_TESTING_PYRAMID.md` is the design record: how the twelve
> roadmap levels map onto the repo's suites, and what the pyramid still
> does **not** prove. Read §6 there before quoting a latency number.

---

## 1. Status of Wave 17 (step 1 of the task)

`docs/NATIONAL_ROADMAP_PROGRESS.md` row 17 read `⏳ · در انتظار شروع`. That
was **stale**, not accurate: the wave had been implemented and pushed
(`bc6973e`, `644183d`, `96bf550`). The row is updated in this change.

What this round actually added — the four levels the task named:

| Level | Before this round | After |
|---|---|---|
| **Integration** | ✅ `IN1–IN11` | unchanged (already real) |
| **Contract** | ❌ not in this suite (only `tests/api/*`) | ✅ `CT1–CT10` — wire shapes pinned |
| **E2E** | 🟡 `tests/smoke.js` (browser/jsdom) | ✅ `E2E1–E2E9` — server-side journey added |
| **Concurrency** | ✅ `CC1–CC6` | unchanged (already real) |

Check count went **54 → 73**. Nothing was removed, relaxed or renumbered —
`PY1–PY8` assert that mechanically on every run.

---

## 2. The suite

```
tests/wave17-testing.js              73 checks    node tests/wave17-testing.js
tests/wave17-testing-mutations.js    10 checks    node tests/wave17-testing-mutations.js
```

It boots a **real server process** (`node server/index.js`) on port 9041
(fallback 9042 — inside the `90[0-9]{2}` pattern `run-all-tests.sh`
serialises), with its own temp store, audit log, key and metrics token, and
talks to it over real TCP. No mocks, no in-process shortcut.

| Section | Checks | What it pins |
|---|---|---|
| `P0` boot | 5 | process up · `/api/health` 200 · `/metrics` fail-closed without the token · exposition with it · real session (`send-code` → `login` → cookie) |
| `IN` integration | 11 | cookie auth · sync `ins` accepted · REST list in the same session · **write reached the store** · replay → `duplicate_ignored`, **no duplicate row** · stale `base_version` → preserved conflict · unauth read refused · forged `by` → whole batch 403 · sync + conflict counters moved |
| `CT` contract | 10 | the wire shapes every deployed client is compiled against (see §3) |
| `E2E` journey | 9 | one session walks auth → REST → sync → store → observability → audit, then replays itself (see §4) |
| `CC` concurrency | 6 | 40 parallel requests move the counter by **exactly +40** · 20 parallel writes all land · 10 copies of one uid → **1 created, 9 `duplicate_ignored`, 1 row on disk** · concurrent `upd` → exactly 1 winner, 5 `conflict_preserved` · zero 5xx recorded |
| `LD` load | 6 | 400 req, 0 socket errors · rps · p95/p99 inside budget · **histogram accounted for every request exactly** · cardinality guard silent |
| `ST` stress | 6 | 501-op batch → **413 `batch_too_large`, not 500** · >1 MB body → 413 · 200 concurrent sockets → 0 5xx and clean 404s · still healthy after |
| `SP` spike | 5 | 150 req burst really is a burst · 0 5xx · p95 inside budget · **recovers to within 5× of calm** · event-loop lag small |
| `SK` soak | 7 | 480 req / 40 rounds, 0 5xx · last third ≤ 2× first third · heap end < 3× start · **no restart** · guard silent · series bounded · outbox inside cap |
| `PY` pyramid | 8 | base suites ≥ 162 · mutation suites ≥ 81 · all 12 levels map to a file that exists · canonical gates intact · smoke kept 480+ registrations · runner auto-discovers · this suite is discoverable · port is serialised |

---

## 3. Contract section (`CT1–CT10`)

These were verified empirically against a live server, not read out of a
spec. Each one is a shape a deployed client destructures.

| # | Case | Observed |
|---|---|---|
| CT1 | op with an undocumented key | **403** `{ok:false, code:'malformed_op', results:[{uid, ok:false, code:'malformed_op'}]}` — the whole batch is rejected |
| CT2 | op without `uid` | **403** `malformed_op` (replay safety depends on the uid) |
| CT3 | `t` outside `ins/upd/del` | **200** `{ok:true, results:[{ok:false, code:'role_denied'}]}` — fails closed **per op**; clients must read `results[]`, not branch on the status code |
| CT4 | `{ops:[]}` | **200** `{ok:true, results:[]}` — an empty batch is legal |
| CT5 | 501 ops | **413** `{ok:false, code:'batch_too_large'}` |
| CT6 | successful `ins` | result keys are **exactly** `ok, serverTime, uid` — adding an `id` here would silently change every client's write path |
| CT7 | REST list | `{ok, data:Array, pagination}` |
| CT8 | unknown authenticated route | **404** `{ok:false, code:'not_found'}` |
| CT9 | login response | `{ok, user:{id, full_name, role, school_id, phone_masked}}` — phone masked, **no** raw `phone`, **no** `national_id` |
| CT10 | `/api/auth/me` | `{id, full_name, role, school_id}` — no raw PII at all |

CT9 and CT10 are two checks, not one, because the two endpoints return
different shapes: `/api/auth/me` does **not** carry `phone_masked`. Asserting
the mask on `/api/auth/me` would have been a test that can never pass.

---

## 4. E2E section (`E2E1–E2E9`)

`tests/smoke.js` is the browser-level E2E (jsdom, 547 checks). This is the
**server-side** journey, which no single-module suite covered:

```
E2E1 identity        /api/auth/me returns the session's user
E2E2 health          /api/health is public and self-describing
E2E3 public report   /api/public-report needs no session
E2E4 write           one sync batch writes three records
E2E5 store           all three reached the store
E2E6 observability   payesh_sync_requests_total moved
E2E7 audit           the audit log grew
E2E8 replay          the whole batch replays as duplicate_ignored
E2E9 store again     still exactly three records
```

---

## 5. A fixture bug this round found and fixed

`IN7`, `IN10` and `IN11` **failed** after a fresh `npm install` + `node
server/seed.js`. The cause was not the code under test:

```
$ node server/seed.js
TypeError: Cannot read properties of undefined (reading 'teacher_id')
    at http://localhost/:1317:48
✅ store written: server/data/payesh.json  (28 KB)
   users: 15 | schools: 1 | classes: 9 | parent_links: 0
```

`server/seed.js` generates the demo world inside jsdom. When that generation
throws, it **still writes a partial store and exits 0** — 15 users, 1 school,
**0 students, 0 grades**. The suite read its `grades` fixture out of that
store and failed for a reason that had nothing to do with sync or
observability.

Two consequences, both acted on:

1. **`server/seed.js` has a real defect**: a jsdom failure produces a
   truncated store with exit status 0. `scripts/run-all-tests.sh` reseeds
   `payesh.json` when it is missing, so this can silently replace a good
   store with a partial one. `src/`, `dist/` and `build.js` are untouched by
   Wave 14/16/17, so this is pre-existing. **Reported, not fixed here** — it
   belongs to the client bundle, not to Wave 17.
2. **The suite no longer trusts the seed.** `ensureFixture()` now guarantees
   the rows it needs — a school, classes, subjects, 3 students, 3 grades with
   `version: 1`, 3 attendance rows — synthesising whatever is missing. The
   suite is deterministic whether `seed.js` produced 5.6 MB or 28 KB.

That is a strengthening, not a weakening: the checks that were silently
skipping now run.

---

## 6. Measured on this machine (sandbox, compact store, Node v22.22.3)

```
load : {"rps":1090,"p50":27.9,"p95":46.1,"p99":58,"max":60.6}
spike: {"burst_ms":105,"spike_p95":96.6,"recovered_p95":1.6,"calm_p95":1.6}
soak : {"rounds":40,"requests":480,"seconds":0.4,"p95":10.5,"heap_mb":19}
جمع: 73 موفق، 0 ناموفق از 73
```

Latency budgets are deliberately loose (p95 < 500 ms, p99 < 1500 ms) because
a slow CI machine must not fail them. The checks that carry weight are the
**exactness** ones — `CC2 +40`, `CC4 1/9/1`, `CC5 1 winner`, `LD5 delta === N`,
`ST1 413`, `CT6 exact key set` — because none of them depend on machine speed.

---

## 7. Mutation testing

`tests/wave17-testing-mutations.js` — **10/10**. Five mutations of the product
code the levels claim to protect, each killed:

| # | Mutation | Killed by |
|---|---|---|
| Z1 | `MAX_BATCH` 500 → 5000 (`index.js`) | `ST1` |
| Z2 | sync body limit → 512 MB (`index.js`) | `ST2` |
| Z3 | idempotency check → `false` (`sync.js`) | `IN5` / `CC4` |
| Z4 | `base_version` gate → `false` (`sync.js`) | `IN7` / `CC5` |
| Z5 | `payesh_http_requests_total` never incremented (`metrics.js`) | `LD5` / `IN10` / `CC2` |

Each mutation is reverted in a `finally`, the baseline is re-run afterwards,
and three checks assert no mutation marker survived.

---

## 8. Running it

```bash
node tests/wave17-testing.js              # 73 checks, ~10 s
node tests/wave17-testing-mutations.js    # 10 checks, ~3.5 min
bash scripts/run-all-tests.sh             # both are auto-discovered and serialised
```

No change to the runner was needed: base suites come from `ls tests/*.js`
minus `*-mutations.js` minus `server11-child.js`, mutation suites from
`ls tests/*-mutations.js`.
