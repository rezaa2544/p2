/**
 * tests/semantic-layer/deterministic-and-mutation.test.js
 * تست‌های الزامی چهارگانه:
 *   A) Deterministic Behavior (خروجی قطعی و تکرارپذیر)
 *   B) Mutation Safety (عدم تغییر اشیای ورودی)
 *   C) Regression Protection (عدم تغییر رفتار قبلی)
 *   D) Tenant Isolation (عدم نشت داده بین مستأجران)
 */
'use strict';

const assert = require('assert');
const semantic = require('../../server/analytics/semantic.js');

let pass = 0;
let fail = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`  ✅ ${desc}`);
    pass++;
  } catch (err) {
    console.error(`  ❌ ${desc}:`, err.message);
    fail++;
  }
}

console.log('▸ آزمون‌های الزامی قطعی بودن، امنیت جهش و ایزولاسیون (A/B/C/D)');

// -------------------------------------------------------------
// A) Deterministic Behavior
// -------------------------------------------------------------
test('A) Determinism: ده اجرای پیاپی با داده یکسان خروجی بیت‌به‌بیت یکسان می‌دهند', () => {
  const records = [
    { score: 14, max_score: 20, school_id: 1, date: '2026-10-01' },
    { score: 16, max_score: 20, school_id: 1, date: '2026-10-05' },
    { score: 18, max_score: 20, school_id: 1, date: '2026-10-10' }
  ];

  const firstRun = JSON.stringify(semantic.calculateGradeDistribution(records));
  const firstTrend = JSON.stringify(semantic.calculateLearningProgressTrend(records));

  for (let i = 0; i < 10; i++) {
    const runRes = JSON.stringify(semantic.calculateGradeDistribution(records));
    const trendRes = JSON.stringify(semantic.calculateLearningProgressTrend(records));
    assert.strictEqual(runRes, firstRun, `Run ${i} diverged in grade distribution!`);
    assert.strictEqual(trendRes, firstTrend, `Run ${i} diverged in trend!`);
  }
});

// -------------------------------------------------------------
// B) Mutation Safety
// -------------------------------------------------------------
test('B) Mutation Safety: اشیا و آرایه‌های ورودی منجمد شده (Object.freeze) دستکاری نمی‌شوند', () => {
  const attendanceRecord1 = Object.freeze({ status: 'present', school_id: 10, student_id: 101, date: '2026-10-01' });
  const attendanceRecord2 = Object.freeze({ status: 'absent', school_id: 10, student_id: 102, date: '2026-10-01' });
  const attendanceArray = Object.freeze([attendanceRecord1, attendanceRecord2]);

  // فراخوانی توابع روی داده منجمد
  assert.doesNotThrow(() => {
    semantic.calculateAttendanceRate(attendanceArray, { formula: 'calendar', expectedSchoolId: 10 });
    semantic.calculateChronicAbsence(attendanceArray, { expectedSchoolId: 10 });
    semantic.evaluateCourseEngagement({ courseId: 'c1', attendance: attendanceArray }, { expectedSchoolId: 10 });
    semantic.generateEducationalActivitySummary({ attendance: attendanceArray }, { expectedSchoolId: 10 });
  }, 'Functions threw when operating on frozen input objects!');

  // بررسی عدم تغییر خصوصیات
  assert.strictEqual(attendanceRecord1.status, 'present');
  assert.strictEqual(attendanceRecord2.status, 'absent');
});

test('B2) Mutation Safety: داده نمرات منجمد دست‌نخورده باقی می‌ماند', () => {
  const grade1 = Object.freeze({ score: 15, max_score: 20, school_id: 5, subject_id: 'bio', kind: 'continuous' });
  const grade2 = Object.freeze({ score: 19, max_score: 20, school_id: 5, subject_id: 'bio', kind: 'final' });
  const gradesArray = Object.freeze([grade1, grade2]);

  assert.doesNotThrow(() => {
    semantic.calculateGradeDistribution(gradesArray, { expectedSchoolId: 5 });
    semantic.evaluateLearnerProgress({ studentId: 99, grades: gradesArray }, { expectedSchoolId: 5 });
    semantic.evaluateAssessmentSemantics({ grades: gradesArray }, { expectedSchoolId: 5 });
  }, 'Grade functions threw on frozen input objects!');
});

// -------------------------------------------------------------
// C) Regression Protection
// -------------------------------------------------------------
test('C) Regression Protection: توابع پایه‌ای اولیه عیناً مطابق رفتار مصوب عمل می‌کنند', () => {
  const testRecords = [
    { status: 'present', school_id: 1 },
    { status: 'late', school_id: 1 },
    { status: 'absent', school_id: 1 }
  ];
  const attRes = semantic.calculateAttendanceRate(testRecords);
  assert.strictEqual(attRes.value, 66.67);
  assert.strictEqual(attRes.metric_id, 'attendance_rate');

  const gradeRecords = [
    { score: 12, max_score: 20 },
    { score: 16, max_score: 20 }
  ];
  const gradeRes = semantic.calculateGradeDistribution(gradeRecords);
  assert.strictEqual(gradeRes.mean, 14.0);
  assert.strictEqual(gradeRes.median, 14.0);
});

// -------------------------------------------------------------
// D) Tenant Isolation
// -------------------------------------------------------------
test('D) Tenant Isolation: داده‌های مستأجر A در محاسبات مستأجر B نشت یا اثر نمی‌گذارند', () => {
  const mixedRecords = [
    { status: 'present', school_id: 1 },
    { status: 'present', school_id: 1 },
    { status: 'absent', school_id: 2 } // مدرسه ۲
  ];

  // تلاش برای اجرای محاسبات مدرسه ۱ با حضور داده مدرسه ۲ باید Fail-Closed شود
  assert.throws(() => {
    semantic.calculateAttendanceRate(mixedRecords, { expectedSchoolId: 1 });
  }, /Tenant isolation violation/);

  assert.throws(() => {
    semantic.calculateChronicAbsence(mixedRecords, { expectedSchoolId: 1 });
  }, /Tenant isolation violation/);

  assert.throws(() => {
    semantic.evaluateCourseEngagement({ courseId: 'sub1', attendance: mixedRecords }, { expectedSchoolId: 1 });
  }, /Tenant isolation violation/);
});

test('D2) Tenant Isolation: کوئری‌سازها بدون schoolId ابورت می‌کنند', () => {
  assert.throws(() => {
    semantic.buildAttendanceKpiQuery({ startDate: '2026-09-01' });
  }, /schoolId is required/);

  assert.throws(() => {
    semantic.buildGradesKpiQuery({ subjectId: 'math' });
  }, /schoolId is required/);
});

if (fail > 0) process.exit(1);
