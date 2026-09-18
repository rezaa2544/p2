/**
 * آزمون ۴: سنجش شاخص بلوغ هوشمندی آموزشی (calculateIntelligenceMaturity)
 */

'use strict';

const assert = require('assert');
const {
  calculateIntelligenceMaturity,
  MATURITY_LEVEL
} = require('../../../server/analytics/intelligence-feedback-memory');

function runTests() {
  console.log('▸ تست ۴: سنجش شاخص بلوغ هوشمندی آموزشی (calculateIntelligenceMaturity)');

  // آزمون ۱: سطح بهینه‌یافته (OPTIMIZED >= 85)
  // 0.30 * 90 + 0.25 * 85 + 0.25 * 90 + 0.20 * 100 = 27 + 21.25 + 22.5 + 20 = 90.75 -> 90.8
  const optimizedData = {
    feedback_quality: 90,
    action_effectiveness: 85,
    learning_retention: 90,
    governance_compliance: 100
  };
  const resOpt = calculateIntelligenceMaturity(optimizedData);
  assert.strictEqual(resOpt.level, MATURITY_LEVEL.OPTIMIZED);
  assert.strictEqual(resOpt.score, 90.8);

  // آزمون ۲: سطح تثبیت‌شده (ESTABLISHED 65 - 84.9)
  // 0.30 * 70 + 0.25 * 70 + 0.25 * 60 + 0.20 * 100 = 21 + 17.5 + 15 + 20 = 73.5
  const estData = {
    feedback_quality: 70,
    action_effectiveness: 70,
    learning_retention: 60,
    governance_compliance: 100
  };
  const resEst = calculateIntelligenceMaturity(estData);
  assert.strictEqual(resEst.level, MATURITY_LEVEL.ESTABLISHED);
  assert.strictEqual(resEst.score, 73.5);

  // آزمون ۳: سطح در حال توسعه (DEVELOPING 40 - 64.9)
  // 0.30 * 40 + 0.25 * 40 + 0.25 * 40 + 0.20 * 80 = 12 + 10 + 10 + 16 = 48.0
  const devData = {
    feedback_quality: 40,
    action_effectiveness: 40,
    learning_retention: 40,
    governance_compliance: 80
  };
  const resDev = calculateIntelligenceMaturity(devData);
  assert.strictEqual(resDev.level, MATURITY_LEVEL.DEVELOPING);
  assert.strictEqual(resDev.score, 48.0);

  // آزمون ۴: سطح اولیه (INITIAL < 40)
  // 0.30 * 20 + 0.25 * 20 + 0.25 * 10 + 0.20 * 50 = 6 + 5 + 2.5 + 10 = 23.5
  const initData = {
    feedback_quality: 20,
    action_effectiveness: 20,
    learning_retention: 10,
    governance_compliance: 50
  };
  const resInit = calculateIntelligenceMaturity(initData);
  assert.strictEqual(resInit.level, MATURITY_LEVEL.INITIAL);
  assert.strictEqual(resInit.score, 23.5);

  console.log('  ✅ محاسبه فرمول وزنی و سطوح چهارگانه بلوغ با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
