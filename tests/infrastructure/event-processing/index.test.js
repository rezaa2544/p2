/**
 * رانر تجمیعی آزمون‌های پردازش غیرهمگام توزیع‌شده و مدیریت بار (P1-SC-02)
 * tests/infrastructure/event-processing/index.test.js
 */

'use strict';

const tenantIsolationTest = require('./tenant-isolation.test');
const idempotencyTest = require('./idempotency.test');
const retryCorrectnessTest = require('./retry-correctness.test');
const deadLetterHandlingTest = require('./dead-letter-handling.test');
const deterministicTest = require('./deterministic.test');
const humanSovereigntyTest = require('./human-sovereignty.test');
const zeroRankingTest = require('./zero-ranking.test');

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Phase 4 — P1-SC-02: Event Processing & Load Management Suite     ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  tenantIsolationTest.runTests();
  await idempotencyTest.runTests();
  retryCorrectnessTest.runTests();
  deadLetterHandlingTest.runTests();
  deterministicTest.runTests();
  humanSovereigntyTest.runTests();
  zeroRankingTest.runTests();

  console.log('\n✅ تمامی ۷ سوئیت آزمون لایه پردازش رویدادها با موفقیت پاس شدند.\n');
}

if (require.main === module) {
  runAllTests().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runAllTests };
