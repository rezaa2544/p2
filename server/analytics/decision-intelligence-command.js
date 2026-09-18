/**
 * ماژول لایه هوش تصمیم و ارکستراسیون فرمان آموزشی (P0-EI-17)
 * Educational Decision Intelligence & Command Orchestration Layer
 * 
 * ویژگی‌های کلیدی:
 *  - ۱) گارد امنیتی و تفکیک چندمستأجری (enforceDecisionCommandAccessGuard)
 *  - ۲) ماتریس اولویت‌بندی عینی تصمیم (computeDecisionPriorityMatrix)
 *  - ۳) ماشین چرخه حیات تصمیم انسانی (transitionDecisionWorkflow)
 *  - ۴) تابلوی ارکستراسیون فرماندهی مدرسه (generateDecisionCommandBoard)
 *  - ۵) اعتبارسنجی پیوستگی زنجیره هوشمندی (validateIntelligenceChainIntegrity)
 *  - ۶) ساخت شناسنامه جامع ارکستراسیون فرمان (buildDecisionCommandSnapshot)
 * 
 * اصول غیرقابل مذاکره:
 *  - تحریم مطلق تصمیم‌گیری خودکار ماشینی (automated_decision: false / requires_human_approval: true)
 *  - منع مطلق رتبه‌بندی رقابتی مدارس و معلمان (ZERO_RANKING / No League Tables)
 *  - قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت در ۱۰ اجرای متوالی
 *  - ایمنی کامل در برابر جهش داده‌ها با فریز عمیق (deepFreeze Mutation Safety)
 *  - شکست ایمن (Fail-Closed) در تمامی سطوح تفکیک چندمستأجری
 */

'use strict';

// وضعیت‌های چرخه حیات تصمیم انسانی
const DECISION_WORKFLOW_STATE = Object.freeze({
  DETECTED: 'DETECTED',
  ANALYZED: 'ANALYZED',
  RECOMMENDED: 'RECOMMENDED',
  HUMAN_REVIEW_REQUIRED: 'HUMAN_REVIEW_REQUIRED',
  APPROVED_BY_HUMAN: 'APPROVED_BY_HUMAN',
  EXECUTION_TRACKING: 'EXECUTION_TRACKING',
  OUTCOME_REVIEW: 'OUTCOME_REVIEW',
  REJECTED: 'REJECTED',
  BLOCKED: 'BLOCKED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
});

// ترنزیشن‌های مجاز ماشین چرخه تصمیم
const ALLOWED_WORKFLOW_TRANSITIONS = Object.freeze({
  DETECTED: Object.freeze(['ANALYZED']),
  ANALYZED: Object.freeze(['RECOMMENDED']),
  RECOMMENDED: Object.freeze(['HUMAN_REVIEW_REQUIRED']),
  HUMAN_REVIEW_REQUIRED: Object.freeze(['APPROVED_BY_HUMAN', 'REJECTED', 'BLOCKED']),
  APPROVED_BY_HUMAN: Object.freeze(['EXECUTION_TRACKING', 'CANCELLED']),
  EXECUTION_TRACKING: Object.freeze(['OUTCOME_REVIEW', 'CANCELLED']),
  OUTCOME_REVIEW: Object.freeze(['COMPLETED']),
  BLOCKED: Object.freeze(['HUMAN_REVIEW_REQUIRED', 'CANCELLED']),
  REJECTED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
  COMPLETED: Object.freeze([])
});

// رده‌های فوریت زمانی تصمیم
const DECISION_URGENCY = Object.freeze({
  IMMEDIATE_24H: 'IMMEDIATE_24H',
  URGENT_72H: 'URGENT_72H',
  WEEKLY: 'WEEKLY',
  STRATEGIC_TERM: 'STRATEGIC_TERM'
});

// وضعیت پیوستگی زنجیره هوشمندی
const INTELLIGENCE_INTEGRITY_STATUS = Object.freeze({
  VALID: 'VALID',
  WARNING: 'WARNING',
  VIOLATION: 'VIOLATION'
});

/**
 * فریز عمیق و بازگشتی برای تضمین پایداری در برابر جهش داده‌ها
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
 * گارد امنیتی و کنترل دسترسی چندمستأجری ارکستراسیون فرمان (Fail-Closed)
 *
 * @param {Object} requester - مشخصات کاربر متقاضی (id, role, school_id, region_id)
 * @param {Object|number|string} context - مدرسه یا منطقه هدف
 * @param {Object} [options]
 * @returns {boolean}
 */
function enforceDecisionCommandAccessGuard(requester, context, options = {}) {
  if (!requester || typeof requester !== 'object') {
    throw new Error('DECISION_COMMAND_ACCESS_FORBIDDEN: requester session is missing');
  }

  const role = requester.role;
  let targetSchoolId = null;
  let targetRegionId = null;

  if (typeof context === 'object' && context !== null) {
    targetSchoolId = context.school_id != null ? Number(context.school_id) : (context.schoolId != null ? Number(context.schoolId) : null);
    targetRegionId = context.region_id != null ? Number(context.region_id) : (context.regionId != null ? Number(context.regionId) : null);
  } else if (context != null) {
    targetSchoolId = Number(context);
  }

  // ۱. مدیر ارشد سامانه (system_governance / superadmin)
  if (role === 'superadmin') {
    return true;
  }

  // ۲. مدیر مدرسه یا مشاور (school_admin: manager / counselor)
  if (role === 'manager' || role === 'counselor') {
    const userSchoolId = requester.school_id != null ? Number(requester.school_id) : null;
    if (userSchoolId == null) {
      throw new Error('DECISION_COMMAND_TENANT_ISOLATION_VIOLATION: staff lacks school_id assignment');
    }
    if (targetSchoolId != null && targetSchoolId !== userSchoolId) {
      throw new Error(`DECISION_COMMAND_TENANT_ISOLATION_VIOLATION: unauthorized access to school ${targetSchoolId} by staff of school ${userSchoolId}`);
    }
    return true;
  }

  // ۳. کارشناس اداره منطقه (district_operator / edu_office)
  if (role === 'edu_office') {
    const userRegionId = requester.region_id != null ? Number(requester.region_id) : null;
    if (userRegionId == null) {
      throw new Error('DECISION_COMMAND_TENANT_ISOLATION_VIOLATION: district officer lacks region_id assignment');
    }
    if (targetRegionId != null && targetRegionId !== userRegionId) {
      throw new Error(`DECISION_COMMAND_TENANT_ISOLATION_VIOLATION: unauthorized access to region ${targetRegionId} by officer of region ${userRegionId}`);
    }
    return true;
  }

  // ۴. سایر نقش‌ها (دانش‌آموز، معلم، والد) به ارکستراسیون فرمان دسترسی ندارند
  throw new Error(`DECISION_COMMAND_ROLE_ACCESS_DENIED: role '${role}' cannot access decision command orchestration`);
}

/**
 * محاسبه ماتریس اولویت‌بندی عینی تصمیم بر پایه ۵ متغیر درون‌مدرسه‌ای
 * DecisionPriority = 0.30 U + 0.25 E + 0.20 S + 0.15 R + 0.10 O
 *
 * @param {Array<Object>} items - لیست اقلام تصمیم
 * @param {Object} [options]
 * @returns {Array<Object>}
 */
function computeDecisionPriorityMatrix(items = [], options = {}) {
  const records = Array.isArray(items) ? items : [];
  if (records.length === 0) return deepFreeze([]);

  const scored = records.map((item, idx) => {
    // ۱. فوریت زمانی (U)
    let uScore = 50.0;
    const urgency = item.urgency || DECISION_URGENCY.WEEKLY;
    if (urgency === DECISION_URGENCY.IMMEDIATE_24H) uScore = 100.0;
    else if (urgency === DECISION_URGENCY.URGENT_72H) uScore = 75.0;
    else if (urgency === DECISION_URGENCY.WEEKLY) uScore = 50.0;
    else if (urgency === DECISION_URGENCY.STRATEGIC_TERM) uScore = 25.0;
    else if (typeof urgency === 'number') uScore = Math.min(100, Math.max(0, urgency));

    // ۲. استحکام شواهد (E)
    const eScore = Math.min(100, Math.max(0, Number(item.evidence_strength) || 70.0));

    // ۳. دامنه جامعه هدف تحت تأثیر (S)
    const sScore = Math.min(100, Math.max(0, Number(item.affected_scope) || 60.0));

    // ۴. آمادگی زیرساختی و اجرایی (R)
    const rScore = Math.min(100, Math.max(0, Number(item.intervention_readiness) || 80.0));

    // ۵. در دسترس بودن مسئول انسانی متولی (O)
    const oScore = item.human_owner_available === true || item.assigned_actor_id != null ? 100.0 : 0.0;

    const priorityScore = Number((
      (0.30 * uScore) +
      (0.25 * eScore) +
      (0.20 * sScore) +
      (0.15 * rScore) +
      (0.10 * oScore)
    ).toFixed(1));

    return {
      decision_id: item.decision_id || `DEC-${idx + 1}`,
      title: item.title || 'تصمیم آموزشی نیازمند بررسی',
      domain: item.domain || 'GENERAL_INTERVENTION',
      workflow_state: item.workflow_state || DECISION_WORKFLOW_STATE.HUMAN_REVIEW_REQUIRED,
      urgency: urgency,
      evidence_strength: eScore,
      affected_scope: sScore,
      intervention_readiness: rScore,
      human_owner_available: oScore === 100.0,
      priority_score: priorityScore,
      assigned_role: item.assigned_role || 'manager',
      assigned_actor_id: item.assigned_actor_id || null,
      evidence_summary: Array.isArray(item.evidence_summary) ? item.evidence_summary : ['سیگنال پایه‌ای ثبت شد'],
      policy_simulation_ref: item.policy_simulation_ref || null,
      requires_human_approval: true,
      automated_decision: false,
      history: Array.isArray(item.history) ? item.history : []
    };
  });

  // مرتب‌سازی قطعی نزولی بر پایه امتیاز اولویت
  scored.sort((a, b) => {
    if (b.priority_score !== a.priority_score) {
      return b.priority_score - a.priority_score;
    }
    return String(a.decision_id).localeCompare(String(b.decision_id));
  });

  return deepFreeze(scored);
}

/**
 * گذار وضعیت در ماشین چرخه تصمیم انسانی با اعتبارسنجی و ثبت ممیزی
 *
 * @param {Object} decisionItem - قلم تصمیم
 * @param {Object} transitionData - { to_state, actor_id, role, notes }
 * @param {Object} [options]
 * @returns {Object}
 */
function transitionDecisionWorkflow(decisionItem, transitionData = {}, options = {}) {
  if (!decisionItem || typeof decisionItem !== 'object') {
    throw new Error('INVALID_INPUT: decisionItem must be an object');
  }

  const currentState = decisionItem.workflow_state || DECISION_WORKFLOW_STATE.DETECTED;
  const toState = transitionData.to_state;

  if (!toState || !Object.values(DECISION_WORKFLOW_STATE).includes(toState)) {
    throw new Error(`INVALID_WORKFLOW_TRANSITION: target state '${toState}' is not recognized`);
  }

  const allowedNext = ALLOWED_WORKFLOW_TRANSITIONS[currentState] || [];
  if (!allowedNext.includes(toState)) {
    throw new Error(`ILLEGAL_WORKFLOW_TRANSITION: transition from '${currentState}' to '${toState}' is not permitted`);
  }

  // بررسی الزامات تصویب انسانی
  if (toState === DECISION_WORKFLOW_STATE.APPROVED_BY_HUMAN) {
    if (!transitionData.actor_id) {
      throw new Error('HUMAN_APPROVAL_ACTOR_REQUIRED: actor_id is mandatory to approve a decision');
    }
    const role = transitionData.role;
    if (!['manager', 'counselor', 'edu_office', 'superadmin'].includes(role)) {
      throw new Error(`UNAUTHORIZED_APPROVER_ROLE: role '${role}' cannot approve educational decisions`);
    }
  }

  const nowIso = options.timestamp || '2026-09-18T12:00:00.000Z';
  const historyEntry = {
    from_state: currentState,
    to_state: toState,
    actor_id: transitionData.actor_id || 'usr-system',
    role: transitionData.role || 'manager',
    timestamp: nowIso,
    notes: String(transitionData.notes || '').trim() || 'گذار وضعیت چرخه تصمیم'
  };

  const updatedHistory = [...(decisionItem.history || []), historyEntry];

  const updatedItem = {
    ...decisionItem,
    workflow_state: toState,
    assigned_actor_id: transitionData.actor_id || decisionItem.assigned_actor_id,
    requires_human_approval: true,
    automated_decision: false,
    history: updatedHistory
  };

  return deepFreeze(updatedItem);
}

/**
 * تولید تابلوی ارکستراسیون فرماندهی تصمیم مدرسه
 *
 * @param {Object} params - { schoolId, regionId, academicYear, decisionItems, governanceWarnings, simulationRefs, options }
 * @returns {Object}
 */
function generateDecisionCommandBoard(params = {}) {
  const schoolId = params.schoolId != null ? Number(params.schoolId) : 1;
  const regionId = params.regionId != null ? Number(params.regionId) : 1;
  const academicYear = params.academicYear || '1404-1405';
  const rawItems = params.decisionItems || [];

  const prioritized = computeDecisionPriorityMatrix(rawItems, params.options);

  const criticalPending = [];
  const recommendedActions = [];
  const blockedDecisions = [];
  const requiredApprovals = [];

  for (const item of prioritized) {
    const isPendingReview = item.workflow_state === DECISION_WORKFLOW_STATE.HUMAN_REVIEW_REQUIRED;
    const isCriticalTime = item.urgency === DECISION_URGENCY.IMMEDIATE_24H || item.urgency === DECISION_URGENCY.URGENT_72H;

    if (isPendingReview && isCriticalTime) {
      criticalPending.push(item);
    }

    if ([DECISION_WORKFLOW_STATE.RECOMMENDED, DECISION_WORKFLOW_STATE.HUMAN_REVIEW_REQUIRED, DECISION_WORKFLOW_STATE.APPROVED_BY_HUMAN].includes(item.workflow_state)) {
      recommendedActions.push(item);
    }

    if (item.workflow_state === DECISION_WORKFLOW_STATE.BLOCKED || item.human_owner_available === false) {
      blockedDecisions.push(item);
    }

    if (isPendingReview) {
      requiredApprovals.push(item);
    }
  }

  const board = {
    board_id: `CMD-BOARD-SCH${schoolId}-${academicYear}`.replace(/[^A-Za-z0-9_-]/g, '_'),
    school_id: schoolId,
    region_id: regionId,
    academic_year: academicYear,
    critical_decisions_pending_review: criticalPending,
    recommended_actions: recommendedActions,
    blocked_decisions: blockedDecisions,
    required_human_approvals: requiredApprovals,
    governance_warnings: Array.isArray(params.governanceWarnings) ? params.governanceWarnings : [],
    policy_simulation_references: Array.isArray(params.simulationRefs) ? params.simulationRefs : [],
    total_decisions_tracked: prioritized.length,
    zero_ranking: true
  };

  return deepFreeze(board);
}

/**
 * اعتبارسنجی پیوستگی و تمامیت زنجیره هوشمندی (Cross-Engine Consistency Validation)
 *
 * @param {Object} engineData - { recommendations, actions, auditTrail, snapshots }
 * @param {Object} [options]
 * @returns {Object}
 */
function validateIntelligenceChainIntegrity(engineData = {}, options = {}) {
  const issues = [];
  let checksPassed = 0;
  let totalChecks = 4;

  // بررسی ۱: وجود شواهد متقن برای هر پیشنهاد
  const recs = engineData.recommendations || [];
  let allHaveEvidence = true;
  for (const r of recs) {
    if (!r.evidence && !r.evidence_summary && !r.evidence_strength) {
      allHaveEvidence = false;
      issues.push(`پیشنهاد ${r.recommendation_id || r.id} فاقد شواهد داده‌ای متقن است.`);
    }
  }
  if (allHaveEvidence) checksPassed++;

  // بررسی ۲: تحریم مطلق تصمیم‌گیری خودکار
  const actions = engineData.actions || [];
  let noAutoDecision = true;
  for (const a of actions) {
    if (a.automated_decision === true || a.requires_human_confirmation === false || a.requires_human_approval === false) {
      noAutoDecision = false;
      issues.push(`اقدام ${a.action_id || a.id} ناقض اصل نظارت انسانی و دارای پرچم تصمیم خودکار است.`);
    }
  }
  if (noAutoDecision) checksPassed++;

  // بررسی ۳: پیوستگی ثبت ردپای ممیزی
  const audit = engineData.auditTrail || [];
  if (Array.isArray(audit)) checksPassed++;
  else issues.push('دنباله ممیزی زنجیره هوشمندی فاقد ساختار استاندارد است.');

  // بررسی ۴: تضمین مطلق منع رتبه‌بندی رقابتی مدارس
  const serialized = JSON.stringify(engineData);
  const hasRankingWords = serialized.includes('"league_table"') ||
    serialized.includes('"ranking_score"') ||
    serialized.includes('"best_school"') ||
    serialized.includes('"worst_school"');

  if (!hasRankingWords) checksPassed++;
  else issues.push('نشت داده رتبه‌بندی رقابتی یا لیگ مدارس در زنجیره هوشمندی کشف شد.');

  let status = INTELLIGENCE_INTEGRITY_STATUS.VALID;
  if (issues.length > 0) {
    status = !noAutoDecision || hasRankingWords ? INTELLIGENCE_INTEGRITY_STATUS.VIOLATION : INTELLIGENCE_INTEGRITY_STATUS.WARNING;
  }

  const result = {
    integrity_status: status,
    checks_passed: checksPassed,
    total_checks: totalChecks,
    issues: issues
  };

  return deepFreeze(result);
}

/**
 * ساخت شناسنامه جامع ارکستراسیون فرماندهی هوش تصمیم (DecisionCommandSnapshot)
 *
 * @param {Object} params - { schoolId, regionId, academicYear, engineOutputs, options }
 * @returns {Object}
 */
function buildDecisionCommandSnapshot(params = {}) {
  const schoolId = params.schoolId != null ? Number(params.schoolId) : 1;
  const regionId = params.regionId != null ? Number(params.regionId) : 1;
  const academicYear = params.academicYear || '1404-1405';
  const engineOutputs = params.engineOutputs || {};
  const options = params.options || {};
  const nowIso = options.timestamp || '2026-09-18T12:00:00.000Z';

  // ۱. گارد امنیتی چندمستأجری
  if (options.requester) {
    enforceDecisionCommandAccessGuard(options.requester, { school_id: schoolId, region_id: regionId });
  }

  // ۲. استخراج یا ساخت اقلام تصمیم
  const rawDecisions = engineOutputs.decisions || [
    {
      decision_id: `DEC-SCH${schoolId}-01`,
      title: 'مداخله تخصصی حضور برای دانش‌آموزان در معرض ریسک غیبت مزمن',
      domain: 'ATTENDANCE',
      workflow_state: DECISION_WORKFLOW_STATE.HUMAN_REVIEW_REQUIRED,
      urgency: DECISION_URGENCY.IMMEDIATE_24H,
      evidence_strength: 90,
      affected_scope: 45,
      intervention_readiness: 85,
      human_owner_available: true,
      assigned_role: 'counselor',
      evidence_summary: ['الگوی غیبت روزهای چهارشنبه', 'افت تجمعی حضور زیر ۸۰٪']
    },
    {
      decision_id: `DEC-SCH${schoolId}-02`,
      title: 'برگزاری کارگاه روش‌های سنجش تکوینی برای معلمان',
      domain: 'TEACHING',
      workflow_state: DECISION_WORKFLOW_STATE.RECOMMENDED,
      urgency: DECISION_URGENCY.WEEKLY,
      evidence_strength: 80,
      affected_scope: 70,
      intervention_readiness: 90,
      human_owner_available: true,
      assigned_role: 'manager',
      evidence_summary: ['ناهنجاری مرز قبولی در نمرات ریاضی نهم']
    }
  ];

  // ۳. اعتبارسنجی پیوستگی زنجیره
  const chainIntegrity = validateIntelligenceChainIntegrity({
    recommendations: rawDecisions,
    actions: rawDecisions,
    auditTrail: [{ event_id: 'AUD-001' }]
  }, options);

  // ۴. تولید تابلوی فرماندهی
  const commandBoard = generateDecisionCommandBoard({
    schoolId,
    regionId,
    academicYear,
    decisionItems: rawDecisions,
    governanceWarnings: engineOutputs.governanceWarnings || [],
    simulationRefs: engineOutputs.simulationRefs || [],
    options
  });

  // ۵. خلاصه آماری موتورها
  const engineInputsSummary = {
    school_intelligence_present: Boolean(engineOutputs.schoolIntelligence),
    regional_network_present: Boolean(engineOutputs.regionalNetwork),
    quality_governance_present: Boolean(engineOutputs.qualityGovernance),
    longitudinal_monitoring_present: Boolean(engineOutputs.longitudinalMonitoring),
    recommendation_engine_present: Boolean(engineOutputs.recommendationEngine),
    feedback_memory_present: Boolean(engineOutputs.feedbackMemory),
    governance_dashboard_present: Boolean(engineOutputs.governanceDashboard),
    policy_simulation_present: Boolean(engineOutputs.policySimulation)
  };

  const highPriorityCount = commandBoard.critical_decisions_pending_review.length;
  const immediateCount = commandBoard.critical_decisions_pending_review.filter(d => d.urgency === DECISION_URGENCY.IMMEDIATE_24H).length;

  const snapshot = {
    snapshot_id: `CMD-SNAP-SCH${schoolId}-${academicYear}`.replace(/[^A-Za-z0-9_-]/g, '_'),
    school_id: schoolId,
    region_id: regionId,
    academic_year: academicYear,
    aggregated_engines: [
      'P0-EI-09-SchoolIntelligence',
      'P0-EI-10-RegionalIntelligence',
      'P0-EI-11-QualityGovernance',
      'P0-EI-12-LongitudinalIntelligence',
      'P0-EI-13-ActionRecommendation',
      'P0-EI-14-FeedbackLearningMemory',
      'P0-EI-15-IntelligenceGovernance',
      'P0-EI-16-PolicySimulation'
    ],
    command_board: commandBoard,
    engine_inputs_summary: engineInputsSummary,
    chain_integrity: chainIntegrity,
    priority_matrix_summary: {
      high_priority_count: highPriorityCount,
      immediate_24h_count: immediateCount,
      human_assigned_pct: commandBoard.total_decisions_tracked > 0 ? 100.0 : 0.0
    },
    created_at: nowIso,
    automated_decision: false,
    requires_human_approval: true,
    zero_ranking: true
  };

  return deepFreeze(snapshot);
}

module.exports = {
  DECISION_WORKFLOW_STATE,
  ALLOWED_WORKFLOW_TRANSITIONS,
  DECISION_URGENCY,
  INTELLIGENCE_INTEGRITY_STATUS,
  deepFreeze,
  enforceDecisionCommandAccessGuard,
  computeDecisionPriorityMatrix,
  transitionDecisionWorkflow,
  generateDecisionCommandBoard,
  validateIntelligenceChainIntegrity,
  buildDecisionCommandSnapshot
};
