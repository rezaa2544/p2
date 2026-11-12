/* ═══════════════════════════════════════════════════════════════════
   server/rate-limit.js — Rate Limiting توزیع‌شده با Redis (fixed-window counter)
   ───────────────────────────────────────────────────────────────────
   - شمارندهٔ اتمیک (INCR + EXPIRE): درست زیرِ burstِ همزمان، برخلافِ GET+SET.
   - درایور از server/redis.js می‌آید: با REDIS_URL همان Redis واقعی (توزیع‌شده)،
     وگرنه fallback درون‌حافظه‌ایِ همان ریپو (تک‌پروسه — برای dev/test).
   - خطایِ غیرمنتظره = fail-open (allowed:true) تا افتِ Redis به خود-DDoS
     تبدیل نشود؛ لبه (nginx/Cloudflare) کنترلِ سختِ نرخ می‌ماند.
   - کلیدها: rate:<prefix>:<identifier> با TTL=windowSeconds.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const redis = require('./redis');

function getKey(prefix, identifier) {
  return `rate:${prefix}:${identifier}`;
}

async function checkRateLimit({ prefix, identifier, limit, windowSeconds, weight }) {
  const key = getKey(prefix, identifier);
  /* B5: configured-but-disconnected = fail CLOSED before even trying — the
     driver would otherwise silently use its in-process RAM counters once
     `isRedisActive` flips false (reproduced live: 200 after killing Redis). */
  const redisConfigured = !!String(process.env.REDIS_URL || '').trim() || !!String(process.env.DATABASE_URL || '').trim();
  const prod = process.env.NODE_ENV === 'production' || process.env.PAYESH_ENV === 'production';
  const redisGone = () => {
    const err = new Error('REDIS_UNAVAILABLE: distributed rate limiting unavailable — failing closed');
    err.code = 'REDIS_UNAVAILABLE';
    err.status = 503;
    return err;
  };
  if (redisConfigured
      && typeof redis.isConfigured === 'function' && redis.isConfigured()
      && typeof redis.isAlive === 'function' && !redis.isAlive()) {
    throw redisGone();
  }
  try {
    /* P0-TTL: اینکریمِنتِ اتمیک با تضمینِ انقضا — کلیدِ یتیمِ بی‌TTL
       (بازمانده از کرش) همین‌جا خوددرمانی می‌شود؛ نشت حافظه بسته شد.
       Delta Phase 4 (gap 1): وزنِ اختیاری — درخواستِ sync با N عملیات،
       N واحد مصرف می‌کند (پیش‌فرض 1 = رفتارِ پیشینِ auth.js). */
    const w = Math.max(1, Math.trunc(Number(weight) || 1));
    const current = await redis.incrByWithTtl(key, windowSeconds, w);
    return {
      allowed: current <= limit,
      remaining: Math.max(0, limit - current),
      reset: await redis.ttl(key),
      limit,
    };
  } catch (e) {
    /* B5 (Phase-2 production remediation directive): Redis configured + unavailable
       must NEVER fail open (`allowed:true` under outage = OTP brute-force gate gone).
       Fail CLOSED instead: throw REDIS_REQUIRED; the auth layer maps it to 503.
       Only the not-configured dev mode (no REDIS_URL) keeps legacy behavior. */
    if (redisConfigured || prod) {
      throw redisGone();
    }
    return { allowed: true, remaining: limit, reset: windowSeconds, limit, fallback: true };
  }
}

/* ═══════════════════════════════════════════════════════════════════
   A-35 — پنجرهٔ لغزان (sliding window) + محدودکنندهٔ per-tenant
   ───────────────────────────────────────────────────────────────────
   checkRateLimit بالا = fixed-window است (INCR+EXPIRE): مرزِ پنجره را
   می‌شود burst کرد (تا ۲× سقف روی مرز). checkSlidingWindow = ZSET:
     ZREMRANGEBYSCORE(key, -inf, now-window)  ← پاک‌سازیِ منقضی‌ها
     ZADD key now member (به وزن w)           ← عضوِ تازه با score=زمان
     ZCARD key                                ← تعدادِ واقعیِ درون پنجره
     PEXPIRE key window                       ← خوددرمانیِ TTL
   رقابتِ همزمانی: پاک‌سازی idempotent است و ZCARDِ همزمان ممکن است کمی
   بیش‌شمار کند — جهتِ خطا به سمتِ بسته است (safe برای limiter).
   checkTenantRateLimit = همان با کلیدِ per-tenant:
     rate:tenant:<routeClass>:<schoolId|global>
   خطای Redis: همان قراردادِ B5 بالا (configured = fail-closed با
   REDIS_UNAVAILABLE؛ فقط dev بی‌URL = fallback حافظه‌ای).
   ═══════════════════════════════════════════════════════════════════ */
async function checkSlidingWindow({ prefix, identifier, limit, windowSeconds, weight }) {
  const key = getKey(prefix, identifier);
  const win = Math.max(1, Number(windowSeconds) || 60);
  const redisConfigured = !!String(process.env.REDIS_URL || '').trim() || !!String(process.env.DATABASE_URL || '').trim();
  const prod = process.env.NODE_ENV === 'production' || process.env.PAYESH_ENV === 'production';
  const redisGone = () => {
    const err = new Error('REDIS_UNAVAILABLE: sliding-window rate limiting unavailable — failing closed');
    err.code = 'REDIS_UNAVAILABLE';
    err.status = 503;
    return err;
  };
  if (redisConfigured
      && typeof redis.isConfigured === 'function' && redis.isConfigured()
      && typeof redis.isAlive === 'function' && !redis.isAlive()) {
    throw redisGone();
  }
  try {
    const w = Math.max(1, Math.trunc(Number(weight) || 1));
    const lim = Math.max(1, Number(limit) || 1);
    const now = Date.now();
    const windowStart = now - win * 1000;
    await redis.zRemByScoreMax(key, windowStart);
    for (let i = 0; i < w; i++) {
      await redis.zAddTtl(key, now, now + ':' + i + ':' + Math.random().toString(36).slice(2, 10), win);
    }
    const count = Number(await redis.zCard(key));
    return { allowed: count <= lim, remaining: Math.max(0, lim - count), reset: win, count, limit: lim };
  } catch (e) {
    if (redisConfigured || prod) throw redisGone();
    return { allowed: true, remaining: Number(limit) || 1, reset: win, fallback: true };
  }
}

async function checkTenantRateLimit({ schoolId, routeClass, limit, windowSeconds, weight }) {
  return checkSlidingWindow({
    prefix: 'tenant:' + String(routeClass || 'api'),
    identifier: String(schoolId || 'global'),
    limit, windowSeconds, weight
  });
}

module.exports = { getKey, checkRateLimit, checkSlidingWindow, checkTenantRateLimit };
