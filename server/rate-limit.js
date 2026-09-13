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
    return { allowed: true, remaining: limit, reset: windowSeconds, limit };
  }
}

module.exports = { getKey, checkRateLimit };
