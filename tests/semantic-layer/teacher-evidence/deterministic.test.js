/**
 * آزمون قطعیت و بازتولیدپذیری بیت‌به‌بیت (Deterministic 10-Execution Integrity)
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

function runTest() {
  console.log('▸ تست ۸: آزمون قطعیت و بازتولیدپذیری بیت‌به‌بیت (Deterministic 10-Execution)');

  const payload = {
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
      }
    },
    trainingCourses: [
      { id: 1, staff_id: 105, school_id: 12, title: 'روش‌های تدریس فعال', hours: 16, status: 'completed', competency_area: 'learner_engagement' }
    ]
  };

  let baselineWorkload, baselineEvidence, baselineObs, baselinePd, baselineGrowth;

  for (let i = 0; i < 10; i++) {
    const workload = buildTeacherWorkloadProfile(payload);
    const evidence = buildTeacherEvidencePortfolio({
      teacherId: payload.teacherId,
      schoolId: payload.schoolId,
      teacherNotes: payload.teacherNotes,
      grades: payload.grades,
      totalStudents: 2
    });
    const obs = evaluateLessonObservation(payload.observation);
    const pd = trackProfessionalDevelopment({
      teacherId: payload.teacherId,
      schoolId: payload.schoolId,
      trainingCourses: payload.trainingCourses,
      identifiedNeeds: ['learner_engagement']
    });
    const growth = synthesizeTeacherGrowthProfile({
      teacherId: payload.teacherId,
      schoolId: payload.schoolId,
      workloadProfile: workload,
      evidencePortfolio: evidence,
      observationReview: obs,
      pdTracker: pd
    });

    const strWorkload = JSON.stringify(workload);
    const strEvidence = JSON.stringify(evidence);
    const strObs = JSON.stringify(obs);
    const strPd = JSON.stringify(pd);
    const strGrowth = JSON.stringify(growth);

    if (i === 0) {
      baselineWorkload = strWorkload;
      baselineEvidence = strEvidence;
      baselineObs = strObs;
      baselinePd = strPd;
      baselineGrowth = strGrowth;
    } else {
      assert.strictEqual(strWorkload, baselineWorkload, `Workload mismatch at iteration ${i}`);
      assert.strictEqual(strEvidence, baselineEvidence, `Evidence mismatch at iteration ${i}`);
      assert.strictEqual(strObs, baselineObs, `Observation mismatch at iteration ${i}`);
      assert.strictEqual(strPd, baselinePd, `PD mismatch at iteration ${i}`);
      assert.strictEqual(strGrowth, baselineGrowth, `Growth mismatch at iteration ${i}`);
    }
  }

  console.log('  ✅ قطعیت ۱۰۰٪: ده اجرای متوالی تمامی توابع خروجی‌های بیت‌به‌بیت یکسان تولید کردند');
}

module.exports = { runTest };
if (require.main === module) runTest();
