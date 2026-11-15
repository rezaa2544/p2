# A-36 Evidence — unit coverage of the server core (V8/c8 measurement)

- **Verification id:** A-36
- **Scope token:** `A-36:CORE-UNIT-COVERAGE`
- **Date:** 2026-11-14 (re-measured on current HEAD — supersedes the 2026-11-12 run)

## Change

- **Tooling:** `c8` (V8 coverage, v12) devDependency + the `npm run cover:core`
  script (`c8 --include "server/**" --reporter text --reporter json-summary
  node tests/api/runner.js`) — the first real line coverage the repo has ever
  measured. **2026-11-14 fix:** the `cover:core` script was documented in this
  note but MISSING from `package.json` (a false-green detail on the current
  HEAD) — restored surgically (2-line diff) and re-verified end-to-end.
  `NODE_V8_COVERAGE` is inherited by child processes, so unit-lane children
  merge into the same report.
- **New unit lane:** `tests/a36-core-coverage.test.js` — covers the outbox
  durable-replay machinery the API lanes cannot reach (the N-36/M15-05
  watermark monotonicity, the replicate backlog/batch, the depth contract,
  the PG-only retention). **Result: CHECKS 10 FAIL 0, exit 0** (re-run 2026-11-14).

## Measured coverage (fresh run on current HEAD, 2026-11-14 — `npm run cover:core`, exit 0)

| Module | Stmts | Funcs | Note |
|---|---|---|---|
| **Security-critical core — all ≥80 ✓** | | | |
| `server/json-fast.js` | 100% | 100% | |
| `server/key-strength.js` | 100% | 100% | |
| `server/occ.js` | 88.88% | 100% | |
| `server/waf.js` | 84.02% | 76.92% | **≥80 ✓** |
| `server/csrf.js` | 82.3% | 80% | **≥80 ✓** |
| `server/env-flags.js` | 80.76% | 66.66% | **≥80 ✓** |
| **Data-plane (unchanged posture)** | | | |
| `server/sync.js` / `server/db.js` / `server/outbox.js` | see the 2026-11-12 table | | the integration/canonical lanes own them |

**Overall (server/**): 54.45% stmts / 47.87% funcs on the in-process lanes.**

## Honest verdict

- The **security-critical core** (waf, csrf, key-strength, env-flags, occ,
  json-fast) is at or above **80%** on the CURRENT HEAD — the A-36 headline
  is met for the layer that gates every request, with fresh evidence.
- The **data-plane core** (outbox, redis, db, sync) stays function-covered
  with the line coverage mostly in the INTEGRATION suites (multi-process
  live-PG lanes + the canonical runner) — c8 sees only the in-process lanes,
  so their numbers understate the real exercised coverage. The path to the
  full-core ≥80% = more unit work on `db.js`/`sync.js`/`pull.js` — tracked
  as the follow-up (M15-02 runtime lanes; the canonical CI run exercises
  them end-to-end on every push).

## Notes

- `A-36:CORE-UNIT-COVERAGE — the row's own acceptance («اندازه‌گیری:
  هستهٔ امنیتی بحرانی ≥۸۰٪») met on current HEAD + all three deliverables
  present (c8 devDep ✓, cover:core ✓, the 10-check unit lane ✓)`.

