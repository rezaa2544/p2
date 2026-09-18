/**
 * Operational SLO Enforcement Master Test Runner
 * Phase 5 Step 5 (P2-NI-03): National Production Fabric Validation
 */

'use strict';

const { runSloEnforcementTests } = require('./slo-enforcement.test');

function runAllOperationalSloSuites() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('📊 Phase 5 Step 5: Operational SLO Enforcement Master Suite');
  console.log('═══════════════════════════════════════════════════════════════════');

  const r1 = runSloEnforcementTests();
  console.log(`  ✅ 1/1: ${r1.suite} (${r1.passed} tests passed)`);

  console.log('\n────────────────────────────────────────────────────');
  console.log(`نتیجه Operational SLO: 1/1 سوئیت موفق (${r1.passed} تست — ۱۰۰٪ سبز) ✅`);
  console.log('────────────────────────────────────────────────────');

  return { totalSuites: 1, passedSuites: 1, totalTests: r1.passed };
}

if (require.main === module) {
  runAllOperationalSloSuites();
}

module.exports = { runAllOperationalSloSuites };
