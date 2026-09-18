/**
 * سوئیت جامع آزمون‌های شبکه بینش و اقدام منطقه‌ای هوشمندی آموزشی (P0-EI-10)
 */

'use strict';

const snapshotBuilderTest = require('./snapshot-builder.test');
const needsAnalysisTest = require('./needs-analysis.test');
const patternDetectionTest = require('./pattern-detection.test');
const actionPlanTest = require('./action-plan.test');
const noRankingTest = require('./no-ranking.test');
const privacyAggregationTest = require('./privacy-aggregation.test');
const deterministicTest = require('./deterministic.test');
const mutationSafetyTest = require('./mutation-safety.test');
const tenantIsolationTest = require('./tenant-isolation.test');

function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  P0-EI-10: Regional Educational Intelligence Network Suite        ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  snapshotBuilderTest.runTest();
  needsAnalysisTest.runTest();
  patternDetectionTest.runTest();
  actionPlanTest.runTest();
  noRankingTest.runTest();
  privacyAggregationTest.runTest();
  deterministicTest.runTest();
  mutationSafetyTest.runTest();
  tenantIsolationTest.runTest();

  console.log('\n✅ تمامی ۹ سوئیت آزمون شبکه بینش منطقه‌ای با موفقیت پاس شدند.');
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
