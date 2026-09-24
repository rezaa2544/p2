/**
 * ماژول مدیریت پرونده‌های مداخله زودهنگام (P0-EI-08)
 * Intervention Case Management & Early Warning Engine
 * 
 * ویژگی‌های کلیدی:
 *  - ۱) گارد امنیتی پرونده‌های مداخله و حریم خصوصی مشاوره‌ای (Anti-IDOR & Privacy Guard)
 *  - ۲) ارزیابی قوانین هشدار زودهنگام قاعده‌محور (evaluateEarlyWarningRules)
 *  - ۳) ایجاد و مقداردهی اولیه پرونده مداخله (createInterventionCase)
 *  - ۴) تدوین و ثبت برنامه اقدام مداخله‌ای (planInterventionAction)
 *  - ۵) مدیریت ماشین حالت و تغییر وضعیت پرونده (transitionCaseStatus)
 *  - ۶) سنجش اثربخشی و مقایسه متغیرهای قبل و بعد مداخله (evaluateInterventionOutcome)
 *  - ۷) تجمیع و تحلیل پرونده‌های مداخله مدرسه (summarizeSchoolInterventions)
 * 
 * اصول حاکم:
 *  - شکست ایمن (Fail-Closed) در غیاب پارامترها یا نشت داده‌های چندمستأجری
 *  - تصمیم‌گیری حساس با نظارت انسان (Human-in-the-Loop)
 *  - محرمانگی ارزیابی‌های بالینی مشاوره‌ای در برابر دسترسی غیرمجاز
 *  - قطعیت ۱۰۰٪ و پایداری در برابر جهش اشیای منجمد (Object.freeze)
 */

'use strict';

// وضعیت‌های مجاز چرخه حیات پرونده
const VALID_CASE_STATUSES = Object.freeze([
  'OPEN',
  'UNDER_REVIEW',
  'INTERVENTION_ACTIVE',
  'EVALUATING',
  'RESOLVED',
  'ESCALATED'
]);

// ماتریس انتقال وضعیت مجاز
const ALLOWED_TRANSITIONS = Object.freeze({
  OPEN: ['UNDER_REVIEW', 'INTERVENTION_ACTIVE'],
  UNDER_REVIEW: ['INTERVENTION_ACTIVE', 'RESOLVED', 'ESCALATED'],
  INTERVENTION_ACTIVE: ['EVALUATING', 'RESOLVED', 'ESCALATED'],
  EVALUATING: ['RESOLVED', 'ESCALATED', 'INTERVENTION_ACTIVE'],
  RESOLVED: ['OPEN', 'UNDER_REVIEW'], // امکان بازگشایی در صورت بازگشت ریسک
  ESCALATED: ['UNDER_REVIEW', 'INTERVENTION_ACTIVE', 'RESOLVED']
});

/**
 * گارد امنیتی پرونده‌های مداخله و حریم خصوصی مشاوره‌ای (Anti-IDOR Guard)
 *
 * @param {Object} requester - کاربر درخواست‌دهنده (id, role, school_id)
 * @param {Object} caseRecord - رکورد پرونده مداخله
 * @param {Object} [options]
 * @returns {boolean}
 */
function enforceInterventionAccessGuard(requester, caseRecord, options = {}) {
  if (!requester || typeof requester !== 'object') {
    throw new Error('INTERVENTION_ACCESS_FORBIDDEN: requester session is missing');
  }
  if (!caseRecord || typeof caseRecord !== 'object') {
    throw new Error('INVALID_INPUT: valid caseRecord is required');
  }

  const role = requester.role;
  const caseSchoolId = caseRecord.school_id != null ? Number(caseRecord.school_id) : null;
  const requesterSchoolId = requester.school_id != null ? Number(requester.school_id) : null;

  // ۱. مدیر سامانه و بازرس آموزش و پرورش
  if (role === 'superadmin' || role === 'edu_office') {
    return true;
  }

  // ۲. مدیر مدرسه و مشاور فقط به پرونده‌های مدرسه خود دسترسی دارند
  if (role === 'manager' || role === 'counselor') {
    if (caseSchoolId != null && requesterSchoolId != null && caseSchoolId !== requesterSchoolId) {
      throw new Error(`TENANT_ISOLATION_VIOLATION: ${role} cannot access intervention cases of another school`);
    }
    return true;
  }

  // ۳. معلم فقط در صورتی مجاز است که اکشن آموزشی مشخصی به او محول شده باشد
  if (role === 'teacher') {
    if (options.actionOnly === true && Number(caseRecord.assigned_to_id) === Number(requester.id)) {
      return true;
    }
    throw new Error('INTERVENTION_ACCESS_FORBIDDEN: teachers are prohibited from accessing full confidential counseling notes');
  }

  // ۴. دانش‌آموز، والد و راننده اکیداً دسترسی به پرونده‌های محرمانه مشاوره‌ای ندارند
  throw new Error(`INTERVENTION_ACCESS_FORBIDDEN: role ${role} is strictly forbidden from accessing intervention case files`);
}

/**
 * ارزیابی قوانین هشدار زودهنگام قاعده‌محور (Early Warning Rules)
 *
 * @param {Object} studentContext
 * @param {number|string} studentContext.studentId
 * @param {number|string} studentContext.schoolId
 * @param {number} studentContext.currentGpa
 * @param {number} [studentContext.previousGpa]
 * @param {number} [studentContext.recentAttendanceRate]
 * @param {number} [studentContext.consecutiveAbsences]
 * @param {number} [studentContext.failingSubjectsCount]
 * @param {number} [studentContext.unsubmittedAssignmentsCount]
 * @param {Object} [options]
 * @returns {Object} EarlyWarningDetection
 */
function evaluateEarlyWarningRules(studentContext = {}, options = {}) {
  const studentId = Number(studentContext.studentId || studentContext.student_id);
  const schoolId = Number(studentContext.schoolId || studentContext.school_id);

  if (!studentId || isNaN(studentId)) {
    throw new Error('INVALID_INPUT: valid studentId is required for evaluateEarlyWarningRules');
  }
  if (!schoolId || isNaN(schoolId)) {
    throw new Error('INVALID_INPUT: valid schoolId is required for evaluateEarlyWarningRules');
  }

  const currentGpa = studentContext.currentGpa != null || studentContext.current_gpa != null
    ? Number(studentContext.currentGpa ?? studentContext.current_gpa)
    : null;
  const previousGpa = studentContext.previousGpa != null ? Number(studentContext.previousGpa) : null;
  // D1: پیش‌تر وقتی داده‌ای نبود، حضور ۱۰۰٪ فرض می‌شد و دانش‌آموز «بدون ریسک»
  // گزارش می‌شد — همین حالا یک دانش‌آموز با صفر داده، has_critical_risk:false
  // برمی‌گرداند. اکنون غیبت داده، خودش یک سیگنال نیازمند توجه است.
  const hasAttendanceInput = studentContext.recentAttendanceRate != null || studentContext.recent_attendance_rate != null;
  const recentAttendanceRate = hasAttendanceInput
    ? Number(studentContext.recentAttendanceRate ?? studentContext.recent_attendance_rate)
    : null;
  const consecutiveAbsences = Number(studentContext.consecutiveAbsences ?? studentContext.consecutive_absences ?? 0);
  const failingSubjects = Number(studentContext.failingSubjectsCount ?? studentContext.failing_subjects_count ?? 0);
  const unsubmitted = Number(studentContext.unsubmittedAssignmentsCount ?? studentContext.unsubmitted_assignments_count ?? 0);

  const alerts = [];

  // قاعده ۰ (جدید — ضد پنهان‌سازی): داده ناکافی
  const hasGpa = currentGpa !== null;
  if (!hasGpa && !hasAttendanceInput) {
    alerts.push({
      trigger_type: 'INSUFFICIENT_DATA',
      priority: 'MEDIUM',
      title: 'داده کافی برای ارزیابی ریسک وجود ندارد',
      reason: 'هم معدل و هم نرخ حضور این دانش‌آموز نامشخص است؛ امکان شناسایی افت تحصیلی وجود ندارد.'
    });
  }

  // قاعده ۱: ریسک مرکب ترک تحصیل (Compound Dropout Risk) - اولویت بحرانی
  if (hasGpa && recentAttendanceRate !== null && currentGpa < 10.0 && (recentAttendanceRate <= 85.0 || consecutiveAbsences >= 4)) {
    alerts.push({
      trigger_type: 'DROPOUT_RISK_COMPOUND',
      priority: 'CRITICAL',
      title: 'خطر فوری ترک تحصیل و افت مرکب',
      reason: `معدل زیر ۱۰ (${currentGpa}) همزمان با حضور نامطلوب (${recentAttendanceRate}٪)`
    });
  }

  // قاعده ۲: افت شدید تحصیلی (Academic Drop)
  if (hasGpa && (currentGpa < 10.0 || (previousGpa != null && (previousGpa - currentGpa) >= 3.0))) {
    alerts.push({
      trigger_type: 'CRITICAL_ACADEMIC_DROP',
      priority: 'HIGH',
      title: 'افت تحصیلی حاد',
      reason: previousGpa != null && (previousGpa - currentGpa) >= 3.0
        ? `افت بیش از ۳ نمره نسبت به دوره قبل (${previousGpa} → ${currentGpa})`
        : `معدل زیر حد قبولی (${currentGpa})`
    });
  }

  // قاعده ۳: غیبت مزمن یا غیبت‌های متوالی (Chronic Absence)
  if (recentAttendanceRate !== null && (recentAttendanceRate <= 90.0 || consecutiveAbsences >= 3)) {
    alerts.push({
      trigger_type: 'CHRONIC_ABSENCE_ALERT',
      priority: 'HIGH',
      title: 'هشدار غیبت مزمن و متوالی',
      reason: consecutiveAbsences >= 3
        ? `${consecutiveAbsences} جلسه غیبت متوالی ثبت شده است`
        : `نرخ حضور ${recentAttendanceRate}٪ در آستانه غیبت مزمن است`
    });
  }

  // قاعده ۴: قطع ارتباط و افت مشارکت درسی (Disengagement)
  if (unsubmitted >= 3 || failingSubjects >= 2) {
    alerts.push({
      trigger_type: 'DISENGAGEMENT_ALERT',
      priority: 'MEDIUM',
      title: 'افت مشارکت و تکالیف انجام‌نشده',
      reason: `${failingSubjects} درس زیر حد نصاب و ${unsubmitted} تکلیف تحویل‌نشده`
    });
  }

  // مرتب‌سازی اولویت‌ها: CRITICAL -> HIGH -> MEDIUM
  const priorityWeight = { CRITICAL: 3, HIGH: 2, MEDIUM: 1 };
  alerts.sort((a, b) => (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0));

  const hasCriticalRisk = alerts.some(a => a.priority === 'CRITICAL');
  const highestPriority = alerts.length > 0 ? alerts[0].priority : 'NONE';

  return {
    student_id: studentId,
    school_id: schoolId,
    alerts: Object.freeze(alerts),
    has_critical_risk: hasCriticalRisk,
    highest_priority: highestPriority,
    data_sufficiency: (hasGpa || hasAttendanceInput) ? 'SUFFICIENT' : 'INSUFFICIENT'
  };
}

/**
 * ایجاد و مقداردهی اولیه پرونده مداخله زودهنگام
 *
 * @param {Object} params
 * @param {number|string} params.studentId
 * @param {number|string} params.schoolId
 * @param {string} params.triggerType
 * @param {string} [params.priority]
 * @param {Object} [params.baselineMetrics]
 * @param {string} [params.assignedRole]
 * @param {number|string} [params.assignedToId]
 * @param {number|string} [params.creatorId]
 * @param {string} [params.notes]
 * @param {Object} [options]
 * @returns {Object} InterventionCase
 */
function createInterventionCase(params = {}, options = {}) {
  const studentId = Number(params.studentId || params.student_id);
  const schoolId = Number(params.schoolId || params.school_id);
  const triggerType = params.triggerType || params.trigger_type;

  if (!studentId || isNaN(studentId)) {
    throw new Error('INVALID_INPUT: valid studentId is required for createInterventionCase');
  }
  if (!schoolId || isNaN(schoolId)) {
    throw new Error('INVALID_INPUT: valid schoolId is required for createInterventionCase');
  }
  if (!triggerType || typeof triggerType !== 'string') {
    throw new Error('INVALID_INPUT: triggerType is required for createInterventionCase');
  }

  const caseId = params.caseId || params.case_id || (options.caseId || `CASE-${schoolId}-${studentId}-${options.now ? options.now.replace(/[^0-9]/g, '').slice(0, 14) : 'INIT'}`);
  const priority = params.priority || 'HIGH';
  const assignedRole = params.assignedRole || params.assigned_role || 'counselor';
  const assignedToId = params.assignedToId || params.assigned_to_id ? Number(params.assignedToId || params.assigned_to_id) : null;
  const creatorId = params.creatorId || params.creator_id ? Number(params.creatorId || params.creator_id) : null;

  const createdAt = options.now || new Date().toISOString();

  const baseline = params.baselineMetrics || params.baseline_metrics || {};
  const baselineMetrics = {
    gpa: Number(baseline.gpa ?? 10.0),
    attendance_rate: Number(baseline.attendance_rate ?? baseline.attendanceRate ?? 85.0),
    failing_subjects_count: Number(baseline.failing_subjects_count ?? baseline.failingSubjectsCount ?? 0)
  };

  const initialHistoryEntry = {
    status: 'OPEN',
    timestamp: createdAt,
    updated_by: creatorId,
    note: params.notes || 'پرونده مداخله توسط سامانه هشدار زودهنگام تشکیل شد'
  };

  return {
    case_id: caseId,
    student_id: studentId,
    school_id: schoolId,
    trigger_type: triggerType,
    priority: priority,
    status: 'OPEN',
    created_at: createdAt,
    assigned_role: assignedRole,
    assigned_to_id: assignedToId,
    baseline_metrics: Object.freeze(baselineMetrics),
    action_plan: null,
    outcome_assessment: null,
    history: Object.freeze([initialHistoryEntry])
  };
}

/**
 * تدوین و ثبت برنامه اقدام مداخله‌ای (InterventionActionPlan)
 *
 * @param {Object} params
 * @param {Object} params.caseRecord - پرونده مداخله
 * @param {string} params.strategyType - استراتژی ('ACADEMIC', 'COUNSELING', 'COMBINED')
 * @param {Array} params.interventions - آرایه اقدامات مشخص
 * @param {string} [params.startDate]
 * @param {string} [params.reviewDeadline]
 * @param {Object} [params.expectedGoals]
 * @param {number|string} params.plannerId - شناسه فرد تدوین‌کننده (مشاور/مدیر)
 * @param {Object} [options]
 * @returns {Object} Updated InterventionCase
 */
function planInterventionAction(params = {}, options = {}) {
  const caseRecord = params.caseRecord || params.case_record;
  if (!caseRecord || typeof caseRecord !== 'object') {
    throw new Error('INVALID_INPUT: valid caseRecord is required for planInterventionAction');
  }

  const rawInterventions = Array.isArray(params.interventions) ? params.interventions : [];
  if (rawInterventions.length === 0) {
    throw new Error('INVALID_INPUT: at least one intervention action must be specified');
  }

  const plannerId = Number(params.plannerId || params.planner_id);
  if (!plannerId || isNaN(plannerId)) {
    throw new Error('HUMAN_IN_THE_LOOP_REQUIRED: intervention planning requires an authorized human plannerId');
  }

  const actionPlan = {
    strategy_type: params.strategyType || params.strategy_type || 'COMBINED',
    interventions: rawInterventions.map(act => ({
      type: act.type || 'COUNSELING_SESSION',
      responsible_role: act.responsible_role || 'counselor',
      responsible_id: act.responsible_id ? Number(act.responsible_id) : plannerId,
      description: act.description || 'جلسه مداخله و پیگیری آموزشی',
      target_date: act.target_date || null
    })),
    start_date: params.startDate || params.start_date || (options.now || new Date().toISOString().split('T')[0]),
    review_deadline: params.reviewDeadline || params.review_deadline || null,
    expected_goals: params.expectedGoals || params.expected_goals || {
      target_gpa: Math.min(20, (caseRecord.baseline_metrics?.gpa || 10) + 2.0),
      target_attendance_rate: 90.0
    }
  };

  const timestamp = options.now || new Date().toISOString();
  const historyEntry = {
    status: 'INTERVENTION_ACTIVE',
    timestamp: timestamp,
    updated_by: plannerId,
    note: 'برنامه مداخله تدوین و پرونده وارد فاز اجرایی شد'
  };

  return {
    ...caseRecord,
    status: 'INTERVENTION_ACTIVE',
    action_plan: Object.freeze(actionPlan),
    history: Object.freeze([...caseRecord.history, historyEntry])
  };
}

/**
 * مدیریت تغییر وضعیت پرونده مداخله (State Machine Transition)
 *
 * @param {Object} caseRecord
 * @param {string} newStatus
 * @param {Object} transitionMetadata
 * @param {number|string} transitionMetadata.actorId
 * @param {string} transitionMetadata.actorRole
 * @param {string} [transitionMetadata.note]
 * @param {Object} [options]
 * @returns {Object} Updated InterventionCase
 */
function transitionCaseStatus(caseRecord, newStatus, transitionMetadata = {}, options = {}) {
  if (!caseRecord || typeof caseRecord !== 'object') {
    throw new Error('INVALID_INPUT: caseRecord is required for transitionCaseStatus');
  }
  if (!VALID_CASE_STATUSES.includes(newStatus)) {
    throw new Error(`INVALID_STATUS: status ${newStatus} is not a recognized case status`);
  }

  const currentStatus = caseRecord.status;
  const allowedNext = ALLOWED_TRANSITIONS[currentStatus] || [];
  if (!allowedNext.includes(newStatus)) {
    throw new Error(`ILLEGAL_STATE_TRANSITION: cannot transition intervention case from ${currentStatus} to ${newStatus}`);
  }

  const actorId = Number(transitionMetadata.actorId || transitionMetadata.actor_id);
  const actorRole = transitionMetadata.actorRole || transitionMetadata.actor_role;
  if (!actorId || isNaN(actorId) || !actorRole) {
    throw new Error('HUMAN_IN_THE_LOOP_REQUIRED: valid human actorId and actorRole are required to transition case status');
  }

  const timestamp = options.now || new Date().toISOString();
  const historyEntry = {
    status: newStatus,
    timestamp: timestamp,
    updated_by: actorId,
    role: actorRole,
    note: transitionMetadata.note || `وضعیت پرونده به ${newStatus} تغییر یافت`
  };

  return {
    ...caseRecord,
    status: newStatus,
    history: Object.freeze([...caseRecord.history, historyEntry])
  };
}

/**
 * سنجش اثربخشی و مقایسه متغیرهای قبل و بعد مداخله
 *
 * @param {Object} params
 * @param {Object} params.caseRecord
 * @param {Object} params.postMetrics - نمرات و حضور بعد از مداخله
 * @param {number|string} params.evaluatorId
 * @param {string} [params.evaluatorRole]
 * @param {string} [params.notes]
 * @param {Object} [options]
 * @returns {Object} InterventionOutcomeAssessment
 */
function evaluateInterventionOutcome(params = {}, options = {}) {
  const caseRecord = params.caseRecord || params.case_record;
  if (!caseRecord || typeof caseRecord !== 'object') {
    throw new Error('INVALID_INPUT: valid caseRecord is required for evaluateInterventionOutcome');
  }

  const pre = caseRecord.baseline_metrics || {};
  const post = params.postMetrics || params.post_metrics || {};

  const preGpa = Number(pre.gpa ?? 10.0);
  const postGpa = Number(post.gpa ?? preGpa);
  const preAtt = Number(pre.attendance_rate ?? 85.0);
  const postAtt = Number(post.attendance_rate ?? preAtt);

  const deltaGpa = Math.round((postGpa - preGpa) * 100) / 100;
  const deltaAtt = Math.round((postAtt - preAtt) * 100) / 100;

  // تعیین سطح اثربخشی
  let efficacyLevel = 'INEFFECTIVE';
  let recommendation = 'CONTINUE_INTERVENTION';

  if (deltaGpa <= -2.0 || deltaAtt <= -10.0) {
    efficacyLevel = 'REQUIRES_ESCALATION';
    recommendation = 'ESCALATE';
  } else if (deltaGpa >= 2.0 || (deltaAtt >= 10.0 && postAtt >= 90.0)) {
    efficacyLevel = 'HIGHLY_EFFECTIVE';
    recommendation = 'CLOSURE';
  } else if (deltaGpa > 0 || deltaAtt > 0) {
    efficacyLevel = 'PARTIALLY_EFFECTIVE';
    recommendation = 'CONTINUE_INTERVENTION';
  }

  const evaluatorId = Number(params.evaluatorId || params.evaluator_id);
  const evaluatorRole = params.evaluatorRole || params.evaluator_role || 'counselor';

  return {
    case_id: caseRecord.case_id,
    student_id: caseRecord.student_id,
    school_id: caseRecord.school_id,
    evaluation_date: options.now || new Date().toISOString().split('T')[0],
    evaluator_id: evaluatorId || null,
    evaluator_role: evaluatorRole,
    pre_metrics: {
      gpa: preGpa,
      attendance_rate: preAtt
    },
    post_metrics: {
      gpa: postGpa,
      attendance_rate: postAtt
    },
    delta_gpa: deltaGpa,
    delta_attendance_rate: deltaAtt,
    efficacy_level: efficacyLevel,
    recommendation: recommendation,
    notes: params.notes || null
  };
}

/**
 * تجمیع و تحلیل وضعیت پرونده‌های مداخله در سطح مدرسه
 *
 * @param {Array} cases - لیست پرونده‌های مدرسه
 * @param {Object} [options]
 * @param {number|string} [options.schoolId]
 * @returns {Object} SchoolInterventionSummary
 */
function summarizeSchoolInterventions(cases = [], options = {}) {
  const rawCases = Array.isArray(cases) ? cases : [];
  const targetSchoolId = options.schoolId != null ? Number(options.schoolId) : null;

  for (const c of rawCases) {
    if (targetSchoolId != null && c.school_id != null && Number(c.school_id) !== targetSchoolId) {
      throw new Error(`TENANT_ISOLATION_VIOLATION: case record has school_id ${c.school_id} differing from target ${targetSchoolId}`);
    }
  }

  const statusBreakdown = {
    OPEN: 0,
    UNDER_REVIEW: 0,
    INTERVENTION_ACTIVE: 0,
    EVALUATING: 0,
    RESOLVED: 0,
    ESCALATED: 0
  };

  let highPriorityUnassigned = 0;
  let effectiveCount = 0;
  let evaluatedCount = 0;

  for (const c of rawCases) {
    const s = c.status || 'OPEN';
    statusBreakdown[s] = (statusBreakdown[s] || 0) + 1;

    if ((s === 'OPEN' || s === 'UNDER_REVIEW') && (c.priority === 'CRITICAL' || c.priority === 'HIGH') && !c.assigned_to_id) {
      highPriorityUnassigned++;
    }

    if (c.outcome_assessment) {
      evaluatedCount++;
      if (c.outcome_assessment.efficacy_level === 'HIGHLY_EFFECTIVE' || c.outcome_assessment.efficacy_level === 'PARTIALLY_EFFECTIVE') {
        effectiveCount++;
      }
    }
  }

  const total = rawCases.length;
  const activeCasesCount = statusBreakdown.OPEN + statusBreakdown.UNDER_REVIEW + statusBreakdown.INTERVENTION_ACTIVE + statusBreakdown.EVALUATING;
  const resolutionRate = total > 0 ? Math.round(((statusBreakdown.RESOLVED / total) * 100) * 100) / 100 : 0;
  const effectiveRatio = evaluatedCount > 0 ? Math.round((effectiveCount / evaluatedCount) * 100) / 100 : 1.0;

  return {
    school_id: targetSchoolId,
    total_cases: total,
    status_breakdown: Object.freeze(statusBreakdown),
    active_cases_count: activeCasesCount,
    resolution_rate: resolutionRate,
    high_priority_unassigned_count: highPriorityUnassigned,
    effective_interventions_ratio: effectiveRatio
  };
}

module.exports = {
  VALID_CASE_STATUSES,
  ALLOWED_TRANSITIONS,
  enforceInterventionAccessGuard,
  evaluateEarlyWarningRules,
  createInterventionCase,
  planInterventionAction,
  transitionCaseStatus,
  evaluateInterventionOutcome,
  summarizeSchoolInterventions
};
