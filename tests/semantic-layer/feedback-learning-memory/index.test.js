/**
 * رانر تجمیعی آزمون‌های موتور حلقه بازخورد و حافظه راهبری یادگیری (P0-EI-14)
 * Educational Intelligence Feedback Loop & Governance Memory Comprehensive Test Suite
 */

'use strict';

const test1 = require('./record-action-outcome.test');
const test2 = require('./recommendation-accuracy.test');
const test3 = require('./success-patterns.test');
const test4 = require('./maturity-index.test');
const test5 = require('./learning-profile.test');
const test6 = require('./recommendation-calibration.test');
const test7 = require('./human-in-loop.test');
const test8 = require('./no-ranking.test');
const test9 = require('./deterministic.test');
const test10 = require('./mutation-safety.test');
const test11 = require('./tenant-isolation.test');

function runAllTests() {
  console.log('\n=============================================================');
  console.log('🔄 اجرای آزمون‌های موتور حلقه بازخورد و حافظه یادگیری (P0-EI-14)');
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

  console.log('\n🎉 تمام ۱۱ ماژول آزمون موتور حلقه بازخورد و حافظه یادگیری با موفقیت ۱۰۰٪ پاس شدند!\n');
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
