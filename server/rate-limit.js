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
  if (String(process.env.REDIS_URL || '').trim()
      && typeof redis.isConfigured === 'function' && redis.isConfigured()
      && typeof redis.isAlive === 'function' && !redis.isAlive()) {
    const err = new Error('REDIS_REQUIRED: distributed rate limiting unavailable — failing closed');
    err.code = 'REDIS_REQUIRED';
    err.status = 503;
    throw err;
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
    if (String(process.env.REDIS_URL || '').trim()) {
      const err = new Error('REDIS_REQUIRED: distributed rate limiting unavailable — failing closed');
      err.code = 'REDIS_REQUIRED';
      err.status = 503;
      throw err;
    }
    return { allowed: true, remaining: limit, reset: windowSeconds, limit, fallback: true };
  }
}

module.exports = { getKey, checkRateLimit };
