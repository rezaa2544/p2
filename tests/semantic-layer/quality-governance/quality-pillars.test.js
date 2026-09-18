/**
 * آزمون ارزیابی دقیق ۵ ستون کیفیت آموزشی و وضعیت‌های سلامت
 */

'use strict';

const assert = require('assert');
const {
  evaluateQualityPillars,
  QUALITY_PILLARS,
  QUALITY_STATUS
} = require('../../../server/analytics/quality-governance');

function runTest() {
  console.log('▸ تست ۲: ارزیابی قطعی و بدون تقریب ۵ ستون کیفیت آموزشی (evaluateQualityPillars)');

  // داده‌های نمونه مدرسه استاندارد و باثبات
  const healthyData = {
    assessments: [
      { score: 18.5, max_score: 20 },
      { score: 19.0, max_score: 20 },
      { score: 16.5, max_score: 20 },
      { score: 17.0, max_score: 20 }
    ],
    attendanceSessions: [
      { status: 'PRESENT' },
      { status: 'PRESENT' },
      { status: 'PRESENT' },
      { status: 'PRESENT' },
      { status: 'LATE' },
      { status: 'PRESENT' },
      { status: 'PRESENT' },
      { status: 'PRESENT' },
      { status: 'PRESENT' },
      { status: 'PRESENT' }
    ],
    assessmentsWithVariance: [
      { score_variance: 1.2 },
      { score_variance: 0.9 },
      { score_variance: 1.5 }
    ],
    courses: [
      { lesson_plans_submitted: 10, total_lesson_plans: 10, observation_feedback_received: 2 },
      { lesson_plans_submitted: 8, total_lesson_plans: 10, observation_feedback_received: 1 }
    ],
    parentEngagement: {
      registered_parents: 100,
      active_portal_parents: 90,
      pta_attendance_rate: 85
    }
  };

  const healthyResult = evaluateQualityPillars(healthyData);

  // بررسی صحت ساختار خروجی و وجود هر ۵ ستون
  assert.strictEqual(typeof healthyResult, 'object');
  assert.strictEqual(typeof healthyResult.overall_quality_index, 'number');
  assert.ok(healthyResult.overall_quality_index >= 80, 'Overall quality index should be high');
  assert.strictEqual(healthyResult.overall_quality_status, QUALITY_STATUS.EXEMPLARY);

  // ستون‌های ۵ گانه
  const pillars = healthyResult.pillars;
  assert.ok(pillars[QUALITY_PILLARS.ACADEMIC_MASTERY]);
  assert.ok(pillars[QUALITY_PILLARS.ATTENDANCE_STABILITY]);
  assert.ok(pillars[QUALITY_PILLARS.ASSESSMENT_VALIDITY_AND_FAIRNESS]);
  assert.ok(pillars[QUALITY_PILLARS.TEACHING_EVIDENCE_AND_SUPPORT]);
  assert.ok(pillars[QUALITY_PILLARS.FAMILY_AND_COMMUNITY_COLLABORATION]);

  assert.strictEqual(pillars[QUALITY_PILLARS.ACADEMIC_MASTERY].status, QUALITY_STATUS.EXEMPLARY);
  assert.strictEqual(pillars[QUALITY_PILLARS.ATTENDANCE_STABILITY].status, QUALITY_STATUS.EXEMPLARY);

  // سناریو مدرسه نیازمند مداخله و هشدار بحرانی
  const criticalData = {
    assessments: [
      { score: 7.0, max_score: 20 },
      { score: 8.5, max_score: 20 },
      { score: 6.0, max_score: 20 }
    ],
    attendanceSessions: [
      { status: 'ABSENT' },
      { status: 'ABSENT' },
      { status: 'PRESENT' },
      { status: 'ABSENT' },
      { status: 'ABSENT' }
    ],
    assessmentsWithVariance: [
      { score_variance: 5.5 }
    ],
    courses: [
      { lesson_plans_submitted: 1, total_lesson_plans: 10, observation_feedback_received: 0 }
    ],
    parentEngagement: {
      registered_parents: 100,
      active_portal_parents: 15,
      pta_attendance_rate: 10
    }
  };

  const criticalResult = evaluateQualityPillars(criticalData);
  assert.ok(criticalResult.overall_quality_index < 50, 'Overall index should reflect critical condition');
  assert.strictEqual(criticalResult.overall_quality_status, QUALITY_STATUS.CRITICAL_ATTENTION_REQUIRED);
  assert.strictEqual(criticalResult.pillars[QUALITY_PILLARS.ACADEMIC_MASTERY].status, QUALITY_STATUS.CRITICAL_ATTENTION_REQUIRED);
  assert.strictEqual(criticalResult.pillars[QUALITY_PILLARS.ATTENDANCE_STABILITY].status, QUALITY_STATUS.CRITICAL_ATTENTION_REQUIRED);

  console.log('  ✅ محاسبه دقیق ۵ ستون، شاخص ترکیبی و رده‌های سلامت کیفی بدون باگ');
}

module.exports = { runTest };
if (require.main === module) runTest();
