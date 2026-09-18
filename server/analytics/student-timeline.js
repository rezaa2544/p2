/* ═══════════════════════════════════════════════════════════════════
   server/analytics/student-timeline.js — Longitudinal Student Timeline Engine (P0-EI-02)
   -------------------------------------------------------------------
   Educational Intelligence Foundation:
   - Timeline Event Normalization across 10 educational sources
   - Chronological, deterministic timeline construction (buildStudentTimeline)
   - Educational Milestones Detection (detectEducationalMilestones)
   - Multi-period Risk Analysis using Semantic Layer (calculateRiskPeriods)
   - Temporal Query Engine with filtering & partition safety (queryTimelineRange)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const {
  evaluateLearnerProgress,
  evaluateCourseEngagement,
  evaluateCompletionSemantics,
  parseValidScore,
  roundTo,
  enforceTenantIsolation
} = require('./semantic');

/**
 * وزن‌های معنایی رویدادها (Semantic Weights)
 */
const EVENT_SEMANTIC_WEIGHTS = Object.freeze({
  ENROLLMENT: 1.2,
  CERTIFICATE: 1.1,
  GRADE: 1.0,
  REEXAM: 0.95,
  DISCIPLINE: 0.9,
  EXAM: 0.85,
  CLASS_ASSIGNMENT: 0.8,
  ATTENDANCE: 0.7,
  EXAM_TERM: 0.6,
  VCLASS: 0.5
});

/**
 * انواع رویدادهای مجاز در خط زمانی
 */
const VALID_EVENT_TYPES = Object.freeze(Object.keys(EVENT_SEMANTIC_WEIGHTS));

/**
 * تبدیل استاندارد و قطعی تاریخ به فرمت ISO-8601
 */
function toStandardIsoTimestamp(val) {
  if (!val) return '1970-01-01T00:00:00.000Z';
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? '1970-01-01T00:00:00.000Z' : val.toISOString();
  }
  if (typeof val === 'number') {
    const ms = val < 1e11 ? val * 1000 : val;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? '1970-01-01T00:00:00.000Z' : d.toISOString();
  }
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return `${str}T00:00:00.000Z`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }
  return '1970-01-01T00:00:00.000Z';
}

/**
 * نرمال‌سازی رویداد حضور و غیاب
 */
function normalizeAttendanceEvent(rec, studentId) {
  return {
    student_id: Number(studentId || rec.student_id),
    school_id: rec.school_id != null ? Number(rec.school_id) : null,
    event_type: 'ATTENDANCE',
    timestamp: toStandardIsoTimestamp(rec.date || rec.created_at),
    source_table: 'attendance',
    source_id: rec.id != null ? Number(rec.id) : null,
    semantic_weight: EVENT_SEMANTIC_WEIGHTS.ATTENDANCE,
    payload: {
      status: rec.status || 'present',
      late_minutes: rec.late_minutes != null ? Number(rec.late_minutes) : 0,
      class_id: rec.class_id != null ? Number(rec.class_id) : null,
      date: rec.date || null
    }
  };
}

/**
 * نرمال‌سازی رویداد نمره و کارنامه
 */
function normalizeGradeEvent(rec, studentId) {
  const maxScore = rec.max_score != null ? Number(rec.max_score) : 20;
  const norm = parseValidScore(rec.score, maxScore);
  return {
    student_id: Number(studentId || rec.student_id),
    school_id: rec.school_id != null ? Number(rec.school_id) : null,
    event_type: 'GRADE',
    timestamp: toStandardIsoTimestamp(rec.date || rec.created_at),
    source_table: 'grades',
    source_id: rec.id != null ? Number(rec.id) : null,
    semantic_weight: EVENT_SEMANTIC_WEIGHTS.GRADE,
    payload: {
      score: rec.score,
      normalized_score: norm,
      max_score: maxScore,
      subject_id: rec.subject_id != null ? Number(rec.subject_id) : null,
      class_id: rec.class_id != null ? Number(rec.class_id) : null,
      term: rec.term || null
    }
  };
}

/**
 * نرمال‌سازی رویداد آزمون
 */
function normalizeExamEvent(rec, studentId) {
  return {
    student_id: Number(studentId),
    school_id: rec.school_id != null ? Number(rec.school_id) : null,
    event_type: 'EXAM',
    timestamp: toStandardIsoTimestamp(rec.date || rec.created_at),
    source_table: 'exams',
    source_id: rec.id != null ? Number(rec.id) : null,
    semantic_weight: EVENT_SEMANTIC_WEIGHTS.EXAM,
    payload: {
      title: rec.title || 'آزمون',
      class_id: rec.class_id != null ? Number(rec.class_id) : null,
      max_score: rec.max_score != null ? Number(rec.max_score) : 20,
      duration: rec.duration || null,
      source: rec.source || null
    }
  };
}

/**
 * نرمال‌سازی رویداد دوره آزمون (نوبت امتحانی)
 */
function normalizeExamTermEvent(rec, studentId) {
  return {
    student_id: Number(studentId),
    school_id: rec.school_id != null ? Number(rec.school_id) : null,
    event_type: 'EXAM_TERM',
    timestamp: toStandardIsoTimestamp(rec.start_date || rec.created_at),
    source_table: 'exam_terms',
    source_id: rec.id != null ? Number(rec.id) : null,
    semantic_weight: EVENT_SEMANTIC_WEIGHTS.EXAM_TERM,
    payload: {
      title: rec.title || 'نوبت امتحانی',
      term: rec.term || null,
      start_date: rec.start_date || null,
      end_date: rec.end_date || null,
      academic_year: rec.academic_year || null
    }
  };
}

/**
 * نرمال‌سازی رویداد انضباطی
 */
function normalizeDisciplineEvent(rec, studentId) {
  return {
    student_id: Number(studentId || rec.student_id),
    school_id: rec.school_id != null ? Number(rec.school_id) : null,
    event_type: 'DISCIPLINE',
    timestamp: toStandardIsoTimestamp(rec.date || rec.created_at),
    source_table: 'discipline',
    source_id: rec.id != null ? Number(rec.id) : null,
    semantic_weight: EVENT_SEMANTIC_WEIGHTS.DISCIPLINE,
    payload: {
      kind: rec.kind || null,
      title: rec.title || 'ثبت انضباطی',
      description: rec.description || null,
      points: rec.points != null ? Number(rec.points) : 0
    }
  };
}

/**
 * نرمال‌سازی رویداد ثبت‌نام
 */
function normalizeEnrollmentEvent(rec, studentId) {
  return {
    student_id: Number(studentId || rec.student_id),
    school_id: rec.school_id != null ? Number(rec.school_id) : null,
    event_type: 'ENROLLMENT',
    timestamp: toStandardIsoTimestamp(rec.created_at || rec.date),
    source_table: 'enrollments',
    source_id: rec.id != null ? Number(rec.id) : null,
    semantic_weight: EVENT_SEMANTIC_WEIGHTS.ENROLLMENT,
    payload: {
      class_id: rec.class_id != null ? Number(rec.class_id) : null,
      academic_year: rec.academic_year || null,
      status: rec.status || 'active'
    }
  };
}

/**
 * نرمال‌سازی رویداد انتصاب به کلاس
 */
function normalizeClassAssignmentEvent(rec, studentId) {
  return {
    student_id: Number(studentId),
    school_id: rec.school_id != null ? Number(rec.school_id) : null,
    event_type: 'CLASS_ASSIGNMENT',
    timestamp: toStandardIsoTimestamp(rec.created_at),
    source_table: 'classes',
    source_id: rec.id != null ? Number(rec.id) : null,
    semantic_weight: EVENT_SEMANTIC_WEIGHTS.CLASS_ASSIGNMENT,
    payload: {
      class_id: rec.id != null ? Number(rec.id) : null,
      name: rec.name || null,
      grade: rec.grade || null,
      academic_year: rec.academic_year || null
    }
  };
}

/**
 * نرمال‌سازی رویداد گواهینامه یا تشویقی
 */
function normalizeCertificateEvent(rec, studentId) {
  return {
    student_id: Number(studentId || rec.student_id),
    school_id: rec.school_id != null ? Number(rec.school_id) : null,
    event_type: 'CERTIFICATE',
    timestamp: toStandardIsoTimestamp(rec.issued_at || rec.created_at),
    source_table: 'certificates',
    source_id: rec.id != null ? Number(rec.id) : null,
    semantic_weight: EVENT_SEMANTIC_WEIGHTS.CERTIFICATE,
    payload: {
      title: rec.title || 'گواهی آموزشی',
      type: rec.type || null,
      code: rec.code || null,
      year: rec.year || null,
      issued_by: rec.issued_by || null
    }
  };
}

/**
 * نرمال‌سازی رویداد آزمون مجدد / تجدیدی (Reexam)
 */
function normalizeReexamEvent(rec, studentId) {
  return {
    student_id: Number(studentId || rec.student_id),
    school_id: rec.school_id != null ? Number(rec.school_id) : null,
    event_type: 'REEXAM',
    timestamp: toStandardIsoTimestamp(rec.exam_date || rec.created_at),
    source_table: 'reexams',
    source_id: rec.id != null ? Number(rec.id) : null,
    semantic_weight: EVENT_SEMANTIC_WEIGHTS.REEXAM,
    payload: {
      subject_id: rec.subject_id != null ? Number(rec.subject_id) : null,
      original_score: rec.original_score != null ? Number(rec.original_score) : null,
      new_score: rec.new_score != null ? Number(rec.new_score) : null,
      status: rec.status || 'pending'
    }
  };
}

/**
 * نرمال‌سازی رویداد جلسات کلاس مجازی (VClass Sessions)
 */
function normalizeVClassEvent(rec, studentId) {
  return {
    student_id: Number(studentId),
    school_id: rec.school_id != null ? Number(rec.school_id) : null,
    event_type: 'VCLASS',
    timestamp: toStandardIsoTimestamp(rec.created_at || rec.shad_time),
    source_table: 'vclass_sessions',
    source_id: rec.id != null ? Number(rec.id) : null,
    semantic_weight: EVENT_SEMANTIC_WEIGHTS.VCLASS,
    payload: {
      title: rec.title || 'جلسه مجازی',
      class_id: rec.class_id != null ? Number(rec.class_id) : null,
      type: rec.type || null
    }
  };
}

/**
 * ساخت خط زمانی کامل و مرتب‌شده دانش‌آموز (buildStudentTimeline)
 */
function buildStudentTimeline(studentData = {}, options = {}) {
  const student = studentData.student || {};
  const studentId = Number(options.studentId || student.id || studentData.student_id);

  if (!studentId || isNaN(studentId)) {
    throw new Error('INVALID_INPUT: student_id is required for buildStudentTimeline');
  }

  const allowCrossSchool = options.allowCrossSchool === true;
  const expectedSchoolId = allowCrossSchool
    ? null
    : (options.expectedSchoolId !== undefined
        ? (options.expectedSchoolId != null ? Number(options.expectedSchoolId) : null)
        : (student.school_id != null ? Number(student.school_id) : null));

  const rawAttendance = Array.isArray(studentData.attendance) ? studentData.attendance : [];
  const rawGrades = Array.isArray(studentData.grades) ? studentData.grades : [];
  const rawExams = Array.isArray(studentData.exams) ? studentData.exams : [];
  const rawExamTerms = Array.isArray(studentData.exam_terms) ? studentData.exam_terms : [];
  const rawDiscipline = Array.isArray(studentData.discipline) ? studentData.discipline : [];
  const rawEnrollments = Array.isArray(studentData.enrollments) ? studentData.enrollments : [];
  const rawClasses = Array.isArray(studentData.classes) ? studentData.classes : [];
  const rawCertificates = Array.isArray(studentData.certificates) ? studentData.certificates : [];
  const rawReexams = Array.isArray(studentData.reexams) ? studentData.reexams : [];
  const rawVClass = Array.isArray(studentData.vclass_sessions) ? studentData.vclass_sessions : [];

  // بررسی گارد ایزولاسیون مستأجران برای تمامی ۱۰ منبع داده
  if (expectedSchoolId != null) {
    enforceTenantIsolation(rawAttendance, expectedSchoolId);
    enforceTenantIsolation(rawGrades, expectedSchoolId);
    enforceTenantIsolation(rawExams, expectedSchoolId);
    enforceTenantIsolation(rawExamTerms, expectedSchoolId);
    enforceTenantIsolation(rawDiscipline, expectedSchoolId);
    enforceTenantIsolation(rawEnrollments, expectedSchoolId);
    enforceTenantIsolation(rawClasses, expectedSchoolId);
    enforceTenantIsolation(rawCertificates, expectedSchoolId);
    enforceTenantIsolation(rawReexams, expectedSchoolId);
    enforceTenantIsolation(rawVClass, expectedSchoolId);
  }

  // استخراج کلاس‌های منتسب به این دانش‌آموز
  const studentClassIds = new Set();
  for (const enr of rawEnrollments) {
    if (Number(enr.student_id) === studentId && enr.class_id != null) {
      studentClassIds.add(Number(enr.class_id));
    }
  }

  const normalizedEvents = [];

  // ۱. حضور و غیاب
  for (const a of rawAttendance) {
    if (Number(a.student_id) === studentId) {
      normalizedEvents.push(normalizeAttendanceEvent(a, studentId));
    }
  }

  // ۲. نمرات
  for (const g of rawGrades) {
    if (Number(g.student_id) === studentId) {
      normalizedEvents.push(normalizeGradeEvent(g, studentId));
    }
  }

  // ۳. آزمون‌ها (در صورت مرتبط بودن با کلاس دانش‌آموز یا مشخص نبودن کلاس)
  for (const ex of rawExams) {
    if (ex.class_id == null || studentClassIds.size === 0 || studentClassIds.has(Number(ex.class_id))) {
      normalizedEvents.push(normalizeExamEvent(ex, studentId));
    }
  }

  // ۴. نوبت‌های امتحانی
  for (const term of rawExamTerms) {
    normalizedEvents.push(normalizeExamTermEvent(term, studentId));
  }

  // ۵. انضباطی
  for (const d of rawDiscipline) {
    if (Number(d.student_id) === studentId) {
      normalizedEvents.push(normalizeDisciplineEvent(d, studentId));
    }
  }

  // ۶. ثبت‌نام‌ها
  for (const enr of rawEnrollments) {
    if (Number(enr.student_id) === studentId) {
      normalizedEvents.push(normalizeEnrollmentEvent(enr, studentId));
    }
  }

  // ۷. کلاس‌ها
  for (const c of rawClasses) {
    if (studentClassIds.has(Number(c.id))) {
      normalizedEvents.push(normalizeClassAssignmentEvent(c, studentId));
    }
  }

  // ۸. مدارک و گواهی‌ها
  for (const cert of rawCertificates) {
    if (Number(cert.student_id) === studentId) {
      normalizedEvents.push(normalizeCertificateEvent(cert, studentId));
    }
  }

  // ۹. تجدیدی و آزمون‌های مجدد
  for (const re of rawReexams) {
    if (Number(re.student_id) === studentId) {
      normalizedEvents.push(normalizeReexamEvent(re, studentId));
    }
  }

  // ۱۰. کلاس مجازی
  for (const vc of rawVClass) {
    if (vc.class_id == null || studentClassIds.size === 0 || studentClassIds.has(Number(vc.class_id))) {
      normalizedEvents.push(normalizeVClassEvent(vc, studentId));
    }
  }

  // مرتب‌سازی قطعی و کرونولوژیک (Primary: timestamp ASC, Secondary: semantic_weight DESC, Tertiary: event_type ASC, Quaternary: source_id ASC)
  normalizedEvents.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp.localeCompare(b.timestamp);
    }
    if (a.semantic_weight !== b.semantic_weight) {
      return b.semantic_weight - a.semantic_weight;
    }
    if (a.event_type !== b.event_type) {
      return a.event_type.localeCompare(b.event_type);
    }
    const aId = a.source_id || 0;
    const bId = b.source_id || 0;
    return aId - bId;
  });

  const totalEvents = normalizedEvents.length;
  const startDate = totalEvents > 0 ? normalizedEvents[0].timestamp : null;
  const endDate = totalEvents > 0 ? normalizedEvents[totalEvents - 1].timestamp : null;

  return {
    student_id: studentId,
    school_id: expectedSchoolId,
    total_events: totalEvents,
    date_range: {
      from: startDate,
      to: endDate
    },
    events: normalizedEvents
  };
}

/**
 * تشخیص هوشمند نقاط عطف آموزشی (detectEducationalMilestones)
 */
function detectEducationalMilestones(timelineInput, options = {}) {
  const events = Array.isArray(timelineInput)
    ? timelineInput
    : (timelineInput && Array.isArray(timelineInput.events) ? timelineInput.events : []);

  const milestones = [];

  // ۱. ارزیابی نمرات جهت تشخیص افت و جهش
  const gradeEvents = events.filter(e => e.event_type === 'GRADE');
  for (let i = 1; i < gradeEvents.length; i++) {
    const prev = gradeEvents[i - 1];
    const curr = gradeEvents[i];

    const prevScore = prev.payload && prev.payload.normalized_score != null ? prev.payload.normalized_score : null;
    const currScore = curr.payload && curr.payload.normalized_score != null ? curr.payload.normalized_score : null;

    if (prevScore !== null && currScore !== null) {
      const diff = roundTo(currScore - prevScore, 2);

      // افت شدید تحصیلی (افت ۲٫۵ نمره یا بیشتر، یا سقوط زیر ۱۰)
      if (diff <= -2.5 || (prevScore >= 10 && currScore < 10)) {
        milestones.push({
          milestone: 'LEARNING_DECLINE_DETECTED',
          timestamp: curr.timestamp,
          source_table: 'grades',
          severity: currScore < 10 ? 'CRITICAL' : 'WARNING',
          evidence: [
            `افت نمره از ${prevScore} به ${currScore} (تفاضل: ${diff})`,
            curr.payload.subject_id ? `درس: ${curr.payload.subject_id}` : 'درس نامشخص'
          ]
        });
      }

      // جهش یادگیری (بهبود ۲٫۵ نمره یا بیشتر، یا خروج از مردودی)
      if (diff >= 2.5 || (prevScore < 10 && currScore >= 12)) {
        milestones.push({
          milestone: 'LEARNING_IMPROVEMENT_DETECTED',
          timestamp: curr.timestamp,
          source_table: 'grades',
          severity: 'POSITIVE',
          evidence: [
            `رشد نمره از ${prevScore} به ${currScore} (رشد: +${diff})`,
            curr.payload.subject_id ? `درس: ${curr.payload.subject_id}` : 'درس نامشخص'
          ]
        });
      }
    }
  }

  // ۲. ارزیابی غیبت متوالی و غیبت مزمن
  const attendanceEvents = events.filter(e => e.event_type === 'ATTENDANCE');
  let currentAbsentStreak = 0;
  let totalSessions = 0;
  let absentCount = 0;
  let chronicAlertFired = false;

  for (let i = 0; i < attendanceEvents.length; i++) {
    const att = attendanceEvents[i];
    totalSessions++;
    const status = String(att.payload ? att.payload.status : '').toLowerCase();
    const isAbsent = status === 'absent' || status === 'غایب' || status === 'unexcused' || status === 'غیرموجه';

    if (isAbsent) {
      currentAbsentStreak++;
      absentCount++;

      // غیبت متوالی ۳ جلسه به عنوان آغاز ریسک غیبت مزمن
      if (currentAbsentStreak === 3 && !chronicAlertFired) {
        chronicAlertFired = true;
        milestones.push({
          milestone: 'CHRONIC_ABSENCE_STARTED',
          timestamp: att.timestamp,
          source_table: 'attendance',
          severity: 'WARNING',
          evidence: [
            `وقوع ${currentAbsentStreak} جلسه غیبت متوالی غیرموجه`,
            `آغاز دوره بحرانی حضور در تاریخ ${att.timestamp}`
          ]
        });
      }
    } else {
      currentAbsentStreak = 0;
    }

    // بررسی نرخ تجمعی بالای ۱۰٪ با حداقل ۵ جلسه
    if (totalSessions >= 5 && (absentCount / totalSessions) >= 0.15 && !chronicAlertFired) {
      chronicAlertFired = true;
      milestones.push({
        milestone: 'CHRONIC_ABSENCE_STARTED',
        timestamp: att.timestamp,
        source_table: 'attendance',
        severity: 'CRITICAL',
        evidence: [
          `نرخ تجمعی غیبت به ${roundTo((absentCount / totalSessions) * 100, 1)}٪ رسید`,
          `تعداد جلسات از دست رفته: ${absentCount} از ${totalSessions}`
        ]
      });
    }
  }

  // ۳. ارزیابی دوره بازیابی (RECOVERY_PERIOD)
  // اگر قبلاً افتی ثبت شده و پس از آن نمرات متوالی قبولی (>= 12) یا حضور کامل ثبت شود
  const declineMilestones = milestones.filter(m => m.milestone === 'LEARNING_DECLINE_DETECTED' || m.milestone === 'CHRONIC_ABSENCE_STARTED');
  if (declineMilestones.length > 0) {
    const lastDecline = declineMilestones[declineMilestones.length - 1];
    const eventsAfterDecline = events.filter(e => e.timestamp > lastDecline.timestamp);

    let consecutivePass = 0;
    for (const ev of eventsAfterDecline) {
      if (ev.event_type === 'GRADE') {
        const sc = ev.payload ? ev.payload.normalized_score : null;
        if (sc !== null && sc >= 12) {
          consecutivePass++;
          if (consecutivePass >= 2) {
            milestones.push({
              milestone: 'RECOVERY_PERIOD',
              timestamp: ev.timestamp,
              source_table: 'grades',
              severity: 'POSITIVE',
              evidence: [
                'بازیابی عملکرد تحصیلی پس از دوره افت قبلی',
                `کسب نمرات پایدار بالای ۱۲ (${sc})`
              ]
            });
            break;
          }
        } else if (sc !== null && sc < 10) {
          consecutivePass = 0;
        }
      }
    }
  }

  // ۴. انتقال مدرسه (SCHOOL_TRANSFER)
  const enrollmentEvents = events.filter(e => e.event_type === 'ENROLLMENT');
  for (let i = 1; i < enrollmentEvents.length; i++) {
    const prevSchool = enrollmentEvents[i - 1].school_id;
    const currSchool = enrollmentEvents[i].school_id;
    if (prevSchool && currSchool && prevSchool !== currSchool) {
      milestones.push({
        milestone: 'SCHOOL_TRANSFER',
        timestamp: enrollmentEvents[i].timestamp,
        source_table: 'enrollments',
        severity: 'INFO',
        evidence: [
          `تغییر مدرسه ثبت‌نامی از کد ${prevSchool} به ${currSchool}`
        ]
      });
    }
  }

  // ۵. خطر عدم تکمیل پایه یا تجدیدی (COMPLETION_RISK)
  const failedGrades = gradeEvents.filter(g => g.payload && g.payload.normalized_score != null && g.payload.normalized_score < 10);
  if (failedGrades.length >= 2) {
    const lastFailed = failedGrades[failedGrades.length - 1];
    milestones.push({
      milestone: 'COMPLETION_RISK',
      timestamp: lastFailed.timestamp,
      source_table: 'grades',
      severity: 'CRITICAL',
      evidence: [
        `ثبت ${failedGrades.length} نمره زیر حد نصاب قبولی (نمره ۱۰)`,
        'نیاز به شرکت در امتحانات جبرانی یا خطر عدم ارتقای پایه'
      ]
    });
  }

  // مرتب‌سازی کرونولوژیک رویدادهای نقاط عطف
  milestones.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return milestones;
}

/**
 * ارزیابی دوره‌های ریسک دانش‌آموز بر پایه لایه معنایی (calculateRiskPeriods)
 */
function calculateRiskPeriods(timelineInput, semanticContext = {}) {
  const events = Array.isArray(timelineInput)
    ? timelineInput
    : (timelineInput && Array.isArray(timelineInput.events) ? timelineInput.events : []);

  const riskPeriods = [];

  // اتصال به لایه معنایی موجود برای تکمیل تحصیلی
  const studentGrades = events
    .filter(e => e.event_type === 'GRADE' && e.payload && e.payload.normalized_score != null)
    .map(e => ({
      score: e.payload.score,
      max_score: e.payload.max_score,
      coeff: 1,
      subject_id: e.payload.subject_id
    }));

  if (studentGrades.length > 0) {
    const completionEval = evaluateCompletionSemantics({
      studentId: timelineInput.student_id || 1,
      subjectGrades: studentGrades
    });

    const compStatus = completionEval.completion_status || completionEval.status;
    if (compStatus === 'FAILED' || compStatus === 'CONDITIONAL') {
      const fromDate = events.find(e => e.event_type === 'GRADE' && e.payload && e.payload.normalized_score < 10);
      const toDate = events[events.length - 1];
      riskPeriods.push({
        from: fromDate ? fromDate.timestamp : (events[0] ? events[0].timestamp : '1970-01-01T00:00:00.000Z'),
        to: toDate ? toDate.timestamp : '1970-01-01T00:00:00.000Z',
        risk: 'COMPLETION_RISK',
        confidence: compStatus === 'FAILED' ? 0.95 : 0.75,
        evidence: [
          `وضعیت رسمی پایان دوره: ${compStatus}`,
          `تعداد دروس زیر نصاب: ${completionEval.failed_subjects != null ? completionEval.failed_subjects : 1}`
        ]
      });
    }
  }

  // اتصال به لایه معنایی برای تحلیل پیشرفت یادگیرنده
  const learnerProgressEval = evaluateLearnerProgress({
    studentId: timelineInput.student_id || 1,
    grades: studentGrades
  });

  if (learnerProgressEval.mastery_level === 'BELOW_BASIC' || learnerProgressEval.trend_direction === 'DECLINING') {
    riskPeriods.push({
      from: events[0] ? events[0].timestamp : '1970-01-01T00:00:00.000Z',
      to: events[events.length - 1] ? events[events.length - 1].timestamp : '1970-01-01T00:00:00.000Z',
      risk: 'ACADEMIC_DECLINE',
      confidence: learnerProgressEval.mastery_level === 'BELOW_BASIC' ? 0.90 : 0.75,
      evidence: [
        `سطح تسلط یادگیرنده: ${learnerProgressEval.mastery_level}`,
        `جهت روند تحصیلی: ${learnerProgressEval.trend_direction}`
      ]
    });
  }

  // تحلیل تعامل با درس
  const attendanceRecords = events
    .filter(e => e.event_type === 'ATTENDANCE')
    .map(e => ({
      status: e.payload ? e.payload.status : 'present',
      date: e.timestamp
    }));

  if (attendanceRecords.length > 0) {
    const courseEngagementEval = evaluateCourseEngagement({
      courseId: 'all',
      attendance: attendanceRecords
    });

    if (courseEngagementEval.disengagement_risk) {
      riskPeriods.push({
        from: events[0] ? events[0].timestamp : '1970-01-01T00:00:00.000Z',
        to: events[events.length - 1] ? events[events.length - 1].timestamp : '1970-01-01T00:00:00.000Z',
        risk: 'COURSE_DISENGAGEMENT',
        confidence: 0.82,
        evidence: [
          `امتیاز تعامل: ${courseEngagementEval.engagement_score}`,
          `رده مشارکت: ${courseEngagementEval.tier}`
        ]
      });
    }
  }

  return {
    student_id: timelineInput.student_id || null,
    total_risks_identified: riskPeriods.length,
    risk_periods: riskPeriods
  };
}

/**
 * فیلتر زمانی و موضوعی خط زمانی (queryTimelineRange)
 */
function queryTimelineRange(timelineInput, from, to, eventTypes = null) {
  const events = Array.isArray(timelineInput)
    ? timelineInput
    : (timelineInput && Array.isArray(timelineInput.events) ? timelineInput.events : []);

  const fromIso = from ? toStandardIsoTimestamp(from) : null;
  const toIso = to ? toStandardIsoTimestamp(to) : null;

  const typeFilter = eventTypes
    ? new Set(Array.isArray(eventTypes) ? eventTypes : [eventTypes])
    : null;

  const filtered = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (fromIso && ev.timestamp < fromIso) continue;
    if (toIso && ev.timestamp > toIso) continue;
    if (typeFilter && !typeFilter.has(ev.event_type)) continue;
    filtered.push(ev);
  }

  return {
    student_id: timelineInput.student_id || null,
    school_id: timelineInput.school_id || null,
    filter: {
      from: fromIso,
      to: toIso,
      event_types: typeFilter ? Array.from(typeFilter) : null
    },
    count: filtered.length,
    events: filtered
  };
}

module.exports = {
  EVENT_SEMANTIC_WEIGHTS,
  VALID_EVENT_TYPES,
  toStandardIsoTimestamp,
  buildStudentTimeline,
  detectEducationalMilestones,
  calculateRiskPeriods,
  queryTimelineRange
};
