/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/parent-360/profile-builder.test.js
   -------------------------------------------------------------------
   P0-EI-06: Parent 360 Student Dossier Profile Builder Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { buildParent360Profile } = require('../../../server/analytics/parent-360');

function run() {
  console.log('▸ تست ۲: ساخت پرونده جامع ۳۶۰ درجه فرزند برای اولیا (buildParent360Profile)');

  const parent = { id: 10, full_name: 'ولی دانش‌آموز' };
  const student = { id: 101, school_id: 1, full_name: 'علی احمدی', grade_level: 'دوازدهم' };
  const parentLinks = [{ parent_id: 10, student_id: 101 }];

  const attendance = [
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'present' },
    { student_id: 101, status: 'late' },
    { student_id: 101, status: 'absent' }
  ];

  const grades = [
    { student_id: 101, subject: 'ریاضی', score: 18, max_score: 20 },
    { student_id: 101, subject: 'فیزیک', score: 11, max_score: 20 },
    { student_id: 101, subject: 'ادبیات', score: 19, max_score: 20 }
  ];

  const profile = buildParent360Profile({
    parent,
    student,
    parentLinks,
    attendance,
    grades
  });

  // ۱. بررسی هویت
  assert.strictEqual(profile.student_id, 101);
  assert.strictEqual(profile.student_identity.full_name, 'علی احمدی');
  assert.strictEqual(profile.student_identity.grade_level, 'دوازدهم');

  // ۲. بررسی حضور
  assert.strictEqual(profile.attendance_overview.unexcused_absences, 1);
  assert.strictEqual(profile.attendance_overview.late_arrivals_count, 1);
  assert.strictEqual(profile.attendance_overview.status, 'WARNING');

  // ۳. بررسی معدل و دروس
  assert.strictEqual(profile.academic_overview.gpa, 16.0);
  assert.strictEqual(profile.academic_overview.strong_subjects_count, 2); // ریاضی ۱۸ و ادبیات ۱۹
  assert(profile.academic_overview.subjects_needing_support.includes('فیزیک')); // فیزیک ۱۱ < ۱۲
  assert.strictEqual(profile.academic_overview.performance_status, 'GOOD');

  console.log('  ✅ صحت تولید شناسنامه هویتی، وضعیت تحصیلی، تحلیل معدل و حضور فرزند');
}

if (require.main === module) run();
module.exports = { run };
