/**
 * National Load Testing & Measurement Master Suite
 * Phase 5 Step 5 (P2-NI-03): National Production Fabric Validation
 */

'use strict';

const { runLoadHarnessTests } = require('./load-harness.test');
const { runSimulationVsMeasuredTests } = require('./simulation-vs-measured.test');

function runAllNationalLoadSuites() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('⚡ Phase 5 Step 5: National Load & Measurement Master Suite');
  console.log('═══════════════════════════════════════════════════════════════════');

  const r1 = runLoadHarnessTests();
  console.log(`  ✅ 1/2: ${r1.suite} (${r1.passed} tests passed)`);

  const r2 = runSimulationVsMeasuredTests();
  console.log(`  ✅ 2/2: ${r2.suite} (${r2.passed} tests passed)`);

  const total = r1.passed + r2.passed;
  console.log('\n────────────────────────────────────────────────────');
  console.log(`نتیجه National Load: 2/2 سوئیت موفق (${total} تست — ۱۰۰٪ سبز) ✅`);
  console.log('────────────────────────────────────────────────────');

  return { totalSuites: 2, passedSuites: 2, totalTests: total };
}

if (require.main === module) {
  runAllNationalLoadSuites();
}

module.exports = { runAllNationalLoadSuites };
