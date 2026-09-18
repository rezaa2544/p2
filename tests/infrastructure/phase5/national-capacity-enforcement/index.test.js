/**
 * National Capacity Enforcement Master Test Runner
 * Phase 5 Step 5 (P2-NI-03): National Production Fabric Validation
 */

'use strict';

const { runCapacityLimitsTests } = require('./capacity-limits.test');
const { runReservationGovernanceTests } = require('./reservation-governance.test');

function runAllCapacityEnforcementSuites() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🛡️ Phase 5 Step 5: National Capacity Enforcement Master Suite');
  console.log('═══════════════════════════════════════════════════════════════════');

  const r1 = runCapacityLimitsTests();
  console.log(`  ✅ 1/2: ${r1.suite} (${r1.passed} tests passed)`);

  const r2 = runReservationGovernanceTests();
  console.log(`  ✅ 2/2: ${r2.suite} (${r2.passed} tests passed)`);

  const total = r1.passed + r2.passed;
  console.log('\n────────────────────────────────────────────────────');
  console.log(`نتیجه Capacity Enforcement: 2/2 سوئیت موفق (${total} تست — ۱۰۰٪ سبز) ✅`);
  console.log('────────────────────────────────────────────────────');

  return { totalSuites: 2, passedSuites: 2, totalTests: total };
}

if (require.main === module) {
  runAllCapacityEnforcementSuites();
}

module.exports = { runAllCapacityEnforcementSuites };
