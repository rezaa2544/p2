/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/attendance-analytics.test.js
   -------------------------------------------------------------------
   P0-EI-04: Attendance Analytics Foundation Test Suite
   - Punctuality & Late Minutes Analysis
   - Truancy & Consecutive Absence Streaks
   - Day-of-Week Temporal Attendance Patterns
   - Attendance Data Quality Score (DQS Composite)
   - End-to-End Analytics Report
   - Partition Pruning Query Builder
   - Mutation Safety & Tenant Isolation Guards
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const {
  calculatePunctualityMetrics,
  detectAbsenceStreaks,
  calculateDayOfWeekPatterns,
  calculateAttendanceDataQuality,
  buildAttendanceAnalyticsReport,
  buildAttendanceAnalyticsQuery
} = require('../../server/analytics/attendance');

function run() {
  console.log('▸ تست‌های پایه حضور و تحلیل غیبت (Attendance Analytics Foundation)');

  // ── ۱. تست وقت‌شناسی و دقایق تأخیر (Punctuality) ─────────────────
  {
    const attendance = [
      { id: 1, school_id: 10, status: 'present' },
      { id: 2, school_id: 10, status: 'present' },
      { id: 3, school_id: 10, status: 'late', late_minutes: 20 },
      { id: 4, school_id: 10, status: 'late', late_minutes: 10 },
      { id: 5, school_id: 10, status: 'present' }
    ];

    const res = calculatePunctualityMetrics({
      attendance,
      expectedSchoolId: 10
    });

    assert.strictEqual(res.total_sessions, 5);
    assert.strictEqual(res.late_sessions, 2);
    assert.strictEqual(res.total_late_minutes, 30);
    assert.strictEqual(res.avg_late_minutes, 15.0);
    assert.strictEqual(res.punctuality_rate, 0.6);
    assert.strictEqual(res.status, 'NEEDS_ATTENTION');
    console.log('  ✅ محاسبه شاخص وقت‌شناسی، دقایق تأخیر و میانگین دیرکرد');
  }

  // ── ۲. تست کشف توالی غیبت‌های متوالی (Streaks / Truancy) ──────────
  {
    const attendance = [
      // دانش‌آموز ۱: ۳ غیبت متوالی
      { id: 1, school_id: 10, student_id: 101, status: 'absent', date: '2026-10-01' },
      { id: 2, school_id: 10, student_id: 101, status: 'absent', date: '2026-10-02' },
      { id: 3, school_id: 10, student_id: 101, status: 'absent', date: '2026-10-03' },
      // دانش‌آموز ۲: غیبت متناوب (بدون توالی ۳)
      { id: 4, school_id: 10, student_id: 102, status: 'absent', date: '2026-10-01' },
      { id: 5, school_id: 10, student_id: 102, status: 'present', date: '2026-10-02' },
      { id: 6, school_id: 10, student_id: 102, status: 'absent', date: '2026-10-03' }
    ];

    const res = detectAbsenceStreaks({
      attendance,
      streakThreshold: 3,
      expectedSchoolId: 10
    });

    assert.strictEqual(res.alerts_count, 1, 'باید دقیقاً ۱ هشدار توالی صادر شود');
    assert.strictEqual(res.alerts[0].student_id, 101);
    assert.strictEqual(res.alerts[0].consecutive_absences, 3);
    assert.strictEqual(res.alerts[0].severity, 'WARNING');
    assert.strictEqual(res.alerts[0].intervention_recommended, true);
    console.log('  ✅ کشف غیبت‌های متوالی و صدور هشدار پیشگیرانه ترک تحصیل');
  }

  // ── ۳. تست توزیع زمانی غیبت در روزهای هفته (Day of Week Patterns) ─
  {
    // 2026-10-03 شنبه (Saturday: getDay() === 6)
    // 2026-10-07 چهارشنبه (Wednesday: getDay() === 3)
    const attendance = [
      { id: 1, school_id: 10, status: 'present', date: '2026-10-03' },
      { id: 2, school_id: 10, status: 'present', date: '2026-10-03' },
      { id: 3, school_id: 10, status: 'absent', date: '2026-10-07' },
      { id: 4, school_id: 10, status: 'absent', date: '2026-10-07' }
    ];

    const res = calculateDayOfWeekPatterns({
      attendance,
      expectedSchoolId: 10
    });

    assert.ok(Array.isArray(res.breakdown));
    assert.strictEqual(res.highest_absence_day, 'چهارشنبه');
    assert.strictEqual(res.max_absence_rate, 1.0);
    console.log('  ✅ تحلیل الگوی هفتگی حضور و شناسایی روزهای پرغیبت');
  }

  // ── ۴. تست کیفیت داده حضور و غیاب (DQS Composite) ───────────────
  {
    const enrollments = [
      { id: 1, school_id: 10, class_id: 1, student_id: 101 },
      { id: 2, school_id: 10, class_id: 1, student_id: 102 }
    ];
    const attendance = [
      { id: 1, school_id: 10, class_id: 1, student_id: 101, status: 'present', date: '2026-10-01', created_at: '2026-10-01' },
      { id: 2, school_id: 10, class_id: 1, student_id: 102, status: 'absent', date: '2026-10-01', created_at: '2026-10-01' }
    ];

    const dqs = calculateAttendanceDataQuality({
      attendance,
      enrollments,
      expectedSchoolId: 10
    });

    assert.strictEqual(dqs.composite_dqs >= 85, true);
    assert.strictEqual(dqs.confidence_level, 'HIGH');
    assert.strictEqual(dqs.completeness, 100);
    assert.strictEqual(dqs.validity, 100);
    console.log('  ✅ ارزیابی ۴گانه امتیاز کیفیت داده حضور و غیاب (DQS Composite)');
  }

  // ── ۵. تست گزارش تحلیلی جامع حضور (Analytics Report) ────────────
  {
    const enrollments = [
      { id: 1, school_id: 10, class_id: 1, student_id: 101 },
      { id: 2, school_id: 10, class_id: 1, student_id: 102 }
    ];
    const attendance = [
      { id: 1, school_id: 10, class_id: 1, student_id: 101, status: 'present', date: '2026-10-01' },
      { id: 2, school_id: 10, class_id: 1, student_id: 101, status: 'present', date: '2026-10-02' },
      { id: 3, school_id: 10, class_id: 1, student_id: 101, status: 'present', date: '2026-10-03' },
      { id: 4, school_id: 10, class_id: 1, student_id: 101, status: 'present', date: '2026-10-04' },
      { id: 5, school_id: 10, class_id: 1, student_id: 101, status: 'present', date: '2026-10-05' },

      { id: 6, school_id: 10, class_id: 1, student_id: 102, status: 'absent', date: '2026-10-01' },
      { id: 7, school_id: 10, class_id: 1, student_id: 102, status: 'absent', date: '2026-10-02' },
      { id: 8, school_id: 10, class_id: 1, student_id: 102, status: 'absent', date: '2026-10-03' },
      { id: 9, school_id: 10, class_id: 1, student_id: 102, status: 'present', date: '2026-10-04' },
      { id: 10, school_id: 10, class_id: 1, student_id: 102, status: 'present', date: '2026-10-05' }
    ];

    const report = buildAttendanceAnalyticsReport({
      attendance,
      enrollments,
      classId: 1,
      minRequiredSessions: 5,
      expectedSchoolId: 10
    });

    assert.strictEqual(report.report_type, 'ATTENDANCE_ANALYTICS_FOUNDATION');
    assert.strictEqual(report.attendance_rate.total_sessions, 10);
    assert.strictEqual(report.attendance_rate.calendar_rate, 0.7);
    assert.strictEqual(report.chronic_absence.chronic_students_count, 1);
    assert.strictEqual(report.early_warning_streaks.streak_alerts_count, 1);
    assert.strictEqual(report.data_quality.confidence_level, 'HIGH');
    console.log('  ✅ ارکستراسیون گزارش جامع حضور، غیبت مزمن و هشدارهای زودهنگام');
  }

  // ── ۶. تست کوئری‌ساز پارتیشن‌ها (Query Builder) ──────────────────
  {
    const q = buildAttendanceAnalyticsQuery({
      schoolId: 10,
      classId: 1,
      startDate: '2026-09-01T00:00:00Z',
      endDate: '2026-12-30T23:59:59Z'
    });

    assert.strictEqual(q.target_table, 'attendance');
    assert.strictEqual(q.partition_pruning_enabled, true);
    assert.ok(q.sql.includes('school_id = $1'));
    assert.ok(q.sql.includes('created_at >= $2'));
    assert.strictEqual(q.values[0], 10);

    // Fail-closed
    assert.throws(() => {
      buildAttendanceAnalyticsQuery({ classId: 1 });
    }, /TENANT_ISOLATION_VIOLATION/);
    console.log('  ✅ صحت ساخت کوئری هرس پارتیشن‌ها برای حضور و گارد Fail-Closed');
  }

  // ── ۷. تست عدم تغییر اشیا (Mutation Safety) و ایزولاسیون مستأجران ─
  {
    const frozenAtt = Object.freeze([
      Object.freeze({ id: 1, school_id: 10, status: 'present', date: '2026-10-01' })
    ]);

    assert.doesNotThrow(() => {
      calculatePunctualityMetrics({ attendance: frozenAtt, expectedSchoolId: 10 });
    });

    const leakedAtt = [
      { id: 1, school_id: 10, status: 'present' },
      { id: 2, school_id: 99, status: 'absent' }
    ];
    assert.throws(() => {
      calculatePunctualityMetrics({ attendance: leakedAtt, expectedSchoolId: 10 });
    }, err => err.code === 'TENANT_ISOLATION_VIOLATION' || /Tenant isolation violation/i.test(err.message));
    console.log('  ✅ ایمنی در برابر اشیای منجمد (Mutation Safety) و مسدودسازی نشت داده مستأجران');
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
