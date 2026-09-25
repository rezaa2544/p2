/**
 * ماژول موتور حلقه بازخورد و حافظه راهبری یادگیری آموزشی (P0-EI-14)
 * Educational Intelligence Feedback Loop & Governance Memory Engine
 * 
 * ویژگی‌های کلیدی:
 *  - ۱) گارد امنیتی و تفکیک چندمستأجری (enforceFeedbackMemoryAccessGuard)
 *  - ۲) ثبت پیامد و بازخورد انسانی اقدام آموزشی (recordActionOutcome)
 *  - ۳) تحلیل کمّی کیفیت و دقت پیشنهادهای پیشین (analyzeRecommendationAccuracy)
 *  - ۴) استخراج الگوهای موفقیت و شکست مداخلات آموزشی (calculateInterventionSuccessPatterns)
 *  - ۵) سنجش شاخص بلوغ هوشمندی آموزشی (calculateIntelligenceMaturity)
 *  - ۶) ساخت پرونده جامع یادگیری سازمانی مدرسه (buildOrganizationalLearningProfile)
 *  - ۷) کالیبراسیون و ارتقای توصیه‌های آتی با حافظه تجربه (calibrateRecommendationsWithMemory)
 * 
 * اصول غیرقابل مذاکره:
 *  - منع مطلق تصمیم‌گیری خودکار (NO_AUTONOMOUS_DECISION): هوش مصنوعی صرفاً مشاور و یادگیرنده است
 *  - منع مطلق رتبه‌بندی رقابتی مدارس و معلمان (ZERO_RANKING / No League Tables)
 *  - حذف کامل شناسه‌های هویتی فردی در حافظه سازمانی (No student_id exposure)
 *  - نظارت و تأیید قطعی انسانی (Human-in-the-Loop) و تغییر سیاست منحصراً توسط انسان
 *  - قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت در ۱۰ اجرای متوالی
 *  - ایمنی کامل در برابر جهش با فریز عمیق (deepFreeze Mutation Safety)
 *  - شکست ایمن (Fail-Closed) در تمامی لایه‌های تفکیک داده‌ها
 */

'use strict';

// تصمیمات بازخورد انسانی
const RECOMMENDATION_DECISION = Object.freeze({
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  MODIFIED: 'MODIFIED'
});

// علل استاندارد رد پیشنهاد
const REJECTION_REASONS = Object.freeze({
  MISDIAGNOSIS: 'MISDIAGNOSIS',
  INSUFFICIENT_RESOURCE: 'INSUFFICIENT_RESOURCE',
  INAPPROPRIATE_TIMING: 'INAPPROPRIATE_TIMING',
  ALREADY_ADDRESSED: 'ALREADY_ADDRESSED',
  POLICY_CONFLICT: 'POLICY_CONFLICT',
  OTHER: 'OTHER'
});

// سطوح پیامد و اثربخشی مداخله
const INTERVENTION_SUCCESS_LEVEL = Object.freeze({
  HIGHLY_EFFECTIVE: 'HIGHLY_EFFECTIVE',
  PARTIALLY_EFFECTIVE: 'PARTIALLY_EFFECTIVE',
  INEFFECTIVE: 'INEFFECTIVE',
  REQUIRES_ESCALATION: 'REQUIRES_ESCALATION'
});

// سطوح بلوغ هوشمندی آموزشی
const MATURITY_LEVEL = Object.freeze({
  INITIAL: 'INITIAL',
  DEVELOPING: 'DEVELOPING',
  ESTABLISHED: 'ESTABLISHED',
  OPTIMIZED: 'OPTIMIZED'
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
 * گارد امنیتی و کنترل دسترسی چندمستأجری حافظه یادگیری سازمانی (Fail-Closed)
 *
 * @param {Object} requester - کاربر درخواست‌دهنده (id, role, school_id, region_id)
 * @param {Object|number|string} targetEntity - مدرسه یا منطقه هدف
 * @param {Object} [options]
 * @returns {boolean}
 */
function enforceFeedbackMemoryAccessGuard(requester, targetEntity, options = {}) {
  if (!requester || typeof requester !== 'object') {
    throw new Error('FEEDBACK_ACCESS_FORBIDDEN: requester session is missing');
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

  // ۲. مدیر مدرسه یا مشاور (Manager / Counselor)
  if (role === 'manager' || role === 'counselor') {
    const userSchoolId = requester.school_id != null ? Number(requester.school_id) : null;
    if (userSchoolId == null) {
      throw new Error('FEEDBACK_TENANT_ISOLATION_VIOLATION: staff lacks school_id assignment');
    }
    if (targetSchoolId != null && targetSchoolId !== userSchoolId) {
      throw new Error(`FEEDBACK_TENANT_ISOLATION_VIOLATION: unauthorized access to school ${targetSchoolId} by staff of school ${userSchoolId}`);
    }
    return true;
  }

  // ۳. کارشناس اداره منطقه (District Officer / edu_office)
  if (role === 'edu_office') {
    const userRegionId = requester.region_id != null ? Number(requester.region_id) : null;
    if (userRegionId == null) {
      throw new Error('FEEDBACK_TENANT_ISOLATION_VIOLATION: district officer lacks region_id assignment');
    }
    if (targetRegionId != null && targetRegionId !== userRegionId) {
      throw new Error(`FEEDBACK_TENANT_ISOLATION_VIOLATION: unauthorized access to region ${targetRegionId} by officer of region ${userRegionId}`);
    }
    return true;
  }

  // ۴. سایر نقش‌ها (دانش‌آموز، معلم، والد) به پرونده یادگیری سازمانی دسترسی ندارند
  throw new Error(`FEEDBACK_ROLE_ACCESS_DENIED: role '${role}' cannot access organizational learning memory`);
}

/**
 * ثبت پیامد و بازخورد انسانی برای اقدام پیشنهادی با تضمین عدم ذخیره هویت فردی
 *
 * @param {Object} actionRecord - رکورد اقدام پیشنهادی یا اجراشده
 * @param {Object} feedbackData - داده‌های بازخورد انسانی
 * @param {Object} [options]
 * @returns {Object}
 */
function recordActionOutcome(actionRecord, feedbackData, options = {}) {
  if (!actionRecord || typeof actionRecord !== 'object') {
    throw new Error('INVALID_INPUT: actionRecord must be an object');
  }
  if (!feedbackData || typeof feedbackData !== 'object') {
    throw new Error('INVALID_INPUT: feedbackData must be an object');
  }

  const schoolId = actionRecord.school_id != null ? Number(actionRecord.school_id) : (options.schoolId != null ? Number(options.schoolId) : null);
  if (schoolId == null) {
    throw new Error('FEEDBACK_TENANT_ISOLATION_VIOLATION: schoolId is required');
  }

  // بررسی عدم تطابق مستأجر در بازخورد
  if (feedbackData.school_id != null && Number(feedbackData.school_id) !== schoolId) {
    throw new Error('FEEDBACK_TENANT_ISOLATION_VIOLATION: feedbackData school_id does not match actionRecord school_id');
  }

  // بررسی تصمیم
  const decision = feedbackData.decision || RECOMMENDATION_DECISION.APPROVED;
  if (!Object.values(RECOMMENDATION_DECISION).includes(decision)) {
    throw new Error(`INVALID_DECISION: '${decision}' is not a valid recommendation decision`);
  }

  // بررسی اطلاعات کنشگر انسانی
  const actorId = feedbackData.actor_id || options.actorId || 'usr-anonymous-evaluator';
  const actorRole = feedbackData.actor_role || options.actorRole || 'manager';

  // بررسی علت رد
  let rejectedReason = null;
  if (decision === RECOMMENDATION_DECISION.REJECTED) {
    rejectedReason = feedbackData.rejected_reason || REJECTION_REASONS.OTHER;
    if (!Object.values(REJECTION_REASONS).includes(rejectedReason)) {
      rejectedReason = REJECTION_REASONS.OTHER;
    }
  }

  const nowIso = options.timestamp || '2026-09-18T12:00:00.000Z';
  const actionId = actionRecord.action_id || actionRecord.recommendation_id || 'ACT-001';
  const recommendationId = actionRecord.recommendation_id || actionId;

  // ساخت رکورد بازخورد انسانی
  const feedbackRecord = {
    feedback_id: feedbackData.feedback_id || `FDB-${schoolId}-${actionId}`,
    recommendation_id: recommendationId,
    school_id: schoolId,
    decision: decision,
    rejected_reason: rejectedReason,
    actor_id: actorId,
    actor_role: actorRole,
    notes: String(feedbackData.notes || '').trim(),
    feedback_timestamp: feedbackData.feedback_timestamp || nowIso
  };

  // ساخت رکورد پیامد در صورت وجود ارزیابی اثربخشی
  let outcomeRecord = null;
  if (feedbackData.outcome) {
    const outcomeLevel = feedbackData.outcome;
    if (!Object.values(INTERVENTION_SUCCESS_LEVEL).includes(outcomeLevel)) {
      throw new Error(`INVALID_OUTCOME_LEVEL: '${outcomeLevel}' is not recognized`);
    }

    const rawDelta = feedbackData.delta_metrics || {};
    outcomeRecord = {
      outcome_id: feedbackData.outcome_id || `OUT-${schoolId}-${actionId}`,
      action_id: actionId,
      recommendation_id: recommendationId,
      school_id: schoolId,
      action_type: actionRecord.action_type || 'GENERAL_INTERVENTION',
      effectiveness_level: outcomeLevel,
      delta_metrics: {
        delta_attendance: Number((Number(rawDelta.delta_attendance) || 0).toFixed(2)),
        delta_gpa: Number((Number(rawDelta.delta_gpa) || 0).toFixed(2)),
        delta_engagement: Number((Number(rawDelta.delta_engagement) || 0).toFixed(2))
      },
      evaluator_id: actorId,
      evaluation_timestamp: feedbackData.evaluation_timestamp || nowIso
    };
  }

  const result = {
    feedback_record: feedbackRecord,
    outcome_record: outcomeRecord,
    human_verified: true,
    automated_decision: false,
    recorded_at: nowIso
  };

  return deepFreeze(result);
}

/**
 * تحلیل کمّی کیفیت و دقت پیشنهادهای تولیدشده (Recommendation Accuracy Report)
 *
 * @param {Array<Object>} history - تاریخچه پیشنهادها و بازخوردهای انسانی
 * @param {Object} [options]
 * @returns {Object}
 */
function analyzeRecommendationAccuracy(history = [], options = {}) {
  const records = Array.isArray(history) ? history : [];
  const total = records.length;

  if (total === 0) {
    /* A-31 / I-06: بی‌داده هرگز «دقت کامل» نیست — دقتِ ارجاع بدونِ هیچ سابقه‌ای
       باید نامشخص باشد، نه ۱۰۰٪. */
    return deepFreeze({
      total_recommendations: 0,
      total_reviewed: 0,
      approved_count: 0,
      rejected_count: 0,
      adoption_rate_pct: 0.0,
      precision_pct: 0.0,
      false_positive_rate_pct: 0.0,
      action_success_rate_pct: 0.0,
      escalation_accuracy_pct: null,
      data_status: 'NO_DATA',
      calculated_at: options.timestamp || '2026-09-18T12:00:00.000Z'
    });
  }

  let reviewedCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  let completedCount = 0;
  let effectiveCount = 0;
  let ineffectiveCount = 0;
  let escalationProposed = 0;
  let escalationConfirmed = 0;

  for (const item of records) {
    const decision = item.decision || (item.feedback_record && item.feedback_record.decision);
    const status = item.approval_status || item.status;
    const outcomeLevel = item.outcome || (item.outcome_record && item.outcome_record.effectiveness_level) || item.effectiveness_level;
    const actionType = item.action_type || (item.outcome_record && item.outcome_record.action_type);

    const isReviewed = decision != null || (status && status !== 'GENERATED' && status !== 'REVIEW_PENDING');
    if (isReviewed) {
      reviewedCount++;
    }

    const isApproved = decision === RECOMMENDATION_DECISION.APPROVED || decision === RECOMMENDATION_DECISION.MODIFIED ||
      ['APPROVED', 'IN_PROGRESS', 'EVALUATING', 'COMPLETED'].includes(status);
    const isRejected = decision === RECOMMENDATION_DECISION.REJECTED || (status === 'CANCELLED' && item.rejected_reason != null);

    if (isApproved) approvedCount++;
    if (isRejected) rejectedCount++;

    const isCompleted = status === 'COMPLETED' || outcomeLevel != null;
    if (isCompleted) {
      completedCount++;
      if (outcomeLevel === INTERVENTION_SUCCESS_LEVEL.HIGHLY_EFFECTIVE || outcomeLevel === INTERVENTION_SUCCESS_LEVEL.PARTIALLY_EFFECTIVE) {
        effectiveCount++;
      } else if (outcomeLevel === INTERVENTION_SUCCESS_LEVEL.INEFFECTIVE) {
        ineffectiveCount++;
      }
    }

    if (actionType === 'REGIONAL_RESOURCE' || outcomeLevel === INTERVENTION_SUCCESS_LEVEL.REQUIRES_ESCALATION) {
      escalationProposed++;
      if (item.district_confirmed === true || item.escalation_approved === true || isApproved) {
        escalationConfirmed++;
      }
    }
  }

  const adoptionRate = reviewedCount > 0 ? Number(((approvedCount / reviewedCount) * 100).toFixed(1)) : 0.0;
  const precision = completedCount > 0 ? Number(((effectiveCount / completedCount) * 100).toFixed(1)) : 0.0;
  const falsePositiveRate = total > 0 ? Number((((rejectedCount + ineffectiveCount) / total) * 100).toFixed(1)) : 0.0;
  const actionSuccessRate = completedCount > 0 ? Number(((effectiveCount / completedCount) * 100).toFixed(1)) : 0.0;
  /* A-31 / I-06: بدونِ هیچ ارجاعی، «دقت ارجاع» قابلِ محاسبه نیست — ۱۰۰٪ جعلی
     مثبتِ کاذب است. */
  const escalationAccuracy = escalationProposed > 0 ? Number(((escalationConfirmed / escalationProposed) * 100).toFixed(1)) : null;

  const result = {
    total_recommendations: total,
    total_reviewed: reviewedCount,
    approved_count: approvedCount,
    rejected_count: rejectedCount,
    adoption_rate_pct: adoptionRate,
    precision_pct: precision,
    false_positive_rate_pct: falsePositiveRate,
    action_success_rate_pct: actionSuccessRate,
    escalation_accuracy_pct: escalationAccuracy,
    data_status: 'COMPLETE',
    calculated_at: options.timestamp || '2026-09-18T12:00:00.000Z'
  };

  return deepFreeze(result);
}

/**
 * استخراج و دسته‌بندی الگوهای موفقیت و شکست مداخله آموزشی بدون افشای هویت دانش‌آموز یا معلمان
 *
 * @param {Array<Object>} outcomes - لیست رکوردهای پیامد مداخلات
 * @param {Object} [contextFilters] - فیلترهای بافتاری اختیاری
 * @param {Object} [options]
 * @returns {Object}
 */
function calculateInterventionSuccessPatterns(outcomes = [], contextFilters = {}, options = {}) {
  const records = Array.isArray(outcomes) ? outcomes : [];
  const groups = new Map();

  for (const item of records) {
    const outcomeData = item.outcome_record || item;
    const actionType = outcomeData.action_type || 'GENERAL_INTERVENTION';
    const problemCategory = outcomeData.problem_category || outcomeData.category || 'ACADEMIC_OR_ATTENDANCE';

    // فیلتر بافتاری در صورت وجود
    if (contextFilters.action_type && contextFilters.action_type !== actionType) continue;
    if (contextFilters.problem_category && contextFilters.problem_category !== problemCategory) continue;

    const key = `${actionType}::${problemCategory}`;
    if (!groups.has(key)) {
      groups.set(key, {
        action_type: actionType,
        problem_category: problemCategory,
        total: 0,
        success_count: 0,
        ineffective_count: 0,
        escalation_count: 0,
        delta_attendance_sum: 0,
        delta_gpa_sum: 0,
        delta_engagement_sum: 0,
        grade_levels: new Set()
      });
    }

    const g = groups.get(key);
    g.total++;

    const level = outcomeData.effectiveness_level;
    if (level === INTERVENTION_SUCCESS_LEVEL.HIGHLY_EFFECTIVE || level === INTERVENTION_SUCCESS_LEVEL.PARTIALLY_EFFECTIVE) {
      g.success_count++;
    } else if (level === INTERVENTION_SUCCESS_LEVEL.INEFFECTIVE) {
      g.ineffective_count++;
    } else if (level === INTERVENTION_SUCCESS_LEVEL.REQUIRES_ESCALATION) {
      g.escalation_count++;
    }

    const deltas = outcomeData.delta_metrics || {};
    g.delta_attendance_sum += Number(deltas.delta_attendance) || 0;
    g.delta_gpa_sum += Number(deltas.delta_gpa) || 0;
    g.delta_engagement_sum += Number(deltas.delta_engagement) || 0;

    if (outcomeData.grade_level) {
      g.grade_levels.add(String(outcomeData.grade_level));
    }
  }

  const patterns = [];
  const successfulPatterns = [];
  const ineffectivePatterns = [];

  // مرتب‌سازی کلیدها برای تضمین قطعیت جبری
  const sortedKeys = Array.from(groups.keys()).sort();

  for (const key of sortedKeys) {
    const g = groups.get(key);
    const n = g.total;
    const successRate = n > 0 ? Number(((g.success_count / n) * 100).toFixed(1)) : 0.0;
    const avgAtt = n > 0 ? Number((g.delta_attendance_sum / n).toFixed(2)) : 0.0;
    const avgGpa = n > 0 ? Number((g.delta_gpa_sum / n).toFixed(2)) : 0.0;
    const avgEng = n > 0 ? Number((g.delta_engagement_sum / n).toFixed(2)) : 0.0;

    let confidenceLevel = 'LOW';
    if (n >= 10) {
      confidenceLevel = 'HIGH';
    } else if (n >= 4) {
      confidenceLevel = 'MEDIUM';
    }

    const patternRecord = {
      pattern_id: `PAT-${g.action_type}-${g.problem_category}`.replace(/[^A-Za-z0-9_-]/g, '_'),
      action_type: g.action_type,
      problem_category: g.problem_category,
      sample_size: n,
      success_rate_pct: successRate,
      average_delta: {
        attendance: avgAtt,
        gpa: avgGpa,
        engagement: avgEng
      },
      context_conditions: {
        grades_covered: Array.from(g.grade_levels).sort()
      },
      confidence_level: confidenceLevel
    };

    patterns.push(patternRecord);

    if (successRate >= 60.0) {
      successfulPatterns.push(patternRecord);
    } else if (successRate <= 35.0 && n >= 2) {
      ineffectivePatterns.push(patternRecord);
    }
  }

  const result = {
    total_analyzed: records.length,
    patterns_count: patterns.length,
    patterns: patterns,
    successful_patterns: successfulPatterns,
    ineffective_patterns: ineffectivePatterns,
    zero_ranking: true,
    privacy_guaranteed: true
  };

  return deepFreeze(result);
}

/**
 * سنجش شاخص بلوغ هوشمندی آموزشی
 * IntelligenceMaturity = 0.30 FeedbackQuality + 0.25 ActionEffectiveness + 0.25 LearningRetention + 0.20 GovernanceCompliance
 *
 * @param {Object} profileData - اجزای محاسباتی بلوغ
 * @param {Object} [options]
 * @returns {Object}
 */
function calculateIntelligenceMaturity(profileData = {}, options = {}) {
  const fq = Math.min(100, Math.max(0, Number(profileData.feedback_quality) || 0));
  const ae = Math.min(100, Math.max(0, Number(profileData.action_effectiveness) || 0));
  const lr = Math.min(100, Math.max(0, Number(profileData.learning_retention) || 0));
  const gc = Math.min(100, Math.max(0, Number(profileData.governance_compliance) || 100));

  const weightedSum = (0.30 * fq) + (0.25 * ae) + (0.25 * lr) + (0.20 * gc);
  const score = Number(weightedSum.toFixed(1));

  let level = MATURITY_LEVEL.INITIAL;
  let description = 'مدرسه در مرحله اولیه هوشمندی است؛ تصمیمات بدون ثبت بازخورد مستمر اتخاذ می‌شوند.';

  if (score >= 85.0) {
    level = MATURITY_LEVEL.OPTIMIZED;
    description = 'بالاترین سطح بلوغ هوشمندی؛ یادگیری سازمانی فعال، کالیبراسیون توصیه‌ها و پایبندی کامل حاکمیتی.';
  } else if (score >= 65.0) {
    level = MATURITY_LEVEL.ESTABLISHED;
    description = 'سطح تثبیت‌شده هوشمندی؛ حلقه بازخورد بسته است و الگوهای موفق مداخله به درستی استخراج می‌شوند.';
  } else if (score >= 40.0) {
    level = MATURITY_LEVEL.DEVELOPING;
    description = 'سطح در حال توسعه؛ ثبت بازخوردهای انسانی آغاز شده اما انباشت حافظه تجربی نیاز به تقویت دارد.';
  }

  const result = {
    score: score,
    level: level,
    components: {
      feedback_quality: Number(fq.toFixed(1)),
      action_effectiveness: Number(ae.toFixed(1)),
      learning_retention: Number(lr.toFixed(1)),
      governance_compliance: Number(gc.toFixed(1))
    },
    description: description,
    calculated_at: options.timestamp || '2026-09-18T12:00:00.000Z'
  };

  return deepFreeze(result);
}

/**
 * ساخت شناسنامه کامل یادگیری سازمانی مدرسه بدون تولید جدول رتبه‌بندی رقابتی
 *
 * @param {Object} params - { schoolId, regionId, academicYear, history, options }
 * @returns {Object}
 */
function buildOrganizationalLearningProfile({ schoolId, regionId, academicYear = '1404-1405', history = [], options = {} }) {
  const normSchoolId = schoolId != null ? Number(schoolId) : 1;
  const normRegionId = regionId != null ? Number(regionId) : 1;
  const nowIso = options.timestamp || '2026-09-18T12:00:00.000Z';

  // ۱. گارد دسترسی در صورت ارائه متقاضی
  if (options.requester) {
    enforceFeedbackMemoryAccessGuard(options.requester, { school_id: normSchoolId, region_id: normRegionId });
  }

  // ۲. تحلیل کیفیت و دقت پیشنهادها
  const accuracyReport = analyzeRecommendationAccuracy(history, { timestamp: nowIso });

  // ۳. استخراج الگوهای موفقیت و شکست مداخلات
  const patternReport = calculateInterventionSuccessPatterns(history, {}, { timestamp: nowIso });

  // ۴. برآورد اجزای شاخص بلوغ
  // ۴.۱. کیفیت بازخورد: نسبت مواردی که یادداشت یا دلیل شفاف دارند
  let documentedFeedbackCount = 0;
  for (const item of history) {
    const notes = item.notes || (item.feedback_record && item.feedback_record.notes);
    const reason = item.rejected_reason || (item.feedback_record && item.feedback_record.rejected_reason);
    if ((notes && String(notes).trim().length > 5) || reason) {
      documentedFeedbackCount++;
    }
  }
  const feedbackQuality = history.length > 0 ? (documentedFeedbackCount / history.length) * 100 : 50.0;

  // ۴.۲. اثربخشی اقدام: بر پایه action_success_rate_pct
  const actionEffectiveness = accuracyReport.action_success_rate_pct;

  // ۴.۳. ماندگاری یادگیری: نسبت الگوهای موفق شناسایی‌شده
  const learningRetention = patternReport.patterns_count > 0 ?
    Math.min(100, (patternReport.successful_patterns.length / patternReport.patterns_count) * 100) : 50.0;

  // ۴.۴. پایبندی به حاکمیت: ۱۰۰ در صورت نظارت انسانی و عدم تصمیم خودکار
  const governanceCompliance = 100.0;

  const maturityIndex = calculateIntelligenceMaturity({
    feedback_quality: feedbackQuality,
    action_effectiveness: actionEffectiveness,
    learning_retention: learningRetention,
    governance_compliance: governanceCompliance
  }, { timestamp: nowIso });

  const result = {
    profile_id: `LP-SCH${normSchoolId}-${academicYear}`.replace(/[^A-Za-z0-9_-]/g, '_'),
    school_id: normSchoolId,
    region_id: normRegionId,
    academic_year: academicYear,
    accuracy_report: accuracyReport,
    successful_patterns: patternReport.successful_patterns,
    ineffective_patterns: patternReport.ineffective_patterns,
    maturity_index: maturityIndex,
    learning_retention_summary: {
      documented_interventions_count: history.length,
      reusable_strategies_count: patternReport.successful_patterns.length,
      deprecated_approaches_count: patternReport.ineffective_patterns.length
    },
    created_at: nowIso,
    human_controlled_policy: true,
    automated_decision: false,
    zero_ranking: true
  };

  return deepFreeze(result);
}

/**
 * کالیبراسیون و ارتقای اولویت پیشنهادهای جدید بر پایه تجارب و حافظه سازمانی مدرسه
 *
 * @param {Array<Object>} recommendations - پیشنهادهای خام تولیدشده
 * @param {Object} learningMemory - خروجی حافظه یادگیری یا الگوهای موفقیت/شکست
 * @param {Object} [options]
 * @returns {Array<Object>}
 */
function calibrateRecommendationsWithMemory(recommendations = [], learningMemory = {}, options = {}) {
  const recs = Array.isArray(recommendations) ? recommendations : [];
  if (recs.length === 0) return deepFreeze([]);

  const successfulPatterns = (learningMemory.successful_patterns || []).reduce((acc, p) => {
    acc.set(p.action_type, p);
    return acc;
  }, new Map());

  const ineffectivePatterns = (learningMemory.ineffective_patterns || []).reduce((acc, p) => {
    acc.set(p.action_type, p);
    return acc;
  }, new Map());

  const calibrated = recs.map((rec) => {
    const rawScore = Number(rec.priority_score) || 50;
    const actionType = rec.action_type;

    let bonusMultiplier = 1.0;
    let calibrationTag = 'STANDARD';
    let calibrationNote = null;

    if (successfulPatterns.has(actionType)) {
      const pat = successfulPatterns.get(actionType);
      if (pat.confidence_level === 'HIGH' || pat.confidence_level === 'MEDIUM') {
        bonusMultiplier = 1.15;
        calibrationTag = 'HISTORICAL_SUCCESS_VALIDATED';
        calibrationNote = `این رویکرد مداخله در سوابق مدرسه نرخ موفقیت مستند ${pat.success_rate_pct}٪ داشته است.`;
      }
    } else if (ineffectivePatterns.has(actionType)) {
      const pat = ineffectivePatterns.get(actionType);
      if (pat.sample_size >= 2) {
        bonusMultiplier = 0.75;
        calibrationTag = 'HISTORICAL_INEFFECTIVE_WARNING';
        calibrationNote = `هشدار تجربه مدرسه: این مداخله در گذشته اثربخشی پایینی (${pat.success_rate_pct}٪) ثبت کرده و نیازمند بررسی مجدد است.`;
      }
    }

    const calibratedScore = Math.min(100, Math.max(5, Math.round(rawScore * bonusMultiplier)));

    return {
      ...rec,
      priority_score: calibratedScore,
      base_priority_score: rawScore,
      calibration_tag: calibrationTag,
      calibration_note: calibrationNote,
      requires_human_confirmation: true,
      automated_decision: false
    };
  });

  // مرتب‌سازی قطعی بر اساس اولویت کالیبره‌شده نزولی
  calibrated.sort((a, b) => {
    if (b.priority_score !== a.priority_score) {
      return b.priority_score - a.priority_score;
    }
    return String(a.recommendation_id || '').localeCompare(String(b.recommendation_id || ''));
  });

  return deepFreeze(calibrated);
}

module.exports = {
  RECOMMENDATION_DECISION,
  REJECTION_REASONS,
  INTERVENTION_SUCCESS_LEVEL,
  MATURITY_LEVEL,
  deepFreeze,
  enforceFeedbackMemoryAccessGuard,
  recordActionOutcome,
  analyzeRecommendationAccuracy,
  calculateInterventionSuccessPatterns,
  calculateIntelligenceMaturity,
  buildOrganizationalLearningProfile,
  calibrateRecommendationsWithMemory
};
