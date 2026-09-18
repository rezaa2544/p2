/**
 * آزمون ارزیابی قوانین هشدار زودهنگام (Early Warning Rules)
 */

'use strict';

const assert = require('assert');
const { evaluateEarlyWarningRules } = require('../../../server/analytics/intervention-case-management');

function runTest() {
  console.log('▸ تست ۲: ارزیابی قوانین هشدار زودهنگام قاعده‌محور (evaluateEarlyWarningRules)');

  // ۱. ریسک مرکب ترک تحصیل: معدل زیر ۱۰ + غیبت حاد
  const compoundRisk = evaluateEarlyWarningRules({
    studentId: 201,
    schoolId: 10,
    currentGpa: 8.5,
    recentAttendanceRate: 80.0,
    consecutiveAbsences: 4
  });

  assert.strictEqual(compoundRisk.has_critical_risk, true);
  assert.strictEqual(compoundRisk.highest_priority, 'CRITICAL');
  assert.ok(compoundRisk.alerts.some(a => a.trigger_type === 'DROPOUT_RISK_COMPOUND'));

  // ۲. افت شدید تحصیلی: افت بیش از ۳ نمره
  const academicDrop = evaluateEarlyWarningRules({
    studentId: 202,
    schoolId: 10,
    currentGpa: 11.5,
    previousGpa: 15.0,
    recentAttendanceRate: 95.0
  });

  assert.strictEqual(academicDrop.has_critical_risk, false);
  assert.strictEqual(academicDrop.highest_priority, 'HIGH');
  assert.ok(academicDrop.alerts.some(a => a.trigger_type === 'CRITICAL_ACADEMIC_DROP'));

  // ۳. غیبت مزمن و متوالی
  const chronicAbsence = evaluateEarlyWarningRules({
    studentId: 203,
    schoolId: 10,
    currentGpa: 16.0,
    recentAttendanceRate: 88.0,
    consecutiveAbsences: 3
  });

  assert.strictEqual(chronicAbsence.highest_priority, 'HIGH');
  assert.ok(chronicAbsence.alerts.some(a => a.trigger_type === 'CHRONIC_ABSENCE_ALERT'));

  // ۴. دانش‌آموز پایدار و بدون هشدار
  const stableStudent = evaluateEarlyWarningRules({
    studentId: 204,
    schoolId: 10,
    currentGpa: 17.5,
    recentAttendanceRate: 98.0,
    consecutiveAbsences: 0
  });

  assert.strictEqual(stableStudent.alerts.length, 0);
  assert.strictEqual(stableStudent.has_critical_risk, false);
  assert.strictEqual(stableStudent.highest_priority, 'NONE');

  console.log('  ✅ صحت عملکرد قوانین چهارگانه هشدار زودهنگام و طبقه‌بندی اولویت‌ها');
}

module.exports = { runTest };
if (require.main === module) runTest();
