/**
 * آزمون تولید پیشنهادهای عملیاتی توضیح‌پذیر (generateActionRecommendations)
 */

'use strict';

const assert = require('assert');
const {
  generateActionRecommendations,
  ACTION_TYPES
} = require('../../../server/analytics/recommendation-action-planning');

function runTest() {
  console.log('▸ تست ۱: تولید پیشنهادهای عملیاتی توضیح‌پذیر از سیگنال‌های آموزشی (generateActionRecommendations)');

  const mockSchoolSnapshot = {
    attendance_rate: 82.0,
    chronic_absence_rate: 14.2, // بیش از ۱۰٪ -> تحریک اقدام حضور
    average_gpa: 11.2,          // کمتر از ۱۲ -> تحریک اقدام آموزشی
    failing_students_ratio: 0.12,
    overloaded_teachers_count: 2
  };

  const recommendations = generateActionRecommendations({
    schoolId: 10,
    schoolSnapshot: mockSchoolSnapshot
  });

  assert.ok(Array.isArray(recommendations));
  assert.ok(recommendations.length >= 2, 'Should generate multiple recommendations based on critical signals');

  // ۱. بررسی اقدام حمایت از حضور
  const attRec = recommendations.find(r => r.action_type === ACTION_TYPES.ATTENDANCE_SUPPORT);
  assert.ok(attRec, 'Must generate ATTENDANCE_SUPPORT recommendation');
  assert.strictEqual(attRec.entity_id, 10);
  assert.strictEqual(attRec.reason, 'chronic absence increasing');
  assert.strictEqual(attRec.evidence.chronic_absence_rate, 14.2);
  assert.strictEqual(attRec.responsible_role, 'counselor');
  assert.strictEqual(attRec.approval_status, 'REVIEW_PENDING');
  assert.strictEqual(attRec.requires_human_confirmation, true);

  // ۲. بررسی اقدام جبران تحصیلی
  const acaRec = recommendations.find(r => r.action_type === ACTION_TYPES.ACADEMIC_REMEDIAL);
  assert.ok(acaRec, 'Must generate ACADEMIC_REMEDIAL recommendation');
  assert.strictEqual(acaRec.responsible_role, 'teacher');
  assert.strictEqual(acaRec.evidence.average_gpa, 11.2);

  // ۳. بررسی اقدام توانمندسازی معلمان
  const teaRec = recommendations.find(r => r.action_type === ACTION_TYPES.TEACHER_DEVELOPMENT);
  assert.ok(teaRec, 'Must generate TEACHER_DEVELOPMENT recommendation');
  assert.strictEqual(teaRec.responsible_role, 'manager');

  console.log('  ✅ تولید دقیق پیشنهادهای عملیاتی متناظر با سیگنال‌ها و شواهد عینی');
}

module.exports = { runTest };
if (require.main === module) runTest();
