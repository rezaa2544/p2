/* ═══════════════════════════════════════════════════════════════════
   server/csrf.js — origin gate for cookie-authenticated API writes

   The session cookie is HttpOnly + SameSite=Lax. This middleware adds an
   independent browser signal: whenever a browser supplies Origin (or the
   legacy Referer fallback), it must be the exact origin that received the
   request. A forged cross-origin POST/PUT/PATCH/DELETE is rejected before
   its body is read or a stateful route is selected.

   Requests without either header are allowed deliberately: native/offline
   clients and existing server-to-server integrations do not universally
   send Origin. They still require ordinary authentication and authorization.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function header(req, name) {
  const headers = (req && req.headers) || {};
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function pathname(req) {
  try { return new URL(String((req && req.url) || '/'), 'http://csrf.local').pathname; }
  catch (_) { return ''; }
}

function isStateChangingApi(req) {
  return !!(req && UNSAFE.has(String(req.method || '').toUpperCase()) && pathname(req).indexOf('/api/') === 0);
}

function originOf(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.host) return null;
    return parsed.origin;
  } catch (_) {
    return null;
  }
}

function expectedOrigin(req, isHttps) {
  const host = String(header(req, 'host') || '').trim().toLowerCase();
  /* Host is supplied by the HTTP server/proxy; reject malformed input rather
     than accepting an origin that cannot be compared unambiguously. */
  if (!host || /[\s\\/]/.test(host)) return null;
  return (isHttps && isHttps(req) ? 'https://' : 'http://') + host;
}

function sameOrigin(actual, expected) {
  return !!actual && !!expected && actual.toLowerCase() === expected.toLowerCase();
}

/* Returns a small, non-sensitive decision object suitable for audit logs. */
function checkCsrfOrigin(req, isHttps) {
  if (!isStateChangingApi(req)) return { ok: true, code: 'not_applicable' };
  const expected = expectedOrigin(req, isHttps);
  if (!expected) return { ok: false, code: 'csrf_host_invalid' };

  const originHeader = header(req, 'origin');
  if (originHeader !== undefined) {
    const actual = originOf(originHeader);
    return sameOrigin(actual, expected)
      ? { ok: true, code: 'origin_match' }
      : { ok: false, code: 'csrf_origin_mismatch' };
  }

  /* Referer is a secondary signal for legacy form submissions. If it is
     supplied it is as authoritative as Origin; a missing Referer remains
     compatible with native/offline clients and is covered by SameSite=Lax. */
  const referer = header(req, 'referer');
  if (referer !== undefined) {
    const actual = originOf(referer);
    return sameOrigin(actual, expected)
      ? { ok: true, code: 'referer_match' }
      : { ok: false, code: 'csrf_referer_mismatch' };
  }
  return { ok: true, code: 'header_absent' };
}

module.exports = { UNSAFE, isStateChangingApi, expectedOrigin, checkCsrfOrigin };
