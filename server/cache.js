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

const INVAL_CHANNEL = 'payesh:pubsub:inval';
/* W11-2 (موج ۱۱): epochِ ابطالِ L2. ابطالِ مدرسه/سراسری فقط کلیدهایِ L2
   کاربرانِ حاضر در L1 همان نمونه را پاک می‌کرد؛ ورودیِ خالص-L2 (پس از
   LRU یا ری‌استارت) تا پایانِ TTL کهنه می‌ماند. حالا هر ابطال epoch تازهٔ
   یکتایی می‌نشاند، set جفتِ جاری را در پاکتِ L2 می‌دوزد و خوانشِ L2-hit
   اعتبارسنجی می‌کند. EX=۳۶۰۰ (بسی بزرگ‌تر از TTL ‏۵دقیقه‌ایِ L2) پس کلیدِ
   epoch زودتر از هیچ ورودیِ زنده‌ای منقضی نمی‌شود. */
const EPOCH_GLOBAL_KEY = 'payesh:cache:epoch:global';
const EPOCH_TTL_SECONDS = 3600;
const epochSchoolKey = (schoolId) => `payesh:cache:epoch:school:${Number(schoolId)}`;
function newEpoch() {
  return Date.now().toString(36) + ':' + crypto.randomUUID();
}
const localUserBootstrapCache = new Map(); // L1 memory cache for microsecond reads

/* ── Wave 9 — L1 محدود: سقفِ ورودی + LRU + TTL ──────────────────────
   نقشهٔ L1 تا پیش از این فقط-رشد بود (در مقیاسِ ملی = نشتِ حافظه).
   حالا سقفِ ورودی دارد (پیش‌فرض ۲۰۴۸؛ PAYESH_L1_MAX_ENTRIES)، ورودی‌های
   منقضی اول کشته می‌شوند و بعد قدیمی‌ترین‌ها (LRU با ترتیبِ درجِ Map
   و تازگی در خواندن). TTL همان ۶۰ ثانیهٔ قبلی است. */
const L1_DEFAULT_MAX = Number.isFinite(Number(process.env.PAYESH_L1_MAX_ENTRIES)) && Number(process.env.PAYESH_L1_MAX_ENTRIES) > 0
  ? Math.floor(Number(process.env.PAYESH_L1_MAX_ENTRIES))
  : 2048;
let l1MaxEntries = L1_DEFAULT_MAX;
let l1Hits = 0;
let l1Misses = 0;

function l1Set(id, val) {
  if (localUserBootstrapCache.size >= l1MaxEntries && !localUserBootstrapCache.has(id)) {
    const now = Date.now();
    /* اول: ورودی‌های منقضی را بکش */
    for (const [k, it] of localUserBootstrapCache) {
      if (localUserBootstrapCache.size < l1MaxEntries) break;
      if (!it || it.exp <= now) localUserBootstrapCache.delete(k);
    }
    /* بعد: قدیمی‌ترین‌ها (LRU) */
    while (localUserBootstrapCache.size >= l1MaxEntries) {
      const k = localUserBootstrapCache.keys().next().value;
      if (k === undefined) break;
      localUserBootstrapCache.delete(k);
    }
  }
  localUserBootstrapCache.delete(id);
  localUserBootstrapCache.set(id, val);
}

function l1Get(id) {
  const hit = localUserBootstrapCache.get(id);
  if (hit === undefined) return undefined;
  /* تازگیِ LRU: خوانده‌شده = تازه‌ترین */
  localUserBootstrapCache.delete(id);
  localUserBootstrapCache.set(id, hit);
  return hit;
}

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
  const local = l1Get(Number(userId));
  if (local && Date.now() < local.exp) {
    l1Hits++;
    return local.data;
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
          return null;   /* ابطال‌شده پس از نوشتن — کهنه نخوان */
        }
        const data = parsed.data;
        l1Set(Number(userId), { data, exp: Date.now() + 60000, school_id: schoolId != null ? Number(schoolId) : null });
        return data;
      }
      const data = parsed;
      l1Set(Number(userId), { data, exp: Date.now() + 60000, school_id: data.school ? data.school.id : null });
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
  const schoolId = data && data.school ? data.school.id : null;
  l1Set(Number(userId), { data, exp: Date.now() + 60000, school_id: schoolId != null ? Number(schoolId) : null });
  /* W11-2: جفتِ جاریِ epoch در پاکتِ L2 دوخته می‌شود (خوانشِ بعدی اعتبارسنجی
     می‌کند). در خطایِ ردیس می‌پراند — مثلِ خودِ set امروز (fail-closed). */
  const se = schoolId != null ? await redis.get(epochSchoolKey(schoolId)) : null;
  const ge = await redis.get(EPOCH_GLOBAL_KEY);
  await redis.set(key, JSON.stringify({ __epoch_env: 1, data, se: se || null, ge: ge || null }), 'EX', ttlSeconds);
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
    /* W11-2: ابطالِ سراسری هم L2 را می‌پوشاند (همان حفره، مقیاسِ کل) */
    await redis.set(EPOCH_GLOBAL_KEY, newEpoch(), 'EX', EPOCH_TTL_SECONDS);
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
  setL1MaxEntries
};
