/**
 * آزمون ایمنی در برابر جهش داده‌ها (Object.freeze Mutation Safety)
 */

'use strict';

const assert = require('assert');
const {
  buildTeacherWorkloadProfile,
  buildTeacherEvidencePortfolio,
  evaluateLessonObservation,
  trackProfessionalDevelopment,
  synthesizeTeacherGrowthProfile
} = require('../../../server/analytics/teacher-evidence');

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

function runTest() {
  console.log('▸ تست ۹: ایمنی در برابر جهش داده‌ها و انجماد اشیا (Object.freeze Mutation Safety)');

  const frozenPayload = deepFreeze({
    teacherId: 105,
    schoolId: 12,
    schedule: [
      { school_id: 12, teacher_id: 105, class_id: 1, subject_id: 10, day: 'شنبه', period: 1 },
      { school_id: 12, teacher_id: 105, class_id: 2, subject_id: 10, day: 'یکشنبه', period: 2 }
    ],
    classes: [
      { id: 1, school_id: 12, homeroom_teacher_id: 105 }
    ],
    grades: [
      { school_id: 12, teacher_id: 105, student_id: 1, score: 17, type: 'formative' },
      { school_id: 12, teacher_id: 105, student_id: 2, score: 15, type: 'summative' }
    ],
    teacherNotes: [
      { school_id: 12, teacher_id: 105, student_id: 1, body: 'توضیحات تکوینی' }
    ],
    observation: {
      observationId: 701,
      teacherId: 105,
      schoolId: 12,
      rubric: {
        classroom_interaction: 4.0,
        learner_engagement: 4.5,
        instructional_clarity: 4.0,
        formative_feedback: 4.2
      },
      strengths: ['نقطه قوت منجمد'],
      growthRecommendations: ['توصیه منجمد']
    },
    trainingCourses: [
      { id: 1, staff_id: 105, school_id: 12, title: 'روش‌های تدریس فعال', hours: 16, status: 'completed', competency_area: 'learner_engagement' }
    ],
    identifiedNeeds: ['learner_engagement']
  });

  assert.doesNotThrow(() => {
    const workload = buildTeacherWorkloadProfile(frozenPayload);
    const evidence = buildTeacherEvidencePortfolio({
      teacherId: frozenPayload.teacherId,
      schoolId: frozenPayload.schoolId,
      teacherNotes: frozenPayload.teacherNotes,
      grades: frozenPayload.grades,
      totalStudents: 2
    });
    const obs = evaluateLessonObservation(frozenPayload.observation);
    const pd = trackProfessionalDevelopment({
      teacherId: frozenPayload.teacherId,
      schoolId: frozenPayload.schoolId,
      trainingCourses: frozenPayload.trainingCourses,
      identifiedNeeds: frozenPayload.identifiedNeeds
    });
    synthesizeTeacherGrowthProfile({
      teacherId: frozenPayload.teacherId,
      schoolId: frozenPayload.schoolId,
      workloadProfile: workload,
      evidencePortfolio: evidence,
      observationReview: obs,
      pdTracker: pd
    });
  }, 'All functions must execute safely with deeply frozen input objects');

  console.log('  ✅ پایداری کامل در برابر اشیای منجمد: تمامی ورودی‌ها بدون تغییر باقی ماندند');
}

module.exports = { runTest };
if (require.main === module) runTest();
