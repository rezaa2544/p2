/* ═══════════════════════════════════════════════════════════════════
   server/env-flags.js — SUSPECT-B (باگ‌هانت چت ۵، نشست ۲)
   ───────────────────────────────────────────────────────────────────
   دو پرچمِ تولید ناهماهنگ‌اند: گیتِ ردیس (P0-13) فقط `NODE_ENV` را
   می‌خواند و گیتِ TLS فقط `PAYESH_ENV` را. اگر فقط یکی production
   باشد، readiness/health رفتارِ متفاوتی می‌گیرد و هیچ‌کس نمی‌فهمد.
   یکپارچه‌سازیِ کامل قراردادِ استقرار را عوض می‌کند (نیازمند تأیید
   Wave 15 — تست‌های T2 و redis-fallback §۶ رفتارِ فعلی را پین کرده‌اند)،
   پس ناهماهنگی در بوت **بلند** می‌شود (هشدارِ stderr) و قانونِ متعارف
   («هر دو production») در docs/DEPLOY.md ثبت است. رفتارِ بوت بی‌تغییر.
   خالص و بدونِ وابستگی — مستقیم تست‌پذیر (tests/env-flags.js).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

function checkEnvFlags(env){
  env = env || {};
  const nodeProd = env.NODE_ENV === 'production';
  const payeshProd = env.PAYESH_ENV === 'production';
  return {
    nodeProd: nodeProd,
    payeshProd: payeshProd,
    mismatch: nodeProd !== payeshProd,
    anyProd: nodeProd || payeshProd
  };
}

function mismatchWarning(f){
  f = f || { nodeProd: false, payeshProd: false };
  return '[ENV] production-flag mismatch: NODE_ENV=' + (f.nodeProd ? 'production' : '<not production>')
    + ' but PAYESH_ENV=' + (f.payeshProd ? 'production' : '<not production>')
    + ' — the Redis gate follows NODE_ENV while the TLS gate follows PAYESH_ENV;'
    + ' set BOTH to production in real deployments (see docs/DEPLOY.md §3).';
}

module.exports = { checkEnvFlags, mismatchWarning };
