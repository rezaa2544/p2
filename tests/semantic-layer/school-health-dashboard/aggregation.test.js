/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/school-health-dashboard/aggregation.test.js
   -------------------------------------------------------------------
   P0-EI-05: Hierarchical Aggregation (School, Grade, Class, Subject) Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { aggregateSchoolEducationalMetrics } = require('../../../server/analytics/school-health-dashboard');

function run() {
  console.log('▸ تست ۴: تجمیع ماتریسی شاخص‌ها (School, Grade Level, Class, Subject)');

  const classes = [
    { id: 101, school_id: 10, name: 'کلاس دهم الف', grade_level: 'grade_10' },
    { id: 102, school_id: 10, name: 'کلاس یازدهم ب', grade_level: 'grade_11' }
  ];

  const students = [
    { id: 1, school_id: 10, class_id: 101 },
    { id: 2, school_id: 10, class_id: 102 }
  ];

  const grades = [
    { id: 1, school_id: 10, student_id: 1, class_id: 101, subject: 'math', score: 18 },
    { id: 2, school_id: 10, student_id: 1, class_id: 101, subject: 'physics', score: 8 }, // مردود
    { id: 3, school_id: 10, student_id: 2, class_id: 102, subject: 'math', score: 14 }
  ];

  const res = aggregateSchoolEducationalMetrics({
    school_id: 10,
    classes,
    students,
    grades
  });

  // ۱. بررسی خلاصه کلان مدرسه
  assert.strictEqual(res.school_id, 10);
  assert.strictEqual(res.school_summary.total_grades, 3);
  assert.strictEqual(res.school_summary.overall_mean_score, 13.33);

  // ۲. بررسی تجمیع بر اساس پایه
  assert(res.by_grade_level.grade_10 != null);
  assert.strictEqual(res.by_grade_level.grade_10.total_grades, 2);
  assert.strictEqual(res.by_grade_level.grade_10.fail_count, 1);
  assert.strictEqual(res.by_grade_level.grade_10.failure_rate, 50.0);

  // ۳. بررسی تجمیع بر اساس کلاس
  assert(res.by_class['101'] != null);
  assert.strictEqual(res.by_class['101'].name, 'کلاس دهم الف');
  assert.strictEqual(res.by_class['101'].mean_score, 13.0);

  // ۴. بررسی تجمیع بر اساس درس
  assert(res.by_subject.math != null);
  assert.strictEqual(res.by_subject.math.total_grades, 2);
  assert.strictEqual(res.by_subject.math.mean_score, 16.0);
  assert.strictEqual(res.by_subject.math.failure_rate, 0);

  console.log('  ✅ صحت تجمیع سلسله‌مراتبی داده‌ها در چهار لایه ساختاری مدرسه');
}

if (require.main === module) run();
module.exports = { run };
