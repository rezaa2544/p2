/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/attendance-intelligence/weekly-pattern.test.js
   -------------------------------------------------------------------
   P0-EI-04: Weekly Absence Pattern Analysis Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { analyzeWeeklyAttendancePattern } = require('../../../server/analytics/attendance-intelligence');

function run() {
  console.log('▸ تست ۴: تحلیل الگوی هفتگی غیبت (Weekly Absence Pattern)');

  // سناریو ۱: غیبت‌های متمرکز در روزهای شنبه
  // در تاریخ شمسی: ۱۴۰۳-۰۷-۱۴ شنبه است (2024-10-05)
  // ۱۴۰۳-۰۷-۲۱ شنبه است (2024-10-12)
  // ۱۴۰۳-۰۷-۲۸ شنبه است (2024-10-19)
  const attSaturdayPattern = [
    { student_id: 1, date: '1403-07-14', status: 'absent' }, // شنبه
    { student_id: 1, date: '1403-07-15', status: 'present' }, // یکشنبه
    { student_id: 1, date: '1403-07-16', status: 'present' }, // دوشنبه
    { student_id: 1, date: '1403-07-21', status: 'absent' }, // شنبه
    { student_id: 1, date: '1403-07-22', status: 'present' }, // یکشنبه
    { student_id: 1, date: '1403-07-28', status: 'absent' }, // شنبه
    { student_id: 1, date: '1403-07-29', status: 'present' }  // یکشنبه
  ];

  const res1 = analyzeWeeklyAttendancePattern({ attendance: attSaturdayPattern, studentId: 1 });
  assert.strictEqual(res1.saturday.count, 3);
  assert.strictEqual(res1.saturday.total_sessions, 3);
  assert.strictEqual(res1.saturday.rate, 100);
  assert.strictEqual(res1.sunday.count, 0);
  assert.strictEqual(res1.highest_risk_day, 'saturday');
  assert.strictEqual(res1.pattern_detected, true);
  assert.strictEqual(res1.weekday_risk_profile, 'HIGHER_ON_SATURDAY');

  // سناریو ۲: بدون غیبت (حضور کامل)
  const attPerfect = [
    { student_id: 2, weekday: 'saturday', status: 'present' },
    { student_id: 2, weekday: 'sunday', status: 'present' },
    { student_id: 2, weekday: 'monday', status: 'present' },
    { student_id: 2, weekday: 'tuesday', status: 'present' },
    { student_id: 2, weekday: 'wednesday', status: 'present' }
  ];

  const res2 = analyzeWeeklyAttendancePattern({ attendance: attPerfect, studentId: 2 });
  assert.strictEqual(res2.pattern_detected, false);
  assert.strictEqual(res2.highest_risk_day, null);
  assert.strictEqual(res2.weekday_risk_profile, 'PERFECT_ATTENDANCE');

  console.log('  ✅ تفکیک روزهای شنبه تا چهارشنبه، تشخیص روز با بیشترین ریسک و الگوی هفتگی');
}

if (require.main === module) run();
module.exports = { run };
