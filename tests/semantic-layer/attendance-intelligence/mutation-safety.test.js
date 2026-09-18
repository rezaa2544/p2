/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/attendance-intelligence/mutation-safety.test.js
   -------------------------------------------------------------------
   P0-EI-04: Mutation Safety & Frozen Object Integrity Tests
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
  console.log('▸ تست ۸: ایمنی در برابر جهش داده‌ها و انجماد اشیا (Object.freeze Mutation Safety)');

  const frozenAttendance = Object.freeze([
    Object.freeze({ id: 1, school_id: 10, student_id: 1, date: '2026-10-01', status: 'absent', late_minutes: 0 }),
    Object.freeze({ id: 2, school_id: 10, student_id: 1, date: '2026-10-02', status: 'late', late_minutes: 15 }),
    Object.freeze({ id: 3, school_id: 10, student_id: 1, date: '2026-10-03', status: 'present', late_minutes: 0 }),
    Object.freeze({ id: 4, school_id: 10, student_id: 1, date: '2026-10-04', status: 'absent', late_minutes: 0 }),
    Object.freeze({ id: 5, school_id: 10, student_id: 1, date: '2026-10-05', status: 'present', late_minutes: 0 })
  ]);
  const frozenStudents = Object.freeze([
    Object.freeze({ id: 1, school_id: 10 })
  ]);

  assert.doesNotThrow(() => {
    const q = analyzeAttendanceQuality({ attendance: frozenAttendance, students: frozenStudents, school_id: 10 });
    const r = detectAttendanceRisk({ attendance: frozenAttendance, studentId: 1 });
    const w = analyzeWeeklyAttendancePattern({ attendance: frozenAttendance, studentId: 1 });
    const l = analyzeLateArrival({ attendance: frozenAttendance, studentId: 1 });
    generateAttendanceInsights({ quality: q, risk: r, weeklyPattern: w, lateArrival: l });
  }, 'هیچ تابعی نباید خصوصیات اشیای منجمد ورودی را تغییر دهد');

  console.log('  ✅ پایداری کامل در برابر اشیای منجمد: تمامی ورودی‌ها بدون تغییر باقی ماندند');
}

if (require.main === module) run();
module.exports = { run };
