/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/assessment-analytics.test.js
   -------------------------------------------------------------------
   P0-EI-03: Assessment Analytics Foundation Test Suite
   - Assessment Coverage & Missing Students
   - Timeliness Metrics & Latency
   - Grade Outlier Detection (Tukey's Fences)
   - Data Quality Score (DQS) Composite
   - End-to-End Analytics Report
   - Partition Pruning Query Builder
   - Mutation Safety & Tenant Isolation
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const {
  calculateAssessmentCoverage,
  calculateTimelinessMetrics,
  detectGradeOutliers,
  calculateAssessmentDataQuality,
  buildAssessmentAnalyticsReport,
  buildAssessmentAnalyticsQuery
} = require('../../server/analytics/assessment');

function run() {
  console.log('▸ تست‌های پایه سنجش و تحلیل ارزشیابی (Assessment Analytics Foundation)');

  // ── ۱. تست پوشش ارزشیابی (Coverage) ─────────────────────────────
  {
    const enrollments = [
      { id: 1, school_id: 10, class_id: 101, student_id: 1001 },
      { id: 2, school_id: 10, class_id: 101, student_id: 1002 },
      { id: 3, school_id: 10, class_id: 101, student_id: 1003 },
      { id: 4, school_id: 10, class_id: 101, student_id: 1004 },
      { id: 5, school_id: 10, class_id: 101, student_id: 1005 }
    ];

    const grades = [
      { id: 1, school_id: 10, class_id: 101, subject_id: 50, student_id: 1001, score: 18, max_score: 20 },
      { id: 2, school_id: 10, class_id: 101, subject_id: 50, student_id: 1002, score: 16, max_score: 20 },
      { id: 3, school_id: 10, class_id: 101, subject_id: 50, student_id: 1003, score: 14, max_score: 20 },
      { id: 4, school_id: 10, class_id: 101, subject_id: 50, student_id: 1004, score: 12, max_score: 20 }
      // دانش‌آموز ۱۰۰۵ فاقد نمره است
    ];

    const res = calculateAssessmentCoverage({
      grades,
      enrollments,
      classId: 101,
      subjectId: 50,
      expectedSchoolId: 10
    });

    assert.strictEqual(res.total_eligible, 5, 'باید ۵ دانش‌آموز ثبت‌نامی باشند');
    assert.strictEqual(res.assessed_count, 4, 'باید ۴ دانش‌آموز ارزشیابی شده باشند');
    assert.strictEqual(res.missing_count, 1, 'باید ۱ دانش‌آموز غایب/بدون نمره باشد');
    assert.deepStrictEqual(res.missing_student_ids, [1005], 'شناسه غایب باید ۱۰۰۵ باشد');
    assert.strictEqual(res.coverage_rate, 0.8, 'نرخ پوشش باید ۰٫۸ باشد');
    assert.strictEqual(res.coverage_tier, 'PARTIAL', 'رده پوشش باید PARTIAL باشد');
    console.log('  ✅ محاسبه دقیق پوشش آزمون و استخراج غایبان سنجش');
  }

  // ── ۲. تست زمان‌بندی و تأخیر ثبت (Timeliness) ────────────────────
  {
    const examDate = '2026-05-10T08:00:00Z';
    const grades = [
      // ۲ روز بعد (به‌موقع)
      { id: 1, school_id: 10, date: '2026-05-10', created_at: '2026-05-12T10:00:00Z' },
      // ۳ روز بعد (به‌موقع)
      { id: 2, school_id: 10, date: '2026-05-10', created_at: '2026-05-13T10:00:00Z' },
      // ۵ روز بعد (تأخیری)
      { id: 3, school_id: 10, date: '2026-05-10', created_at: '2026-05-15T10:00:00Z' },
      // ۹ روز بعد (دیرهنگام)
      { id: 4, school_id: 10, date: '2026-05-10', created_at: '2026-05-19T10:00:00Z' }
    ];

    const res = calculateTimelinessMetrics({
      grades,
      examDate,
      expectedSchoolId: 10
    });

    assert.strictEqual(res.total_records, 4);
    assert.strictEqual(res.on_time_count, 2);
    assert.strictEqual(res.delayed_count, 1);
    assert.strictEqual(res.late_count, 1);
    assert.strictEqual(res.timeliness_rate, 0.5);
    assert.strictEqual(res.timeliness_status, 'NEEDS_IMPROVEMENT');
    console.log('  ✅ تحلیل به‌موقع بودن ثبت نمرات و طبقه‌بندی تأخیرها');
  }

  // ── ۳. تست تشخیص نمرات پرت (Outliers - Tukey's Fences) ───────────
  {
    // نمونه‌ای با داده‌های متمرکز و یک نمره پرت بسیار پایین و یک بسیار بالا
    const grades = [
      { id: 1, student_id: 1, score: 1 }, // نمره پرت شدید پایین
      { id: 2, student_id: 2, score: 14 },
      { id: 3, student_id: 3, score: 14.5 },
      { id: 4, student_id: 4, score: 15 },
      { id: 5, student_id: 5, score: 15.5 },
      { id: 6, student_id: 6, score: 16 },
      { id: 7, student_id: 7, score: 16.5 },
      { id: 8, student_id: 8, score: 17 }
    ];

    const res = detectGradeOutliers({
      grades,
      maxScore: 20
    });

    assert.strictEqual(res.outliers_detected, true, 'باید نمره پرت تشخیص داده شود');
    assert.strictEqual(res.outlier_count >= 1, true, 'حداقل ۱ نمره پرت');
    const lowOutlier = res.outliers.find(o => o.type === 'LOW_OUTLIER');
    assert.ok(lowOutlier, 'باید نمره پرت پایین پیدا شود');
    assert.strictEqual(lowOutlier.student_id, 1, 'دانش‌آموز ۱ باید پرت پایین باشد');
    console.log('  ✅ کشف نمرات پرت با روش آماری حصارهای توکی (Tukey\'s Fences)');
  }

  // ── ۴. تست ارزیابی کیفیت داده نمرات (Data Quality Score) ─────────
  {
    const enrollments = [
      { id: 1, school_id: 10, class_id: 101, student_id: 1 },
      { id: 2, school_id: 10, class_id: 101, student_id: 2 },
      { id: 3, school_id: 10, class_id: 101, student_id: 3 }
    ];
    const grades = [
      { id: 1, school_id: 10, student_id: 1, score: 18, date: '2026-05-10', created_at: '2026-05-11' },
      { id: 2, school_id: 10, student_id: 2, score: 15, date: '2026-05-10', created_at: '2026-05-11' },
      { id: 3, school_id: 10, student_id: 3, score: 17, date: '2026-05-10', created_at: '2026-05-11' }
    ];

    const dqs = calculateAssessmentDataQuality({
      grades,
      enrollments,
      expectedSchoolId: 10
    });

    assert.strictEqual(dqs.composite_dqs >= 85, true, 'امتیاز ترکیبی داده باکیفیت باید بالای ۸۵ باشد');
    assert.strictEqual(dqs.confidence_level, 'HIGH', 'سطح اطمینان باید HIGH باشد');
    assert.strictEqual(dqs.completeness, 100, 'پوشش ۱۰۰ درصد');
    assert.strictEqual(dqs.validity, 100, 'اعتبار ۱۰۰ درصد');
    console.log('  ✅ ارزیابی ۴گانه امتیاز کیفیت داده نمرات (DQS Composite)');
  }

  // ── ۵. تست گزارش تجمیعی جامع سنجش (Analytics Report) ────────────
  {
    const enrollments = [
      { id: 1, school_id: 10, class_id: 101, student_id: 1 },
      { id: 2, school_id: 10, class_id: 101, student_id: 2 },
      { id: 3, school_id: 10, class_id: 101, student_id: 3 },
      { id: 4, school_id: 10, class_id: 101, student_id: 4 }
    ];
    const grades = [
      { id: 1, school_id: 10, class_id: 101, subject_id: 5, student_id: 1, score: 19, max_score: 20 },
      { id: 2, school_id: 10, class_id: 101, subject_id: 5, student_id: 2, score: 15, max_score: 20 },
      { id: 3, school_id: 10, class_id: 101, subject_id: 5, student_id: 3, score: 12, max_score: 20 },
      { id: 4, school_id: 10, class_id: 101, subject_id: 5, student_id: 4, score: 8, max_score: 20 }
    ];

    const report = buildAssessmentAnalyticsReport({
      grades,
      enrollments,
      classId: 101,
      subjectId: 5,
      expectedSchoolId: 10
    });

    assert.strictEqual(report.report_type, 'ASSESSMENT_ANALYTICS_FOUNDATION');
    assert.strictEqual(report.statistical_summary.total_participants, 4);
    assert.strictEqual(report.statistical_summary.mean_score, 13.5);
    assert.ok(report.psychometrics.difficulty_index != null);
    assert.strictEqual(report.coverage.coverage_rate, 1.0);
    assert.strictEqual(report.data_quality.confidence_level, 'HIGH');
    console.log('  ✅ تولید گزارش جامع سنجش و اتصال زیرسیستم‌های آماری و روان‌سنجی');
  }

  // ── ۶. تست کوئری‌ساز پارتیشن‌ها و گارد ایزولاسیون (Query Builder) ─
  {
    const q = buildAssessmentAnalyticsQuery({
      schoolId: 10,
      classId: 101,
      subjectId: 5,
      startDate: '2026-09-01T00:00:00Z',
      endDate: '2026-12-30T23:59:59Z'
    });

    assert.strictEqual(q.target_table, 'grades');
    assert.strictEqual(q.partition_pruning_enabled, true);
    assert.ok(q.sql.includes('school_id = $1'));
    assert.ok(q.sql.includes('created_at >= $2'));
    assert.ok(q.sql.includes('created_at < $3'));
    assert.strictEqual(q.values[0], 10);

    // Fail-Closed Guard
    assert.throws(() => {
      buildAssessmentAnalyticsQuery({ classId: 101 });
    }, /TENANT_ISOLATION_VIOLATION/);
    console.log('  ✅ صحت ساخت کوئری هرس پارتیشن‌ها و گارد Fail-Closed مدرسه');
  }

  // ── ۷. تست عدم تغییر اشیا (Mutation Safety) و ایزولاسیون مستأجران ─
  {
    const frozenGrades = Object.freeze([
      Object.freeze({ id: 1, school_id: 10, student_id: 1, score: 17, max_score: 20 }),
      Object.freeze({ id: 2, school_id: 10, student_id: 2, score: 14, max_score: 20 })
    ]);

    // نباید با خطای تغییر شیء منجمد مواجه شود
    assert.doesNotThrow(() => {
      detectGradeOutliers({ grades: frozenGrades, expectedSchoolId: 10 });
    });

    // گارد نشت داده مدرسه دیگر
    const leakedGrades = [
      { id: 1, school_id: 10, student_id: 1, score: 17 },
      { id: 2, school_id: 99, student_id: 2, score: 14 } // مستأجر بیگانه
    ];
    assert.throws(() => {
      detectGradeOutliers({ grades: leakedGrades, expectedSchoolId: 10 });
    }, err => err.code === 'TENANT_ISOLATION_VIOLATION' || /Tenant isolation violation/i.test(err.message));
    console.log('  ✅ پایداری در برابر اشیای منجمد (Mutation Safety) و مسدودسازی نشت مستأجر');
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
