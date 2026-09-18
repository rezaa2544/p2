/**
 * شاخص تجمیعی آزمون‌های موتور پیشنهاددهنده و برنامه‌ریزی اقدام آموزشی (P0-EI-13)
 */

'use strict';

const recGenTest = require('./recommendation-generation.test');
const priorityTest = require('./priority-scoring.test');
const ownerTest = require('./owner-assignment.test');
const lifecycleTest = require('./action-lifecycle.test');
const effectivenessTest = require('./effectiveness-evaluation.test');
const humanInLoopTest = require('./human-in-loop.test');
const noRankingTest = require('./no-ranking.test');
const deterministicTest = require('./deterministic.test');
const mutationSafetyTest = require('./mutation-safety.test');
const tenantIsolationTest = require('./tenant-isolation.test');

function runAllTests() {
  console.log('\n=============================================================');
  console.log('🎯 اجرای مجموعه آزمون‌های موتور پیشنهاددهنده و برنامه‌ریزی اقدام (P0-EI-13)');
  console.log('=============================================================\n');

  recGenTest.runTest();
  priorityTest.runTest();
  ownerTest.runTest();
  lifecycleTest.runTest();
  effectivenessTest.runTest();
  humanInLoopTest.runTest();
  noRankingTest.runTest();
  deterministicTest.runTest();
  mutationSafetyTest.runTest();
  tenantIsolationTest.runTest();

  console.log('\n🎉 تمام ۱۰ ماژول آزمون موتور پیشنهاددهنده و برنامه‌ریزی اقدام با موفقیت ۱۰۰٪ پاس شدند!\n');
}

module.exports = { runAllTests };
if (require.main === module) runAllTests();
