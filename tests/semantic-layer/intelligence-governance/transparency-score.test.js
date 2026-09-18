/**
 * آزمون ۲: سنجش شاخص شفافیت هوش مصنوعی (calculateAITransparencyScore)
 */

'use strict';

const assert = require('assert');
const {
  calculateAITransparencyScore,
  TRANSPARENCY_LEVEL
} = require('../../../server/analytics/intelligence-governance-dashboard');

function runTests() {
  console.log('▸ تست ۲: سنجش شاخص شفافیت هوش مصنوعی (calculateAITransparencyScore)');

  // آزمون ۱: سطح عالی (EXCELLENT >= 85)
  // 0.30 * 95 + 0.25 * 90 + 0.20 * 90 + 0.15 * 95 + 0.10 * 100 = 28.5 + 22.5 + 18.0 + 14.25 + 10.0 = 93.25 -> 93.3
  const excData = {
    explainability: 95,
    evidenceAvailability: 90,
    humanApprovalRate: 90,
    auditCoverage: 95,
    privacyCompliance: 100
  };
  const resExc = calculateAITransparencyScore(excData);
  assert.strictEqual(resExc.level, TRANSPARENCY_LEVEL.EXCELLENT);
  assert.strictEqual(resExc.score, 93.3);

  // آزمون ۲: سطح خوب (GOOD 70 - 84.9)
  // 0.30 * 75 + 0.25 * 70 + 0.20 * 80 + 0.15 * 70 + 0.10 * 100 = 22.5 + 17.5 + 16.0 + 10.5 + 10.0 = 76.5
  const goodData = {
    explainability: 75,
    evidenceAvailability: 70,
    humanApprovalRate: 80,
    auditCoverage: 70,
    privacyCompliance: 100
  };
  const resGood = calculateAITransparencyScore(goodData);
  assert.strictEqual(resGood.level, TRANSPARENCY_LEVEL.GOOD);
  assert.strictEqual(resGood.score, 76.5);

  // آزمون ۳: سطح متوسط (MODERATE 50 - 69.9)
  // 0.30 * 60 + 0.25 * 50 + 0.20 * 60 + 0.15 * 50 + 0.10 * 80 = 18 + 12.5 + 12 + 7.5 + 8 = 58.0
  const modData = {
    explainability: 60,
    evidenceAvailability: 50,
    humanApprovalRate: 60,
    auditCoverage: 50,
    privacyCompliance: 80
  };
  const resMod = calculateAITransparencyScore(modData);
  assert.strictEqual(resMod.level, TRANSPARENCY_LEVEL.MODERATE);
  assert.strictEqual(resMod.score, 58.0);

  // آزمون ۴: سطح نامطلوب (LOW < 50)
  // 0.30 * 30 + 0.25 * 20 + 0.20 * 40 + 0.15 * 30 + 0.10 * 50 = 9 + 5 + 8 + 4.5 + 5 = 31.5
  const lowData = {
    explainability: 30,
    evidenceAvailability: 20,
    humanApprovalRate: 40,
    auditCoverage: 30,
    privacyCompliance: 50
  };
  const resLow = calculateAITransparencyScore(lowData);
  assert.strictEqual(resLow.level, TRANSPARENCY_LEVEL.LOW);
  assert.strictEqual(resLow.score, 31.5);

  console.log('  ✅ محاسبه فرمول وزنی شفافیت و سطوح چهارگانه با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
