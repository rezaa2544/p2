/**
 * آزمون ارزیابی روبریک ۴ بعدی مشاهدات کلاسی (LessonObservationReview)
 */

'use strict';

const assert = require('assert');
const { evaluateLessonObservation } = require('../../../server/analytics/teacher-evidence');

function runTest() {
  console.log('▸ تست ۴: ارزیابی روبریک مشاهدات کلاسی استاندارد ۴ بعدی (evaluateLessonObservation)');

  const observation = evaluateLessonObservation({
    observationId: 901,
    teacherId: 44,
    schoolId: 15,
    evaluatorRole: 'manager',
    rubric: {
      classroom_interaction: 4.5,
      learner_engagement: 3.5,
      instructional_clarity: 4.5,
      formative_feedback: 4.0
    },
    strengths: ['تسلط بالا بر سرفصل کتاب', 'مدیریت مطلوب زمان کلاس'],
    growthRecommendations: ['افزایش کار گروهی و فعالیت‌های همیارانه']
  });

  assert.strictEqual(observation.teacher_id, 44);
  assert.strictEqual(observation.school_id, 15);
  // (4.5 + 3.5 + 4.5 + 4.0) / 4 = 16.5 / 4 = 4.125 -> 4.13
  assert.strictEqual(observation.average_score, 4.13);
  assert.strictEqual(observation.mastery_level, 'COMPETENT');
  assert.strictEqual(observation.priority_focus_dimension, 'learner_engagement');
  assert.strictEqual(observation.strengths.length, 2);
  assert.strictEqual(observation.growth_recommendations.length, 1);

  // بررسی سطح پیشرفته ADVANCED (>= 4.2)
  const advancedObs = evaluateLessonObservation({
    observationId: 902,
    teacherId: 44,
    schoolId: 15,
    rubric: {
      classroom_interaction: 4.8,
      learner_engagement: 4.5,
      instructional_clarity: 4.6,
      formative_feedback: 4.2
    }
  });
  assert.strictEqual(advancedObs.mastery_level, 'ADVANCED');

  console.log('  ✅ اعتبارسنجی ابعاد چهارگانه روبریک کلاسی و کشف سازنده اولویت‌های توسعه');
}

module.exports = { runTest };
if (require.main === module) runTest();
