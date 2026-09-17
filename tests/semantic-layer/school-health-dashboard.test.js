/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/school-health-dashboard.test.js
   -------------------------------------------------------------------
   P0-EI-05: School Educational Health Dashboard & Action Center Tests
   - Multi-dimensional Educational Health Scoring
   - Strict No-Masking Guarantee
   - Daily Action Center Task Generation & Prioritization
   - Mutation Safety & Multi-Tenant Isolation Guards
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const {
  buildSchoolEducationalHealthDashboard
} = require('../../server/analytics/school-health-dashboard');

function run() {
  console.log('▸ تست‌های داشبورد سلامت آموزشی مدرسه و مرکز اقدام (School Educational Health Dashboard)');

  // ── ۱. تست مدرسه با سلامت آموزشی مطلوب (Healthy School) ──────────
  {
    const enrollments = [
      { id: 1, school_id: 10, class_id: 1, student_id: 101 },
      { id: 2, school_id: 10, class_id: 1, student_id: 102 },
      { id: 3, school_id: 10, class_id: 1, student_id: 103 },
      { id: 4, school_id: 10, class_id: 1, student_id: 104 }
    ];

    const attendance = [];
    for (let day = 1; day <= 10; day++) {
      for (const enr of enrollments) {
        attendance.push({
          id: attendance.length + 1,
          school_id: 10,
          student_id: enr.student_id,
          class_id: enr.class_id,
          status: 'present',
          date: `2026-10-0${day}`
        });
      }
    }

    const grades = [
      { id: 1, school_id: 10, class_id: 1, student_id: 101, score: 18, max_score: 20 },
      { id: 2, school_id: 10, class_id: 1, student_id: 102, score: 17, max_score: 20 },
      { id: 3, school_id: 10, class_id: 1, student_id: 103, score: 16, max_score: 20 },
      { id: 4, school_id: 10, class_id: 1, student_id: 104, score: 19, max_score: 20 }
    ];

    const res = buildSchoolEducationalHealthDashboard({
      school: { id: 10, name: 'دبیرستان نمونه البرز' },
      grades,
      attendance,
      enrollments,
      expectedSchoolId: 10
    });

    assert.strictEqual(res.report_type, 'SCHOOL_EDUCATIONAL_HEALTH_DASHBOARD');
    assert.strictEqual(res.composite_health.tier, 'EXCELLENT');
    assert.strictEqual(res.composite_health.no_masking_applied, false);
    assert.strictEqual(res.dimensions.attendance.net_rate, 100);
    assert.strictEqual(res.dimensions.attendance.chronic_absence_rate, 0);
    assert.strictEqual(res.profile_summary.stable_strengths.length >= 2, true);
    console.log('  ✅ ارزیابی سلامت آموزشی مدرسه با عملکرد مطلوب و رتبه عالی');
  }

  // ── ۲. تست اصل عدم پنهان‌سازی (No-Masking Principle) ─────────────
  {
    // مدرسه با معدل بالا اما غیبت مزمن بحرانی در دانش‌آموزان
    const enrollments = [
      { id: 1, school_id: 10, class_id: 1, student_id: 101 },
      { id: 2, school_id: 10, class_id: 1, student_id: 102 }
    ];

    // دانش‌آموز ۱۰۲ به شدت غایب است (> 20% غیبت مزمن)
    const attendance = [
      { id: 1, school_id: 10, student_id: 101, status: 'present', date: '2026-10-01' },
      { id: 2, school_id: 10, student_id: 101, status: 'present', date: '2026-10-02' },
      { id: 3, school_id: 10, student_id: 101, status: 'present', date: '2026-10-03' },
      { id: 4, school_id: 10, student_id: 101, status: 'present', date: '2026-10-04' },
      { id: 5, school_id: 10, student_id: 101, status: 'present', date: '2026-10-05' },

      { id: 6, school_id: 10, student_id: 102, status: 'absent', date: '2026-10-01' },
      { id: 7, school_id: 10, student_id: 102, status: 'absent', date: '2026-10-02' },
      { id: 8, school_id: 10, student_id: 102, status: 'absent', date: '2026-10-03' },
      { id: 9, school_id: 10, student_id: 102, status: 'absent', date: '2026-10-04' },
      { id: 10, school_id: 10, student_id: 102, status: 'present', date: '2026-10-05' }
    ];

    // نمرات بالا
    const grades = [
      { id: 1, school_id: 10, student_id: 101, score: 20 },
      { id: 2, school_id: 10, student_id: 102, score: 19 }
    ];

    const res = buildSchoolEducationalHealthDashboard({
      grades,
      attendance,
      enrollments,
      expectedSchoolId: 10
    });

    // باید پرچم بحرانی بروز کند و No-Masking فعال شود
    assert.strictEqual(res.composite_health.no_masking_applied, true);
    assert.ok(res.composite_health.critical_flags.includes('HIGH_CHRONIC_ABSENCE'));
    assert.ok(res.daily_command_center.action_items.some(a => a.domain === 'ATTENDANCE'));
    console.log('  ✅ تضمین اصل عدم پنهان‌سازی (No-Masking): آشکارسازی مسائل حاد علی‌رغم معدل بالا');
  }

  // ── ۳. تست مرکز اقدام روزانه (Daily Action Center) ───────────────
  {
    const enrollments = [
      { id: 1, school_id: 10, class_id: 1, student_id: 101 },
      { id: 2, school_id: 10, class_id: 1, student_id: 102 }
    ];

    // توالی غیبت ۳ جلسه برای ۱۰۱
    const attendance = [
      { id: 1, school_id: 10, student_id: 101, status: 'absent', date: '2026-10-01' },
      { id: 2, school_id: 10, student_id: 101, status: 'absent', date: '2026-10-02' },
      { id: 3, school_id: 10, student_id: 101, status: 'absent', date: '2026-10-03' }
    ];

    // نمره ضعیف مردودی برای ۱۰۲
    const grades = [
      { id: 1, school_id: 10, student_id: 102, score: 5, max_score: 20 }
    ];

    const res = buildSchoolEducationalHealthDashboard({
      grades,
      attendance,
      enrollments,
      expectedSchoolId: 10
    });

    const actions = res.daily_command_center.action_items;
    assert.ok(actions.length >= 2, 'حداقل ۲ اقدام روزانه باید تولید شود');
    const streakAction = actions.find(a => a.domain === 'EARLY_WARNING');
    assert.ok(streakAction, 'اقدام هشدار ترک تحصیل باید وجود داشته باشد');
    assert.strictEqual(streakAction.entity_id, 101);
    console.log('  ✅ تولید اقلام اقدام‌محور روزانه (Action Items) با اولویت‌بندی شفاف');
  }

  // ── ۴. تست عدم تغییر اشیا (Mutation Safety) و ایزولاسیون مستأجران ─
  {
    const frozenGrades = Object.freeze([
      Object.freeze({ id: 1, school_id: 10, student_id: 1, score: 18 })
    ]);
    const frozenAtt = Object.freeze([
      Object.freeze({ id: 1, school_id: 10, student_id: 1, status: 'present', date: '2026-10-01' })
    ]);

    assert.doesNotThrow(() => {
      buildSchoolEducationalHealthDashboard({
        grades: frozenGrades,
        attendance: frozenAtt,
        expectedSchoolId: 10
      });
    });

    const leakedGrades = [
      { id: 1, school_id: 10, student_id: 1, score: 18 },
      { id: 2, school_id: 99, student_id: 2, score: 14 }
    ];
    assert.throws(() => {
      buildSchoolEducationalHealthDashboard({
        grades: leakedGrades,
        expectedSchoolId: 10
      });
    }, err => err.code === 'TENANT_ISOLATION_VIOLATION' || /Tenant isolation violation/i.test(err.message));
    console.log('  ✅ پایداری اشیای منجمد و مسدودسازی نشت داده بین مستأجران در داشبورد سلامت');
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
