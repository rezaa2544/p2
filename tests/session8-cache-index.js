#!/usr/bin/env node
/* Session 8 / Wave 9 regression: cache school indexes must be bounded and purged. */
'use strict';

const assert = require('assert');
const cache = require('../server/cache');
const redis = require('../server/redis');

const payload = (id, school) => ({ ok: true, user: { id }, school: { id: school } });

(async () => {
  cache.__l1ForTests().clear();
  await cache.setBootstrapCache(1, payload(1, 77), 300);
  const indexKey = 'payesh:cache:school:77';
  const before = await redis.sMembers(indexKey);
  assert.ok(before.includes('1'), 'school index records cached user');
  const ttl = await redis.ttl(indexKey);
  assert.ok(ttl > 0, 'school index has a finite TTL');

  cache.__l1ForTests().clear();
  await cache.invalidateSchool(77);
  const after = await redis.sMembers(indexKey);
  assert.ok(!after.includes('1'), 'school invalidation removes index membership');
  assert.strictEqual(await redis.ttl(indexKey), -2, 'empty school index is deleted');
  assert.strictEqual(await redis.get('payesh:cache:bootstrap:1'), null, 'pure L2 entry is removed');

  for (let id = 10; id < 110; id++) await cache.setBootstrapCache(id, payload(id, 78), 300);
  assert.strictEqual((await redis.sMembers('payesh:cache:school:78')).length, 100);
  await cache.invalidateSchool(78);
  assert.strictEqual((await redis.sMembers('payesh:cache:school:78')).length, 0, 'bulk purge leaves no stale members');

  console.log('session8-cache-index: 6/6 checks ✅');
})().catch((err) => { console.error(err); process.exit(1); });
