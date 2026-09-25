/* ═══════════════════════════════════════════════════════════════════
   server/analytics/parent-360.js — Parent 360 & Family Action Center (P0-EI-06)
   -------------------------------------------------------------------
   Educational Intelligence Foundation:
   - 1) enforceParentChildAccessGuard (Strict Anti-IDOR & Multi-School Isolation)
   - 2) buildParent360Profile (Holistic, Transparent Student Dossier for Families)
   - 3) generateParentActionItems (Actionable Family Interventions with Priority & Deadlines)
   - 4) validateAbsenceJustification (Two-Way Formal Parent Absence Justification)
   - 5) calculateParentEngagementIndex (Empirical Parent Participation Scoring)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const {
  roundTo,
  parseValidScore,
  enforceTenantIsolation
} = require('./semantic');

/**
 * ۱) گارد امنیتی دسترسی والد-فرزند و ایزولاسیون بین‌مدرسه‌ای (enforceParentChildAccessGuard)
 * تضمین اصل Zero-Trust و جلوگیری قاطع از آسیب‌پذیری IDOR
 */
function enforceParentChildAccessGuard(parent, studentId, parentLinks = [], options = {}) {
  const pId = typeof parent === 'object' && parent !== null ? Number(parent.id) : Number(parent);
  const sId = Number(studentId);

  if (!pId || !sId || isNaN(pId) || isNaN(sId)) {
    const err = new Error('Parent or student identifier is invalid');
    err.code = 'PARENT_ACCESS_FORBIDDEN';
    throw err;
  }

  // بررسی پیوند مجاز در parent_links یا مشخصات مستقیم
  let isAuthorized = false;

  if (Array.isArray(parentLinks)) {
    for (let i = 0; i < parentLinks.length; i++) {
      const link = parentLinks[i];
      if (link && Number(link.parent_id) === pId && Number(link.student_id) === sId) {
        isAuthorized = true;
        break;
      }
    }
  }

  // پشتیبانی از ساختار شیء دانش‌آموز با ستون parent_id
  if (!isAuthorized && options.student && Number(options.student.parent_id) === pId) {
    isAuthorized = true;
  }

  if (!isAuthorized) {
    const err = new Error(`Access forbidden: Parent (${pId}) is not authorized for student (${sId})`);
    err.code = 'PARENT_ACCESS_FORBIDDEN';
    throw err;
  }

  // کنترل ایزولاسیون مدرسه در صورت تعریف
  if (options.expectedSchoolId != null && options.student && options.student.school_id != null) {
    if (Number(options.student.school_id) !== Number(options.expectedSchoolId)) {
      const err = new Error(`Tenant isolation violation: Student school (${options.student.school_id}) does not match expected (${options.expectedSchoolId})`);
      err.code = 'TENANT_ISOLATION_VIOLATION';
      throw err;
    }
  }
}

/**
 * ۲) ساخت نمای یکپارچه ۳۶۰ درجه فرزند برای والدین (buildParent360Profile)
 */
function buildParent360Profile(params = {}, options = {}) {
  const {
    parent = params.parent || {},
    student = params.student || {},
    parentLinks = params.parentLinks || [],
    attendance = params.attendance || [],
    grades = params.grades || [],
    timeline = params.timeline || [],
    school = params.school || {},
    classObj = params.classObj || {}
  } = params;

  const studentId = student.id || params.studentId || options.studentId;
  const parentId = parent.id || params.parentId || options.parentId;

  // مسیر مجاز برای نقش‌های مدرسه (manager/teacher/counselor): وقتی صراحتاً
  // مدرسهٔ مورد نظر تأیید شده باشد، نیازی به پیوند والد-فرزند نیست.
  // route این گزینه را فقط بعد از گذراندن گارد دسترسی مدرسه فعال می‌کند.
  if (options.schoolScopedAccess === true && options.expectedSchoolId != null) {
    if (student && student.school_id != null && Number(student.school_id) !== Number(options.expectedSchoolId)) {
      const err = new Error(`TENANT_ISOLATION_VIOLATION: student school ${student.school_id} !== expected ${options.expectedSchoolId}`);
      err.code = 'TENANT_ISOLATION_VIOLATION';
      throw err;
    }
  } else {
    // اعمال گارد امنیتی والد-فرزند
    enforceParentChildAccessGuard(parentId, studentId, parentLinks, {
      student,
      expectedSchoolId: options.expectedSchoolId
    });
  }

  if (options.expectedSchoolId != null) {
    enforceTenantIsolation(attendance, options.expectedSchoolId);
    enforceTenantIsolation(grades, options.expectedSchoolId);
  }

  // ۱. اطلاعات هویتی و ثبت‌نامی فرزند
  const studentIdentity = {
    full_name: student.full_name || 'دانش‌آموز',
    grade_level: student.grade_level || classObj.grade_level || 'پایه نامشخص',
    class_name: classObj.name || (student.class_id ? `کلاس ${student.class_id}` : 'کلاس عمومی'),
    school_name: school.name || 'مدرسه پایش'
  };

  // ۲. تحلیل جامع حضور و غیاب برای والد
  let presentCount = 0;
  let unexcusedCount = 0;
  let excusedCount = 0;
  let lateCount = 0;

  for (let i = 0; i < attendance.length; i++) {
    const r = attendance[i] || {};
    const st = String(r.status || '').toLowerCase().trim();
    if (st === 'present' || st === 'حاضر') presentCount++;
    else if (st === 'absent' || st === 'غایب' || st === 'unexcused') unexcusedCount++;
    else if (st === 'excused' || st === 'موجه') excusedCount++;
    else if (st === 'late' || st === 'تاخیر' || st === 'تأخیر') lateCount++;
  }

  const totalSessions = presentCount + unexcusedCount + excusedCount + lateCount;
  const attNumerator = presentCount + (lateCount * 0.8);
  const attendanceRate = totalSessions > 0
    ? roundTo((attNumerator / totalSessions) * 100, 1)
    : 100.0;

  let attendanceStatus = 'EXCELLENT';
  if (attendanceRate < 80.0 || unexcusedCount >= 3) attendanceStatus = 'CRITICAL';
  else if (attendanceRate < 90.0 || unexcusedCount >= 1) attendanceStatus = 'WARNING';
  else if (attendanceRate < 95.0) attendanceStatus = 'STABLE';

  const attendanceOverview = {
    attendance_rate: attendanceRate,
    unexcused_absences: unexcusedCount,
    late_arrivals_count: lateCount,
    status: attendanceStatus
  };

  // ۳. تحلیل وضعیت تحصیلی و نمرات
  let sumScores = 0;
  let validScoreCount = 0;
  let strongCount = 0;
  const subjectsNeedingSupport = new Set();

  for (let i = 0; i < grades.length; i++) {
    const g = grades[i];
    const scoreVal = parseValidScore(g && g.score, g && g.max_score);
    if (scoreVal !== null) {
      sumScores += scoreVal;
      validScoreCount++;

      const subjName = (g && (g.subject_name || g.subject || g.subject_id)) || 'درس نامشخص';
      if (scoreVal >= 17.0) {
        strongCount++;
      } else if (scoreVal < 12.0) {
        subjectsNeedingSupport.add(String(subjName));
      }
    }
  }

  const gpa = validScoreCount > 0 ? roundTo(sumScores / validScoreCount, 2) : null;

  let perfStatus = 'GOOD';
  if (gpa !== null) {
    if (gpa >= 17.0) perfStatus = 'EXCELLENT';
    else if (gpa >= 14.0) perfStatus = 'GOOD';
    else if (gpa >= 10.0) perfStatus = 'NEEDS_SUPPORT';
    else perfStatus = 'CRITICAL';
  }

  const academicOverview = {
    gpa,
    total_grades: validScoreCount,
    strong_subjects_count: strongCount,
    subjects_needing_support: Array.from(subjectsNeedingSupport).sort(),
    performance_status: perfStatus
  };

  // ۴. استخراج نقاط عطف زمانی به زبان ساده برای خانواده
  const keyMilestones = [];
  if (Array.isArray(timeline)) {
    for (let i = 0; i < timeline.length; i++) {
      const item = timeline[i];
      if (!item) continue;
      if (item.milestone === 'LEARNING_IMPROVEMENT_DETECTED') {
        keyMilestones.push({
          title: 'جهش و رشد تحصیلی',
          date: item.timestamp ? String(item.timestamp).slice(0, 10) : '—',
          type: 'POSITIVE',
          description: 'روند نمرات فرزند شما در ارزشیابی‌های اخیر بهبود چشمگیری داشته است.'
        });
      } else if (item.milestone === 'LEARNING_DECLINE_DETECTED') {
        keyMilestones.push({
          title: 'افت در ارزشیابی اخیر',
          date: item.timestamp ? String(item.timestamp).slice(0, 10) : '—',
          type: 'ATTENTION',
          description: 'کاهش نمره در آزمون اخیر ثبت شده است که نیازمند توجه و حمایت درسی است.'
        });
      } else if (item.milestone === 'CHRONIC_ABSENCE_STARTED') {
        keyMilestones.push({
          title: 'اخطار تکرار غیبت',
          date: item.timestamp ? String(item.timestamp).slice(0, 10) : '—',
          type: 'ATTENTION',
          description: 'تعداد غیبت‌های غیرموجه فراتر از حد مجاز رفته است.'
        });
      }
    }
  }

  // ۵. استخراج اقدامات معلق والد
  const pendingActions = generateParentActionItems({
    student,
    attendance,
    grades
  });

  return {
    student_id: Number(studentId),
    school_id: student.school_id ? Number(student.school_id) : 1,
    student_identity: studentIdentity,
    attendance_overview: attendanceOverview,
    academic_overview: academicOverview,
    key_milestones: keyMilestones,
    pending_actions_count: pendingActions.length
  };
}

/**
 * ۳) تولید مرکز اقدامات والدین (generateParentActionItems)
 */
function generateParentActionItems(params = {}, options = {}) {
  const {
    student = params.student || {},
    attendance = params.attendance || [],
    grades = params.grades || [],
    timeline = params.timeline || []
  } = params;

  const sId = student.id || params.studentId || 1;
  const actions = [];

  // ۱. شناسایی غیبت‌های غیرموجه نیازمند ثبت دلیل توسط اولیا
  for (let i = 0; i < attendance.length; i++) {
    const r = attendance[i];
    if (!r) continue;
    const st = String(r.status || '').toLowerCase().trim();
    if ((st === 'absent' || st === 'غایب' || st === 'unexcused') && !r.excused_reason) {
      const attDate = r.date || (r.created_at ? String(r.created_at).slice(0, 10) : '—');
      actions.push({
        action_id: `act_abs_${r.id || i}`,
        student_id: Number(sId),
        type: 'JUSTIFY_ABSENCE',
        priority: 'HIGH',
        title: `توجیه غیبت در تاریخ ${attDate}`,
        description: `فرزند شما در تاریخ ${attDate} در مدرسه حاضر نبوده است. لطفاً علت غیبت را ثبت کنید.`,
        reference_date: attDate,
        reference_id: r.id || null,
        deadline: '۴۸ ساعت پس از ثبت'
      });
    }
  }

  // ۲. شناسایی نمرات ضعیف نیازمند امضا و تأیید والد
  for (let i = 0; i < grades.length; i++) {
    const g = grades[i];
    if (!g) continue;
    const scoreVal = parseValidScore(g.score, g.max_score);
    if (scoreVal !== null && scoreVal < 10.0 && !g.parent_acknowledged) {
      const gDate = g.date || (g.created_at ? String(g.created_at).slice(0, 10) : '—');
      const subj = g.subject_name || g.subject || 'درس مربوطه';
      actions.push({
        action_id: `act_grd_${g.id || i}`,
        student_id: Number(sId),
        type: 'ACKNOWLEDGE_WARNING',
        priority: 'CRITICAL',
        title: `مشاهده و تأیید نمره ${scoreVal} در درس ${subj}`,
        description: `نمره زیر حدنصاب در آزمون ${subj} (${gDate}) ثبت شده است. لطفاً مشاهده وضعیت را تأیید نمایید.`,
        reference_date: gDate,
        reference_id: g.id || null,
        deadline: '۲۴ ساعت'
      });
    }
  }

  // مرتب‌سازی قطعی بر مبنای اولویت
  const priorityRank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  actions.sort((a, b) => {
    const rankA = priorityRank[a.priority] !== undefined ? priorityRank[a.priority] : 9;
    const rankB = priorityRank[b.priority] !== undefined ? priorityRank[b.priority] : 9;
    const diff = rankA - rankB;
    if (diff !== 0) return diff;
    return a.action_id.localeCompare(b.action_id);
  });

  return actions;
}

/**
 * ۴) اعتبارسنجی و ثبت رسمی درخواست موجه‌سازی غیبت (validateAbsenceJustification)
 */
function validateAbsenceJustification(params = {}, options = {}) {
  const {
    parentId = params.parentId || params.parent_id,
    studentId = params.studentId || params.student_id,
    attendanceId = params.attendanceId || params.attendance_id,
    date = params.date,
    reason = params.reason,
    attachmentRef = params.attachmentRef || params.attachment_ref || null,
    parentLinks = params.parentLinks || []
  } = params;

  if (!parentId || !studentId) {
    const err = new Error('Parent and student IDs are required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  // احراز دسترسی والد به دانش‌آموز
  if (parentLinks.length > 0) {
    enforceParentChildAccessGuard(parentId, studentId, parentLinks);
  }

  const cleanReason = String(reason || '').trim();
  if (cleanReason.length < 3) {
    const err = new Error('Reason must be at least 3 characters long');
    err.code = 'VALIDATION_FAILED';
    throw err;
  }

  return {
    valid: true,
    status: 'PENDING_SCHOOL_REVIEW',
    submission: {
      parent_id: Number(parentId),
      student_id: Number(studentId),
      attendance_id: attendanceId ? Number(attendanceId) : null,
      date: String(date || ''),
      reason_sanitized: cleanReason,
      attachment_ref: attachmentRef ? String(attachmentRef).trim() : null,
      submitted_at: new Date().toISOString()
    }
  };
}

/**
 * ۵) محاسبه شاخص تعامل خانواده (calculateParentEngagementIndex)
 */
function calculateParentEngagementIndex(params = {}, options = {}) {
  const {
    actionsCompleted = 0,
    totalActions = 0,
    justificationsTimely = 0,
    totalAbsences = 0,
    portalVisitsCount = 0
  } = params;

  // ۱. مؤلفه پاسخ‌دهی به اقدامات (Action Completion Rate)
  const actionRate = totalActions > 0
    ? Math.min(100, (actionsCompleted / totalActions) * 100)
    : 100;

  // ۲. مؤلفه به‌موقع بودن پاسخ به غیبت‌ها (Justification Timeliness)
  const justRate = totalAbsences > 0
    ? Math.min(100, (justificationsTimely / totalAbsences) * 100)
    : 100;

  // ۳. استمرار تعامل با پورتال (Portal Visits Frequency)
  // ۴ بار بازدید در ماه = ۱۰۰٪
  const visitScore = Math.min(100, (portalVisitsCount / 4) * 100);

  const rawScore = (0.40 * actionRate) + (0.35 * justRate) + (0.25 * visitScore);
  const score = roundTo(Math.max(0, Math.min(100, rawScore)), 1);

  let level = 'MODERATE';
  if (score >= 85) level = 'EXCELLENT';
  else if (score >= 70) level = 'ACTIVE';
  else if (score < 50) level = 'LOW_ENGAGEMENT';

  return {
    engagement_score: score,
    engagement_level: level,
    dimensions: {
      action_completion_rate: roundTo(actionRate, 1),
      justification_timeliness_rate: roundTo(justRate, 1),
      visit_score: roundTo(visitScore, 1)
    }
  };
}

module.exports = {
  enforceParentChildAccessGuard,
  buildParent360Profile,
  generateParentActionItems,
  validateAbsenceJustification,
  calculateParentEngagementIndex
};
