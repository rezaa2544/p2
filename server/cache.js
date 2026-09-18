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

const crypto = require('crypto');
const redis = require('./redis');
/* ویو ۱۴ (Observability) — نرخِ برخوردِ کش، ابطال‌ها و تصمیم‌هایِ rate-limit. */
const metrics = require('./metrics');

const INVAL_CHANNEL = 'payesh:pubsub:inval';
/* W11-2 (موج ۱۱، باگ‌هانت چت ۵): epochِ ابطالِ L2. ابطالِ مدرسه/سراسری فقط
   کلیدهایِ L2ِ کاربرانِ حاضر در L1 همان نمونه را پاک می‌کرد؛ ورودیِ
   خالص-L2 (پس از LRU یا ری‌استارت) تا پایانِ TTL کهنه می‌ماند. حالا هر
   ابطال epoch تازهٔ یکتایی می‌نشاند، جفتِ جاری را در پاکتِ L2 می‌دوزد و
   خوانشِ L2-hit اعتبارسنجی می‌کند. EX=۳۶۰۰ (بسی بزرگ‌تر از TTL ‏۵دقیقه‌ایِ
   L2) پس کلیدِ epoch زودتر از هیچ ورودیِ زنده‌ای منقضی نمی‌شود. */
const EPOCH_GLOBAL_KEY = 'payesh:cache:epoch:global';
const EPOCH_TTL_SECONDS = 3600;
const epochSchoolKey = (schoolId) => `payesh:cache:epoch:school:${Number(schoolId)}`;
function newEpoch() {
  return Date.now().toString(36) + ':' + crypto.randomUUID();
}
/* Wave 11 — قواعدِ کش:
   L1: حافظهٔ فرایند، LRU با سقف (PAYESH_CACHE_L1_MAX، پیش‌فرض ۱۰٬۰۰۰) +
   TTLِ ۶۰s برای هر ورودی. L2: Redis، TTL = TTLِ منطقِ کلید (bootstrap ۵دقیقه).
   انقضا: رویدادهایِ user/school/all از مسیرِ تغییر (sync و REST) منتشر می‌شوند؛
   انقضایِ کاملِ L2 با ایندکسِ «مدرسه ⇒ کاربرانِ کش‌شده» (payesh:cache:school:<sid>).
   Stampede: single-flight — N درخواستِ هم‌زمانِ cache-miss برایِ یک کلید =
   یک بساز/یک نوشت (withSingleFlight). */
const L1_TTL_MS = 60 * 1000;
const SCHOOL_INDEX_GRACE_SECONDS = 60; /* index must not outlive its L2 entries by much */
const localUserBootstrapCache = new Map(); // L1 — insertion order = LRU order
const inflight = new Map(); // single-flight: key -> Promise
const localFallbackRateLimits = new Map(); // Phase 5 P2-NI-05: in-process fallback rate limiter

function checkLocalFallbackRateLimit(key, limit, windowSeconds) {
  const now = Date.now();
  let entry = localFallbackRateLimits.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + (windowSeconds * 1000) };
    localFallbackRateLimits.set(key, entry);
  }
  entry.count += 1;
  const allowed = entry.count <= limit;
  const remaining = Math.max(0, limit - entry.count);
  const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

  // Periodic pruning of expired entries to keep memory bounded
  if (localFallbackRateLimits.size > 5000) {
    for (const [k, v] of localFallbackRateLimits.entries()) {
      if (now >= v.resetAt) localFallbackRateLimits.delete(k);
    }
  }

  return { allowed, remaining, resetSeconds, fallback: true };
}

function l1Get(userId) {
  const it = localUserBootstrapCache.get(Number(userId));
  if (!it) return null;
  if (Date.now() >= it.exp) {
    localUserBootstrapCache.delete(Number(userId));
    return null;
  }
  /* LRU: دسترسی ⇒ انتهای صف (قدیمی‌ترین = ابتدای صف) */
  localUserBootstrapCache.delete(Number(userId));
  localUserBootstrapCache.set(Number(userId), it);
  return it.data;
}
function l1Set(userId, data, schoolId) {
  const uid = Number(userId);
  if (localUserBootstrapCache.has(uid)) localUserBootstrapCache.delete(uid);
  localUserBootstrapCache.set(uid, { data, exp: Date.now() + L1_TTL_MS, school_id: schoolId });
  while (localUserBootstrapCache.size > l1MaxEntries) {
    const oldest = localUserBootstrapCache.keys().next().value;
    localUserBootstrapCache.delete(oldest);
  }
}

/* ── Wave 9 — L1 محدود: سقفِ ورودی + LRU + TTL ──────────────────────
   نقشهٔ L1 تا پیش از این فقط-رشد بود (در مقیاسِ ملی = نشتِ حافظه).
   حالا سقفِ ورودی دارد (پیش‌فرض ۲۰۴۸؛ PAYESH_L1_MAX_ENTRIES)، ورودی‌های
   منقضی اول کشته می‌شوند و بعد قدیمی‌ترین‌ها (LRU با ترتیبِ درجِ Map
   و تازگی در خواندن). TTL همان ۶۰ ثانیهٔ قبلی است. */
const L1_DEFAULT_MAX = Number.isFinite(Number(process.env.PAYESH_L1_MAX_ENTRIES)) && Number(process.env.PAYESH_L1_MAX_ENTRIES) > 0
  ? Math.floor(Number(process.env.PAYESH_L1_MAX_ENTRIES))
  : Math.max(1, Number(process.env.PAYESH_CACHE_L1_MAX || 2048));
/* سقفِ L1 — یکدست‌شدهٔ ریبیس: setL1MaxEntries (W9) و setMax (W11) و هرسِ
   l1Set همه روی همین مقدار کار می‌کنند. اولویت: PAYESH_L1_MAX_ENTRIES (W9) >
   PAYESH_CACHE_L1_MAX (W11) > ۲۰۸. */
let l1MaxEntries = L1_DEFAULT_MAX;
let l1Hits = 0;
let l1Misses = 0;

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
        /* Wave 11: کلیدِ L2 هم پاک شود — وگرنه تا TTL کشِ کهنه می‌ماند */
        redis.del(`payesh:cache:bootstrap:${event.user_id}`).catch(() => {});
      } else if (event.type === 'school' && event.school_id) {
        for (const [uid, item] of localUserBootstrapCache.entries()) {
          if (item.school_id === Number(event.school_id)) {
            localUserBootstrapCache.delete(uid);
          }
        }
        /* Wave 11: انقضایِ کاملِ L2 از ایندکسِ مشترک (کاربرانِ کش‌شدهٔ مدرسه) */
        purgeSchoolL2(Number(event.school_id)).catch(() => {});
      } else if (event.type === 'all') {
        localUserBootstrapCache.clear();
      }
    } catch (e) {}
  });

  return { ok: true };
}

/* Wave 11: ایندکسِ مشترکِ «مدرسه ⇒ کاربرانِ کش‌شده» — انقضایِ کاملِ L2
   حتی برایِ کاربرانی که در L1ِ این نمونه نیستند (وگرنه تا TTL می‌ماندند). */
const schoolSetKey = (schoolId) => `payesh:cache:school:${schoolId}`;
async function purgeSchoolL2(schoolId) {
  const indexKey = schoolSetKey(schoolId);
  const members = await redis.sMembers(indexKey);
  /* Delete individual keys concurrently (cluster-safe: no cross-slot DEL)
     and remove the membership in the same pass. Without this cleanup the
     school set grew forever even though each bootstrap value had a TTL. */
  await Promise.all(members.map(uid => redis.del(`payesh:cache:bootstrap:${uid}`)));
  if (members.length) await redis.sRem(indexKey, ...members);
  return members.length;
}

/**
 * Get cached Bootstrap payload
 * @param {number} userId 
 */
async function getBootstrapCache(userId) {
  // L1 Check (LRU + TTL 60s)
  const local = l1Get(userId);
  if (local) {
    l1Hits++;
    /* ویو ۱۴ — نرخِ برخوردِ کش (لایهٔ حافظهٔ محلی) */
    metrics.inc('payesh_cache_lookups_total', { layer: 'l1_memory', outcome: 'hit' });
    return local;
  }
  l1Misses++;

  // L2 Redis Check
  const key = `payesh:cache:bootstrap:${userId}`;
  const raw = await redis.get(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      /* W11-2: پاکتِ epochدار اعتبارسنجی می‌شود؛ legacy (بی‌پاکت، از پیش
         از استقرار — حداکثر ۵ دقیقه عمر دارد) همان‌طور پذیرفته می‌شود. */
      if (parsed && parsed.__epoch_env === 1) {
        const schoolId = parsed.data && parsed.data.school ? parsed.data.school.id : null;
        const curSe = schoolId != null ? await redis.get(epochSchoolKey(schoolId)) : null;
        const curGe = await redis.get(EPOCH_GLOBAL_KEY);
        if ((parsed.se || null) !== (curSe || null) || (parsed.ge || null) !== (curGe || null)) {
          metrics.inc('payesh_cache_lookups_total', { layer: 'l2_redis', outcome: 'miss' }); /* ویو ۱۴: کهنه‌خوان = miss */
          return null;   /* ابطال‌شده پس از نوشتن — کهنه نخوان */
        }
        const data = parsed.data;
        l1Set(Number(userId), data, schoolId != null ? Number(schoolId) : null);
        metrics.inc('payesh_cache_lookups_total', { layer: 'l2_redis', outcome: 'hit' }); /* ویو ۱۴ */
        return data;
      }
      const data = parsed;
      l1Set(userId, data, data.school ? data.school.id : null);
      metrics.inc('payesh_cache_lookups_total', { layer: 'l2_redis', outcome: 'hit' }); /* ویو ۱۴ */
      return data;
    } catch (e) {}
  }
  metrics.inc('payesh_cache_lookups_total', { layer: 'l2_redis', outcome: 'miss' });
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
  const schoolId = data && data.school ? data.school.id : null;
  l1Set(userId, data, schoolId);
  /* W11-2: جفتِ جاریِ epoch در پاکتِ L2 دوخته می‌شود (خوانشِ بعدی اعتبارسنجی
     می‌کند). در خطایِ ردیس می‌پراند — مثلِ خودِ set امروز (fail-closed). */
  const se = schoolId != null ? await redis.get(epochSchoolKey(schoolId)) : null;
  const ge = await redis.get(EPOCH_GLOBAL_KEY);
  await redis.set(key, JSON.stringify({ __epoch_env: 1, data, se: se || null, ge: ge || null }), 'EX', ttlSeconds);
  /* Wave 11: عضویت در ایندکسِ مدرسه برای انقضایِ کامل. The set itself
     needs a TTL too; otherwise expired bootstrap keys leave user ids in
     Redis/memory forever and every later invalidation scans stale members. */
  if (schoolId) {
    const indexKey = schoolSetKey(schoolId);
    await redis.sAdd(indexKey, String(userId));
    const valueTtl = Number(ttlSeconds);
    const indexTtl = (Number.isFinite(valueTtl) && valueTtl > 0)
      ? Math.ceil(valueTtl) + SCHOOL_INDEX_GRACE_SECONDS
      : 300 + SCHOOL_INDEX_GRACE_SECONDS;
    await redis.expire(indexKey, indexTtl);
  }
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
  /* W11-2: اول epoch (بادوام، تک‌کلید) — حتی اگر publish بعدی بپرد، L2
     از این لحظه کهنه‌خوان نمی‌شود؛ L1 نمونه‌هایِ دیگر حداکثر ۶۰ ثانیه
     (TTL خودشان) عقب می‌ماند و بعد با L2-miss خودترمیم می‌شود. */
  await redis.set(epochSchoolKey(schoolId), newEpoch(), 'EX', EPOCH_TTL_SECONDS);
  for (const [uid, item] of Array.from(localUserBootstrapCache.entries())) {
    if (item.school_id === Number(schoolId)) {
      localUserBootstrapCache.delete(uid);
    }
  }
  await purgeSchoolL2(Number(schoolId));
  await redis.publish(INVAL_CHANNEL, { type: 'school', school_id: Number(schoolId) });
}

/**
 * Invalidate caches when a collection changes
 * @param {string} collection 
 * @param {number} [schoolId] 
 */
async function invalidateCollection(collection, schoolId) {
  /* ویو ۱۴ — برچسبِ scope از مجموعهٔ بسته (school/global) می‌آید؛ نامِ
     collection وارد label نمی‌شود تا cardinality کران‌دار بماند. */
  metrics.inc('payesh_cache_invalidations_total', { scope: schoolId ? 'school' : 'global' });
  if (schoolId) {
    await invalidateSchool(schoolId);
  } else {
    /* W11-2: ابطالِ سراسری هم L2 را می‌پوشاند (همان حفره، مقیاسِ کل) */
    await redis.set(EPOCH_GLOBAL_KEY, newEpoch(), 'EX', EPOCH_TTL_SECONDS);
    localUserBootstrapCache.clear();
    await redis.publish(INVAL_CHANNEL, { type: 'all', collection });
  }
}

/**
 * Wave 11 — Single-flight (stampede protection): هم‌زمانیِ N فراخوان برایِ
 * یک کلیدِ در حالِ build ⇒ فقط یک build؛ بقیه همان Promise را می‌گیرند.
 * (هر نمونهٔ فرایندِ خود را حفظ می‌کند — L2 هم‌چنان یک‌نوشته می‌ماند.)
 * @param {string} key
 * @param {Function} fn — async builder
 * @returns {Promise<*>} نتیجهٔ build
 */
async function withSingleFlight(key, fn) {
  const pend = inflight.get(key);
  if (pend) return pend;
  const p = (async () => {
    try { return await fn(); }
    finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}

/* Wave 15: آمارِ کش برایِ /api/health (L1 + در‌حالت‌پروازِ single-flight) */
function stats() {
  return { l1: localUserBootstrapCache.size, inflight: inflight.size };
}

/* Wave 11: دسترسی‌هایِ آزمون — L1 و single-flight را قابلِ مشاهده می‌کنند */
function __l1ForTests() {
  return {
    get size() { return localUserBootstrapCache.size; },
    has: (uid) => !!l1Get(uid),
    clear: () => localUserBootstrapCache.clear(),
    setMax: (n) => { l1MaxEntries = Math.max(1, Number(n) || 1); }
  };
}
function __inflightForTests() {
  return inflight.size;
}

/**
 * Distributed Rate Limiting (fixed-window)
 * Wave 6: اتمیک — شمارش با `incrWithTtl` (INCR+EXPIRE در یک اسکرپت)؛
 * نسخهٔ پیشین GET+SET غیراتوم بود و زیر burstِ هم‌زمان سقف را رد می‌کرد.
 * خطا = fail-open (allowed:true) — مثلِ server/rate-limit.js؛ لبهٔ سخت
 * (nginx/Cloudflare) کنترلِ سختِ نرخ می‌ماند.
 * @param {string} identifier - e.g., IP address or Phone
 * @param {string} action - e.g., 'send_code', 'login', 'api'
 * @param {number} limit - max allowed attempts
 * @param {number} windowSeconds - time window in seconds
 * @returns {Promise<{ allowed: boolean, remaining: number, resetSeconds: number }>}
 */
async function checkRateLimit(identifier, action, limit = 10, windowSeconds = 60) {
  const key = `payesh:rl:${action}:${identifier}`;
  try {
    const count = await redis.incrWithTtl(key, windowSeconds);
    const allowed = count <= limit;
    /* ویو ۱۴ — برچسبِ action نامِ اقدام است (send_code/login/api)، نه
       شناسهٔ کاربر؛ تصمیم‌هایِ رد‌شده یعنی فشارِ سوءاستفاده. */
    metrics.inc('payesh_rate_limit_decisions_total', { action: String(action || 'unknown').slice(0, 32), decision: allowed ? 'allowed' : 'denied' });
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetSeconds: await redis.ttl(key)
    };
  } catch (e) {
    /* Phase 5 (P2-NI-05): Redis outage must NEVER fail open (ALLOW ALL is strictly forbidden).
       Switches immediately to in-process local rate limiter to enforce quotas fail-safe. */
    metrics.inc('payesh_rate_limit_redis_failures_total', { action: String(action || 'unknown').slice(0, 32) });
    const fallback = checkLocalFallbackRateLimit(key, limit, windowSeconds);
    metrics.inc('payesh_rate_limit_decisions_total', {
      action: String(action || 'unknown').slice(0, 32),
      decision: fallback.allowed ? 'allowed' : 'denied'
    });
    return fallback;
  }
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
 * Distributed Mutex Lock — P0-14: atomic acquire (SET NX EX) and
 * token-verified release (compare-and-delete). An expired lock can never
 * be deleted by a previous holder, and concurrent acquirers resolve to
 * exactly one winner.
 * @param {string} lockKey
 * @param {number} [ttlSeconds=5]
 * @returns {Promise<string|null>} owner token, or null if the lock is held
 */
async function acquireLock(lockKey, ttlSeconds = 5) {
  const token = `t-${crypto.randomUUID()}`;
  const won = await redis.setNX(`payesh:lock:${lockKey}`, token, ttlSeconds);
  return won ? token : null;
}

/**
 * Release the lock only if we still own it.
 * @param {string} lockKey
 * @param {string} token — token returned by acquireLock
 * @returns {Promise<boolean>} true if we released it
 */
async function releaseLock(lockKey, token) {
  if (!token) return false;
  return redis.compareAndDelete(`payesh:lock:${lockKey}`, token);
}

/* ── Wave 9 — مشاهده‌پذیری و تنظیمِ L1 (بدونِ ری‌استارت) ─────────── */
function l1Stats() {
  return { size: localUserBootstrapCache.size, max: l1MaxEntries, hits: l1Hits, misses: l1Misses };
}
function setL1MaxEntries(n) {
  const v = Math.floor(Number(n));
  if (Number.isFinite(v) && v > 0) {
    l1MaxEntries = v;
    /* اگر سقفِ تازه پایین‌تر از اندازهٔ فعلی است، هم‌جا کوچک کن */
    while (localUserBootstrapCache.size > l1MaxEntries) {
      const k = localUserBootstrapCache.keys().next().value;
      if (k === undefined) break;
      localUserBootstrapCache.delete(k);
    }
  }
  return l1MaxEntries;
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
  releaseLock,
  l1Stats,
  setL1MaxEntries,
  withSingleFlight,
  stats,
  __l1ForTests,
  __inflightForTests};
