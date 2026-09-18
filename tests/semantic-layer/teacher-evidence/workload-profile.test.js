/**
 * آزمون نمایه بار کاری و فعالیت معلم (TeacherWorkloadProfile)
 */

'use strict';

const assert = require('assert');
const { buildTeacherWorkloadProfile } = require('../../../server/analytics/teacher-evidence');

function runTest() {
  console.log('▸ تست ۲: تحلیل نمایه بار کاری و فعالیت معلم (buildTeacherWorkloadProfile)');

  const schoolId = 10;
  const teacherId = 55;

  const schedule = [
    { school_id: 10, teacher_id: 55, class_id: 1, subject_id: 101, day: 'شنبه', period: 1 },
    { school_id: 10, teacher_id: 55, class_id: 1, subject_id: 101, day: 'شنبه', period: 2 },
    { school_id: 10, teacher_id: 55, class_id: 2, subject_id: 101, day: 'یکشنبه', period: 1 },
    { school_id: 10, teacher_id: 55, class_id: 2, subject_id: 102, day: 'یکشنبه', period: 2 },
    { school_id: 10, teacher_id: 55, class_id: 3, subject_id: 101, day: 'دوشنبه', period: 1 },
    // رکورد برای معلم دیگر
    { school_id: 10, teacher_id: 60, class_id: 4, subject_id: 103, day: 'شنبه', period: 1 }
  ];

  const classes = [
    { id: 1, school_id: 10, homeroom_teacher_id: 55 },
    { id: 2, school_id: 10, homeroom_teacher_id: null },
    { id: 3, school_id: 10, homeroom_teacher_id: 60 }
  ];

  const grades = [
    { school_id: 10, teacher_id: 55, student_id: 1001, score: 18.5, type: 'formative' },
    { school_id: 10, teacher_id: 55, student_id: 1002, score: 16.0, type: 'summative' },
    { school_id: 10, teacher_id: 55, student_id: 1003, score: 14.5, type: 'classwork' },
    // نمره ثبت شده توسط معلم دیگر
    { school_id: 10, teacher_id: 60, student_id: 1004, score: 19.0, type: 'quiz' }
  ];

  const profile = buildTeacherWorkloadProfile({
    teacherId,
    schoolId,
    schedule,
    classes,
    grades
  });

  assert.strictEqual(profile.teacher_id, 55);
  assert.strictEqual(profile.school_id, 10);
  assert.strictEqual(profile.weekly_periods_count, 5);
  assert.strictEqual(profile.assigned_classes_count, 3);
  assert.strictEqual(profile.homeroom_classes_count, 1);
  assert.strictEqual(profile.unique_subjects_count, 2);
  assert.strictEqual(profile.total_students_enrolled, 3);
  assert.strictEqual(profile.assessment_events_count, 3);
  assert.strictEqual(profile.workload_intensity, 'BALANCED');
  assert.strictEqual(profile.schedule_distribution.saturday, 2);
  assert.strictEqual(profile.schedule_distribution.sunday, 2);
  assert.strictEqual(profile.schedule_distribution.monday, 1);

  // بررسی وضعیت بار کاری سنگین (> 30)
  const heavySchedule = [];
  for (let i = 0; i < 32; i++) {
    heavySchedule.push({
      school_id: 10,
      teacher_id: 55,
      class_id: (i % 3) + 1,
      subject_id: 101,
      day: 'شنبه',
      period: i + 1
    });
  }
  const heavyProfile = buildTeacherWorkloadProfile({
    teacherId,
    schoolId,
    schedule: heavySchedule,
    classes,
    grades
  });
  assert.strictEqual(heavyProfile.workload_intensity, 'OVERLOADED');

  console.log('  ✅ صحت محاسبه شاخص‌های حجم کار، تنوع دروس، و توزیع هفتگی جلسات');
}

module.exports = { runTest };
if (require.main === module) runTest();
