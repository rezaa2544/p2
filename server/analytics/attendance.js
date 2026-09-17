/* ═══════════════════════════════════════════════════════════════════
   server/analytics/attendance.js — Attendance Analytics Foundation (P0-EI-04)
   -------------------------------------------------------------------
   Educational Intelligence Foundation:
   - Standardized Attendance Rate & Punctuality Index
   - Chronic Absence & Consecutive Absence Streaks (Truancy Early Warning)
   - Day-of-Week Temporal Trends (Saturday–Wednesday)
   - Attendance Data Quality Score (Completeness, Validity, Consistency, Freshness)
   - Partition-pruning Query Builder for Partitioned `attendance` table
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const {
  calculateAttendanceRate,
  calculateChronicAbsence,
  roundTo,
  enforceTenantIsolation
} = require('./semantic');

/**
 * اعتبارسنجی مقادیر مجاز وضعیت حضور و غیاب
 */
const VALID_STATUSES = new Set([
  'present', 'absent', 'late', 'excused', 'unexcused', 'leave',
  'حاضر', 'غایب', 'تاخیر', 'تأخیر', 'موجه', 'غیرموجه', 'مرخصی'
]);

/**
 * تحلیل آماری وقت‌شناسی و تأخیرها (Punctuality & Lateness Analytics)
 */
function calculatePunctualityMetrics(options = {}) {
  const {
    attendance = [],
    expectedSchoolId = null
  } = options;

  if (expectedSchoolId != null) {
    enforceTenantIsolation(attendance, expectedSchoolId, 'calculatePunctualityMetrics');
  }

  if (!Array.isArray(attendance) || attendance.length === 0) {
    return {
      metric: 'PUNCTUALITY_METRICS',
      version: '1.0.0',
      total_sessions: 0,
      late_sessions: 0,
      total_late_minutes: 0,
      avg_late_minutes: 0,
      punctuality_rate: 1.0,
      punctuality_percentage: 100.0,
      status: 'NO_DATA'
    };
  }

  let totalSessions = 0;
  let lateSessions = 0;
  let totalLateMinutes = 0;

  for (const rec of attendance) {
    if (!rec) continue;
    totalSessions++;
    const st = String(rec.status || '').toLowerCase().trim();
    const isLate = st === 'late' || st === 'تاخیر' || st === 'تأخیر' || (rec.late_minutes && Number(rec.late_minutes) > 0);

    if (isLate) {
      lateSessions++;
      const mins = Number(rec.late_minutes || rec.delay_minutes || 15);
      totalLateMinutes += !isNaN(mins) && mins > 0 ? mins : 15;
    }
  }

  const avgLateMinutes = lateSessions > 0 ? roundTo(totalLateMinutes / lateSessions, 1) : 0;
  const punctualityRate = totalSessions > 0 ? roundTo(Math.max(0, 1 - (lateSessions / totalSessions)), 4) : 1.0;

  return {
    metric: 'PUNCTUALITY_METRICS',
    version: '1.0.0',
    total_sessions: totalSessions,
    late_sessions: lateSessions,
    total_late_minutes: totalLateMinutes,
    avg_late_minutes: avgLateMinutes,
    punctuality_rate: punctualityRate,
    punctuality_percentage: roundTo(punctualityRate * 100, 2),
    status: punctualityRate >= 0.95 ? 'EXCELLENT' : (punctualityRate >= 0.85 ? 'GOOD' : 'NEEDS_ATTENTION')
  };
}

/**
 * کشف توالی غیبت‌های متوالی (Consecutive Absence Streaks)
 * شناسایی سریع دانش‌آموزانی که بدون دلیل چند جلسه پی‌درپی غایب بوده‌اند
 */
function detectAbsenceStreaks(options = {}) {
  const {
    attendance = [],
    streakThreshold = 3,
    expectedSchoolId = null
  } = options;

  if (expectedSchoolId != null) {
    enforceTenantIsolation(attendance, expectedSchoolId, 'detectAbsenceStreaks');
  }

  // مرتب‌سازی زمانی رکوردها به ازای هر دانش‌آموز
  const studentRecords = new Map();
  for (const rec of attendance) {
    if (!rec || rec.student_id == null) continue;
    const sid = Number(rec.student_id);
    if (!studentRecords.has(sid)) studentRecords.set(sid, []);
    studentRecords.get(sid).push(rec);
  }

  const streakAlerts = [];

  for (const [studentId, records] of studentRecords.entries()) {
    records.sort((a, b) => new Date(a.date || a.created_at || 0) - new Date(b.date || b.created_at || 0));

    let currentStreak = 0;
    let maxStreak = 0;
    let streakStartDate = null;
    let streakEndDate = null;

    for (const r of records) {
      const st = String(r.status || '').toLowerCase().trim();
      const isAbsent = st === 'absent' || st === 'غایب' || st === 'unexcused' || st === 'غیرموجه';

      if (isAbsent) {
        if (currentStreak === 0) streakStartDate = r.date || r.created_at;
        currentStreak++;
        streakEndDate = r.date || r.created_at;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    }

    if (maxStreak >= streakThreshold) {
      streakAlerts.push({
        student_id: studentId,
        consecutive_absences: maxStreak,
        current_streak: currentStreak,
        start_date: streakStartDate,
        end_date: streakEndDate,
        severity: maxStreak >= 5 ? 'CRITICAL' : 'WARNING',
        intervention_recommended: true
      });
    }
  }

  return {
    metric: 'ABSENCE_STREAKS',
    version: '1.0.0',
    total_evaluated_students: studentRecords.size,
    streak_threshold: streakThreshold,
    alerts_count: streakAlerts.length,
    alerts: streakAlerts.sort((a, b) => b.consecutive_absences - a.consecutive_absences)
  };
}

/**
 * توزیع زمانی غیبت بر مبنای روزهای هفته (Day-of-Week Temporal Trends)
 * روزهای استاندارد سال تحصیلی در ایران: شنبه (Saturday) تا چهارشنبه (Wednesday)
 */
function calculateDayOfWeekPatterns(options = {}) {
  const {
    attendance = [],
    expectedSchoolId = null
  } = options;

  if (expectedSchoolId != null) {
    enforceTenantIsolation(attendance, expectedSchoolId, 'calculateDayOfWeekPatterns');
  }

  // 0: Sunday, 1: Monday, 2: Tuesday, 3: Wednesday, 4: Thursday, 5: Friday, 6: Saturday
  const dayNames = {
    6: 'شنبه',
    0: 'یک‌شنبه',
    1: 'دوشنبه',
    2: 'سه‌شنبه',
    3: 'چهارشنبه',
    4: 'پنج‌شنبه',
    5: 'جمعه'
  };

  const dayStats = {};
  for (const d of [6, 0, 1, 2, 3, 4]) {
    dayStats[d] = { day_name: dayNames[d], total: 0, absent: 0, late: 0, present: 0 };
  }

  for (const r of attendance) {
    if (!r || !r.date) continue;
    const dt = new Date(r.date);
    if (isNaN(dt.getTime())) continue;
    const day = dt.getDay();
    if (!dayStats[day]) continue;

    dayStats[day].total++;
    const st = String(r.status || '').toLowerCase().trim();
    if (st === 'absent' || st === 'غایب' || st === 'unexcused' || st === 'غیرموجه' || st === 'excused' || st === 'موجه') {
      dayStats[day].absent++;
    } else if (st === 'late' || st === 'تاخیر' || st === 'تأخیر') {
      dayStats[day].late++;
    } else {
      dayStats[day].present++;
    }
  }

  const breakdown = [];
  let highestAbsentDay = null;
  let maxAbsenceRate = -1;

  for (const d of [6, 0, 1, 2, 3, 4]) {
    const s = dayStats[d];
    const absRate = s.total > 0 ? roundTo(s.absent / s.total, 4) : 0;
    if (absRate > maxAbsenceRate && s.total > 0) {
      maxAbsenceRate = absRate;
      highestAbsentDay = s.day_name;
    }
    breakdown.push({
      day_index: d,
      day_name: s.day_name,
      total_sessions: s.total,
      absent_count: s.absent,
      late_count: s.late,
      present_count: s.present,
      absence_rate: absRate,
      absence_percentage: roundTo(absRate * 100, 2)
    });
  }

  return {
    metric: 'DAY_OF_WEEK_ATTENDANCE_PATTERNS',
    version: '1.0.0',
    breakdown,
    highest_absence_day: highestAbsentDay,
    max_absence_rate: maxAbsenceRate > -1 ? maxAbsenceRate : 0
  };
}

/**
 * امتیاز کیفیت داده حضور و غیاب (Attendance Data Quality Score - DQS)
 * ارزیابی ۴ بعد:
 * ۱. کامل بودن (Completeness): پوشش دانش‌آموزان ثبت‌نام‌شده
 * ۲. اعتبار (Validity): مقادیر وضعیت مجاز
 * ۳. سازگاری (Consistency): ارجاع به دانش‌آموزان و کلاس‌های معتبر
 * ۴. تازگی (Freshness): ثبت روزانه و عدم تاخیر در درج رکورد
 */
function calculateAttendanceDataQuality(options = {}) {
  const {
    attendance = [],
    enrollments = [],
    expectedSchoolId = null
  } = options;

  if (expectedSchoolId != null) {
    enforceTenantIsolation(attendance, expectedSchoolId, 'calculateAttendanceDataQuality:attendance');
    enforceTenantIsolation(enrollments, expectedSchoolId, 'calculateAttendanceDataQuality:enrollments');
  }

  if (!Array.isArray(attendance) || attendance.length === 0) {
    return {
      metric: 'ATTENDANCE_DATA_QUALITY',
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

  // ۱. ارزیابی اعتبار وضعیت‌ها (Validity)
  let validStatusCount = 0;
  for (const r of attendance) {
    const st = String(r.status || '').toLowerCase().trim();
    if (VALID_STATUSES.has(st)) validStatusCount++;
  }
  const validity = attendance.length > 0 ? roundTo(validStatusCount / attendance.length, 4) : 0;

  // ۲. کامل بودن بر مبنای دانش‌آموزان ثبت‌نامی (Completeness)
  const enrolledStudentIds = new Set(
    enrollments.map(e => Number(e.student_id)).filter(id => !isNaN(id) && id > 0)
  );
  const recordedStudentIds = new Set(
    attendance.map(a => Number(a.student_id)).filter(id => !isNaN(id) && id > 0)
  );

  let completeness = 1.0;
  if (enrolledStudentIds.size > 0) {
    let covered = 0;
    for (const sid of enrolledStudentIds) {
      if (recordedStudentIds.has(sid)) covered++;
    }
    completeness = roundTo(covered / enrolledStudentIds.size, 4);
  }

  // ۳. ارزیابی سازگاری ارجاعات (Consistency)
  let consistentCount = 0;
  for (const r of attendance) {
    if (r.student_id != null && !isNaN(Number(r.student_id)) && r.class_id != null) {
      consistentCount++;
    }
  }
  const consistency = attendance.length > 0 ? roundTo(consistentCount / attendance.length, 4) : 0;

  // ۴. تازگی و سرعت ثبت (Freshness)
  let promptCount = 0;
  for (const r of attendance) {
    if (!r.created_at || !r.date) {
      promptCount++;
      continue;
    }
    const tCreate = new Date(r.created_at).getTime();
    const tDate = new Date(r.date).getTime();
    if (isNaN(tCreate) || isNaN(tDate)) {
      promptCount++;
      continue;
    }
    const diffDays = Math.max(0, Math.round((tCreate - tDate) / (1000 * 60 * 60 * 24)));
    if (diffDays <= 2) promptCount++;
  }
  const freshness = attendance.length > 0 ? roundTo(promptCount / attendance.length, 4) : 0;

  // محاسبه نمره مرکب DQS (وزن‌ها: اعتبار ۳۰٪، کامل بودن ۳۵٪، سازگاری ۲۰٪، تازگی ۱۵٪)
  const compositeRatio = roundTo(
    0.30 * validity +
    0.35 * completeness +
    0.20 * consistency +
    0.15 * freshness,
    4
  );
  const compositeDqs = roundTo(compositeRatio * 100, 1);

  let confidenceLevel = 'LOW';
  if (compositeDqs >= 85) confidenceLevel = 'HIGH';
  else if (compositeDqs >= 65) confidenceLevel = 'MEDIUM';

  return {
    metric: 'ATTENDANCE_DATA_QUALITY',
    version: '1.0.0',
    composite_dqs: compositeDqs,
    confidence_level: confidenceLevel,
    completeness: roundTo(completeness * 100, 1),
    validity: roundTo(validity * 100, 1),
    consistency: roundTo(consistency * 100, 1),
    freshness: roundTo(freshness * 100, 1),
    sample_size: attendance.length
  };
}

/**
 * گزارش تحلیلی جامع حضور و غیاب (Attendance Analytics Report)
 * ارکستراسیون شاخص‌های حضور، وقت‌شناسی، غیبت مزمن، توالی‌های بحرانی و کیفیت داده
 */
function buildAttendanceAnalyticsReport(options = {}) {
  const {
    attendance = [],
    enrollments = [],
    classId = null,
    minRequiredSessions = 5,
    streakThreshold = 3,
    expectedSchoolId = null
  } = options;

  if (expectedSchoolId != null) {
    enforceTenantIsolation(attendance, expectedSchoolId, 'buildAttendanceAnalyticsReport:attendance');
    enforceTenantIsolation(enrollments, expectedSchoolId, 'buildAttendanceAnalyticsReport:enrollments');
  }

  // ۱. نرخ حضور رسمی (Semantic Attendance Rate)
  const calMetrics = calculateAttendanceRate(attendance, {
    formula: 'calendar',
    lateWeight: 0.5,
    expectedSchoolId
  });
  const netMetrics = calculateAttendanceRate(attendance, {
    formula: 'net',
    lateWeight: 0.5,
    expectedSchoolId
  });

  // ۲. تحلیل غیبت مزمن رسمی (Chronic Absence Rate)
  const chronicMetrics = calculateChronicAbsence(attendance, {
    threshold: 0.10,
    minRequiredSessions,
    expectedSchoolId
  });

  // ۳. تحلیل وقت‌شناسی و تاخیرها (Punctuality)
  const punctuality = calculatePunctualityMetrics({
    attendance,
    expectedSchoolId
  });

  // ۴. توالی غیبت‌های متوالی (Streaks)
  const streaks = detectAbsenceStreaks({
    attendance,
    streakThreshold,
    expectedSchoolId
  });

  // ۵. الگوهای روزهای هفته (Day of Week Patterns)
  const dayPatterns = calculateDayOfWeekPatterns({
    attendance,
    expectedSchoolId
  });

  // ۶. ارزیابی امتیاز کیفیت داده (Data Quality)
  const dataQuality = calculateAttendanceDataQuality({
    attendance,
    enrollments,
    expectedSchoolId
  });

  return {
    report_type: 'ATTENDANCE_ANALYTICS_FOUNDATION',
    version: '1.0.0',
    target: {
      class_id: classId ? Number(classId) : null,
      school_id: expectedSchoolId ? Number(expectedSchoolId) : null
    },
    attendance_rate: {
      calendar_rate: calMetrics.value != null ? roundTo(calMetrics.value / 100, 4) : null,
      calendar_percentage: calMetrics.value,
      net_rate: netMetrics.value != null ? roundTo(netMetrics.value / 100, 4) : null,
      net_percentage: netMetrics.value,
      total_sessions: calMetrics.sample_size,
      present_count: calMetrics.counts ? calMetrics.counts.present : 0,
      absent_count: calMetrics.counts ? calMetrics.counts.absent : 0,
      late_count: calMetrics.counts ? calMetrics.counts.late : 0,
      excused_absence_count: calMetrics.counts ? calMetrics.counts.excused : 0
    },
    chronic_absence: {
      chronic_absence_rate: chronicMetrics.chronic_absence_rate,
      chronic_absence_percentage: chronicMetrics.chronic_absence_percentage,
      chronic_students_count: chronicMetrics.chronic_students_count,
      eligible_students_count: chronicMetrics.eligible_students_count,
      chronic_student_ids: chronicMetrics.chronic_student_ids
    },
    punctuality: {
      punctuality_rate: punctuality.punctuality_rate,
      late_sessions: punctuality.late_sessions,
      total_late_minutes: punctuality.total_late_minutes,
      avg_late_minutes: punctuality.avg_late_minutes,
      status: punctuality.status
    },
    early_warning_streaks: {
      streak_alerts_count: streaks.alerts_count,
      alerts: streaks.alerts
    },
    temporal_trends: {
      highest_absence_day: dayPatterns.highest_absence_day,
      day_breakdown: dayPatterns.breakdown
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
 * سازنده کوئری حضور با بهره‌گیری از هرس پارتیشن‌ها (Partition Pruning)
 * شرط school_id الزامی و fail-closed است
 */
function buildAttendanceAnalyticsQuery(filters = {}) {
  const { schoolId, classId, studentId, startDate, endDate } = filters;

  if (schoolId == null || isNaN(Number(schoolId))) {
    throw new Error('TENANT_ISOLATION_VIOLATION: schoolId is required for attendance analytics query');
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

  return {
    sql,
    values,
    target_table: 'attendance',
    partition_pruning_enabled: Boolean(startDate || endDate)
  };
}

module.exports = {
  calculatePunctualityMetrics,
  detectAbsenceStreaks,
  calculateDayOfWeekPatterns,
  calculateAttendanceDataQuality,
  buildAttendanceAnalyticsReport,
  buildAttendanceAnalyticsQuery
};
