/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/attendance-intelligence/deterministic.test.js
   -------------------------------------------------------------------
   P0-EI-04: Deterministic Execution Integrity (10 Runs Bit-Identical)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const {
  analyzeAttendanceQuality,
  detectAttendanceRisk,
  analyzeWeeklyAttendancePattern,
  analyzeLateArrival,
  generateAttendanceInsights
} = require('../../../server/analytics/attendance-intelligence');

function run() {
  console.log('▸ تست ۷: آزمون قطعیت و بازتولیدپذیری بیت‌به‌بیت (Deterministic 10-Execution)');

  const mockAttendance = [
    { id: 1, school_id: 10, student_id: 101, date: '1403-07-14', status: 'absent', late_minutes: 0 },
    { id: 2, school_id: 10, student_id: 101, date: '1403-07-15', status: 'late', late_minutes: 20 },
    { id: 3, school_id: 10, student_id: 101, date: '1403-07-16', status: 'present', late_minutes: 0 },
    { id: 4, school_id: 10, student_id: 101, date: '1403-07-21', status: 'absent', late_minutes: 0 },
    { id: 5, school_id: 10, student_id: 101, date: '1403-07-22', status: 'late', late_minutes: 30 }
  ];
  const mockStudents = [{ id: 101, school_id: 10 }];

  let baseQ, baseR, baseW, baseL, baseI;

  for (let runIdx = 0; runIdx < 10; runIdx++) {
    const q = JSON.stringify(analyzeAttendanceQuality({ attendance: mockAttendance, students: mockStudents, school_id: 10 }));
    const r = JSON.stringify(detectAttendanceRisk({ attendance: mockAttendance, studentId: 101 }));
    const w = JSON.stringify(analyzeWeeklyAttendancePattern({ attendance: mockAttendance, studentId: 101 }));
    const l = JSON.stringify(analyzeLateArrival({ attendance: mockAttendance, studentId: 101 }));
    const i = JSON.stringify(generateAttendanceInsights({
      risk: JSON.parse(r),
      weeklyPattern: JSON.parse(w),
      lateArrival: JSON.parse(l),
      quality: JSON.parse(q)
    }));

    if (runIdx === 0) {
      baseQ = q;
      baseR = r;
      baseW = w;
      baseL = l;
      baseI = i;
    } else {
      assert.strictEqual(q, baseQ, `انحراف در اجرای ${runIdx} تابع analyzeAttendanceQuality`);
      assert.strictEqual(r, baseR, `انحراف در اجرای ${runIdx} تابع detectAttendanceRisk`);
      assert.strictEqual(w, baseW, `انحراف در اجرای ${runIdx} تابع analyzeWeeklyAttendancePattern`);
      assert.strictEqual(l, baseL, `انحراف در اجرای ${runIdx} تابع analyzeLateArrival`);
      assert.strictEqual(i, baseI, `انحراف در اجرای ${runIdx} تابع generateAttendanceInsights`);
    }
  }

  console.log('  ✅ قطعیت ۱۰۰٪: ده اجرای متوالی تمامی توابع خروجی‌های بیت‌به‌بیت یکسان تولید کردند');
}

if (require.main === module) run();
module.exports = { run };
