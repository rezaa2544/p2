/**
 * آزمون ۱: ارزیابی پیامد عینی مداخلات عملیاتی (evaluateOperationalOutcome)
 */

'use strict';

const assert = require('assert');
const {
  evaluateOperationalOutcome
} = require('../../../server/analytics/outcome-evaluation-optimization');

function runTests() {
  console.log('▸ تست ۱: ارزیابی پیامد عینی مداخلات عملیاتی (outcome-evaluation)');

  const mockTask = {
    task_id: 'TASK-101-01',
    decision_id: 'DEC-101-01',
    title: 'برگزاری کارگاه روش‌های سنجش تکوینی برای معلمان',
    domain: 'TEACHING'
  };

  const baseline = {
    attendance_pct: 85.0,
    gpa: 14.50,
    engagement_pct: 60.0,
    wellbeing_pct: 55.0
  };

  const post = {
    attendance_pct: 90.0,
    gpa: 16.00,
    engagement_pct: 75.0,
    wellbeing_pct: 70.0
  };

  const result = evaluateOperationalOutcome({
    task: mockTask,
    baselineMetrics: baseline,
    postMetrics: post,
    goalAchievementPct: 95.0,
    sustainabilityScore: 88.0,
    evidenceConfidence: 90.0,
    options: { timestamp: '2026-09-18T12:00:00.000Z' }
  });

  assert.ok(result);
  assert.strictEqual(result.task_id, 'TASK-101-01');
  assert.strictEqual(result.decision_id, 'DEC-101-01');

  // بررسی دلتاها
  assert.strictEqual(result.delta_metrics.delta_attendance_pct, 5.0);
  assert.strictEqual(result.delta_metrics.delta_gpa, 1.50);
  assert.strictEqual(result.delta_metrics.delta_engagement_pct, 15.0);
  assert.strictEqual(result.delta_metrics.delta_wellbeing_pct, 15.0);

  // بررسی نمره اثرگذاری و سطح
  assert.ok(result.impact_score >= 85.0, 'نمره اثرگذاری باید در رده بالا باشد');
  assert.strictEqual(result.impact_level, 'EXEMPLARY');

  // اصول بنیادین
  assert.strictEqual(result.automated_decision, false);
  assert.strictEqual(result.automated_execution, false);
  assert.strictEqual(result.requires_human_approval, true);
  assert.strictEqual(result.zero_ranking, true);

  console.log('  ✅ محاسبه دقیق دلتای شاخص‌ها و ارزیابی عینی پیامد با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
