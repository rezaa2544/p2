/**
 * رانر تجمیعی آزمون‌های موتور شبیه‌سازی خط‌مشی‌های آموزشی (P0-EI-16)
 * Educational Intelligence Command & Policy Simulation Layer Comprehensive Test Suite
 */

'use strict';

const test1 = require('./scenario-builder.test');
const test2 = require('./policy-comparison.test');
const test3 = require('./impact-analysis.test');
const test4 = require('./uncertainty.test');
const test5 = require('./human-review.test');
const test6 = require('./no-ranking.test');
const test7 = require('./privacy.test');
const test8 = require('./deterministic.test');
const test9 = require('./mutation-safety.test');
const test10 = require('./tenant-isolation.test');

function runAllTests() {
  console.log('\n=============================================================');
  console.log('🔮 اجرای آزمون‌های موتور شبیه‌سازی خط‌مشی‌های آموزشی (P0-EI-16)');
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

  console.log('\n🎉 تمام ۱۰ ماژول آزمون موتور شبیه‌سازی خط‌مشی با موفقیت ۱۰۰٪ پاس شدند!\n');
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
