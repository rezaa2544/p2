/* ═══════════════════════════════════════════════════════════════════
   server/cursor.js — Signed, TTL-bound delta-pull cursor (Delta Hardening Phase 2)
   -------------------------------------------------------------------
   WHY: the delta-pull "cursor" was the client-controlled, unsigned `since`
   ISO string. Anyone could replay or forge any `since` (cheap time-shift
   probing), and a cursor never went stale. This module turns the cursor
   into a server-signed, expiring token:

     pc1.<base64url(payload json)>.<base64url(HMAC-SHA256)>

   payload = { v:1, since:<iso>, iat:<epoch-s>, exp:<epoch-s>, jti:<hex> }
     v1 (legacy): قبول می‌شود تا انقضای TTLِ خودش (دورهٔ گذارِ استقرار).
   payload = { v:2, since, iat, exp, jti, rg:<region> }   — Delta Phase 4 (gap 5)
     v2: کرسر به منطقهٔ صادرکننده گره می‌خورد (PAYESH_REGION، پیش‌فرض
     'default'). توکنِ v2 که در منطقهٔ دیگری ارائه شود = 401
     region_mismatch + cursor_renewal:'full_pull' — کلاینت همان مسیرِ
     تجدیدِ عمومیِ pull کامل را می‌رود (29-pull.js؛ بدونِ تغییرِ کلاینت).
     رازِ امضای مشترک + برچسبِ rg یعنی توکنِ بین‌منطقه‌ای حتی با کلیدِ
     یکسانِ HA هم replay نمی‌شود مگر آن‌که خودِ خطا را بپذیرد (خنثی:
     چون sinceِ آن منطقه ممکن است جلوتر از ساعتِ محلیِ این‌جا باشد).

   - HMAC-SHA256 over "<b64payload>" with a server-side key (constant-time compare).
   - TTL default 3600s (1h), env PAYESH_CURSOR_TTL_S (clamped 60..86400).
   - Key: PAYESH_CURSOR_SECRET (>=32 bytes) — else domain-separated
     derivation from PAYESH_JWT_SECRET so instances sharing the session key
     also share the cursor key (multi-instance safe). No key ⇒ cursors
     DISABLED (fail-closed: pull keeps working via legacy `since`, but no
     next_cursor is issued and a presented cursor token is rejected as
     cursor_unavailable — never silently trusted).
   - Verify results: {ok:true, payload} | {ok:false, code:'cursor_expired'}
     | {ok:false, code:'cursor_invalid'} | {ok:false, code:'cursor_unavailable'}.
   Stateless: no Redis/DB state — renewal is "pull full once, get a fresh
   cursor" (the pull response always carries next_cursor).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const crypto = require('crypto');

const PREFIX = 'pc1';          /* token version tag */
const DEFAULT_TTL_S = 3600;    /* 1 hour — the contract default (Delta Hardening Phase 2) */
const MIN_TTL_S = 60;
const MAX_TTL_S = 86400;       /* never longer than a day */
const MAX_SKEW_S = 300;        /* iat in the far future = forged/misaligned clock */

function clampInt(v, dflt, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function ttlSeconds() {
  return clampInt(process.env.PAYESH_CURSOR_TTL_S, DEFAULT_TTL_S, MIN_TTL_S, MAX_TTL_S);
}

/* Delta Phase 4 (gap 5): نامِ منطقهٔ این instance — برچسبِ داخلِ کرسرِ v2.
   کوتاه/بسته تا payload را تحمیل‌پذیر (oversized) نکند. */
function regionName() {
  const r = process.env.PAYESH_REGION;
  return (typeof r === 'string' && r.length) ? r.trim().slice(0, 32) : 'default';
}

/**
 * Resolve the cursor signing key.
 * @param {string} [explicit] caller-provided key (highest priority — lets index.js
 *   pass its file-derived JWT key without it having to live in env)
 * @returns {string|null} hex key (256-bit) or null when cursors must be disabled.
 *   Whatever source wins is domain-separated (sha256 "payesh.cursor.v1|…") so the
 *   cursor HMAC key is NEVER the raw JWT key — same input secret, distinct key.
 */
function resolveSecret(explicit) {
  return resolveKey(explicit).key;
}

/* Delta Phase 4 (gap 3): منبعِ برنده را هم برگردان تا سلامتِ بوت و
   /api/health بگویند کلیدِ کرسر از کجا آمده — و بازراه‌اندازی پایدار
   است یا نه (keyfile/env پایدارند؛ منبعِ پایدار = کرسرِ زنده). */
function resolveKey(explicit) {
  /* هشدارِ misconfig: رازِ کوتاهِ صریح بی‌صدا رد نمی‌شود — اپراتور
     باید بداند چرا سقوط به منبعِ بعدی کرده (رفتار، همانِ پیشین است). */
  const cs = process.env.PAYESH_CURSOR_SECRET;
  if (typeof cs === 'string' && cs.length > 0 && cs.length < 32) {
    console.warn('[cursor] PAYESH_CURSOR_SECRET is shorter than 32 bytes — falling back to the JWT key source (domain-separated). Set a >=32-byte secret to stop this warning.');
  }
  const candidates = [
    { v: explicit, source: 'explicit' },
    { v: process.env.PAYESH_CURSOR_SECRET, source: 'env_cursor' },
    { v: process.env.PAYESH_JWT_SECRET, source: 'env_jwt' }
  ];
  for (const c of candidates) {
    if (typeof c.v === 'string' && c.v.length >= 32) {
      return { key: crypto.createHash('sha256').update('payesh.cursor.v1|' + c.v).digest('hex'), source: c.source };
    }
  }
  return { key: null, source: 'none' };
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function sigOf(secret, payloadB64) {
  return crypto.createHmac('sha256', secret).update(PREFIX + '.' + payloadB64).digest();
}

/**
 * Create a cursor signer/verifier bound to one key.
 * @param {object} [o] { secret?: string, ttlS?: number, now?: () => number }
 */
function createCursor(o) {
  o = o || {};
  const resolved = resolveKey(o.secret);
  const secret = resolved.key;
  const ttl = clampInt(o.ttlS != null ? o.ttlS : ttlSeconds(), DEFAULT_TTL_S, MIN_TTL_S, MAX_TTL_S);
  const now = typeof o.now === 'function' ? o.now : () => Math.floor(Date.now() / 1000);

  return {
    enabled: !!secret,
    ttlS: ttl,
    /* Delta Phase 4 (gap 3): 'explicit' | 'env_cursor' | 'env_jwt' | 'none' */
    keySource: resolved.source,

    /**
     * Sign a `since` ISO timestamp into an expiring cursor token.
     * @param {string} sinceISO
     * @param {number} [atEpochS] issue time (defaults now) — tests inject fixed clocks
     * @returns {string|null} token, or null when cursors are disabled
     */
    sign(sinceISO, atEpochS) {
      if (!secret) return null;
      if (!sinceISO || isNaN(new Date(sinceISO).getTime())) return null;
      const iat = Number.isFinite(atEpochS) ? Math.trunc(atEpochS) : now();
      const payload = {
        v: 2,
        since: String(sinceISO),
        iat,
        exp: iat + ttl,
        jti: crypto.randomBytes(8).toString('hex'),
        rg: regionName() /* Delta Phase 4 (gap 5): گرهِ منطقهٔ صادرکننده */
      };
      const body = b64u(JSON.stringify(payload));
      return PREFIX + '.' + body + '.' + b64u(sigOf(secret, body));
    },

    /**
     * Verify a cursor token (fail-closed).
     * @param {string} token
     * @returns {{ok:true, payload:object}|{ok:false, code:string}}
     */
    verify(token) {
      if (!secret) return { ok: false, code: 'cursor_unavailable' };
      if (typeof token !== 'string' || token.length > 4096) return { ok: false, code: 'cursor_invalid' };
      const parts = token.split('.');
      if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, code: 'cursor_invalid' };
      let payload;
      try {
        payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      } catch (e) { return { ok: false, code: 'cursor_invalid' }; }
      if (!payload) return { ok: false, code: 'cursor_invalid' };
      /* Delta Phase 4 (gap 5): v2 به منطقهٔ صادرکننده گره خورده؛ v1 تا
         انقضای TTL خودش قبول می‌شود (گذارِ استقرارِ چندمنطقه‌ای). */
      if (payload.v === 2) {
        /* بدشکلِ v2 (بدونِ rg) نامعتبر است؛ v2 سالم از منطقهٔ دیگر mismatch. */
        if (typeof payload.rg !== 'string' || !payload.rg) {
          return { ok: false, code: 'cursor_invalid' };
        }
        if (payload.rg !== regionName()) {
          return { ok: false, code: 'region_mismatch' };
        }
      } else if (payload.v !== 1) {
        return { ok: false, code: 'cursor_invalid' };
      }
      /* signature first (constant-time) — expired-but-forged is invalid, not expired */
      let sigOk = false;
      try {
        const expect = sigOf(secret, parts[1]);
        const got = Buffer.from(parts[2], 'base64url');
        sigOk = expect.length === got.length && crypto.timingSafeEqual(expect, got);
      } catch (e) { sigOk = false; }
      if (!sigOk) return { ok: false, code: 'cursor_invalid' };
      const t = now();
      if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return { ok: false, code: 'cursor_invalid' };
      if (payload.exp <= t) return { ok: false, code: 'cursor_expired' };
      if (typeof payload.iat !== 'number' || payload.iat - t > MAX_SKEW_S) return { ok: false, code: 'cursor_invalid' };
      if (!payload.since || isNaN(new Date(payload.since).getTime())) return { ok: false, code: 'cursor_invalid' };
      return { ok: true, payload };
    }
  };
}

module.exports = { createCursor, resolveSecret, resolveKey, ttlSeconds, regionName, DEFAULT_TTL_S, MIN_TTL_S, MAX_TTL_S };
