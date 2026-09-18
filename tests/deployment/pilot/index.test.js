/**
 * اجرای متمرکز کلیه آزمون‌های لایه استقرار پایلوت تولید و مدیریت ترافیک (P1-SC-05)
 */
'use strict';

const { runTrafficAllocationTests } = require('./traffic-allocation.test');
const { runCanaryRoutingTests } = require('./canary-routing.test');
const { runRollbackReadinessTests } = require('./rollback-readiness.test');
const { runHealthGateTests } = require('./health-gate.test');
const { runTenantIsolationTests } = require('./tenant-isolation.test');
const { runHumanSovereigntyTests } = require('./human-sovereignty.test');
const { runZeroRankingTests } = require('./zero-ranking.test');
const { runDeterministicTests } = require('./deterministic.test');

function runAllPilotDeploymentTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Phase 4 — P1-SC-05: Pilot Deployment & Traffic Management Suite  ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  runTrafficAllocationTests();
  runCanaryRoutingTests();
  runRollbackReadinessTests();
  runHealthGateTests();
  runTenantIsolationTests();
  runHumanSovereigntyTests();
  runZeroRankingTests();
  runDeterministicTests();

  console.log('\n✅ تمامی ۸ سوئیت آزمون لایه استقرار پایلوت و مدیریت ترافیک با موفقیت پاس شدند.\n');
}

if (require.main === module) {
  runAllPilotDeploymentTests();
}

module.exports = { runAllPilotDeploymentTests };
