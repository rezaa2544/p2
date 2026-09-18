/**
 * رانر تجمیعی آزمون‌های لایه یکپارچه‌سازی پلتفرم هوشمندی آموزشی (P0-EI-20)
 * Educational Intelligence Platform Integration Layer Comprehensive Suite
 */

'use strict';

const test1 = require('./engine-registry.test');
const test2 = require('./compatibility.test');
const test3 = require('./chain-health.test');
const test4 = require('./tenant-isolation.test');
const test5 = require('./human-control.test');
const test6 = require('./zero-ranking.test');
const test7 = require('./mutation-safety.test');
const test8 = require('./deterministic.test');

function runAllTests() {
  console.log('\n=============================================================');
  console.log('⚡ اجرای آزمون‌های لایه یکپارچه‌سازی پلتفرم هوشمندی (P0-EI-20)');
  console.log('=============================================================\n');

  test1.runTests();
  test2.runTests();
  test3.runTests();
  test4.runTests();
  test5.runTests();
  test6.runTests();
  test7.runTests();
  test8.runTests();

  console.log('\n🎉 تمام ۸ ماژول آزمون یکپارچه‌سازی پلتفرم هوشمندی با موفقیت ۱۰۰٪ پاس شدند!\n');
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
