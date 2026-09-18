/**
 * سوئیت جامع آزمون‌های مرکز فرماندهی و هوشمندی مدرسه (P0-EI-09)
 */

'use strict';

const snapshotBuilderTest = require('./snapshot-builder.test');
const healthIndexTest = require('./health-index.test');
const actionCenterTest = require('./action-center.test');
const districtSummaryTest = require('./district-summary.test');
const noRankingTest = require('./no-ranking.test');
const accessGuardTest = require('./access-guard.test');
const deterministicTest = require('./deterministic.test');
const mutationSafetyTest = require('./mutation-safety.test');
const tenantIsolationTest = require('./tenant-isolation.test');

function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  P0-EI-09: School Intelligence Command Center Suite               ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  snapshotBuilderTest.runTest();
  healthIndexTest.runTest();
  actionCenterTest.runTest();
  districtSummaryTest.runTest();
  noRankingTest.runTest();
  accessGuardTest.runTest();
  deterministicTest.runTest();
  mutationSafetyTest.runTest();
  tenantIsolationTest.runTest();

  console.log('\n✅ تمامی ۹ سوئیت آزمون مرکز فرماندهی و هوشمندی مدرسه با موفقیت پاس شدند.');
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
