/* ═══════════════════════════════════════════════════════════════════
   server/circuit-breaker.js — کلیدِ مدارِ محافظت‌شده (M15-10)
   ───────────────────────────────────────────────────────────────────
   مسئله: وقتی یک وابستگی (Redis، درگاه پیامک، همگام‌سازی) می‌میرد،
   هر درخواستِ بعدی همان هزینهٔ timeout کامل را می‌پردازد (cascading
   latency) و خطایِ آن به کل مسیرِ درخواست سرریز می‌کند.
   راه‌حل: per-dependency breaker با سه وضعیت:
     · closed  — عادی؛ خطاها شمرده می‌شوند
     · open    — با رسیدن آستانهٔ خطا، فراخوانی‌ها فوری رد می‌شوند
                 (خطای نوع‌دار CIRCUIT_OPEN) تا وابستگی نفس بکشد
     · half-open — پس از reset timeout، یک پروبِ محدود اجازهٔ آزمون
                 می‌گیرد؛ موفقیت = بستنِ مدار، شکست = بازگشت به open
   degrade: caller می‌تواند fallback بدهد — در حالتِ open/شکست، نتیجهٔ
   fallback با پرچم degraded:true برگردانده می‌شود (graceful degradation)
   و در حالتِ fail-closed (opt-in هر وابستگی) خطا به بالا پرتاب می‌شود.

   متغیرهای محیطی (همه اختیاری):
     PAYESH_BREAKER_FAILURE_THRESHOLD  آستانهٔ خطا (پیش‌فرض 5)
     PAYESH_BREAKER_RESET_TIMEOUT_MS   مهلتِ باز تا نیمه‌باز (پیش‌فرض 30000)
     PAYESH_BREAKER_HALF_OPEN_PROBES   سقفِ پروبِ همزمانِ نیمه‌باز (پیش‌فرض 1)
     PAYESH_BREAKER_WINDOW_MS          پنجرهٔ شمارشِ خطا (پیش‌فرض 60000)

   نکته‌های قراردادی:
     · خطاها نوع‌دارند (err.code) — CIRCUIT_OPEN / CIRCUIT_BREAKER_POLICY
     · status() برای /api/health — بدونِ افشای داده
     · تایمرِ half-open از unref استفاده می‌کند — خروجِ پروسه را نگه نمی‌دارد
     · بدونِ وابستگی بیرونی؛ برایِ واحدِ هر وابستگی یک breaker جدا بسازید
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const DEFAULT_THRESHOLD = 5;
const DEFAULT_RESET_MS = 30000;
const DEFAULT_PROBES = 1;
const DEFAULT_WINDOW_MS = 60000;

function envInt(name, dflt) {
  const v = parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) && v > 0 ? v : dflt;
}

function createCircuitBreaker(opts = {}) {
  const threshold = opts.failureThreshold != null
    ? Math.max(1, Math.trunc(Number(opts.failureThreshold)))
    : envInt('PAYESH_BREAKER_FAILURE_THRESHOLD', DEFAULT_THRESHOLD);
  const resetMs = opts.resetTimeoutMs != null
    ? Math.max(0, Math.trunc(Number(opts.resetTimeoutMs)))
    : envInt('PAYESH_BREAKER_RESET_TIMEOUT_MS', DEFAULT_RESET_MS);
  const halfOpenProbes = opts.halfOpenProbes != null
    ? Math.max(1, Math.trunc(Number(opts.halfOpenProbes)))
    : envInt('PAYESH_BREAKER_HALF_OPEN_PROBES', DEFAULT_PROBES);
  const windowMs = opts.windowMs != null
    ? Math.max(1, Math.trunc(Number(opts.windowMs)))
    : envInt('PAYESH_BREAKER_WINDOW_MS', DEFAULT_WINDOW_MS);

  if (!Number.isFinite(threshold) || !Number.isFinite(resetMs) ||
      !Number.isFinite(halfOpenProbes) || !Number.isFinite(windowMs)) {
    throw breakerPolicyError('CIRCUIT_BREAKER_POLICY', 'آستانه/مهلت غیرعددی است');
  }

  const deps = new Map(); /* name -> state */

  function state(name) {
    let s = deps.get(name);
    if (!s) {
      s = { state: 'closed', failures: [], openedAt: 0, probes: 0, lastError: null, transitions: 0 };
      deps.set(name, s);
    }
    return s;
  }

  function breakerPolicyError(code, message) {
    const e = new Error(code + ': ' + message);
    e.code = code;
    return e;
  }

  function circuitOpenError(name, retryAfterMs) {
    const e = breakerPolicyError('CIRCUIT_OPEN',
      'مدارِ «' + name + '» باز است — وابستگی ناسالم؛ پس از ' + retryAfterMs + 'ms دوباره آزمون شود');
    e.retryAfterMs = retryAfterMs;
    return e;
  }

  function pruneFailures(s, now) {
    while (s.failures.length && now - s.failures[0] > windowMs) s.failures.shift();
  }

  function maybeHalfOpen(s, now) {
    if (s.state === 'open' && now - s.openedAt >= resetMs) {
      s.state = 'half-open';
      s.probes = 0;
      s.transitions++;
    }
    return s.state;
  }

  /* آیا فراخوانیِ تازه مجاز است؟ (بدونِ عوارض جانبیِ شمارش — فقط تصمیم) */
  function admit(name, s, now) {
    const st = maybeHalfOpen(s, now);
    if (st === 'open') return { ok: false, retryAfterMs: Math.max(0, resetMs - (now - s.openedAt)) };
    if (st === 'half-open') {
      if (s.probes >= halfOpenProbes) return { ok: false, retryAfterMs: resetMs };
      s.probes++;
      return { ok: true };
    }
    return { ok: true }; /* closed */
  }

  function recordFailure(name, err, s, now) {
    s.failures.push(now);
    pruneFailures(s, now);
    s.lastError = String((err && err.message) || err).slice(0, 200);
    if (s.failures.length >= threshold && s.state !== 'open') {
      s.state = 'open';
      s.openedAt = now;
      s.probes = 0;
      s.transitions++;
    } else if (s.state === 'half-open') {
      /* پروبِ نیمه‌باز شکست خورد → بی‌درنگ باز (بدونِ انتظارِ آستانهٔ کامل) */
      s.state = 'open';
      s.openedAt = now;
      s.probes = 0;
      s.transitions++;
    }
  }

  function recordSuccess(s, now) {
    if (s.state !== 'closed') s.transitions++;
    s.state = 'closed';
    s.failures = [];
    s.probes = 0;
    s.lastError = null;
    void now;
  }

  /**
   * اجرای fn تحتِ حفاظتِ مدار.
   *   opts.fallback (function | value) — در open یا شکست، نتیجهٔ degrade؛
   *     اگر تابع باشد با { reason, error } صدا زده می‌شود.
   *   opts.failClosed — حتی با fallback، خطا پرتاب شود (پیش‌فرض: false)
   * خروجیِ degrade: { value, degraded: true, reason: 'circuit-open'|'failure', error }
   */
  async function execute(name, fn, opts = {}) {
    if (typeof name !== 'string' || !/^[A-Za-z0-9_.:-]{1,120}$/.test(name)) {
      throw breakerPolicyError('CIRCUIT_BREAKER_POLICY', 'نامِ وابستگی نامعتبر است');
    }
    if (typeof fn !== 'function') {
      throw breakerPolicyError('CIRCUIT_BREAKER_POLICY', 'fn تابع نیست');
    }
    const s = state(name);
    const now = Date.now();
    const ad = admit(name, s, now);
    if (!ad.ok) {
      const err = circuitOpenError(name, ad.retryAfterMs);
      if (opts.failClosed || opts.fallback === undefined) throw err;
      return degrade(opts, 'circuit-open', err);
    }
    try {
      const value = await fn();
      recordSuccess(s, now);
      return { value, degraded: false };
    } catch (err) {
      const s2 = state(name); /* ممکن است حینِ await نخستین بار ساخته شود */
      recordFailure(name, err, s2, Date.now());
      if (opts.failClosed || opts.fallback === undefined) throw err;
      return degrade(opts, 'failure', err);
    }
  }

  function degrade(opts, reason, error) {
    if (typeof opts.fallback === 'function') {
      return { value: opts.fallback({ reason, error }), degraded: true, reason, error };
    }
    return { value: opts.fallback, degraded: true, reason, error };
  }

  /* عیب‌یابی/سلامت — بدونِ دادهٔ کاربر */
  function status() {
    const now = Date.now();
    const out = {};
    for (const [name, s] of deps) {
      pruneFailures(s, now);
      const st = maybeHalfOpen(s, now);
      out[name] = {
        state: st,
        failuresInWindow: s.failures.length,
        retryAfterMs: st === 'open' ? Math.max(0, resetMs - (now - s.openedAt)) : 0,
        lastError: s.lastError,
        transitions: s.transitions
      };
    }
    return out;
  }

  return {
    execute,
    status,
    isDegraded: (name) => {
      const s = deps.get(name);
      if (!s) return false;
      const st = maybeHalfOpen(s, Date.now());
      return st !== 'closed';
    },
    _opts: { threshold, resetMs, halfOpenProbes, windowMs } /* برایِ آزمون */
  };
}

module.exports = { createCircuitBreaker };
