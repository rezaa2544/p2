/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/attendance-intelligence/attendance-quality.test.js
   -------------------------------------------------------------------
   P0-EI-04: Attendance Quality & Reliability Score Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { analyzeAttendanceQuality } = require('../../../server/analytics/attendance-intelligence');

function run() {
  console.log('▸ تست ۱: تحلیل کیفیت و پایایی ثبت حضور (analyzeAttendanceQuality)');

  // سناریو ۱: داده‌های با کیفیت عالی (کامل، معتبر و به‌موقع)
  const perfectAttendance = [
    { school_id: 10, student_id: 1, date: '2026-10-01', created_at: '2026-10-01T08:00:00Z', status: 'present' },
    { school_id: 10, student_id: 2, date: '2026-10-01', created_at: '2026-10-01T08:00:00Z', status: 'present' },
    { school_id: 10, student_id: 1, date: '2026-10-02', created_at: '2026-10-02T08:00:00Z', status: 'present' },
    { school_id: 10, student_id: 2, date: '2026-10-02', created_at: '2026-10-02T08:00:00Z', status: 'absent' }
  ];
  const students = [{ id: 1, school_id: 10 }, { id: 2, school_id: 10 }];

  const res1 = analyzeAttendanceQuality({
    attendance: perfectAttendance,
    students,
    school_id: 10
  });

  assert.strictEqual(res1.validity, 100, 'تمامی رکوردها باید معتبر شناخته شوند');
  assert.strictEqual(res1.completeness, 100, 'جامعیت داده‌ها باید ۱۰۰٪ باشد');
  assert.strictEqual(res1.freshness, 100, 'ثبت در همان روز باید تازگی ۱۰۰٪ داشته باشد');
  assert(res1.reliability_score >= 90, 'امتیاز پایایی باید عالی باشد');
  assert.strictEqual(res1.quality_grade, 'EXCELLENT', 'رتبه کیفی باید EXCELLENT باشد');

  // سناریو ۲: داده‌های ناقص با وضعیت‌های نامعتبر
  const poorAttendance = [
    { school_id: 10, student_id: 1, date: '2026-10-01', created_at: '2026-10-01T08:00:00Z', status: 'unknown_status' },
    { school_id: 10, student_id: 2, date: '2026-10-01', created_at: '2026-10-01T08:00:00Z', status: null }
  ];

  const res2 = analyzeAttendanceQuality({
    attendance: poorAttendance,
    students,
    school_id: 10
  }, { expectedSessions: 10 });

  assert.strictEqual(res2.validity, 0, 'هیچ رکورد معتبری نباید شناسایی شود');
  assert(res2.completeness <= 20, 'جامعیت با ۱۰ جلسه مورد انتظار باید ۲۰٪ یا کمتر باشد');
  assert.strictEqual(res2.unclassified_records, 2);
  assert.strictEqual(res2.quality_grade, 'POOR');

  // سناریو ۳: آرایه خالی و رفتار ایمن
  const resEmpty = analyzeAttendanceQuality({ attendance: [], students: [], school_id: 10 });
  assert.strictEqual(resEmpty.reliability_score, 0);
  assert.strictEqual(resEmpty.quality_grade, 'POOR');

  console.log('  ✅ صحت ارزیابی کیفیت ثبت، پایایی، جامعیت و طبقه‌بندی کیفی');
}

if (require.main === module) run();
module.exports = { run };
