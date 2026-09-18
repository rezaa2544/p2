/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/student-timeline/index.test.js
   -------------------------------------------------------------------
   P0-EI-02: Comprehensive Test Suite for Student Timeline Engine
   - A) Deterministic Execution (10 consecutive runs byte-identical)
   - B) Mutation Safety (Object.freeze verification)
   - C) Tenant Isolation (Fail-Closed rejection of foreign school_id)
   - D) 10-Source Normalization
   - E) Educational Milestone Detection
   - F) Risk Periods Calculation using Semantic Layer
   - G) Temporal Range Query Engine
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const {
  EVENT_SEMANTIC_WEIGHTS,
  VALID_EVENT_TYPES,
  toStandardIsoTimestamp,
  buildStudentTimeline,
  detectEducationalMilestones,
  calculateRiskPeriods,
  queryTimelineRange
} = require('../../../server/analytics/student-timeline');

function run() {
  console.log('▸ تست‌های موتور خط زمانی طولی دانش‌آموز (Longitudinal Student Timeline Engine)');

  const mockStudent = { id: 1001, school_id: 10, full_name: 'امیررضا کمالی' };

  const sampleStudentData = {
    student: mockStudent,
    enrollments: [
      { id: 1, school_id: 10, student_id: 1001, class_id: 101, academic_year: '1403-1404', status: 'active', created_at: '2026-09-01T07:00:00Z' }
    ],
    classes: [
      { id: 101, school_id: 10, name: 'کلاس دهم تجربی ۱', grade: 10, academic_year: '1403-1404', created_at: '2026-09-01T07:30:00Z' }
    ],
    attendance: [
      { id: 1, school_id: 10, student_id: 1001, class_id: 101, status: 'present', date: '2026-09-15' },
      { id: 2, school_id: 10, student_id: 1001, class_id: 101, status: 'late', late_minutes: 15, date: '2026-09-16' },
      { id: 3, school_id: 10, student_id: 1001, class_id: 101, status: 'absent', date: '2026-10-01' },
      { id: 4, school_id: 10, student_id: 1001, class_id: 101, status: 'absent', date: '2026-10-02' },
      { id: 5, school_id: 10, student_id: 1001, class_id: 101, status: 'absent', date: '2026-10-03' }
    ],
    grades: [
      { id: 1, school_id: 10, student_id: 1001, class_id: 101, subject_id: 5, score: 18, max_score: 20, date: '2026-09-20' },
      { id: 2, school_id: 10, student_id: 1001, class_id: 101, subject_id: 5, score: 12, max_score: 20, date: '2026-10-05' },
      { id: 3, school_id: 10, student_id: 1001, class_id: 101, subject_id: 5, score: 8, max_score: 20, date: '2026-10-20' },
      { id: 4, school_id: 10, student_id: 1001, class_id: 101, subject_id: 5, score: 14, max_score: 20, date: '2026-11-10' }
    ],
    exams: [
      { id: 1, school_id: 10, class_id: 101, title: 'آزمون میان‌ترم ریاضی', max_score: 20, date: '2026-10-18' }
    ],
    exam_terms: [
      { id: 1, school_id: 10, title: 'نوبت اول', term: 'term1', start_date: '2026-10-10', end_date: '2026-10-30', academic_year: '1403-1404' }
    ],
    discipline: [
      { id: 1, school_id: 10, student_id: 1001, kind: 'positive', title: 'تشویق کلاسی', points: 2, date: '2026-09-25' }
    ],
    certificates: [
      { id: 1, school_id: 10, student_id: 1001, title: 'رتبه اول مسابقات علمی', type: 'scientific', year: '1403', issued_at: '2026-11-01' }
    ],
    reexams: [
      { id: 1, school_id: 10, student_id: 1001, subject_id: 5, original_score: 8, new_score: 14, status: 'passed', exam_date: '2026-11-05' }
    ],
    vclass_sessions: [
      { id: 1, school_id: 10, class_id: 101, title: 'حل تمرین مجازی ریاضی', shad_time: '2026-10-12T16:00:00Z', type: 'interactive' }
    ]
  };

  // ── تست ۱: نرمال‌سازی کامل ۱۰ منبع داده ───────────────────────────
  {
    const timeline = buildStudentTimeline(sampleStudentData, { expectedSchoolId: 10 });
    assert.strictEqual(timeline.student_id, 1001);
    assert.strictEqual(timeline.school_id, 10);
    assert.strictEqual(timeline.total_events, 17, 'کل ۱۷ رویداد باید نرمال‌سازی شوند');

    const eventTypesSeen = new Set(timeline.events.map(e => e.event_type));
    for (const type of VALID_EVENT_TYPES) {
      assert.ok(eventTypesSeen.has(type), `رویداد از نوع ${type} باید در خروجی باشد`);
    }

    // بررسی صحت فراداده رویدادها
    for (const ev of timeline.events) {
      assert.strictEqual(typeof ev.student_id, 'number');
      assert.strictEqual(typeof ev.school_id, 'number');
      assert.strictEqual(typeof ev.event_type, 'string');
      assert.strictEqual(typeof ev.timestamp, 'string');
      assert.strictEqual(typeof ev.source_table, 'string');
      assert.strictEqual(typeof ev.semantic_weight, 'number');
      assert.strictEqual(typeof ev.payload, 'object');
    }
    console.log('  ✅ نرمال‌سازی موفقیت‌آمیز هر ۱۰ منبع داده به فرمت استاندارد واحد');
  }

  // ── تست ۲: الف) قطعیت ۱۰۰٪ اجرا (Deterministic Execution) ───────────
  {
    const baseline = JSON.stringify(buildStudentTimeline(sampleStudentData, { expectedSchoolId: 10 }));
    for (let runIdx = 1; runIdx <= 10; runIdx++) {
      const current = JSON.stringify(buildStudentTimeline(sampleStudentData, { expectedSchoolId: 10 }));
      assert.strictEqual(current, baseline, `خروجی اجرای شماره ${runIdx} باید بیت‌به‌بیت با مبنا یکسان باشد`);
    }
    console.log('  ✅ قطعیت ۱۰۰٪: ده اجرای متوالی خروجی بیت‌به‌بیت یکسان تولید کردند');
  }

  // ── تست ۳: ب) ایمنی در برابر جهش داده‌ها (Mutation Safety) ────────
  {
    const deepFrozenData = Object.freeze({
      student: Object.freeze({ ...mockStudent }),
      enrollments: Object.freeze(sampleStudentData.enrollments.map(e => Object.freeze({ ...e }))),
      classes: Object.freeze(sampleStudentData.classes.map(c => Object.freeze({ ...c }))),
      attendance: Object.freeze(sampleStudentData.attendance.map(a => Object.freeze({ ...a }))),
      grades: Object.freeze(sampleStudentData.grades.map(g => Object.freeze({ ...g }))),
      exams: Object.freeze(sampleStudentData.exams.map(ex => Object.freeze({ ...ex }))),
      exam_terms: Object.freeze(sampleStudentData.exam_terms.map(et => Object.freeze({ ...et }))),
      discipline: Object.freeze(sampleStudentData.discipline.map(d => Object.freeze({ ...d }))),
      certificates: Object.freeze(sampleStudentData.certificates.map(cert => Object.freeze({ ...cert }))),
      reexams: Object.freeze(sampleStudentData.reexams.map(re => Object.freeze({ ...re }))),
      vclass_sessions: Object.freeze(sampleStudentData.vclass_sessions.map(vc => Object.freeze({ ...vc })))
    });

    assert.doesNotThrow(() => {
      const tl = buildStudentTimeline(deepFrozenData, { expectedSchoolId: 10 });
      detectEducationalMilestones(tl);
      calculateRiskPeriods(tl);
    }, 'توابع نباید اشیای منجمد را تغییر دهند');
    console.log('  ✅ ایمنی در برابر جهش (Mutation Safety): پایداری کامل با اشیای Object.freeze');
  }

  // ── تست ۴: ج) ایزولاسیون مستأجران (Tenant Isolation Fail-Closed) ───
  {
    const leakedData = {
      ...sampleStudentData,
      grades: [
        { id: 999, school_id: 99, student_id: 1001, score: 20 } // رکورد نشت‌یافته از مدرسه ۹۹
      ]
    };

    assert.throws(() => {
      buildStudentTimeline(leakedData, { expectedSchoolId: 10 });
    }, err => err.code === 'TENANT_ISOLATION_VIOLATION' || /Tenant isolation violation/i.test(err.message));
    console.log('  ✅ ایزولاسیون مستأجران: مسدودسازی و سقط قاطع (Fail-Closed) در صورت نشت داده');
  }

  // ── تست ۵: تشخیص هوشمند نقاط عطف آموزشی (Milestones) ───────────────
  {
    const timeline = buildStudentTimeline(sampleStudentData, { expectedSchoolId: 10 });
    const milestones = detectEducationalMilestones(timeline);

    assert.ok(milestones.length >= 3, 'باید حداقل ۳ نقطه عطف شناسایی شود');

    const decline = milestones.find(m => m.milestone === 'LEARNING_DECLINE_DETECTED');
    assert.ok(decline, 'باید نقطه عطف افت تحصیلی شناسایی شود');

    const chronic = milestones.find(m => m.milestone === 'CHRONIC_ABSENCE_STARTED');
    assert.ok(chronic, 'باید نقطه عطف آغاز غیبت مزمن (۳ جلسه متوالی) شناسایی شود');

    const recovery = milestones.find(m => m.milestone === 'RECOVERY_PERIOD' || m.milestone === 'LEARNING_IMPROVEMENT_DETECTED');
    assert.ok(recovery, 'باید نقطه عطف جهش یا بازیابی شناسایی شود');
    console.log('  ✅ تشخیص دقیق نقاط عطف آموزشی (افت، غیبت مزمن، جهش یادگیری و بازیابی)');
  }

  // ── تست ۶: انتقال مدرسه (School Transfer Milestone) ────────────────
  {
    const transferData = {
      student: mockStudent,
      enrollments: [
        { id: 1, school_id: 10, student_id: 1001, class_id: 101, created_at: '2026-09-01T00:00:00Z' },
        { id: 2, school_id: 20, student_id: 1001, class_id: 201, created_at: '2026-10-15T00:00:00Z' }
      ]
    };

    // با allowCrossSchool: true جهت بازسازی مسیر تحصیلی بین مدارس
    const timeline = buildStudentTimeline(transferData, { studentId: 1001, allowCrossSchool: true });
    const milestones = detectEducationalMilestones(timeline);

    const transfer = milestones.find(m => m.milestone === 'SCHOOL_TRANSFER');
    assert.ok(transfer, 'باید انتقال مدرسه شناسایی شود');
    assert.ok(transfer.evidence[0].includes('کد 10 به 20'));
    console.log('  ✅ تشخیص نقطه عطف انتقال مدرسه (SCHOOL_TRANSFER)');
  }

  // ── تست ۷: ارزیابی دوره‌های ریسک با لایه معنایی (Risk Periods) ─────
  {
    const timeline = buildStudentTimeline(sampleStudentData, { expectedSchoolId: 10 });
    const riskAnalysis = calculateRiskPeriods(timeline);

    assert.strictEqual(riskAnalysis.student_id, 1001);
    assert.ok(riskAnalysis.total_risks_identified >= 1, 'حداقل ۱ دوره ریسک باید شناسایی شود');
    const academicRisk = riskAnalysis.risk_periods.find(r => r.risk === 'ACADEMIC_DECLINE' || r.risk === 'COMPLETION_RISK');
    assert.ok(academicRisk, 'باید دوره ریسک تحصیلی استخراج شود');
    assert.ok(academicRisk.confidence > 0.7);
    console.log('  ✅ استخراج دوره‌های ریسک دانش‌آموز با اتصال به لایه معنایی (Risk Periods)');
  }

  // ── تست ۸: موتور کوئری زمانی (Temporal Query Range) ───────────────
  {
    const timeline = buildStudentTimeline(sampleStudentData, { expectedSchoolId: 10 });

    // فیلتر فقط نمرات در مهرماه
    const res = queryTimelineRange(timeline, '2026-10-01', '2026-10-31', ['GRADE', 'EXAM']);
    assert.ok(res.count > 0);
    for (const ev of res.events) {
      assert.ok(ev.timestamp >= '2026-10-01T00:00:00.000Z');
      assert.ok(ev.timestamp <= '2026-10-31T23:59:59.999Z');
      assert.ok(ev.event_type === 'GRADE' || ev.event_type === 'EXAM');
    }
    console.log('  ✅ صحت عملکرد موتور کوئری بازه زمانی و فیلتر انواع رویدادها');
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
