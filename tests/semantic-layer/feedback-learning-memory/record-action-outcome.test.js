/**
 * آزمون ۱: ثبت پیامد و بازخورد انسانی اقدام آموزشی (recordActionOutcome)
 */

'use strict';

const assert = require('assert');
const {
  recordActionOutcome,
  RECOMMENDATION_DECISION,
  REJECTION_REASONS,
  INTERVENTION_SUCCESS_LEVEL
} = require('../../../server/analytics/intelligence-feedback-memory');

function runTests() {
  console.log('▸ تست ۱: ثبت پیامد و بازخورد انسانی اقدام (recordActionOutcome)');

  const sampleAction = {
    action_id: 'ACT-SCH01-001',
    recommendation_id: 'REC-SCH01-001',
    school_id: 101,
    action_type: 'ATTENDANCE_SUPPORT',
    student_id: 5544 // باید در خروجی مخفی بماند
  };

  const sampleFeedback = {
    decision: RECOMMENDATION_DECISION.APPROVED,
    actor_id: 'usr-counselor-01',
    actor_role: 'counselor',
    notes: 'جلسه مشاوره با اولیا تشکیل شد و روند بهبود مشاهده گردید.',
    outcome: INTERVENTION_SUCCESS_LEVEL.HIGHLY_EFFECTIVE,
    delta_metrics: {
      delta_attendance: 6.5,
      delta_gpa: 1.2,
      delta_engagement: 15.0
    }
  };

  const recorded = recordActionOutcome(sampleAction, sampleFeedback, { schoolId: 101 });

  assert.strictEqual(recorded.human_verified, true, 'باید تأیید انسانی ثبت شود');
  assert.strictEqual(recorded.automated_decision, false, 'تصمیم خودکار باید اکیداً false باشد');
  assert.strictEqual(recorded.feedback_record.decision, 'APPROVED');
  assert.strictEqual(recorded.feedback_record.actor_id, 'usr-counselor-01');
  assert.strictEqual(recorded.outcome_record.effectiveness_level, 'HIGHLY_EFFECTIVE');
  assert.strictEqual(recorded.outcome_record.delta_metrics.delta_attendance, 6.5);

  // آزمون ثبت رد پیشنهاد با دلیل مشخص
  const rejectionFeedback = {
    decision: RECOMMENDATION_DECISION.REJECTED,
    rejected_reason: REJECTION_REASONS.MISDIAGNOSIS,
    actor_id: 'usr-principal-01',
    actor_role: 'manager',
    notes: 'دانش‌آموز به دلیل جراحی غیبت داشته و نیاز به مداخله مشاوره‌ای ندارد.'
  };

  const recordedRejection = recordActionOutcome(sampleAction, rejectionFeedback, { schoolId: 101 });
  assert.strictEqual(recordedRejection.feedback_record.decision, 'REJECTED');
  assert.strictEqual(recordedRejection.feedback_record.rejected_reason, 'MISDIAGNOSIS');
  assert.strictEqual(recordedRejection.outcome_record, null, 'برای پیشنهاد رد شده نباید پیامد مداخله ثبت شود');

  // آزمون نقض تفکیک مستأجر (Tenant Isolation Violation)
  assert.throws(() => {
    recordActionOutcome(sampleAction, { ...sampleFeedback, school_id: 999 }, { schoolId: 101 });
  }, /FEEDBACK_TENANT_ISOLATION_VIOLATION/, 'تطابق نداشتن شناسه مدرسه باید خطای تفکیک پرتاب کند');

  // آزمون اعتبارسنجی تصمیم نامعتبر
  assert.throws(() => {
    recordActionOutcome(sampleAction, { ...sampleFeedback, decision: 'UNKNOWN_DECISION' }, { schoolId: 101 });
  }, /INVALID_DECISION/, 'تصمیم ناشناخته باید رد شود');

  console.log('  ✅ ثبت بازخورد و پیامد، تفکیک مستأجر و مهار تصمیم خودکار با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
