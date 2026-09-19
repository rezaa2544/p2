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

/* Phase 8.1 (R15 decision — recorded evidence): the WAF default mode is
   intentionally `report` (P0 #6 staged rollout; docs/RED_TEAM_EXERCISE_2026_Q3.md;
   docs/RISK_REGISTER.md RISK-S-007: enable enforce pre-production after
   observing false-positive telemetry on staging). The code default stays
   `report` — but a production deployment running detect-only must say so
   LOUDLY at boot instead of silently. Returns null when no warning applies. */
function wafModeWarning(env){
  env = env || {};
  const nodeProd = env.NODE_ENV === 'production';
  const payeshProd = env.PAYESH_ENV === 'production';
  const enforce = env.PAYESH_WAF_MODE === 'enforce';
  if ((!nodeProd && !payeshProd) || enforce) return null;
  return '[WAF] production is running with PAYESH_WAF_MODE=report (detect-only at the application layer).'
    + ' Set PAYESH_WAF_MODE=enforce once staging telemetry shows no false positives'
    + ' (RISK-S-007 mitigation; see docs/PEN_TEST_CHECKLIST.md).';
}

module.exports = { checkEnvFlags, mismatchWarning, wafModeWarning };
