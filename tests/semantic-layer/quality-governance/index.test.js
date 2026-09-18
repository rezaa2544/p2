/**
 * شاخص تجمیعی آزمون‌های موتور راهبری کیفیت آموزشی و چرخه بهبود مستمر (P0-EI-11)
 */

'use strict';

const accessGuardTest = require('./access-guard.test');
const qualityPillarsTest = require('./quality-pillars.test');
const improvementCycleTest = require('./improvement-cycle.test');
const cycleOutcomeTest = require('./cycle-outcome.test');
const districtGovernanceTest = require('./district-governance.test');
const noRankingTest = require('./no-ranking.test');
const deterministicTest = require('./deterministic.test');
const mutationSafetyTest = require('./mutation-safety.test');
const tenantIsolationTest = require('./tenant-isolation.test');

function runAllTests() {
  console.log('\n=============================================================');
  console.log('🏛️  اجرای مجموعه آزمون‌های راهبری کیفیت و چرخه بهبود مستمر (P0-EI-11)');
  console.log('=============================================================\n');

  accessGuardTest.runTest();
  qualityPillarsTest.runTest();
  improvementCycleTest.runTest();
  cycleOutcomeTest.runTest();
  districtGovernanceTest.runTest();
  noRankingTest.runTest();
  deterministicTest.runTest();
  mutationSafetyTest.runTest();
  tenantIsolationTest.runTest();

  console.log('\n🎉 تمام ۹ ماژول آزمون راهبری کیفیت آموزشی با موفقیت ۱۰۰٪ پاس شدند!\n');
}

module.exports = { runAllTests };
if (require.main === module) runAllTests();
