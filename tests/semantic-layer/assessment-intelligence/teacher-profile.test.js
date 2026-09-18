/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/assessment-intelligence/teacher-profile.test.js
   -------------------------------------------------------------------
   P0-EI-03: Teacher Assessment Profile (Non-Punitive Consistency) Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { calculateTeacherAssessmentProfile } = require('../../../server/analytics/assessment-intelligence');

function run() {
  console.log('▸ تست ۶: محاسبه نیمرخ سنجش معلم و ثبات نمره‌دهی (calculateTeacherAssessmentProfile)');

  const grades = [
    { teacher_id: 200, score: 12 }, { teacher_id: 200, score: 14 },
    { teacher_id: 200, score: 15 }, { teacher_id: 200, score: 16 },
    { teacher_id: 200, score: 17 }, { teacher_id: 200, score: 18 }
  ];
  const exams = [{ id: 1, teacher_id: 200 }];

  const res = calculateTeacherAssessmentProfile({ teacherId: 200, grades, exams });
  assert.strictEqual(res.teacher_id, 200);
  assert.strictEqual(res.total_students_graded, 6);
  assert.ok(res.grade_mean >= 15);
  assert.ok(res.grade_std_dev > 1.0 && res.grade_std_dev < 4.0);
  assert.strictEqual(res.profile_status, 'BALANCED');
  assert.ok(res.note.includes('معیار رتبه‌بندی فردی نمی‌باشد'));

  // گارد شناسه معلم الزامی
  assert.throws(() => {
    calculateTeacherAssessmentProfile({ grades });
  }, /teacherId is required/);

  console.log('  ✅ تولید نیمرخ بازخورد حرفه‌ای معلم، ثبات ارزیابی و تضمین عدم رتبه‌بندی فردی');
}

if (require.main === module) run();
module.exports = { run };
