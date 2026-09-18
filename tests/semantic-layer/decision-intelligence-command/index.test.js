/**
 * رانر تجمیعی آزمون‌های لایه هوش تصمیم و ارکستراسیون فرمان آموزشی (P0-EI-17)
 * Educational Decision Intelligence & Command Orchestration Layer Comprehensive Suite
 */

'use strict';

const test1 = require('./command-snapshot.test');
const test2 = require('./priority-matrix.test');
const test3 = require('./human-workflow.test');
const test4 = require('./chain-integrity.test');
const test5 = require('./governance-validation.test');
const test6 = require('./no-ranking.test');
const test7 = require('./privacy.test');
const test8 = require('./deterministic.test');
const test9 = require('./mutation-safety.test');
const test10 = require('./tenant-isolation.test');

function runAllTests() {
  console.log('\n=============================================================');
  console.log('⚡ اجرای آزمون‌های لایه هوش تصمیم و ارکستراسیون فرمان (P0-EI-17)');
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

  console.log('\n🎉 تمام ۱۰ ماژول آزمون هوش تصمیم و ارکستراسیون فرمان با موفقیت ۱۰۰٪ پاس شدند!\n');
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
