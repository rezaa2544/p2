/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/attendance-intelligence/late-arrival.test.js
   -------------------------------------------------------------------
   P0-EI-04: Late Arrival Intelligence & Trend Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { analyzeLateArrival } = require('../../../server/analytics/attendance-intelligence');

function run() {
  console.log('▸ تست ۵: هوشمندی تأخیر در ورود و روند افزایشی (Late Arrival Intelligence)');

  // سناریو ۱: روند افزایشی و تشدید تأخیرها (Escalation)
  const attLateIncreasing = [
    { student_id: 1, date: '2026-10-01', status: 'late', late_minutes: 5 },
    { student_id: 1, date: '2026-10-02', status: 'present' },
    { student_id: 1, date: '2026-10-03', status: 'late', late_minutes: 15 },
    { student_id: 1, date: '2026-10-04', status: 'present' },
    { student_id: 1, date: '2026-10-05', status: 'late', late_minutes: 25 },
    { student_id: 1, date: '2026-10-06', status: 'late', late_minutes: 35 }
  ];

  const res1 = analyzeLateArrival({ attendance: attLateIncreasing, studentId: 1 });
  assert.strictEqual(res1.late_count, 4);
  assert.strictEqual(res1.total_sessions, 6);
  assert.strictEqual(res1.average_delay_minutes, 20.0);
  assert.strictEqual(res1.max_delay_minutes, 35);
  assert.strictEqual(res1.trend, 'INCREASING');
  assert.strictEqual(res1.escalation_detected, true, 'تأخیر فزاینده با میانگین ۲۰ دقیقه باید بحرانی شناخته شود');

  // سناریو ۲: تعداد ناکافی تأخیر (< ۳ جلسه)
  const attFewLate = [
    { student_id: 2, date: '2026-10-01', status: 'late', late_minutes: 10 },
    { student_id: 2, date: '2026-10-02', status: 'present' }
  ];

  const res2 = analyzeLateArrival({ attendance: attFewLate, studentId: 2 });
  assert.strictEqual(res2.late_count, 1);
  assert.strictEqual(res2.trend, 'INSUFFICIENT_DATA');
  assert.strictEqual(res2.escalation_detected, false);

  // سناریو ۳: تأخیر پایدار بدون روند فزاینده
  const attLateStable = [
    { student_id: 3, date: '2026-10-01', status: 'late', late_minutes: 10 },
    { student_id: 3, date: '2026-10-02', status: 'late', late_minutes: 10 },
    { student_id: 3, date: '2026-10-03', status: 'late', late_minutes: 10 }
  ];

  const res3 = analyzeLateArrival({ attendance: attLateStable, studentId: 3 });
  assert.strictEqual(res3.trend, 'STABLE');
  assert.strictEqual(res3.escalation_detected, false);

  console.log('  ✅ صحت شمارش تأخیرها، میانگین دقایق، تحلیل شیب رگرسیون و کشف تشدید تأخیر');
}

if (require.main === module) run();
module.exports = { run };
