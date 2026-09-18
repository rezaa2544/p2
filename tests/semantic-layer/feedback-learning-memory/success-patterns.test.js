/**
 * آزمون ۳: استخراج الگوهای موفقیت و شکست مداخله (calculateInterventionSuccessPatterns)
 */

'use strict';

const assert = require('assert');
const {
  calculateInterventionSuccessPatterns,
  INTERVENTION_SUCCESS_LEVEL
} = require('../../../server/analytics/intelligence-feedback-memory');

function runTests() {
  console.log('▸ تست ۳: استخراج الگوهای موفقیت و شکست مداخلات (calculateInterventionSuccessPatterns)');

  const outcomes = [
    // ۴ مورد برای مشاوره حضور با موفقیت بالا
    {
      action_type: 'ATTENDANCE_SUPPORT',
      problem_category: 'CHRONIC_ABSENCE',
      effectiveness_level: INTERVENTION_SUCCESS_LEVEL.HIGHLY_EFFECTIVE,
      delta_metrics: { delta_attendance: 8.0, delta_gpa: 1.0, delta_engagement: 15.0 },
      grade_level: '9'
    },
    {
      action_type: 'ATTENDANCE_SUPPORT',
      problem_category: 'CHRONIC_ABSENCE',
      effectiveness_level: INTERVENTION_SUCCESS_LEVEL.HIGHLY_EFFECTIVE,
      delta_metrics: { delta_attendance: 6.0, delta_gpa: 0.5, delta_engagement: 10.0 },
      grade_level: '9'
    },
    {
      action_type: 'ATTENDANCE_SUPPORT',
      problem_category: 'CHRONIC_ABSENCE',
      effectiveness_level: INTERVENTION_SUCCESS_LEVEL.PARTIALLY_EFFECTIVE,
      delta_metrics: { delta_attendance: 4.0, delta_gpa: 0.3, delta_engagement: 8.0 },
      grade_level: '8'
    },
    {
      action_type: 'ATTENDANCE_SUPPORT',
      problem_category: 'CHRONIC_ABSENCE',
      effectiveness_level: INTERVENTION_SUCCESS_LEVEL.INEFFECTIVE,
      delta_metrics: { delta_attendance: 0.0, delta_gpa: -0.2, delta_engagement: 1.0 },
      grade_level: '9'
    },

    // ۳ مورد برای کلاس جبرانی با شکست مکرر
    {
      action_type: 'ACADEMIC_REMEDIAL',
      problem_category: 'MATH_FAILURE',
      effectiveness_level: INTERVENTION_SUCCESS_LEVEL.INEFFECTIVE,
      delta_metrics: { delta_attendance: 0.0, delta_gpa: 0.1, delta_engagement: 0.0 },
      grade_level: '7'
    },
    {
      action_type: 'ACADEMIC_REMEDIAL',
      problem_category: 'MATH_FAILURE',
      effectiveness_level: INTERVENTION_SUCCESS_LEVEL.INEFFECTIVE,
      delta_metrics: { delta_attendance: 0.0, delta_gpa: 0.0, delta_engagement: 2.0 },
      grade_level: '7'
    },
    {
      action_type: 'ACADEMIC_REMEDIAL',
      problem_category: 'MATH_FAILURE',
      effectiveness_level: INTERVENTION_SUCCESS_LEVEL.REQUIRES_ESCALATION,
      delta_metrics: { delta_attendance: -2.0, delta_gpa: -0.5, delta_engagement: -5.0 },
      grade_level: '7'
    }
  ];

  const result = calculateInterventionSuccessPatterns(outcomes, {}, { timestamp: '2026-09-18T12:00:00.000Z' });

  assert.strictEqual(result.total_analyzed, 7, 'تعداد کل رکوردهای تحلیل شده باید ۷ باشد');
  assert.strictEqual(result.patterns.length, 2, 'باید ۲ الگوی مشخص شناسایی شده باشد');

  // بررسی الگوی موفق حضور (۳ از ۴ موفق = ۷۵.۰٪)
  const attPattern = result.successful_patterns.find(p => p.action_type === 'ATTENDANCE_SUPPORT');
  assert.ok(attPattern, 'الگوی موفق حضور باید در successful_patterns موجود باشد');
  assert.strictEqual(attPattern.sample_size, 4);
  assert.strictEqual(attPattern.success_rate_pct, 75.0);
  assert.strictEqual(attPattern.confidence_level, 'MEDIUM');
  assert.strictEqual(attPattern.average_delta.attendance, 4.5); // (8 + 6 + 4 + 0) / 4 = 4.5

  // بررسی الگوی ناموفق کلاس جبرانی (۰ از ۳ موفق = ۰.۰٪)
  const remPattern = result.ineffective_patterns.find(p => p.action_type === 'ACADEMIC_REMEDIAL');
  assert.ok(remPattern, 'الگوی ناموفق باید در ineffective_patterns موجود باشد');
  assert.strictEqual(remPattern.sample_size, 3);
  assert.strictEqual(remPattern.success_rate_pct, 0.0);

  // بررسی تضمین‌های اخلاقی
  assert.strictEqual(result.zero_ranking, true, 'نباید رتبه‌بندی ایجاد شود');
  assert.strictEqual(result.privacy_guaranteed, true, 'حریم خصوصی باید تضمین شود');

  console.log('  ✅ استخراج الگوهای موفق و ناموفق و رده‌بندی اعتماد با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
