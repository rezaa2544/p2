# Wave 17 — Testing Pyramid

**Wave:** 17 — Testing Pyramid (Roadmap §20) · **Owner:** Arena 5
**Branch:** `arena/01a0867f-p2` · **Date:** 2026-09-09
**Status:** ✅ implemented in-CI (dependency-free) · 🟡 national-scale runs stay on the k6 harnesses, see §6

> **Addendum rule:** every level below is either an existing suite that already ran in CI, or
> new executable code in `tests/wave17-testing.js`. Nothing here is a checklist.
> `docs/PERFORMANCE_TESTING_PLAN.md` remains the *national-scale* plan (k6); this is the
> *in-CI* implementation record and it says plainly what is real and what is scaled down.

ROADMAP §20 lists twelve levels and closes with: **«تست‌های موجود باید حفظ شوند و ضعیف/حذف
نشوند.»** Wave 17 therefore adds suites; it does not edit, relax or delete any existing one —
`tests/wave17-testing.js` PY1–PY7 assert that mechanically on every run.

---

## 1. Gap analysis (before → after)

Counted with `ls tests/*.js` (what `scripts/run-all-tests.sh` actually discovers):

| Level | Before Wave 17 | After Wave 17 |
|---|---|---|
| **Unit** | ✅ 163 base suites (`tests/*.js`, minus `server11-child.js`) | unchanged — plus `tests/api/*` (7 suites) |
| **Integration** | 🟡 `tests/integration.js` (I1–I6, real server + jsdom) | ✅ + `IN1–IN11` against a real boot with the real 5.6 MB store |
| **Contract** | ✅ `tests/api/runner.js` + 7 `*.test.js` | unchanged (already real) |
| **E2E** | ✅ `tests/smoke.js` (481 registrations → **547** runtime checks) | unchanged; PY5 guards it against quiet weakening |
| **Security** | ✅ 6 suites (`security*.js`, `wave13-security.js`, `public-security.js`) | ✅ + `IN8/IN9` (unauth read refused, forged `by` rejected) |
| **Concurrency** | ❌ **no named suite** | ✅ `CC1–CC6` — lost updates, duplicate uid, single-winner race |
| **Load** | ❌ only k6 scenarios (not runnable in CI) | ✅ `LD1–LD6` — 400 req, rps + p50/p95/p99, exact metric accounting |
| **Stress** | ❌ none in CI | ✅ `ST1–ST6` — over-limit batch, >1 MB body, 200 open sockets, health after |
| **Spike** | ❌ only `spike-mehr-test.js` (k6) | ✅ `SP1–SP5` — 150 req burst, recovery vs calm baseline, event-loop lag |
| **Soak** | ❌ only `soak-24h-test.js` (k6, 24 h by design) | ✅ `SK1–SK7` — 40 rounds, latency drift, heap, restart, cardinality, outbox cap |
| **Chaos** | 🟡 `tests/performance/suites/chaos-redis-test.js` (k6) | 🟡 unchanged — see §6 |
| **Recovery** | ✅ Wave 16: `tests/wave16-dr.js` (D1–D12) + `wave16-dr-mutations.js` (Y1–Y8) | unchanged; PY3 requires it to exist |

**The gap that Wave 17 actually closes is Concurrency, Load, Stress, Spike and Soak** — five
levels that had no CI-runnable suite at all. Before Wave 17 the only proof of behaviour under
concurrent load was the k6 harnesses, and `command -v k6` on this machine returns nothing.

---

## 2. The new suite

```
tests/wave17-testing.js            54 checks   node tests/wave17-testing.js
tests/wave17-testing-mutations.js  10 checks   node tests/wave17-testing-mutations.js
```

`tests/wave17-testing.js` **boots a real server process** (`node server/index.js`) on port
**9041** (fallback 9042) with `PAYESH_STORE`/`PAYESH_AUDIT` in a temp dir, `PAYESH_DEMO_CODE=1`,
a `PAYESH_KEY` and a `PAYESH_METRICS_TOKEN`, then talks to it over real TCP. Port `90xx` is
already in `run-all-tests.sh`'s serialisation pattern, so the suite cannot race another
server-booting suite.

### 2.1 `compactStore()` — why the fixture is trimmed

The seeded `server/data/payesh.json` is **5.6 MB**. `persistStore` re-serialises the whole
store every 2 s, and that write blocks the event loop for long enough to poison every latency
number in the Load/Stress/Spike sections. `compactStore()` therefore trims every array to 20
rows and strips `__*` bookkeeping keys, keeping the *shape* (superadmin, school 1, grades,
attendance, users with `password`/`national_id`/`phone`) and dropping the *bulk*.

This is a real measurement caveat, not a shortcut: it means the latency figures below describe
a small store, and they are labelled as such. §6 states what national numbers would need.

### 2.2 Sections

| Section | Checks | What it proves |
|---|---|---|
| `P0` boot | `P0a–P0e` | process up · `/api/health` 200 · `/metrics` fail-closed without the token · exposition with the token · real session (`send-code` → `login` → cookie) |
| `IN` integration | `IN1–IN11` | cookie authenticates `/api/auth/me` · sync `ins` accepted · REST list in the same session · **write reached the store** · replay → `duplicate_ignored` and **no duplicate row** · stale `base_version` → preserved conflict · unauth read refused · forged `by` → whole batch 403 · sync counter + conflict counter moved |
| `CC` concurrency | `CC1–CC6` | 40 parallel requests succeed · `payesh_http_requests_total` moved by **exactly +40** (no lost update in the metrics path) · 20 parallel writes all land · 10 parallel copies of one uid → **1 created, 9 `duplicate_ignored`, 1 row on disk** · concurrent `upd` on one row → exactly 1 winner and 5 `conflict_preserved` · zero 5xx recorded |
| `LD` load | `LD1–LD6` | 400 req, 0 socket errors · measurable rps · p95/p99 inside budget · **the histogram accounted for every request exactly** · cardinality guard never fired |
| `ST` stress | `ST1–ST6` | 501-op batch → **413 `batch_too_large`, not 500** · >1 MB body → 413 · 200 concurrent sockets → 0 5xx and clean 404s · server still healthy after |
| `SP` spike | `SP1–SP5` | the burst really is a burst (all requests issued within ~110 ms) · 0 5xx · spike p95 inside budget · latency **recovers to within 5× of the calm baseline** · event-loop lag finite and small |
| `SK` soak | `SK1–SK7` | 480 req / 40 rounds, 0 5xx · latency of the last third ≤ 2× the first third (drift) · heap end < 3× start · **no restart** (uptime monotonic) · cardinality guard never fired · route/method/code series stayed bounded (13) · outbox inside its 1000 cap |
| `PY` pyramid integrity | `PY1–PY8` | base suites ≥ 162 · mutation suites ≥ 81 · all 12 levels map to a file that exists · canonical gates intact · smoke kept 480+ registrations · runner still auto-discovers · this suite is discoverable · this suite uses a serialised port |

### 2.3 Measured on this machine (sandbox, compact store, Node v22.22.3)

```
load : {"rps":1015,"p50":25.9,"p95":64.7,"p99":76.8,"max":79.7}
spike: {"burst_ms":111,"spike_p95":104.4,"recovered_p95":1.2,"calm_p95":0.7}
soak : {"rounds":40,"requests":480,"seconds":0.4,"p95":14.2,"heap_mb":22}
جمع: 54 موفق، 0 ناموفق از 54
```

These are **sandbox numbers on a trimmed store** and are asserted only against loose budgets
(p95 < 500 ms, p99 < 1500 ms, spike p95 < 1000 ms). The exactness assertions — CC2 `+40`,
CC4 `1 created / 9 duplicates / 1 row`, CC5 `1 winner`, LD5 `delta === N`, ST1 `413` — are the
ones that carry weight, because they do not depend on machine speed.

---

## 3. Mutation testing of the pyramid

A test suite is only worth as much as the regressions it catches, so
`tests/wave17-testing-mutations.js` mutates the **product** code the new levels claim to
protect and requires the suite to fail:

| # | Mutation | Killed by |
|---|---|---|
| Z1 | `MAX_BATCH` 500 → 5000 (`server/index.js`) | `ST1` — oversized batch accepted |
| Z2 | sync body limit 1 MB → 512 MB (`server/index.js`) | `ST2` — huge payload accepted |
| Z3 | idempotency check forced to `false` (`server/sync.js`) | `IN5` / `CC4` — duplicate uid re-applied |
| Z4 | `base_version` gate forced to `false` (`server/sync.js`) | `IN7` / `CC5` — concurrent write clobbers |
| Z5 | `payesh_http_requests_total` never incremented (`server/metrics.js`) | `LD5` / `IN10` / `CC2` — accounting blind |

Result: **10/10** (5 mutations killed + baseline green before and after + 3 no-residue checks).
Each mutation is reverted in a `finally`, and the suite re-runs the baseline afterwards to prove
the tree is clean — this matters because it edits `server/index.js`, `server/sync.js` and
`server/metrics.js` in place.

---

## 4. Design rules carried into these tests

1. **Never assert on machine speed.** Every threshold is either a loose sandbox budget or an
   exactness assertion. A slow CI machine may fail p95; it must never fail `delta === N`.
2. **Assert against the persisted store, not the response.** `IN4`/`IN6`/`CC4` re-read
   `PAYESH_STORE` from disk. The sync `ins` result is `{uid, ok, serverTime}` — it carries **no
   id** — and a duplicate is reported as `{ok: true, code: 'duplicate_ignored'}`, so counting
   `ok === true` counts creations *and* duplicates. Both traps are commented at the assertion.
3. **`/metrics` is a counted route.** Any `payesh_http_requests_total` total that brackets a
   scrape is off by exactly one unless `route !== '/metrics'`. `LD5` filters it and then
   asserts an exact equality — the strictest check in the suite.
4. **Fail-closed is part of the test, not a precondition.** `P0c` requires `/metrics` to answer
   404 without the token before `P0d` is allowed to succeed with it.
5. **Clean up after yourself.** temp store/audit dir removed in `finally`; the child server is
   killed by captured PID (never `pkill -f`, which kills the calling shell).

---

## 5. Pyramid shape

```
        E2E            tests/smoke.js                    547 checks, 1 suite
       Contract        tests/api/*.test.js               7 suites
      Integration      tests/integration.js + IN1–IN11   2 sources
     Security/Chaos    6 security suites · k6 chaos
    Concurrency/Load   CC + LD + ST + SP + SK            1 suite, 33 checks
   ────────────────────────────────────────────────────────────────────
   Unit + mutation     163 base suites · 82 mutation suites
```

Wide at the bottom (163 + 82), narrow at the top (1 E2E suite) — the shape the roadmap asks
for, and PY1/PY2 fail the build if the base ever shrinks.

---

## 6. What this does **not** prove

- **No national capacity number.** 400 requests against a 20-row store in a sandbox is not a
  capacity measurement for 110 000 schools. `HANDOFF.md:218` already records the same
  limitation for Wave 12's measurements: *"نتیجه ظرفیت ملی نیست و باید در Wave 18 تکرار شود."*
- **The k6 harnesses are still the real instruments** and still cannot run here:
  `tests/performance/suites/{saturation,spike-mehr,soak-24h,chaos-redis}-test.js` are ESM k6
  scripts, and `command -v k6` on this machine returns nothing. `soak-24h-test.js` defaults to
  `SOAK_DURATION=24h` — it is out of CI scope by design, not by omission.
- **Chaos is not covered in CI.** Killing Redis/Postgres mid-request needs the real
  dependencies; Wave 17 does not fake them.
- **The soak is 0.4 s, not 24 h.** It proves the *shape* of the assertions (drift, heap growth,
  restart detection, cardinality bound) so that a real 24 h run can reuse them; it does not
  prove the absence of a slow leak.
- **No production traffic profile.** The route mix is 4 hand-picked endpoints, not a measured
  national distribution.

Wave 18 owns the real run; this wave makes sure that when it happens there is a suite that
already knows how to read the answer.

---

## 7. Running it

```bash
node tests/wave17-testing.js              # 54 checks, ~10 s
node tests/wave17-testing-mutations.js    # 10 checks, ~3.5 min (7 full suite runs)
bash scripts/run-all-tests.sh             # both are auto-discovered and serialised
```

Both suites are picked up by `scripts/run-all-tests.sh` with no change to the runner: base
suites come from `ls tests/*.js` minus `*-mutations.js` minus `server11-child.js`, mutation
suites from `ls tests/*-mutations.js`.
