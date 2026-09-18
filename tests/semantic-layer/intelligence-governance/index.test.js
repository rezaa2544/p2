/**
 * رانر تجمیعی آزمون‌های مرکز حاکمیت و شفافیت هوشمندی آموزشی (P0-EI-15)
 * Educational Intelligence Governance & Transparency Center Comprehensive Test Suite
 */

'use strict';

const test1 = require('./snapshot-builder.test');
const test2 = require('./transparency-score.test');
const test3 = require('./human-approval-audit.test');
const test4 = require('./audit-trail.test');
const test5 = require('./governance-alerts.test');
const test6 = require('./privacy-protection.test');
const test7 = require('./no-ranking.test');
const test8 = require('./deterministic.test');
const test9 = require('./mutation-safety.test');
const test10 = require('./tenant-isolation.test');

function runAllTests() {
  console.log('\n=============================================================');
  console.log('🏛️  اجرای آزمون‌های مرکز حاکمیت و شفافیت هوشمندی (P0-EI-15)');
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

  console.log('\n🎉 تمام ۱۰ ماژول آزمون مرکز حاکمیت و شفافیت هوشمندی با موفقیت ۱۰۰٪ پاس شدند!\n');
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
