/* ═══════════════════════════════════════════════════════════════════
   server/analytics/assessment.js — Assessment Analytics Foundation (P0-EI-03)
   -------------------------------------------------------------------
   Educational Intelligence Foundation:
   - Assessment Coverage & Timeliness
   - Score Distribution & Statistical Diagnostics
   - Item/Exam Difficulty ($p$-value) & Discrimination ($D$-index)
   - Grade Outliers Detection (Tukey's fences)
   - Data Quality Score (Completeness, Validity, Consistency, Freshness)
   - Partition-pruning Query Builder for Partitioned `grades` table
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const {
  calculateGradeDistribution,
  evaluateAssessmentSemantics,
  parseValidScore,
  roundTo,
  enforceTenantIsolation
} = require('./semantic');

/**
 * سنجش پوشش ارزشیابی (Assessment Coverage)
 * محاسبه نسبت دانش‌آموزان ارزشیابی‌شده به کل دانش‌آموزان ثبت‌نام‌شده
 */
function calculateAssessmentCoverage(options = {}) {
  const {
    grades = [],
    enrollments = [],
    classId = null,
    subjectId = null,
    expectedSchoolId = null
  } = options;

  if (expectedSchoolId != null) {
    enforceTenantIsolation(grades, expectedSchoolId, 'calculateAssessmentCoverage:grades');
    enforceTenantIsolation(enrollments, expectedSchoolId, 'calculateAssessmentCoverage:enrollments');
  }

  // فیلتر ثبت‌نام‌ها بر اساس کلاس در صورت نیاز
  let targetEnrollments = enrollments;
  if (classId != null) {
    targetEnrollments = targetEnrollments.filter(e => Number(e.class_id) === Number(classId));
  }
  const enrolledStudentIds = new Set(
    targetEnrollments
      .map(e => Number(e.student_id))
      .filter(id => !isNaN(id) && id > 0)
  );

  // دانش‌آموزان دارای نمره معتبر
  let targetGrades = grades;
  if (classId != null) {
    targetGrades = targetGrades.filter(g => Number(g.class_id) === Number(classId));
  }
  if (subjectId != null) {
    targetGrades = targetGrades.filter(g => Number(g.subject_id) === Number(subjectId));
  }

  const assessedStudentIds = new Set();
  for (const g of targetGrades) {
    const sc = parseValidScore(g.score, g.max_score || 20);
    if (sc !== null && g.student_id != null) {
      assessedStudentIds.add(Number(g.student_id));
    }
  }

  const enrolledCount = enrolledStudentIds.size;
  // در صورتی که لیست ثبت‌نام‌ها ارسال نشده باشد، مخرج برابر با تعداد دانش‌آموزان حاضر در نمرات خواهد بود
  const totalEligible = enrolledCount > 0 ? enrolledCount : assessedStudentIds.size;

  let assessedCount = 0;
  const missingStudentIds = [];

  if (enrolledCount > 0) {
    for (const sid of enrolledStudentIds) {
      if (assessedStudentIds.has(sid)) {
        assessedCount++;
      } else {
        missingStudentIds.push(sid);
      }
    }
  } else {
    assessedCount = assessedStudentIds.size;
  }

  const coverageRate = totalEligible > 0 ? roundTo(assessedCount / totalEligible, 4) : 0;

  let coverageTier = 'LOW';
  if (coverageRate >= 1.0) {
    coverageTier = 'FULL';
  } else if (coverageRate >= 0.85) {
    coverageTier = 'ADEQUATE';
  } else if (coverageRate >= 0.60) {
    coverageTier = 'PARTIAL';
  }

  return {
    metric: 'ASSESSMENT_COVERAGE',
    version: '1.0.0',
    total_eligible: totalEligible,
    assessed_count: assessedCount,
    missing_count: missingStudentIds.length,
    missing_student_ids: missingStudentIds.sort((a, b) => a - b),
    coverage_rate: coverageRate,
    coverage_percentage: roundTo(coverageRate * 100, 2),
    coverage_tier: coverageTier
  };
}

/**
 * تحلیل به‌موقع بودن ثبت نمرات (Assessment Timeliness)
 * بررسی فاصله زمانی بین برگزاری آزمون و ثبت داده‌ها در سیستم
 */
function calculateTimelinessMetrics(options = {}) {
  const {
    grades = [],
    examDate = null,
    expectedSchoolId = null
  } = options;

  if (expectedSchoolId != null) {
    enforceTenantIsolation(grades, expectedSchoolId, 'calculateTimelinessMetrics');
  }

  if (!Array.isArray(grades) || grades.length === 0) {
    return {
      metric: 'ASSESSMENT_TIMELINESS',
      version: '1.0.0',
      total_records: 0,
      on_time_count: 0,
      delayed_count: 0,
      late_count: 0,
      timeliness_rate: 0,
      avg_turnaround_days: null,
      timeliness_status: 'NO_DATA'
    };
  }

  const examTime = examDate ? new Date(examDate).getTime() : null;
  let onTime = 0;
  let delayed = 0;
  let late = 0;
  let totalDiffDays = 0;
  let validDiffCount = 0;

  for (const g of grades) {
    const entryDateStr = g.created_at || g.date;
    const gExamDateStr = g.date || examDate;

    if (!entryDateStr || !gExamDateStr) {
      onTime++;
      continue;
    }

    const tEntry = new Date(entryDateStr).getTime();
    const tExam = examTime || new Date(gExamDateStr).getTime();

    if (isNaN(tEntry) || isNaN(tExam)) {
      onTime++;
      continue;
    }

    const diffDays = Math.max(0, Math.round((tEntry - tExam) / (1000 * 60 * 60 * 24)));
    totalDiffDays += diffDays;
    validDiffCount++;

    if (diffDays <= 3) {
      onTime++;
    } else if (diffDays <= 7) {
      delayed++;
    } else {
      late++;
    }
  }

  const total = grades.length;
  const timelinessRate = total > 0 ? roundTo(onTime / total, 4) : 0;
  const avgTurnaroundDays = validDiffCount > 0 ? roundTo(totalDiffDays / validDiffCount, 1) : 0;

  let timelinessStatus = 'ACCEPTABLE';
  if (timelinessRate >= 0.90) {
    timelinessStatus = 'PROMPT';
  } else if (timelinessRate < 0.60) {
    timelinessStatus = 'NEEDS_IMPROVEMENT';
  }

  return {
    metric: 'ASSESSMENT_TIMELINESS',
    version: '1.0.0',
    total_records: total,
    on_time_count: onTime,
    delayed_count: delayed,
    late_count: late,
    timeliness_rate: timelinessRate,
    timeliness_percentage: roundTo(timelinessRate * 100, 2),
    avg_turnaround_days: avgTurnaroundDays,
    timeliness_status: timelinessStatus
  };
}

/**
 * تشخیص نمرات پرت و غیرعادی (Grade Outlier Detection)
 * استفاده از روش استاندارد حصارهای توکی (Tukey's Fences) بر مبنای چارک‌ها (IQR)
 */
function detectGradeOutliers(options = {}) {
  const {
    grades = [],
    maxScore = 20,
    expectedSchoolId = null
  } = options;

  if (expectedSchoolId != null) {
    enforceTenantIsolation(grades, expectedSchoolId, 'detectGradeOutliers');
  }

  const validEntries = [];
  for (const g of grades) {
    const norm = parseValidScore(g.score, g.max_score || maxScore);
    if (norm !== null) {
      validEntries.push({
        id: g.id,
        student_id: g.student_id,
        raw_score: g.score,
        normalized_score: norm
      });
    }
  }

  if (validEntries.length < 4) {
    return {
      metric: 'GRADE_OUTLIERS',
      version: '1.0.0',
      sample_size: validEntries.length,
      outliers_detected: false,
      outlier_count: 0,
      q1: null,
      q3: null,
      iqr: null,
      lower_fence: null,
      upper_fence: null,
      outliers: []
    };
  }

  validEntries.sort((a, b) => a.normalized_score - b.normalized_score);
  const n = validEntries.length;

  // محاسبه چارک‌ها به روش استاندارد
  const q1 = validEntries[Math.floor(n * 0.25)].normalized_score;
  const q3 = validEntries[Math.floor(n * 0.75)].normalized_score;
  const iqr = roundTo(q3 - q1, 2);

  const lowerFence = roundTo(Math.max(0, q1 - 1.5 * iqr), 2);
  const upperFence = roundTo(Math.min(20, q3 + 1.5 * iqr), 2);
  const extremeLowerFence = roundTo(Math.max(0, q1 - 3.0 * iqr), 2);
  const extremeUpperFence = roundTo(Math.min(20, q3 + 3.0 * iqr), 2);

  const outliers = [];
  for (const entry of validEntries) {
    const sc = entry.normalized_score;
    if (sc < lowerFence) {
      const isExtreme = sc < extremeLowerFence;
      outliers.push({
        student_id: entry.student_id,
        score: sc,
        raw_score: entry.raw_score,
        type: 'LOW_OUTLIER',
        severity: isExtreme ? 'EXTREME' : 'MILD',
        fence_breached: lowerFence
      });
    } else if (sc > upperFence) {
      const isExtreme = sc > extremeUpperFence;
      outliers.push({
        student_id: entry.student_id,
        score: sc,
        raw_score: entry.raw_score,
        type: 'HIGH_OUTLIER',
        severity: isExtreme ? 'EXTREME' : 'MILD',
        fence_breached: upperFence
      });
    }
  }

  return {
    metric: 'GRADE_OUTLIERS',
    version: '1.0.0',
    sample_size: n,
    outliers_detected: outliers.length > 0,
    outlier_count: outliers.length,
    q1,
    q3,
    iqr,
    lower_fence: lowerFence,
    upper_fence: upperFence,
    outliers
  };
}

/**
 * ارزیابی امتیاز کیفیت داده نمرات (Assessment Data Quality Score - DQS)
 * بررسی ۴ مؤلفه:
 * ۱. کامل بودن (Completeness): پوشش دانش‌آموزان
 * ۲. اعتبار (Validity): نمرات معتبر ریاضی در دامنه مجاز
 * ۳. سازگاری (Consistency): ارجاع به دانش‌آموزان و کلاس‌های معتبر
 * ۴. تازگی (Freshness): ثبت بدون دیرکرد
 */
function calculateAssessmentDataQuality(options = {}) {
  const {
    grades = [],
    enrollments = [],
    maxScore = 20,
    expectedSchoolId = null
  } = options;

  if (expectedSchoolId != null) {
    enforceTenantIsolation(grades, expectedSchoolId, 'calculateAssessmentDataQuality:grades');
    enforceTenantIsolation(enrollments, expectedSchoolId, 'calculateAssessmentDataQuality:enrollments');
  }

  if (!Array.isArray(grades) || grades.length === 0) {
    return {
      metric: 'ASSESSMENT_DATA_QUALITY',
      version: '1.0.0',
      composite_dqs: 0,
      confidence_level: 'LOW',
      completeness: 0,
      validity: 0,
      consistency: 0,
      freshness: 0,
      status: 'NO_DATA'
    };
  }

  // ۱. ارزیابی اعتبار (Validity)
  let validCount = 0;
  for (const g of grades) {
    const sc = parseValidScore(g.score, g.max_score || maxScore);
    if (sc !== null && sc >= 0 && sc <= 20) {
      validCount++;
    }
  }
  const validity = grades.length > 0 ? roundTo(validCount / grades.length, 4) : 0;

  // ۲. ارزیابی کامل بودن (Completeness)
  const coverage = calculateAssessmentCoverage({ grades, enrollments, expectedSchoolId });
  const completeness = coverage.coverage_rate;

  // ۳. ارزیابی سازگاری (Consistency)
  let consistentCount = 0;
  for (const g of grades) {
    if (g.student_id != null && !isNaN(Number(g.student_id))) {
      consistentCount++;
    }
  }
  const consistency = grades.length > 0 ? roundTo(consistentCount / grades.length, 4) : 0;

  // ۴. تازگی (Freshness)
  const timeliness = calculateTimelinessMetrics({ grades, expectedSchoolId });
  const freshness = timeliness.timeliness_rate;

  // نمره ترکیبی کیفیت داده (Composite DQS)
  // وزن‌ها: اعتبار (۳۵٪)، کامل بودن (۳۵٪)، سازگاری (۱۵٪)، تازگی (۱۵٪)
  const compositeRatio = roundTo(
    0.35 * validity +
    0.35 * completeness +
    0.15 * consistency +
    0.15 * freshness,
    4
  );
  const compositeDqs = roundTo(compositeRatio * 100, 1);

  let confidenceLevel = 'LOW';
  if (compositeDqs >= 85) {
    confidenceLevel = 'HIGH';
  } else if (compositeDqs >= 65) {
    confidenceLevel = 'MEDIUM';
  }

  return {
    metric: 'ASSESSMENT_DATA_QUALITY',
    version: '1.0.0',
    composite_dqs: compositeDqs,
    confidence_level: confidenceLevel,
    completeness: roundTo(completeness * 100, 1),
    validity: roundTo(validity * 100, 1),
    consistency: roundTo(consistency * 100, 1),
    freshness: roundTo(freshness * 100, 1),
    sample_size: grades.length
  };
}

/**
 * گزارش جامع تحلیلی سنجش و ارزشیابی (Assessment Analytics Report)
 * اتصال لایه معنایی با شاخص‌های پوشش، روان‌سنجی، نمرات پرت و کیفیت داده
 */
function buildAssessmentAnalyticsReport(options = {}) {
  const {
    grades = [],
    enrollments = [],
    classId = null,
    subjectId = null,
    maxScore = 20,
    passThreshold = 10,
    examDate = null,
    expectedSchoolId = null
  } = options;

  if (expectedSchoolId != null) {
    enforceTenantIsolation(grades, expectedSchoolId, 'buildAssessmentAnalyticsReport:grades');
    enforceTenantIsolation(enrollments, expectedSchoolId, 'buildAssessmentAnalyticsReport:enrollments');
  }

  // ۱. توزیع آماری نمرات (Grade Distribution)
  const distribution = calculateGradeDistribution(grades, {
    maxScore,
    expectedSchoolId
  });

  // ۲. کیفیت و روان‌سنجی آزمون (Difficulty & Discrimination)
  const psychometrics = evaluateAssessmentSemantics(grades, {
    maxScore,
    passThreshold,
    expectedSchoolId
  });

  // ۳. پوشش آزمون (Coverage)
  const coverage = calculateAssessmentCoverage({
    grades,
    enrollments,
    classId,
    subjectId,
    expectedSchoolId
  });

  // ۴. زمان‌بندی ثبت (Timeliness)
  const timeliness = calculateTimelinessMetrics({
    grades,
    examDate,
    expectedSchoolId
  });

  // ۵. کشف نمرات پرت (Outliers)
  const outliers = detectGradeOutliers({
    grades,
    maxScore,
    expectedSchoolId
  });

  // ۶. ارزیابی امتیاز کیفیت داده (Data Quality)
  const dataQuality = calculateAssessmentDataQuality({
    grades,
    enrollments,
    maxScore,
    expectedSchoolId
  });

  return {
    report_type: 'ASSESSMENT_ANALYTICS_FOUNDATION',
    version: '1.0.0',
    target: {
      class_id: classId ? Number(classId) : null,
      subject_id: subjectId ? Number(subjectId) : null,
      school_id: expectedSchoolId ? Number(expectedSchoolId) : null
    },
    statistical_summary: {
      total_participants: distribution.count,
      mean_score: distribution.mean,
      median_score: distribution.median,
      std_dev: distribution.std_dev,
      min_score: distribution.min,
      max_score: distribution.max,
      quartiles: {
        q1: outliers.q1,
        median: distribution.median,
        q3: outliers.q3,
        iqr: outliers.iqr
      },
      descriptive_distribution: distribution.descriptive_distribution
    },
    psychometrics: {
      difficulty_index: psychometrics.difficulty_index,
      difficulty_category: psychometrics.difficulty_category,
      discrimination_index: psychometrics.discrimination_index,
      discrimination_category: psychometrics.discrimination_category,
      pass_rate: psychometrics.pass_rate,
      variance: psychometrics.variance
    },
    coverage: {
      total_eligible: coverage.total_eligible,
      assessed_count: coverage.assessed_count,
      missing_count: coverage.missing_count,
      coverage_rate: coverage.coverage_rate,
      coverage_tier: coverage.coverage_tier
    },
    timeliness: {
      timeliness_rate: timeliness.timeliness_rate,
      avg_turnaround_days: timeliness.avg_turnaround_days,
      timeliness_status: timeliness.timeliness_status
    },
    diagnostics: {
      outliers_detected: outliers.outliers_detected,
      outlier_count: outliers.outlier_count,
      outliers: outliers.outliers
    },
    data_quality: {
      composite_dqs: dataQuality.composite_dqs,
      confidence_level: dataQuality.confidence_level,
      sub_scores: {
        completeness: dataQuality.completeness,
        validity: dataQuality.validity,
        consistency: dataQuality.consistency,
        freshness: dataQuality.freshness
      }
    }
  };
}

/**
 * سازنده کوئری سنجش با بهره‌گیری از هرس پارتیشن‌ها (Partition Pruning)
 * شرط school_id الزامی و fail-closed است
 */
function buildAssessmentAnalyticsQuery(filters = {}) {
  const { schoolId, classId, subjectId, term, startDate, endDate } = filters;

  if (schoolId == null || isNaN(Number(schoolId))) {
    throw new Error('TENANT_ISOLATION_VIOLATION: schoolId is required for assessment analytics query');
  }

  const conditions = ['school_id = $1'];
  const values = [Number(schoolId)];
  let idx = 2;

  if (startDate) {
    conditions.push(`created_at >= $${idx++}`);
    values.push(startDate);
  }
  if (endDate) {
    conditions.push(`created_at < $${idx++}`);
    values.push(endDate);
  }
  if (classId) {
    conditions.push(`class_id = $${idx++}`);
    values.push(Number(classId));
  }
  if (subjectId) {
    conditions.push(`subject_id = $${idx++}`);
    values.push(Number(subjectId));
  }
  if (term) {
    conditions.push(`term = $${idx++}`);
    values.push(String(term));
  }

  const sql = `
    SELECT
      id, school_id, student_id, class_id, subject_id, score, max_score, date, created_at
    FROM grades
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at ASC
  `.trim();

  return {
    sql,
    values,
    target_table: 'grades',
    partition_pruning_enabled: Boolean(startDate || endDate)
  };
}

module.exports = {
  calculateAssessmentCoverage,
  calculateTimelinessMetrics,
  detectGradeOutliers,
  calculateAssessmentDataQuality,
  buildAssessmentAnalyticsReport,
  buildAssessmentAnalyticsQuery
};
