/**
 * ═══════════════════════════════════════════════════════════════════
 * server/analytics/timeline.js — Longitudinal Student Timeline Engine (P0-EI-02)
 * ───────────────────────────────────────────────────────────────────
 * موتور تحلیل طولی دانش‌آموز: اتصال امن، قطعی و چندسالهٔ سوابق تحصیلی
 * 
 * اصول کلیدی:
 *  ۱) اتصال چندساله: تجمیع سوابق سال‌های تحصیلی گذشته (از student_archive
 *     و رکوردهای تاریخی) با داده‌های زندهٔ سال جاری.
 *  ۲) ادغام با لایه معنایی (P0-EI-01): محاسبه شاخص‌های سالانه بر پایهٔ
 *     توابع استاندارد server/analytics/semantic.js بدون انحراف معنایی.
 *  ۳) کشف جهش‌ها و افت‌ها: ردیابی شتاب رشد (Velocity) و ثبت رویدادهای کلیدی
 *     (Milestones) آموزشی، انضباطی و ارتقای پایه.
 *  ۴) ایزولاسیون و امنیت: هیچ داده‌ای خارج از مستأجر مربوطه پردازش نمی‌شود؛
 *     گارد کامل ضد نشت اطلاعات.
 *  ۵) توابع محض و بدون عارضه جانبی (Pure Transformation Logic): عدم دستکاری
 *     اشیای ورودی (Mutation Safe).
 * ═══════════════════════════════════════════════════════════════════
 */

'use strict';

const semantic = require('./semantic');

/**
 * ساخت خط زمانی چندساله دانش‌آموز (Longitudinal Student Timeline)
 * 
 * @param {Object} params
 * @param {Object} params.student اطلاعات هویتی دانش‌آموز
 * @param {Array} params.grades رکوردهای نمرات زنده
 * @param {Array} params.attendance رکوردهای حضور زنده
 * @param {Array} params.archive سوابق آرشیوشده سال‌های قبل (student_archive)
 * @param {Array} params.classes کلاس‌های منتسب به دانش‌آموز
 * @param {Array} params.enrollments ثبت‌نام‌های تاریخی
 * @param {Object} options تنظیمات و گارد مستأجر
 */
function buildStudentLongitudinalTimeline(params = {}, options = {}) {
  const {
    student = null,
    grades = [],
    attendance = [],
    archive = [],
    classes = [],
    enrollments = []
  } = params;

  const {
    expectedSchoolId = null,
    passThreshold = 10.0
  } = options;

  if (!student || !student.id) {
    const err = new Error('Valid student object is required to build longitudinal timeline');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  // اعتبارسنجی ایزولاسیون مستأجر
  semantic.enforceTenantIsolation([student], expectedSchoolId);
  semantic.enforceTenantIsolation(grades, expectedSchoolId);
  semantic.enforceTenantIsolation(attendance, expectedSchoolId);
  semantic.enforceTenantIsolation(archive, expectedSchoolId);

  const studentId = Number(student.id);

  // ۱. فیلتر رکوردهای مختص این دانش‌آموز
  const studentGrades = grades.filter(g => g && Number(g.student_id) === studentId);
  const studentAttendance = attendance.filter(a => a && Number(a.student_id) === studentId);
  const studentArchive = archive.filter(ar => ar && Number(ar.student_id) === studentId);

  // ۲. نقشه‌برداری سال‌های تحصیلی
  // تجمیع داده‌ها بر اساس سال تحصیلی (مثلاً '1401-1402', '1402-1403', '1403-1404')
  const yearsMap = {};

  // الف) اضافه کردن سوابق آرشیو (سال‌های گذشته)
  for (let i = 0; i < studentArchive.length; i++) {
    const ar = studentArchive[i];
    const yearId = ar.academic_year || ar.year || ar.school_year || `archive_${ar.id || i}`;
    
    let rawAvg = null;
    if (ar.avg_score !== undefined && ar.avg_score !== null) {
      rawAvg = parseFloat(String(ar.avg_score).replace(/٫/g, '.'));
    }

    let rawAtt = null;
    if (ar.attendance_rate !== undefined && ar.attendance_rate !== null) {
      rawAtt = parseFloat(String(ar.attendance_rate).replace(/٫/g, '.').replace('%', ''));
    }

    yearsMap[yearId] = {
      academic_year: yearId,
      source: 'archive',
      grade_level: ar.grade || null,
      class_name: ar.class_name || null,
      field: ar.field || null,
      gpa: !isNaN(rawAvg) ? semantic.roundTo(rawAvg, 2) : null,
      attendance_rate: !isNaN(rawAtt) ? semantic.roundTo(rawAtt, 2) : null,
      discipline_points: ar.discipline_points || 20,
      passed: rawAvg !== null ? rawAvg >= passThreshold : true,
      subjects: [],
      is_chronic_absence: rawAtt !== null ? rawAtt < 90.0 : false,
      mastery_level: rawAvg !== null
        ? (rawAvg >= 18 ? 'ADVANCED' : rawAvg >= 15 ? 'PROFICIENT' : rawAvg >= 10 ? 'BASIC' : 'BELOW_BASIC')
        : 'BASIC'
    };
  }

  // ب) دسته‌بندی نمرات و حضور زنده بر اساس سال تحصیلی
  const liveYears = {};
  for (let i = 0; i < studentGrades.length; i++) {
    const g = studentGrades[i];
    const y = g.academic_year || g.year || 'current_year';
    if (!liveYears[y]) liveYears[y] = { grades: [], attendance: [] };
    liveYears[y].grades.push(g);
  }

  for (let i = 0; i < studentAttendance.length; i++) {
    const a = studentAttendance[i];
    const y = a.academic_year || a.year || 'current_year';
    if (!liveYears[y]) liveYears[y] = { grades: [], attendance: [] };
    liveYears[y].attendance.push(a);
  }

  // اگر هیچ سالی در نمرات نبود ولی حضور یا ثبت‌نام بود
  if (Object.keys(liveYears).length === 0 && (studentAttendance.length > 0 || studentGrades.length > 0)) {
    liveYears['current_year'] = { grades: studentGrades, attendance: studentAttendance };
  }

  // تحلیل سال‌های زنده با استفاده از موتور لایه معنایی (semantic.js)
  for (const yearKey of Object.keys(liveYears)) {
    const yData = liveYears[yearKey];
    const gradeRes = semantic.calculateGradeDistribution(yData.grades);
    const attRes = semantic.calculateAttendanceRate(yData.attendance);
    const chronicRes = semantic.calculateChronicAbsence(yData.attendance);
    const learnerProg = semantic.evaluateLearnerProgress({ studentId, grades: yData.grades });

    // استخراج نمرات پایانی هر درس برای ارزیابی ارتقا
    const subjectGrades = Object.keys(learnerProg.subjects_breakdown).map(subId => ({
      subject_id: subId,
      score: learnerProg.subjects_breakdown[subId].mean
    }));

    const completionRes = semantic.evaluateCompletionSemantics({ studentId, subjectGrades }, { passThreshold });

    yearsMap[yearKey] = {
      academic_year: yearKey,
      source: 'live',
      grade_level: student.grade || null,
      class_name: student.class_name || null,
      field: student.field || null,
      gpa: gradeRes.mean,
      attendance_rate: attRes.value,
      is_chronic_absence: chronicRes.chronic_students_count > 0,
      passed: completionRes.promotion_eligible,
      mastery_level: learnerProg.mastery_level,
      completion_status: completionRes.completion_status,
      subjects: learnerProg.subjects_breakdown,
      progress_velocity: learnerProg.progress_velocity,
      stability_score: learnerProg.stability_score
    };
  }

  // ۳. مرتب‌سازی زمانی سال‌ها
  const yearKeys = Object.keys(yearsMap).sort((a, b) => String(a).localeCompare(String(b)));
  const orderedYears = yearKeys.map(k => yearsMap[k]);

  // ۴. تحلیل روند چندساله (Multi-Year Trajectory & Velocity)
  const gpaTimeline = orderedYears.map(y => y.gpa).filter(g => typeof g === 'number');
  let overallGpa = null;
  if (gpaTimeline.length > 0) {
    overallGpa = semantic.roundTo(gpaTimeline.reduce((a, b) => a + b, 0) / gpaTimeline.length, 2);
  }

  let multiYearTrend = 'STABLE';
  if (gpaTimeline.length >= 2) {
    const delta = gpaTimeline[gpaTimeline.length - 1] - gpaTimeline[0];
    if (delta >= 1.5) multiYearTrend = 'IMPROVING';
    else if (delta <= -1.5) multiYearTrend = 'DECLINING';
  }

  // ۵. تولید رویدادهای شاخص (Milestones: جهش‌ها، افت‌ها، ارتقای پایه)
  const milestones = [];

  for (let i = 0; i < orderedYears.length; i++) {
    const curYear = orderedYears[i];

    // رویداد ارتقا / قبولی
    if (curYear.passed) {
      milestones.push({
        type: 'PROMOTION',
        academic_year: curYear.academic_year,
        title: `ارتقای تحصیلی سال ${curYear.academic_year}`,
        description: `قبولی با معدل ${curYear.gpa !== null ? curYear.gpa : '—'}`,
        status: 'POSITIVE'
      });
    } else {
      milestones.push({
        type: 'ACADEMIC_WARNING',
        academic_year: curYear.academic_year,
        title: `هشدار تحصیلی سال ${curYear.academic_year}`,
        description: `عدم کسب حد نصاب قبولی (معدل: ${curYear.gpa !== null ? curYear.gpa : '—'})`,
        status: 'CRITICAL'
      });
    }

    // بررسی جهش یا افت نسبت به سال قبل
    if (i > 0) {
      const prevYear = orderedYears[i - 1];
      if (curYear.gpa !== null && prevYear.gpa !== null) {
        const delta = semantic.roundTo(curYear.gpa - prevYear.gpa, 2);
        if (delta >= 2.0) {
          milestones.push({
            type: 'GROWTH_SPURT',
            academic_year: curYear.academic_year,
            title: `جهش تحصیلی در سال ${curYear.academic_year}`,
            description: `رشد معدل به میزان +${delta} نمره نسبت به سال گذشته`,
            status: 'POSITIVE'
          });
        } else if (delta <= -2.0) {
          milestones.push({
            type: 'GROWTH_DIP',
            academic_year: curYear.academic_year,
            title: `افت تحصیلی در سال ${curYear.academic_year}`,
            description: `افت معدل به میزان ${delta} نمره نسبت به سال گذشته`,
            status: 'CRITICAL'
          });
        }
      }
    }

    // غیبت مزمن
    if (curYear.is_chronic_absence) {
      milestones.push({
        type: 'CHRONIC_ABSENCE_ALERT',
        academic_year: curYear.academic_year,
        title: `هشدار غیبت مزمن سال ${curYear.academic_year}`,
        description: `غیبت بیش از ۱۰٪ جلسات آموزشی (نرخ حضور: ${curYear.attendance_rate}٪)`,
        status: 'WARNING'
      });
    }
  }

  // آخرین سطح تسلط دانش‌آموز
  const latestYear = orderedYears.length > 0 ? orderedYears[orderedYears.length - 1] : null;
  const currentMastery = latestYear ? latestYear.mastery_level : 'NO_DATA';

  return {
    student_id: studentId,
    student_name: student.full_name || student.name || `دانش‌آموز ${studentId}`,
    school_id: student.school_id || expectedSchoolId || null,
    summary: {
      total_years_recorded: orderedYears.length,
      overall_gpa: overallGpa,
      multi_year_trend: multiYearTrend,
      current_mastery_level: currentMastery,
      retention_risk: multiYearTrend === 'DECLINING' || (latestYear && !latestYear.passed),
      active_status: student.is_active !== false
    },
    academic_years: orderedYears,
    milestones,
    data_quality: {
      status: orderedYears.length > 0 ? 'COMPLETE' : 'NO_DATA',
      completeness: orderedYears.length >= 2 ? 1.0 : 0.5,
      archive_records_used: studentArchive.length,
      live_grades_used: studentGrades.length,
      live_attendance_used: studentAttendance.length
    }
  };
}

module.exports = {
  buildStudentLongitudinalTimeline
};
