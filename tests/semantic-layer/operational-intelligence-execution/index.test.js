/**
 * رانر تجمیعی آزمون‌های لایه اجرای عملیاتی هوشمندی آموزشی (P0-EI-18)
 * Operational Intelligence Execution Layer Comprehensive Suite
 */

'use strict';

const test1 = require('./workflow-creation.test');
const test2 = require('./state-machine.test');
const test3 = require('./owner-assignment.test');
const test4 = require('./sla-calculation.test');
const test5 = require('./progress-tracking.test');
const test6 = require('./blocker-detection.test');
const test7 = require('./dashboard-builder.test');
const test8 = require('./no-ranking.test');
const test9 = require('./privacy.test');
const test10 = require('./deterministic.test');
const test11 = require('./mutation-safety.test');
const test12 = require('./tenant-isolation.test');

function runAllTests() {
  console.log('\n=============================================================');
  console.log('⚡ اجرای آزمون‌های لایه اجرای عملیاتی هوشمندی (P0-EI-18)');
  console.log('=============================================================\n');

  test1.runTests();
  test2.runTests();
  test3.runTests();
  test4.runTests();
  test5.runTests();
  test6.runTests();
  test7.runTests();
  test8.runTests();
  test9.runTests();
  test10.runTests();
  test11.runTests();
  test12.runTests();

  console.log('\n🎉 تمام ۱۲ ماژول آزمون اجرای عملیاتی هوشمندی با موفقیت ۱۰۰٪ پاس شدند!\n');
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
