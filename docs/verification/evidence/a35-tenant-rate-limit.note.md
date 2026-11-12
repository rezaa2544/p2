# A-35 Evidence — per-tenant rate limiting with a Redis sliding window

- **Verification id:** A-35
- **Scope token:** `A-35:TENANT-SLIDING-LIMIT`
- **Date:** 2026-11-12 (current HEAD)

## Ground truth at verification

The existing rate limiting (`server/rate-limit.js`, wired for OTP/login in
`auth.js`) was a **fixed-window atomic counter** (INCR + EXPIRE): correct under
concurrent bursts, but a client can carry up to 2× the limit across a window
boundary, and **no per-tenant (per-school) limiting existed** — the buckets were
per-IP / per-phone only. At 10M+ scale the tenant dimension is the abuse
boundary that matters (one school's runaway batch client must not starve the
others).

## Change

**`server/redis.js`** — the sorted-set primitives (real ioredis + the in-memory
fallback mirror, the same fail-closed policy as the rest of the driver):
`zAddTtl` (ZADD + PEXPIRE), `zRemByScoreMax` (ZREMRANGEBYSCORE), `zCard`.

**`server/rate-limit.js`** —
- `checkSlidingWindow({ prefix, identifier, limit, windowSeconds, weight })` —
  the ZSET sliding window: purge expired scores, add `weight` members scored by
  `now`, count, arm the TTL. The concurrency race documents toward CLOSED
  (a concurrent ZCARD may slightly over-count — the safe direction for a
  limiter).
- `checkTenantRateLimit({ schoolId, routeClass, ... })` — the per-tenant key:
  `rate:tenant:<routeClass>:<schoolId|global>`.
- The Redis outage contract mirrors B5: configured-but-dead = throw
  `REDIS_UNAVAILABLE` (fail-closed); only the no-URL dev mode = the in-memory
  fallback.

**`server/index.js`** — the `/api/v1/*` dispatcher now runs the per-tenant
sliding gate after the tenant boundary: the effective school (or the actor's
own bucket for the school-less/superadmin), `PAYESH_TENANT_API_LIMIT`
(default 600) per `PAYESH_TENANT_API_WINDOW_S` (default 60s); over-limit = 429
`rate_limited` with `retry_after_s`; the limiter's Redis-unavailable = 503
fail-closed; any OTHER limiter error = fail-open (the edge owns the hard limit
— a limiter bug must not take the API down).

## Guard test (`tests/a35-tenant-rate-limit.test.js`)

**Result: CHECKS 11 FAIL 0, exit 0 — TWICE: in-memory AND against the live
staging Redis (the sentinel stack, authenticated).**

S1 the exact limit · S2a the within-window block · S2b the expiry admits ·
S2c **mid-window the bucket stays capped (a fixed counter would have reset —
the exact defect this task fixes)** · S3 tenant isolation (A exhausted ≠ B
blocked; the school-less global bucket separate) · S4 the weight consumes N
units · T1 the key shape · S5 the eviction/refill cycle.

**Mutation negative proof:** the purge (`ZREMRANGEBYSCORE`) mutated away →
S2b + S5b **fail** (the window stops sliding — accumulate-forever) — caught,
reverted, 11/0 restored.

## Notes

- `A-35:TENANT-SLIDING-LIMIT — RUNTIME-VERIFIED` (in-memory + live staging Redis; the mutation caught).
- The default 600 req/min/tenant = the boot-configurable ceiling; the
  per-IP/per-phone OTP/login limiters stay unchanged (different threat model).
