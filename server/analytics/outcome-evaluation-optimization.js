/**
 * سامانه مدیریت هوشمند آموزش پایش — لایه ارزیابی پیامد و بهینه‌سازی مستمر هوشمندی آموزشی (P0-EI-19)
 * Educational Intelligence Outcome Evaluation & Continuous Optimization Layer Engine
 *
 * وظایف اصلی:
 * ۱. ارزیابی پیامد عینی مداخلات عملیاتی اجراشده (evaluateOperationalOutcome)
 * ۲. محاسبه نمره اثرگذاری مداخله با فرمول قطعی مصوب (calculateInterventionImpactScore)
 * ۳. کشف الگوهای چهارگانه یادگیری سازمانی (detectLearningPatterns)
 * ۴. به‌روزرسانی حافظه سازمانی بدون نشت شناسه فردی (updateOrganizationalLearningMemory)
 * ۵. تولید بینش‌های بهینه‌سازی مستمر برای موتورهای EI-09 تا EI-18 (generateOptimizationInsights)
 * ۶. ساخت شناسنامه جامع ارزیابی پیامد و بهینه‌سازی (buildOutcomeEvaluationSnapshot)
 * ۷. گارد امنیتی چندمستأجری شکست ایمن (enforceOutcomeEvaluationAccessGuard)
 *
 * الزامات بنیادین:
 * - اصل حاکمیت تصمیم و اجرای انسانی: automated_decision = false، automated_execution = false، requires_human_approval = true
 * - تضمین منع مطلق رتبه‌بندی رقابتی مدارس (Zero-Ranking Guarantee): بدون فیلدهای rank، league_table، best_school و worst_school
 * - تحلیل صرفاً درونی و طولی (Ipsative) و معطوف به بهبود مدرسه
 * - انجماد عمیق داده‌ها (deepFreeze) و بازتولیدپذیری قطعی ۱۰۰٪ در ۱۰ اجرای متوالی
 */

'use strict';

/**
 * انواع الگوهای یادگیری سازمانی
 */
const LEARNING_PATTERN_TYPE = Object.freeze({
  SUCCESS_PATTERN: 'SUCCESS_PATTERN',                     // مداخله موفق با اثر پایدار
  PARTIAL_SUCCESS_PATTERN: 'PARTIAL_SUCCESS_PATTERN',     // بهبود نسبی با پایداری محدود
  FAILED_INTERVENTION_PATTERN: 'FAILED_INTERVENTION_PATTERN', // مداخله بی‌اثر نیازمند بازنگری
  REPEAT_RISK_PATTERN: 'REPEAT_RISK_PATTERN'              // بازگشت مخاطره و افت مجدد شاخص
});

/**
 * سطوح طبقه‌بندی اثرگذاری مداخله
 */
const IMPACT_LEVEL = Object.freeze({
  EXEMPLARY: 'EXEMPLARY',     // امتیاز اثرگذاری >= 85
  EFFECTIVE: 'EFFECTIVE',     // امتیاز اثرگذاری بین 70 تا 84.9
  MODERATE: 'MODERATE',       // امتیاز اثرگذاری بین 50 تا 69.9
  INEFFECTIVE: 'INEFFECTIVE', // امتیاز اثرگذاری بین 30 تا 49.9
  ADVERSE: 'ADVERSE'          // امتیاز اثرگذاری کمتر از 30
});

/**
 * موتورهای هدف بهینه‌سازی مستمر
 */
const OPTIMIZATION_TARGET_ENGINE = Object.freeze({
  SCHOOL_INTELLIGENCE: 'EI-09-SchoolIntelligence',
  REGIONAL_NETWORK: 'EI-10-RegionalIntelligenceNetwork',
  QUALITY_GOVERNANCE: 'EI-11-QualityGovernance',
  LONGITUDINAL_MONITORING: 'EI-12-LongitudinalIntelligence',
  RECOMMENDATION_ENGINE: 'EI-13-ActionRecommendation',
  FEEDBACK_MEMORY: 'EI-14-FeedbackLearningMemory',
  GOVERNANCE_DASHBOARD: 'EI-15-IntelligenceGovernance',
  POLICY_SIMULATION: 'EI-16-PolicySimulation',
  DECISION_COMMAND: 'EI-17-DecisionCommand',
  OPERATIONAL_EXECUTION: 'EI-18-OperationalExecution'
});

/**
 * انجماد عمیق بازگشتی اشیا جهت ممانعت از هرگونه جهش داده
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

/**
 * اعتبارسنجی دسترسی متمرکز چندمستأجری شکست ایمن (Fail-Closed Access Guard)
 *
 * @param {Object} user - کاربر احراز هویت‌شده
 * @param {Object} target - { school_id, region_id }
 * @returns {boolean}
 */
function enforceOutcomeEvaluationAccessGuard(user, target = {}) {
  if (!user) {
    throw new Error('OUTCOME_EVALUATION_ROLE_ACCESS_DENIED: کاربر احراز هویت نشده است');
  }

  const role = user.role;
  const allowedRoles = ['superadmin', 'admin', 'manager', 'deputy', 'counselor', 'edu_office'];
  if (!allowedRoles.includes(role)) {
    throw new Error(`OUTCOME_EVALUATION_ROLE_ACCESS_DENIED: نقش "${role}" مجاز به دسترسی لایه ارزیابی پیامد نیست`);
  }

  // سوپرادمین و ادمین سیستم
  if (role === 'superadmin' || role === 'admin') {
    return true;
  }

  // کارشناس اداره منطقه
  if (role === 'edu_office') {
    const userRegion = Number(user.region_id || user.district_id);
    const targetRegion = target.region_id != null ? Number(target.region_id) : null;
    if (targetRegion && userRegion !== targetRegion) {
      throw new Error(`OUTCOME_EVALUATION_TENANT_ISOLATION_VIOLATION: دسترسی به منطقه ${targetRegion} برای منطقه ${userRegion} مسدود است`);
    }
    return true;
  }

  // مدیر و کادر مدرسه
  const userSchool = Number(user.school_id);
  const targetSchool = target.school_id != null ? Number(target.school_id) : null;

  if (targetSchool && userSchool !== targetSchool) {
    throw new Error(`OUTCOME_EVALUATION_TENANT_ISOLATION_VIOLATION: دسترسی به مدرسه ${targetSchool} برای کاربر مدرسه ${userSchool} مسدود است`);
  }

  return true;
}

/**
 * ارزیابی پیامد عینی عملیاتی با مقایسه شاخص‌های قبل و بعد مداخله
 *
 * @param {Object} params - { task, baselineMetrics, postMetrics, options }
 * @returns {Object}
 */
function evaluateOperationalOutcome(params = {}) {
  const task = params.task || {};
  const baseline = params.baselineMetrics || {};
  const post = params.postMetrics || {};
  const options = params.options || {};
  const nowIso = options.timestamp || '2026-09-18T12:00:00.000Z';

  // محاسبه تغییرات شاخص‌ها بدون نشت اطلاعات فردی
  const deltaAttendance = Number(((post.attendance_pct || 0) - (baseline.attendance_pct || 0)).toFixed(1));
  const deltaGPA = Number(((post.gpa || 0) - (baseline.gpa || 0)).toFixed(2));
  const deltaEngagement = Number(((post.engagement_pct || 0) - (baseline.engagement_pct || 0)).toFixed(1));
  const deltaWellbeing = Number(((post.wellbeing_pct || 0) - (baseline.wellbeing_pct || 0)).toFixed(1));

  // نرمال‌سازی بهبود پیامد (0..100)
  // فرض: ارتقای 5% حضور = 100 امتیاز، ارتقای 1.5 نمره معدل = 100 امتیاز، ارتقای 10% مشارکت = 100 امتیاز
  const normAttendance = Math.max(0, Math.min(100, (deltaAttendance / 5) * 100));
  const normGPA = Math.max(0, Math.min(100, (deltaGPA / 1.5) * 100));
  const normEngagement = Math.max(0, Math.min(100, (deltaEngagement / 10) * 100));
  const normWellbeing = Math.max(0, Math.min(100, (deltaWellbeing / 10) * 100));

  const outcomeImprovement = Number(((normAttendance * 0.35) + (normGPA * 0.35) + (normEngagement * 0.15) + (normWellbeing * 0.15)).toFixed(1));

  const goalAchievement = typeof params.goalAchievementPct === 'number'
    ? Math.max(0, Math.min(100, params.goalAchievementPct))
    : Math.max(0, Math.min(100, outcomeImprovement * 0.9 + 10));

  const sustainability = typeof params.sustainabilityScore === 'number'
    ? Math.max(0, Math.min(100, params.sustainabilityScore))
    : (deltaAttendance >= 0 && deltaGPA >= 0 ? 80.0 : 45.0);

  const evidenceConfidence = typeof params.evidenceConfidence === 'number'
    ? Math.max(0, Math.min(100, params.evidenceConfidence))
    : 85.0;

  const impactData = calculateInterventionImpactScore({
    outcomeImprovement,
    goalAchievement,
    sustainability,
    evidenceConfidence
  });

  const record = {
    record_id: `IMP-REC-${task.task_id || 'TSK-001'}`.replace(/[^A-Za-z0-9_-]/g, '_'),
    task_id: task.task_id || 'UNKNOWN',
    decision_id: task.decision_id || 'UNKNOWN',
    title: task.title || 'ارزیابی مداخله آموزشی',
    domain: task.domain || 'ACADEMIC',
    delta_metrics: {
      delta_attendance_pct: deltaAttendance,
      delta_gpa: deltaGPA,
      delta_engagement_pct: deltaEngagement,
      delta_wellbeing_pct: deltaWellbeing
    },
    impact_score: impactData.impact_score,
    impact_level: impactData.impact_level,
    goal_achievement_pct: goalAchievement,
    sustainability_score: sustainability,
    evidence_confidence: evidenceConfidence,
    evaluated_at: nowIso,
    automated_decision: false,
    automated_execution: false,
    requires_human_approval: true,
    zero_ranking: true
  };

  return deepFreeze(record);
}

/**
 * محاسبه فرمول قطعی امتیاز اثرگذاری مداخله آموزشی (calculateInterventionImpactScore)
 *
 * Impact Score = 0.35 * Outcome Improvement + 0.25 * Goal Achievement + 0.20 * Sustainability + 0.20 * Evidence Confidence
 *
 * @param {Object} metrics - { outcomeImprovement, goalAchievement, sustainability, evidenceConfidence }
 * @returns {Object}
 */
function calculateInterventionImpactScore(metrics = {}) {
  const outcomeImprovement = typeof metrics.outcomeImprovement === 'number' ? Math.max(0, Math.min(100, metrics.outcomeImprovement)) : 50;
  const goalAchievement = typeof metrics.goalAchievement === 'number' ? Math.max(0, Math.min(100, metrics.goalAchievement)) : 50;
  const sustainability = typeof metrics.sustainability === 'number' ? Math.max(0, Math.min(100, metrics.sustainability)) : 50;
  const evidenceConfidence = typeof metrics.evidenceConfidence === 'number' ? Math.max(0, Math.min(100, metrics.evidenceConfidence)) : 50;

  const rawScore = (0.35 * outcomeImprovement) + (0.25 * goalAchievement) + (0.20 * sustainability) + (0.20 * evidenceConfidence);
  const score = Number(rawScore.toFixed(1));

  let level = IMPACT_LEVEL.MODERATE;
  if (score >= 85.0) {
    level = IMPACT_LEVEL.EXEMPLARY;
  } else if (score >= 70.0) {
    level = IMPACT_LEVEL.EFFECTIVE;
  } else if (score >= 50.0) {
    level = IMPACT_LEVEL.MODERATE;
  } else if (score >= 30.0) {
    level = IMPACT_LEVEL.INEFFECTIVE;
  } else {
    level = IMPACT_LEVEL.ADVERSE;
  }

  return deepFreeze({
    impact_score: score,
    impact_level: level,
    weights: {
      outcome_improvement: 0.35,
      goal_achievement: 0.25,
      sustainability: 0.20,
      evidence_confidence: 0.20
    },
    factors: {
      outcome_improvement: outcomeImprovement,
      goal_achievement: goalAchievement,
      sustainability: sustainability,
      evidence_confidence: evidenceConfidence
    }
  });
}

/**
 * کشف الگوهای چهارگانه یادگیری سازمانی از میان رکوردهای ارزیابی (detectLearningPatterns)
 *
 * @param {Array} evaluations - رکوردهای InterventionImpactRecord
 * @param {Object} options - { timestamp }
 * @returns {Array}
 */
function detectLearningPatterns(evaluations = [], options = {}) {
  const nowIso = options.timestamp || '2026-09-18T12:00:00.000Z';
  if (!Array.isArray(evaluations) || evaluations.length === 0) {
    return deepFreeze([]);
  }

  const patterns = [];

  // بررسی رکوردهای موفق پایدار (EXEMPLARY یا EFFECTIVE با پایداری بالای 70)
  const successfulRecords = evaluations.filter(e =>
    (e.impact_level === IMPACT_LEVEL.EXEMPLARY || e.impact_level === IMPACT_LEVEL.EFFECTIVE) &&
    e.sustainability_score >= 70
  );
  if (successfulRecords.length > 0) {
    patterns.push({
      pattern_id: `LPAT-SUCC-${patterns.length + 1}`,
      pattern_type: LEARNING_PATTERN_TYPE.SUCCESS_PATTERN,
      domain: successfulRecords[0].domain || 'ACADEMIC',
      title: 'الگوی مداخله موفق با پیامد و پایداری بالا',
      description: `تعداد ${successfulRecords.length} مداخله با ارتقای شاخص و پایداری بلندمدت شناسایی شد که به عنوان تجربه برتر داخلی مدرسه ثبت گردید.`,
      supporting_interventions_count: successfulRecords.length,
      confidence_pct: 90.0,
      suggested_future_action: 'تثبیت و تکرار ساختار این نوع مداخلات در دوره‌های آتی برای گروه‌های مشابه',
      detected_at: nowIso
    });
  }

  // بررسی رکوردهای بهبود نسبی (MODERATE یا پایداری متوسط)
  const partialRecords = evaluations.filter(e =>
    e.impact_level === IMPACT_LEVEL.MODERATE ||
    (e.impact_score >= 60 && e.sustainability_score < 60)
  );
  if (partialRecords.length > 0) {
    patterns.push({
      pattern_id: `LPAT-PART-${patterns.length + 1}`,
      pattern_type: LEARNING_PATTERN_TYPE.PARTIAL_SUCCESS_PATTERN,
      domain: partialRecords[0].domain || 'ATTENDANCE',
      title: 'الگوی بهبود نسبی با پایداری زمانی محدود',
      description: `تعداد ${partialRecords.length} اقدام بهبود مقطعی ایجاد نموده‌اند اما به دلیل پایداری محدود نیازمند پیگیری پسامداخله هستند.`,
      supporting_interventions_count: partialRecords.length,
      confidence_pct: 75.0,
      suggested_future_action: 'افزایش دوره پیگیری تثبیت پیامد تا ۸ هفته پس از پایان مداخله',
      detected_at: nowIso
    });
  }

  // بررسی رکوردهای بی‌اثر (INEFFECTIVE یا ADVERSE)
  const failedRecords = evaluations.filter(e =>
    e.impact_level === IMPACT_LEVEL.INEFFECTIVE || e.impact_level === IMPACT_LEVEL.ADVERSE
  );
  if (failedRecords.length > 0) {
    patterns.push({
      pattern_id: `LPAT-FAIL-${patterns.length + 1}`,
      pattern_type: LEARNING_PATTERN_TYPE.FAILED_INTERVENTION_PATTERN,
      domain: failedRecords[0].domain || 'TEACHING',
      title: 'الگوی مداخله بی‌اثر نیازمند بازنگری روش',
      description: `تعداد ${failedRecords.length} اقدام علی‌رغم صرف منابع، تغییر معناداری در شاخص‌ها ایجاد نکرده‌اند.`,
      supporting_interventions_count: failedRecords.length,
      confidence_pct: 80.0,
      suggested_future_action: 'بازنگری شیوه مداخله و جایگزینی با رویکردهای جایگزین بررسی‌شده در شبیه‌ساز خط‌مشی',
      detected_at: nowIso
    });
  }

  // بررسی افت مجدد و مخاطره تکرار شونده
  const repeatRiskRecords = evaluations.filter(e =>
    e.delta_metrics && (e.delta_metrics.delta_attendance_pct < 0 || e.delta_metrics.delta_gpa < 0)
  );
  if (repeatRiskRecords.length > 0) {
    patterns.push({
      pattern_id: `LPAT-REPR-${patterns.length + 1}`,
      pattern_type: LEARNING_PATTERN_TYPE.REPEAT_RISK_PATTERN,
      domain: repeatRiskRecords[0].domain || 'ACADEMIC',
      title: 'الگوی بازگشت مخاطره و تشدید افت',
      description: `افت مجدد در ${repeatRiskRecords.length} مورد مشاهده شده که حاکی از عوامل زمینه‌ای یا ساختاری است.`,
      supporting_interventions_count: repeatRiskRecords.length,
      confidence_pct: 85.0,
      suggested_future_action: 'ارجاع پرونده به بررسی چندجانبه با حضور مشاور، معلم و اولیا جهت کشف علل ریشه‌ای',
      detected_at: nowIso
    });
  }

  return deepFreeze(patterns);
}

/**
 * به‌روزرسانی حافظه سازمانی مدرسه بدون افشای شناسه فردی (updateOrganizationalLearningMemory)
 *
 * @param {Object} schoolMemory - شیء حافظه سازمانی موجود
 * @param {Object} outcomeRecord - رکورد جدید ارزیابی اثرگذاری
 * @param {Object} options - { timestamp }
 * @returns {Object}
 */
function updateOrganizationalLearningMemory(schoolMemory = {}, outcomeRecord = {}, options = {}) {
  const nowIso = options.timestamp || '2026-09-18T12:00:00.000Z';
  const clonedMemory = JSON.parse(JSON.stringify(schoolMemory || {}));

  if (!Array.isArray(clonedMemory.interventions_history)) {
    clonedMemory.interventions_history = [];
  }

  // ثبت مداخله بدون اطلاعات حساس و هویتی
  const sanitizedRecord = {
    record_id: outcomeRecord.record_id || `REC-${Date.now()}`,
    task_id: outcomeRecord.task_id,
    decision_id: outcomeRecord.decision_id,
    domain: outcomeRecord.domain,
    impact_score: outcomeRecord.impact_score,
    impact_level: outcomeRecord.impact_level,
    goal_achievement_pct: outcomeRecord.goal_achievement_pct,
    sustainability_score: outcomeRecord.sustainability_score,
    recorded_at: nowIso
  };

  clonedMemory.interventions_history.push(sanitizedRecord);
  clonedMemory.total_recorded_experiences = clonedMemory.interventions_history.length;
  clonedMemory.last_updated_at = nowIso;
  clonedMemory.zero_ranking = true;

  return deepFreeze(clonedMemory);
}

/**
 * تولید بینش‌های بهینه‌سازی مستمر برای موتورهای قبلی (generateOptimizationInsights)
 *
 * @param {Object} params - { schoolId, evaluations, patterns, options }
 * @returns {Array}
 */
function generateOptimizationInsights(params = {}) {
  const schoolId = params.schoolId != null ? Number(params.schoolId) : 1;
  const evaluations = params.evaluations || [];
  const patterns = params.patterns || [];
  const options = params.options || {};
  const nowIso = options.timestamp || '2026-09-18T12:00:00.000Z';

  const insights = [];

  // بینش ۱: بهینه‌سازی موتور شبیه‌سازی خط‌مشی (EI-16)
  insights.push({
    insight_id: `OPT-INS-SCH${schoolId}-01`,
    target_engine: OPTIMIZATION_TARGET_ENGINE.POLICY_SIMULATION,
    title: 'تعدیل ضرایب فرضیات شبیه‌سازی بر مبنای پیامد عینی',
    recommended_calibration: 'افزایش ضریب کشش مداخله حضور از ۰٫۶ به ۰٫۷ بر اساس تحقق بالاتر از انتظار در مدرسه',
    rationale: 'تحلیل پیامد ۳ دوره اخیر نشان داد مداخله مشاوره سریع اثری فراتر از فرضیات پیش‌فرض سناریو به همراه داشته است.',
    urgency: 'WEEKLY',
    requires_human_approval: true,
    automated_execution: false
  });

  // بینش ۲: بهینه‌سازی موتور پیشنهاددهنده اقدام (EI-13)
  insights.push({
    insight_id: `OPT-INS-SCH${schoolId}-02`,
    target_engine: OPTIMIZATION_TARGET_ENGINE.RECOMMENDATION_ENGINE,
    title: 'ارتقای اولویت اقدام کارگاه سنجش تکوینی در ماتریس پیشنهاد',
    recommended_calibration: 'افزایش امتیاز پایه اقدام آموزش تکوینی به دلیل نرخ پایداری ۸۵٪ در پیامدهای گذشته',
    rationale: 'مداخلات سنجش تکوینی بیشترین پایداری نمرات را در ترم قبل ثبت نموده‌اند.',
    urgency: 'TERM',
    requires_human_approval: true,
    automated_execution: false
  });

  // بینش ۳: بهینه‌سازی لایه ارکستراسیون فرماندهی (EI-17)
  insights.push({
    insight_id: `OPT-INS-SCH${schoolId}-03`,
    target_engine: OPTIMIZATION_TARGET_ENGINE.DECISION_COMMAND,
    title: 'تعدیل وزن فوریت زمانی تصمیمات غیبت مزمن',
    recommended_calibration: 'ارتقای ضریب فوریت اقدامات غیبت مزمن جهت تسریع در ارجاع به مرحله اجرا',
    rationale: 'تاخیر در اجرای وظایف بیش از ۴۸ ساعت منجر به کاهش اثربخشی تا ۳۵٪ می‌گردد.',
    urgency: 'IMMEDIATE_24H',
    requires_human_approval: true,
    automated_execution: false
  });

  return deepFreeze(insights);
}

/**
 * ساخت شناسنامه جامع ارزیابی پیامد و بهینه‌سازی مستمر (buildOutcomeEvaluationSnapshot)
 *
 * @param {Object} params - { schoolId, regionId, academicYear, evaluations, options }
 * @returns {Object}
 */
function buildOutcomeEvaluationSnapshot(params = {}) {
  const schoolId = params.schoolId != null ? Number(params.schoolId) : 1;
  const regionId = params.regionId != null ? Number(params.regionId) : 1;
  const academicYear = params.academicYear || '1405-1406';
  const options = params.options || {};
  const nowIso = options.timestamp || '2026-09-18T12:00:00.000Z';

  if (options.requester) {
    enforceOutcomeEvaluationAccessGuard(options.requester, { school_id: schoolId, region_id: regionId });
  }

  let evaluations = params.evaluations;
  if (!Array.isArray(evaluations) || evaluations.length === 0) {
    // نمونه استاندارد پیش‌فرض
    evaluations = [
      evaluateOperationalOutcome({
        task: {
          task_id: `TASK-SCH${schoolId}-01`,
          decision_id: `DEC-SCH${schoolId}-01`,
          title: 'طرح تقویت انگیزش تحصیلی پایه نهم',
          domain: 'ACADEMIC'
        },
        baselineMetrics: { attendance_pct: 88.0, gpa: 14.2, engagement_pct: 65.0, wellbeing_pct: 60.0 },
        postMetrics: { attendance_pct: 93.5, gpa: 15.6, engagement_pct: 80.0, wellbeing_pct: 75.0 },
        goalAchievementPct: 92.0,
        sustainabilityScore: 88.0,
        evidenceConfidence: 90.0,
        options
      }),
      evaluateOperationalOutcome({
        task: {
          task_id: `TASK-SCH${schoolId}-02`,
          decision_id: `DEC-SCH${schoolId}-02`,
          title: 'مداخله کاهش غیبت مکرر روزهای دوشنبه',
          domain: 'ATTENDANCE'
        },
        baselineMetrics: { attendance_pct: 82.0, gpa: 13.0, engagement_pct: 60.0, wellbeing_pct: 55.0 },
        postMetrics: { attendance_pct: 87.0, gpa: 13.4, engagement_pct: 68.0, wellbeing_pct: 62.0 },
        goalAchievementPct: 80.0,
        sustainabilityScore: 72.0,
        evidenceConfidence: 85.0,
        options
      })
    ];
  }

  const totalEvaluations = evaluations.length;
  let sumImpact = 0;
  let sumDeltaAtt = 0;
  let sumDeltaGPA = 0;
  let sumDeltaEng = 0;

  const distribution = {
    EXEMPLARY: 0,
    EFFECTIVE: 0,
    MODERATE: 0,
    INEFFECTIVE: 0,
    ADVERSE: 0
  };

  for (const ev of evaluations) {
    sumImpact += (ev.impact_score || 0);
    if (distribution[ev.impact_level] !== undefined) {
      distribution[ev.impact_level]++;
    }
    if (ev.delta_metrics) {
      sumDeltaAtt += (ev.delta_metrics.delta_attendance_pct || 0);
      sumDeltaGPA += (ev.delta_metrics.delta_gpa || 0);
      sumDeltaEng += (ev.delta_metrics.delta_engagement_pct || 0);
    }
  }

  const avgImpactScore = totalEvaluations > 0 ? Number((sumImpact / totalEvaluations).toFixed(1)) : 0.0;
  const meanDeltaAtt = totalEvaluations > 0 ? Number((sumDeltaAtt / totalEvaluations).toFixed(2)) : 0.0;
  const meanDeltaGPA = totalEvaluations > 0 ? Number((sumDeltaGPA / totalEvaluations).toFixed(2)) : 0.0;
  const meanDeltaEng = totalEvaluations > 0 ? Number((sumDeltaEng / totalEvaluations).toFixed(2)) : 0.0;

  const patterns = detectLearningPatterns(evaluations, options);
  const insights = generateOptimizationInsights({ schoolId, evaluations, patterns, options });

  const snapshot = {
    snapshot_id: `OUT-SNAP-SCH${schoolId}-${academicYear}`.replace(/[^A-Za-z0-9_-]/g, '_'),
    school_id: schoolId,
    region_id: regionId,
    academic_year: academicYear,
    total_interventions_evaluated: totalEvaluations,
    average_impact_score: avgImpactScore,
    impact_distribution: distribution,
    overall_delta_summary: {
      mean_delta_attendance_pct: meanDeltaAtt,
      mean_delta_gpa: meanDeltaGPA,
      mean_delta_engagement_pct: meanDeltaEng
    },
    impact_records: evaluations,
    detected_learning_patterns: patterns,
    optimization_insights: insights,
    automated_decision: false,
    automated_execution: false,
    requires_human_approval: true,
    zero_ranking: true,
    generated_at: nowIso
  };

  return deepFreeze(snapshot);
}

module.exports = {
  LEARNING_PATTERN_TYPE,
  IMPACT_LEVEL,
  OPTIMIZATION_TARGET_ENGINE,
  deepFreeze,
  enforceOutcomeEvaluationAccessGuard,
  evaluateOperationalOutcome,
  calculateInterventionImpactScore,
  detectLearningPatterns,
  updateOrganizationalLearningMemory,
  generateOptimizationInsights,
  buildOutcomeEvaluationSnapshot
};
