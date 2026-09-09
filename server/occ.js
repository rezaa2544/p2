/* ═══════════════════════════════════════════════════════════════════
   server/occ.js — P0-18: کنترل همزمانی خوش‌بینانه (OCC)
   ───────────────────────────────────────────────────────────────────
   قراردادِ نوشت: کلاینت نسخهٔ پایه‌ای که دیده را با فیلدِ
   `base_version` (یا `version`) می‌فرستد؛ سرور فقط وقتی می‌پذیرد که
   آن نسخه با نسخهٔ جاری رکورد برابر باشد — وگرنه ۴۰۹ با نسخهٔ سرور.
   معادلِ `UPDATE ... WHERE id=$id AND version=$base` است: صفر ردیف ⇒
   برخورد. کلاینت‌های کهنه که نسخه نمی‌فرستند، مانند قبل می‌نویسند
   (سازگاری)، اما نسخهٔ رکورد باز هم بالا می‌رود تا کلاینت‌های دقیق
   از همان نقطه محافظت شوند.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/**
 * @param {object} rec — رکورد جاری
 * @param {object} body — بدنهٔ درخواستِ به‌روزرسانی
 * @param {string} [entityLabel] — برای پیامِ فارسی
 * @returns {null|object} تهی یعنی ادامه بده؛ وگرنه پاسخِ ۴۰۹ آماده
 */
function checkOcc(rec, body, entityLabel) {
  const base = body && (body.base_version !== undefined ? body.base_version : body.version);
  if (base === undefined || base === null || base === '') return null; /* کلاینت کهنه */
  const serverVersion = Number(rec.version) || 1;
  if (Number(base) !== serverVersion) {
    return {
      status: 409,
      body: {
        ok: false,
        code: 'conflict',
        message: (entityLabel || 'رکورد') + ' توسط کاربر دیگری تغییر یافته است. صفحه را تازه کنید.',
        server_version: serverVersion
      }
    };
  }
  return null;
}

/** بالا بردن نسخهٔ رکورد پس از نوشتِ موفق */
function bump(rec) {
  rec.version = (Number(rec.version) || 1) + 1;
  rec.updated_at = new Date().toISOString();
  return rec.version;
}

module.exports = { checkOcc, bump };
