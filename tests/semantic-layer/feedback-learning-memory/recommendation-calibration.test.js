/**
 * آزمون ۶: کالیبراسیون و ارتقای توصیه‌های آتی با حافظه تجربه (calibrateRecommendationsWithMemory)
 */

'use strict';

const assert = require('assert');
const {
  calibrateRecommendationsWithMemory
} = require('../../../server/analytics/intelligence-feedback-memory');

function runTests() {
  console.log('▸ تست ۶: کالیبراسیون توصیه‌های جدید بر مبنای حافظه سازمانی (calibrateRecommendationsWithMemory)');

  const memory = {
    successful_patterns: [
      {
        action_type: 'ATTENDANCE_SUPPORT',
        sample_size: 6,
        success_rate_pct: 83.3,
        confidence_level: 'MEDIUM'
      }
    ],
    ineffective_patterns: [
      {
        action_type: 'ACADEMIC_REMEDIAL',
        sample_size: 4,
        success_rate_pct: 25.0,
        confidence_level: 'MEDIUM'
      }
    ]
  };

  const incomingRecommendations = [
    {
      recommendation_id: 'REC-01',
      action_type: 'ATTENDANCE_SUPPORT',
      priority_score: 60,
      requires_human_confirmation: true
    },
    {
      recommendation_id: 'REC-02',
      action_type: 'ACADEMIC_REMEDIAL',
      priority_score: 60,
      requires_human_confirmation: true
    },
    {
      recommendation_id: 'REC-03',
      action_type: 'TEACHER_DEVELOPMENT',
      priority_score: 50,
      requires_human_confirmation: true
    }
  ];

  const calibrated = calibrateRecommendationsWithMemory(incomingRecommendations, memory);

  assert.strictEqual(calibrated.length, 3);

  // اقدام موفق باید ضریب تقویت (+15%) دریافت کند: 60 * 1.15 = 69
  const rec1 = calibrated.find(r => r.recommendation_id === 'REC-01');
  assert.strictEqual(rec1.priority_score, 69, 'اقدام با سابقه موفق باید تقویت شود');
  assert.strictEqual(rec1.calibration_tag, 'HISTORICAL_SUCCESS_VALIDATED');
  assert.ok(rec1.calibration_note.includes('نرخ موفقیت مستند'));

  // اقدام ناموفق باید جریمه اولویت (-25%) دریافت کند: 60 * 0.75 = 45
  const rec2 = calibrated.find(r => r.recommendation_id === 'REC-02');
  assert.strictEqual(rec2.priority_score, 45, 'اقدام با سابقه ناموفق باید کسر اولویت شود');
  assert.strictEqual(rec2.calibration_tag, 'HISTORICAL_INEFFECTIVE_WARNING');
  assert.ok(rec2.calibration_note.includes('هشدار تجربه مدرسه'));

  // اقدام بدون سابقه باید استاندارد بماند: 50 * 1.0 = 50
  const rec3 = calibrated.find(r => r.recommendation_id === 'REC-03');
  assert.strictEqual(rec3.priority_score, 50);
  assert.strictEqual(rec3.calibration_tag, 'STANDARD');

  // تضمین حفظ الزامات نظارت انسانی
  for (const item of calibrated) {
    assert.strictEqual(item.requires_human_confirmation, true, 'تأیید انسانی باید همواره الزامی بماند');
    assert.strictEqual(item.automated_decision, false, 'تصمیم‌گیری خودکار باید اکیداً false باشد');
  }

  console.log('  ✅ کالیبراسیون، تعدیل ضرایب و پرچم‌های سابقه با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
