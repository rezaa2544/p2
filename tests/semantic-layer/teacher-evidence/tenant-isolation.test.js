/**
 * آزمون ایزولاسیون چندمستأجری و سقط قاطع نشت داده (Fail-Closed Tenant Isolation)
 */

'use strict';

const assert = require('assert');
const {
  buildTeacherWorkloadProfile,
  buildTeacherEvidencePortfolio,
  trackProfessionalDevelopment,
  synthesizeTeacherGrowthProfile
} = require('../../../server/analytics/teacher-evidence');

function runTest() {
  console.log('▸ تست ۱۰: ایزولاسیون چندمستأجری و سقط قاطع نشت داده (Fail-Closed Tenant Isolation)');

  const targetSchoolId = 10;
  const foreignSchoolId = 99;
  const teacherId = 101;

  // ۱. نشت مدرسه در برنامه کلاسی
  assert.throws(() => {
    buildTeacherWorkloadProfile({
      teacherId,
      schoolId: targetSchoolId,
      schedule: [
        { school_id: foreignSchoolId, teacher_id: 101, class_id: 1, subject_id: 5, day: 'شنبه', period: 1 }
      ]
    });
  }, /TENANT_ISOLATION_VIOLATION/, 'Cross-school schedule record must trigger fail-closed exception');

  // ۲. نشت مدرسه در یادداشت‌های معلم
  assert.throws(() => {
    buildTeacherEvidencePortfolio({
      teacherId,
      schoolId: targetSchoolId,
      teacherNotes: [
        { school_id: foreignSchoolId, teacher_id: 101, student_id: 1, body: 'تست' }
      ]
    });
  }, /TENANT_ISOLATION_VIOLATION/, 'Cross-school teacher note must trigger fail-closed exception');

  // ۳. نشت مدرسه در دوره‌های ضمن‌خدمت
  assert.throws(() => {
    trackProfessionalDevelopment({
      teacherId,
      schoolId: targetSchoolId,
      trainingCourses: [
        { id: 1, staff_id: 101, school_id: foreignSchoolId, title: 'دوره', hours: 10, status: 'completed' }
      ]
    });
  }, /TENANT_ISOLATION_VIOLATION/, 'Cross-school training course must trigger fail-closed exception');

  // ۴. نشت مدرسه در سنتز کارنامه رشد
  assert.throws(() => {
    synthesizeTeacherGrowthProfile({
      teacherId,
      schoolId: targetSchoolId,
      workloadProfile: { school_id: foreignSchoolId }
    });
  }, /TENANT_ISOLATION_VIOLATION/, 'Cross-school workload profile in synthesis must trigger fail-closed exception');

  console.log('  ✅ مسدودسازی قاطع نشت مستأجران (Fail-Closed) در تمامی توابع چارچوب شواهد تدریس');
}

module.exports = { runTest };
if (require.main === module) runTest();
