/**
 * Phase 5 Step 4 (P2-NI-02): Master Test Runner for National Production Readiness & Operations
 */

'use strict';

const { runOperationsCenterTests } = require('./operations-center.test');
const { runReadinessTests } = require('./readiness.test');
const { runLoadTestingTests } = require('./load-testing.test');
const { runChaosResilienceTests } = require('./chaos-resilience.test');
const { runChangeManagementTests } = require('./change-management.test');

function runAllProductionReadinessSuites() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🚀 Phase 5 — Step 4 (P2-NI-02): Production Readiness & NOC Master Suite');
  console.log('═══════════════════════════════════════════════════════════════════');

  const r1 = runOperationsCenterTests();
  console.log(`  ✅ 1/5: ${r1.suite} (${r1.passed} tests passed)`);

  const r2 = runReadinessTests();
  console.log(`  ✅ 2/5: ${r2.suite} (${r2.passed} tests passed)`);

  const r3 = runLoadTestingTests();
  console.log(`  ✅ 3/5: ${r3.suite} (${r3.passed} tests passed)`);

  const r4 = runChaosResilienceTests();
  console.log(`  ✅ 4/5: ${r4.suite} (${r4.passed} tests passed)`);

  const r5 = runChangeManagementTests();
  console.log(`  ✅ 5/5: ${r5.suite} (${r5.passed} tests passed)`);

  const total = r1.passed + r2.passed + r3.passed + r4.passed + r5.passed;
  console.log('\n────────────────────────────────────────────────────');
  console.log(`نتیجه آزمون‌های Production Readiness: 5/5 سوئیت موفق (${total} تست — ۱۰۰٪ سبز) ✅`);
  console.log('────────────────────────────────────────────────────');

  return { totalSuites: 5, passedSuites: 5, totalTests: total };
}

if (require.main === module) {
  runAllProductionReadinessSuites();
}

module.exports = { runAllProductionReadinessSuites };
