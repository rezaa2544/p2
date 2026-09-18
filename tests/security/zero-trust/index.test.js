/**
 * اجرای متمرکز کلیه آزمون‌های لایه امنیت سخت‌گیرانه زمان اجرا و Zero Trust (P1-SC-06)
 */
'use strict';

const { runIdentityVerificationTests } = require('./identity-verification.test');
const { runPolicyEngineTests } = require('./policy-engine.test');
const { runSessionProtectionTests } = require('./session-protection.test');
const { runBoundaryEnforcementTests } = require('./boundary-enforcement.test');
const { runSecurityAuditTests } = require('./security-audit.test');
const { runComplianceEnforcementTests } = require('./compliance-enforcement.test');
const { runTenantIsolationTests } = require('./tenant-isolation.test');
const { runHumanSovereigntyTests } = require('./human-sovereignty.test');
const { runZeroRankingTests } = require('./zero-ranking.test');
const { runDeterministicTests } = require('./deterministic.test');

function runAllZeroTrustSecurityTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Phase 4 — P1-SC-06: Zero Trust Runtime Security Suite (10/10)    ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  runIdentityVerificationTests();
  runPolicyEngineTests();
  runSessionProtectionTests();
  runBoundaryEnforcementTests();
  runSecurityAuditTests();
  runComplianceEnforcementTests();
  runTenantIsolationTests();
  runHumanSovereigntyTests();
  runZeroRankingTests();
  runDeterministicTests();

  console.log('\n✅ تمامی ۱۰ سوئیت آزمون لایه امنیت Zero Trust با موفقیت پاس شدند.\n');
}

if (require.main === module) {
  runAllZeroTrustSecurityTests();
}

module.exports = { runAllZeroTrustSecurityTests };
