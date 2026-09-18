/**
 * آزمون ۸: آزمون قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت در ۱۰ اجرای متوالی
 */

'use strict';

const assert = require('assert');
const {
  evaluateOperationalOutcome,
  calculateInterventionImpactScore,
  detectLearningPatterns,
  generateOptimizationInsights,
  buildOutcomeEvaluationSnapshot
} = require('../../../server/analytics/outcome-evaluation-optimization');

function runTests() {
  console.log('▸ تست ۸: آزمون قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت (deterministic)');

  const mockParams = {
    task: { task_id: 'TASK-DET-01', decision_id: 'DEC-DET-01', title: 'اقدام قطعی', domain: 'ACADEMIC' },
    baselineMetrics: { attendance_pct: 85, gpa: 14.5, engagement_pct: 60, wellbeing_pct: 55 },
    postMetrics: { attendance_pct: 90, gpa: 16.0, engagement_pct: 75, wellbeing_pct: 70 },
    goalAchievementPct: 90,
    sustainabilityScore: 85,
    evidenceConfidence: 90,
    options: { timestamp: '2026-09-18T12:00:00.000Z' }
  };

  let firstOutcome = null;
  let firstScore = null;
  let firstPatterns = null;
  let firstInsights = null;
  let firstSnapshot = null;

  for (let i = 0; i < 10; i++) {
    const outcome = evaluateOperationalOutcome(mockParams);
    const score = calculateInterventionImpactScore({
      outcomeImprovement: 80,
      goalAchievement: 85,
      sustainability: 80,
      evidenceConfidence: 90
    });
    const patterns = detectLearningPatterns([outcome], { timestamp: '2026-09-18T12:00:00.000Z' });
    const insights = generateOptimizationInsights({ schoolId: 101, options: { timestamp: '2026-09-18T12:00:00.000Z' } });
    const snapshot = buildOutcomeEvaluationSnapshot({ schoolId: 101, regionId: 1, evaluations: [outcome], options: { timestamp: '2026-09-18T12:00:00.000Z' } });

    const sOutcome = JSON.stringify(outcome);
    const sScore = JSON.stringify(score);
    const sPatterns = JSON.stringify(patterns);
    const sInsights = JSON.stringify(insights);
    const sSnapshot = JSON.stringify(snapshot);

    if (i === 0) {
      firstOutcome = sOutcome;
      firstScore = sScore;
      firstPatterns = sPatterns;
      firstInsights = sInsights;
      firstSnapshot = sSnapshot;
    } else {
      assert.strictEqual(sOutcome, firstOutcome, `عدم تطابق قطعیت در evaluateOperationalOutcome در تکرار ${i}`);
      assert.strictEqual(sScore, firstScore, `عدم تطابق قطعیت در calculateInterventionImpactScore در تکرار ${i}`);
      assert.strictEqual(sPatterns, firstPatterns, `عدم تطابق قطعیت در detectLearningPatterns در تکرار ${i}`);
      assert.strictEqual(sInsights, firstInsights, `عدم تطابق قطعیت در generateOptimizationInsights در تکرار ${i}`);
      assert.strictEqual(sSnapshot, firstSnapshot, `عدم تطابق قطعیت در buildOutcomeEvaluationSnapshot در تکرار ${i}`);
    }
  }

  console.log('  ✅ قطعیت جبری ۱۰۰٪ و برابری باینری تمامی توابع در ۱۰ تکرار متوالی اثبات شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
