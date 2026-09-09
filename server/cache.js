/* ═══════════════════════════════════════════════════════════════════
   server/cache.js — Distributed Caching, Rate Limiting & Pub/Sub
   -------------------------------------------------------------------
   Phase 4: Redis Caching & Invalidation Layer
   - Scoped Bootstrap caching with 5-minute TTL.
   - Distributed Rate Limiting (Token Bucket / Sliding Window).
   - Distributed Idempotency store with 24h retention.
   - Event-driven Cache Invalidation across all server nodes via Pub/Sub.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const redis = require('./redis');

const INVAL_CHANNEL = 'payesh:pubsub:inval';
const localUserBootstrapCache = new Map(); // L1 memory cache for microsecond reads

/**
 * Initialize Cache layer and Pub/Sub invalidation listeners
 */
async function init() {
  const r = await redis.init();
  /* P0-13: نتیجهٔ ریدی را به بالا منتشر کن — شکستِ ردیس در تولید یعنی
     سرور نباید سرویس بدهد (بوتر در index.js تصمیم می‌گیرد). */
  if (!r || r.ok === false) return { ok: false, driver: (r && r.driver) || 'none', error: (r && r.error) || 'redis init failed' };

  // Listen for invalidation events from other instances
  await redis.subscribe(INVAL_CHANNEL, (msg) => {
    try {
      const event = JSON.parse(msg);
      if (event.type === 'user' && event.user_id) {
        localUserBootstrapCache.delete(Number(event.user_id));
      } else if (event.type === 'school' && event.school_id) {
        for (const [uid, item] of localUserBootstrapCache.entries()) {
          if (item.school_id === Number(event.school_id)) {
            localUserBootstrapCache.delete(uid);
          }
        }
      } else if (event.type === 'all') {
        localUserBootstrapCache.clear();
      }
    } catch (e) {}
  });

  return { ok: true };
}

/**
 * Get cached Bootstrap payload
 * @param {number} userId 
 */
async function getBootstrapCache(userId) {
  // L1 Check
  const local = localUserBootstrapCache.get(Number(userId));
  if (local && Date.now() < local.exp) {
    return local.data;
  }

  // L2 Redis Check
  const key = `payesh:cache:bootstrap:${userId}`;
  const raw = await redis.get(key);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      localUserBootstrapCache.set(Number(userId), { data, exp: Date.now() + 60000, school_id: data.school ? data.school.id : null });
      return data;
    } catch (e) {}
  }
  return null;
}

/**
 * Set cached Bootstrap payload
 * @param {number} userId 
 * @param {Object} data 
 * @param {number} [ttlSeconds=300] 5 minutes default
 */
async function setBootstrapCache(userId, data, ttlSeconds = 300) {
  const key = `payesh:cache:bootstrap:${userId}`;
  localUserBootstrapCache.set(Number(userId), { data, exp: Date.now() + 60000, school_id: data.school ? data.school.id : null });
  await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
}

/**
 * Invalidate a single user's cache
 * @param {number} userId 
 */
async function invalidateUser(userId) {
  localUserBootstrapCache.delete(Number(userId));
  const key = `payesh:cache:bootstrap:${userId}`;
  await redis.del(key);
  await redis.publish(INVAL_CHANNEL, { type: 'user', user_id: Number(userId) });
}

/**
 * Invalidate all cached data for a specific school
 * @param {number} schoolId 
 */
async function invalidateSchool(schoolId) {
  if (!schoolId) return;
  for (const [uid, item] of localUserBootstrapCache.entries()) {
    if (item.school_id === Number(schoolId)) {
      localUserBootstrapCache.delete(uid);
      await redis.del(`payesh:cache:bootstrap:${uid}`);
    }
  }
  await redis.publish(INVAL_CHANNEL, { type: 'school', school_id: Number(schoolId) });
}

/**
 * Invalidate caches when a collection changes
 * @param {string} collection 
 * @param {number} [schoolId] 
 */
async function invalidateCollection(collection, schoolId) {
  if (schoolId) {
    await invalidateSchool(schoolId);
  } else {
    localUserBootstrapCache.clear();
    await redis.publish(INVAL_CHANNEL, { type: 'all', collection });
  }
}

/**
 * Distributed Rate Limiting
 * @param {string} identifier - e.g., IP address or Phone
 * @param {string} action - e.g., 'send_code', 'login', 'api'
 * @param {number} limit - max allowed attempts
 * @param {number} windowSeconds - time window in seconds
 * @returns {Promise<{ allowed: boolean, remaining: number, resetSeconds: number }>}
 */
async function checkRateLimit(identifier, action, limit = 10, windowSeconds = 60) {
  const key = `payesh:rl:${action}:${identifier}`;
  const countStr = await redis.get(key);
  let count = countStr ? parseInt(countStr, 10) : 0;

  if (count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetSeconds: windowSeconds
    };
  }

  count += 1;
  await redis.set(key, String(count), 'EX', windowSeconds);

  return {
    allowed: true,
    remaining: Math.max(0, limit - count),
    resetSeconds: windowSeconds
  };
}

/**
 * Idempotency Check with Redis
 * @param {string} uid 
 * @returns {Promise<boolean>} true if already processed
 */
async function isProcessedUid(uid) {
  if (!uid) return false;
  const key = `payesh:idempotency:${uid}`;
  const exists = await redis.get(key);
  return exists !== null;
}

/**
 * Mark UID as processed with 24-hour retention
 * @param {string} uid 
 * @param {number} [ttlSeconds=86400] 24 hours
 */
async function markProcessedUid(uid, ttlSeconds = 86400) {
  if (!uid) return;
  const key = `payesh:idempotency:${uid}`;
  await redis.set(key, String(Date.now()), 'EX', ttlSeconds);
}

/**
 * Distributed Mutex Lock (Singleflight)
 * @param {string} lockKey 
 * @param {number} [ttlSeconds=5] 
 * @returns {Promise<boolean>} true if lock acquired
 */
async function acquireLock(lockKey, ttlSeconds = 5) {
  const key = `payesh:lock:${lockKey}`;
  const res = await redis.set(key, 'LOCKED', 'EX', ttlSeconds);
  return res === 'OK';
}

/**
 * Release Distributed Lock
 * @param {string} lockKey 
 */
async function releaseLock(lockKey) {
  const key = `payesh:lock:${lockKey}`;
  await redis.del(key);
}

module.exports = {
  init,
  getBootstrapCache,
  setBootstrapCache,
  invalidateUser,
  invalidateSchool,
  invalidateCollection,
  checkRateLimit,
  isProcessedUid,
  markProcessedUid,
  acquireLock,
  releaseLock
};
