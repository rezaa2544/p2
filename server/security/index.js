/**
 * پایش — سامانه هوشمند مدیریت مدرسه
 * مدخل مرکزی لایه امنیت سخت‌گیرانه زمان اجرا و Zero Trust (P1-SC-06)
 */
'use strict';

const zeroTrustRuntime = require('./zero-trust-runtime');
const securityAuditEngine = require('./security-audit-engine');
const complianceEnforcement = require('./compliance-enforcement');

module.exports = {
  ...zeroTrustRuntime,
  ...securityAuditEngine,
  ...complianceEnforcement
};
