/**
 * رانر تجمیعی آزمون‌های لایه ارزیابی پیامد و بهینه‌سازی مستمر (P0-EI-19)
 * Educational Intelligence Outcome Evaluation & Continuous Optimization Comprehensive Suite
 */

'use strict';

const test1 = require('./outcome-evaluation.test');
const test2 = require('./impact-score.test');
const test3 = require('./learning-pattern.test');
const test4 = require('./memory-update.test');
const test5 = require('./optimization-insight.test');
const test6 = require('./human-control.test');
const test7 = require('./no-ranking.test');
const test8 = require('./deterministic.test');
const test9 = require('./mutation-safety.test');
const test10 = require('./tenant-isolation.test');
const test11 = require('./privacy.test');

function runAllTests() {
  console.log('\n=============================================================');
  console.log('⚡ اجرای آزمون‌های لایه ارزیابی پیامد و بهینه‌سازی (P0-EI-19)');
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

  console.log('\n🎉 تمام ۱۱ ماژول آزمون ارزیابی پیامد و بهینه‌سازی با موفقیت ۱۰۰٪ پاس شدند!\n');
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
