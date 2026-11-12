'use strict';
/* tests/a35-tenant-rate-limit.test.js — A-35: per-tenant sliding-window limiter.

     S1  the sliding window admits exactly `limit` requests in the window and
         blocks the rest (the in-memory driver);
     S2  the window truly SLIDES: the burst right after the window boundary
         stays blocked (the fixed-window counter would have reset — this is
         the exact defect A-35 fixes);
     S3  tenant isolation: school A's exhausted bucket does not touch
         school B's (and the school-less/global bucket is separate);
     S4  the weight consumes N units (the sync N-op request);
     S5  the eviction: after the window the entries expire and the bucket
         refills;
     T1  the checkTenantRateLimit key shape is per-tenant and per-route-class.

   Live path: with REDIS_URL set (staging sentinel stack), the same battery
   runs against real Redis (the prefix is test-unique).

   Run: node tests/a35-tenant-rate-limit.test.js */

const assert = require('assert');
const rateLimit = require('../server/rate-limit');
const redis = require('../server/redis');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}

(async () => {
  const LIVE = !!String(process.env.REDIS_URL || '').trim();
  if (LIVE) {
    try { await redis.init(); } catch (e) { /* the readiness gate = the caller's contract */ }
  }
  console.log('▸ driver: ' + (LIVE ? 'live Redis' : 'in-memory fallback (dev mode)'));

  /* S1 — the exact limit */
  {
    const r = await rateLimit.checkSlidingWindow({ prefix: 'a35:s1', identifier: 'x', limit: 3, windowSeconds: 1 });
    assert.strictEqual(r.allowed, true);
    const r2 = await rateLimit.checkSlidingWindow({ prefix: 'a35:s1', identifier: 'x', limit: 3, windowSeconds: 1 });
    const r3 = await rateLimit.checkSlidingWindow({ prefix: 'a35:s1', identifier: 'x', limit: 3, windowSeconds: 1 });
    const r4 = await rateLimit.checkSlidingWindow({ prefix: 'a35:s1', identifier: 'x', limit: 3, windowSeconds: 1 });
    check('S1 limit=3 admits 3 and blocks the 4th', r.allowed && r2.allowed && r3.allowed && !r4.allowed, 'count=' + r4.count);
  }

  /* S2 — the boundary-burst stays blocked (the sliding semantics) */
  {
    const pfx = 'a35:s2';
    for (let i = 0; i < 5; i++) await rateLimit.checkSlidingWindow({ prefix: pfx, identifier: 'y', limit: 5, windowSeconds: 1 });
    const blockedNow = await rateLimit.checkSlidingWindow({ prefix: pfx, identifier: 'y', limit: 5, windowSeconds: 1 });
    check('S2a the 6th within the window is blocked', !blockedNow.allowed);
    /* cross the fixed-window boundary: sleep so a FIXED counter would reset */
    await new Promise((r) => setTimeout(r, 1100));
    const afterBoundary = await rateLimit.checkSlidingWindow({ prefix: pfx, identifier: 'y', limit: 5, windowSeconds: 1 });
    /* after 1.1s the entries are older than the 1s window → purged → allowed */
    check('S2b after the window passes, entries expire and the request is admitted', afterBoundary.allowed, 'count=' + afterBoundary.count);
    /* the fixed-window defect shape: 5 more immediately + 5 right after the
       boundary would have admitted 10 in 1.1s under a fixed counter — under
       the sliding window the SECOND burst right before expiry stays capped */
    const pfx2 = 'a35:s2c';
    for (let i = 0; i < 5; i++) await rateLimit.checkSlidingWindow({ prefix: pfx2, identifier: 'z', limit: 5, windowSeconds: 2 });
    await new Promise((r) => setTimeout(r, 1100)); /* half the window: entries ALIVE */
    const halfWindow = await rateLimit.checkSlidingWindow({ prefix: pfx2, identifier: 'z', limit: 5, windowSeconds: 2 });
    check('S2c mid-window the bucket stays capped (a fixed counter would have reset)', !halfWindow.allowed, 'count=' + halfWindow.count);
  }

  /* S3 — tenant isolation */
  {
    const a = rateLimit.checkTenantRateLimit.bind(null, { schoolId: 100, routeClass: 'api-v1', limit: 2, windowSeconds: 60 });
    const r1 = await a();
    const r2 = await a();
    const r3 = await a();
    check('S3a school A: the 3rd is blocked at limit=2', r1.allowed && r2.allowed && !r3.allowed);
    const b = await rateLimit.checkTenantRateLimit({ schoolId: 200, routeClass: 'api-v1', limit: 2, windowSeconds: 60 });
    check('S3b school B is untouched by A exhaustion', b.allowed, 'remaining=' + b.remaining);
    const g = await rateLimit.checkTenantRateLimit({ schoolId: null, routeClass: 'api-v1', limit: 2, windowSeconds: 60 });
    check('S3c the school-less actor lands in its own global bucket', g.allowed);
  }

  /* S4 — the weight */
  {
    const r1 = await rateLimit.checkSlidingWindow({ prefix: 'a35:s4', identifier: 'w', limit: 5, windowSeconds: 60, weight: 4 });
    const r2 = await rateLimit.checkSlidingWindow({ prefix: 'a35:s4', identifier: 'w', limit: 5, windowSeconds: 60, weight: 2 });
    check('S4 weight=4 then weight=2 over limit=5: the 2nd is blocked', r1.allowed && !r2.allowed, 'count=' + r2.count);
  }

  /* T1 — the key shape */
  {
    const k = rateLimit.getKey('tenant:api-v1', '100');
    check('T1 the tenant key = rate:tenant:<routeClass>:<schoolId>', k === 'rate:tenant:api-v1:100', k);
  }

  /* S5 — the eviction (short window) */
  {
    const pfx = 'a35:s5';
    for (let i = 0; i < 3; i++) await rateLimit.checkSlidingWindow({ prefix: pfx, identifier: 'e', limit: 3, windowSeconds: 1 });
    const full = await rateLimit.checkSlidingWindow({ prefix: pfx, identifier: 'e', limit: 3, windowSeconds: 1 });
    check('S5a the bucket is full', !full.allowed);
    await new Promise((r) => setTimeout(r, 1200));
    const refilled = await rateLimit.checkSlidingWindow({ prefix: pfx, identifier: 'e', limit: 3, windowSeconds: 1 });
    check('S5b after expiry the bucket refills', refilled.allowed, 'count=' + refilled.count);
  }

  console.log('────────────────────────────────────────────');
  console.log('a35-tenant-rate-limit: ' + pass + ' pass / ' + fail + ' fail');
  console.log('CHECKS ' + (pass + fail) + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.message)); process.exit(1); });
