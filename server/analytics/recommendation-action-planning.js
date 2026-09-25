/**
 * ماژول موتور پیشنهاددهنده و برنامه‌ریزی اقدام آموزشی (P0-EI-13)
 * Educational Intelligence Recommendation & Action Planning Engine
 * 
 * ویژگی‌های کلیدی:
 *  - ۱) گارد امنیتی و کنترل دسترسی چندمستأجری (enforceRecommendationAccessGuard)
 *  - ۲) تولید پیشنهادهای عملیاتی توضیح‌پذیر از سیگنال‌های ترکیبی (generateActionRecommendations)
 *  - ۳) اولویت‌بندی عینی جبری بر مبنای اثرگذاری، فوریت و استحکام شواهد (prioritizeActions)
 *  - ۴) تخصیص هوشمند نقش متولی مسئول بر مبنای ماهیت اقدام (assignActionOwner)
 *  - ۵) هدایت ماشین چرخه حیات اقدام با تایید انسانی (transitionActionStatus)
 *  - ۶) سنجش اثربخشی چرخه بسته و محاسبه دلتای قبل و بعد (evaluateActionEffectiveness)
 *  - ۷) ساخت تابلوی اقدامات مدیر مدرسه با تفکیک افق‌های زمانی (generatePrincipalActionBoard)
 * 
 * اصول غیرقابل مذاکره:
 *  - ممنوعیت مطلق رتبه‌بندی، League Table، و مقایسه رقابتی بین مدارس
 *  - نظارت و تایید قطعی انسانی (Human-in-the-Loop): ممنوعیت تصمیم‌گیری خودکار
 *  - قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت در ۱۰ اجرای متوالی
 *  - ایمنی کامل در برابر جهش داده‌ها با فریز عمیق اشیا (deepFreeze Mutation Safety)
 *  - شکست ایمن (Fail-Closed) در کلیه سطوح ایزولاسیون چندمستأجری
 */

'use strict';

// حوزه‌های اقدام آموزشی
const ACTION_TYPES = Object.freeze({
  ATTENDANCE_SUPPORT: 'ATTENDANCE_SUPPORT',
  ACADEMIC_REMEDIAL: 'ACADEMIC_REMEDIAL',
  TEACHER_DEVELOPMENT: 'TEACHER_DEVELOPMENT',
  REGIONAL_RESOURCE: 'REGIONAL_RESOURCE',
  PARENT_COLLABORATION: 'PARENT_COLLABORATION'
});

// وضعیت‌های چرخه حیات اقدام
const ACTION_STATUSES = Object.freeze({
  GENERATED: 'GENERATED',
  REVIEW_PENDING: 'REVIEW_PENDING',
  APPROVED: 'APPROVED',
  IN_PROGRESS: 'IN_PROGRESS',
  EVALUATING: 'EVALUATING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
});

// سطوح اولویت اقدام
const PRIORITY_LEVELS = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
});

// سطوح اثربخشی اقدام
const ACTION_EFFICACY = Object.freeze({
  HIGHLY_EFFECTIVE: 'HIGHLY_EFFECTIVE',
  PARTIALLY_EFFECTIVE: 'PARTIALLY_EFFECTIVE',
  INEFFECTIVE: 'INEFFECTIVE',
  REQUIRES_ESCALATION: 'REQUIRES_ESCALATION'
});

// ترنزیشن‌های مجاز ماشین چرخه حیات
const ALLOWED_LIFECYCLE_TRANSITIONS = Object.freeze({
  GENERATED: Object.freeze(['REVIEW_PENDING']),
  REVIEW_PENDING: Object.freeze(['APPROVED', 'CANCELLED']),
  APPROVED: Object.freeze(['IN_PROGRESS', 'CANCELLED']),
  IN_PROGRESS: Object.freeze(['EVALUATING', 'COMPLETED', 'CANCELLED']),
  EVALUATING: Object.freeze(['COMPLETED', 'IN_PROGRESS', 'CANCELLED']),
  COMPLETED: Object.freeze([]),
  CANCELLED: Object.freeze([])
});

/**
 * فریز عمیق و بازگشتی برای تضمین پایداری در برابر جهش و تغییر ناخواسته
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== null && typeof val === 'object') {
      deepFreeze(val);
    }
  }
  return obj;
}

/**
 * گارد امنیتی و کنترل دسترسی چندمستأجری سیستم پیشنهاددهنده (Fail-Closed)
 *
 * @param {Object} requester - کاربر درخواست‌دهنده (id, role, school_id, region_id)
 * @param {Object|number|string} targetEntity - مدرسه یا منطقه هدف
 * @param {Object} [options]
 * @returns {boolean}
 */
function enforceRecommendationAccessGuard(requester, targetEntity, options = {}) {
  if (!requester || typeof requester !== 'object') {
    throw new Error('RECOMMENDATION_ACCESS_FORBIDDEN: requester session is missing');
  }

  const role = requester.role;
  let targetSchoolId = null;
  let targetRegionId = null;

  if (typeof targetEntity === 'object' && targetEntity !== null) {
    targetSchoolId = targetEntity.school_id != null ? Number(targetEntity.school_id) : (targetEntity.schoolId != null ? Number(targetEntity.schoolId) : null);
    targetRegionId = targetEntity.region_id != null ? Number(targetEntity.region_id) : (targetEntity.regionId != null ? Number(targetEntity.regionId) : null);
  } else if (targetEntity != null) {
    targetSchoolId = Number(targetEntity);
  }

  // ۱. مدیر ارشد سامانه (Superadmin)
  if (role === 'superadmin') {
    return true;
  }

  // ۲. مدیر مدرسه (School Manager)
  if (role === 'manager') {
    const userSchoolId = requester.school_id != null ? Number(requester.school_id) : null;
    if (userSchoolId == null) {
      throw new Error('RECOMMENDATION_TENANT_ISOLATION_VIOLATION: manager lacks school_id assignment');
    }
    if (targetSchoolId != null && userSchoolId !== targetSchoolId) {
      throw new Error(`RECOMMENDATION_TENANT_ISOLATION_VIOLATION: manager of school ${userSchoolId} cannot access actions of school ${targetSchoolId}`);
    }
    return true;
  }

  // ۳. مشاور مدرسه (Counselor)
  if (role === 'counselor') {
    const userSchoolId = requester.school_id != null ? Number(requester.school_id) : null;
    if (userSchoolId == null) {
      throw new Error('RECOMMENDATION_TENANT_ISOLATION_VIOLATION: counselor lacks school_id assignment');
    }
    if (targetSchoolId != null && userSchoolId !== targetSchoolId) {
      throw new Error(`RECOMMENDATION_TENANT_ISOLATION_VIOLATION: counselor of school ${userSchoolId} cannot access school ${targetSchoolId}`);
    }
    return true;
  }

  // ۴. کارشناس اداره منطقه (Edu Office)
  if (role === 'edu_office') {
    const userRegionId = requester.region_id != null
      ? Number(requester.region_id)
      : (requester.office_id != null ? Number(requester.office_id) : null);

    if (userRegionId == null) {
      throw new Error('RECOMMENDATION_TENANT_ISOLATION_VIOLATION: edu_office user lacks region assignment');
    }
    if (targetRegionId != null && userRegionId !== targetRegionId) {
      throw new Error(`RECOMMENDATION_TENANT_ISOLATION_VIOLATION: edu_office region ${userRegionId} does not match target region ${targetRegionId}`);
    }
    return true;
  }

  // ۵. سایر نقش‌ها (دانش‌آموز، والد، معلم عمومی)
  throw new Error(`RECOMMENDATION_ACCESS_FORBIDDEN: role ${role} is not authorized to access recommendation engine`);
}

/**
 * تخصیص خودکار نقش متولی مسئول بر مبنای نوع اقدام
 *
 * @param {Object} recommendation
 * @param {Object} [context]
 * @returns {string}
 */
function assignActionOwner(recommendation = {}, context = {}) {
  const type = recommendation.action_type || recommendation.type || '';

  switch (type) {
    case ACTION_TYPES.ATTENDANCE_SUPPORT:
      return 'counselor';
    case ACTION_TYPES.ACADEMIC_REMEDIAL:
      return recommendation.scope === 'counseling' ? 'counselor' : 'teacher';
    case ACTION_TYPES.TEACHER_DEVELOPMENT:
      return 'manager'; // مدیر مدرسه (Principal)
    case ACTION_TYPES.REGIONAL_RESOURCE:
      return 'edu_office'; // کارشناس منطقه (DistrictOfficer)
    case ACTION_TYPES.PARENT_COLLABORATION:
      return 'counselor';
    default:
      return 'manager';
  }
}

/**
 * الگوریتم اولویت‌بندی عینی اقدامات بر مبنای Impact × Urgency × EvidenceStrength
 *
 * @param {Array<Object>} recommendations
 * @param {Object} [options]
 * @returns {Array<Object>}
 */
function prioritizeActions(recommendations = [], options = {}) {
  if (!Array.isArray(recommendations)) return deepFreeze([]);

  const scored = recommendations.map(rec => {
    // ضریب اثرگذاری (Impact: 1 تا 5)
    let impact = rec.impact != null ? Number(rec.impact) : 3;
    if (rec.severity === PRIORITY_LEVELS.CRITICAL) impact = 5;
    else if (rec.severity === PRIORITY_LEVELS.HIGH) impact = 4;
    else if (rec.severity === PRIORITY_LEVELS.MEDIUM) impact = 3;
    else if (rec.severity === PRIORITY_LEVELS.LOW) impact = 1;

    // ضریب فوریت (Urgency: 1 تا 5)
    let urgency = rec.urgency != null ? Number(rec.urgency) : 3;
    if (rec.deadline_type === '24H' || rec.is_24h) urgency = 5;
    else if (rec.deadline_type === 'WEEKLY') urgency = 3;

    // ضریب استحکام شواهد (EvidenceStrength: 1.0 تا 3.0)
    let evidenceStrength = rec.evidence_strength != null ? Number(rec.evidence_strength) : 2.0;
    if (rec.evidence && typeof rec.evidence === 'object') {
      if (rec.evidence.trend === 'DECLINING' && rec.evidence.threshold_exceeded) {
        evidenceStrength = 3.0;
      } else if (rec.evidence.threshold_exceeded) {
        evidenceStrength = 2.0;
      }
    }

    // فرمول قطعی: (Impact × Urgency × EvidenceStrength / 75) × 100
    const rawScore = (impact * urgency * evidenceStrength / 75) * 100;
    const priorityScore = Math.min(100, Math.max(0, Math.round(rawScore * 10) / 10));

    // سطح اولویت
    let priority = PRIORITY_LEVELS.MEDIUM;
    if (priorityScore >= 75) priority = PRIORITY_LEVELS.CRITICAL;
    else if (priorityScore >= 50) priority = PRIORITY_LEVELS.HIGH;
    else if (priorityScore >= 25) priority = PRIORITY_LEVELS.MEDIUM;
    else priority = PRIORITY_LEVELS.LOW;

    return {
      ...rec,
      impact,
      urgency,
      evidence_strength: evidenceStrength,
      priority_score: priorityScore,
      priority: rec.priority || priority,
      severity: rec.severity || priority
    };
  });

  // مرتب‌سازی اکیداً نزولی بر مبنای امتیاز اولویت درون همان واحد
  scored.sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));

  return deepFreeze(scored);
}

/**
 * تولید پیشنهادهای عملیاتی توضیح‌پذیر از سیگنال‌های تجمیعی هوشمندی
 *
 * @param {Object} params
 * @param {Object} [params.schoolSnapshot]
 * @param {Object} [params.regionalSnapshot]
 * @param {Object} [params.longitudinalInsights]
 * @param {Array} [params.interventionCases]
 * @param {number|string} [params.schoolId]
 * @param {Object} [options]
 * @returns {Array<Object>}
 */
function generateActionRecommendations(params = {}, options = {}) {
  const schoolId = Number(params.schoolId || params.school_id || 1);
  const now = options.now || '2026-09-18T10:00:00.000Z';
  const rawList = [];

  const sch = params.schoolSnapshot || {};
  const reg = params.regionalSnapshot || {};
  const lng = params.longitudinalInsights || {};
  const cases = Array.isArray(params.interventionCases) ? params.interventionCases : [];

  // ۱. ارزیابی سیگنال‌های غیبت و حضور
  // D1 (بازمانده): نرخ‌ها فقط وقتی موجودند که واقعاً در شات مدرسه باشند؛
  // مدرسه‌ای بدون دادهٔ حضور نباید با نرخ ۹۰/۵ ارزیابی شود.
  const attRate = sch.attendance_rate != null || sch.calendar_rate != null
    ? Number(sch.attendance_rate ?? sch.calendar_rate)
    : null;
  const chronicRate = sch.chronic_absence_rate != null ? Number(sch.chronic_absence_rate) : null;
  const attendanceKnown = attRate != null || chronicRate != null;

  const chronicAbsent = chronicRate != null && chronicRate >= 10.0;
  const attendanceLow = attRate != null && attRate < 85.0;

  if (attendanceKnown && (chronicAbsent || attendanceLow)) {
    rawList.push({
      recommendation_id: `ACT-REC-SCH${schoolId}-${now.replace(/[^0-9]/g, '').slice(0, 8)}-ATT01`,
      type: ACTION_TYPES.ATTENDANCE_SUPPORT,
      action_type: ACTION_TYPES.ATTENDANCE_SUPPORT,
      entity_type: 'school',
      entity_id: schoolId,
      trigger_source: 'ATTENDANCE_INTELLIGENCE',
      reason: 'chronic absence increasing',
      evidence: {
        absenceRate: chronicRate,
        chronic_absence_rate: chronicRate,
        current_value: chronicRate,
        threshold: 10.0,
        trend: 'DECLINING',
        threshold_exceeded: true
      },
      severity: chronicRate >= 15.0 ? PRIORITY_LEVELS.CRITICAL : PRIORITY_LEVELS.HIGH,
      priority: chronicRate >= 15.0 ? PRIORITY_LEVELS.CRITICAL : PRIORITY_LEVELS.HIGH,
      suggested_action: 'برگزاری جلسه هم‌اندیشی مشاور با اولیای دانش‌آموزان دارای بیش از ۴ روز غیبت غیرموجه و هماهنگی سرویس تردد',
      responsible_role: 'counselor',
      deadline: options.deadline || '2026-10-15',
      deadline_type: chronicRate >= 15.0 ? '24H' : 'WEEKLY',
      approval_status: ACTION_STATUSES.REVIEW_PENDING,
      status: ACTION_STATUSES.REVIEW_PENDING,
      automated_decision: false,
      requires_human_confirmation: true,
      requiresApproval: true,
      created_at: now,
      history: [
        { status: ACTION_STATUSES.GENERATED, timestamp: now, actor_id: null, note: 'تولید سیستمی پیشنهاد بر مبنای سیگنال غیبت مزمن' },
        { status: ACTION_STATUSES.REVIEW_PENDING, timestamp: now, actor_id: null, note: 'در انتظار بررسی و تصمیم‌گیری کادر مدرسه' }
      ]
    });
  }

  // ۲. ارزیابی سیگنال‌های تحصیلی و افت نمرات
  const avgGpa = Number(sch.average_gpa ?? 15.0);
  const failingRatio = Number(sch.failing_students_ratio ?? 0.05);

  if (avgGpa < 12.0 || failingRatio >= 0.10) {
    rawList.push({
      recommendation_id: `ACT-REC-SCH${schoolId}-${now.replace(/[^0-9]/g, '').slice(0, 8)}-ACA01`,
      type: ACTION_TYPES.ACADEMIC_REMEDIAL,
      action_type: ACTION_TYPES.ACADEMIC_REMEDIAL,
      entity_type: 'school',
      entity_id: schoolId,
      trigger_source: 'ASSESSMENT_INTELLIGENCE',
      reason: 'high failing student ratio detected',
      evidence: {
        average_gpa: avgGpa,
        failing_students_ratio: failingRatio,
        threshold_exceeded: true
      },
      severity: PRIORITY_LEVELS.HIGH,
      priority: PRIORITY_LEVELS.HIGH,
      suggested_action: 'تشکیل کارگاه تقویتی گام به گام و بازخورد تکوینی هفتگی با مشارکت معلمان دروس هدف',
      responsible_role: 'teacher',
      deadline: '2026-10-20',
      deadline_type: 'WEEKLY',
      approval_status: ACTION_STATUSES.REVIEW_PENDING,
      status: ACTION_STATUSES.REVIEW_PENDING,
      automated_decision: false,
      requires_human_confirmation: true,
      requiresApproval: true,
      created_at: now,
      history: [
        { status: ACTION_STATUSES.GENERATED, timestamp: now, actor_id: null, note: 'تولید سیستمی پیشنهاد بر مبنای افت شاخص نمرات' },
        { status: ACTION_STATUSES.REVIEW_PENDING, timestamp: now, actor_id: null, note: 'در انتظار تایید شورای آموزشی مدرسه' }
      ]
    });
  }

  // ۳. ارزیابی سیگنال‌های معلمان و بار کاری
  const overloadedTeachers = Number(sch.overloaded_teachers_count ?? 0);
  if (overloadedTeachers > 0) {
    rawList.push({
      recommendation_id: `ACT-REC-SCH${schoolId}-${now.replace(/[^0-9]/g, '').slice(0, 8)}-TEA01`,
      type: ACTION_TYPES.TEACHER_DEVELOPMENT,
      action_type: ACTION_TYPES.TEACHER_DEVELOPMENT,
      entity_type: 'school',
      entity_id: schoolId,
      trigger_source: 'TEACHER_EVIDENCE_FRAMEWORK',
      reason: 'teacher workload imbalance detected',
      evidence: {
        overloaded_teachers_count: overloadedTeachers,
        threshold_exceeded: true
      },
      severity: PRIORITY_LEVELS.MEDIUM,
      priority: PRIORITY_LEVELS.MEDIUM,
      suggested_action: 'تعدیل ساعات و توزیع هفتگی کلاس‌ها و معرفی به دوره بازآموزی روش‌های نوین سنجش تکوینی',
      responsible_role: 'manager',
      deadline: '2026-10-30',
      deadline_type: 'MONTHLY',
      approval_status: ACTION_STATUSES.REVIEW_PENDING,
      status: ACTION_STATUSES.REVIEW_PENDING,
      automated_decision: false,
      requires_human_confirmation: true,
      requiresApproval: true,
      created_at: now,
      history: [
        { status: ACTION_STATUSES.GENERATED, timestamp: now, actor_id: null, note: 'تولید سیستمی پیشنهاد بر مبنای بار کاری معلمان' },
        { status: ACTION_STATUSES.REVIEW_PENDING, timestamp: now, actor_id: null, note: 'در انتظار اقدام مدیر مدرسه' }
      ]
    });
  }

  // ۴. ارزیابی سیگنال‌های منابع منطقه‌ای
  const needsRegionalResource = sch.needs_regional_resource || (reg && reg.priority_support_needed_count > 0);
  if (needsRegionalResource) {
    rawList.push({
      recommendation_id: `ACT-REC-SCH${schoolId}-${now.replace(/[^0-9]/g, '').slice(0, 8)}-REG01`,
      type: ACTION_TYPES.REGIONAL_RESOURCE,
      action_type: ACTION_TYPES.REGIONAL_RESOURCE,
      entity_type: 'region',
      entity_id: Number(sch.region_id || reg.region_id || 1),
      trigger_source: 'REGIONAL_INTELLIGENCE_NETWORK',
      reason: 'regional resource support required',
      evidence: {
        school_id: schoolId,
        support_requested: true
      },
      severity: PRIORITY_LEVELS.HIGH,
      priority: PRIORITY_LEVELS.HIGH,
      suggested_action: 'ارجاع درخواست به اداره منطقه جهت تخصیص سهمیه مشاور بالینی و تجهیزات کمک‌آموزشی',
      responsible_role: 'edu_office',
      deadline: '2026-10-10',
      deadline_type: 'WEEKLY',
      approval_status: ACTION_STATUSES.REVIEW_PENDING,
      status: ACTION_STATUSES.REVIEW_PENDING,
      automated_decision: false,
      requires_human_confirmation: true,
      requiresApproval: true,
      created_at: now,
      history: [
        { status: ACTION_STATUSES.GENERATED, timestamp: now, actor_id: null, note: 'تولید پیشنهاد تخصیص منابع منطقه‌ای' },
        { status: ACTION_STATUSES.REVIEW_PENDING, timestamp: now, actor_id: null, note: 'در انتظار تایید اداره منطقه' }
      ]
    });
  }

  // اولویت‌بندی بر مبنای الگوریتم عینی
  return prioritizeActions(rawList, options);
}

/**
 * هدایت ماشین چرخه حیات اقدام با تایید و کنترل کاربر انسانی
 *
 * @param {Object} actionRecord
 * @param {Object} transition
 * @param {string} transition.to_status
 * @param {string} [transition.note]
 * @param {Object} [transition.actor]
 * @param {Object} [options]
 * @returns {Object} Updated Action Record
 */
function transitionActionStatus(actionRecord = {}, transition = {}, options = {}) {
  if (!actionRecord || typeof actionRecord !== 'object') {
    throw new Error('INVALID_INPUT: valid actionRecord is required');
  }

  const currentStatus = actionRecord.approval_status || actionRecord.status || ACTION_STATUSES.GENERATED;
  const toStatus = transition.to_status || transition.toStatus;

  if (!toStatus || !Object.values(ACTION_STATUSES).includes(toStatus)) {
    throw new Error(`INVALID_STATUS: ${toStatus} is not a valid action status`);
  }

  // اعتبارسنجی قوانین ترنزیشن
  const allowed = ALLOWED_LIFECYCLE_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new Error(`INVALID_ACTION_LIFECYCLE_TRANSITION: transition from ${currentStatus} to ${toStatus} is not allowed`);
  }

  // کنترل گارد امنیتی کاربر مجری در صورت ارائه
  if (transition.actor && typeof transition.actor === 'object') {
    enforceRecommendationAccessGuard(transition.actor, {
      school_id: actionRecord.entity_id,
      region_id: actionRecord.entity_type === 'region' ? actionRecord.entity_id : null
    }, options);
  }

  const timestamp = options.now || '2026-09-18T10:00:00.000Z';
  const newHistoryEntry = {
    status: toStatus,
    timestamp,
    actor_id: transition.actor?.id || null,
    actor_role: transition.actor?.role || null,
    note: transition.note || `تغییر وضعیت اقدام به ${toStatus}`
  };

  const updatedRecord = {
    ...actionRecord,
    approval_status: toStatus,
    status: toStatus,
    automated_decision: false,
    requires_human_confirmation: true,
    history: [...(actionRecord.history || []), newHistoryEntry]
  };

  return deepFreeze(updatedRecord);
}

/**
 * سنجش اثربخشی چرخه بسته و مقایسه متغیرهای قبل و بعد
 *
 * @param {Object} params
 * @param {Object} params.actionRecord
 * @param {Object} params.preMetrics
 * @param {Object} params.postMetrics
 * @param {Object} [options]
 * @returns {Object} ActionEffectivenessOutcome
 */
function evaluateActionEffectiveness(params = {}, options = {}) {
  const rec = params.actionRecord || params.action_record || {};
  const pre = params.preMetrics || params.pre_metrics || {};
  const post = params.postMetrics || params.post_metrics || {};

  // ۱. دلتای حضور
  const preAtt = Number(pre.attendance_rate ?? pre.calendar_rate ?? 85.0);
  const postAtt = Number(post.attendance_rate ?? post.calendar_rate ?? preAtt);
  const deltaAtt = Math.round((postAtt - preAtt) * 10) / 10;

  // دلتای کاهش غیبت مزمن (کاهش یعنی بهبود)
  const preChronic = Number(pre.chronic_absence_rate ?? 12.0);
  const postChronic = Number(post.chronic_absence_rate ?? preChronic);
  const deltaChronic = Math.round((postChronic - preChronic) * 10) / 10;

  // ۲. دلتای نمرات (GPA)
  const preGpa = Number(pre.average_gpa ?? pre.gpa ?? 14.0);
  const postGpa = Number(post.average_gpa ?? post.gpa ?? preGpa);
  const deltaGpa = Math.round((postGpa - preGpa) * 100) / 100;

  // ۳. دلتای مشارکت (Engagement)
  const preEng = Number(pre.engagement_score ?? pre.pei ?? 60.0);
  const postEng = Number(post.engagement_score ?? post.pei ?? preEng);
  const deltaEng = Math.round((postEng - preEng) * 10) / 10;

  // ارزیابی سطح اثربخشی
  let efficacy = ACTION_EFFICACY.INEFFECTIVE;

  const isAttendanceSuccess = deltaAtt >= 5.0 || deltaChronic <= -3.0;
  const isGpaSuccess = deltaGpa >= 1.0;
  const isMajorImprovement = isAttendanceSuccess || isGpaSuccess || deltaEng >= 15.0;

  const isWorsened = deltaChronic > 2.0 || deltaGpa < -1.0;

  if (isMajorImprovement) {
    efficacy = ACTION_EFFICACY.HIGHLY_EFFECTIVE;
  } else if (deltaAtt > 0 || deltaGpa > 0 || deltaEng > 0 || deltaChronic < 0) {
    efficacy = ACTION_EFFICACY.PARTIALLY_EFFECTIVE;
  } else if (isWorsened) {
    efficacy = ACTION_EFFICACY.REQUIRES_ESCALATION;
  } else {
    efficacy = ACTION_EFFICACY.INEFFECTIVE;
  }

  const outcome = {
    recommendation_id: rec.recommendation_id || 'UNKNOWN',
    efficacy,
    efficacy_level: efficacy,
    deltas: {
      attendance_rate: deltaAtt,
      chronic_absence_rate: deltaChronic,
      average_gpa: deltaGpa,
      engagement_score: deltaEng
    },
    pre_metrics: Object.freeze({ ...pre }),
    post_metrics: Object.freeze({ ...post }),
    automated_decision: false,
    requires_human_confirmation: true,
    evaluated_at: options.now || '2026-09-18T10:00:00.000Z'
  };

  return deepFreeze(outcome);
}

/**
 * تولید تابلوی اقدامات تفکیک‌شده مدیر مدرسه (Principal Action Board)
 *
 * @param {Object} params
 * @param {Array<Object>} [params.recommendations]
 * @param {number|string} [params.schoolId]
 * @param {Object} [options]
 * @returns {Object}
 */
function generatePrincipalActionBoard(params = {}, options = {}) {
  const schoolId = Number(params.schoolId || params.school_id || 1);
  const rawRecs = Array.isArray(params.recommendations) ? params.recommendations : [];

  const immediate24h = [];
  const weekly = [];
  const districtSupport = [];

  for (const r of rawRecs) {
    // اقدامات نیازمند پشتیبانی منطقه
    if (r.action_type === ACTION_TYPES.REGIONAL_RESOURCE || r.responsible_role === 'edu_office' || r.entity_type === 'region') {
      districtSupport.push(r);
      continue;
    }

    // اقدامات فوری ۲۴ ساعته
    if (r.priority === PRIORITY_LEVELS.CRITICAL || r.severity === PRIORITY_LEVELS.CRITICAL || r.deadline_type === '24H' || r.urgency >= 5) {
      immediate24h.push(r);
      continue;
    }

    // اقدامات هفتگی
    weekly.push(r);
  }

  const board = {
    school_id: schoolId,
    generated_at: options.now || '2026-09-18T10:00:00.000Z',
    immediate_24h_actions: Object.freeze(immediate24h),
    weekly_actions: Object.freeze(weekly),
    district_support_needed_actions: Object.freeze(districtSupport),
    total_actions_count: rawRecs.length,
    automated_decision: false,
    requires_human_confirmation: true,
    zero_ranking_policy_enforced: true,
    is_ranked: false,
    ranking_score: null,
    league_table: null,
    best_school: null,
    worst_school: null
  };

  return deepFreeze(board);
}

module.exports = {
  ACTION_TYPES,
  ACTION_STATUSES,
  PRIORITY_LEVELS,
  ACTION_EFFICACY,
  ALLOWED_LIFECYCLE_TRANSITIONS,
  enforceRecommendationAccessGuard,
  assignActionOwner,
  prioritizeActions,
  generateActionRecommendations,
  transitionActionStatus,
  evaluateActionEffectiveness,
  generatePrincipalActionBoard
};
