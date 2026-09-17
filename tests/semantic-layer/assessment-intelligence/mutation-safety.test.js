/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/assessment-intelligence/mutation-safety.test.js
   -------------------------------------------------------------------
   P0-EI-03: Mutation Safety & Frozen Object Integrity Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const {
  analyzeAssessmentQuality,
  calculateDiscriminationIndex,
  detectGradeAnomalies,
  calculateAssessmentFairness,
  calculateTeacherAssessmentProfile,
  generateAssessmentInsights
} = require('../../../server/analytics/assessment-intelligence');

function run() {
  console.log('▸ تست ۸: ایمنی در برابر جهش داده‌ها و انجماد اشیا (Object.freeze Mutation Safety)');

  const frozenGrades = Object.freeze([
    Object.freeze({ id: 1, student_id: 1, teacher_id: 200, class_id: 101, score: 7, max_score: 20 }),
    Object.freeze({ id: 2, student_id: 2, teacher_id: 200, class_id: 101, score: 14, max_score: 20 }),
    Object.freeze({ id: 3, student_id: 3, teacher_id: 200, class_id: 101, score: 18, max_score: 20 }),
    Object.freeze({ id: 4, student_id: 4, teacher_id: 200, class_id: 101, score: 19, max_score: 20 })
  ]);
  const frozenExam = Object.freeze({ id: 50, school_id: 10, max_score: 20 });
  const frozenClasses = Object.freeze([
    Object.freeze({ id: 101, school_id: 10, name: 'کلاس الف' })
  ]);
  const frozenUsers = Object.freeze([
    Object.freeze({ id: 1, school_id: 10, gender: 'male' })
  ]);

  assert.doesNotThrow(() => {
    analyzeAssessmentQuality({ exam: frozenExam, grades: frozenGrades });
    calculateDiscriminationIndex({ grades: frozenGrades });
    detectGradeAnomalies({ grades: frozenGrades });
    calculateAssessmentFairness({ grades: frozenGrades, classes: frozenClasses, users: frozenUsers });
    calculateTeacherAssessmentProfile({ teacherId: 200, grades: frozenGrades });
    generateAssessmentInsights({
      assessmentQuality: { difficulty_level: 'HARD', difficulty_index: 0.35, pass_rate: 25 },
      anomalies: { clustering_anomalies: [] },
      fairness: { fairness_flags: [] }
    });
  }, 'هیچ تابعی نباید خصوصیات اشیای منجمد را دستکاری کند');

  console.log('  ✅ پایداری در برابر اشیای منجمد: تمامی ورودی‌ها بدون تغییر باقی ماندند');
}

if (require.main === module) run();
module.exports = { run };
