/**
 * شاخص تجمیعی آزمون‌های موتور پایش طولی هوشمندی آموزشی و کشف روندها (P0-EI-12)
 */

'use strict';

const trendAnalysisTest = require('./trend-analysis.test');
const changePointTest = require('./change-point.test');
const sustainableImprovementTest = require('./sustainable-improvement.test');
const insightGenerationTest = require('./insight-generation.test');
const schoolProfileTest = require('./school-profile.test');
const regionalTrendMapTest = require('./regional-trend-map.test');
const deterministicTest = require('./deterministic.test');
const mutationSafetyTest = require('./mutation-safety.test');
const tenantIsolationTest = require('./tenant-isolation.test');

function runAllTests() {
  console.log('\n=============================================================');
  console.log('📈 اجرای مجموعه آزمون‌های پایش طولی و کشف روندها (P0-EI-12)');
  console.log('=============================================================\n');

  trendAnalysisTest.runTest();
  changePointTest.runTest();
  sustainableImprovementTest.runTest();
  insightGenerationTest.runTest();
  schoolProfileTest.runTest();
  regionalTrendMapTest.runTest();
  deterministicTest.runTest();
  mutationSafetyTest.runTest();
  tenantIsolationTest.runTest();

  console.log('\n🎉 تمام ۹ ماژول آزمون پایش طولی و کشف روندها با موفقیت ۱۰۰٪ پاس شدند!\n');
}

module.exports = { runAllTests };
if (require.main === module) runAllTests();
