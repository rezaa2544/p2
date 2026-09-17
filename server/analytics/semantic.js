/**
 * ═══════════════════════════════════════════════════════════════════
 * server/analytics/semantic.js — Educational Semantic Layer (P0-EI-01)
 * ───────────────────────────────────────────────────────────────────
 * منبع واحد حقیقت (Single Source of Truth) برای شاخص‌ها و مفاهیم آموزشی.
 * 
 * اصول حاکمیتی:
 *  ۱) ریشه‌کنی Semantic Metric Drift: تمام تعاریف صورت و مخرج به صورت
 *     تغییرناپذیر و متمرکز پیاده‌سازی شده‌اند.
 *  ۲) Explainable & Deterministic Analytics: محاسبات به روش‌های قطعی،
 *     ریاضی محض و کاملاً شفاف انجام می‌شوند؛ بدون برازش جعبه‌سیاه یا ML.
 *  ۳) Strict Tenant Isolation: تمام توابع ایزولاسیون مدرسه‌ای (school_id)
 *     را بررسی و اعتبارسنجی می‌کنند؛ اختلاط داده‌های چند مستأجر ممنوع است.
 *  ۴) Partition Pruning Friendly: توابع تولید کوئری همیشه شروط الزامی
 *     بازهٔ زمانی (created_at) و school_id را برای جداول پارتیشن‌شده اعمال می‌کنند.
 *  ۵) Null & Zero-Division Safety: در نبود داده کافی، شاخص هرگز صفر یا صد
 *     جعلی پس نمی‌دهد؛ مقدار null با ثبت صریح علت در data_quality برمی‌گردد.
 *  ۶) Mutation Safety: هیچ تابعی آرایه‌ها یا اشیای ورودی را دستکاری نمی‌کند.
 * ═══════════════════════════════════════════════════════════════════
 */

'use strict';

/**
 * کاتالوگ جامع متادیتای شاخص‌های لایه معنایی (Canonical Metric Registry)
 */
const METRIC_REGISTRY = Object.freeze({
  ATTENDANCE_RATE: {
    id: 'attendance_rate',
    title: 'نرخ حضور',
    title_en: 'Attendance Rate',
    version: '1.0.0',
    unit: 'percent',
    range: [0, 100],
    numerator_def: 'تعداد جلسات با وضعیت حاضر + (ضریب وزنی * تعداد با وضعیت تأخیر)',
    denominator_def: 'کل جلسات ثبت‌شده در دوره (تقویمی) یا جلسات منهای غیبت موجه (خالص)',
    default_formula: 'calendar',
    owner: 'Arena 2 / Educational Intelligence'
  },
  CHRONIC_ABSENCE_RATE: {
    id: 'chronic_absence_rate',
    title: 'نرخ غیبت مزمن',
    title_en: 'Chronic Absence Rate',
    version: '1.0.0',
    unit: 'percent',
    range: [0, 100],
    numerator_def: 'تعداد دانش‌آموزان واجد شرایط با درصد غیبت (موجه + غیرموجه) >= آستانه (پیش‌فرض ۱۰٪)',
    denominator_def: 'کل دانش‌آموزان دارای حداقل تعداد جلسات ثبت‌شده معتبر (پیش‌فرض حداقل ۵ جلسه)',
    default_threshold: 0.10,
    owner: 'Arena 2 / Educational Intelligence'
  },
  GRADE_DISTRIBUTION: {
    id: 'grade_distribution',
    title: 'توزیع آماری نمرات',
    title_en: 'Grade Distribution',
    version: '1.0.0',
    unit: 'score_20',
    range: [0, 20],
    numerator_def: 'مجموع نمرات معتبر نرمال‌شده بر مقیاس ۲۰',
    denominator_def: 'تعداد کل نمرات معتبر غیرتهی',
    owner: 'Arena 2 / Educational Intelligence'
  },
  LEARNING_PROGRESS_TREND: {
    id: 'learning_progress_trend',
    title: 'روند پیشرفت یادگیری',
    title_en: 'Learning Progress Trend',
    version: '1.0.0',
    unit: 'slope_per_session',
    range: [-20, 20],
    numerator_def: 'کوواریانس زمان و نمرات معتبر (شیب رگرسیون خطی کمترین مربعات OLS)',
    denominator_def: 'واریانس زمان جلسات امتحانی',
    owner: 'Arena 2 / Educational Intelligence'
  },
  SCHOOL_HEALTH_INDEX: {
    id: 'school_health_index',
    title: 'شاخص سلامت آموزشی مدرسه',
    title_en: 'School Educational Health Index',
    version: '1.0.0',
    unit: 'index_100',
    range: [0, 100],
    numerator_def: 'ترکیب وزنی ۴ بعد: حضور (۳۰٪)، عملکرد تحصیلی (۳۵٪)، پایداری روند (۲۰٪)، کیفیت داده (۱۵٪)',
    denominator_def: 'مجموع اوزان استاندارد (۱.۰۰)',
    owner: 'Arena 2 / Educational Intelligence'
  },
  LEARNER_PROGRESS: {
    id: 'learner_progress',
    title: 'پروفایل پیشرفت یادگیرنده',
    title_en: 'Learner Progress Profile',
    version: '1.0.0',
    unit: 'profile',
    numerator_def: 'نمرات نرمال‌شده به تفکیک تکوینی/تراکمی و روند سرعت رشد',
    denominator_def: 'تعداد ارزیابی‌های معتبر دانش‌آموز',
    owner: 'Arena 2 / Educational Intelligence'
  },
  COURSE_ENGAGEMENT: {
    id: 'course_engagement',
    title: 'مشارکت در درس',
    title_en: 'Course Engagement',
    version: '1.0.0',
    unit: 'score_100',
    range: [0, 100],
    numerator_def: 'ترکیب وزنی حضور در کلاس درس و فعالیت‌های آموزشی ثبت‌شده',
    denominator_def: 'کل جلسات و فعالیت‌های برنامه‌ریزی‌شده درس',
    owner: 'Arena 2 / Educational Intelligence'
  },
  ASSESSMENT_QUALITY: {
    id: 'assessment_quality',
    title: 'کیفیت و دشواری سنجش',
    title_en: 'Assessment Quality Semantics',
    version: '1.0.0',
    unit: 'indices',
    numerator_def: 'شاخص ضریب دشواری (p-value) و شاخص تمایز (D-index)',
    denominator_def: 'تعداد کل شرکت‌کنندگان در آزمون',
    owner: 'Arena 2 / Educational Intelligence'
  },
  COMPLETION_STATUS: {
    id: 'completion_status',
    title: 'وضعیت تکمیل و ارتقای تحصیلی',
    title_en: 'Completion & Promotion Status',
    version: '1.0.0',
    unit: 'status',
    numerator_def: 'تعداد دروس گذرانده‌شده و معدل کل',
    denominator_def: 'کل واحدهای درسی ثبت‌نامی دوره',
    owner: 'Arena 2 / Educational Intelligence'
  },
  EDUCATIONAL_ACTIVITY_SUMMARY: {
    id: 'educational_activity_summary',
    title: 'خلاصه فعالیت‌های آموزشی',
    title_en: 'Educational Activity Summary',
    version: '1.0.0',
    unit: 'summary',
    numerator_def: 'مجموع کنش‌های ثبت حضور، ارزشیابی و رویدادهای آموزشی',
    denominator_def: 'بازه زمانی مورد سنجش',
    owner: 'Arena 2 / Educational Intelligence'
  }
});

/**
 * توابع کمکی امن و ریاضی
 */
function roundTo(num, decimals = 2) {
  if (typeof num !== 'number' || !Number.isFinite(num)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round((num + Number.EPSILON) * factor) / factor;
}

function parseValidScore(rawScore, rawMax = 20) {
  if (rawScore === null || rawScore === undefined || rawScore === '') return null;
  const num = typeof rawScore === 'number' ? rawScore : parseFloat(String(rawScore).replace(/٫/g, '.').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  if (isNaN(num) || !Number.isFinite(num)) return null;
  
  const max = typeof rawMax === 'number' ? rawMax : (parseFloat(rawMax) || 20);
  if (max <= 0) return null;

  // نرمال‌سازی به مقیاس ۲۰
  const normalized = (num / max) * 20;
  if (normalized < 0 || normalized > 20.0001) {
    return null; // داده نامعتبر خارج از بازه
  }
  return roundTo(normalized, 3);
}

/**
 * بررسی ایزولاسیون مستأجران (Tenant Isolation Guard)
 */
function enforceTenantIsolation(records, expectedSchoolId) {
  if (!expectedSchoolId || !Array.isArray(records)) return;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r && r.school_id !== undefined && r.school_id !== null && Number(r.school_id) !== Number(expectedSchoolId)) {
      const err = new Error(`Tenant isolation violation: Record school_id (${r.school_id}) does not match expected (${expectedSchoolId})`);
      err.code = 'TENANT_ISOLATION_VIOLATION';
      err.expectedSchoolId = expectedSchoolId;
      err.recordSchoolId = r.school_id;
      throw err;
    }
  }
}

/**
 * ۱) محاسبه نرخ حضور (Attendance Rate)
 */
function calculateAttendanceRate(records, options = {}) {
  const {
    formula = 'calendar',
    lateWeight = 1.0,
    expectedSchoolId = null
  } = options;

  if (!Array.isArray(records) || records.length === 0) {
    return {
      metric_id: METRIC_REGISTRY.ATTENDANCE_RATE.id,
      version: METRIC_REGISTRY.ATTENDANCE_RATE.version,
      formula,
      value: null,
      numerator: 0,
      denominator: 0,
      sample_size: 0,
      counts: { present: 0, late: 0, absent: 0, excused: 0, unclassified: 0 },
      data_quality: { status: 'NO_DATA', completeness: 0, reason: 'No attendance records provided' }
    };
  }

  enforceTenantIsolation(records, expectedSchoolId);

  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  let excusedCount = 0;
  let unclassifiedCount = 0;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const st = String((r && r.status) || '').toLowerCase().trim();
    if (st === 'present' || st === 'حاضر') {
      presentCount++;
    } else if (st === 'late' || st === 'تاخیر' || st === 'تأخیر') {
      lateCount++;
    } else if (st === 'absent' || st === 'غایب') {
      absentCount++;
    } else if (st === 'excused' || st === 'موجه') {
      excusedCount++;
    } else {
      unclassifiedCount++;
    }
  }

  const numerator = presentCount + (lateCount * lateWeight);
  let denominator = 0;

  if (formula === 'net') {
    denominator = presentCount + lateCount + absentCount + unclassifiedCount;
  } else {
    denominator = presentCount + lateCount + absentCount + excusedCount + unclassifiedCount;
  }

  if (denominator === 0) {
    return {
      metric_id: METRIC_REGISTRY.ATTENDANCE_RATE.id,
      version: METRIC_REGISTRY.ATTENDANCE_RATE.version,
      formula,
      value: null,
      numerator: 0,
      denominator: 0,
      sample_size: records.length,
      counts: { present: presentCount, late: lateCount, absent: absentCount, excused: excusedCount, unclassified: unclassifiedCount },
      data_quality: { status: 'ZERO_DENOMINATOR', completeness: 0, reason: 'All records were excused or unclassifiable in net formula' }
    };
  }

  const rawRate = (numerator / denominator) * 100;
  const rate = roundTo(Math.min(100, Math.max(0, rawRate)), 2);
  const completeness = roundTo((denominator - unclassifiedCount) / denominator, 3);

  return {
    metric_id: METRIC_REGISTRY.ATTENDANCE_RATE.id,
    version: METRIC_REGISTRY.ATTENDANCE_RATE.version,
    formula,
    value: rate,
    numerator: roundTo(numerator, 2),
    denominator,
    sample_size: records.length,
    counts: {
      present: presentCount,
      late: lateCount,
      absent: absentCount,
      excused: excusedCount,
      unclassified: unclassifiedCount
    },
    data_quality: {
      status: unclassifiedCount > 0 ? 'PARTIAL_DATA' : 'COMPLETE',
      completeness,
      unclassified_ratio: roundTo(unclassifiedCount / denominator, 3)
    }
  };
}

/**
 * ۲) محاسبه نرخ غیبت مزمن (Chronic Absence Rate)
 */
function calculateChronicAbsence(records, options = {}) {
  const {
    chronicThreshold = 0.10,
    minRequiredSessions = 5,
    expectedSchoolId = null
  } = options;

  if (!Array.isArray(records) || records.length === 0) {
    return {
      metric_id: METRIC_REGISTRY.CHRONIC_ABSENCE_RATE.id,
      version: METRIC_REGISTRY.CHRONIC_ABSENCE_RATE.version,
      value: null,
      numerator: 0,
      denominator: 0,
      total_students_seen: 0,
      chronic_students_count: 0,
      eligible_students_count: 0,
      students_detail: {},
      data_quality: { status: 'NO_DATA', completeness: 0 }
    };
  }

  enforceTenantIsolation(records, expectedSchoolId);

  const studentMap = {};

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!r) continue;
    const sid = r.student_id;
    if (!sid) continue;

    if (!studentMap[sid]) {
      studentMap[sid] = {
        student_id: sid,
        total_sessions: 0,
        absent_sessions: 0,
        excused_sessions: 0,
        present_sessions: 0,
        late_sessions: 0
      };
    }

    const st = String(r.status || '').toLowerCase().trim();
    studentMap[sid].total_sessions++;

    if (st === 'absent' || st === 'غایب') {
      studentMap[sid].absent_sessions++;
    } else if (st === 'excused' || st === 'موجه') {
      studentMap[sid].excused_sessions++;
    } else if (st === 'present' || st === 'حاضر') {
      studentMap[sid].present_sessions++;
    } else if (st === 'late' || st === 'تاخیر' || st === 'تأخیر') {
      studentMap[sid].late_sessions++;
    }
  }

  const studentIds = Object.keys(studentMap);
  let eligibleCount = 0;
  let chronicCount = 0;
  const studentsDetail = {};

  for (let i = 0; i < studentIds.length; i++) {
    const sid = studentIds[i];
    const s = studentMap[sid];
    const totalMissed = s.absent_sessions + s.excused_sessions;
    const isEligible = s.total_sessions >= minRequiredSessions;

    let absenceRate = null;
    let isChronic = false;

    if (isEligible && s.total_sessions > 0) {
      absenceRate = roundTo(totalMissed / s.total_sessions, 4);
      isChronic = absenceRate >= chronicThreshold;
      eligibleCount++;
      if (isChronic) {
        chronicCount++;
      }
    }

    studentsDetail[sid] = {
      total_sessions: s.total_sessions,
      missed_sessions: totalMissed,
      absence_rate: absenceRate,
      is_eligible: isEligible,
      is_chronic: isChronic
    };
  }

  if (eligibleCount === 0) {
    return {
      metric_id: METRIC_REGISTRY.CHRONIC_ABSENCE_RATE.id,
      version: METRIC_REGISTRY.CHRONIC_ABSENCE_RATE.version,
      value: null,
      numerator: 0,
      denominator: 0,
      total_students_seen: studentIds.length,
      chronic_students_count: 0,
      eligible_students_count: 0,
      students_detail: studentsDetail,
      data_quality: {
        status: 'INSUFFICIENT_DATA',
        completeness: 0,
        reason: `No student had >= ${minRequiredSessions} sessions recorded`
      }
    };
  }

  const rawRate = (chronicCount / eligibleCount) * 100;
  const rate = roundTo(rawRate, 2);

  return {
    metric_id: METRIC_REGISTRY.CHRONIC_ABSENCE_RATE.id,
    version: METRIC_REGISTRY.CHRONIC_ABSENCE_RATE.version,
    value: rate,
    numerator: chronicCount,
    denominator: eligibleCount,
    total_students_seen: studentIds.length,
    chronic_students_count: chronicCount,
    eligible_students_count: eligibleCount,
    chronic_threshold: chronicThreshold,
    min_required_sessions: minRequiredSessions,
    students_detail: studentsDetail,
    data_quality: {
      status: eligibleCount < studentIds.length ? 'PARTIAL_DATA' : 'COMPLETE',
      completeness: roundTo(eligibleCount / Math.max(1, studentIds.length), 3)
    }
  };
}

/**
 * ۳) توزیع آماری نمرات (Grade Distribution)
 */
function calculateGradeDistribution(records, options = {}) {
  const {
    targetScale = 20,
    expectedSchoolId = null
  } = options;

  if (!Array.isArray(records) || records.length === 0) {
    return {
      metric_id: METRIC_REGISTRY.GRADE_DISTRIBUTION.id,
      version: METRIC_REGISTRY.GRADE_DISTRIBUTION.version,
      count: 0,
      invalid_count: 0,
      mean: null,
      median: null,
      std_dev: null,
      variance: null,
      min: null,
      max: null,
      quartiles: { q1: null, q2: null, q3: null, iqr: null },
      histogram: { failed: 0, acceptable: 0, good: 0, excellent: 0 },
      qualitative_counts: { needs_effort: 0, acceptable: 0, good: 0, excellent: 0 },
      data_quality: { status: 'NO_DATA', completeness: 0 }
    };
  }

  enforceTenantIsolation(records, expectedSchoolId);

  const validScores = [];
  let invalidCount = 0;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const parsed = parseValidScore(r ? r.score : null, (r && r.max_score) || 20);
    if (parsed !== null) {
      validScores.push(parsed);
    } else {
      invalidCount++;
    }
  }

  const n = validScores.length;
  if (n === 0) {
    return {
      metric_id: METRIC_REGISTRY.GRADE_DISTRIBUTION.id,
      version: METRIC_REGISTRY.GRADE_DISTRIBUTION.version,
      count: 0,
      invalid_count: invalidCount,
      mean: null,
      median: null,
      std_dev: null,
      variance: null,
      min: null,
      max: null,
      quartiles: { q1: null, q2: null, q3: null, iqr: null },
      histogram: { failed: 0, acceptable: 0, good: 0, excellent: 0 },
      qualitative_counts: { needs_effort: 0, acceptable: 0, good: 0, excellent: 0 },
      data_quality: { status: 'ALL_INVALID', completeness: 0, reason: 'All score entries were null or invalid' }
    };
  }

  validScores.sort((a, b) => a - b);

  let sum = 0;
  const histogram = { failed: 0, acceptable: 0, good: 0, excellent: 0 };
  const qualitative = { needs_effort: 0, acceptable: 0, good: 0, excellent: 0 };

  for (let i = 0; i < n; i++) {
    const s = validScores[i];
    sum += s;

    if (s < 10) histogram.failed++;
    else if (s < 15) histogram.acceptable++;
    else if (s < 18) histogram.good++;
    else histogram.excellent++;

    if (s < 10) qualitative.needs_effort++;
    else if (s < 15) qualitative.acceptable++;
    else if (s < 18) qualitative.good++;
    else qualitative.excellent++;
  }

  const mean = roundTo(sum / n, 2);

  let sqDiffSum = 0;
  for (let i = 0; i < n; i++) {
    const diff = validScores[i] - mean;
    sqDiffSum += diff * diff;
  }
  const variance = roundTo(sqDiffSum / n, 3);
  const stdDev = roundTo(Math.sqrt(sqDiffSum / n), 2);

  function getPercentile(arr, p) {
    if (arr.length === 1) return arr[0];
    const index = p * (arr.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return roundTo(arr[lower] * (1 - weight) + arr[upper] * weight, 2);
  }

  const q1 = getPercentile(validScores, 0.25);
  const q2 = getPercentile(validScores, 0.50);
  const q3 = getPercentile(validScores, 0.75);
  const iqr = roundTo(q3 - q1, 2);

  return {
    metric_id: METRIC_REGISTRY.GRADE_DISTRIBUTION.id,
    version: METRIC_REGISTRY.GRADE_DISTRIBUTION.version,
    count: n,
    invalid_count: invalidCount,
    mean,
    median: q2,
    std_dev: stdDev,
    variance,
    min: validScores[0],
    max: validScores[n - 1],
    quartiles: { q1, q2, q3, iqr },
    histogram,
    qualitative_counts: qualitative,
    data_quality: {
      status: invalidCount > 0 ? 'PARTIAL_DATA' : 'COMPLETE',
      validity: roundTo(n / (n + invalidCount), 3),
      invalid_count: invalidCount
    }
  };
}

/**
 * ۴) روند پیشرفت یادگیری (Learning Progress Trend)
 */
function calculateLearningProgressTrend(records, options = {}) {
  const {
    minObservations = 3,
    expectedSchoolId = null
  } = options;

  if (!Array.isArray(records) || records.length < minObservations) {
    return {
      metric_id: METRIC_REGISTRY.LEARNING_PROGRESS_TREND.id,
      version: METRIC_REGISTRY.LEARNING_PROGRESS_TREND.version,
      direction: 'INSUFFICIENT_DATA',
      slope: null,
      r_squared: null,
      sample_size: Array.isArray(records) ? records.length : 0,
      data_quality: {
        status: 'INSUFFICIENT_DATA',
        reason: `Need at least ${minObservations} observations, got ${Array.isArray(records) ? records.length : 0}`
      }
    };
  }

  enforceTenantIsolation(records, expectedSchoolId);

  const validPoints = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!r) continue;
    const score = parseValidScore(r.score, r.max_score || 20);
    if (score === null) continue;

    let ts = 0;
    if (r.date) {
      ts = new Date(r.date).getTime();
    } else if (r.created_at) {
      ts = new Date(r.created_at).getTime();
    } else {
      ts = i;
    }

    if (isNaN(ts) || ts <= 0) ts = i;

    validPoints.push({ x: ts, y: score, originalDate: r.date || r.created_at || null });
  }

  if (validPoints.length < minObservations) {
    return {
      metric_id: METRIC_REGISTRY.LEARNING_PROGRESS_TREND.id,
      version: METRIC_REGISTRY.LEARNING_PROGRESS_TREND.version,
      direction: 'INSUFFICIENT_DATA',
      slope: null,
      r_squared: null,
      sample_size: validPoints.length,
      data_quality: {
        status: 'INSUFFICIENT_DATA',
        reason: `After invalid score elimination, fewer than ${minObservations} valid data points remained`
      }
    };
  }

  validPoints.sort((a, b) => a.x - b.x);

  const n = validPoints.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    const x = i + 1;
    const y = validPoints[i].y;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denominator = (n * sumXX) - (sumX * sumX);
  if (denominator === 0) {
    return {
      metric_id: METRIC_REGISTRY.LEARNING_PROGRESS_TREND.id,
      version: METRIC_REGISTRY.LEARNING_PROGRESS_TREND.version,
      direction: 'STABLE',
      slope: 0,
      r_squared: 1,
      sample_size: n,
      data_quality: { status: 'COMPLETE', completeness: 1 }
    };
  }

  const slope = ((n * sumXY) - (sumX * sumY)) / denominator;
  const intercept = (sumY - (slope * sumX)) / n;

  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;

  for (let i = 0; i < n; i++) {
    const x = i + 1;
    const y = validPoints[i].y;
    const predicted = (slope * x) + intercept;
    ssTot += Math.pow(y - meanY, 2);
    ssRes += Math.pow(y - predicted, 2);
  }

  const rSquared = ssTot === 0 ? 1 : Math.max(0, 1 - (ssRes / ssTot));

  let direction = 'STABLE';
  if (slope > 0.25) {
    direction = 'IMPROVING';
  } else if (slope < -0.25) {
    direction = 'DECLINING';
  } else if (rSquared < 0.15 && Math.abs(validPoints[n - 1].y - validPoints[0].y) > 3) {
    direction = 'VOLATILE';
  } else {
    direction = 'STABLE';
  }

  const firstScore = validPoints[0].y;
  const lastScore = validPoints[n - 1].y;
  const netChange = roundTo(lastScore - firstScore, 2);

  return {
    metric_id: METRIC_REGISTRY.LEARNING_PROGRESS_TREND.id,
    version: METRIC_REGISTRY.LEARNING_PROGRESS_TREND.version,
    direction,
    slope: roundTo(slope, 3),
    intercept: roundTo(intercept, 2),
    r_squared: roundTo(rSquared, 3),
    net_change: netChange,
    first_score: firstScore,
    last_score: lastScore,
    sample_size: n,
    data_quality: {
      status: 'COMPLETE',
      completeness: 1.0,
      r_squared_confidence: rSquared >= 0.5 ? 'HIGH' : rSquared >= 0.2 ? 'MODERATE' : 'LOW'
    }
  };
}

/**
 * ۵) شاخص سلامت آموزشی مدرسه (School Educational Health Index)
 */
function calculateSchoolEducationalHealth(components = {}, options = {}) {
  const {
    weights = {
      attendance: 0.30,
      academic: 0.35,
      progress: 0.20,
      data_quality: 0.15
    }
  } = options;

  const criticalFlags = [];

  const attRate = components.attendance_rate !== undefined ? components.attendance_rate : null;
  const chronicRate = components.chronic_absence_rate !== undefined ? components.chronic_absence_rate : 0;
  
  let attendanceScore = 50;
  if (attRate !== null) {
    const chronicPenalty = (chronicRate || 0) * 1.5;
    attendanceScore = Math.max(0, Math.min(100, attRate - chronicPenalty));
    if (chronicRate > 20) {
      criticalFlags.push('HIGH_CHRONIC_ABSENCE');
    }
    if (attRate < 75) {
      criticalFlags.push('SEVERE_ATTENDANCE_DEFICIT');
    }
  }

  const avgGrade = components.mean_grade !== undefined ? components.mean_grade : null;
  const failRate = components.failure_rate !== undefined ? components.failure_rate : 0;

  let academicScore = 50;
  if (avgGrade !== null) {
    const base100 = (avgGrade / 20) * 100;
    const failPenalty = (failRate || 0) * 0.5;
    academicScore = Math.max(0, Math.min(100, base100 - failPenalty));
    if (failRate > 25) {
      criticalFlags.push('HIGH_FAILURE_RATE');
    }
    if (avgGrade < 10) {
      criticalFlags.push('CRITICAL_ACADEMIC_FAIL');
    }
  }

  const improvingRatio = components.improving_students_ratio || 0;
  const decliningRatio = components.declining_students_ratio || 0;
  
  let progressScore = 50 + ((improvingRatio - decliningRatio) * 50);
  progressScore = Math.max(0, Math.min(100, progressScore));
  if (decliningRatio > 0.35) {
    criticalFlags.push('ALARMING_LEARNING_DECLINE');
  }

  const classCoverage = components.class_coverage_ratio !== undefined ? components.class_coverage_ratio : 1.0;
  const dataFreshness = components.data_freshness_ratio !== undefined ? components.data_freshness_ratio : 1.0;
  
  const dataScore = Math.max(0, Math.min(100, ((classCoverage * 0.5) + (dataFreshness * 0.5)) * 100));
  if (classCoverage < 0.60) {
    criticalFlags.push('LOW_DATA_COVERAGE');
  }

  const totalWeight = weights.attendance + weights.academic + weights.progress + weights.data_quality;
  const composite = (
    (attendanceScore * weights.attendance) +
    (academicScore * weights.academic) +
    (progressScore * weights.progress) +
    (dataScore * weights.data_quality)
  ) / totalWeight;

  const finalScore = roundTo(composite, 2);

  let rating = 'GOOD';
  if (finalScore >= 85) {
    rating = 'EXCELLENT';
  } else if (finalScore >= 70) {
    rating = 'GOOD';
  } else if (finalScore >= 50) {
    rating = 'NEEDS_ATTENTION';
  } else {
    rating = 'CRITICAL';
  }

  if (criticalFlags.length > 0 && rating === 'EXCELLENT') {
    rating = 'GOOD';
  }

  return {
    metric_id: METRIC_REGISTRY.SCHOOL_HEALTH_INDEX.id,
    version: METRIC_REGISTRY.SCHOOL_HEALTH_INDEX.version,
    composite_index: finalScore,
    rating,
    dimensions: {
      attendance: { score: roundTo(attendanceScore, 2), weight: weights.attendance },
      academic: { score: roundTo(academicScore, 2), weight: weights.academic },
      progress: { score: roundTo(progressScore, 2), weight: weights.progress },
      data_quality: { score: roundTo(dataScore, 2), weight: weights.data_quality }
    },
    critical_flags: criticalFlags,
    is_critical: rating === 'CRITICAL' || criticalFlags.length >= 2,
    weights_normalized: totalWeight === 1.0
  };
}

/**
 * ۶) پروفایل پیشرفت یادگیرنده (Learner Progress Semantics)
 * ─────────────────────────────────────────────────────────────────
 * تحلیل چندبعدی عملکرد یک دانش‌آموز بر پایه ارزشیابی تکوینی و تراکمی،
 * سطح تسلط و شاخص ثبات عملکرد در دروس.
 */
function evaluateLearnerProgress(studentData = {}, options = {}) {
  const {
    studentId = (studentData && studentData.studentId) || null,
    grades = (studentData && studentData.grades) || [],
    expectedSchoolId = null
  } = options;

  if (!studentId) {
    const err = new Error('studentId is required for evaluateLearnerProgress');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  if (!Array.isArray(grades) || grades.length === 0) {
    return {
      metric_id: METRIC_REGISTRY.LEARNER_PROGRESS.id,
      version: METRIC_REGISTRY.LEARNER_PROGRESS.version,
      student_id: studentId,
      mastery_level: 'NO_DATA',
      overall_mean: null,
      formative_mean: null,
      summative_mean: null,
      formative_summative_gap: null,
      progress_velocity: null,
      stability_score: null,
      subjects_breakdown: {},
      observations_count: 0,
      data_quality: { status: 'NO_DATA', completeness: 0 }
    };
  }

  enforceTenantIsolation(grades, expectedSchoolId);

  const formativeScores = [];
  const summativeScores = [];
  const allScores = [];
  const subjectsMap = {};

  for (let i = 0; i < grades.length; i++) {
    const g = grades[i];
    if (!g) continue;
    const score = parseValidScore(g.score, g.max_score || 20);
    if (score === null) continue;

    allScores.push(score);

    const isSummative = (g.kind === 'final' || g.exam_type === 'final' || g.kind === 'نهایی');
    if (isSummative) {
      summativeScores.push(score);
    } else {
      formativeScores.push(score);
    }

    const subId = g.subject_id || 'unknown';
    if (!subjectsMap[subId]) {
      subjectsMap[subId] = [];
    }
    subjectsMap[subId].push(score);
  }

  const n = allScores.length;
  if (n === 0) {
    return {
      metric_id: METRIC_REGISTRY.LEARNER_PROGRESS.id,
      version: METRIC_REGISTRY.LEARNER_PROGRESS.version,
      student_id: studentId,
      mastery_level: 'NO_DATA',
      overall_mean: null,
      formative_mean: null,
      summative_mean: null,
      formative_summative_gap: null,
      progress_velocity: null,
      stability_score: null,
      subjects_breakdown: {},
      observations_count: 0,
      data_quality: { status: 'ALL_INVALID', completeness: 0 }
    };
  }

  const avg = arr => arr.length ? roundTo(arr.reduce((a, b) => a + b, 0) / arr.length, 2) : null;
  const overallMean = avg(allScores);
  const formativeMean = avg(formativeScores);
  const summativeMean = avg(summativeScores);

  const formativeSummativeGap = (formativeMean !== null && summativeMean !== null)
    ? roundTo(formativeMean - summativeMean, 2)
    : null;

  // سطح تسلط (Mastery Level)
  let masteryLevel = 'BASIC';
  if (overallMean >= 18.0) {
    masteryLevel = 'ADVANCED';
  } else if (overallMean >= 15.0) {
    masteryLevel = 'PROFICIENT';
  } else if (overallMean >= 10.0) {
    masteryLevel = 'BASIC';
  } else {
    masteryLevel = 'BELOW_BASIC';
  }

  // سرعت رشد (Progress Velocity)
  const trend = calculateLearningProgressTrend(grades, { expectedSchoolId });
  const progressVelocity = trend.slope;

  // محاسبه ثبات نمرات (Stability Score بر اساس واریانس بین دروس)
  const subjectAverages = Object.keys(subjectsMap).map(k => avg(subjectsMap[k]));
  let stabilityScore = 100;
  if (subjectAverages.length > 1) {
    const subMean = avg(subjectAverages);
    const subVar = subjectAverages.reduce((sum, v) => sum + Math.pow(v - subMean, 2), 0) / subjectAverages.length;
    const subStd = Math.sqrt(subVar);
    stabilityScore = Math.max(0, Math.min(100, roundTo(100 - (subStd * 10), 1)));
  }

  const subjectsBreakdown = {};
  for (const subId of Object.keys(subjectsMap)) {
    const scores = subjectsMap[subId];
    subjectsBreakdown[subId] = {
      count: scores.length,
      mean: avg(scores),
      min: Math.min(...scores),
      max: Math.max(...scores)
    };
  }

  return {
    metric_id: METRIC_REGISTRY.LEARNER_PROGRESS.id,
    version: METRIC_REGISTRY.LEARNER_PROGRESS.version,
    student_id: studentId,
    mastery_level: masteryLevel,
    overall_mean: overallMean,
    formative_mean: formativeMean,
    summative_mean: summativeMean,
    formative_summative_gap: formativeSummativeGap,
    progress_velocity: progressVelocity,
    trend_direction: trend.direction,
    stability_score: stabilityScore,
    subjects_breakdown: subjectsBreakdown,
    observations_count: n,
    data_quality: {
      status: n >= 5 ? 'COMPLETE' : 'PARTIAL_DATA',
      completeness: Math.min(1.0, roundTo(n / 10, 2))
    }
  };
}

/**
 * ۷) مشارکت در درس (Course Engagement Semantics)
 * ─────────────────────────────────────────────────────────────────
 * ارزیابی پیوستگی حضور و فعالیت در یک درس خاص.
 */
function evaluateCourseEngagement(engagementData = {}, options = {}) {
  const {
    courseId = engagementData.courseId || engagementData.subjectId || null,
    attendance = engagementData.attendance || [],
    activities = engagementData.activities || [],
    expectedSchoolId = null,
    lateWeight = 0.8
  } = options;

  if (!courseId) {
    const err = new Error('courseId is required for evaluateCourseEngagement');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  enforceTenantIsolation(attendance, expectedSchoolId);
  enforceTenantIsolation(activities, expectedSchoolId);

  const attRes = calculateAttendanceRate(attendance, { formula: 'calendar', lateWeight, expectedSchoolId });

  let completedActivities = 0;
  for (let i = 0; i < activities.length; i++) {
    const a = activities[i];
    if (a && (a.completed || a.submitted || a.attended)) {
      completedActivities++;
    }
  }

  const activityRate = activities.length > 0
    ? roundTo((completedActivities / activities.length) * 100, 2)
    : (attRes.value !== null ? attRes.value : 100);

  let engagementScore = null;
  if (attRes.value !== null) {
    engagementScore = roundTo((attRes.value * 0.70) + (activityRate * 0.30), 2);
  } else if (activities.length > 0) {
    engagementScore = activityRate;
  }

  let tier = 'MODERATE';
  if (engagementScore !== null) {
    if (engagementScore >= 85) tier = 'HIGH';
    else if (engagementScore >= 65) tier = 'MODERATE';
    else if (engagementScore >= 45) tier = 'LOW';
    else tier = 'DISENGAGED';
  } else {
    tier = 'NO_DATA';
  }

  const disengagementRisk = (engagementScore !== null && engagementScore < 60) || (attRes.counts.absent >= 3);

  return {
    metric_id: METRIC_REGISTRY.COURSE_ENGAGEMENT.id,
    version: METRIC_REGISTRY.COURSE_ENGAGEMENT.version,
    course_id: courseId,
    engagement_score: engagementScore,
    engagement_tier: tier,
    disengagement_risk: disengagementRisk,
    attendance_rate: attRes.value,
    total_sessions: attRes.denominator,
    attended_sessions: attRes.numerator,
    activities_total: activities.length,
    activities_completed: completedActivities,
    data_quality: attRes.data_quality
  };
}

/**
 * ۸) کیفیت و دشواری سنجش (Assessment Quality Semantics)
 * ─────────────────────────────────────────────────────────────────
 * محاسبه ضریب دشواری (p-value) و شاخص تمایز (D-index) بر روی نتایج یک آزمون.
 */
function evaluateAssessmentSemantics(assessmentData = {}, options = {}) {
  const {
    assessmentId = assessmentData.assessmentId || assessmentData.examId || null,
    grades = assessmentData.grades || [],
    maxScore = 20,
    passThreshold = 10,
    expectedSchoolId = null
  } = options;

  if (!Array.isArray(grades) || grades.length === 0) {
    return {
      metric_id: METRIC_REGISTRY.ASSESSMENT_QUALITY.id,
      version: METRIC_REGISTRY.ASSESSMENT_QUALITY.version,
      assessment_id: assessmentId,
      total_examinees: 0,
      difficulty_index: null,
      difficulty_classification: 'NO_DATA',
      discrimination_index: null,
      discrimination_quality: 'NO_DATA',
      pass_rate: null,
      mean_score: null,
      data_quality: { status: 'NO_DATA', completeness: 0 }
    };
  }

  enforceTenantIsolation(grades, expectedSchoolId);

  const scores = [];
  for (let i = 0; i < grades.length; i++) {
    const g = grades[i];
    const s = parseValidScore(g ? g.score : null, (g && g.max_score) || maxScore);
    if (s !== null) scores.push(s);
  }

  const n = scores.length;
  if (n === 0) {
    return {
      metric_id: METRIC_REGISTRY.ASSESSMENT_QUALITY.id,
      version: METRIC_REGISTRY.ASSESSMENT_QUALITY.version,
      assessment_id: assessmentId,
      total_examinees: 0,
      difficulty_index: null,
      difficulty_classification: 'NO_DATA',
      discrimination_index: null,
      discrimination_quality: 'NO_DATA',
      pass_rate: null,
      mean_score: null,
      data_quality: { status: 'ALL_INVALID', completeness: 0 }
    };
  }

  scores.sort((a, b) => a - b);

  const sum = scores.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const difficultyIndex = roundTo(mean / 20, 3); // نسبت به سقف 20

  let diffClass = 'BALANCED';
  if (difficultyIndex < 0.45) {
    diffClass = 'HARD';
  } else if (difficultyIndex > 0.75) {
    diffClass = 'EASY';
  } else {
    diffClass = 'BALANCED';
  }

  // شاخص تمایز (D-index) با گروه بالایی (Top 27%) و پایینی (Bottom 27%)
  let discriminationIndex = null;
  let discQuality = 'ACCEPTABLE';

  const groupSize = Math.max(1, Math.floor(n * 0.27));
  if (n >= 4) {
    const bottomGroup = scores.slice(0, groupSize);
    const topGroup = scores.slice(n - groupSize);

    const bottomMean = bottomGroup.reduce((a, b) => a + b, 0) / groupSize;
    const topMean = topGroup.reduce((a, b) => a + b, 0) / groupSize;

    discriminationIndex = roundTo((topMean - bottomMean) / 20, 3);

    if (discriminationIndex >= 0.40) discQuality = 'EXCELLENT';
    else if (discriminationIndex >= 0.30) discQuality = 'GOOD';
    else if (discriminationIndex >= 0.20) discQuality = 'ACCEPTABLE';
    else discQuality = 'POOR';
  }

  const passedCount = scores.filter(s => s >= passThreshold).length;
  const passRate = roundTo((passedCount / n) * 100, 2);

  return {
    metric_id: METRIC_REGISTRY.ASSESSMENT_QUALITY.id,
    version: METRIC_REGISTRY.ASSESSMENT_QUALITY.version,
    assessment_id: assessmentId,
    total_examinees: n,
    difficulty_index: difficultyIndex,
    difficulty_classification: diffClass,
    discrimination_index: discriminationIndex,
    discrimination_quality: discQuality,
    pass_rate: passRate,
    mean_score: roundTo(mean, 2),
    min_score: scores[0],
    max_score: scores[n - 1],
    data_quality: { status: 'COMPLETE', completeness: 1.0 }
  };
}

/**
 * ۹) وضعیت تکمیل و ارتقای تحصیلی (Completion & Promotion Semantics)
 * ─────────────────────────────────────────────────────────────────
 * ارزیابی شروط ارتقای پایه دانش‌آموز طبق مصوبات آموزش و پرورش.
 */
function evaluateCompletionSemantics(completionData = {}, options = {}) {
  const {
    studentId = completionData.studentId || null,
    subjectGrades = completionData.subjectGrades || [],
    passThreshold = 10.0,
    maxFailedAllowed = 2,
    expectedSchoolId = null
  } = options;

  if (!studentId) {
    const err = new Error('studentId is required for evaluateCompletionSemantics');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  if (!Array.isArray(subjectGrades) || subjectGrades.length === 0) {
    return {
      metric_id: METRIC_REGISTRY.COMPLETION_STATUS.id,
      version: METRIC_REGISTRY.COMPLETION_STATUS.version,
      student_id: studentId,
      total_subjects: 0,
      passed_subjects: 0,
      failed_subjects: 0,
      failed_subject_ids: [],
      gpa: null,
      completion_status: 'INCOMPLETE',
      promotion_eligible: false,
      makeup_exam_required: false,
      data_quality: { status: 'NO_DATA', completeness: 0 }
    };
  }

  enforceTenantIsolation(subjectGrades, expectedSchoolId);

  let totalCoeff = 0;
  let weightedSum = 0;
  let passedCount = 0;
  let failedCount = 0;
  const failedSubjectIds = [];

  for (let i = 0; i < subjectGrades.length; i++) {
    const sub = subjectGrades[i];
    if (!sub) continue;
    const score = parseValidScore(sub.score, sub.max_score || 20);
    if (score === null) continue;

    const coeff = typeof sub.coeff === 'number' && sub.coeff > 0 ? sub.coeff : 1;
    totalCoeff += coeff;
    weightedSum += score * coeff;

    if (score >= passThreshold) {
      passedCount++;
    } else {
      failedCount++;
      failedSubjectIds.push(sub.subject_id || sub.id || `sub_${i}`);
    }
  }

  const validSubjectsCount = passedCount + failedCount;
  if (validSubjectsCount === 0) {
    return {
      metric_id: METRIC_REGISTRY.COMPLETION_STATUS.id,
      version: METRIC_REGISTRY.COMPLETION_STATUS.version,
      student_id: studentId,
      total_subjects: 0,
      passed_subjects: 0,
      failed_subjects: 0,
      failed_subject_ids: [],
      gpa: null,
      completion_status: 'INCOMPLETE',
      promotion_eligible: false,
      makeup_exam_required: false,
      data_quality: { status: 'ALL_INVALID', completeness: 0 }
    };
  }

  const gpa = totalCoeff > 0 ? roundTo(weightedSum / totalCoeff, 2) : 0;

  let completionStatus = 'PASSED';
  let promotionEligible = false;

  if (failedCount === 0) {
    completionStatus = 'PASSED';
    promotionEligible = true;
  } else if (failedCount <= maxFailedAllowed && gpa >= passThreshold) {
    completionStatus = 'CONDITIONAL';
    promotionEligible = true; // قبولی با درس تجدیدی / تبصره
  } else {
    completionStatus = 'FAILED';
    promotionEligible = false;
  }

  return {
    metric_id: METRIC_REGISTRY.COMPLETION_STATUS.id,
    version: METRIC_REGISTRY.COMPLETION_STATUS.version,
    student_id: studentId,
    total_subjects: validSubjectsCount,
    passed_subjects: passedCount,
    failed_subjects: failedCount,
    failed_subject_ids: failedSubjectIds,
    gpa,
    completion_status: completionStatus,
    promotion_eligible: promotionEligible,
    makeup_exam_required: failedCount > 0,
    data_quality: {
      status: 'COMPLETE',
      completeness: roundTo(validSubjectsCount / subjectGrades.length, 3)
    }
  };
}

/**
 * ۱۰) خلاصه فعالیت‌های آموزشی (Educational Activity Summary)
 * ─────────────────────────────────────────────────────────────────
 * تجمیع آماری فعالیت‌های آموزشی برای سطوح دانش‌آموز، معلم و مدرسه.
 */
function generateEducationalActivitySummary(activityData = {}, options = {}) {
  const {
    scope = activityData.scope || 'school',
    attendance = activityData.attendance || [],
    grades = activityData.grades || [],
    startDate = activityData.startDate || null,
    endDate = activityData.endDate || null,
    expectedSchoolId = null
  } = options;

  enforceTenantIsolation(attendance, expectedSchoolId);
  enforceTenantIsolation(grades, expectedSchoolId);

  const startTs = startDate ? new Date(startDate).getTime() : 0;
  const endTs = endDate ? new Date(endDate).getTime() : Infinity;

  const inPeriod = item => {
    if (!item) return false;
    const t = item.date ? new Date(item.date).getTime() : (item.created_at ? new Date(item.created_at).getTime() : null);
    if (t === null || isNaN(t)) return true;
    return t >= startTs && t <= endTs;
  };

  const filteredAttendance = attendance.filter(inPeriod);
  const filteredGrades = grades.filter(inPeriod);

  const activeDates = new Set();
  const activeStudents = new Set();
  const activeTeachers = new Set();

  for (let i = 0; i < filteredAttendance.length; i++) {
    const a = filteredAttendance[i];
    if (a.date) activeDates.add(a.date);
    if (a.student_id) activeStudents.add(a.student_id);
  }

  for (let i = 0; i < filteredGrades.length; i++) {
    const g = filteredGrades[i];
    if (g.date) activeDates.add(g.date);
    if (g.student_id) activeStudents.add(g.student_id);
    if (g.teacher_id) activeTeachers.add(g.teacher_id);
  }

  const attRes = calculateAttendanceRate(filteredAttendance, { formula: 'calendar', expectedSchoolId });
  const gradeRes = calculateGradeDistribution(filteredGrades, { expectedSchoolId });

  const totalActions = filteredAttendance.length + filteredGrades.length;
  let status = 'ACTIVE';
  if (totalActions === 0) status = 'INACTIVE';
  else if (totalActions < 5) status = 'LOW_ACTIVITY';

  return {
    metric_id: METRIC_REGISTRY.EDUCATIONAL_ACTIVITY_SUMMARY.id,
    version: METRIC_REGISTRY.EDUCATIONAL_ACTIVITY_SUMMARY.version,
    scope,
    period: { start_date: startDate, end_date: endDate },
    summary_counts: {
      total_actions: totalActions,
      attendance_records: filteredAttendance.length,
      grades_logged: filteredGrades.length,
      active_days: activeDates.size,
      active_students: activeStudents.size,
      active_teachers: activeTeachers.size
    },
    metrics_summary: {
      attendance_rate: attRes.value,
      mean_grade: gradeRes.mean,
      median_grade: gradeRes.median
    },
    activity_status: status,
    data_quality: {
      status: totalActions > 0 ? 'COMPLETE' : 'NO_DATA',
      completeness: totalActions > 0 ? 1.0 : 0
    }
  };
}

/**
 * ۱۱) سازنده کوئری‌های پایگاه‌داده حافظِ Partition Pruning و Tenant Isolation
 */
function buildAttendanceKpiQuery(params = {}) {
  const {
    schoolId,
    startDate,
    endDate,
    classId,
    studentId
  } = params;

  if (!schoolId) {
    const err = new Error('schoolId is required to preserve tenant isolation in attendance query');
    err.code = 'MISSING_TENANT_ID';
    throw err;
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
  if (studentId) {
    conditions.push(`student_id = $${idx++}`);
    values.push(Number(studentId));
  }

  const sql = `
    SELECT
      id, school_id, student_id, class_id, status, late_minutes, date, created_at
    FROM attendance
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at ASC
  `.trim();

  return { sql, values, target_table: 'attendance', partition_pruning_enabled: Boolean(startDate || endDate) };
}

function buildGradesKpiQuery(params = {}) {
  const {
    schoolId,
    startDate,
    endDate,
    classId,
    subjectId,
    studentId
  } = params;

  if (!schoolId) {
    const err = new Error('schoolId is required to preserve tenant isolation in grades query');
    err.code = 'MISSING_TENANT_ID';
    throw err;
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
  if (studentId) {
    conditions.push(`student_id = $${idx++}`);
    values.push(Number(studentId));
  }

  const sql = `
    SELECT
      id, school_id, student_id, class_id, subject_id, score, max_score, date, created_at
    FROM grades
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at ASC
  `.trim();

  return { sql, values, target_table: 'grades', partition_pruning_enabled: Boolean(startDate || endDate) };
}

module.exports = {
  METRIC_REGISTRY,
  calculateAttendanceRate,
  calculateChronicAbsence,
  calculateGradeDistribution,
  calculateLearningProgressTrend,
  calculateSchoolEducationalHealth,
  evaluateLearnerProgress,
  evaluateCourseEngagement,
  evaluateAssessmentSemantics,
  evaluateCompletionSemantics,
  generateEducationalActivitySummary,
  buildAttendanceKpiQuery,
  buildGradesKpiQuery,
  parseValidScore,
  roundTo,
  enforceTenantIsolation
};
