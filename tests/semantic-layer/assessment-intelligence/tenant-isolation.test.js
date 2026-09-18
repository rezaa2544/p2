/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/assessment-intelligence/tenant-isolation.test.js
   -------------------------------------------------------------------
   P0-EI-03: Multi-Tenant Fail-Closed Isolation Guards Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const {
  analyzeAssessmentQuality,
  calculateDiscriminationIndex,
  detectGradeAnomalies,
  calculateAssessmentFairness,
  calculateTeacherAssessmentProfile
} = require('../../../server/analytics/assessment-intelligence');

function run() {
  console.log('▸ تست ۹: ایزولاسیون چندمستأجری و سقط قاطع نشت داده (Fail-Closed Tenant Isolation)');

  const leakedGrades = [
    { id: 1, school_id: 10, student_id: 1, teacher_id: 200, score: 15 },
    { id: 2, school_id: 99, student_id: 2, teacher_id: 200, score: 18 } // مستأجر بیگانه ۹۹
  ];
  const leakedExam = { id: 50, school_id: 99 }; // آزمون مدرسه دیگر

  // ۱. نشت در analyzeAssessmentQuality
  assert.throws(() => {
    analyzeAssessmentQuality({ exam: leakedExam, grades: leakedGrades }, { expectedSchoolId: 10 });
  }, err => err.code === 'TENANT_ISOLATION_VIOLATION' || /Tenant isolation violation/i.test(err.message));

  // ۲. نشت در calculateDiscriminationIndex
  assert.throws(() => {
    calculateDiscriminationIndex({ grades: leakedGrades, expectedSchoolId: 10 });
  }, err => err.code === 'TENANT_ISOLATION_VIOLATION' || /Tenant isolation violation/i.test(err.message));

  // ۳. نشت در detectGradeAnomalies
  assert.throws(() => {
    detectGradeAnomalies({ grades: leakedGrades, expectedSchoolId: 10 });
  }, err => err.code === 'TENANT_ISOLATION_VIOLATION' || /Tenant isolation violation/i.test(err.message));

  // ۴. نشت در calculateAssessmentFairness
  assert.throws(() => {
    calculateAssessmentFairness({ grades: leakedGrades, expectedSchoolId: 10 });
  }, err => err.code === 'TENANT_ISOLATION_VIOLATION' || /Tenant isolation violation/i.test(err.message));

  // ۵. نشت در calculateTeacherAssessmentProfile
  assert.throws(() => {
    calculateTeacherAssessmentProfile({ teacherId: 200, grades: leakedGrades, expectedSchoolId: 10 });
  }, err => err.code === 'TENANT_ISOLATION_VIOLATION' || /Tenant isolation violation/i.test(err.message));

  console.log('  ✅ مسدودسازی قاطع نشت مستأجران (Fail-Closed) در تمامی ۵ تابع هوشمندی سنجش');
}

if (require.main === module) run();
module.exports = { run };
