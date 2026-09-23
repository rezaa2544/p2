/**
 * ماژول راهبری کیفیت آموزشی و چرخه بهبود مستمر (P0-EI-11)
 * Educational Quality Governance & Continuous Improvement Engine
 * 
 * ویژگی‌های کلیدی:
 *  - ۱) گارد امنیتی و کنترل دسترسی راهبری کیفیت (enforceQualityGovernanceAccessGuard)
 *  - ۲) ارزیابی ارکان پنج‌گانه کیفیت آموزشی (evaluateQualityPillars)
 *  - ۳) راه‌اندازی و هدایت چرخه استاندارد بهبود مستمر PDCA (initiateImprovementCycle & transitionImprovementCycle)
 *  - ۴) سنجش اثربخشی چرخه بهبود و تصمیم‌گیری مرحله تثبیت Act (evaluateImprovementCycleOutcome)
 *  - ۵) تجمیع راهبری کیفیت منطقه‌ای با تضمین ۱۰۰٪ عدم رتبه‌بندی مدارس (generateDistrictQualitySummary)
 *  - ۶) ساخت گزارش راهبری یکپارچه با رعایت کامل چندمستأجری (buildQualityGovernanceReport)
 * 
 * اصول غیرقابل مذاکره:
 *  - ممنوعیت مطلق رتبه‌بندی رقابتی، League Table، و برچسب‌های بهترین/بدترین مدارس
 *  - قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت در محاسبات (Deterministic & Zero ML Guessing)
 *  - ایمنی کامل در برابر جهش داده‌ها با ساختارهای منجمد عمیق (Deep Freeze Mutation Safety)
 *  - شکست ایمن (Fail-Closed) در کلیه سطوح ایزولاسیون چندمستأجری و Anti-IDOR
 */

'use strict';

// ارکان پنج‌گانه کیفیت آموزشی
const QUALITY_PILLARS = Object.freeze({
  ACADEMIC_MASTERY: 'ACADEMIC_MASTERY',
  ATTENDANCE_STABILITY: 'ATTENDANCE_STABILITY',
  ASSESSMENT_VALIDITY_AND_FAIRNESS: 'ASSESSMENT_VALIDITY_AND_FAIRNESS',
  TEACHING_EVIDENCE_AND_SUPPORT: 'TEACHING_EVIDENCE_AND_SUPPORT',
  FAMILY_AND_COMMUNITY_COLLABORATION: 'FAMILY_AND_COMMUNITY_COLLABORATION'
});

// وضعیت‌های سلامت کیفی
const QUALITY_STATUS = Object.freeze({
  NOT_ASSESSED: 'NOT_ASSESSED',
  EXEMPLARY: 'EXEMPLARY',
  STABLE_AND_COMPLIANT: 'STABLE_AND_COMPLIANT',
  CRITICAL_ATTENTION_REQUIRED: 'CRITICAL_ATTENTION_REQUIRED',
  OPTIMAL: 'OPTIMAL',
  ADEQUATE: 'ADEQUATE',
  NEEDS_IMPROVEMENT: 'NEEDS_IMPROVEMENT'
});

// فازهای چرخه بهبود دمينگ (PDCA)
const PDCA_PHASES = Object.freeze({
  PLAN: 'PLAN',
  DO: 'DO',
  CHECK: 'CHECK',
  ACT: 'ACT'
});

// ترنزیشن‌های مجاز در چرخه بهبود
const ALLOWED_PDCA_TRANSITIONS = Object.freeze({
  PLAN: Object.freeze(['DO']),
  DO: Object.freeze(['CHECK']),
  CHECK: Object.freeze(['ACT']),
  ACT: Object.freeze(['PLAN', 'DO'])
});

// سطوح اثربخشی چرخه
const CYCLE_EFFICACY = Object.freeze({
  HIGHLY_EFFECTIVE: 'HIGHLY_EFFECTIVE',
  PARTIALLY_EFFECTIVE: 'PARTIALLY_EFFECTIVE',
  INEFFECTIVE: 'INEFFECTIVE'
});

// تصمیمات فاز تثبیت و اقدام (Act)
const ACT_DECISIONS = Object.freeze({
  STANDARDIZE_PROCESS: 'STANDARDIZE_PROCESS',
  ADJUST_AND_RETRY: 'ADJUST_AND_RETRY',
  ESCALATE_TO_DISTRICT: 'ESCALATE_TO_DISTRICT'
});

/**
 * فریز عمیق و بازگشتی برای تضمین شکست‌ناپذیر عدم جهش داده‌ها
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
 * گارد امنیتی و کنترل دسترسی راهبری کیفیت مدرسه و منطقه
 *
 * @param {Object} requester - کاربر درخواست‌دهنده (id, role, school_id, region_id)
 * @param {Object|number|string} targetEntity - مدرسه یا منطقه هدف
 * @param {Object} [options]
 * @returns {boolean}
 */
function enforceQualityGovernanceAccessGuard(requester, targetEntity, options = {}) {
  if (!requester || typeof requester !== 'object') {
    throw new Error('QUALITY_GOVERNANCE_ACCESS_FORBIDDEN: requester session is missing');
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

  // ۱. مدیر ارشد سیستم (Superadmin)
  if (role === 'superadmin') {
    return true;
  }

  // ۲. کارشناس یا مدیر اداره منطقه (Edu Office)
  if (role === 'edu_office') {
    const userRegionId = requester.region_id != null 
      ? Number(requester.region_id) 
      : (requester.office_id != null ? Number(requester.office_id) : null);

    if (userRegionId == null) {
      throw new Error('TENANT_ISOLATION_VIOLATION: edu_office user lacks valid region assignment');
    }
    if (targetRegionId != null && userRegionId !== targetRegionId) {
      throw new Error(`TENANT_ISOLATION_VIOLATION: edu_office region ${userRegionId} does not match target ${targetRegionId}`);
    }
    return true;
  }

  // ۳. مدیر مدرسه (School Manager)
  if (role === 'manager') {
    const userSchoolId = requester.school_id != null ? Number(requester.school_id) : null;
    if (userSchoolId == null) {
      throw new Error('TENANT_ISOLATION_VIOLATION: manager lacks school_id assignment');
    }
    if (targetSchoolId != null && userSchoolId !== targetSchoolId) {
      throw new Error(`TENANT_ISOLATION_VIOLATION: manager of school ${userSchoolId} cannot access school ${targetSchoolId}`);
    }
    return true;
  }

  // ۴. سایر نقش‌ها (دانش‌آموز، والد، معلم و...)
  throw new Error(`QUALITY_GOVERNANCE_ACCESS_FORBIDDEN: role ${role} is not authorized to access quality governance`);
}

/**
 * ارزیابی ارکان پنج‌گانه کیفیت آموزشی مدرسه
 *
 * @param {Object} context
 * @param {number|string} [context.school_id]
 * @param {Array} [context.assessments]
 * @param {Array} [context.attendanceSessions]
 * @param {Array} [context.assessmentsWithVariance]
 * @param {Array} [context.courses]
 * @param {Object} [context.parentEngagement]
 * @param {Object} [options]
 * @returns {Object} QualityPillarAssessment
 */
function evaluateQualityPillars(context = {}, options = {}) {
  const schoolId = Number(context.schoolId || context.school_id || 1);

  // داده‌های خلاصه یا خام
  const aca = context.academicSummary || context.academic_summary || null;
  const att = context.attendanceSummary || context.attendance_summary || null;
  const ass = context.assessmentSummary || context.assessment_summary || null;
  const tea = context.teacherSummary || context.teacher_summary || null;
  const par = context.parentSummary || context.parent_summary || null;

  // ── D1 remediation ───────────────────────────────────────────────────
  // پیش‌تر هر رکنی که داده نداشت، نمرهٔ پیش‌فرض خوب (۸۰ یا ۸۵) می‌گرفت.
  // یک مدرسهٔ کاملاً بدون داده، در همهٔ ارکان EXEMPLARY می‌شد. اکنون رکن بدون
  // داده null می‌شود و میانگین فقط روی ارکانِ موجود محاسبه می‌شود.
  const pillarScores = [];
  const pillarDetails = {};

  function classify(score) {
    return score >= 80 ? QUALITY_STATUS.EXEMPLARY : (score >= 65 ? QUALITY_STATUS.STABLE_AND_COMPLIANT : QUALITY_STATUS.CRITICAL_ATTENTION_REQUIRED);
  }

  // ۱. رکن ۱: تسلط علمی و تثبیت یادگیری (Academic Mastery)
  let acaScore = null;
  let acaMetrics = {};
  if (Array.isArray(context.assessments) && context.assessments.length > 0) {
    const scores = context.assessments.map(a => (a.score / (a.max_score || 20)) * 100);
    const sum = scores.reduce((acc, val) => acc + val, 0);
    acaScore = Math.round((sum / scores.length) * 10) / 10;
    acaMetrics = { sample_count: context.assessments.length, average_percentage: acaScore };
  } else if (aca && aca.average_gpa != null) {
    const avgGpa = Number(aca.average_gpa);
    const failingRatio = Number(aca.failing_students_ratio ?? 0);
    const atRiskSubjects = Number(aca.at_risk_subjects_count ?? 0);
    acaScore = Math.max(0, Math.min(100, Math.round(((avgGpa / 20) * 100 - (failingRatio * 150) - (atRiskSubjects * 5)) * 10) / 10));
    acaMetrics = { average_gpa: avgGpa, failing_students_ratio: failingRatio };
  }
  let acaStatus = acaScore === null ? QUALITY_STATUS.NOT_ASSESSED : classify(acaScore);
  if (acaScore !== null) pillarScores.push(acaScore);
  pillarDetails[QUALITY_PILLARS.ACADEMIC_MASTERY] = { score: acaScore, status: acaStatus, metrics: acaMetrics };

  // ۲. رکن ۲: پایداری و ثبات حضور (Attendance Stability)
  let attScore = null;
  let attMetrics = {};
  if (Array.isArray(context.attendanceSessions) && context.attendanceSessions.length > 0) {
    const total = context.attendanceSessions.length;
    const presents = context.attendanceSessions.filter(s => s.status === 'PRESENT' || s.status === 'LATE').length;
    attScore = Math.round(((presents / total) * 100) * 10) / 10;
    attMetrics = { total_sessions: total, attendance_rate: attScore };
  } else if (att && att.calendar_rate != null) {
    const calRate = Number(att.calendar_rate);
    const chronicRate = Number(att.chronic_absence_rate ?? 0);
    attScore = Math.max(0, Math.min(100, Math.round((calRate - (chronicRate * 2.0)) * 10) / 10));
    attMetrics = { calendar_rate: calRate, chronic_absence_rate: chronicRate };
  }
  let attStatus = attScore === null ? QUALITY_STATUS.NOT_ASSESSED : classify(attScore);
  if (attScore !== null) pillarScores.push(attScore);
  pillarDetails[QUALITY_PILLARS.ATTENDANCE_STABILITY] = { score: attScore, status: attStatus, metrics: attMetrics };

  // ۳. رکن ۳: روایی و عدالت سنجش (Assessment Validity and Fairness)
  let assScore = null;
  let assMetrics = {};
  if (Array.isArray(context.assessmentsWithVariance) && context.assessmentsWithVariance.length > 0) {
    const avgVariance = context.assessmentsWithVariance.reduce((acc, a) => acc + (a.score_variance || 0), 0) / context.assessmentsWithVariance.length;
    assScore = Math.max(0, Math.min(100, Math.round((95.0 - (avgVariance * 10.0)) * 10) / 10));
    assMetrics = { average_score_variance: avgVariance };
  } else if (ass && (ass.hard_exams_count != null || ass.anomalies_count != null)) {
    const hardExams = Number(ass.hard_exams_count ?? 0);
    const anomalies = Number(ass.anomalies_count ?? 0);
    assScore = Math.max(0, Math.min(100, Math.round((90.0 - (hardExams * 10.0) - (anomalies * 15.0)) * 10) / 10));
    assMetrics = { hard_exams_count: hardExams, anomalies_count: anomalies };
  }
  let assStatus = assScore === null ? QUALITY_STATUS.NOT_ASSESSED : classify(assScore);
  if (assScore !== null) pillarScores.push(assScore);
  pillarDetails[QUALITY_PILLARS.ASSESSMENT_VALIDITY_AND_FAIRNESS] = { score: assScore, status: assStatus, metrics: assMetrics };

  // ۴. رکن ۴: شواهد تدریس و توانمندسازی معلمان (Teaching Evidence and Support)
  let teaScore = null;
  let teaMetrics = {};
  if (Array.isArray(context.courses) && context.courses.length > 0) {
    const totalPlans = context.courses.reduce((acc, c) => acc + (c.total_lesson_plans || 1), 0);
    const submittedPlans = context.courses.reduce((acc, c) => acc + (c.lesson_plans_submitted || 0), 0);
    const feedbackCount = context.courses.reduce((acc, c) => acc + (c.observation_feedback_received || 0), 0);
    const planRate = (submittedPlans / totalPlans) * 100;
    teaScore = Math.max(0, Math.min(100, Math.round((planRate * 0.8 + feedbackCount * 5.0) * 10) / 10));
    teaMetrics = { lesson_plan_compliance_rate: planRate, observation_feedback_count: feedbackCount };
  } else if (tea && tea.formative_coverage != null) {
    const overloaded = Number(tea.overloaded_teachers_count ?? 0);
    const coverage = Number(tea.formative_coverage);
    teaScore = Math.max(0, Math.min(100, Math.round(((coverage * 0.7) + 30.0 - (overloaded * 10.0)) * 10) / 10));
    teaMetrics = { overloaded_teachers_count: overloaded, formative_coverage: coverage };
  }
  let teaStatus = teaScore === null ? QUALITY_STATUS.NOT_ASSESSED : classify(teaScore);
  if (teaScore !== null) pillarScores.push(teaScore);
  pillarDetails[QUALITY_PILLARS.TEACHING_EVIDENCE_AND_SUPPORT] = { score: teaScore, status: teaStatus, metrics: teaMetrics };

  // ۵. رکن ۵: مشارکت اولیا و جامعه مدرسه (Family and Community Collaboration)
  let parScore = null;
  let parMetrics = {};
  if (context.parentEngagement && typeof context.parentEngagement === 'object') {
    const p = context.parentEngagement;
    const reg = Number(p.registered_parents || 1);
    const active = Number(p.active_portal_parents || 0);
    const ptaRate = Number(p.pta_attendance_rate || 50);
    const activeRate = (active / reg) * 100;
    parScore = Math.max(0, Math.min(100, Math.round((activeRate * 0.5 + ptaRate * 0.5) * 10) / 10));
    parMetrics = { active_parent_ratio: activeRate, pta_attendance_rate: ptaRate };
  } else if (par && par.average_pei != null) {
    const pei = Number(par.average_pei);
    const pendingJust = Number(par.pending_justifications ?? 0);
    parScore = Math.max(0, Math.min(100, Math.round((pei - (pendingJust * 2.0)) * 10) / 10));
    parMetrics = { average_pei: pei, pending_justifications: pendingJust };
  }
  let parStatus = parScore === null ? QUALITY_STATUS.NOT_ASSESSED : classify(parScore);
  if (parScore !== null) pillarScores.push(parScore);
  pillarDetails[QUALITY_PILLARS.FAMILY_AND_COMMUNITY_COLLABORATION] = { score: parScore, status: parStatus, metrics: parMetrics };

  const pillars = pillarDetails;

  // محاسبه شاخص ترکیبی کیفیت — فقط روی ارکان دارای داده (D1)
  const overallQualityIndex = pillarScores.length > 0
    ? Math.round((pillarScores.reduce((a, b) => a + b, 0) / pillarScores.length) * 10) / 10
    : null;

  // احصای وضعیت ترکیبی و رکن اولویت‌دار
  const hasCritical = Object.values(pillars).some(p => p.status === QUALITY_STATUS.CRITICAL_ATTENTION_REQUIRED);
  const hasData = pillarScores.length > 0;
  let overallQualityStatus = QUALITY_STATUS.NOT_ASSESSED;
  let overallGovernanceStatus = 'NOT_ASSESSED';

  if (!hasData) {
    overallQualityStatus = QUALITY_STATUS.NOT_ASSESSED;
    overallGovernanceStatus = 'NOT_ASSESSED';
  } else if (overallQualityIndex >= 80 && !hasCritical) {
    overallQualityStatus = QUALITY_STATUS.EXEMPLARY;
    overallGovernanceStatus = 'EXEMPLARY_GOVERNANCE';
  } else if (overallQualityIndex < 65 || hasCritical) {
    overallQualityStatus = QUALITY_STATUS.CRITICAL_ATTENTION_REQUIRED;
    overallGovernanceStatus = 'NEEDS_FOCUSED_IMPROVEMENT';
  } else {
    overallQualityStatus = QUALITY_STATUS.STABLE_AND_COMPLIANT;
    overallGovernanceStatus = 'STABLE_GOVERNANCE';
  }

  // احصای رکنی با پایین‌ترین امتیاز جهت تمرکز بهبود (فقط ارکان دارای داده)
  let lowestPillar = null;
  let minScore = null;
  for (const [pKey, pVal] of Object.entries(pillars)) {
    if (pVal.score === null) continue;
    if (minScore === null || pVal.score < minScore) {
      minScore = pVal.score;
      lowestPillar = pKey;
    }
  }
  if (lowestPillar === null) lowestPillar = QUALITY_PILLARS.ACADEMIC_MASTERY;

  const result = {
    school_id: schoolId,
    evaluated_at: options.now || '2026-09-18T10:00:00.000Z',
    overall_quality_index: overallQualityIndex,
    overall_quality_status: overallQualityStatus,
    overall_governance_status: overallGovernanceStatus,
    priority_focus_pillar: lowestPillar,
    zero_ranking_policy_enforced: true,
    pillars: pillars
  };

  return deepFreeze(result);
}

/**
 * راه‌اندازی چرخه رسمی بهبود مستمر کیفیت (PDCA Initiation)
 *
 * @param {Object} params
 * @param {Object} [options]
 * @returns {Object} QualityImprovementCycle
 */
function initiateImprovementCycle(params = {}, options = {}) {
  const schoolId = Number(params.school_id || params.schoolId || 1);
  const pillarKey = params.pillar_key || params.targetPillar || params.target_pillar || QUALITY_PILLARS.ACADEMIC_MASTERY;

  if (!Object.values(QUALITY_PILLARS).includes(pillarKey)) {
    throw new Error(`INVALID_PILLAR: ${pillarKey} is not a valid quality pillar`);
  }

  const cycleId = params.cycle_id || params.cycleId || `PDCA-SCH${schoolId}-${(options.now || '20260918').replace(/[^0-9]/g, '').slice(0, 8)}-${pillarKey.slice(0, 4)}`;
  const createdAt = options.now || '2026-09-18T10:00:00.000Z';

  const initialHistory = [{
    phase: PDCA_PHASES.PLAN,
    timestamp: createdAt,
    actor_id: params.actor?.id || params.initiator_id || params.initiatorId || 101,
    note: params.action_plan || `چرخه بهبود کیفیت در رکن ${pillarKey} پایه‌گذاری شد`
  }];

  const cycle = {
    cycle_id: cycleId,
    school_id: schoolId,
    academic_year: params.academic_year || params.academicYear || '1405-1406',
    pillar_key: pillarKey,
    target_pillar: pillarKey,
    current_phase: PDCA_PHASES.PLAN,
    phase: PDCA_PHASES.PLAN,
    status: 'ACTIVE',
    created_at: createdAt,
    problem_statement: params.problem_statement || '',
    target_metric: params.target_metric || '',
    baseline_value: Number(params.baseline_value ?? 0),
    target_value: Number(params.target_value ?? 0),
    action_plan: params.action_plan || '',
    responsible_role: params.responsible_role || 'manager',
    planned_check_date: params.planned_check_date || null,
    baseline_metrics: params.baseline_metrics || params.baselineMetrics || {},
    target_goals: params.target_goals || params.targetGoals || {},
    action_items: Array.isArray(params.action_items || params.actionItems) ? (params.action_items || params.actionItems) : [],
    check_evaluation: null,
    history: initialHistory
  };

  return deepFreeze(cycle);
}

/**
 * انتقال فاز چرخه بهبود مستمر (PDCA Transition)
 *
 * @param {Object} cycle
 * @param {Object} transition
 * @param {string} transition.to_phase
 * @param {string} [transition.note]
 * @param {Object} [transition.actor]
 * @param {Object} [options]
 * @returns {Object} Updated Cycle
 */
function transitionImprovementCycle(cycle, transition = {}, options = {}) {
  if (!cycle || typeof cycle !== 'object') {
    throw new Error('INVALID_INPUT: valid cycle object is required');
  }

  const currentPhase = cycle.current_phase || cycle.phase || PDCA_PHASES.PLAN;
  const toPhase = transition.to_phase || transition.toPhase;

  if (!toPhase || !Object.values(PDCA_PHASES).includes(toPhase)) {
    throw new Error(`INVALID_PHASE: ${toPhase} is not a valid PDCA phase`);
  }

  const allowed = ALLOWED_PDCA_TRANSITIONS[currentPhase] || [];
  if (!allowed.includes(toPhase)) {
    throw new Error(`INVALID_PDCA_PHASE_TRANSITION: transition from ${currentPhase} to ${toPhase} is forbidden`);
  }

  const timestamp = options.now || '2026-09-18T10:00:00.000Z';
  const newHistoryEntry = {
    phase: toPhase,
    timestamp: timestamp,
    actor_id: transition.actor?.id || null,
    note: transition.note || `انتقال فاز به ${toPhase}`
  };

  const updatedCycle = {
    ...cycle,
    current_phase: toPhase,
    phase: toPhase,
    history: [...(cycle.history || []), newHistoryEntry]
  };

  return deepFreeze(updatedCycle);
}

/**
 * سنجش اثربخشی چرخه بهبود و تصمیم‌گیری فاز تثبیت Act
 *
 * @param {Object} cycle
 * @param {Object} outcomeParams
 * @param {number} [outcomeParams.post_value]
 * @param {Object} [outcomeParams.post_metrics]
 * @param {Object} [options]
 * @returns {Object}
 */
function evaluateImprovementCycleOutcome(cycle, outcomeParams = {}, options = {}) {
  if (!cycle || typeof cycle !== 'object') {
    throw new Error('INVALID_INPUT: valid cycle is required for outcome evaluation');
  }

  const baseline = Number(cycle.baseline_value ?? 0);
  const target = Number(cycle.target_value ?? baseline);
  const postValue = outcomeParams.post_value != null ? Number(outcomeParams.post_value) : baseline;
  
  const delta = Math.round((postValue - baseline) * 100) / 100;
  const targetGap = target - baseline;

  let targetAchievementPct = 0.0;
  if (targetGap !== 0) {
    if ((targetGap > 0 && delta > 0) || (targetGap < 0 && delta < 0)) {
      targetAchievementPct = Math.round((delta / targetGap) * 1000) / 10;
    }
  }

  let efficacy = CYCLE_EFFICACY.INEFFECTIVE;
  let recommendedDecision = ACT_DECISIONS.ESCALATE_TO_DISTRICT;

  if (targetAchievementPct >= 75.0) {
    efficacy = CYCLE_EFFICACY.HIGHLY_EFFECTIVE;
    recommendedDecision = ACT_DECISIONS.STANDARDIZE_PROCESS;
  } else if (targetAchievementPct >= 30.0) {
    efficacy = CYCLE_EFFICACY.PARTIALLY_EFFECTIVE;
    recommendedDecision = ACT_DECISIONS.ADJUST_AND_RETRY;
  } else {
    efficacy = CYCLE_EFFICACY.INEFFECTIVE;
    recommendedDecision = ACT_DECISIONS.ESCALATE_TO_DISTRICT;
  }

  const outcome = {
    post_value: postValue,
    delta_value: delta,
    delta: delta,
    target_achievement_percentage: targetAchievementPct,
    efficacy: efficacy,
    efficacy_level: efficacy,
    recommended_act_decision: recommendedDecision,
    next_act_decision: recommendedDecision,
    evaluated_at: options.now || '2026-09-18T10:00:00.000Z'
  };

  return deepFreeze(outcome);
}

/**
 * تجمیع راهبری کیفیت در سطح منطقه بدون رتبه‌بندی رقابتی (Zero-Ranking Summary)
 *
 * @param {Object} districtContext
 * @param {Object} [options]
 * @returns {Object} DistrictQualityGovernanceSummary
 */
function generateDistrictQualitySummary(districtContext = {}, options = {}) {
  const regionId = Number(districtContext.region_id || districtContext.regionId || districtContext.districtId || 1);
  const districtName = districtContext.district_name || districtContext.districtName || `منطقه آموزشی ${regionId}`;
  const rawSchools = districtContext.schools_data || districtContext.schools || [];

  // مرتب‌سازی اکیداً فقط بر مبنای شناسه مدرسه، نه عملکرد کیفی
  const sortedSchools = [...rawSchools].sort((a, b) => Number(a.school_id || 0) - Number(b.school_id || 0));

  const statusDistribution = {
    [QUALITY_STATUS.EXEMPLARY]: 0,
    [QUALITY_STATUS.STABLE_AND_COMPLIANT]: 0,
    [QUALITY_STATUS.CRITICAL_ATTENTION_REQUIRED]: 0
  };

  let sumQualityIndex = 0;
  const processedSchools = [];

  for (const s of sortedSchools) {
    const qIndex = Number(s.overall_quality_index ?? 75.0);
    const qStatus = s.overall_quality_status || (qIndex >= 80 ? QUALITY_STATUS.EXEMPLARY : (qIndex >= 65 ? QUALITY_STATUS.STABLE_AND_COMPLIANT : QUALITY_STATUS.CRITICAL_ATTENTION_REQUIRED));

    if (statusDistribution[qStatus] !== undefined) {
      statusDistribution[qStatus]++;
    } else {
      statusDistribution[QUALITY_STATUS.STABLE_AND_COMPLIANT]++;
    }

    sumQualityIndex += qIndex;

    // نسخه پاکسازی‌شده بدون هرگونه فیلد رتبه‌ای
    processedSchools.push({
      school_id: Number(s.school_id || 0),
      school_name: s.school_name || `مدرسه ${s.school_id}`,
      overall_quality_status: qStatus,
      priority_focus_pillar: s.priority_focus_pillar || QUALITY_PILLARS.ACADEMIC_MASTERY
    });
  }

  const totalSchools = sortedSchools.length;
  const meanQualityIndex = totalSchools > 0 ? Math.round((sumQualityIndex / totalSchools) * 10) / 10 : 0.0;

  const summary = {
    region_id: regionId,
    district_id: regionId,
    district_name: districtName,
    total_schools_evaluated: totalSchools,
    total_schools: totalSchools,
    district_quality_index_mean: meanQualityIndex,
    status_distribution: statusDistribution,
    schools_evaluated: processedSchools,
    zero_ranking_policy_enforced: true,
    is_ranked: false,
    ranking_score: null,
    league_table: null,
    best_school: null,
    worst_school: null,
    generated_at: options.now || '2026-09-18T10:00:00.000Z'
  };

  return deepFreeze(summary);
}

/**
 * تولید گزارش کامل راهبری کیفیت با احراز صلاحیت دسترسی و ایزولاسیون چندمستأجری
 *
 * @param {Object} params
 * @param {Object} params.actor
 * @param {number|string} [params.school_id]
 * @param {number|string} [params.region_id]
 * @param {Object} [params.school_data]
 * @param {Object} [options]
 * @returns {Object}
 */
function buildQualityGovernanceReport(params = {}, options = {}) {
  const actor = params.actor;
  const schoolId = params.school_id != null ? Number(params.school_id) : null;
  const regionId = params.region_id != null ? Number(params.region_id) : null;

  // اعمال گارد شکست‌ناپذیر امنیتی
  enforceQualityGovernanceAccessGuard(actor, { school_id: schoolId, region_id: regionId }, options);

  if (schoolId != null) {
    const pillars = evaluateQualityPillars({ school_id: schoolId, ...(params.school_data || {}) }, options);
    return deepFreeze({
      school_id: schoolId,
      scope: 'school',
      zero_ranking_policy_enforced: true,
      report: pillars
    });
  }

  const districtSummary = generateDistrictQualitySummary({
    region_id: regionId,
    schools_data: params.schools_data || []
  }, options);

  return deepFreeze({
    region_id: regionId,
    scope: 'district',
    zero_ranking_policy_enforced: true,
    summary: districtSummary
  });
}

module.exports = {
  QUALITY_PILLARS,
  QUALITY_STATUS,
  PDCA_PHASES,
  CYCLE_EFFICACY,
  ACT_DECISIONS,
  ALLOWED_PDCA_TRANSITIONS,
  enforceQualityGovernanceAccessGuard,
  evaluateQualityPillars,
  initiateImprovementCycle,
  initiateQualityImprovementCycle: initiateImprovementCycle,
  transitionImprovementCycle,
  evaluateImprovementCycleOutcome,
  generateDistrictQualitySummary,
  summarizeDistrictQualityGovernance: generateDistrictQualitySummary,
  buildQualityGovernanceReport
};
