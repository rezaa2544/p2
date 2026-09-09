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

async function checkRateLimit({ prefix, identifier, limit, windowSeconds }) {
  const key = getKey(prefix, identifier);
  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }
    return {
      allowed: current <= limit,
      remaining: Math.max(0, limit - current),
      reset: await redis.ttl(key),
      limit,
    };
  } catch (e) {
    return { allowed: true, remaining: limit, reset: windowSeconds, limit };
  }
}

module.exports = { getKey, checkRateLimit };
