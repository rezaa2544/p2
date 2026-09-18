/**
 * آزمون شاخص سلامت مدرسه و اصل عدم پنهان‌سازی (No-Masking Health Index)
 */

'use strict';

const assert = require('assert');
const { calculateSchoolHealthIndex } = require('../../../server/analytics/school-intelligence-center');

function runTest() {
  console.log('▸ تست ۲: شاخص سلامت مدرسه و اصل عدم پنهان‌سازی (calculateSchoolHealthIndex & No-Masking)');

  // ۱. مدرسه با وضعیت عالی و سلامت کامل (HEALTHY)
  const healthySchool = calculateSchoolHealthIndex({
    academic_summary: { average_gpa: 17.5, failing_students_ratio: 0.02 },
    attendance_summary: { calendar_rate: 96.0, chronic_absence_rate: 3.0 },
    parent_summary: { average_pei: 88.0 },
    intervention_summary: { resolution_rate: 90.0, unassigned_high_priority_count: 0 }
  });

  assert.ok(healthySchool.score >= 80, 'Score should be high');
  assert.strictEqual(healthySchool.status, 'HEALTHY');
  assert.strictEqual(healthySchool.critical_risk_count, 0);
  assert.strictEqual(healthySchool.no_masking_applied, false);

  // ۲. مدرسه با نمره عددی نسبتاً بالا ولی دارای طغیان غیبت مزمن (No-Masking Trigger)
  // حتی با معدل بالا، غیبت مزمن بالای ۱۵٪ باید وضعیت را بلافاصله به NEEDS_IMMEDIATE_ACTION تغییر دهد
  const maskedSchool = calculateSchoolHealthIndex({
    academic_summary: { average_gpa: 18.0, failing_students_ratio: 0.01 },
    attendance_summary: { calendar_rate: 85.0, chronic_absence_rate: 16.0 }, // بحرانی!
    parent_summary: { average_pei: 80.0 },
    intervention_summary: { resolution_rate: 80.0, unassigned_high_priority_count: 0 }
  });

  assert.strictEqual(maskedSchool.critical_risk_count, 1);
  assert.strictEqual(maskedSchool.status, 'NEEDS_IMMEDIATE_ACTION', 'No-Masking must override status to NEEDS_IMMEDIATE_ACTION');
  assert.strictEqual(maskedSchool.no_masking_applied, true);

  // ۳. مدرسه با پرونده‌های بحرانی مداخله بدون مسئول
  const unassignedCaseSchool = calculateSchoolHealthIndex({
    academic_summary: { average_gpa: 15.0, failing_students_ratio: 0.05 },
    attendance_summary: { calendar_rate: 92.0, chronic_absence_rate: 4.0 },
    parent_summary: { average_pei: 75.0 },
    intervention_summary: { resolution_rate: 70.0, unassigned_high_priority_count: 2 } // بحرانی!
  });

  assert.strictEqual(unassignedCaseSchool.status, 'NEEDS_IMMEDIATE_ACTION');
  assert.strictEqual(unassignedCaseSchool.critical_risk_count, 1);

  console.log('  ✅ صحت اعمال اصل No-Masking و عدم پنهان‌سازی بحران‌های غیبت یا مداخله');
}

module.exports = { runTest };
if (require.main === module) runTest();
