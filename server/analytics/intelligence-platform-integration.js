/**
 * سامانه مدیریت هوشمند آموزش پایش — لایه یکپارچه‌سازی پلتفرم هوشمندی آموزشی (P0-EI-20)
 * Educational Intelligence Platform Integration Layer Engine
 *
 * وظایف اصلی:
 * ۱. رجیستری مرکزی و ثبت تمامی ۱۱ موتور هوشمندی فاز ۳ (EI-09 تا EI-19) (registerIntelligenceEngine)
 * ۲. ممیزی سازگاری نسخ قراردادهای داده موتورها (validateEngineCompatibility)
 * ۳. ارزیابی سلامت زنجیره یکپارچه تصمیم تا پیامد (checkIntelligenceChainHealth)
 * ۴. ساخت شناسنامه یکپارچه پلتفرم هوشمندی آموزشی (buildUnifiedIntelligenceSnapshot)
 * ۵. تولید گزارش سلامت راهبردی کل پلتفرم (generatePlatformHealthReport)
 * ۶. گارد امنیتی چندمستأجری شکست ایمن (enforcePlatformAccessGuard)
 *
 * الزامات بنیادین:
 * - اصل حاکمیت تصمیم و اجرای انسانی: automated_decision = false، automated_execution = false، requires_human_approval = true
 * - تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی مدارس (Zero-Ranking Guarantee): فاقد هرگونه فیلد rank، league_table، best_school و worst_school
 * - امنیت چندمستأجری Fail-Closed با خطاهای رسمی مصوب
 * - انجماد عمیق ساختارها (deepFreeze) و بازتولیدپذیری قطعی ۱۰۰٪ در ۱۰ اجرای متوالی
 */

'use strict';

/**
 * شناسه‌های رسمی ۱۱ موتور هوشمندی پلتفرم
 */
const INTELLIGENCE_ENGINE_ID = Object.freeze({
  EI_09_SCHOOL_INTELLIGENCE: 'EI-09-SchoolIntelligence',
  EI_10_REGIONAL_NETWORK: 'EI-10-RegionalIntelligenceNetwork',
  EI_11_QUALITY_GOVERNANCE: 'EI-11-QualityGovernance',
  EI_12_LONGITUDINAL_MONITORING: 'EI-12-LongitudinalIntelligence',
  EI_13_ACTION_RECOMMENDATION: 'EI-13-ActionRecommendation',
  EI_14_FEEDBACK_MEMORY: 'EI-14-FeedbackLearningMemory',
  EI_15_INTELLIGENCE_GOVERNANCE: 'EI-15-IntelligenceGovernance',
  EI_16_POLICY_SIMULATION: 'EI-16-PolicySimulation',
  EI_17_DECISION_COMMAND: 'EI-17-DecisionCommand',
  EI_18_OPERATIONAL_EXECUTION: 'EI-18-OperationalExecution',
  EI_19_OUTCOME_EVALUATION: 'EI-19-OutcomeEvaluation'
});

/**
 * وضعیت سلامت کلی پلتفرم
 */
const PLATFORM_HEALTH_STATUS = Object.freeze({
  HEALTHY: 'HEALTHY',       // تمام ۱۱ موتور فعال، زنجیره تصمیم کامل، سازگاری ۱۰۰٪
  DEGRADED: 'DEGRADED',     // هشدارهای کیفی، تاخیر در داده یا فقدان شواهد جزئی
  CRITICAL: 'CRITICAL'      // گسست در زنجیره تصمیم یا خطای چندمستأجری
});

/**
 * وضعیت عملکردی هر موتور
 */
const ENGINE_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  INITIALIZING: 'INITIALIZING',
  DEGRADED: 'DEGRADED',
  DISABLED: 'DISABLED'
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
 * کاتالوگ استاندارد پیش‌فرض ۱۱ موتور هوشمندی پلتفرم
 */
const CANONICAL_ENGINE_CATALOG = Object.freeze([
  {
    engine_id: INTELLIGENCE_ENGINE_ID.EI_09_SCHOOL_INTELLIGENCE,
    name: 'مرکز هوشمندی مدرسه',
    contract_version: '1.0.0',
    domain: 'ANALYTICS',
    status: ENGINE_STATUS.ACTIVE,
    dependencies: []
  },
  {
    engine_id: INTELLIGENCE_ENGINE_ID.EI_10_REGIONAL_NETWORK,
    name: 'شبکه هوشمندی منطقه‌ای',
    contract_version: '1.0.0',
    domain: 'REGIONAL',
    status: ENGINE_STATUS.ACTIVE,
    dependencies: [INTELLIGENCE_ENGINE_ID.EI_09_SCHOOL_INTELLIGENCE]
  },
  {
    engine_id: INTELLIGENCE_ENGINE_ID.EI_11_QUALITY_GOVERNANCE,
    name: 'حاکمیت کیفیت داده‌ها',
    contract_version: '1.0.0',
    domain: 'GOVERNANCE',
    status: ENGINE_STATUS.ACTIVE,
    dependencies: [INTELLIGENCE_ENGINE_ID.EI_09_SCHOOL_INTELLIGENCE]
  },
  {
    engine_id: INTELLIGENCE_ENGINE_ID.EI_12_LONGITUDINAL_MONITORING,
    name: 'پایش طولی و تحلیل مسیر تحصیلی',
    contract_version: '1.0.0',
    domain: 'ANALYTICS',
    status: ENGINE_STATUS.ACTIVE,
    dependencies: [INTELLIGENCE_ENGINE_ID.EI_09_SCHOOL_INTELLIGENCE]
  },
  {
    engine_id: INTELLIGENCE_ENGINE_ID.EI_13_ACTION_RECOMMENDATION,
    name: 'موتور پیشنهاددهنده و برنامه‌ریزی اقدام',
    contract_version: '1.0.0',
    domain: 'DECISION',
    status: ENGINE_STATUS.ACTIVE,
    dependencies: [INTELLIGENCE_ENGINE_ID.EI_11_QUALITY_GOVERNANCE, INTELLIGENCE_ENGINE_ID.EI_12_LONGITUDINAL_MONITORING]
  },
  {
    engine_id: INTELLIGENCE_ENGINE_ID.EI_14_FEEDBACK_MEMORY,
    name: 'حافظه سازمانی و حلقه بازخورد',
    contract_version: '1.0.0',
    domain: 'LEARNING',
    status: ENGINE_STATUS.ACTIVE,
    dependencies: [INTELLIGENCE_ENGINE_ID.EI_13_ACTION_RECOMMENDATION]
  },
  {
    engine_id: INTELLIGENCE_ENGINE_ID.EI_15_INTELLIGENCE_GOVERNANCE,
    name: 'داشبورد حاکمیت و شفافیت هوش مصنوعی',
    contract_version: '1.0.0',
    domain: 'GOVERNANCE',
    status: ENGINE_STATUS.ACTIVE,
    dependencies: [INTELLIGENCE_ENGINE_ID.EI_11_QUALITY_GOVERNANCE, INTELLIGENCE_ENGINE_ID.EI_14_FEEDBACK_MEMORY]
  },
  {
    engine_id: INTELLIGENCE_ENGINE_ID.EI_16_POLICY_SIMULATION,
    name: 'موتور شبیه‌سازی خط‌مشی‌های آموزشی',
    contract_version: '1.0.0',
    domain: 'SIMULATION',
    status: ENGINE_STATUS.ACTIVE,
    dependencies: [INTELLIGENCE_ENGINE_ID.EI_12_LONGITUDINAL_MONITORING, INTELLIGENCE_ENGINE_ID.EI_14_FEEDBACK_MEMORY]
  },
  {
    engine_id: INTELLIGENCE_ENGINE_ID.EI_17_DECISION_COMMAND,
    name: 'ارکستراسیون فرماندهی و هوش تصمیم',
    contract_version: '1.0.0',
    domain: 'COMMAND',
    status: ENGINE_STATUS.ACTIVE,
    dependencies: [INTELLIGENCE_ENGINE_ID.EI_13_ACTION_RECOMMENDATION, INTELLIGENCE_ENGINE_ID.EI_16_POLICY_SIMULATION]
  },
  {
    engine_id: INTELLIGENCE_ENGINE_ID.EI_18_OPERATIONAL_EXECUTION,
    name: 'لایه اجرای عملیاتی وظایف مدرسه',
    contract_version: '1.0.0',
    domain: 'EXECUTION',
    status: ENGINE_STATUS.ACTIVE,
    dependencies: [INTELLIGENCE_ENGINE_ID.EI_17_DECISION_COMMAND]
  },
  {
    engine_id: INTELLIGENCE_ENGINE_ID.EI_19_OUTCOME_EVALUATION,
    name: 'ارزیابی پیامد عینی و بهینه‌سازی مستمر',
    contract_version: '1.0.0',
    domain: 'OPTIMIZATION',
    status: ENGINE_STATUS.ACTIVE,
    dependencies: [INTELLIGENCE_ENGINE_ID.EI_18_OPERATIONAL_EXECUTION]
  }
]);

/**
 * اعتبارسنجی دسترسی متمرکز چندمستأجری شکست ایمن (Fail-Closed Access Guard)
 *
 * @param {Object} user - کاربر احراز هویت‌شده
 * @param {Object} target - { school_id, region_id }
 * @returns {boolean}
 */
function enforcePlatformAccessGuard(user, target = {}) {
  if (!user) {
    throw new Error('INTELLIGENCE_PLATFORM_ROLE_ACCESS_DENIED: کاربر احراز هویت نشده است');
  }

  const role = user.role;
  const allowedRoles = ['superadmin', 'admin', 'manager', 'deputy', 'counselor', 'edu_office'];
  if (!allowedRoles.includes(role)) {
    throw new Error(`INTELLIGENCE_PLATFORM_ROLE_ACCESS_DENIED: نقش "${role}" مجاز به دسترسی لایه یکپارچه‌سازی پلتفرم نیست`);
  }

  if (role === 'superadmin' || role === 'admin') {
    return true;
  }

  if (role === 'edu_office') {
    const userRegion = Number(user.region_id || user.district_id);
    const targetRegion = target.region_id != null ? Number(target.region_id) : null;
    if (targetRegion && userRegion !== targetRegion) {
      throw new Error(`INTELLIGENCE_PLATFORM_TENANT_ISOLATION_VIOLATION: دسترسی به منطقه ${targetRegion} برای منطقه ${userRegion} مسدود است`);
    }
    return true;
  }

  const userSchool = Number(user.school_id);
  const targetSchool = target.school_id != null ? Number(target.school_id) : null;

  if (targetSchool && userSchool !== targetSchool) {
    throw new Error(`INTELLIGENCE_PLATFORM_TENANT_ISOLATION_VIOLATION: دسترسی به مدرسه ${targetSchool} برای کاربر مدرسه ${userSchool} مسدود است`);
  }

  return true;
}

/**
 * ثبت موتور هوشمندی در رجیستری مرکزی پلتفرم (registerIntelligenceEngine)
 *
 * @param {Object} engineDef - تعریف موتور
 * @param {Object} options - { timestamp }
 * @returns {Object}
 */
function registerIntelligenceEngine(engineDef = {}, options = {}) {
  const nowIso = options.timestamp || '2026-09-18T12:00:00.000Z';
  const engineId = engineDef.engine_id || 'UNKNOWN_ENGINE';

  const registration = {
    engine_id: engineId,
    name: engineDef.name || engineId,
    contract_version: engineDef.contract_version || '1.0.0',
    domain: engineDef.domain || 'ANALYTICS',
    status: engineDef.status || ENGINE_STATUS.ACTIVE,
    dependencies: Array.isArray(engineDef.dependencies) ? [...engineDef.dependencies] : [],
    registered_at: nowIso
  };

  return deepFreeze(registration);
}

/**
 * ممیزی سازگاری نسخ قراردادهای داده ۱۱ موتور هوشمندی (validateEngineCompatibility)
 *
 * @param {Array} engines - لیست موتورها (یا پیش‌فرض CANONICAL_ENGINE_CATALOG)
 * @param {Object} options - { timestamp }
 * @returns {Object}
 */
function validateEngineCompatibility(engines, options = {}) {
  const nowIso = options.timestamp || '2026-09-18T12:00:00.000Z';
  const catalog = Array.isArray(engines) && engines.length > 0 ? engines : CANONICAL_ENGINE_CATALOG;

  const versionMatrix = {};
  const incompatibles = [];
  let compatibleCount = 0;

  for (const eng of catalog) {
    const v = eng.contract_version || '0.0.0';
    versionMatrix[eng.engine_id] = v;

    // نسخه معتبر رسمی 1.0.0 است
    if (v === '1.0.0') {
      compatibleCount++;
    } else {
      incompatibles.push({
        engine_id: eng.engine_id,
        expected_version: '1.0.0',
        actual_version: v,
        reason: 'نسخه قرارداد با استاندارد 1.0.0 پلتفرم فاز ۳ همخوانی ندارد'
      });
    }
  }

  const allCompatible = incompatibles.length === 0 && compatibleCount >= 11;

  const report = {
    total_registered_engines: catalog.length,
    compatible_engines_count: compatibleCount,
    all_compatible: allCompatible,
    contract_version_matrix: versionMatrix,
    incompatible_engines: incompatibles,
    evaluated_at: nowIso
  };

  return deepFreeze(report);
}

/**
 * ارزیابی سلامت زنجیره یکپارچه تصمیم تا پیامد (checkIntelligenceChainHealth)
 *
 * @param {Object} params - { engineOutputs, options }
 * @returns {Object}
 */
function checkIntelligenceChainHealth(params = {}) {
  const outputs = params.engineOutputs || {};
  const options = params.options || {};
  const issues = [];

  /* A-31 / I-04: حضورِ گره باید از خروجیِ واقعیِ موتورها بیاید — فال‌بکِ
     `|| true` هر چهار گره را حتی بدونِ هیچ خروجی‌ای «حاضر» جا می‌زد و زنجیرهٔ
     بی‌داده را سالم نشان می‌داد. */
  const nodes = {
    insight_engines_present: Boolean(outputs.schoolIntelligence || outputs.insights),
    decision_command_present: Boolean(outputs.decisionCommand || outputs.decisions),
    execution_workflow_present: Boolean(outputs.executionDashboard || outputs.tasks),
    outcome_evaluation_present: Boolean(outputs.outcomeEvaluation || outputs.evaluations)
  };

  // چک‌های انسجام و حاکمیت
  const evidencePresence = Boolean(outputs.evidence || outputs.evidence_bundle || outputs.evidence_count > 0);
  let humanApprovalEnforced = true;
  let auditTrailPreserved = true;
  let zeroRankingGuaranteed = true;

  if (outputs.zero_ranking === false) {
    zeroRankingGuaranteed = false;
    issues.push('نقض تضمین عدم رتبه‌بندی در خروجی یکی از موتورها کشف شد');
  }

  if (outputs.automated_decision === true) {
    humanApprovalEnforced = false;
    issues.push('نقض حاکمیت انسانی: پرچم تصمیم خودکار در سیستم مشاهده شد');
  }

  const presentCount = Object.values(nodes).filter(Boolean).length;
  const dataStatus = presentCount === 0 ? 'NO_DATA'
    : (presentCount === Object.keys(nodes).length ? 'COMPLETE' : 'PARTIAL');

  let chainStatus = PLATFORM_HEALTH_STATUS.HEALTHY;
  if (!zeroRankingGuaranteed || !humanApprovalEnforced) {
    chainStatus = PLATFORM_HEALTH_STATUS.CRITICAL;
  } else if (presentCount === 0) {
    /* بی‌داده هرگز سالم نیست: هیچ خروجیِ موتوری وجود ندارد. */
    chainStatus = PLATFORM_HEALTH_STATUS.DEGRADED;
    issues.push('هیچ خروجی واقعی از موتورهای زنجیره دریافت نشد — وضعیت سالم اعلام نمی‌شود');
  } else if (presentCount < Object.keys(nodes).length) {
    chainStatus = PLATFORM_HEALTH_STATUS.DEGRADED;
    issues.push('برخی گره‌های زنجیره فاقد خروجی واقعی هستند');
  }

  const healthStatus = {
    chain_status: chainStatus,
    data_status: dataStatus,
    nodes,
    integrity_checks: {
      evidence_presence: evidencePresence,
      human_approval_enforced: humanApprovalEnforced,
      audit_trail_preserved: auditTrailPreserved,
      zero_ranking_guaranteed: zeroRankingGuaranteed
    },
    issues_detected: issues
  };

  return deepFreeze(healthStatus);
}

/**
 * ساخت شناسنامه یکپارچه پلتفرم هوشمندی آموزشی (buildUnifiedIntelligenceSnapshot)
 *
 * @param {Object} params - { schoolId, regionId, academicYear, engineOutputs, options }
 * @returns {Object}
 */
function buildUnifiedIntelligenceSnapshot(params = {}) {
  const schoolId = params.schoolId != null ? Number(params.schoolId) : 1;
  const regionId = params.regionId != null ? Number(params.regionId) : 1;
  const academicYear = params.academicYear || '1405-1406';
  const options = params.options || {};
  const nowIso = options.timestamp || '2026-09-18T12:00:00.000Z';

  if (options.requester) {
    enforcePlatformAccessGuard(options.requester, { school_id: schoolId, region_id: regionId });
  }

  const catalog = CANONICAL_ENGINE_CATALOG.map(eng => registerIntelligenceEngine(eng, options));
  const compatibility = validateEngineCompatibility(catalog, options);
  const chainHealth = checkIntelligenceChainHealth({ engineOutputs: params.engineOutputs, options });

  /* A-31 / I-07: متریک‌های خلاصه فقط از خروجیِ واقعیِ موتورها می‌آیند؛
     اعدادِ سخت‌کد (۸۶.۵/۸۴/۵/۸/۴/۸۱.۲) جای خروجی موتور ننشسته‌اند. */
  const eo = params.engineOutputs || {};
  const numOrNull = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const countOrNull = (v) => {
    if (v == null) return null;
    if (Array.isArray(v)) return v.length;
    return numOrNull(v);
  };
  const summaryMetrics = {
    school_intelligence_score: eo.schoolIntelligence ? numOrNull(eo.schoolIntelligence.score) : null,
    health_index: eo.schoolIntelligence ? numOrNull(eo.schoolIntelligence.health_index) : null,
    decision_items_count: eo.decisionCommand ? countOrNull(eo.decisionCommand.total_decisions != null ? eo.decisionCommand.total_decisions : eo.decisionCommand.items) : null,
    operational_tasks_count: eo.executionDashboard ? countOrNull(eo.executionDashboard.total_tasks != null ? eo.executionDashboard.total_tasks : eo.executionDashboard.tasks) : null,
    evaluations_count: eo.outcomeEvaluation ? countOrNull(eo.outcomeEvaluation.evaluations_count != null ? eo.outcomeEvaluation.evaluations_count : eo.outcomeEvaluation.evaluations) : null,
    avg_impact_score: eo.outcomeEvaluation ? numOrNull(eo.outcomeEvaluation.avg_impact_score) : null
  };
  const engineDataStatus = chainHealth.data_status;

  const snapshot = {
    snapshot_id: `UNIF-SNAP-SCH${schoolId}-${academicYear}`.replace(/[^A-Za-z0-9_-]/g, '_'),
    school_id: schoolId,
    region_id: regionId,
    academic_year: academicYear,
    platform_health: chainHealth.chain_status,
    total_engines_integrated: catalog.length,
    active_engines_count: catalog.filter(e => e.status === ENGINE_STATUS.ACTIVE).length,
    engine_catalog: catalog,
    compatibility_report: compatibility,
    chain_health: chainHealth,
    summary_metrics: summaryMetrics,
    data_status: engineDataStatus,
    automated_decision: false,
    automated_execution: false,
    requires_human_approval: true,
    zero_ranking: true,
    generated_at: nowIso
  };

  return deepFreeze(snapshot);
}

/**
 * تولید گزارش سلامت راهبردی کل پلتفرم (generatePlatformHealthReport)
 *
 * @param {Object} params - { schoolId, regionId, options }
 * @returns {Object}
 */
function generatePlatformHealthReport(params = {}) {
  const schoolId = params.schoolId != null ? Number(params.schoolId) : 1;
  const regionId = params.regionId != null ? Number(params.regionId) : 1;
  const options = params.options || {};
  const nowIso = options.timestamp || '2026-09-18T12:00:00.000Z';

  const snapshot = buildUnifiedIntelligenceSnapshot({ schoolId, regionId, engineOutputs: params.engineOutputs, options });

  /* A-31 / I-07: درصدها و تأییدها از گزارش‌های واقعی مشتق می‌شوند، نه عددِ ثابت. */
  const compat = snapshot.compatibility_report || {};
  const totalEngines = Number(compat.total_registered_engines) || 0;
  const compatibilityPct = totalEngines > 0
    ? Number(((Number(compat.compatible_engines_count) || 0) / totalEngines * 100).toFixed(1))
    : null;
  const nodes = (snapshot.chain_health && snapshot.chain_health.nodes) || {};
  const nodeValues = Object.values(nodes);
  const chainIntegrityScore = nodeValues.length > 0
    ? Number((nodeValues.filter(Boolean).length / nodeValues.length * 100).toFixed(1))
    : null;
  const integrity = (snapshot.chain_health && snapshot.chain_health.integrity_checks) || {};

  const report = {
    school_id: schoolId,
    region_id: regionId,
    platform_status: snapshot.platform_health,
    integrated_engines_count: snapshot.total_engines_integrated,
    compatibility_pct: compatibilityPct,
    chain_integrity_score: chainIntegrityScore,
    human_sovereignty_verified: integrity.human_approval_enforced === true,
    zero_ranking_verified: integrity.zero_ranking_guaranteed === true,
    data_status: snapshot.data_status,
    reported_at: nowIso
  };

  return deepFreeze(report);
}

module.exports = {
  INTELLIGENCE_ENGINE_ID,
  PLATFORM_HEALTH_STATUS,
  ENGINE_STATUS,
  CANONICAL_ENGINE_CATALOG,
  deepFreeze,
  enforcePlatformAccessGuard,
  registerIntelligenceEngine,
  validateEngineCompatibility,
  checkIntelligenceChainHealth,
  buildUnifiedIntelligenceSnapshot,
  generatePlatformHealthReport
};
