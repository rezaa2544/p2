/**
 * رانر تجمیعی آزمون‌های زیرساخت مقیاس‌پذیری و آمادگی تولید (P1-SC-01)
 * tests/infrastructure/scalability/index.test.js
 */

'use strict';

const tenantIsolationTest = require('./tenant-isolation.test');
const cacheEfficiencyTest = require('./cache-efficiency.test');
const bottlenecksTest = require('./bottlenecks.test');
const readinessSnapshotTest = require('./readiness-snapshot.test');
const humanSovereigntyTest = require('./human-sovereignty.test');
const zeroRankingTest = require('./zero-ranking.test');
const deterministicTest = require('./deterministic.test');

function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Phase 4 — P1-SC-01: Scalability Foundation & Readiness Suite    ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  tenantIsolationTest.runTests();
  cacheEfficiencyTest.runTests();
  bottlenecksTest.runTests();
  readinessSnapshotTest.runTests();
  humanSovereigntyTest.runTests();
  zeroRankingTest.runTests();
  deterministicTest.runTests();

  console.log('\n✅ تمامی ۷ سوئیت آزمون زیرساخت مقیاس‌پذیری و آمادگی تولید با موفقیت پاس شدند.\n');
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
