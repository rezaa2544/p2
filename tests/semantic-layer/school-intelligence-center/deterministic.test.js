/**
 * آزمون قطعیت و بازتولیدپذیری بیت‌به‌بیت (Deterministic 10-Execution Integrity)
 */

'use strict';

const assert = require('assert');
const {
  buildSchoolIntelligenceSnapshot,
  calculateSchoolHealthIndex,
  generatePrincipalActionCenter,
  generateDistrictAggregation
} = require('../../../server/analytics/school-intelligence-center');

function runTest() {
  console.log('▸ تست ۷: آزمون قطعیت و بازتولیدپذیری بیت‌به‌بیت (Deterministic 10-Execution)');

  const fixedNow = '2026-09-18T10:00:00.000Z';
  const schoolData = {
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
  };

  let baseSnapshot, baseHealth, baseActions, baseDistrict;

  for (let i = 0; i < 10; i++) {
    const snapshot = buildSchoolIntelligenceSnapshot(schoolData, { now: fixedNow });
    const health = calculateSchoolHealthIndex(snapshot);
    const actions = generatePrincipalActionCenter(snapshot);
    const district = generateDistrictAggregation([snapshot], { districtId: 1, now: fixedNow });

    const sSnapshot = JSON.stringify(snapshot);
    const sHealth = JSON.stringify(health);
    const sActions = JSON.stringify(actions);
    const sDistrict = JSON.stringify(district);

    if (i === 0) {
      baseSnapshot = sSnapshot;
      baseHealth = sHealth;
      baseActions = sActions;
      baseDistrict = sDistrict;
    } else {
      assert.strictEqual(sSnapshot, baseSnapshot, `Snapshot mismatch at iteration ${i}`);
      assert.strictEqual(sHealth, baseHealth, `Health index mismatch at iteration ${i}`);
      assert.strictEqual(sActions, baseActions, `Action center mismatch at iteration ${i}`);
      assert.strictEqual(sDistrict, baseDistrict, `District summary mismatch at iteration ${i}`);
    }
  }

  console.log('  ✅ قطعیت ۱۰۰٪: ده اجرای متوالی تمامی توابع خروجی‌های بیت‌به‌بیت یکسان تولید کردند');
}

module.exports = { runTest };
if (require.main === module) runTest();
