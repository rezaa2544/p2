/**
 * tests/semantic-layer/activity-summary.test.js
 * تست‌های واحد خلاصه فعالیت‌های آموزشی
 */
'use strict';

const assert = require('assert');
const { generateEducationalActivitySummary } = require('../../server/analytics/semantic.js');

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

console.log('▸ تست‌های خلاصه فعالیت‌های آموزشی (Educational Activity Summary)');

test('تجمیع فعالیت‌های مدرسه در بازه زمانی مشخص', () => {
  const attendance = [
    { date: '2026-10-01', student_id: 1, status: 'present', school_id: 1 },
    { date: '2026-10-01', student_id: 2, status: 'present', school_id: 1 },
    { date: '2026-10-02', student_id: 1, status: 'late', school_id: 1 }
  ];
  const grades = [
    { date: '2026-10-01', student_id: 1, teacher_id: 10, score: 18, school_id: 1 },
    { date: '2026-10-02', student_id: 2, teacher_id: 10, score: 14, school_id: 1 }
  ];

  const res = generateEducationalActivitySummary({
    scope: 'school',
    startDate: '2026-10-01',
    endDate: '2026-10-05',
    attendance,
    grades
  }, { expectedSchoolId: 1 });

  assert.strictEqual(res.scope, 'school');
  assert.strictEqual(res.summary_counts.total_actions, 5);
  assert.strictEqual(res.summary_counts.attendance_records, 3);
  assert.strictEqual(res.summary_counts.grades_logged, 2);
  assert.strictEqual(res.summary_counts.active_days, 2);
  assert.strictEqual(res.summary_counts.active_students, 2);
  assert.strictEqual(res.summary_counts.active_teachers, 1);
  assert.strictEqual(res.activity_status, 'ACTIVE');
  assert.strictEqual(res.metrics_summary.mean_grade, 16.0);
});

test('تشخیص وضعیت غیرفعال در نبود رویداد (INACTIVE)', () => {
  const res = generateEducationalActivitySummary({ scope: 'school', attendance: [], grades: [] });
  assert.strictEqual(res.summary_counts.total_actions, 0);
  assert.strictEqual(res.activity_status, 'INACTIVE');
});

if (fail > 0) process.exit(1);
