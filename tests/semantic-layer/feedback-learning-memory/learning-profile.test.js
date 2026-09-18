/**
 * آزمون ۵: ساخت پرونده جامع یادگیری سازمانی مدرسه (buildOrganizationalLearningProfile)
 */

'use strict';

const assert = require('assert');
const {
  buildOrganizationalLearningProfile,
  RECOMMENDATION_DECISION,
  INTERVENTION_SUCCESS_LEVEL
} = require('../../../server/analytics/intelligence-feedback-memory');

function runTests() {
  console.log('▸ تست ۵: ساخت پرونده یادگیری سازمانی مدرسه (buildOrganizationalLearningProfile)');

  const history = [
    {
      action_id: 'ACT-01',
      action_type: 'ATTENDANCE_SUPPORT',
      decision: RECOMMENDATION_DECISION.APPROVED,
      status: 'COMPLETED',
      outcome: INTERVENTION_SUCCESS_LEVEL.HIGHLY_EFFECTIVE,
      notes: 'جلسه با خانواده مؤثر بود و دانش‌آموز به مدرسه بازگشت.',
      delta_metrics: { delta_attendance: 7.0, delta_gpa: 1.0, delta_engagement: 12.0 }
    },
    {
      action_id: 'ACT-02',
      action_type: 'ATTENDANCE_SUPPORT',
      decision: RECOMMENDATION_DECISION.APPROVED,
      status: 'COMPLETED',
      outcome: INTERVENTION_SUCCESS_LEVEL.PARTIALLY_EFFECTIVE,
      notes: 'تأخیرها کاهش یافت اما حضور کامل محقق نشد.',
      delta_metrics: { delta_attendance: 3.5, delta_gpa: 0.2, delta_engagement: 5.0 }
    },
    {
      action_id: 'ACT-03',
      action_type: 'TEACHER_DEVELOPMENT',
      decision: RECOMMENDATION_DECISION.REJECTED,
      rejected_reason: 'INSUFFICIENT_RESOURCE',
      notes: 'زمان‌بندی کارگاه آموزشی با امتحانات تداخل دارد.'
    }
  ];

  const profile = buildOrganizationalLearningProfile({
    schoolId: 101,
    regionId: 12,
    academicYear: '1405-1406',
    history: history,
    options: { timestamp: '2026-09-18T12:00:00.000Z' }
  });

  assert.strictEqual(profile.school_id, 101);
  assert.strictEqual(profile.region_id, 12);
  assert.strictEqual(profile.academic_year, '1405-1406');
  assert.strictEqual(profile.human_controlled_policy, true, 'سیاست‌ها فقط توسط انسان تغییر می‌یابند');
  assert.strictEqual(profile.automated_decision, false, 'تصمیم خودکار اکیداً ممنوع است');
  assert.strictEqual(profile.zero_ranking, true, 'رتبه‌بندی رقابتی اکیداً ممنوع است');

  assert.ok(profile.accuracy_report, 'گزارش دقت باید موجود باشد');
  assert.strictEqual(profile.accuracy_report.total_recommendations, 3);
  assert.strictEqual(profile.accuracy_report.approved_count, 2);
  assert.strictEqual(profile.accuracy_report.rejected_count, 1);

  assert.ok(profile.maturity_index, 'شاخص بلوغ باید محاسبه شده باشد');
  assert.ok(profile.maturity_index.score >= 0 && profile.maturity_index.score <= 100);

  console.log('  ✅ ساخت کامل پرونده یادگیری سازمانی و اعتبارسنجی ارکان آن با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
