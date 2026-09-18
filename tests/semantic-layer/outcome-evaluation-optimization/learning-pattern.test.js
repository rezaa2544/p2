/**
 * آزمون ۳: کشف الگوهای چهارگانه یادگیری سازمانی (detectLearningPatterns)
 */

'use strict';

const assert = require('assert');
const {
  detectLearningPatterns,
  LEARNING_PATTERN_TYPE,
  IMPACT_LEVEL
} = require('../../../server/analytics/outcome-evaluation-optimization');

function runTests() {
  console.log('▸ تست ۳: کشف الگوهای چهارگانه یادگیری سازمانی (learning-pattern)');

  const mockEvaluations = [
    // ۱. مداخله موفق پایدار
    {
      record_id: 'R1',
      domain: 'ACADEMIC',
      impact_level: IMPACT_LEVEL.EXEMPLARY,
      impact_score: 88,
      sustainability_score: 85,
      delta_metrics: { delta_attendance_pct: 4, delta_gpa: 1.2 }
    },
    // ۲. مداخله بهبود نسبی با پایداری متوسط
    {
      record_id: 'R2',
      domain: 'ATTENDANCE',
      impact_level: IMPACT_LEVEL.MODERATE,
      impact_score: 58,
      sustainability_score: 50,
      delta_metrics: { delta_attendance_pct: 1.5, delta_gpa: 0.1 }
    },
    // ۳. مداخله بی‌اثر
    {
      record_id: 'R3',
      domain: 'TEACHING',
      impact_level: IMPACT_LEVEL.INEFFECTIVE,
      impact_score: 35,
      sustainability_score: 30,
      delta_metrics: { delta_attendance_pct: 0, delta_gpa: 0 }
    },
    // ۴. بازگشت مخاطره و افت مجدد
    {
      record_id: 'R4',
      domain: 'ACADEMIC',
      impact_level: IMPACT_LEVEL.ADVERSE,
      impact_score: 22,
      sustainability_score: 20,
      delta_metrics: { delta_attendance_pct: -3.5, delta_gpa: -0.8 }
    }
  ];

  const patterns = detectLearningPatterns(mockEvaluations, { timestamp: '2026-09-18T12:00:00.000Z' });

  assert.strictEqual(patterns.length, 4, 'هر ۴ الگوی یادگیری باید کشف شوند');

  const pSucc = patterns.find(p => p.pattern_type === LEARNING_PATTERN_TYPE.SUCCESS_PATTERN);
  assert.ok(pSucc);
  assert.strictEqual(pSucc.confidence_pct, 90.0);

  const pPart = patterns.find(p => p.pattern_type === LEARNING_PATTERN_TYPE.PARTIAL_SUCCESS_PATTERN);
  assert.ok(pPart);

  const pFail = patterns.find(p => p.pattern_type === LEARNING_PATTERN_TYPE.FAILED_INTERVENTION_PATTERN);
  assert.ok(pFail);

  const pRisk = patterns.find(p => p.pattern_type === LEARNING_PATTERN_TYPE.REPEAT_RISK_PATTERN);
  assert.ok(pRisk);

  console.log('  ✅ کشف دقیق ۴ الگوی SUCCESS، PARTIAL_SUCCESS، FAILED و REPEAT_RISK تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
