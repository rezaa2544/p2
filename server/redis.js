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
    return { ok: true, driver: 'memory', message: 'In-memory cache fallback active' };
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
    console.warn('[Redis] Connection failed. Using in-memory fallback:', err.message);
    isRedisActive = false;
    if (client) {
      try { client.disconnect(); } catch (e) {}
      client = null;
    }
    if (subClient) {
      try { subClient.disconnect(); } catch (e) {}
      subClient = null;
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
  get,
  set,
  del,
  publish,
  subscribe,
  ping,
  close
};
