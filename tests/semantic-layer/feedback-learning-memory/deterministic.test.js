/**
 * آزمون ۹: آزمون قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت در ۱۰ اجرای متوالی
 */

'use strict';

const assert = require('assert');
const {
  recordActionOutcome,
  analyzeRecommendationAccuracy,
  calculateInterventionSuccessPatterns,
  calculateIntelligenceMaturity,
  buildOrganizationalLearningProfile,
  calibrateRecommendationsWithMemory
} = require('../../../server/analytics/intelligence-feedback-memory');

function runTests() {
  console.log('▸ تست ۹: آزمون قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت (Deterministic 10-Execution)');

  const sampleAction = { action_id: 'ACT-01', school_id: 101, action_type: 'ATTENDANCE_SUPPORT' };
  const sampleFeedback = {
    decision: 'APPROVED',
    actor_id: 'usr-01',
    actor_role: 'manager',
    outcome: 'HIGHLY_EFFECTIVE',
    delta_metrics: { delta_attendance: 5.5, delta_gpa: 1.0, delta_engagement: 10.0 }
  };

  const sampleHistory = [
    { action_id: 'ACT-01', decision: 'APPROVED', status: 'COMPLETED', outcome: 'HIGHLY_EFFECTIVE' },
    { action_id: 'ACT-02', decision: 'REJECTED', rejected_reason: 'MISDIAGNOSIS', status: 'CANCELLED' }
  ];

  let firstRecorded = null;
  let firstAccuracy = null;
  let firstPatterns = null;
  let firstMaturity = null;
  let firstProfile = null;
  let firstCalibrated = null;

  for (let i = 0; i < 10; i++) {
    const recorded = recordActionOutcome(sampleAction, sampleFeedback, {
      schoolId: 101,
      timestamp: '2026-09-18T12:00:00.000Z'
    });
    const accuracy = analyzeRecommendationAccuracy(sampleHistory, { timestamp: '2026-09-18T12:00:00.000Z' });
    const patterns = calculateInterventionSuccessPatterns([
      { action_type: 'ATTENDANCE_SUPPORT', effectiveness_level: 'HIGHLY_EFFECTIVE' }
    ], {}, { timestamp: '2026-09-18T12:00:00.000Z' });
    const maturity = calculateIntelligenceMaturity({
      feedback_quality: 80,
      action_effectiveness: 75,
      learning_retention: 70,
      governance_compliance: 100
    }, { timestamp: '2026-09-18T12:00:00.000Z' });
    const profile = buildOrganizationalLearningProfile({
      schoolId: 101,
      regionId: 1,
      history: sampleHistory,
      options: { timestamp: '2026-09-18T12:00:00.000Z' }
    });
    const calibrated = calibrateRecommendationsWithMemory([
      { recommendation_id: 'REC-01', action_type: 'ATTENDANCE_SUPPORT', priority_score: 60 }
    ], patterns);

    const sRecorded = JSON.stringify(recorded);
    const sAccuracy = JSON.stringify(accuracy);
    const sPatterns = JSON.stringify(patterns);
    const sMaturity = JSON.stringify(maturity);
    const sProfile = JSON.stringify(profile);
    const sCalibrated = JSON.stringify(calibrated);

    if (i === 0) {
      firstRecorded = sRecorded;
      firstAccuracy = sAccuracy;
      firstPatterns = sPatterns;
      firstMaturity = sMaturity;
      firstProfile = sProfile;
      firstCalibrated = sCalibrated;
    } else {
      assert.strictEqual(sRecorded, firstRecorded, `عدم تطابق قطعیت در اجرای ${i} برای recordActionOutcome`);
      assert.strictEqual(sAccuracy, firstAccuracy, `عدم تطابق قطعیت در اجرای ${i} برای analyzeRecommendationAccuracy`);
      assert.strictEqual(sPatterns, firstPatterns, `عدم تطابق قطعیت در اجرای ${i} برای calculateInterventionSuccessPatterns`);
      assert.strictEqual(sMaturity, firstMaturity, `عدم تطابق قطعیت در اجرای ${i} برای calculateIntelligenceMaturity`);
      assert.strictEqual(sProfile, firstProfile, `عدم تطابق قطعیت در اجرای ${i} برای buildOrganizationalLearningProfile`);
      assert.strictEqual(sCalibrated, firstCalibrated, `عدم تطابق قطعیت در اجرای ${i} برای calibrateRecommendationsWithMemory`);
    }
  }

  console.log('  ✅ قطعیت جبری ۱۰۰٪ و برابری باینری تمامی محاسبات در ۱۰ تکرار متوالی اثبات شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
