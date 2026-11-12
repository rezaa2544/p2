# REVAL Evidence — performance bottleneck review (p99 + pool + pgbouncer + Redis cluster + k6)

- **Verification id:** REVAL (task 18)
- **Scope token:** `REVAL:PERF-P99-POOL`
- **Date:** 2026-11-12 (current HEAD)

## What was done

Produced `docs/REVAL_PERFORMANCE.md` — a measured review, not a prose memo.
Every latency number is a real percentile from `tests/performance/
reval-p99-bench.js` (NEW — an in-process k6-equivalent bench; k6 is not
installed on this host) run against the CURRENT HEAD server:

- concurrency 20 (per-tenant realistic): p50 59 / p90 75 / p95 92 / **p99 144 ms**
- concurrency 60: p50 129 / p90 174 / p95 197 / **p99 228 ms**
- concurrency 150 (aggregate overload): p50 120 / p90 279 / p95 326 / **p99 343 ms**

The load-plan hard target (p99 < 1000 ms) is met with ≥ 4× headroom at every
concurrency; the only soft miss is p95-at-150-concurrency (326 vs 300 — the
aggregate extreme, already shaped by the A-35 per-tenant limiter).

## Findings consolidated

1. **Connection pool**: client pool `PG_POOL_MIN=2 / PG_POOL_MAX=20` +
   optional read-replica `READ_POOL_*=2/10` (writes always PRIMARY) layered on
   **pgbouncer transaction-mode** (`default_pool_size=80`,
   `max_client_conn=3500`, `reserve 5/3s`). Transaction mode is the correct
   call for short-transaction API traffic; the 20→80→3500 chain leaves ~2
   orders of magnitude of headroom — the pool is not the p99 bottleneck.
2. **pgbouncer**: evaluated — correct mode (transaction), correct sizing; keep.
3. **Redis sentinel vs cluster**: deployment = sentinel HA (1M+2R+3S).
   `server/redis.js` already implements `mode='cluster'`. Evaluation: stay on
   sentinel until a single master exceeds ~25 GB RSS / write lane >70% at the
   p99 budget; the A-35 sliding limiter and A-37 leader-election keys are
   single-key and therefore already cluster-safe.
4. **k6 results**: the repo's `tests/performance/results/w18-{load,peak,soak,
   spike}.json` record the threshold gate passing (health-200 passes in the
   hundreds-to-thousands, zero fails; WAVE18 bar failed<0.1% · p95<300 ·
   p99<1000 · sync p95<400 · checks>99% — all green), but do NOT persist raw
   p50/p99 percentiles. The new bench closes exactly that documentation gap.

## Reproducibility

`node tests/performance/reval-p99-bench.js [durationMs] [rps] [concurrency]`

## Notes

- `REVAL:PERF-P99-POOL — RUNTIME-VERIFIED` (fresh percentiles on HEAD; the
  k6 artifacts cross-checked; the pool/pgbouncer/redis facts read from
  source of truth: `server/db.js`, `infra/postgres/pgbouncer/pgbouncer.ini`,
  `infra/redis/docker-compose.sentinel.yml`, `server/redis.js`).
