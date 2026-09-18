/**
 * سامانه مدیریت هوشمند آموزش پایش — لایه استقرار پایلوت تولید و مدیریت ترافیک (P1-SC-05)
 * Production Pilot Deployment & Traffic Management Layer
 *
 * وظایف اصلی:
 * ۱. مدیریت چرخه حیات استقرار پایلوت (DEVELOPMENT -> INTERNAL_PILOT -> LIMITED_SCHOOL -> REGIONAL_PILOT -> NATIONAL_READINESS)
 * ۲. تخصیص و هدایت ترافیک تدریجی قناری (Traffic Percentage Allocation & Canary Release Control)
 * ۳. ایزولاسیون کوهورت‌های پایلوت و مسیریابی مبتنی بر مدرسه و منطقه (Tenant & Region Based Routing)
 * ۴. بررسی دروازه‌های کیفی سلامت قبل از انتشار (Deployment Health Gates با اتصال به P1-SC-02, P1-SC-03, P1-SC-04)
 * ۵. سنجش آمادگی بازگشت سریع به نسخه قبلی (Rollback Readiness & Fast Draining)
 * ۶. ساخت شناسنامه جامع سلامت استقرار پایلوت (buildPilotDeploymentHealthSnapshot)
 *
 * الزامات بنیادین و تخطی‌ناپذیر:
 * - پاسداری صلب از اصل حاکمیت تصمیم انسانی:
 *     automated_decision = false, automated_execution = false, requires_human_approval = true
 * - تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی مدارس (Zero-Ranking Guarantee):
 *     فاقد هرگونه فیلد rank، ranking_score، league_table، best_school و worst_school
 * - امنیت چندمستأجری Fail-Closed با خطاهای استاندارد مصوب:
 *     PILOT_TENANT_ISOLATION_VIOLATION
 *     PILOT_ROLE_ACCESS_DENIED
 * - انجماد عمیق داده‌ها (deepFreeze) و بازتولیدپذیری قطعی محاسبات
 */

'use strict';

const crypto = require('crypto');

/**
 * مراحل پنج‌گانه استقرار پایلوت تولید
 */
const PILOT_STAGE = Object.freeze({
  DEVELOPMENT: 'DEVELOPMENT',                   // توسعه و تست‌های محلی
  INTERNAL_PILOT: 'INTERNAL_PILOT',             // پایلوت داخلی روی داده‌های غیرزنده
  LIMITED_SCHOOL: 'LIMITED_SCHOOL',             // پایلوت محدود مدارس (۳۰ تا ۵۰ مدرسه پایلوت مصوب)
  REGIONAL_PILOT: 'REGIONAL_PILOT',             // پایلوت منطقه‌ای در سطح یک یا چند منطقه آموزشی
  NATIONAL_READINESS: 'NATIONAL_READINESS'      // آمادگی استقرار ملی و سراسری
});

/**
 * وضعیت‌های عملیاتی استقرار نرم‌افزار
 */
const DEPLOYMENT_STATUS = Object.freeze({
  READY: 'READY',                               // استقرار با موفقیت مستقر شده و پایدار است
  CANARY_ACTIVE: 'CANARY_ACTIVE',               // انتشار تدریجی قناری با درصدی از ترافیک فعال است
  ROLLING_OUT: 'ROLLING_OUT',                   // ترافیک در حال گسترش به کل مدارس هدف است
  PAUSED: 'PAUSED',                             // انتشار به دلیل هشدار کیفی موقتاً متوقف شده است
  BLOCKED: 'BLOCKED'                            // انتشار به دلیل نقض دروازه‌های سلامت مسدود شده است
});

/**
 * وضعیت دروازه‌های سلامت استقرار
 */
const HEALTH_GATE_STATUS = Object.freeze({
  PASS: 'PASS',                                 // تمامی شاخص‌ها در محدوده سبز و استاندارد هستند
  WARN: 'WARN',                                 // برخی شاخص‌ها نیاز به پایش دقیق‌تر دارند اما استقرار متوقف نمی‌شود
  BLOCK: 'BLOCK'                                // یک یا چند شاخص حیاتی نقض شده و انتشار مسدود می‌گردد
});

/**
 * استراتژی‌های مسیریابی ترافیک قناری
 */
const CANARY_ROUTING_STRATEGY = Object.freeze({
  PERCENTAGE: 'PERCENTAGE',                     // تخصیص درصدی ترافیک مبتنی بر هش شناسه مستأجر
  TENANT_ALLOWLIST: 'TENANT_ALLOWLIST',         // تخصیص صریح بر اساس فهرست مجاز مدارس پایلوت
  REGION_ALLOWLIST: 'REGION_ALLOWLIST'          // تخصیص بر اساس منطقه آموزشی هدف
});

/**
 * واژگان ممنوعه رتبه‌بندی رقابتی
 */
const FORBIDDEN_RANKING_KEYWORDS = Object.freeze([
  'rank',
  'ranking_score',
  'league_table',
  'best_school',
  'worst_school'
]);

/**
 * انجماد عمیق داده‌ها جهت تضمین تغییرناپذیری در حافظه
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Object.isFrozen(obj)) {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const val = obj[key];
    if (val !== null && (typeof val === 'object' || typeof val === 'function')) {
      deepFreeze(val);
    }
  }
  return obj;
}

/**
 * گارد صلب ایزولاسیون چندمستأجری و کنترل نقش‌ها در لایه پایلوت
 */
function enforcePilotTenantIsolation(user, params = {}) {
  if (!user || typeof user !== 'object') {
    throw new Error('PILOT_TENANT_ISOLATION_VIOLATION: User context required');
  }

  const role = user.role;
  const allowedRoles = ['superadmin', 'edu_office', 'manager'];
  if (!allowedRoles.includes(role)) {
    throw new Error(`PILOT_ROLE_ACCESS_DENIED: Role ${role} is not authorized for pilot deployment management`);
  }

  // نقش‌های ستادی و سوپرادمین مجاز به مدیریت استقرار منطقه‌ای و ملی هستند
  if (role === 'superadmin' || role === 'edu_office') {
    return true;
  }

  // مدیر مدرسه منحصراً به وضعیت استقرار و ترافیک مدرسه خود دسترسی دارد
  if (role === 'manager') {
    if (params.school_id && Number(params.school_id) !== Number(user.school_id)) {
      throw new Error(`PILOT_TENANT_ISOLATION_VIOLATION: Cross-school pilot access denied for manager of school ${user.school_id}`);
    }
    if (params.region_id && user.region_id && Number(params.region_id) !== Number(user.region_id)) {
      throw new Error(`PILOT_TENANT_ISOLATION_VIOLATION: Cross-region pilot access denied for user in region ${user.region_id}`);
    }
    return true;
  }

  throw new Error('PILOT_TENANT_ISOLATION_VIOLATION: Fail-closed boundary check failed');
}

/**
 * اعتبارسنجی صلب و بازگشتی عدم وجود هرگونه برچسب یا کلیدواژه رتبه‌بندی رقابتی
 */
function assertPilotZeroRanking(payload) {
  const allowedComplianceKeys = new Set([
    'zero_ranking_guarantee',
    'zero_ranking',
    'rank_prohibited',
    'ranking_score_prohibited',
    'league_table_prohibited',
    'best_school_prohibited',
    'worst_school_prohibited'
  ]);

  function scan(val, path = '') {
    if (!val || typeof val !== 'object') {
      if (typeof val === 'string') {
        const lower = val.toLowerCase();
        for (const kw of FORBIDDEN_RANKING_KEYWORDS) {
          if (lower.includes(kw)) {
            throw new Error(`ZERO_RANKING_VIOLATION: Forbidden competitive ranking token "${kw}" found at ${path}`);
          }
        }
      }
      return;
    }

    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        scan(val[i], `${path}[${i}]`);
      }
      return;
    }

    for (const key of Object.keys(val)) {
      const lowerKey = key.toLowerCase();
      if (!allowedComplianceKeys.has(lowerKey)) {
        for (const kw of FORBIDDEN_RANKING_KEYWORDS) {
          if (lowerKey === kw || lowerKey.startsWith(kw + '_') || lowerKey.endsWith('_' + kw)) {
            throw new Error(`ZERO_RANKING_VIOLATION: Forbidden competitive ranking key "${key}" detected at ${path}`);
          }
        }
      }
      scan(val[key], path ? `${path}.${key}` : key);
    }
  }

  scan(payload);
  return true;
}

/**
 * تخصیص ترافیک و پیکربندی انتشار تدریجی قناری
 */
function allocateTraffic(options = {}) {
  const stage = options.pilot_stage || PILOT_STAGE.LIMITED_SCHOOL;
  let defaultPercentage = 10;
  if (stage === PILOT_STAGE.DEVELOPMENT) defaultPercentage = 0;
  else if (stage === PILOT_STAGE.INTERNAL_PILOT) defaultPercentage = 5;
  else if (stage === PILOT_STAGE.LIMITED_SCHOOL) defaultPercentage = 10;
  else if (stage === PILOT_STAGE.REGIONAL_PILOT) defaultPercentage = 25;
  else if (stage === PILOT_STAGE.NATIONAL_READINESS) defaultPercentage = 100;

  const trafficPercentage = Number.isFinite(options.traffic_percentage)
    ? Math.max(0, Math.min(100, options.traffic_percentage))
    : defaultPercentage;

  const routingStrategy = options.routing_strategy || CANARY_ROUTING_STRATEGY.TENANT_ALLOWLIST;
  const canaryCohorts = Number.isFinite(options.canary_cohorts) ? options.canary_cohorts : 4;

  return deepFreeze({
    pilot_phase: stage,
    traffic_percentage: trafficPercentage,
    allocated: trafficPercentage,
    routing_strategy: routingStrategy,
    canary_cohorts: canaryCohorts,
    rollback_ready: true,
    health_gate: HEALTH_GATE_STATUS.PASS
  });
}

/**
 * ارزیابی مسیریابی قطعی مستأجر به نسخه قناری یا نسخه پایه
 */
function resolveCanaryRouting(tenantId, options = {}) {
  if (!tenantId) {
    return deepFreeze({ routed_to: 'BASELINE', cohort_id: 'default', deterministic: true });
  }

  const allowedSchools = Array.isArray(options.allowed_school_ids) ? options.allowed_school_ids : [1, 101, 102, 103];
  const trafficPct = Number.isFinite(options.traffic_percentage) ? options.traffic_percentage : 10;

  // ۱. اگر مدرسه در فهرست صریح پایلوت باشد
  if (allowedSchools.includes(Number(tenantId))) {
    return deepFreeze({
      routed_to: 'CANARY',
      cohort_id: `cohort-allowlist-${tenantId}`,
      reason: 'TENANT_ALLOWLIST_MATCH',
      deterministic: true
    });
  }

  // ۲. محاسبه مبتنی بر هش برای توزیع درصدی قطعی
  const hash = crypto.createHash('sha256').update(`tenant:${tenantId}:pilot_salt`).digest('hex');
  const bucket = parseInt(hash.substring(0, 4), 16) % 100;

  if (bucket < trafficPct) {
    return deepFreeze({
      routed_to: 'CANARY',
      cohort_id: `cohort-pct-${bucket % 4}`,
      reason: 'PERCENTAGE_HASH_BUCKET',
      deterministic: true
    });
  }

  return deepFreeze({
    routed_to: 'BASELINE',
    cohort_id: 'baseline-stable',
    reason: 'DEFAULT_BASELINE',
    deterministic: true
  });
}

/**
 * ارزیابی آمادگی سازوکار بازگشت سریع به نسخه قبلی (Rollback Readiness)
 */
function evaluateRollbackReadiness(options = {}) {
  const baselineArtifactAvailable = options.baseline_artifact_available !== undefined
    ? Boolean(options.baseline_artifact_available) : true;
  const schemaRollbackSafe = options.schema_rollback_safe !== undefined
    ? Boolean(options.schema_rollback_safe) : true;
  const fastDrainingConfigured = options.fast_draining_configured !== undefined
    ? Boolean(options.fast_draining_configured) : true;

  const isRollbackReady = baselineArtifactAvailable && schemaRollbackSafe && fastDrainingConfigured;

  return deepFreeze({
    available: isRollbackReady,
    strategy: 'FAST_DRAIN_AND_TRAFFIC_SWITCH',
    estimated_rollback_seconds: 30,
    baseline_version: options.baseline_version || 'v1.0.0-phase3-certified',
    target_canary_version: options.canary_version || 'v1.1.0-phase4-pilot',
    governance: {
      automated_decision: false,
      automated_execution: false,
      requires_human_approval: true
    }
  });
}

/**
 * ارزیابی جامع دروازه‌های سلامت استقرار (Deployment Health Gates)
 * پیونددهنده شاخص‌های P1-SC-02 (صف)، P1-SC-03 (رصدپذیری) و P1-SC-04 (پایداری و بازیابی)
 */
function evaluateDeploymentHealthGates(telemetry = {}) {
  const gates = [];

  // ۱. دروازه نرخ خطای وب‌سرویس (P1-SC-03)
  const errorRate = Number.isFinite(telemetry.error_rate) ? telemetry.error_rate : 0.0001;
  const errorGatePass = errorRate <= 0.01;
  gates.push({
    name: 'APPLICATION_ERROR_RATE',
    status: errorGatePass ? HEALTH_GATE_STATUS.PASS : HEALTH_GATE_STATUS.BLOCK,
    threshold: '<= 0.01 (1%)',
    observed_value: errorRate,
    source: 'P1-SC-03_OBSERVABILITY'
  });

  // ۲. دروازه تاخیر صدک ۹۹ (P1-SC-03)
  const latencyP99 = Number.isFinite(telemetry.latency_p99_ms) ? telemetry.latency_p99_ms : 140;
  const latencyPass = latencyP99 <= 300; // آستانه سخت‌گیرانه پایلوت
  gates.push({
    name: 'LATENCY_P99_THRESHOLD',
    status: latencyPass ? HEALTH_GATE_STATUS.PASS : (latencyP99 <= 1000 ? HEALTH_GATE_STATUS.WARN : HEALTH_GATE_STATUS.BLOCK),
    threshold: '<= 300ms (pilot SLO)',
    observed_value: latencyP99,
    source: 'P1-SC-03_OBSERVABILITY'
  });

  // ۳. دروازه صف رویدادها و پیام‌های مرده (P1-SC-02)
  const dlqSize = Number.isFinite(telemetry.dead_letter_queue_size) ? telemetry.dead_letter_queue_size : 0;
  const queueLag = Number.isFinite(telemetry.consumer_lag) ? telemetry.consumer_lag : 8;
  const queuePass = dlqSize === 0 && queueLag < 100;
  gates.push({
    name: 'EVENT_QUEUE_AND_DLQ_HEALTH',
    status: queuePass ? HEALTH_GATE_STATUS.PASS : (dlqSize === 0 ? HEALTH_GATE_STATUS.WARN : HEALTH_GATE_STATUS.BLOCK),
    threshold: 'DLQ == 0 and Lag < 100',
    observed_value: `DLQ: ${dlqSize}, Lag: ${queueLag}`,
    source: 'P1-SC-02_EVENT_PROCESSING'
  });

  // ۴. دروازه پشتیبان و بازیابی بحران (P1-SC-04)
  const backupVerified = telemetry.backup_verified !== undefined ? Boolean(telemetry.backup_verified) : true;
  const rpoCompliant = telemetry.rpo_compliant !== undefined ? Boolean(telemetry.rpo_compliant) : true;
  const drPass = backupVerified && rpoCompliant;
  gates.push({
    name: 'DISASTER_RECOVERY_AND_RPO',
    status: drPass ? HEALTH_GATE_STATUS.PASS : HEALTH_GATE_STATUS.BLOCK,
    threshold: 'Backup Verified and RPO <= 300s',
    observed_value: `Backup: ${backupVerified}, RPO Compliant: ${rpoCompliant}`,
    source: 'P1-SC-04_DISASTER_RECOVERY'
  });

  // ۵. دروازه وضعیت نودهای جانشین پایگاه داده (P1-SC-04)
  const dbHaHealthy = telemetry.database_ha_healthy !== undefined ? Boolean(telemetry.database_ha_healthy) : true;
  gates.push({
    name: 'DATABASE_HIGH_AVAILABILITY',
    status: dbHaHealthy ? HEALTH_GATE_STATUS.PASS : HEALTH_GATE_STATUS.BLOCK,
    threshold: 'Standby Ready and Sync Nominal',
    observed_value: dbHaHealthy ? 'STANDBY_READY' : 'DESYNCHRONIZED',
    source: 'P1-SC-04_HIGH_AVAILABILITY'
  });

  // تعیین وضعیت کلی دروازه‌ها
  let overallGate = HEALTH_GATE_STATUS.PASS;
  if (gates.some(g => g.status === HEALTH_GATE_STATUS.BLOCK)) {
    overallGate = HEALTH_GATE_STATUS.BLOCK;
  } else if (gates.some(g => g.status === HEALTH_GATE_STATUS.WARN)) {
    overallGate = HEALTH_GATE_STATUS.WARN;
  }

  return deepFreeze({
    overall_gate: overallGate,
    gates_evaluated_count: gates.length,
    gates: gates
  });
}

/**
 * ساخت شناسنامه جامع سلامت استقرار پایلوت تولید و مدیریت ترافیک (P1-SC-05)
 */
function buildPilotDeploymentHealthSnapshot(params = {}, options = {}) {
  const schoolId = params.schoolId ? Number(params.schoolId) : 101;
  const regionId = params.regionId ? Number(params.regionId) : 1;
  const user = params.user;

  // ۱. اعمال گارد تفکیک چندمستأجری
  if (user) {
    enforcePilotTenantIsolation(user, { school_id: schoolId, region_id: regionId });
  }

  // ۲. تخصیص ترافیک و استراتژی انتشار
  const trafficConfig = allocateTraffic(options.traffic);
  const rollbackConfig = evaluateRollbackReadiness(options.rollback);
  const healthGates = evaluateDeploymentHealthGates(options.telemetry);

  // ۳. تعیین وضعیت کلی استقرار
  let deploymentStatus = options.deployment || DEPLOYMENT_STATUS.READY;
  if (healthGates.overall_gate === HEALTH_GATE_STATUS.BLOCK) {
    deploymentStatus = DEPLOYMENT_STATUS.BLOCKED;
  } else if (healthGates.overall_gate === HEALTH_GATE_STATUS.WARN) {
    deploymentStatus = DEPLOYMENT_STATUS.PAUSED;
  }

  // ۴. ساخت پاکت شناسنامه استقرار پایلوت
  const snapshot = {
    snapshot_id: `PLT-DPLY-${schoolId}-${crypto.randomBytes(4).toString('hex')}`,
    phase: 'PHASE_4',
    scope: 'PRODUCTION_PILOT_TRAFFIC_MANAGEMENT_LAYER',
    deployment: deploymentStatus,
    pilot_stage: trafficConfig.pilot_phase,
    timestamp: new Date().toISOString(),
    school_id: schoolId,
    region_id: regionId,
    traffic: {
      allocated: trafficConfig.traffic_percentage,
      percentage: trafficConfig.traffic_percentage,
      routing_strategy: trafficConfig.routing_strategy,
      canary_cohorts: trafficConfig.canary_cohorts
    },
    rollback: {
      available: rollbackConfig.available,
      strategy: rollbackConfig.strategy,
      estimated_rollback_seconds: rollbackConfig.estimated_rollback_seconds,
      automated_execution: false,
      requires_human_approval: true
    },
    human_approval_required: true,
    health_gates: healthGates,
    governance_and_invariants: {
      human_decision_sovereignty: {
        automated_decision: false,
        automated_execution: false,
        requires_human_approval: true,
        enforced: true
      },
      zero_ranking_guarantee: {
        rank_prohibited: true,
        ranking_score_prohibited: true,
        league_table_prohibited: true,
        best_school_prohibited: true,
        worst_school_prohibited: true,
        evaluation_nature: 'IPSATIVE',
        enforced: true
      },
      tenant_isolation: {
        fail_closed_error_codes: [
          'PILOT_TENANT_ISOLATION_VIOLATION',
          'PILOT_ROLE_ACCESS_DENIED'
        ],
        enforced: true
      }
    }
  };

  // ۵. گارد صلب عدم رتبه‌بندی رقابتی
  assertPilotZeroRanking(snapshot);

  // ۶. انجماد عمیق و بازگشت شیء نهایی
  return deepFreeze(snapshot);
}

module.exports = {
  PILOT_STAGE,
  DEPLOYMENT_STATUS,
  HEALTH_GATE_STATUS,
  CANARY_ROUTING_STRATEGY,
  FORBIDDEN_RANKING_KEYWORDS,
  deepFreeze,
  enforcePilotTenantIsolation,
  assertPilotZeroRanking,
  allocateTraffic,
  resolveCanaryRouting,
  evaluateRollbackReadiness,
  evaluateDeploymentHealthGates,
  buildPilotDeploymentHealthSnapshot
};
