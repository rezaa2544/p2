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

/* N-29 — مسیرهایِ احرازِ هویت از دروازهٔ Origin معاف‌اند: این مسیرها
   کوکیِ نشست را می‌سازند، نه اینکه از آن استفاده کنند — هنوز
   نشستِ cookie-authenticatedای برای سوءاستفاده وجود ندارد. وگرنه در
   strict mode هیچ کلای enti نمی‌توانست اصلاً وارد شود. ONLY login و
   send-code؛ logout/delete-account از کوکیِ موجود استفاده می‌کنند و
   باید زیرِ دروازه بمانند (حملاتِ CSRF دقیقاً روی این‌هاست). */
const CSRF_EXEMPT_AUTH = ['/api/auth/login', '/api/auth/send-code'];
function isAuthRoute(req) {
  const pn = pathname(req);
  return CSRF_EXEMPT_AUTH.indexOf(pn) > -1;
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
  /* N-29 — مسیرهایِ احرازِ هویت که کوکی را می‌سازند، شاملِ دروازهٔ Origin
     نیستند (هنوز نشستی برایِ دزدیدن نیست). */
  if (isAuthRoute(req)) return { ok: true, code: 'auth_route' };
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

  /* N-29 — Sec-Fetch-Site: اگر مرورگر صراحتاً cross-site گفت، حتی بدونِ
     Origin/Referer هم رد می‌شود (defense-in-depth). */
  const site = fetchSiteCrossOrigin(req);
  if (site) return { ok: false, code: 'csrf_fetch_site_' + site };

  /* N-29 — غیبتِ هر دو سرآیندِ Origin و Referer. یک مرورگرِ واقعی
     همیشه حداقل یکی را رویِ POST/PUT/PATCH/DELETE می‌فرستد، پس رسیدن
     به اینجا یعنی یا کلاینتِ غیرِمرورگری (که باید توکن بگیرد نه کوکی)،
     یا درخواستی که سرآیندهایش جعل/حذف شده. در production (یا با
     PAYESH_STRICT_CSRF=1) fail-closed رد می‌کند؛ با PAYESH_STRICT_CSRF=0
     می‌توان رفتارِ قدیم را برایِ یکپارچه‌سازی‌هایِ رسمیِ شناخته‌شده
     بازگرداند. */
  if (strictCsrfEnabled()) return { ok: false, code: 'csrf_origin_required' };
  return { ok: true, code: 'header_absent' };
}

/* N-29 — حالتِ سخت‌گیرانه: آیا یک نوشتنِ بدونِ Origin/Referer باید رد
   شود؟ پیش‌فرض در production = بله. */
function strictCsrfEnabled() {
  var explicit = String(process.env.PAYESH_STRICT_CSRF || '').trim().toLowerCase();
  if (explicit === '1' || explicit === 'true') return true;
  if (explicit === '0' || explicit === 'false') return false;
  var env = String(process.env.PAYESH_ENV || '').trim().toLowerCase();
  var nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
  return (env === 'production' || nodeEnv === 'production');
}

/* N-29 — Sec-Fetch-Site: سیگنالِ مرورگریِ تکمیلی. فقط برایِ تشخیصِ
   cross-site به‌کار می‌رود؛ غیبتِ آن هرگز به‌تنهایی رد نمی‌کند. */
function fetchSiteCrossOrigin(req) {
  const site = String(header(req, 'sec-fetch-site') || '').trim().toLowerCase();
  return site === 'cross-site' || site === 'same-site' ? site : null;
}

module.exports = { UNSAFE, isStateChangingApi, isAuthRoute, expectedOrigin, checkCsrfOrigin, strictCsrfEnabled, fetchSiteCrossOrigin };
