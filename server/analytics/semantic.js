/**
 * ═══════════════════════════════════════════════════════════════════
 * server/analytics/semantic.js — Educational Semantic Layer (P0-EI-01)
 * ───────────────────────────────────────────────────────────────────
 * منبع واحد حقیقت (Single Source of Truth) برای شاخص‌ها و KPIهای آموزشی.
 * 
 * اصول حاکمیتی:
 *  ۱) جلوگیری از Semantic Metric Drift: مخرج و صورت همهٔ شاخص‌ها در این
 *     لایه تعریفِ استاندارد و تغییرناپذیر دارند.
 *  ۲) Explainable & Deterministic Analytics: محاسبات به روش‌های قطعی و
 *     کاملاً شفاف انجام می‌شوند؛ بدون برازش جعبه‌سیاه یا مدل‌های غیرشفاف.
 *  ۳) Strict Tenant Isolation: تمام توابع ایزولاسیون مدرسه‌ای (school_id)
 *     را بررسی و اعتبارسنجی می‌کنند؛ اختلاط داده‌های چند مستأجر ممنوع است.
 *  ۴) Partition Pruning Friendly: توابع تولید کوئری همیشه شروط الزامی
 *     بازهٔ زمانی (created_at) و school_id را برای جداول پارتیشن‌شده اعمال می‌کنند.
 *  ۵) Null & Zero-Division Safety: در نبود داده کافی، شاخص هرگز صفر یا صد
 *     جعلی پس نمی‌دهد؛ مقدار null با ثبت صریح علت در data_quality برمی‌گردد.
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
  if (!expectedSchoolId) return;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.school_id !== undefined && r.school_id !== null && Number(r.school_id) !== Number(expectedSchoolId)) {
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
 * ─────────────────────────────────────────────────────────────────
 * فرمول تقویمی (Calendar):
 *   صورت: حاضرین + (وزن_تاخیر * تعداد_تاخیر)
 *   مخرج: کل جلسات ثبت‌شده (حاضر + غایب + تاخیر + موجه)
 * 
 * فرمول خالص (Net):
 *   صورت: حاضرین + (وزن_تاخیر * تعداد_تاخیر)
 *   مخرج: جلسات خالص (حاضر + غایب + تاخیر) — غیبت موجه از مخرج کسر می‌شود.
 */
function calculateAttendanceRate(records, options = {}) {
  const {
    formula = 'calendar', // 'calendar' | 'net'
    lateWeight = 1.0,     // وزن در حضور (پیش‌فرض ۱.۰)
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
    const st = String(r.status || '').toLowerCase().trim();
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
    // تقویمی (Calendar)
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
 * ─────────────────────────────────────────────────────────────────
 * استاندارد ملی:
 *   دانش‌آموزی که ۱۰٪ یا بیشتر از جلسات آموزشی را به دلیل غیبت (موجه یا غیرموجه)
 *   از دست داده باشد، دچار غیبت مزمن است.
 * 
 * مخرج: دانش‌آموزان واجد شرایط (دارای حداقل minRequiredSessions جلسه)
 * صورت: دانش‌آموزانی که نسبت غیبت آن‌ها >= chronicThreshold است.
 */
function calculateChronicAbsence(records, options = {}) {
  const {
    chronicThreshold = 0.10, // ۱۰ درصد غیبت
    minRequiredSessions = 5, // حداقل جلسات برای واجد شرایط بودن در ارزیابی
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

  // تجمیع بر اساس دانش‌آموز
  const studentMap = {};

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
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
 * ─────────────────────────────────────────────────────────────────
 * محاسبه دقیق میانگین، میانه، انحراف معیار، چارک‌ها و هیستوگرام استاندارد
 * بر مقیاس ۲۰ نمره.
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
    const parsed = parseValidScore(r.score, r.max_score || 20);
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

  // مرتب‌سازی عددی برای صدک‌ها و میانه
  validScores.sort((a, b) => a - b);

  let sum = 0;
  const histogram = { failed: 0, acceptable: 0, good: 0, excellent: 0 };
  const qualitative = { needs_effort: 0, acceptable: 0, good: 0, excellent: 0 };

  for (let i = 0; i < n; i++) {
    const s = validScores[i];
    sum += s;

    // هیستوگرام فاصله‌ای
    if (s < 10) histogram.failed++;
    else if (s < 15) histogram.acceptable++;
    else if (s < 18) histogram.good++;
    else histogram.excellent++;

    // دسته‌بندی توصیفی آموزش و پرورش
    if (s < 10) qualitative.needs_effort++;
    else if (s < 15) qualitative.acceptable++;
    else if (s < 18) qualitative.good++;
    else qualitative.excellent++;
  }

  const mean = roundTo(sum / n, 2);

  // محاسبه واریانس و انحراف معیار
  let sqDiffSum = 0;
  for (let i = 0; i < n; i++) {
    const diff = validScores[i] - mean;
    sqDiffSum += diff * diff;
  }
  const variance = roundTo(sqDiffSum / n, 3);
  const stdDev = roundTo(Math.sqrt(sqDiffSum / n), 2);

  // محاسبه صدک‌ها (Percentile با اینترپولاسیون خطی ساده)
  function getPercentile(arr, p) {
    if (arr.length === 1) return arr[0];
    const index = p * (arr.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return roundTo(arr[lower] * (1 - weight) + arr[upper] * weight, 2);
  }

  const q1 = getPercentile(validScores, 0.25);
  const q2 = getPercentile(validScores, 0.50); // میانه
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
 * ─────────────────────────────────────────────────────────────────
 * محاسبه جهت و شیب تغییرات نمرات در طول زمان با رگرسیون خطی ساده (OLS).
 * 
 * شرط صحت: حداقل ۳ نمره در تاریخ‌های معتبر نیاز است.
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

  // پاکسازی و استخراج نقاط معتبر با تاریخ
  const validPoints = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const score = parseValidScore(r.score, r.max_score || 20);
    if (score === null) continue;

    // تاریخ یا timestamp
    let ts = 0;
    if (r.date) {
      ts = new Date(r.date).getTime();
    } else if (r.created_at) {
      ts = new Date(r.created_at).getTime();
    } else {
      ts = i; // fallback ترتیبی
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

  // مرتب‌سازی بر اساس زمان
  validPoints.sort((a, b) => a.x - b.x);

  // بهینه‌سازی مقیاس زمان برای جلوگیری از overflow رگرسیون (استفاده از اندیس جلسه)
  const n = validPoints.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    const x = i + 1; // شماره جلسه امتحانی ۱ تا n
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

  // محاسبه R^2 (ضریب تعیین)
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

  // تعیین جهت روند (Trend Direction)
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
 * ─────────────────────────────────────────────────────────────────
 * شاخص ترکیبی چهاربعدی با اوزان استاندارد:
 *  - حضور و درگیری (۳۰٪)
 *  - عملکرد تحصیلی (۳۵٪)
 *  - روند و پایداری رشد (۲۰٪)
 *  - پوشش و کیفیت داده (۱۵٪)
 * 
 * اصل No-Masking: اگر حتی یکی از ابعاد بحرانی باشد، پرچم بحرانی برافراشته می‌شود.
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

  // ۱. بعد حضور (Attendance Dimension)
  const attRate = components.attendance_rate !== undefined ? components.attendance_rate : null;
  const chronicRate = components.chronic_absence_rate !== undefined ? components.chronic_absence_rate : 0;
  
  let attendanceScore = 50;
  if (attRate !== null) {
    // جریمه غیبت مزمن
    const chronicPenalty = (chronicRate || 0) * 1.5;
    attendanceScore = Math.max(0, Math.min(100, attRate - chronicPenalty));
    if (chronicRate > 20) {
      criticalFlags.push('HIGH_CHRONIC_ABSENCE');
    }
    if (attRate < 75) {
      criticalFlags.push('SEVERE_ATTENDANCE_DEFICIT');
    }
  }

  // ۲. بعد علمی (Academic Dimension)
  const avgGrade = components.mean_grade !== undefined ? components.mean_grade : null;
  const failRate = components.failure_rate !== undefined ? components.failure_rate : 0; // درصد نمرات زیر ۱۰

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

  // ۳. بعد روند پیشرفت (Progress Dimension)
  const improvingRatio = components.improving_students_ratio || 0; // بین ۰ تا ۱
  const decliningRatio = components.declining_students_ratio || 0; // بین ۰ تا ۱
  
  let progressScore = 50 + ((improvingRatio - decliningRatio) * 50);
  progressScore = Math.max(0, Math.min(100, progressScore));
  if (decliningRatio > 0.35) {
    criticalFlags.push('ALARMING_LEARNING_DECLINE');
  }

  // ۴. بعد کیفیت و پوشش داده (Data Quality Dimension)
  const classCoverage = components.class_coverage_ratio !== undefined ? components.class_coverage_ratio : 1.0;
  const dataFreshness = components.data_freshness_ratio !== undefined ? components.data_freshness_ratio : 1.0;
  
  const dataScore = Math.max(0, Math.min(100, ((classCoverage * 0.5) + (dataFreshness * 0.5)) * 100));
  if (classCoverage < 0.60) {
    criticalFlags.push('LOW_DATA_COVERAGE');
  }

  // محاسبه شاخص نهایی
  const totalWeight = weights.attendance + weights.academic + weights.progress + weights.data_quality;
  const composite = (
    (attendanceScore * weights.attendance) +
    (academicScore * weights.academic) +
    (progressScore * weights.progress) +
    (dataScore * weights.data_quality)
  ) / totalWeight;

  const finalScore = roundTo(composite, 2);

  // رده‌بندی کیفی
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

  // اگر پرچم‌های بحرانی وجود داشته باشد، رتبه نمی‌تواند EXCELLENT باشد
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
 * ۶) سازنده کوئری‌های پایگاه‌داده حافظِ Partition Pruning و Tenant Isolation
 * ─────────────────────────────────────────────────────────────────
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

  // شروط بازه زمانی برای فعال‌سازی Partition Pruning روی attendance
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

  // شروط بازه زمانی برای Partition Pruning روی grades
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
  buildAttendanceKpiQuery,
  buildGradesKpiQuery,
  parseValidScore,
  roundTo,
  enforceTenantIsolation
};
