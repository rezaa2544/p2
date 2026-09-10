/* ═══════════════════════════════════════════════════════════════════
   server/redis.js — High-Performance Distributed Redis Client & Fallback
   -------------------------------------------------------------------
   Phase 4 + فاز ۲.۱: Redis Caching, Sentinel & Cluster Layer
   - حالت‌های اتصال (اولویت از بالا):
       ۱. `REDIS_CLUSTER_NODES=host:port,...`  ⇒ Redis Cluster (ioredis.Cluster)
       ۲. `REDIS_SENTINELS=host:port,... + REDIS_SENTINEL_NAME`  ⇒ Sentinel
       ۳. `REDIS_URL`                          ⇒ Standalone
       ۴. هیچ‌کدام                             ⇒ Fallback درون‌حافظه‌ای (بدون وابستگی)
   - رمز فقط از `REDIS_PASSWORD` یا داخل خودِ `REDIS_URL` خوانده می‌شود؛
     هیچ مقدار سخت‌کده‌شده‌ای وجود ندارد (اصلِ «بدون راز در کد»).
   - `buildRedisConfig(env)` خالص و بدون اتصال است — برای تست و
     ابزارهای تشخیصی صادر می‌شود.
   - همهٔ متدها از طریق `module.exports` صدا زده می‌شوند تا تست‌های
     دیگر (مثل درزِ میمون‌وارِ `redis.incr`) همیشه مسیر واحد را ببینند.
   - روش‌ها: get, set, del, incr, expire, ttl, publish, subscribe, ping, isRedis, getStatus, close.
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
let activeMode = 'memory'; // 'memory' | 'standalone' | 'sentinel' | 'cluster'
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

/* ─────────────────────────────────────────────────────────────────
   پیکربندی از محیط — خالص، بدون اتصال (تست‌پذیر)
   ───────────────────────────────────────────────────────────────── */
function parseHostPorts(str) {
  const out = [];
  for (const part of String(str || '').split(',')) {
    const t = part.trim();
    if (!t) continue;
    const idx = t.lastIndexOf(':');
    if (idx <= 0) return null; /* قالب نامعتبر ⇒ رد کل پیکربندی */
    const host = t.slice(0, idx);
    const port = Number(t.slice(idx + 1));
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
    out.push({ host, port });
  }
  return out.length ? out : null;
}

function buildRedisConfig(env) {
  env = env || process.env;
  const password = env.REDIS_PASSWORD || null;
  const base = {
    maxRetriesPerRequest: 2,
    connectTimeout: 3000,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: (times) => {
      if (times > 3) return null; // Fallback after 3 attempts
      return Math.min(times * 200, 1000);
    }
  };

  /* ۱ — Cluster */
  const clusterNodes = parseHostPorts(env.REDIS_CLUSTER_NODES);
  if (clusterNodes) {
    return {
      mode: 'cluster',
      nodes: clusterNodes,
      password,
      options: base,
      clusterOptions: {
        redisOptions: Object.assign({}, base, password ? { password } : {}),
        scaleReads: 'master', /* سازگاری خواندن؛ شمارنده‌ها نباید کهنه خوانده شوند */
        clusterRetryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 300, 2000);
        }
      }
    };
  }

  /* ۲ — Sentinel */
  const sentinels = parseHostPorts(env.REDIS_SENTINELS);
  if (sentinels) {
    const name = (env.REDIS_SENTINEL_NAME || 'mymaster').trim();
    return {
      mode: 'sentinel',
      sentinels,
      name,
      password,
      options: Object.assign({}, base, password ? { password } : {}),
      sentinelOptions: {
        connectTimeout: 2000,
        retryStrategy: (times) => {
          if (times > 5) return null;
          return Math.min(times * 250, 1500);
        }
      }
    };
  }

  /* ۳ — Standalone */
  if (env.REDIS_URL) {
    return {
      mode: 'standalone',
      url: String(env.REDIS_URL),
      password,
      options: Object.assign({}, base, password ? { password } : {})
    };
  }

  /* ۴ — Memory */
  return { mode: 'memory' };
}

/**
 * Initialize Redis connection
 */
async function init() {
  const cfg = buildRedisConfig(process.env);
  activeMode = cfg.mode;
  if (cfg.mode === 'memory' || !Redis) {
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

    if (cfg.mode === 'cluster') {
      client = new Redis.Cluster(cfg.nodes, cfg.clusterOptions);
    } else if (cfg.mode === 'sentinel') {
      client = new Redis(Object.assign({}, cfg.options, {
        sentinels: cfg.sentinels,
        name: cfg.name,
        sentinelRetryStrategy: cfg.sentinelOptions.retryStrategy,
        enableReadyCheck: true
      }));
    } else {
      client = new Redis(cfg.url, cfg.options);
    }

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

    /* کلاینت اختصاصیِ Pub/Sub — هم‌حالت با کلاینت اصلی */
    if (cfg.mode === 'cluster') {
      subClient = new Redis.Cluster(cfg.nodes, cfg.clusterOptions);
    } else if (cfg.mode === 'sentinel') {
      subClient = new Redis(Object.assign({}, cfg.options, {
        sentinels: cfg.sentinels,
        name: cfg.name,
        sentinelRetryStrategy: cfg.sentinelOptions.retryStrategy
      }));
    } else {
      subClient = new Redis(cfg.url, Object.assign({}, cfg.options, { enableOfflineQueue: true }));
    }
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
    return { ok: true, driver: 'redis', mode: cfg.mode, message: 'Connected to Redis (' + cfg.mode + ')' };
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
    return { ok: true, driver: 'memory', mode: 'memory', fallback: true, warning: err.message };
  }
}

/**
 * Check if Redis is active
 */
function isRedis() {
  return isRedisActive && client !== null;
}

/**
 * وضعیت فعلی برای داشبورد/سلامت — بدون افشای رمز
 */
function getStatus() {
  return {
    active: isRedis(),
    mode: isRedis() ? activeMode : 'memory',
    ioredisAvailable: !!Redis
  };
}

/**
 * P0-13: Readiness gate — در تولید فقط با ردیسِ زنده «آماده» است؛
 * در توسعه حافظهٔ محلی قابل‌قبول است.
 */
function ready() {
  return IS_PRODUCTION ? isRedis() : true;
}

/* BUG-2 (باگ‌هانت چت ۵): fail-closedِ زمانِ اجرا در تولید.
   P0-13 فقط بوت را نگهبانی می‌کرد؛ ولی اگر ردیس وسطِ کار خطا می‌داد
   (catch) یا رویدادِ error پرچمِ اتصال را می‌انداخت، همهٔ عملیات‌ها
   بی‌صدا به حافظهٔ محلی می‌افتادند و state حیاتی (ریت‌لیمیت،
   idempotency، OTP، قفل‌ها، کش) بین نمونه‌ها واگرا می‌شد. در تولید
   حالا خطا بالا می‌رود (→ ۵۰۰ + readiness ـ ۵۰۳)؛ توسعه بی‌تغییر.
   setNX/compareAndDelete از پیش روی خطا false می‌دادند (fail-closed)
   و دست‌نخورده می‌مانند؛ ping/ready/status/close هم مشاهده‌اند. */
function prodNoRedis(op){
  if(IS_PRODUCTION && !isRedis()) throw new Error('Redis unavailable in production (fail-closed): ' + op);
}
function prodRethrow(err){
  if(IS_PRODUCTION) throw err;
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
      prodRethrow(err); // BUG-2: تولید می‌پراند؛ توسعه به حافظه می‌افتد
    }
  }

  prodNoRedis('get'); // BUG-2: تولیدِ بدونِ ردیسِ زنده به حافظه نمی‌افتد
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
      prodRethrow(err); // BUG-2: تولید می‌پراند؛ توسعه به حافظه می‌افتد
    }
  }

  prodNoRedis('set'); // BUG-2: تولیدِ بدونِ ردیسِ زنده به حافظه نمی‌افتد
  memCache.set(key, strVal);
  /* W11-3 (موج ۱۱): وفاداری به معنایِ ردیس. (۱) بازنویسیِ بی‌TTL انقضایِ
     قبلی را پاک می‌کند (SET بی‌EX = ماندگار) — پیش‌تر انقضایِ کهنه
     می‌ماند و کلید زود ناپدید می‌شد. (۲) مدتِ رشته‌ایِ عددی ('60')
     مثلِ ioredis پذیرفته می‌شود. */
  const durNum = Number(duration);
  if ((mode === 'EX' || mode === 'PX') && Number.isFinite(durNum) && duration !== '' && duration != null) {
    memExpiry.set(key, Date.now() + (mode === 'EX' ? durNum * 1000 : durNum));
  } else {
    memExpiry.delete(key);
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
      prodRethrow(err); // BUG-2: تولید می‌پراند؛ توسعه به حافظه می‌افتد
    }
  }

  prodNoRedis('del'); // BUG-2: تولیدِ بدونِ ردیسِ زنده به حافظه نمی‌افتد
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

  prodNoRedis('setNX'); // BUG-2: قفلِ حافظه‌ای در تولید = شکستِ انحصارِ متقابل
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

/* P0-TTL: شمارش اتمیک با تضمینِ انقضا — اگر کلید بی‌TTL ماند (مثلاً پس از
   کرش میانِ اینکِرِمِنت و اکسپایر)، همان لحظه انقضا می‌گیرد؛ هیچ کلیدِ
   یتیمی دائمی نمی‌ماند. یک رفت‌وبرگشت، اتمیک. */
const INCR_WITH_TTL_SCRIPT = `
local v = redis.call("INCR", KEYS[1])
if redis.call("TTL", KEYS[1]) < 0 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return v
`;

/**
 * Atomic increment that GUARANTEES a TTL on the key.
 * Self-heals orphaned keys (created by INCR but never expired, e.g. after a
 * crash between INCR and EXPIRE).
 * @param {string} key
 * @param {number} ttlSeconds
 * @returns {Promise<number>} new counter value
 */
async function incrWithTtl(key, ttlSeconds) {
  if (isRedis()) {
    try {
      const reply = await client.eval(INCR_WITH_TTL_SCRIPT, 1, key, ttlSeconds);
      return Number(reply);
    } catch (err) {
      prodRethrow(err); // BUG-2: تولید می‌پراند؛ توسعه به حافظه می‌افتد
    }
  }
  prodNoRedis('incrWithTtl'); // BUG-2
  /* مسیر حافظه از درگاه‌های صادرشده می‌گذرد تا هم‌قراردادِ تست‌ها
     (مثلاً شبیه‌سازی خرابی با وصله روی incr) باقی بماند. */
  const v = await module.exports.incr(key);
  const t = await module.exports.ttl(key);
  if (t === -1 && ttlSeconds > 0) await module.exports.expire(key, ttlSeconds);
  return v;
}

/**
 * Enumerate keys (SCAN on Redis — never KEYS *; Map walk in memory mode).
 * @param {string} [match] — glob pattern, e.g. `payesh:*`
 * @returns {Promise<string[]>}
 */
async function scan(match) {
  if (isRedis()) {
    const out = [];
    try {
      let cursor = '0';
      const args = match ? ['MATCH', match] : [];
      do {
        const reply = await client.scan(cursor, ...args, 'COUNT', 200);
        cursor = reply[0];
        for (const k of reply[1]) out.push(k);
      } while (cursor !== '0');
      return out;
    } catch (err) {
      prodRethrow(err); // BUG-2: تولید می‌پراند (فهرستِ ناقص گمراه‌کننده است)
      return out;
    }
  }
  prodNoRedis('scan'); // BUG-2
  cleanExpiredMem();
  const keys = Array.from(memCache.keys());
  if (!match) return keys;
  const rx = new RegExp('^' + match.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  return keys.filter(k => rx.test(k));
}

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

  prodNoRedis('compareAndDelete'); // BUG-2: قفلِ حافظه‌ای در تولید ممنوع
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
    } catch (err) { prodRethrow(err); } // BUG-2: تولید می‌پراند
  }

  prodNoRedis('publish'); // BUG-2: تحویلِ فقط-محلی در تولید گمراه‌کننده است
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
  prodNoRedis('subscribe'); // BUG-2: اشتراکِ فقط-محلی در تولید گمراه‌کننده است
  if (!subscriptions.has(channel)) {
    subscriptions.set(channel, new Set());
  }
  subscriptions.get(channel).add(callback);

  if (isRedis() && subClient) {
    try {
      await subClient.subscribe(channel);
    } catch (err) { prodRethrow(err); } // BUG-2: تولید می‌پراند
  }
  return true;
}

/**
 * Atomically increment an integer key (fixed-window counters).
 * Missing key starts at 1 (no TTL — call expire explicitly, like Redis).
 * @param {string} key
 * @returns {Promise<number>} new value
 */
async function incr(key) {
  if (isRedis()) {
    try {
      return await client.incr(key);
    } catch (err) {
      prodRethrow(err); // BUG-2: تولید می‌پراند؛ توسعه به حافظه می‌افتد
    }
  }
  prodNoRedis('incr'); // BUG-2: تولیدِ بدونِ ردیسِ زنده به حافظه نمی‌افتد
  cleanExpiredMem();
  const exp = memExpiry.get(key);
  if (exp && Date.now() >= exp) {
    memCache.delete(key);
    memExpiry.delete(key);
  }
  const cur = memCache.has(key) ? memCache.get(key) : null;
  if (cur === null || cur === undefined) {
    memCache.set(key, '1');
    return 1;
  }
  const n = parseInt(cur, 10);
  if (!Number.isFinite(n) || String(n) !== String(cur).trim()) {
    throw new Error('ERR value is not an integer or out of range');
  }
  memCache.set(key, String(n + 1));
  return n + 1;
}

/**
 * Set TTL in seconds. expire(key, 0) deletes (like Redis).
 * @param {string} key
 * @param {number} seconds
 * @returns {Promise<number>} 1 if set/deleted, 0 if missing
 */
async function expire(key, seconds) {
  if (isRedis()) {
    try {
      return await client.expire(key, seconds);
    } catch (err) {
      prodRethrow(err); // BUG-2: تولید می‌پراند؛ توسعه به حافظه می‌افتد
    }
  }
  prodNoRedis('expire'); // BUG-2: تولیدِ بدونِ ردیسِ زنده به حافظه نمی‌افتد
  cleanExpiredMem();
  const exp = memExpiry.get(key);
  if (exp && Date.now() >= exp) {
    memCache.delete(key);
    memExpiry.delete(key);
  }
  if (!memCache.has(key)) return 0;
  if (!(seconds > 0)) {
    memCache.delete(key);
    memExpiry.delete(key);
    return 1;
  }
  memExpiry.set(key, Date.now() + seconds * 1000);
  return 1;
}

/**
 * TTL in seconds: -2 missing, -1 no expiry (like Redis).
 * @param {string} key
 * @returns {Promise<number>}
 */
async function ttl(key) {
  if (isRedis()) {
    try {
      return await client.ttl(key);
    } catch (err) {
      prodRethrow(err); // BUG-2: تولید می‌پراند؛ توسعه به حافظه می‌افتد
    }
  }
  prodNoRedis('ttl'); // BUG-2: تولیدِ بدونِ ردیسِ زنده به حافظه نمی‌افتد
  cleanExpiredMem();
  const exp = memExpiry.get(key);
  if (exp && Date.now() >= exp) {
    memCache.delete(key);
    memExpiry.delete(key);
    return -2;
  }
  if (!memCache.has(key)) return -2;
  if (!exp) return -1;
  return Math.max(0, Math.ceil((exp - Date.now()) / 1000));
}

/**
 * Ping Redis / Memory for liveness
 */
async function ping() {
  if (isRedis()) {
    try {
      const res = await client.ping();
      return { ok: true, driver: 'redis', mode: activeMode, ping: res === 'PONG' };
    } catch (err) {
      return { ok: false, driver: 'redis', mode: activeMode, error: err.message };
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
  activeMode = 'memory';
  memCache.clear();
  memExpiry.clear();
  subscriptions.clear();
}

module.exports = {
  init,
  isRedis,
  getStatus,
  buildRedisConfig,
  ready,
  get,
  set,
  del,
  incr,
  incrWithTtl,
  expire,
  ttl,
  scan,
  publish,
  subscribe,
  ping,
  setNX,
  compareAndDelete,
  close
};
