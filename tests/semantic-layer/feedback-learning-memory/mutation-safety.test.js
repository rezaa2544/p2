/**
 * آزمون ۱۰: آزمون ایمنی در برابر جهش داده‌ها و فریز عمیق اشیا (deepFreeze Mutation Safety)
 */

'use strict';

const assert = require('assert');
const {
  recordActionOutcome,
  analyzeRecommendationAccuracy,
  buildOrganizationalLearningProfile,
  calibrateRecommendationsWithMemory
} = require('../../../server/analytics/intelligence-feedback-memory');

function runTests() {
  console.log('▸ تست ۱۰: آزمون ایمنی در برابر جهش داده‌ها و فریز عمیق اشیا (deepFreeze Mutation Safety)');

  const frozenAction = Object.freeze({
    action_id: 'ACT-MUT-01',
    school_id: 101,
    action_type: 'ATTENDANCE_SUPPORT'
  });

  const frozenFeedback = Object.freeze({
    decision: 'APPROVED',
    actor_id: 'usr-01',
    actor_role: 'manager',
    outcome: 'HIGHLY_EFFECTIVE',
    delta_metrics: Object.freeze({ delta_attendance: 5.0 })
  });

  const result = recordActionOutcome(frozenAction, frozenFeedback, { schoolId: 101 });

  // بررسی فریز بودن عمیق خروجی
  assert.ok(Object.isFrozen(result), 'خروجی اصلی باید منجمد باشد');
  assert.ok(Object.isFrozen(result.feedback_record), 'feedback_record باید منجمد باشد');
  assert.ok(Object.isFrozen(result.outcome_record), 'outcome_record باید منجمد باشد');
  assert.ok(Object.isFrozen(result.outcome_record.delta_metrics), 'delta_metrics باید منجمد باشد');

  // تلاش برای تغییر ساختار منجمد باید در strict mode خطا دهد یا بی‌اثر باشد
  assert.throws(() => {
    result.feedback_record.decision = 'MUTATED';
  }, /TypeError/);

  const frozenHistory = Object.freeze([
    Object.freeze({ action_id: 'ACT-01', decision: 'APPROVED', status: 'COMPLETED' })
  ]);

  const report = analyzeRecommendationAccuracy(frozenHistory);
  assert.ok(Object.isFrozen(report), 'گزارش دقت باید منجمد باشد');

  const profile = buildOrganizationalLearningProfile({
    schoolId: 101,
    regionId: 1,
    history: frozenHistory
  });
  assert.ok(Object.isFrozen(profile), 'پروفایل یادگیری باید منجمد باشد');
  assert.ok(Object.isFrozen(profile.maturity_index), 'اجزای شاخص بلوغ باید منجمد باشند');

  const calibrated = calibrateRecommendationsWithMemory([
    Object.freeze({ recommendation_id: 'REC-01', action_type: 'ATTENDANCE_SUPPORT', priority_score: 50 })
  ], {});
  assert.ok(Object.isFrozen(calibrated), 'آرایه کالیبره‌شده باید منجمد باشد');
  assert.ok(Object.isFrozen(calibrated[0]), 'آیتم‌های کالیبره‌شده باید منجمد باشند');

  console.log('  ✅ ایمنی کامل در برابر جهش غیرمجاز و انجماد عمیق ساختارها تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
