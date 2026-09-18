/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/attendance-intelligence/chronic-absence-detection.test.js
   -------------------------------------------------------------------
   P0-EI-04: Chronic & Critical Absence Detection Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { detectAttendanceRisk } = require('../../../server/analytics/attendance-intelligence');

function run() {
  console.log('▸ تست ۲: کشف و سطح‌بندی غیبت مزمن و بحرانی (Chronic & Critical Absence)');

  // سناریو ۱: غیبت مزمن (۲ جلسه غیبت از ۱۰ جلسه = ۲۰٪ غیبت بحرانی)
  const attStudent1 = [
    { student_id: 1, date: '2026-10-01', status: 'present' },
    { student_id: 1, date: '2026-10-02', status: 'present' },
    { student_id: 1, date: '2026-10-03', status: 'absent' },
    { student_id: 1, date: '2026-10-04', status: 'present' },
    { student_id: 1, date: '2026-10-05', status: 'present' },
    { student_id: 1, date: '2026-10-06', status: 'excused' },
    { student_id: 1, date: '2026-10-07', status: 'present' },
    { student_id: 1, date: '2026-10-08', status: 'present' },
    { student_id: 1, date: '2026-10-09', status: 'present' },
    { student_id: 1, date: '2026-10-10', status: 'present' }
  ];

  const res1 = detectAttendanceRisk({ attendance: attStudent1, studentId: 1 });
  assert.strictEqual(res1.total_sessions, 10);
  assert.strictEqual(res1.absence_rate, 20.0);
  assert.strictEqual(res1.is_chronic, true);
  assert.strictEqual(res1.is_critical, true);
  assert.strictEqual(res1.risk_level, 'CRITICAL');
  assert(res1.evidence.some(e => e.includes('بحرانی')));

  // سناریو ۲: غیبت ۱۰٪ (۱ غیبت از ۱۰ جلسه -> مزمن ولی غیر بحرانی)
  const attStudent2 = [
    { student_id: 2, date: '2026-10-01', status: 'absent' },
    { student_id: 2, date: '2026-10-02', status: 'present' },
    { student_id: 2, date: '2026-10-03', status: 'present' },
    { student_id: 2, date: '2026-10-04', status: 'present' },
    { student_id: 2, date: '2026-10-05', status: 'present' },
    { student_id: 2, date: '2026-10-06', status: 'present' },
    { student_id: 2, date: '2026-10-07', status: 'present' },
    { student_id: 2, date: '2026-10-08', status: 'present' },
    { student_id: 2, date: '2026-10-09', status: 'present' },
    { student_id: 2, date: '2026-10-10', status: 'present' }
  ];

  const res2 = detectAttendanceRisk({ attendance: attStudent2, studentId: 2 });
  assert.strictEqual(res2.absence_rate, 10.0);
  assert.strictEqual(res2.is_chronic, true);
  assert.strictEqual(res2.is_critical, false);
  assert.strictEqual(res2.risk_level, 'HIGH');

  // سناریو ۳: شرط کف مشاهدات (کمتر از ۵ جلسه نباید مزمن شمرده شود)
  const attFewSessions = [
    { student_id: 3, date: '2026-10-01', status: 'absent' },
    { student_id: 3, date: '2026-10-02', status: 'present' },
    { student_id: 3, date: '2026-10-03', status: 'present' }
  ];

  const res3 = detectAttendanceRisk({ attendance: attFewSessions, studentId: 3 });
  assert.strictEqual(res3.total_sessions, 3);
  assert.strictEqual(res3.is_chronic, false, 'کمتر از ۵ جلسه نباید مزمن شود');
  assert.strictEqual(res3.is_critical, false);

  console.log('  ✅ تفکیک دقیق غیبت مزمن، غیبت بحرانی و اعمال شرط کف جلسات');
}

if (require.main === module) run();
module.exports = { run };
