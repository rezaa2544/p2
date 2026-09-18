/**
 * اجرای متمرکز کلیه آزمون‌های لایه پایداری، پشتیبان‌گیری و بازیابی بحران (P1-SC-04)
 */
'use strict';

const { runBackupIntegrityTests } = require('./backup-integrity.test');
const { runRestoreValidationTests } = require('./restore-validation.test');
const { runRpoRtoTests } = require('./rpo-rto.test');
const { runFailoverReadinessTests } = require('./failover-readiness.test');
const { runTenantIsolationTests } = require('./tenant-isolation.test');
const { runHumanSovereigntyTests } = require('./human-sovereignty.test');
const { runZeroRankingTests } = require('./zero-ranking.test');
const { runDeterministicTests } = require('./deterministic.test');

function runAllDisasterRecoveryTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Phase 4 — P1-SC-04: Disaster Recovery & High Availability Suite  ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  runBackupIntegrityTests();
  runRestoreValidationTests();
  runRpoRtoTests();
  runFailoverReadinessTests();
  runTenantIsolationTests();
  runHumanSovereigntyTests();
  runZeroRankingTests();
  runDeterministicTests();

  console.log('\n✅ تمامی ۸ سوئیت آزمون لایه بازیابی بحران و دسترسی‌پذیری بالا با موفقیت پاس شدند.\n');
}

if (require.main === module) {
  runAllDisasterRecoveryTests();
}

module.exports = { runAllDisasterRecoveryTests };
