/**
 * آزمون ۷: الزام قطعی نظارت انسانی و منع تصمیم‌گیری خودکار (Human-in-the-Loop Guard)
 */

'use strict';

const assert = require('assert');
const {
  recordActionOutcome,
  buildOrganizationalLearningProfile,
  calibrateRecommendationsWithMemory
} = require('../../../server/analytics/intelligence-feedback-memory');

function runTests() {
  console.log('▸ تست ۷: آزمون الزام نظارت انسانی و منع تصمیم‌گیری خودکار (Human-in-the-Loop Guard)');

  const action = { action_id: 'ACT-HL-01', school_id: 101, action_type: 'ATTENDANCE_SUPPORT' };
  const feedback = {
    decision: 'APPROVED',
    actor_id: 'usr-manager-01',
    actor_role: 'manager',
    outcome: 'HIGHLY_EFFECTIVE'
  };

  const recorded = recordActionOutcome(action, feedback, { schoolId: 101 });
  assert.strictEqual(recorded.automated_decision, false, 'تصمیم‌گیری خودکار در ثبت پیامد باید اکیداً false باشد');
  assert.strictEqual(recorded.human_verified, true, 'تأیید انسانی باید صراحتاً true باشد');

  const profile = buildOrganizationalLearningProfile({
    schoolId: 101,
    regionId: 1,
    history: []
  });

  assert.strictEqual(profile.automated_decision, false, 'پروفایل یادگیری نباید تصمیم خودکار مجاز بشمارد');
  assert.strictEqual(profile.human_controlled_policy, true, 'تغییر سیاست‌ها منحصراً در اختیار انسان است');

  const calibrated = calibrateRecommendationsWithMemory([
    { recommendation_id: 'REC-01', action_type: 'ATTENDANCE_SUPPORT', priority_score: 50 }
  ], {});

  assert.strictEqual(calibrated[0].automated_decision, false);
  assert.strictEqual(calibrated[0].requires_human_confirmation, true);

  console.log('  ✅ رعایت ۱۰۰٪ اصل نظارت انسانی در تمامی خروجی‌ها و فرایندها تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
