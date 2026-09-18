/**
 * تست لایه انطباق‌پذیری و کشف نشت کلید و تنظیمات ناامن (Compliance Enforcement - P1-SC-06)
 */
'use strict';

const assert = require('assert');
const {
  checkSecretExposure,
  checkConfigurationSecurity,
  checkAuthorizationCompleteness,
  checkUnsafeRuntimeState,
  evaluateCompliance
} = require('../../../server/security/compliance-enforcement');

function runComplianceEnforcementTests() {
  console.log('▸ تست ۶: لایه انطباق‌پذیری، کشف نشت و ایمنی تنظیمات (compliance-enforcement)');

  // ۱. کشف نشت کلید گیت‌هاب و توکن JWT در اشیاء
  const leakingObject = {
    app: 'payesh',
    token_leak: ['gh', 'p_', '123456789012345678901234567890123456'].join(''),
    nested: {
      raw_key: ['-----', 'BEGIN ', 'RSA PRIVATE KEY', '-----'].join('')
    }
  };
  const secretRes = checkSecretExposure(leakingObject);
  assert.strictEqual(secretRes.compliant, false);
  assert.strictEqual(secretRes.violations_count, 2);

  const cleanObject = { app: 'payesh', version: '1.0.0' };
  const secretResClean = checkSecretExposure(cleanObject);
  assert.strictEqual(secretResClean.compliant, true);

  // ۲. بررسی امنیت پیکربندی (Configuration Security)
  const insecureConfig = {
    NODE_ENV: 'production',
    ALLOW_MEMORY_FALLBACK: '1',
    cookie: { httpOnly: false, sameSite: 'None' },
    cors_origin: '*'
  };
  const configRes = checkConfigurationSecurity(insecureConfig);
  assert.strictEqual(configRes.compliant, false);
  assert(configRes.issues.some(i => i.code === 'MEMORY_FALLBACK_IN_PROD'));
  assert(configRes.issues.some(i => i.code === 'COOKIE_NOT_HTTPONLY'));
  assert(configRes.issues.some(i => i.code === 'WILDCARD_CORS_IN_PROD'));

  // ۳. بررسی جامعیت مدل مجوزها (Authorization Completeness)
  const incompletePerms = {
    USER_UPDATE: ['manager'],
    DELETE_EVERYTHING: [] // فاقد نقش
  };
  const authzRes = checkAuthorizationCompleteness(incompletePerms);
  assert.strictEqual(authzRes.compliant, false);
  assert.strictEqual(authzRes.missing_count, 1);

  // ۴. بررسی وضعیت زمان اجرا (Unsafe Runtime State)
  const unsafeRuntime = {
    error_rate: 0.08, // بالای ۵٪
    heap_usage_percent: 95 // بالای ۹۰٪
  };
  const runtimeRes = checkUnsafeRuntimeState(unsafeRuntime);
  assert.strictEqual(runtimeRes.safe, false);
  assert.strictEqual(runtimeRes.anomalies_count, 2);

  // ۵. ساخت شناسنامه جامع انطباق‌پذیری
  const compReport = evaluateCompliance({
    config: cleanObject,
    runtimeState: { error_rate: 0.001, heap_usage_percent: 45 },
    schoolId: 1
  });
  assert.strictEqual(compReport.compliance_status, 'COMPLIANT');
  assert.strictEqual(compReport.governance_and_invariants.human_decision_sovereignty.automated_execution, false);
  assert.strictEqual(compReport.governance_and_invariants.zero_ranking_guarantee.enforced, true);

  console.log('  ✅ صحت ارزیابی انطباق‌پذیری، کشف نشت و بررسی زمان اجرا تایید شد');
}

if (require.main === module) {
  runComplianceEnforcementTests();
}

module.exports = { runComplianceEnforcementTests };
