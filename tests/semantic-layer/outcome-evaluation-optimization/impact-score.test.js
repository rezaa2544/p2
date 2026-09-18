/**
 * آزمون ۲: محاسبه فرمول قطعی امتیاز اثرگذاری مداخله (calculateInterventionImpactScore)
 */

'use strict';

const assert = require('assert');
const {
  calculateInterventionImpactScore,
  IMPACT_LEVEL
} = require('../../../server/analytics/outcome-evaluation-optimization');

function runTests() {
  console.log('▸ تست ۲: فرمول پنج‌عامله امتیاز اثرگذاری و رده‌بندی کیفی (impact-score)');

  // ۱. حالت نمونه (EXEMPLARY >= 85)
  // 0.35 * 90 + 0.25 * 90 + 0.20 * 90 + 0.20 * 90 = 90.0
  const r1 = calculateInterventionImpactScore({
    outcomeImprovement: 90,
    goalAchievement: 90,
    sustainability: 90,
    evidenceConfidence: 90
  });
  assert.strictEqual(r1.impact_score, 90.0);
  assert.strictEqual(r1.impact_level, IMPACT_LEVEL.EXEMPLARY);

  // ۲. حالت اثربخش (EFFECTIVE: 70..84.9)
  // 0.35 * 75 + 0.25 * 75 + 0.20 * 75 + 0.20 * 75 = 75.0
  const r2 = calculateInterventionImpactScore({
    outcomeImprovement: 75,
    goalAchievement: 75,
    sustainability: 75,
    evidenceConfidence: 75
  });
  assert.strictEqual(r2.impact_score, 75.0);
  assert.strictEqual(r2.impact_level, IMPACT_LEVEL.EFFECTIVE);

  // ۳. حالت متوسط (MODERATE: 50..69.9)
  // 0.35 * 60 + 0.25 * 60 + 0.20 * 60 + 0.20 * 60 = 60.0
  const r3 = calculateInterventionImpactScore({
    outcomeImprovement: 60,
    goalAchievement: 60,
    sustainability: 60,
    evidenceConfidence: 60
  });
  assert.strictEqual(r3.impact_score, 60.0);
  assert.strictEqual(r3.impact_level, IMPACT_LEVEL.MODERATE);

  // ۴. حالت کم‌اثر (INEFFECTIVE: 30..49.9)
  // 0.35 * 40 + 0.25 * 40 + 0.20 * 40 + 0.20 * 40 = 40.0
  const r4 = calculateInterventionImpactScore({
    outcomeImprovement: 40,
    goalAchievement: 40,
    sustainability: 40,
    evidenceConfidence: 40
  });
  assert.strictEqual(r4.impact_score, 40.0);
  assert.strictEqual(r4.impact_level, IMPACT_LEVEL.INEFFECTIVE);

  // ۵. حالت نامطلوب (ADVERSE < 30)
  // 0.35 * 20 + 0.25 * 20 + 0.20 * 20 + 0.20 * 20 = 20.0
  const r5 = calculateInterventionImpactScore({
    outcomeImprovement: 20,
    goalAchievement: 20,
    sustainability: 20,
    evidenceConfidence: 20
  });
  assert.strictEqual(r5.impact_score, 20.0);
  assert.strictEqual(r5.impact_level, IMPACT_LEVEL.ADVERSE);

  console.log('  ✅ صحت اوزان (0.35, 0.25, 0.20, 0.20) و سطوح پنج‌گانه با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
