/**
 * آزمون ایزولاسیون چندمستأجری و سقط قاطع نشت داده (Fail-Closed Tenant Isolation)
 */

'use strict';

const assert = require('assert');
const {
  enforceInterventionAccessGuard,
  summarizeSchoolInterventions
} = require('../../../server/analytics/intervention-case-management');

function runTest() {
  console.log('▸ تست ۹: ایزولاسیون چندمستأجری و سقط قاطع نشت داده (Fail-Closed Tenant Isolation)');

  const schoolA = 10;
  const schoolB = 99;

  const caseSchoolA = {
    case_id: 'CASE-10-101',
    student_id: 101,
    school_id: schoolA
  };

  const counselorSchoolB = {
    id: 901,
    role: 'counselor',
    school_id: schoolB
  };

  // ۱. مشاور مدرسه ب نباید به پرونده مدرسه الف دسترسی داشته باشد
  assert.throws(
    () => enforceInterventionAccessGuard(counselorSchoolB, caseSchoolA),
    /TENANT_ISOLATION_VIOLATION/,
    'Counselor must not access cases of another school'
  );

  // ۲. تجمیع پرونده‌های مدرسه با رکورد متعلق به مدرسه دیگر
  const mixedCases = [
    { case_id: 'C1', school_id: schoolA, status: 'OPEN' },
    { case_id: 'C2', school_id: schoolB, status: 'OPEN' }
  ];

  assert.throws(
    () => summarizeSchoolInterventions(mixedCases, { schoolId: schoolA }),
    /TENANT_ISOLATION_VIOLATION/,
    'Cross-school case leak in school summary must trigger fail-closed exception'
  );

  console.log('  ✅ مسدودسازی قاطع نشت مستأجران (Fail-Closed) در پرونده‌های مداخله');
}

module.exports = { runTest };
if (require.main === module) runTest();
