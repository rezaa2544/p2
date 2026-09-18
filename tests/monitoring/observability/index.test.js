/**
 * اجرای متمرکز کلیه آزمون‌های لایه رصدپذیری بلادرنگ و بهینه‌سازی بار (P1-SC-03)
 */
'use strict';

const { runTenantIsolationTests } = require('./tenant-isolation.test');
const { runMetricsIntegrityTests } = require('./metrics-integrity.test');
const { runHealthCheckTests } = require('./health-check.test');
const { runDatabaseMonitoringTests } = require('./database-monitoring.test');
const { runQueueMonitoringTests } = require('./queue-monitoring.test');
const { runCacheMonitoringTests } = require('./cache-monitoring.test');
const { runHumanSovereigntyTests } = require('./human-sovereignty.test');
const { runZeroRankingTests } = require('./zero-ranking.test');
const { runDeterministicTests } = require('./deterministic.test');

function runAllObservabilityTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Phase 4 — P1-SC-03: Production Observability & Monitoring Suite  ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  runTenantIsolationTests();
  runMetricsIntegrityTests();
  runHealthCheckTests();
  runDatabaseMonitoringTests();
  runQueueMonitoringTests();
  runCacheMonitoringTests();
  runHumanSovereigntyTests();
  runZeroRankingTests();
  runDeterministicTests();

  console.log('\n✅ تمامی ۹ سوئیت آزمون لایه رصدپذیری تولید با موفقیت پاس شدند.\n');
}

if (require.main === module) {
  runAllObservabilityTests();
}

module.exports = { runAllObservabilityTests };
