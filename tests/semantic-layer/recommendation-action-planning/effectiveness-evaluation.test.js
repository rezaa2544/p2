/**
 * آزمون سنجش اثربخشی اقدام آموزشی (evaluateActionEffectiveness)
 */

'use strict';

const assert = require('assert');
const {
  evaluateActionEffectiveness,
  ACTION_EFFICACY
} = require('../../../server/analytics/recommendation-action-planning');

function runTest() {
  console.log('▸ تست ۵: سنجش اثربخشی چرخه بسته و مقایسه متغیرهای قبل و بعد (evaluateActionEffectiveness)');

  const mockAction = { recommendation_id: 'REC-ATT-101' };

  // سناریو الف: بهبود چشمگیر (HIGHLY_EFFECTIVE)
  const highOutcome = evaluateActionEffectiveness({
    actionRecord: mockAction,
    preMetrics: { attendance_rate: 80.0, chronic_absence_rate: 15.0, average_gpa: 12.0 },
    postMetrics: { attendance_rate: 92.0, chronic_absence_rate: 8.0, average_gpa: 13.5 }
  });

  assert.strictEqual(highOutcome.efficacy, ACTION_EFFICACY.HIGHLY_EFFECTIVE);
  assert.strictEqual(highOutcome.deltas.attendance_rate, 12.0);
  assert.strictEqual(highOutcome.deltas.chronic_absence_rate, -7.0);
  assert.strictEqual(highOutcome.deltas.average_gpa, 1.5);

  // سناریو ب: بهبود نسبی (PARTIALLY_EFFECTIVE)
  const partialOutcome = evaluateActionEffectiveness({
    actionRecord: mockAction,
    preMetrics: { attendance_rate: 85.0, average_gpa: 14.0 },
    postMetrics: { attendance_rate: 87.0, average_gpa: 14.2 }
  });
  assert.strictEqual(partialOutcome.efficacy, ACTION_EFFICACY.PARTIALLY_EFFECTIVE);

  // سناریو ج: بی‌اثر (INEFFECTIVE)
  const ineffectiveOutcome = evaluateActionEffectiveness({
    actionRecord: mockAction,
    preMetrics: { attendance_rate: 85.0, average_gpa: 14.0 },
    postMetrics: { attendance_rate: 85.0, average_gpa: 14.0 }
  });
  assert.strictEqual(ineffectiveOutcome.efficacy, ACTION_EFFICACY.INEFFECTIVE);

  // سناریو د: تشدید و وخامت بحران (REQUIRES_ESCALATION)
  const escalationOutcome = evaluateActionEffectiveness({
    actionRecord: mockAction,
    preMetrics: { chronic_absence_rate: 12.0, average_gpa: 13.0 },
    postMetrics: { chronic_absence_rate: 18.0, average_gpa: 11.5 }
  });
  assert.strictEqual(escalationOutcome.efficacy, ACTION_EFFICACY.REQUIRES_ESCALATION);

  console.log('  ✅ محاسبه دقیق دلتای شاخص‌ها و طبقه‌بندی چهارگانه اثربخشی اقدام');
}

module.exports = { runTest };
if (require.main === module) runTest();
