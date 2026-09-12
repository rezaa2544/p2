# Bug Hunt Session 8 / Wave 9 — Handoff

**Date:** 2026-09-11
**Branch:** `feat/bughunt-session8-wave9`
**Status:** Performance fixes complete; delivery gates/documentation in progress
**Code-fix HEAD:** `685f935`
**Author:** rezaa2544

---

## Completed in this session

- Eight independent performance/resource fixes were completed with red regression, fix, mutation test, and separate Conventional Commit: `062fbe3`, `324eec8`, `8f45f54`, `d4fc168`, `6035028`, `dd2d7eb`, `6aeb5ba`, `e54b998`.
- Wave 8 outbox mutation-fixture drift was repaired in `685f935`; final `wave8-outbox` is 14/14 and its mutations are 5/5.
- Fast gates are green: smoke 547/547, authz exit 0, secret scan 11/11, build check pass, Wave 9 39/39.
- Session 8 regressions total 38/38 checks across the eight suites; all 16 Session 8 mutants were killed and every baseline was restored green.
- Detailed evidence: `docs/WAVE9_SESSION8_PERFORMANCE.md`; cumulative report: `docs/BUG_HUNT_REPORT.md`.

## Explicit limitations — do not report as green

- `tests/wave8-deep-audit.js` is missing from the repository; running it produced `MODULE_NOT_FOUND`.
- `scripts/run-all-tests.sh` did not reach a final total during the clean attempt because stale/overlapping runner processes were stopped after the tool window. Partial legacy reds remain unaccepted; no full-suite green claim is made.
- Local Node is v20.20.2 while the package engine requests >=22; the fast gates run but retain that environment warning.
- Ruflo is not installed in the sandbox. The requested key `bug_hunt_session8` is pending; no fabricated memory-write result exists.

## Delivery status

- Fast gates were repeated after the documentation commit: smoke 547/547, authz exit 0, secret scan 11/11, build check pass, Wave 8 outbox 14/14 + mutations 5/5, and Wave 9 39/39.
- With temporary authentication, `feat/bughunt-session8-wave9` was pushed successfully; the permanent remote remains credential-free.
- PR created: `https://github.com/rezaa2544/p2/pull/75` with title `fix: bug hunt session 8 (wave 9 performance)`.
- Fallback bundle remains verified at `/home/user/bandle/bug-hunt-session8-wave9.bundle`; 24 credential-free patches are in `/home/user/bandle/patches/`.
- Ruflo registration `bug_hunt_session8` is pending because `ruflo` is not installed; no fabricated memory result is recorded.

---

# Historical handoff — Wave 19 Chaos Residuals

**Date:** 2026-09-11
**Branch:** feat/wave19-residuals
**Status:** In Progress
**Author:** rezaa2544

---

## Session Summary

Wave 19 Chaos Residuals session: re-running C1-C6 checks with Redis 7.4.2, adding network-level chaos (AZ partition) and WAL-disk-full scenarios, running all tests, and creating PR.

## Infrastructure Limitations

- npm install times out: jsdom, ruflo not installed
- bash not available: Required for tools/chaos-test.sh and wave19-chaos.js C1-C3
- ruflo@3.39.2 does not exist on npm registry
- Linux-only tools: tc, netem, fallocate unavailable on Windows
- PostgreSQL/Redis not running as embedded instances

## Tests Status

| Test | Result | Notes |
|------|--------|-------|
| node tests/smoke.js | SKIPPED | jsdom not installed |
| node tools/check-authz.js | PASS | 385 actions, all authorized |
| node tests/secret-scan.js | 10/11 | 4 hits are false positives |
| node build.js --check | PASS | Bit-for-bit match |
| node tests/wave19-chaos.js | PARTIAL | C1-C3 fail (no bash) |
| node tests/wave16-dr.js | 73/75 | 2 pre-existing failures |

## Scenarios (Documented, DRY_RUN)

1. kill-api (SIGKILL)
2. redis-down
3. pg-down
4. net-latency
5. disk-full
6. AZ partition (added)
7. WAL-disk-full (added)

## Commits

1. feat: add Wave 19 chaos live report and HANDOFF.md
2. feat: add S6 AZ partition + S7 WAL-disk-full to Wave 19 plan
3. feat: link chaos playbooks in INCIDENT_RESPONSE.md

## PR

See gh pr create output below.

## Next Steps

1. Install dependencies on a machine with better network
2. Set up PostgreSQL 16 + Redis 7.4.2 via embedded-postgres
3. Install Git Bash/WSL for bash compatibility
4. Execute --live scenarios
5. Install ruflo from source or alternative registry
6. Run network-level chaos and WAL-disk-full drills on Linux

## Incident Reference

- incident: wave19-chaos-residuals
- See docs/INCIDENT_RESPONSE.md for process
- See docs/WAVE19_CHAOS_LIVE_REPORT.md for full report

---

# Handoff — Wave 18 National Load Testing

**Date:** 2026-09-12
**Branch:** `feat/wave18-national-load-test`
**Status:** Staging run complete; national capacity **not** measurable on this hardware
**Full report:** `docs/WAVE18_LOAD_TEST_REPORT.md`

---

## What was actually run

Five k6 scenarios (k6 v2.2.0) against a real staging stack — PostgreSQL 17 (90
tables), the Node API, and a regenerated `scale=0.001` national dataset:

| scenario | rps | p95 | HTTP fail | writes | write_errors |
|---|---:|---:|---:|---:|---:|
| load   | 106.3 | 248.8 ms | 0% | 533 | 0% |
| peak   | 20.3  | 147,345 ms | **19.07%** | 58 | 0% |
| stress | 357.3 | 1,417.9 ms | 0% | 8,119 | 0% |
| spike  | 236.9 | 1,596.6 ms | 0% | 855 | 0% |
| soak   | 81.9  | 270.8 ms | 0% | 467 | 0% |

Raw exports are committed at `tests/performance/results/w18-*.json` and are
reproducible via `tools/wave18-summarize-results.py`.

## Failure found — peak killed the server (OOM)

At a 60 rps target the API process was killed by the OOM killer
(`anon-rss ≈ 911 MB`). Symptoms observed in that session:

- `dmesg`: `Out of memory: Killed process (node) total-vm:13211364kB, anon-rss:911480kB`
- `api.log`: `[DB] Query execution error: timeout exceeded when trying to connect` (x9)
- k6: `Error: logi…` — `setup()` login failed because the API was already dead

**Provenance warning:** the sandbox rebooted afterwards (uptime ~101 s), so the
`dmesg` ring buffer and `/var/tmp` are gone. Those three lines were read and
recorded during the run but **cannot be re-verified today**. What remains
independently verifiable is the committed k6 JSON. Re-running peak requires
rebuilding staging via `infra/wave18-loadtest/staging-bootstrap.sh`.

## Explicit limitations — do not report as green

- **National capacity (20,000 rps) was not measured and cannot be on this box.**
  2 vCPU / 1984 MB, with the load generator, the API and PostgreSQL all sharing
  those 2 cores. Failure appeared around 60 rps — three orders of magnitude
  below target. The numbers above validate the harness, not the system.
- `write_errors = 0%` in **peak is not evidence of write-path resilience**: only
  58 writes reached the server before it died (vs 8,119 in stress).
- A prior interim report quoted **1099 as "interrupted iterations"**. That was
  wrong: 1099 is `vus_max`. The correct metric is `dropped_iterations = 2346`.
  The console figure itself is not persisted in the export.
- The dataset generator still emits **no `enrollments`** (0 rows) even though
  `server/policy.js` requires one for every teacher-scoped write. The loader
  derives them from `attendance × classes` as a workaround; the generator itself
  is still unfixed.
- Generator-vs-plan dimension divergence (item 2 of `docs/DOCS_CONSISTENCY_REPORT.md`)
  remains open.

## Two false greens fixed in the harness

1. `SCENARIO=peak` built **no scenario at all** — every condition was false, so
   `options.scenarios` was `{}` and k6 ran `setup()` once. It reported
   "40.3 rps, 1 write, all thresholds green" while measuring nothing. Proof:
   `k6 inspect -e SCENARIO=peak` → `"scenarios": {}`. Fixed by adding
   `peak_standalone` plus a guard that rejects unknown `SCENARIO` values.
2. `spike` never executed: `preAllocatedVUs=200` was fixed while
   `maxVUs = SPIKE_VUS * 2`, so any `SPIKE_VUS < 100` aborted with
   `maxVUs can't be less than preAllocatedVUs` (exit 104).

## Tests status (final, on the committed tree)

- `node tests/wave18-load-test.js` — 38/38, exit 0
- `node tests/secret-scan.js` — **12/12** (was 11; new negative control), exit 0
- `node tests/check-authz.js` — 6 checks, all green, exit 0
- `node build.js --check` — 394 actions (199 writers), full match, exit 0
- `node tests/smoke.js` — 547/547, exit 0

`secret-scan` initially failed 10 green / 1 red on six sha256 values in
`data/national/scale-0.001/stats.json`. Those are the dataset's own file
checksums (all 6 verified against real file hashes; the generator is
deterministic), and `T7d` of `tests/wave18-load-test.js` requires that field.
The allowance is narrow (`"<name>.csv": "` only), the logic now lives in a named
`hexAllowed()` shared by the scan loop and a 14-case negative control, and a
mutation check confirms the control exercises the same code path.

## Next steps

1. Re-run peak/stress on real staging with separate hosts for generator and DB
   before quoting any capacity number.
2. Fix `enrollments` in `tools/generate-national-dataset.js` itself.
3. Profile API memory growth under load (`anon-rss ≈ 911 MB` at OOM looks low
   for the target load, but this hardware cannot yield a trustworthy answer).
