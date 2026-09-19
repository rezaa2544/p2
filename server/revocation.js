/* ═══════════════════════════════════════════════════════════════════
   server/revocation.js — ابطالِ فوریِ نشست (JWT denylist توزیع‌شده)
   ───────────────────────────────────────────────────────────────────
   - denylist روی Redis است تا logout در یک نمونه، همان لحظه در همهٔ نمونه‌ها
     اثر کند (store.__revoked_jti فقط همان پروسه را می‌دید).
   - store.__revoked_jti سرِ جایش می‌ماند: ابطالِ محلیِ فوری حتی اگر Redis
     خواب باشد (jwtVerify همان را می‌خواند — بدونِ تغییر).
   - revoke-all با «نسخهٔ نشست» (sv): هر توکن نسخهٔ صدور را حمل می‌کند؛
     نسخهٔ جاریِ کاربر در Redis است و قدیمی‌ها مردود می‌شوند. توکن‌های
     قدیمیِ بدونِ sv تا اولین revoke-all معتبر می‌مانند (سازگاریِ روبه‌عقب).
   - خطایِ Redis = fail-open در خواندن (توضیح در §5): ابطالِ محلی همچنان
     پابرجاست؛ ابطالِ بین‌نمونه‌ای تا وصل‌شدنِ Redis عقب می‌افتد.
   کلیدها: revoked:<jti> (TTL=باقیِ عمرِ توکن)، sessver:<userId> (بدونِ TTL).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const redis = require('./redis');
const cache = require('./cache');

const DENY_PREFIX = 'revoked:';
const VER_PREFIX = 'sessver:';

/* ابطالِ یک نشست (jti) تا ttlSeconds آینده. خروجی: true = در denylist ثبت شد. */
async function revokeSession(jti, ttlSeconds) {
  if (!jti || typeof jti !== 'string') return false;
  const ttl = Math.max(1, Math.floor(Number(ttlSeconds)) || 28800);
  try {
    await redis.set(DENY_PREFIX + jti, '1', 'EX', ttl);
    return true;
  } catch (e) {
    return false;
  }
}

/* آیا این jti در denylist است؟ (خطا = false؛ ابطالِ محلی در jwtVerify جداست) */
async function isRevoked(jti) {
  if (!jti || typeof jti !== 'string') return false;
  try {
    return (await redis.get(DENY_PREFIX + jti)) != null;
  } catch (e) {
    return false;
  }
}

/* ابطالِ همهٔ نشست‌های یک کاربر؛ خروجی = نسخهٔ جدید (۱، ۲، …). خطا = ۰. */
async function revokeAllUserSessions(userId) {
  if (userId === null || userId === undefined) return 0;
  try {
    const res = await redis.incr(VER_PREFIX + userId);
    try { await cache.invalidateUser(userId); } catch (_) {}
    return res;
  } catch (e) {
    return 0;
  }
}

/* نسخهٔ جاریِ نشستِ کاربر (۰ = هنوز revoke-all نشده). خطا = ۰. */
async function getSessionVersion(userId) {
  if (userId === null || userId === undefined) return 0;
  try {
    const v = await redis.get(VER_PREFIX + userId);
    const n = parseInt(v, 10);
    return (Number.isFinite(n) && n > 0) ? n : 0;
  } catch (e) {
    return 0;
  }
}

module.exports = { revokeSession, isRevoked, revokeAllUserSessions, getSessionVersion };
