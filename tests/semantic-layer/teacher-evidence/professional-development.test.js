/**
 * آزمون پیگیری دوره‌های رشد حرفه‌ای (ProfessionalDevelopmentTracker)
 */

'use strict';

const assert = require('assert');
const { trackProfessionalDevelopment } = require('../../../server/analytics/teacher-evidence');

function runTest() {
  console.log('▸ تست ۵: پیگیری دوره‌های رشد حرفه‌ای و تطبیق نیازها (trackProfessionalDevelopment)');

  const teacherId = 77;
  const schoolId = 18;

  const trainingCourses = [
    {
      id: 1,
      staff_id: 77,
      school_id: 18,
      title: 'کارگاه طراحی روبریک‌های سنجش تکوینی',
      hours: 16,
      status: 'completed',
      competency_area: 'formative_feedback'
    },
    {
      id: 2,
      staff_id: 77,
      school_id: 18,
      title: 'مدیریت فعال یادگیرنده در کلاس هوشمند',
      hours: 12,
      status: 'completed',
      competency_area: 'learner_engagement'
    },
    {
      id: 3,
      staff_id: 77,
      school_id: 18,
      title: 'طراحی آزمون‌های عملکردی',
      hours: 8,
      status: 'in_progress',
      competency_area: 'assessment_design'
    },
    // دوره مربوط به همکار دیگر
    {
      id: 4,
      staff_id: 80,
      school_id: 18,
      title: 'دوره عمومی',
      hours: 20,
      status: 'completed'
    }
  ];

  const identifiedNeeds = ['formative_feedback', 'learner_engagement'];

  const tracker = trackProfessionalDevelopment({
    teacherId,
    schoolId,
    trainingCourses,
    identifiedNeeds
  });

  assert.strictEqual(tracker.teacher_id, 77);
  assert.strictEqual(tracker.school_id, 18);
  assert.strictEqual(tracker.total_hours_completed, 28);
  assert.strictEqual(tracker.completed_courses_count, 2);
  assert.strictEqual(tracker.in_progress_courses_count, 1);
  assert.strictEqual(tracker.courses.length, 3);
  assert.deepStrictEqual(tracker.addressed_needs, ['formative_feedback', 'learner_engagement']);
  assert.deepStrictEqual(tracker.unaddressed_needs, []);
  assert.strictEqual(tracker.pd_status, 'ACTIVE_LEARNER'); // >= 24 hours and 0 unaddressed

  // بررسی وضعیت با نیازهای پوشش داده نشده
  const partialTracker = trackProfessionalDevelopment({
    teacherId,
    schoolId,
    trainingCourses: [trainingCourses[0]], // فقط 16 ساعت
    identifiedNeeds: ['formative_feedback', 'digital_tools']
  });
  assert.strictEqual(partialTracker.pd_status, 'ON_TRACK'); // >= 12 hours
  assert.deepStrictEqual(partialTracker.unaddressed_needs, ['digital_tools']);

  console.log('  ✅ صحت تجمیع ساعات، دوره‌ها، تطبیق نیازها و تعیین وضعیت توسعه حرفه‌ای');
}

module.exports = { runTest };
if (require.main === module) runTest();
