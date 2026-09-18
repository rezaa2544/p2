/**
 * رانر تجمیعی آزمون‌های صدور گواهی و انتشار فاز ۳ (P0-EI-21)
 * tests/semantic-layer/intelligence-certification/index.test.js
 */

'use strict';

const completenessTest = require('./engine-completeness.test');
const e2eChainTest = require('./e2e-chain.test');
const humanSovereigntyTest = require('./human-sovereignty.test');
const zeroRankingTest = require('./zero-ranking.test');
const securityGatesTest = require('./security-gates.test');
const documentationGatesTest = require('./documentation-gates.test');
const releaseCertificateTest = require('./release-certificate.test');
const deterministicTest = require('./deterministic.test');

function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Phase 3 — P0-EI-21: Final Intelligence Certification Gate Suite  ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  completenessTest.runTests();
  e2eChainTest.runTests();
  humanSovereigntyTest.runTests();
  zeroRankingTest.runTests();
  securityGatesTest.runTests();
  documentationGatesTest.runTests();
  releaseCertificateTest.runTests();
  deterministicTest.runTests();

  console.log('\n✅ تمامی ۸ سوئیت آزمون صدور گواهینامه و گیت انتشار فاز ۳ با موفقیت پاس شدند.\n');
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
