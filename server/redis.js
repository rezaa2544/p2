/* ═══════════════════════════════════════════════════════════════════
   server/redis.js — High-Performance Distributed Redis Client & Fallback
   -------------------------------------------------------------------
   Phase 4: Redis Caching & Multi-Instance Layer
   - Connects to standalone or clustered Redis instances via ioredis.
   - Dual-mode architecture: Native Redis with automated reconnect,
     or zero-dependency in-memory Fallback if REDIS_URL is absent or unreachable.
   - Methods: get, set, del, publish, subscribe, ping, isRedis, close.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

let Redis = null;
try {
  Redis = require('ioredis');
} catch (e) {
  // ioredis is optional
}

let client = null;
let subClient = null;
let isRedisActive = false;
let memCache = new Map();
let memExpiry = new Map();
let subscriptions = new Map(); // channel -> Set of callbacks

const REDIS_URL = process.env.REDIS_URL || null;
/* P0-13: در تولید، فال‌بک به حافظهٔ محلی ممنوع است — هر نمونه باید به
   همان کشِ توزیع‌شده وصل باشد؛ وگرنه حالت بین نمونه‌ها واگرا می‌شود
   (قفل/نرخ/کش هرکدام یک‌جا). بنابراین نبودِ ردیس در تولید = شکستِ ریدی. */
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Clean expired keys from in-memory fallback
 */
function cleanExpiredMem() {
  const now = Date.now();
  for (const [k, exp] of memExpiry.entries()) {
    if (now >= exp) {
      memCache.delete(k);
      memExpiry.delete(k);
    }
  }
}
setInterval(cleanExpiredMem, 10000).unref();

/**
 * Initialize Redis connection
 */
async function init() {
  if (!REDIS_URL || !Redis) {
    isRedisActive = false;
    if (IS_PRODUCTION) {
      /* P0-13: شکستِ ریدی به‌جای فال‌بک — سرور نباید بدونِ کشِ مشترک بالا بیاید */
      return {
        ok: false, driver: 'none',
        error: !REDIS_URL
          ? 'REDIS_URL is required when NODE_ENV=production (in-memory fallback is dev-only)'
          : 'ioredis driver is not installed (required when NODE_ENV=production)'
      };
    }
    return { ok: true, driver: 'memory', message: 'In-memory cache fallback active (dev only)' };
  }

  try {
    if (client) {
      try { client.disconnect(); } catch (e) {}
    }
    if (subClient) {
      try { subClient.disconnect(); } catch (e) {}
    }

    client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
      retryStrategy: (times) => {
        if (times > 3) return null; // Fallback after 3 attempts
        return Math.min(times * 200, 1000);
      },
      lazyConnect: true,
      enableOfflineQueue: false
    });

    client.on('error', (err) => {
      // Avoid logging spam on expected disconnects
      if (isRedisActive) {
        console.warn('[Redis] Connection error:', err.message);
      }
      isRedisActive = false;
    });

    client.on('connect', () => {
      isRedisActive = true;
    });

    await client.connect();

    // Create dedicated subscriber client
    subClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
      lazyConnect: true
    });
    subClient.on('error', () => {});
    await subClient.connect();

    subClient.on('message', (channel, message) => {
      const cbs = subscriptions.get(channel);
      if (cbs) {
        for (const cb of cbs) {
          try { cb(message, channel); } catch (e) {}
        }
      }
    });

    isRedisActive = true;
    return { ok: true, driver: 'redis', message: 'Connected to Redis server' };
  } catch (err) {
    console.warn('[Redis] Connection failed.', IS_PRODUCTION ? 'Production refuses fallback (readiness fails):' : 'Using in-memory fallback (dev only):', err.message);
    isRedisActive = false;
    if (client) {
      try { client.disconnect(); } catch (e) {}
      client = null;
    }
    if (subClient) {
      try { subClient.disconnect(); } catch (e) {}
      subClient = null;
    }
    if (IS_PRODUCTION) {
      /* P0-13: در تولید، قطعِ ردیس = شکستِ اتصال؛ فال‌بک به حافظه ممنوع */
      return { ok: false, driver: 'none', error: 'Redis unreachable in production: ' + err.message };
    }
    return { ok: true, driver: 'memory', fallback: true, warning: err.message };
  }
}

/**
 * Check if Redis is active
 */
function isRedis() {
  return isRedisActive && client !== null;
}

/**
 * P0-13: Readiness gate — در تولید فقط با ردیسِ زنده «آماده» است؛
 * در توسعه حافظهٔ محلی قابل‌قبول است.
 */
function ready() {
  return IS_PRODUCTION ? isRedis() : true;
}

/**
 * Get value by key
 * @param {string} key 
 */
async function get(key) {
  if (isRedis()) {
    try {
      return await client.get(key);
    } catch (err) {
      // Fallback to memory
    }
  }

  cleanExpiredMem();
  const exp = memExpiry.get(key);
  if (exp && Date.now() >= exp) {
    memCache.delete(key);
    memExpiry.delete(key);
    return null;
  }
  return memCache.has(key) ? String(memCache.get(key)) : null;
}

/**
 * Set value with optional TTL or mode
 * @param {string} key 
 * @param {string} value 
 * @param {string} [mode] 'EX' for seconds, 'PX' for ms, 'NX' for only if not exists
 * @param {number} [duration] duration value
 */
async function set(key, value, mode, duration) {
  const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);

  if (isRedis()) {
    try {
      if (mode && duration) {
        return await client.set(key, strVal, mode, duration);
      }
      return await client.set(key, strVal);
    } catch (err) {
      // Fallback to memory
    }
  }

  memCache.set(key, strVal);
  if (mode === 'EX' && typeof duration === 'number') {
    memExpiry.set(key, Date.now() + duration * 1000);
  } else if (mode === 'PX' && typeof duration === 'number') {
    memExpiry.set(key, Date.now() + duration);
  }
  return 'OK';
}

/**
 * Delete one or multiple keys
 * @param {...string} keys 
 */
async function del(...keys) {
  const flatKeys = keys.flat().filter(Boolean);
  if (flatKeys.length === 0) return 0;

  if (isRedis()) {
    try {
      return await client.del(...flatKeys);
    } catch (err) {
      // Fallback
    }
  }

  let count = 0;
  for (const k of flatKeys) {
    if (memCache.delete(k)) count++;
    memExpiry.delete(k);
  }
  return count;
}

/**
 * Set only if key does not exist, with expiry (atomic).
 * Returns true when this caller created the key.
 * Used for distributed locks (SET NX EX) and idempotency keys.
 * @param {string} key
 * @param {string} value
 * @param {number} ttlSeconds
 */
async function setNX(key, value, ttlSeconds) {
  if (isRedis()) {
    try {
      const reply = await client.set(key, value, 'EX', ttlSeconds, 'NX');
      return reply === 'OK';
    } catch (err) {
      // Redis down — treat as not-set (fail-closed for callers)
      return false;
    }
  }

  // Memory mode is single-process, so check+set is atomic inside one tick
  cleanExpiredMem();
  if (memCache.has(key)) return false;
  memCache.set(key, value);
  if (ttlSeconds > 0) {
    memExpiry.set(key, Date.now() + (ttlSeconds * 1000));
  }
  return true;
}

// Lua compare-and-delete: release a lock ONLY if we still own the token.
const CAS_DEL_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Delete the key only if its current value equals `expectedValue` (atomic CAS).
 * Prevents a lock holder from deleting a lock that expired and was re-taken
 * by another instance.
 * @param {string} key
 * @param {string} expectedValue
 */
async function compareAndDelete(key, expectedValue) {
  if (isRedis()) {
    try {
      const reply = await client.eval(CAS_DEL_SCRIPT, 1, key, expectedValue);
      return Number(reply) === 1;
    } catch (err) {
      return false;
    }
  }

  cleanExpiredMem();
  if (memCache.has(key) && memCache.get(key) === expectedValue) {
    memCache.delete(key);
    memExpiry.delete(key);
    return true;
  }
  return false;
}

/**
 * Publish message to a channel
 * @param {string} channel 
 * @param {string|Object} message 
 */
async function publish(channel, message) {
  const payload = typeof message === 'object' ? JSON.stringify(message) : String(message);

  if (isRedis()) {
    try {
      return await client.publish(channel, payload);
    } catch (err) {}
  }

  // In-memory Pub/Sub delivery
  const cbs = subscriptions.get(channel);
  if (cbs) {
    for (const cb of cbs) {
      try { cb(payload, channel); } catch (e) {}
    }
  }
  return 1;
}

/**
 * Subscribe to a channel
 * @param {string} channel 
 * @param {Function} callback (message, channel) => void
 */
async function subscribe(channel, callback) {
  if (!subscriptions.has(channel)) {
    subscriptions.set(channel, new Set());
  }
  subscriptions.get(channel).add(callback);

  if (isRedis() && subClient) {
    try {
      await subClient.subscribe(channel);
    } catch (err) {}
  }
  return true;
}

/**
 * Ping Redis / Memory for liveness
 */
async function ping() {
  if (isRedis()) {
    try {
      const res = await client.ping();
      return { ok: true, driver: 'redis', ping: res === 'PONG' };
    } catch (err) {
      return { ok: false, driver: 'redis', error: err.message };
    }
  }
  return { ok: true, driver: 'memory', alive: true };
}

/**
 * Close Redis clients
 */
async function close() {
  if (subClient) {
    try { subClient.disconnect(); } catch (e) {}
    subClient = null;
  }
  if (client) {
    try { client.disconnect(); } catch (e) {}
    client = null;
  }
  isRedisActive = false;
  memCache.clear();
  memExpiry.clear();
  subscriptions.clear();
}

module.exports = {
  init,
  isRedis,
  ready,
  get,
  set,
  del,
  publish,
  subscribe,
  ping,
  setNX,
  compareAndDelete,
  close
};
