/* ═══════════════════════════════════════════════════════════════════
   server/analytics/attendance-intelligence.js — Attendance Intelligence Engine (P0-EI-04)
   -------------------------------------------------------------------
   Educational Intelligence Foundation:
   - 1) analyzeAttendanceQuality (Completeness, Validity, Freshness, Consistency, Reliability Score)
   - 2) detectAttendanceRisk (Chronic Absence, Consecutive Streaks, Scattered Patterns, Temporal Decline)
   - 3) analyzeWeeklyAttendancePattern (Saturday-Wednesday Weekday Profiles, Highest Risk Day)
   - 4) analyzeLateArrival (Late Frequency, Average Delay Minutes, Regression Trend, Escalation)
   - 5) generateAttendanceInsights (Actionable Intervention Recommendations)
   - 6) enforceAttendanceTenantIsolation (Fail-Closed Multi-Tenant Guard)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const {
  roundTo,
  enforceTenantIsolation
} = require('./semantic');

/**
 * الگوریتم استاندارد و خالص تبدیل تاریخ شمسی به میلادی
 * Jalali → Gregorian [gy, gm, gd]
 */
const _div = (a, b) => Math.floor(a / b);

function jalaliToGregorian(jy, jm, jd) {
  let y = jy + 1595;
  let days = -355668 + (365 * y) + _div(y, 33) * 8 + _div((y % 33) + 3, 4) + jd
    + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * _div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * _div(--days, 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * _div(days, 1461);
  days %= 1461;
  if (days > 365) { gy += _div(days - 1, 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const sal = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm;
  for (gm = 0; gm < 13 && gd > sal[gm]; gm++) gd -= sal[gm];
  return [gy, gm, gd];
}

/**
 * نگاشت روز هفته جاوااسکریپت (UTC) به نام روز هفته استاندارد تقویم آموزشی
 * 6: شنبه (Saturday)
 * 0: یکشنبه (Sunday)
 * 1: دوشنبه (Monday)
 * 2: سه‌شنبه (Tuesday)
 * 3: چهارشنبه (Wednesday)
 * 4: پنج‌شنبه (Thursday)
 * 5: جمعه (Friday)
 */
const JS_DAY_TO_WEEKDAY = {
  6: 'saturday',
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday'
};

/**
 * استخراج نام روز هفته بر مبنای تاریخ شمسی یا میلادی
 */
function extractWeekday(dateVal) {
  if (!dateVal) return null;
  const s = String(dateVal).trim();

  // اگر روز به صراحت ذکر شده باشد
  const lower = s.toLowerCase();
  if (lower === 'saturday' || lower === 'شنبه') return 'saturday';
  if (lower === 'sunday' || lower === 'یکشنبه') return 'sunday';
  if (lower === 'monday' || lower === 'دوشنبه') return 'monday';
  if (lower === 'tuesday' || lower === 'سه‌شنبه') return 'tuesday';
  if (lower === 'wednesday' || lower === 'چهارشنبه') return 'wednesday';
  if (lower === 'thursday' || lower === 'پنج‌شنبه' || lower === 'پنجشنبه') return 'thursday';
  if (lower === 'friday' || lower === 'جمعه') return 'friday';

  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return JS_DAY_TO_WEEKDAY[d.getUTCDay()] || null;
    }
    return null;
  }

  const y = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);

  if (y < 1700) {
    // تاریخ شمسی
    const [gy, gm, gd] = jalaliToGregorian(y, month, day);
    const dt = new Date(Date.UTC(gy, gm - 1, gd));
    return JS_DAY_TO_WEEKDAY[dt.getUTCDay()] || null;
  } else {
    // تاریخ میلادی
    const dt = new Date(Date.UTC(y, month - 1, day));
    return JS_DAY_TO_WEEKDAY[dt.getUTCDay()] || null;
  }
}

/**
 * گارد ایزولاسیون مستأجران (Fail-Closed Tenant Isolation Guard)
 */
function enforceAttendanceTenantIsolation(records, expectedSchoolId) {
  if (expectedSchoolId == null) return;
  const expected = Number(expectedSchoolId);

  if (Array.isArray(records)) {
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r && r.school_id != null && Number(r.school_id) !== expected) {
        const err = new Error(`Tenant isolation violation: Record school_id (${r.school_id}) does not match expected (${expected})`);
        err.code = 'TENANT_ISOLATION_VIOLATION';
        throw err;
      }
    }
  } else if (records && typeof records === 'object') {
    if (records.school_id != null && Number(records.school_id) !== expected) {
      const err = new Error(`Tenant isolation violation: Record school_id (${records.school_id}) does not match expected (${expected})`);
      err.code = 'TENANT_ISOLATION_VIOLATION';
      throw err;
    }
  }
}

/**
 * نرمال‌سازی وضعیت حضور
 */
function normalizeStatus(st) {
  const s = String(st || '').toLowerCase().trim();
  if (s === 'present' || s === 'حاضر') return 'present';
  if (s === 'late' || s === 'تاخیر' || s === 'تأخیر') return 'late';
  if (s === 'absent' || s === 'غایب' || s === 'unexcused' || s === 'غیرموجه') return 'absent';
  if (s === 'excused' || s === 'موجه') return 'excused';
  return 'unclassified';
}

/**
 * ۱) تحلیل جامع کیفیت و پایایی ثبت حضور (analyzeAttendanceQuality)
 */
function analyzeAttendanceQuality(params = {}, options = {}) {
  const attendance = Array.isArray(params) ? params : (params.attendance || []);
  const students = (params && params.students) || [];
  const schoolId = options.expectedSchoolId != null
    ? options.expectedSchoolId
    : (params && params.school_id != null ? params.school_id : null);

  if (schoolId != null) {
    enforceAttendanceTenantIsolation(attendance, schoolId);
    enforceAttendanceTenantIsolation(students, schoolId);
  }

  const totalRecords = attendance.length;
  if (totalRecords === 0) {
    return {
      completeness: 0,
      validity: 0,
      consistency: 0,
      freshness: 0,
      reliability_score: 0,
      quality_grade: 'POOR',
      total_records: 0,
      expected_sessions: 0,
      unclassified_records: 0
    };
  }

  let validCount = 0;
  let timelyCount = 0;
  let unclassifiedCount = 0;
  const dateCounts = {};

  for (let i = 0; i < totalRecords; i++) {
    const r = attendance[i] || {};
    const st = normalizeStatus(r.status);

    if (st !== 'unclassified') {
      validCount++;
    } else {
      unclassifiedCount++;
    }

    const dateKey = r.date || (r.created_at ? String(r.created_at).slice(0, 10) : 'unknown');
    dateCounts[dateKey] = (dateCounts[dateKey] || 0) + 1;

    // بررسی تازگی (Freshness): ثبت در روز جلسه یا حداکثر در ۲۴ ساعت اولیه
    if (r.created_at && r.date) {
      const dtSession = new Date(r.date);
      const dtCreated = new Date(r.created_at);
      if (!isNaN(dtSession.getTime()) && !isNaN(dtCreated.getTime())) {
        const diffMs = Math.abs(dtCreated.getTime() - dtSession.getTime());
        if (diffMs <= 86400000 * 1.5) { // حداکثر تا ۳۶ ساعت
          timelyCount++;
        }
      } else {
        timelyCount++;
      }
    } else {
      timelyCount++;
    }
  }

  // ۱. شاخص اعتبار (Validity)
  const validity = roundTo((validCount / totalRecords) * 100, 2);

  // ۲. شاخص جامعیت (Completeness)
  const distinctDates = Object.keys(dateCounts).filter(d => d !== 'unknown').length;
  const studentCount = students.length || 1;
  const expectedSessions = options.expectedSessions != null
    ? Number(options.expectedSessions)
    : Math.max(1, distinctDates * studentCount);
  const completeness = roundTo(Math.min(100, (totalRecords / expectedSessions) * 100), 2);

  // ۳. شاخص تازگی (Freshness)
  const freshness = roundTo((timelyCount / totalRecords) * 100, 2);

  // ۴. شاخص ثبات (Consistency)
  const countsArr = Object.values(dateCounts);
  let consistency = 100;
  if (countsArr.length > 1) {
    const mean = countsArr.reduce((a, b) => a + b, 0) / countsArr.length;
    const variance = countsArr.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / countsArr.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? (stdDev / mean) : 0;
    consistency = roundTo(Math.max(0, Math.min(100, 100 - (cv * 50))), 2);
  }

  // امتیاز کلی پایایی (Reliability Score)
  const rawScore = (0.35 * completeness) + (0.25 * validity) + (0.25 * freshness) + (0.15 * consistency);
  const reliabilityScore = roundTo(Math.min(100, Math.max(0, rawScore)), 2);

  let qualityGrade = 'POOR';
  if (reliabilityScore >= 85) qualityGrade = 'EXCELLENT';
  else if (reliabilityScore >= 70) qualityGrade = 'GOOD';
  else if (reliabilityScore >= 50) qualityGrade = 'NEEDS_ATTENTION';

  return {
    completeness,
    validity,
    consistency,
    freshness,
    reliability_score: reliabilityScore,
    quality_grade: qualityGrade,
    total_records: totalRecords,
    expected_sessions: expectedSessions,
    unclassified_records: unclassifiedCount
  };
}

/**
 * ۲) تشخیص و سطح‌بندی ریسک حضور دانش‌آموز (detectAttendanceRisk)
 */
function detectAttendanceRisk(params = {}, options = {}) {
  const attendance = Array.isArray(params) ? params : (params.attendance || []);
  const studentId = params && params.studentId != null
    ? params.studentId
    : (options.studentId != null ? options.studentId : null);
  const expectedSchoolId = options.expectedSchoolId != null
    ? options.expectedSchoolId
    : (params && params.school_id != null ? params.school_id : null);

  if (expectedSchoolId != null) {
    enforceAttendanceTenantIsolation(attendance, expectedSchoolId);
  }

  // فیلتر رکوردهای دانش‌آموز در صورت مشخص بودن شناسه
  let records = attendance;
  if (studentId != null) {
    records = attendance.filter(r => r && Number(r.student_id) === Number(studentId));
  }

  const chronicThreshold = options.chronicThreshold != null ? Number(options.chronicThreshold) : 0.10; // 10%
  const criticalThreshold = options.criticalThreshold != null ? Number(options.criticalThreshold) : 0.20; // 20%
  const minRequiredSessions = options.minRequiredSessions != null ? Number(options.minRequiredSessions) : 5;

  if (records.length === 0) {
    /* A-31 / I-02: بی‌داده هرگز «کم‌ریسک/سالم» تلقی نمی‌شود — نبودِ رکورد
       یعنی «نامشخص»، نه «همه‌چیز خوب». نرخ صفر و ریسک LOW پیشین، دانش‌آموزِ
       بدونِ هیچ ثبتی را سالم‌ترین دانش‌آموز نشان می‌داد (مثبتِ کاذب). */
    return {
      student_id: studentId != null ? Number(studentId) : null,
      risk_level: 'NO_DATA',
      data_status: 'NO_DATA',
      absence_rate: null,
      total_sessions: 0,
      absent_count: 0,
      excused_count: 0,
      late_count: 0,
      consecutive_absent_streak: 0,
      is_chronic: false,
      is_critical: false,
      evidence: ['هیچ رکورد حضور/غیابی برای این دانش‌آموز یافت نشد'],
      periods: []
    };
  }

  // مرتب‌سازی قطعی زمانی رکوردهای دانش‌آموز (Date ASC, ID ASC)
  const sorted = records.slice().sort((a, b) => {
    const tA = a.date || a.created_at || '';
    const tB = b.date || b.created_at || '';
    if (tA < tB) return -1;
    if (tA > tB) return 1;
    return (a.id || 0) - (b.id || 0);
  });

  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  let excusedCount = 0;

  let currentStreak = 0;
  let maxStreak = 0;
  let streakStartDate = null;
  const periods = [];
  const evidence = [];

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i] || {};
    const st = normalizeStatus(r.status);
    const curDate = r.date || (r.created_at ? String(r.created_at).slice(0, 10) : '—');

    if (st === 'present') {
      presentCount++;
      currentStreak = 0;
      streakStartDate = null;
    } else if (st === 'late') {
      lateCount++;
      currentStreak = 0;
      streakStartDate = null;
    } else if (st === 'absent') {
      absentCount++;
      if (currentStreak === 0) {
        streakStartDate = curDate;
      }
      currentStreak++;
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
      }
      if (currentStreak === 3) {
        periods.push({
          type: 'CONSECUTIVE_ABSENCE',
          start_date: streakStartDate,
          end_date: curDate,
          session_count: 3
        });
      }
    } else if (st === 'excused') {
      excusedCount++;
      currentStreak = 0;
      streakStartDate = null;
    }
  }

  const totalSessions = presentCount + lateCount + absentCount + excusedCount;
  const missedSessions = absentCount + excusedCount;
  const absenceRate = totalSessions > 0 ? roundTo((missedSessions / totalSessions) * 100, 2) : 0;

  const isEligible = totalSessions >= minRequiredSessions;
  const isChronic = isEligible && (absenceRate >= (chronicThreshold * 100));
  const isCritical = isEligible && (absenceRate >= (criticalThreshold * 100));

  // بررسی پنجره غیبت‌های پراکنده (Scattered Absences: 5 غیبت در بازه ۱۰ جلسه اخیر)
  let scatteredDetected = false;
  if (sorted.length >= 5) {
    for (let i = 0; i <= sorted.length - 5; i++) {
      const windowRecords = sorted.slice(i, i + 10);
      const windowMissed = windowRecords.filter(r => {
        const s = normalizeStatus(r.status);
        return s === 'absent' || s === 'excused';
      }).length;
      if (windowMissed >= 5) {
        scatteredDetected = true;
        periods.push({
          type: 'SCATTERED_ABSENCE',
          start_date: windowRecords[0].date || '—',
          end_date: windowRecords[windowRecords.length - 1].date || '—',
          session_count: windowMissed
        });
        break;
      }
    }
  }

  // بررسی افت زمانی حضور (Attendance Decline: نیمه دوم در برابر نیمه اول)
  let declineDetected = false;
  if (sorted.length >= 6) {
    const half = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, half);
    const secondHalf = sorted.slice(half);

    const firstMissed = firstHalf.filter(r => {
      const s = normalizeStatus(r.status);
      return s === 'absent' || s === 'excused';
    }).length;
    const secondMissed = secondHalf.filter(r => {
      const s = normalizeStatus(r.status);
      return s === 'absent' || s === 'excused';
    }).length;

    const firstRate = firstMissed / firstHalf.length;
    const secondRate = secondMissed / secondHalf.length;

    if (secondRate - firstRate >= 0.15) {
      declineDetected = true;
    }
  }

  // اگر دوره غیبت مزمن است، ثبت دوره
  if (isChronic) {
    periods.push({
      type: 'CHRONIC_PERIOD',
      start_date: sorted[0].date || '—',
      end_date: sorted[sorted.length - 1].date || '—',
      session_count: missedSessions
    });
  }

  // جمع‌آوری شواهد عینی (Evidence)
  if (isCritical) {
    evidence.push(`نرخ غیبت بحرانی به ${absenceRate}٪ رسید (${missedSessions} جلسه از دست رفته از مجموع ${totalSessions})`);
  } else if (isChronic) {
    evidence.push(`نرخ غیبت مزمن به ${absenceRate}٪ رسید (فراتر از آستانه مجاز ۱۰٪)`);
  }

  if (maxStreak >= 3) {
    evidence.push(`ثبت ${maxStreak} جلسه غیبت متوالی غیرموجه`);
  }

  if (scatteredDetected) {
    evidence.push('ثبت ۵ جلسه غیبت متمرکز در یک بازه کوتاه‌مدت');
  }

  if (declineDetected) {
    evidence.push('شتاب‌گیری و افت مشهود حضور در جلسات آموزشی اخیر');
  }

  if (lateCount >= 3) {
    evidence.push(`ثبت ${lateCount} مورد تأخیر در ورود به کلاس`);
  }

  // طبقه‌بندی قطعی سطح ریسک (Risk Level)
  let riskLevel = 'LOW';
  if (isCritical || maxStreak >= 5) {
    riskLevel = 'CRITICAL';
  } else if (isChronic || maxStreak >= 3 || scatteredDetected) {
    riskLevel = 'HIGH';
  } else if ((isEligible && absenceRate >= 5.0) || lateCount >= 3 || maxStreak === 2 || declineDetected) {
    riskLevel = 'MEDIUM';
  }

  return {
    student_id: studentId != null ? Number(studentId) : null,
    risk_level: riskLevel,
    absence_rate: absenceRate,
    total_sessions: totalSessions,
    absent_count: absentCount,
    excused_count: excusedCount,
    late_count: lateCount,
    consecutive_absent_streak: maxStreak,
    is_chronic: isChronic,
    is_critical: isCritical,
    evidence,
    periods
  };
}

/**
 * ۳) تحلیل الگوی هفتگی غیبت (analyzeWeeklyAttendancePattern)
 */
function analyzeWeeklyAttendancePattern(params = {}, options = {}) {
  const attendance = Array.isArray(params) ? params : (params.attendance || []);
  const studentId = params && params.studentId != null
    ? params.studentId
    : (options.studentId != null ? options.studentId : null);
  const expectedSchoolId = options.expectedSchoolId != null
    ? options.expectedSchoolId
    : (params && params.school_id != null ? params.school_id : null);

  if (expectedSchoolId != null) {
    enforceAttendanceTenantIsolation(attendance, expectedSchoolId);
  }

  let records = attendance;
  if (studentId != null) {
    records = attendance.filter(r => r && Number(r.student_id) === Number(studentId));
  }

  const days = {
    saturday: { count: 0, total_sessions: 0, rate: 0 },
    sunday: { count: 0, total_sessions: 0, rate: 0 },
    monday: { count: 0, total_sessions: 0, rate: 0 },
    tuesday: { count: 0, total_sessions: 0, rate: 0 },
    wednesday: { count: 0, total_sessions: 0, rate: 0 }
  };

  for (let i = 0; i < records.length; i++) {
    const r = records[i] || {};
    const day = r.weekday || r.day || extractWeekday(r.date || r.created_at);
    if (!day || !days[day]) continue;

    days[day].total_sessions++;
    const st = normalizeStatus(r.status);
    if (st === 'absent' || st === 'excused') {
      days[day].count++;
    }
  }

  const dayKeys = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday'];
  let maxRate = -1;
  let highestRiskDay = null;
  let totalAbsences = 0;
  let totalSessions = 0;

  for (let i = 0; i < dayKeys.length; i++) {
    const k = dayKeys[i];
    const d = days[k];
    totalSessions += d.total_sessions;
    if (d.total_sessions > 0) {
      d.rate = roundTo((d.count / d.total_sessions) * 100, 2);
      totalAbsences += d.count;
      if (d.rate > maxRate && d.count > 0) {
        maxRate = d.rate;
        highestRiskDay = k;
      }
    }
  }

  let patternDetected = false;
  let weekdayRiskProfile = 'NO_PATTERN';
  /* A-31 / I-03: صفر رویداد هرگز «حضور کامل» نیست. بدونِ حتی یک رکورد،
     پروفایلِ صریحِ بی‌داده برمی‌گردیم تا غیبتِ داده، «کمال» گزارش نشود. */
  const dataStatus = totalSessions === 0 ? 'NO_DATA' : 'COMPLETE';

  if (totalSessions === 0) {
    weekdayRiskProfile = 'NO_DATA';
  } else if (totalAbsences > 0 && highestRiskDay != null && maxRate >= 20.0) {
    patternDetected = true;
    weekdayRiskProfile = `HIGHER_ON_${highestRiskDay.toUpperCase()}`;
  } else if (totalAbsences === 0) {
    weekdayRiskProfile = 'PERFECT_ATTENDANCE';
  } else {
    weekdayRiskProfile = 'BALANCED';
  }

  return {
    saturday: days.saturday,
    sunday: days.sunday,
    monday: days.monday,
    tuesday: days.tuesday,
    wednesday: days.wednesday,
    highest_risk_day: highestRiskDay,
    pattern_detected: patternDetected,
    weekday_risk_profile: weekdayRiskProfile,
    data_status: dataStatus
  };
}

/**
 * ۴) تحلیل هوشمندی تأخیر در ورود (analyzeLateArrival)
 */
function analyzeLateArrival(params = {}, options = {}) {
  const attendance = Array.isArray(params) ? params : (params.attendance || []);
  const studentId = params && params.studentId != null
    ? params.studentId
    : (options.studentId != null ? options.studentId : null);
  const expectedSchoolId = options.expectedSchoolId != null
    ? options.expectedSchoolId
    : (params && params.school_id != null ? params.school_id : null);

  if (expectedSchoolId != null) {
    enforceAttendanceTenantIsolation(attendance, expectedSchoolId);
  }

  let records = attendance;
  if (studentId != null) {
    records = attendance.filter(r => r && Number(r.student_id) === Number(studentId));
  }

  const totalSessions = records.length;
  if (totalSessions === 0) {
    return {
      late_count: 0,
      total_sessions: 0,
      late_ratio: 0,
      average_delay_minutes: 0,
      max_delay_minutes: 0,
      trend: 'INSUFFICIENT_DATA',
      escalation_detected: false
    };
  }

  // استخراج رکوردهای با تأخیر
  const lateRecords = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i] || {};
    const st = normalizeStatus(r.status);
    let delay = 0;

    if (r.late_minutes != null) {
      delay = Number(r.late_minutes) || 0;
    }

    if (st === 'late' || delay > 0) {
      lateRecords.push({
        date: r.date || r.created_at || '',
        id: r.id || 0,
        late_minutes: delay > 0 ? delay : 15 // پیش‌فرض منطقی ۱۵ دقیقه
      });
    }
  }

  const lateCount = lateRecords.length;
  const lateRatio = roundTo((lateCount / totalSessions) * 100, 2);

  if (lateCount === 0) {
    return {
      late_count: 0,
      total_sessions: totalSessions,
      late_ratio: 0,
      average_delay_minutes: 0,
      max_delay_minutes: 0,
      trend: 'STABLE',
      escalation_detected: false
    };
  }

  // مرتب‌سازی زمانی تأخیرها
  lateRecords.sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return a.id - b.id;
  });

  let sumDelay = 0;
  let maxDelay = 0;
  for (let i = 0; i < lateCount; i++) {
    const m = lateRecords[i].late_minutes;
    sumDelay += m;
    if (m > maxDelay) maxDelay = m;
  }
  const averageDelayMinutes = roundTo(sumDelay / lateCount, 1);

  // محاسبه روند تأخیر (رگرسیون خطی روی دقایق تأخیر)
  let trend = 'INSUFFICIENT_DATA';
  let escalationDetected = false;

  if (lateCount >= 3) {
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < lateCount; i++) {
      const x = i;
      const y = lateRecords[i].late_minutes;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const n = lateCount;
    const denom = (n * sumX2) - (sumX * sumX);
    const slope = denom !== 0 ? ((n * sumXY) - (sumX * sumY)) / denom : 0;

    if (slope > 0.5) {
      trend = 'INCREASING';
    } else if (slope < -0.5) {
      trend = 'DECREASING';
    } else {
      trend = 'STABLE';
    }

    if (trend === 'INCREASING' && (averageDelayMinutes >= 20 || lateCount >= 5)) {
      escalationDetected = true;
    }
  }

  return {
    late_count: lateCount,
    total_sessions: totalSessions,
    late_ratio: lateRatio,
    average_delay_minutes: averageDelayMinutes,
    max_delay_minutes: maxDelay,
    trend,
    escalation_detected: escalationDetected
  };
}

/**
 * ۵) تولید توصیه‌ها و اقدامات پیشگیرانه هوشمند (generateAttendanceInsights)
 */
function generateAttendanceInsights(params = {}) {
  const {
    quality = null,
    risk = null,
    weeklyPattern = null,
    lateArrival = null
  } = params;

  const insights = [];

  // ۱. توصیه‌های ریسک غیبت (Chronic / Consecutive)
  if (risk) {
    if (risk.is_critical) {
      insights.push({
        type: 'CHRONIC_ABSENCE',
        severity: 'CRITICAL',
        title: 'هشدار بحرانی غیبت مزمن',
        description: `دانش‌آموز دارای نرخ غیبت بحرانی ${risk.absence_rate}٪ است. این وضعیت نیازمند مداخله فوری کادر آموزشی و اولیا است.`,
        recommended_action: 'تماس تلفنی فوری با اولیا و دعوت حضوری جهت بررسی دلایل غیبت در شورای انضباطی مدرسه',
        student_id: risk.student_id
      });
    } else if (risk.is_chronic) {
      insights.push({
        type: 'CHRONIC_ABSENCE',
        severity: 'WARNING',
        title: 'شناسایی غیبت مزمن آموزشی',
        description: `نرخ غیبت دانش‌آموز به ${risk.absence_rate}٪ رسیده است که فراتر از آستانه مجاز ۱۰٪ آموزش و پرورش است.`,
        recommended_action: 'ارسال پیامک اطلاع‌رسانی به ولی دانش‌آموز و پایش دقیق حضور در دو هفته آینده',
        student_id: risk.student_id
      });
    }

    if (risk.consecutive_absent_streak >= 3) {
      insights.push({
        type: 'CONSECUTIVE_STREAK',
        severity: risk.consecutive_absent_streak >= 5 ? 'CRITICAL' : 'WARNING',
        title: 'هشدار غیبت‌های متوالی غیرموجه',
        description: `دانش‌آموز ${risk.consecutive_absent_streak} جلسه متوالی در کلاس درس حضور نداشته است.`,
        recommended_action: 'تماس با خانواده دانش‌آموز جهت حصول اطمینان از سلامت و جلوگیری از ترک تحصیل',
        student_id: risk.student_id
      });
    }
  }

  // ۲. توصیه‌های الگوی روزهای هفته
  if (weeklyPattern && weeklyPattern.pattern_detected) {
    const dayFaMap = {
      saturday: 'شنبه',
      sunday: 'یکشنبه',
      monday: 'دوشنبه',
      tuesday: 'سه‌شنبه',
      wednesday: 'چهارشنبه'
    };
    const dayFa = dayFaMap[weeklyPattern.highest_risk_day] || weeklyPattern.highest_risk_day;
    insights.push({
      type: 'WEEKDAY_PATTERN',
      severity: 'INFO',
      title: 'الگوی تکرارشونده غیبت در ایام هفته',
      description: `بیشترین فراوانی غیبت دانش‌آموز در روزهای ${dayFa} متمرکز است.`,
      recommended_action: `بررسی برنامه درسی و علل احتمالی غیبت در روزهای ${dayFa} در گفتگو با دانش‌آموز`
    });
  }

  // ۳. توصیه‌های تأخیر در ورود
  if (lateArrival && lateArrival.escalation_detected) {
    insights.push({
      type: 'LATE_ARRIVAL_ESCALATION',
      severity: 'WARNING',
      title: 'روند صعودی و بحرانی تأخیر در ورود',
      description: `تأخیرهای دانش‌آموز با میانگین ${lateArrival.average_delay_minutes} دقیقه روندی افزایشی به خود گرفته است.`,
      recommended_action: 'جلسه مشاوره با اولیا جهت تنظیم ساعت خواب و رفع مشکلات سرویس ایاب و ذهاب دانش‌آموز'
    });
  }

  // ۴. توصیه‌های کیفیت و پایایی داده‌ها
  if (quality && quality.reliability_score < 70) {
    insights.push({
      type: 'DATA_QUALITY_WARNING',
      severity: 'WARNING',
      title: 'کیفیت پایین ثبت حضور و غیاب',
      description: `امتیاز پایایی داده‌های حضور و غیاب (${quality.reliability_score}٪) نشان‌دهنده نقص در ثبت روزانه یا تأخیر در ورود اطلاعات است.`,
      recommended_action: 'تأکید بر ثبت به‌موقع حضور و غیاب توسط دبیران در همان روز جلسه در سامانه'
    });
  }

  return insights;
}

module.exports = {
  analyzeAttendanceQuality,
  detectAttendanceRisk,
  analyzeWeeklyAttendancePattern,
  analyzeLateArrival,
  generateAttendanceInsights,
  enforceAttendanceTenantIsolation,
  jalaliToGregorian,
  extractWeekday
};
