/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/attendance-intelligence/consecutive-pattern.test.js
   -------------------------------------------------------------------
   P0-EI-04: Consecutive and Scattered Absence Patterns Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { detectAttendanceRisk } = require('../../../server/analytics/attendance-intelligence');

function run() {
  console.log('▸ تست ۳: تحلیل الگوی غیبت‌های متوالی و متمرکز (Consecutive & Scattered)');

  // سناریو ۱: ۳ جلسه غیبت متوالی غیرموجه
  const attConsecutive3 = [
    { student_id: 1, date: '2026-10-01', status: 'present' },
    { student_id: 1, date: '2026-10-02', status: 'absent' },
    { student_id: 1, date: '2026-10-03', status: 'absent' },
    { student_id: 1, date: '2026-10-04', status: 'absent' },
    { student_id: 1, date: '2026-10-05', status: 'present' }
  ];

  const res1 = detectAttendanceRisk({ attendance: attConsecutive3, studentId: 1 });
  assert.strictEqual(res1.consecutive_absent_streak, 3);
  assert(res1.periods.some(p => p.type === 'CONSECUTIVE_ABSENCE' && p.session_count === 3));
  assert(res1.evidence.some(e => e.includes('جلسه غیبت متوالی') && (e.includes('3') || e.includes('۳'))));

  // سناریو ۲: ۵ جلسه غیبت متوالی غیرموجه -> ریسک CRITICAL
  const attConsecutive5 = [
    { student_id: 2, date: '2026-10-01', status: 'absent' },
    { student_id: 2, date: '2026-10-02', status: 'absent' },
    { student_id: 2, date: '2026-10-03', status: 'absent' },
    { student_id: 2, date: '2026-10-04', status: 'absent' },
    { student_id: 2, date: '2026-10-05', status: 'absent' },
    { student_id: 2, date: '2026-10-06', status: 'present' }
  ];

  const res2 = detectAttendanceRisk({ attendance: attConsecutive5, studentId: 2 });
  assert.strictEqual(res2.consecutive_absent_streak, 5);
  assert.strictEqual(res2.risk_level, 'CRITICAL', '۵ جلسه متوالی باید ریسک CRITICAL باشد');

  // سناریو ۳: غیبت‌های پراکنده اما متمرکز در بازه کوتاه‌مدت (۵ غیبت در ۱۰ جلسه)
  const attScattered = [
    { student_id: 3, date: '2026-10-01', status: 'absent' },
    { student_id: 3, date: '2026-10-02', status: 'present' },
    { student_id: 3, date: '2026-10-03', status: 'absent' },
    { student_id: 3, date: '2026-10-04', status: 'present' },
    { student_id: 3, date: '2026-10-05', status: 'absent' },
    { student_id: 3, date: '2026-10-06', status: 'present' },
    { student_id: 3, date: '2026-10-07', status: 'absent' },
    { student_id: 3, date: '2026-10-08', status: 'present' },
    { student_id: 3, date: '2026-10-09', status: 'absent' },
    { student_id: 3, date: '2026-10-10', status: 'present' }
  ];

  const res3 = detectAttendanceRisk({ attendance: attScattered, studentId: 3 });
  assert(res3.periods.some(p => p.type === 'SCATTERED_ABSENCE'));
  assert(res3.evidence.some(e => e.includes('۵ جلسه غیبت متمرکز')));

  console.log('  ✅ شناسایی توالی ۳ و ۵ جلسه غیبت متوالی و پنجره‌های غیبت متمرکز');
}

if (require.main === module) run();
module.exports = { run };
