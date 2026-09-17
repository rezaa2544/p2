/**
 * tests/semantic-layer/course-engagement.test.js
 * تست‌های واحد مشارکت در درس
 */
'use strict';

const assert = require('assert');
const { evaluateCourseEngagement } = require('../../server/analytics/semantic.js');

let pass = 0;
let fail = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`  ✅ ${desc}`);
    pass++;
  } catch (err) {
    console.error(`  ❌ ${desc}:`, err.message);
    fail++;
  }
}

console.log('▸ تست‌های محاسباتی مشارکت در درس (Course Engagement)');

test('محاسبه رده مشارکت بالا (HIGH) با حضور و تکالیف کامل', () => {
  const attendance = [
    { status: 'present', school_id: 1 },
    { status: 'present', school_id: 1 },
    { status: 'present', school_id: 1 },
    { status: 'present', school_id: 1 }
  ];
  const activities = [
    { completed: true, school_id: 1 },
    { submitted: true, school_id: 1 }
  ];

  const res = evaluateCourseEngagement({ courseId: 'math_101', attendance, activities }, { expectedSchoolId: 1 });
  assert.strictEqual(res.course_id, 'math_101');
  assert.strictEqual(res.engagement_score, 100.0);
  assert.strictEqual(res.engagement_tier, 'HIGH');
  assert.strictEqual(res.disengagement_risk, false);
});

test('تشخیص خطر قطع ارتباط با درس (Disengagement Risk)', () => {
  const attendance = [
    { status: 'absent', school_id: 1 },
    { status: 'absent', school_id: 1 },
    { status: 'absent', school_id: 1 },
    { status: 'present', school_id: 1 }
  ];
  const activities = [
    { completed: false, school_id: 1 }
  ];

  const res = evaluateCourseEngagement({ courseId: 'physics_101', attendance, activities });
  assert(res.engagement_score < 45);
  assert.strictEqual(res.engagement_tier, 'DISENGAGED');
  assert.strictEqual(res.disengagement_risk, true);
});

test('گارد شناسه درس (Missing Course Id)', () => {
  assert.throws(() => {
    evaluateCourseEngagement({ attendance: [] });
  }, /courseId is required/);
});

if (fail > 0) process.exit(1);
