/**
 * آزمون ۲: تحلیل کمّی کیفیت و دقت پیشنهادهای تولیدشده (analyzeRecommendationAccuracy)
 */

'use strict';

const assert = require('assert');
const {
  analyzeRecommendationAccuracy,
  RECOMMENDATION_DECISION,
  INTERVENTION_SUCCESS_LEVEL
} = require('../../../server/analytics/intelligence-feedback-memory');

function runTests() {
  console.log('▸ تست ۲: تحلیل کمّی کیفیت و دقت پیشنهادهای پیشین (analyzeRecommendationAccuracy)');

  const sampleHistory = [
    {
      action_id: 'ACT-01',
      decision: RECOMMENDATION_DECISION.APPROVED,
      status: 'COMPLETED',
      outcome: INTERVENTION_SUCCESS_LEVEL.HIGHLY_EFFECTIVE
    },
    {
      action_id: 'ACT-02',
      decision: RECOMMENDATION_DECISION.APPROVED,
      status: 'COMPLETED',
      outcome: INTERVENTION_SUCCESS_LEVEL.PARTIALLY_EFFECTIVE
    },
    {
      action_id: 'ACT-03',
      decision: RECOMMENDATION_DECISION.APPROVED,
      status: 'COMPLETED',
      outcome: INTERVENTION_SUCCESS_LEVEL.INEFFECTIVE
    },
    {
      action_id: 'ACT-04',
      decision: RECOMMENDATION_DECISION.REJECTED,
      rejected_reason: 'MISDIAGNOSIS',
      status: 'CANCELLED'
    },
    {
      action_id: 'ACT-05',
      action_type: 'REGIONAL_RESOURCE',
      decision: RECOMMENDATION_DECISION.APPROVED,
      status: 'COMPLETED',
      outcome: INTERVENTION_SUCCESS_LEVEL.REQUIRES_ESCALATION,
      district_confirmed: true
    }
  ];

  const report = analyzeRecommendationAccuracy(sampleHistory, { timestamp: '2026-09-18T12:00:00.000Z' });

  assert.strictEqual(report.total_recommendations, 5, 'تعداد کل پیشنهادها ۵ است');
  assert.strictEqual(report.total_reviewed, 5, 'هر ۵ مورد بررسی شده‌اند');
  assert.strictEqual(report.approved_count, 4, '۴ مورد تأیید شده‌اند');
  assert.strictEqual(report.rejected_count, 1, '۱ مورد رد شده است');

  // Adoption Rate = (4 / 5) * 100 = 80.0%
  assert.strictEqual(report.adoption_rate_pct, 80.0, 'نرخ پذیرش باید ۸۰.۰٪ باشد');

  // Completed Count = 4 (ACT-01, ACT-02, ACT-03, ACT-05)
  // Effective Count = 2 (ACT-01, ACT-02)
  // Precision = (2 / 4) * 100 = 50.0%
  assert.strictEqual(report.precision_pct, 50.0, 'دقت پیشنهادها باید ۵۰.۰٪ باشد');

  // False Positive = (1 rejected + 1 ineffective) / 5 total = 40.0%
  assert.strictEqual(report.false_positive_rate_pct, 40.0, 'نرخ مثبت کاذب باید ۴۰.۰٪ باشد');

  // Escalation Accuracy = 1 confirmed / 1 proposed = 100.0%
  assert.strictEqual(report.escalation_accuracy_pct, 100.0, 'دقت ارجاع باید ۱۰۰.۰٪ باشد');

  // آزمون آرایه خالی
  const emptyReport = analyzeRecommendationAccuracy([], { timestamp: '2026-09-18T12:00:00.000Z' });
  assert.strictEqual(emptyReport.total_recommendations, 0);
  assert.strictEqual(emptyReport.adoption_rate_pct, 0.0);
  assert.strictEqual(emptyReport.precision_pct, 0.0);

  console.log('  ✅ تحلیل کمّی شاخص‌های دقت، نرخ پذیرش و مثبت کاذب با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
