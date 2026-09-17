/* ═══════════════════════════════════════════════════════════════════
   server/analytics/school-health-dashboard.js — School Educational Health Dashboard (P0-EI-05)
   -------------------------------------------------------------------
   Educational Intelligence Foundation:
   - Multi-dimensional School Health Profile (Learning, Attendance, Assessment, Data Quality)
   - Strict No-Masking Principle (Acute issues never obscured by high composite averages)
   - Daily Action Center (Prioritized, explainable action items for school leadership)
   - Tenant Isolation & Partition Pruning Compatibility
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const {
  calculateAttendanceRate,
  calculateChronicAbsence,
  calculateGradeDistribution,
  calculateSchoolEducationalHealth,
  roundTo,
  enforceTenantIsolation
} = require('./semantic');

const {
  calculateAssessmentCoverage,
  calculateTimelinessMetrics,
  calculateAssessmentDataQuality
} = require('./assessment');

const {
  calculatePunctualityMetrics,
  detectAbsenceStreaks,
  calculateAttendanceDataQuality
} = require('./attendance');

/**
 * تولید داشبورد جامع سلامت آموزشی مدرسه و مرکز اقدام روزانه
 */
function buildSchoolEducationalHealthDashboard(options = {}) {
  const {
    school = null,
    grades = [],
    attendance = [],
    enrollments = [],
    classes = [],
    expectedSchoolId = null
  } = options;

  if (expectedSchoolId != null) {
    enforceTenantIsolation(grades, expectedSchoolId, 'buildSchoolHealth:grades');
    enforceTenantIsolation(attendance, expectedSchoolId, 'buildSchoolHealth:attendance');
    enforceTenantIsolation(enrollments, expectedSchoolId, 'buildSchoolHealth:enrollments');
  }

  // ۱. شاخص‌های حضور و غیاب
  const attRateRes = calculateAttendanceRate(attendance, {
    formula: 'net',
    lateWeight: 0.5,
    expectedSchoolId
  });
  const chronicRes = calculateChronicAbsence(attendance, {
    threshold: 0.10,
    minRequiredSessions: 5,
    expectedSchoolId
  });
  const chronicRate = chronicRes.value != null ? chronicRes.value : 0;
  const punctualityRes = calculatePunctualityMetrics({
    attendance,
    expectedSchoolId
  });
  const streaksRes = detectAbsenceStreaks({
    attendance,
    streakThreshold: 3,
    expectedSchoolId
  });

  // ۲. شاخص‌های پیشرفت آموزشی و نمرات
  const gradeDistRes = calculateGradeDistribution(grades, {
    maxScore: 20,
    expectedSchoolId
  });
  const assessCoverageRes = calculateAssessmentCoverage({
    grades,
    enrollments,
    expectedSchoolId
  });
  const timelinessRes = calculateTimelinessMetrics({
    grades,
    expectedSchoolId
  });

  // ۳. شاخص‌های کیفیت داده
  const attDataQualityRes = calculateAttendanceDataQuality({
    attendance,
    enrollments,
    expectedSchoolId
  });
  const gradeDataQualityRes = calculateAssessmentDataQuality({
    grades,
    enrollments,
    expectedSchoolId
  });
  const compositeDqs = roundTo((attDataQualityRes.composite_dqs + gradeDataQualityRes.composite_dqs) / 2, 1);

  // ۴. ارزیابی سلامت آموزشی با اصل عدم پنهان‌سازی (No-Masking Principle)
  const healthComponents = {
    attendance_rate: attRateRes.value != null ? attRateRes.value : 100,
    chronic_absence_rate: chronicRate,
    mean_grade: gradeDistRes.mean != null ? gradeDistRes.mean : 15,
    failure_rate: gradeDistRes.failure_rate != null ? gradeDistRes.failure_rate : 0,
    progress_trend_slope: 0.05,
    data_quality_score: compositeDqs
  };

  const healthRes = calculateSchoolEducationalHealth(healthComponents);

  // ۵. ایجاد فهرست اولویت‌دار مرکز اقدام روزانه (Daily Action Center)
  const actionItems = [];
  let actionId = 1;

  // الف) اقدامات فوری غیبت و انضباطی
  if (chronicRes.chronic_students_count > 0) {
    const chronicStudentIds = [];
    if (chronicRes.students_detail) {
      for (const [sid, dt] of Object.entries(chronicRes.students_detail)) {
        if (dt && dt.is_chronic) chronicStudentIds.push(Number(sid));
      }
    }

    actionItems.push({
      id: actionId++,
      domain: 'ATTENDANCE',
      severity: chronicRate > 20 ? 'CRITICAL' : 'WARNING',
      title: 'پیگیری دانش‌آموزان در معرض خطر غیبت مزمن',
      description: `${chronicRes.chronic_students_count} دانش‌آموز دارای غیبت بالاتر از ۱۰٪ می‌باشند.`,
      target_entity: 'student_group',
      entity_ids: chronicStudentIds,
      recommended_action: 'تماس مشاور مدرسه با اولیا و ثبت پرونده مداخله آموزشی'
    });
  }

  // ب) توالی غیبت‌های متوالی (هشدارهای ترک تحصیل)
  if (streaksRes.alerts_count > 0) {
    for (const alert of streaksRes.alerts) {
      actionItems.push({
        id: actionId++,
        domain: 'EARLY_WARNING',
        severity: alert.severity,
        title: `غیبت متوالی دانش‌آموز کد ${alert.student_id}`,
        description: `دانش‌آموز دارای ${alert.consecutive_absences} جلسه غیبت متوالی غیرموجه است.`,
        target_entity: 'student',
        entity_id: alert.student_id,
        recommended_action: 'استعلام فوری علت غیبت توسط ناظم مدرسه در همان روز'
      });
    }
  }

  // ج) اقدامات آموزشی نمرات و ارزشیابی
  if (gradeDistRes.failure_rate > 20) {
    actionItems.push({
      id: actionId++,
      domain: 'ACADEMIC',
      severity: gradeDistRes.failure_rate > 35 ? 'CRITICAL' : 'WARNING',
      title: 'نرخ بالای عدم قبولی در آزمون‌ها',
      description: `${gradeDistRes.failure_rate}٪ از نمرات ثبت‌شده زیر حد نصاب قبولی (نمره ۱۰) هستند.`,
      target_entity: 'school',
      recommended_action: 'برگزاری کلاس جبرانی و ارزیابی سطح دشواری سوالات با دبیران مربوطه'
    });
  }

  // د) اقدامات پوشش سنجش و ثبت ناقص
  if (assessCoverageRes.coverage_tier === 'LOW' || assessCoverageRes.coverage_tier === 'PARTIAL') {
    actionItems.push({
      id: actionId++,
      domain: 'ASSESSMENT_COVERAGE',
      severity: assessCoverageRes.coverage_rate < 0.6 ? 'CRITICAL' : 'WARNING',
      title: 'نقص در پوشش ارزشیابی دانش‌آموزان',
      description: `تنها ${assessCoverageRes.coverage_percentage}٪ از دانش‌آموزان واجد شرایط دارای نمره ثبت‌شده هستند (${assessCoverageRes.missing_count} دانش‌آموز فاقد نمره).`,
      target_entity: 'school',
      entity_ids: assessCoverageRes.missing_student_ids.slice(0, 20),
      recommended_action: 'یادآوری به معلمان جهت تکمیل و ثبت نمرات مستمر'
    });
  }

  // ه) دیرکرد در ثبت داده‌ها (Timeliness)
  if (timelinessRes.timeliness_status === 'NEEDS_IMPROVEMENT') {
    actionItems.push({
      id: actionId++,
      domain: 'DATA_OPERATIONS',
      severity: 'INFO',
      title: 'تأخیر در ثبت اطلاعات ارزیابی',
      description: `میانگین تأخیر در ورود نمرات به سیستم ${timelinessRes.avg_turnaround_days} روز پس از آزمون است.`,
      target_entity: 'teachers',
      recommended_action: 'تشویق کادر آموزشی به ثبت داده‌ها در پنجره زمانی حداکثر ۳ روز'
    });
  }

  // تفکیک قوت‌های پایدار و نقاط نیازمند مداخله
  const stableStrengths = [];
  const emergingIssues = [];
  const criticalIssues = [];

  if (attRateRes.value >= 90) stableStrengths.push('نرخ حضور بسیار مطلوب و بالای ۹۰٪');
  if (gradeDistRes.mean >= 15) stableStrengths.push('معدل کل نمرات در سطح پیشرفته');
  if (punctualityRes.punctuality_rate >= 0.95) stableStrengths.push('وقت‌شناسی عالی دانش‌آموزان');
  if (compositeDqs >= 85) stableStrengths.push('کیفیت، دقت و یکپارچگی بالای داده‌های ثبتی');

  for (const flag of healthRes.critical_flags) {
    criticalIssues.push(flag);
  }
  for (const item of actionItems) {
    if (item.severity === 'CRITICAL' && !criticalIssues.includes(item.title)) {
      criticalIssues.push(item.title);
    } else if (item.severity === 'WARNING') {
      emergingIssues.push(item.title);
    }
  }

  return {
    report_type: 'SCHOOL_EDUCATIONAL_HEALTH_DASHBOARD',
    version: '1.0.0',
    school: {
      id: expectedSchoolId ? Number(expectedSchoolId) : (school && school.id ? Number(school.id) : null),
      name: school && school.name ? school.name : null
    },
    composite_health: {
      score: healthRes.composite_index,
      tier: healthRes.rating,
      no_masking_applied: healthRes.critical_flags.length > 0,
      critical_flags: healthRes.critical_flags
    },
    dimensions: {
      attendance: {
        score: healthRes.dimensions && healthRes.dimensions.attendance ? healthRes.dimensions.attendance.score : 0,
        net_rate: attRateRes.value != null ? attRateRes.value : 100,
        chronic_absence_rate: chronicRate,
        punctuality_rate: punctualityRes.punctuality_percentage
      },
      academic: {
        score: healthRes.dimensions && healthRes.dimensions.academic ? healthRes.dimensions.academic.score : 0,
        mean_grade: gradeDistRes.mean,
        pass_rate: gradeDistRes.pass_rate,
        failure_rate: gradeDistRes.failure_rate
      },
      assessment_operations: {
        coverage_percentage: assessCoverageRes.coverage_percentage,
        coverage_tier: assessCoverageRes.coverage_tier,
        timeliness_percentage: timelinessRes.timeliness_percentage
      },
      data_quality: {
        score: compositeDqs,
        confidence_level: compositeDqs >= 85 ? 'HIGH' : (compositeDqs >= 65 ? 'MEDIUM' : 'LOW')
      }
    },
    profile_summary: {
      stable_strengths: stableStrengths,
      emerging_issues: emergingIssues,
      critical_issues: criticalIssues
    },
    daily_command_center: {
      total_actions: actionItems.length,
      critical_actions_count: actionItems.filter(a => a.severity === 'CRITICAL').length,
      action_items: actionItems
    }
  };
}

module.exports = {
  buildSchoolEducationalHealthDashboard
};
