/**
 * آزمون ایمنی در برابر جهش داده‌ها و انجماد اشیا (Object.freeze Mutation Safety)
 */

'use strict';

const assert = require('assert');
const {
  buildSchoolIntelligenceSnapshot,
  calculateSchoolHealthIndex,
  generatePrincipalActionCenter,
  generateDistrictAggregation
} = require('../../../server/analytics/school-intelligence-center');

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

function runTest() {
  console.log('▸ تست ۸: ایمنی در برابر جهش داده‌ها و انجماد اشیا (Object.freeze Mutation Safety)');

  const frozenData = deepFreeze({
    schoolId: 10,
    academicYear: '1405-1406',
    grades: [
      { school_id: 10, student_id: 1, score: 17.5 },
      { school_id: 10, student_id: 2, score: 14.0 }
    ],
    attendanceSessions: [
      { school_id: 10, student_id: 1, status: 'present', day: 'شنبه' },
      { school_id: 10, student_id: 2, status: 'absent', day: 'چهارشنبه' }
    ],
    classes: [{ id: 1, school_id: 10 }],
    schedule: [{ school_id: 10, teacher_id: 2 }],
    cases: [{ case_id: 'C1', school_id: 10, status: 'OPEN', priority: 'HIGH', assigned_to_id: null }],
    teacherNotes: [{ school_id: 10, teacher_id: 2, student_id: 1, body: 'یادداشت' }]
  });

  assert.doesNotThrow(() => {
    const snapshot = buildSchoolIntelligenceSnapshot(frozenData);
    calculateSchoolHealthIndex(snapshot);
    generatePrincipalActionCenter(snapshot);
    generateDistrictAggregation([snapshot]);
  }, 'All functions must execute safely with deeply frozen objects');

  console.log('  ✅ پایداری کامل در برابر اشیای منجمد: تمامی ورودی‌ها بدون تغییر باقی ماندند');
}

module.exports = { runTest };
if (require.main === module) runTest();
