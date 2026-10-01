/* ═══════════════════════════════════════════════════════════════════
   server/infrastructure/bounded-ms.js — fail-safe ms parser (B-PG-REWORK/M12-F1)
   -------------------------------------------------------------------
   pg کران‌های میلی‌ثانیه‌ای را فقط در صورتی می‌شناسد که مقدارِ positive و finite
   باشد. سه نقطهٔ تصمیم در درایور (تأییدشده در node_modules روی HEAD 6152a48a):

     pg-pool/index.js:206  `if (!this.options.connectionTimeoutMillis)`
       → 0/NaN/'' ⇒ هیچ تایم‌اوی رویِ acquire اتصال نمی‌گیرد.
     pg/lib/client.js:167  `if (this._connectionTimeoutMillis > 0)`
       → 0/منفی/NaN ⇒ تایم‌اوی رویِ TCP connect صفر می‌شود.
     pg/lib/client.js:702  `const readTimeout = config.query_timeout || ...`
       → 0/NaN ⇒ کوئریِ ارسال‌شده برای همیشه مسدود می‌ماند.

   پس نوشتنِ `parseInt(process.env.X || '3000', 10)` یک پارادوکسِ کشنده‌ست:
   رشتهٔ '0' truthy است (پس fallback اجرا نمی‌شود) ولی parseInt آن 0 می‌شود
   و درایور 0 را به‌معنایِ «بدونِ کران» می‌فهمد. یعنی یک misconfigurationِ
   خاموش، تمامِ ضمانتِ fail-closed لایهٔ دیتابیس را fail-open می‌کند.

   قانون (قراردادِ M12):  undefined / empty / NaN / <= 0  ⇒  defaultِ کران‌دار.
   هرگز  0 ⇒ unlimited  یا  منفی ⇒ unlimited  یا  NaN ⇒ unlimited.

   escape hatch:  PAYESH_PG_UNBOUNDED_PROBE=1  تنها مسیرِ رسیدن به 0 است و
   *فقط* وقتی کار می‌کند که NODE_ENV !== 'production'. هدفش بازتولیدِ عمدیِ
   درختِ pre-fix توسطِ پروب‌هایِ LEGACY است — هرگز نباید از یک اشتباهِ config
   یا یک CI عمومی عبور کند. اگر در production گذاشته شد، نادیده گرفته می‌شود
   و defaultِ کران‌دار برمی‌گردد. */
'use strict';

const UNBOUNDED_FLAG = 'PAYESH_PG_UNBOUNDED_PROBE';
const HARD_PRODUCTION = 'production';

/* متغیرِ اولویتِ بالاتر اول پرواز می‌کند (مثلِ `A || B` در کدِ قدیم)، ولی
 * برعکسِ `||`، رشتهٔ '0' یا 'abc' نباید باعثِ سقوط به defaultِ پایین‌تر
 * بشود — مقدارِ نامعتبرِ صریح یعنی همان defaultِ کران‌دار.
 *
 * درختِ pre-fix `parseInt(X || Y, 10)` بود و رشتهٔ '0' truthy است، پس
 * `PG_TIMEOUT_MS='0'` هرگز به fallback نمی‌رسید و مستقیماً 0 می‌شد. بازتولیدِ
 * وفادارِ همان رفتار: وقتی مقدارِ صریحاً نامعتبر است و پرچمِ پروب روشن است،
 * 0 برمی‌گردد (یعنی pg بدونِ کران) — و در غیرِ اینطور defaultِ کران‌دار. */
function boundedMs(name, defaultMs, fallbackName) {
  const raw = process.env[name];
  if (raw !== undefined && raw !== null && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
    if (unboundedRequested()) return 0; /* مقدارِ نامعتبر + پرچم ⇒ درختِ pre-fix */
  }
  if (fallbackName !== undefined && fallbackName !== null) {
    const raw2 = process.env[fallbackName];
    if (raw2 !== undefined && raw2 !== null && raw2 !== '') {
      const n2 = Number(raw2);
      if (Number.isFinite(n2) && n2 > 0) return Math.floor(n2);
      if (unboundedRequested()) return 0;
    }
  }
  return defaultMs;
}

/* مسیرِ بازتولیدِ LEGACY. فقطِ غیرِ production-hard. */
function unboundedRequested() {
  return process.env[UNBOUNDED_FLAG] === '1' && process.env.NODE_ENV !== HARD_PRODUCTION;
}

module.exports = { boundedMs, unboundedRequested, UNBOUNDED_FLAG };
