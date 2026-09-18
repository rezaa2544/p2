/**
 * آزمون سبد شواهد فرآیند یاددهی معلم (TeacherEvidencePortfolio)
 */

'use strict';

const assert = require('assert');
const { buildTeacherEvidencePortfolio } = require('../../../server/analytics/teacher-evidence');

function runTest() {
  console.log('▸ تست ۳: تحلیل سبد شواهد فرآیند یاددهی (buildTeacherEvidencePortfolio)');

  const schoolId = 20;
  const teacherId = 88;

  const teacherNotes = [
    { school_id: 20, teacher_id: 88, student_id: 201, body: 'پیشرفت عالی در درک مفاهیم جبر' },
    { school_id: 20, teacher_id: 88, student_id: 202, body: 'نیاز به تمرین بیشتر در هندسه تحلیلی' },
    { school_id: 20, teacher_id: 88, student_id: 203, body: 'حل تمرین به موقع انجام شد' },
    { school_id: 20, teacher_id: 88, student_id: 204, body: 'پیشنهاد شرکت در کلاس تقویتی' },
    // یادداشت معلم دیگر
    { school_id: 20, teacher_id: 99, student_id: 205, body: 'یادداشت متفرقه' }
  ];

  const grades = [
    { school_id: 20, teacher_id: 88, student_id: 201, type: 'formative' },
    { school_id: 20, teacher_id: 88, student_id: 202, type: 'formative' },
    { school_id: 20, teacher_id: 88, student_id: 203, type: 'summative' },
    { school_id: 20, teacher_id: 88, student_id: 204, type: 'classwork' },
    { school_id: 20, teacher_id: 88, student_id: 201, type: 'project' },
    // نمره معلم دیگر
    { school_id: 20, teacher_id: 99, student_id: 205, type: 'quiz' }
  ];

  const portfolio = buildTeacherEvidencePortfolio({
    teacherId,
    schoolId,
    totalStudents: 5,
    teacherNotes,
    grades
  });

  assert.strictEqual(portfolio.teacher_id, 88);
  assert.strictEqual(portfolio.school_id, 20);
  assert.strictEqual(portfolio.total_students, 5);
  assert.strictEqual(portfolio.formative_notes_count, 4);
  assert.strictEqual(portfolio.students_receiving_feedback_count, 4);
  assert.strictEqual(portfolio.formative_coverage_rate, 80.0); // 4/5 * 100
  assert.strictEqual(portfolio.diversity_type_count, 4);
  assert.strictEqual(portfolio.portfolio_completeness, 'EXEMPLARY'); // >= 75% coverage and >= 3 types
  assert.strictEqual(portfolio.evidence_summary.has_individual_feedback, true);
  assert.strictEqual(portfolio.evidence_summary.uses_multiple_assessment_types, true);

  console.log('  ✅ صحت ارزیابی سبد شواهد، تنوع سنجش و پوشش بازخوردهای تکوینی');
}

module.exports = { runTest };
if (require.main === module) runTest();
