/**
 * سامانه مدیریت هوشمند آموزش پایش — فاز ۵: فدراسیون کلاسترهای چندمنطقه‌ای (P2-PL-01)
 * Phase 5: Multi-Region Cloud Federation Layer
 *
 * وظایف اصلی:
 * ۱. رجیستری رسمی مناطق و کلاسترهای استانی کشور (Region Registry)
 * ۲. مانیتورینگ سلامت، سنکرونیزاسیون و تاخیر بین‌منطقه‌ای (Cluster Federation Health)
 * ۳. آگاهی از وضعیت رخداد بحران و جابجایی سرورها (Region Failover Awareness)
 * ۴. کنترل وضعیت مناطق: ACTIVE, DEGRADED, READ_ONLY, OFFLINE
 * ۵. الزام صلب حاکمیت تصمیم انسانی در فعال‌سازی یا تغییر وضعیت کلاسترها
 * ۶. منع کامل رتبه‌بندی رقابتی مناطق یا مدارس
 */

'use strict';

const crypto = require('crypto');

/**
 * وضعیت‌های رسمی کلاسترها و مناطق در فاز ۵
 */
const REGION_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',         // فعال، ترافیک خواندن و نوشتن نرمال
  DEGRADED: 'DEGRADED',     // دارای افت کارایی یا تاخیر سنکرون، نیازمند پایش
  READ_ONLY: 'READ_ONLY',   // فقط‌خواندنی، قطع نوشتن محلی جهت مهار عدم قطعیت
  OFFLINE: 'OFFLINE'        // کاملاً خارج از مدار عملیاتی
});

/**
 * وضعیت جابجایی سرورهای منطقه (Failover State)
 */
const FAILOVER_STATE = Object.freeze({
  PRIMARY: 'PRIMARY',
  STANDBY_SYNCED: 'STANDBY_SYNCED',
  FAILOVER_PENDING_APPROVAL: 'FAILOVER_PENDING_APPROVAL',
  FAILOVER_IN_PROGRESS: 'FAILOVER_IN_PROGRESS',
  FAILOVER_COMPLETED: 'FAILOVER_COMPLETED'
});

/**
 * کدهای خطای رسمی لایه فدراسیون چندمنطقه‌ای
 */
const FEDERATION_ERRORS = Object.freeze({
  REGION_ISOLATION_VIOLATION: 'PHASE5_REGION_ISOLATION_VIOLATION',
  TENANT_BOUNDARY_BREACH: 'PHASE5_TENANT_BOUNDARY_BREACH',
  DATA_RESIDENCY_POLICY_FAILURE: 'PHASE5_DATA_RESIDENCY_POLICY_FAILURE',
  ZERO_RANKING_VIOLATION: 'ZERO_RANKING_VIOLATION',
  HUMAN_APPROVAL_REQUIRED: 'PHASE5_HUMAN_APPROVAL_REQUIRED',
  REGION_NOT_FOUND: 'PHASE5_REGION_NOT_FOUND',
  INVALID_REGION_STATUS: 'PHASE5_INVALID_REGION_STATUS'
});

/**
 * کاتالوگ استاندارد کلاسترهای چندمنطقه‌ای پایلوت ملی
 */
const CANONICAL_REGIONS = Object.freeze([
  {
    region_id: 'ir-tehran-1',
    numeric_id: 1,
    name: 'کلاستر مرکزی تهران و توابع',
    geography: 'CENTRAL',
    primary_dc: 'tehran-dc-01',
    standby_dc: 'tehran-dc-02',
    capacity_provinces: ['تهران', 'البرز', 'سمنان'],
    status: REGION_STATUS.ACTIVE,
    quota_schools: 5000,
    quota_concurrent_users: 500000,
    rural_support: false,
    border_support: false,
    sync_interval_ms: 1000
  },
  {
    region_id: 'ir-isfahan-1',
    numeric_id: 2,
    name: 'کلاستر فلات مرکزی (اصفهان و یزد)',
    geography: 'CENTRAL_SOUTH',
    primary_dc: 'isfahan-dc-01',
    standby_dc: 'yazd-dc-01',
    capacity_provinces: ['اصفهان', 'یزد', 'چهارمحال و بختیاری'],
    status: REGION_STATUS.ACTIVE,
    quota_schools: 3500,
    quota_concurrent_users: 350000,
    rural_support: true,
    border_support: false,
    sync_interval_ms: 1500
  },
  {
    region_id: 'ir-khorasan-1',
    numeric_id: 3,
    name: 'کلاستر شرق و شمال شرق (مشهد)',
    geography: 'EAST',
    primary_dc: 'mashhad-dc-01',
    standby_dc: 'tehran-dc-01',
    capacity_provinces: ['خراسان رضوی', 'خراسان شمالی', 'خراسان جنوبی'],
    status: REGION_STATUS.ACTIVE,
    quota_schools: 4000,
    quota_concurrent_users: 400000,
    rural_support: true,
    border_support: true,
    sync_interval_ms: 1500
  },
  {
    region_id: 'ir-fars-1',
    numeric_id: 4,
    name: 'کلاستر جنوب کشور (شیراز)',
    geography: 'SOUTH',
    primary_dc: 'shiraz-dc-01',
    standby_dc: 'isfahan-dc-01',
    capacity_provinces: ['فارس', 'بوشهر', 'کهگیلویه و بویراحمد', 'هرمزگان'],
    status: REGION_STATUS.ACTIVE,
    quota_schools: 3800,
    quota_concurrent_users: 380000,
    rural_support: true,
    border_support: true,
    sync_interval_ms: 2000
  },
  {
    region_id: 'ir-tabriz-1',
    numeric_id: 5,
    name: 'کلاستر شمال غرب (آذربایجان)',
    geography: 'NORTHWEST',
    primary_dc: 'tabriz-dc-01',
    standby_dc: 'tehran-dc-02',
    capacity_provinces: ['آذربایجان شرقی', 'آذربایجان غربی', 'اردبیل', 'زنجان'],
    status: REGION_STATUS.ACTIVE,
    quota_schools: 3200,
    quota_concurrent_users: 320000,
    rural_support: true,
    border_support: true,
    sync_interval_ms: 1500
  },
  {
    region_id: 'ir-border-west-1',
    numeric_id: 6,
    name: 'کلاستر مناطق مرزی غرب و جنوب غرب',
    geography: 'WEST_BORDER',
    primary_dc: 'ahvaz-dc-01',
    standby_dc: 'shiraz-dc-01',
    capacity_provinces: ['خوزستان', 'کرمانشاه', 'ایلام', 'کردستان'],
    status: REGION_STATUS.ACTIVE,
    quota_schools: 2800,
    quota_concurrent_users: 280000,
    rural_support: true,
    border_support: true,
    sync_interval_ms: 3000
  },
  {
    region_id: 'ir-rural-central-1',
    numeric_id: 7,
    name: 'کلاستر اختصاصی مدارس روستایی و عشایری',
    geography: 'RURAL_NETWORK',
    primary_dc: 'tehran-dc-02',
    standby_dc: 'isfahan-dc-01',
    capacity_provinces: ['سراسری_روستایی_عشایری'],
    status: REGION_STATUS.ACTIVE,
    quota_schools: 2000,
    quota_concurrent_users: 150000,
    rural_support: true,
    border_support: true,
    sync_interval_ms: 5000
  }
]);

/**
 * انجماد عمیق اشیا
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
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
 * اسکن عمیق منع رتبه‌بندی رقابتی مدارس و مناطق
 */
const ALLOWED_COMPLIANCE_KEYS = new Set([
  'zero_ranking_guarantee',
  'zero_ranking_audit',
  'zero_ranking_verified',
  'zero_ranking_enforced',
  'zero_ranking_status',
  'prohibit_ranking',
  'rank_prohibited'
]);

function assertNoZeroRanking(value) {
  const forbidden = [
    /\brank\b/i,
    /\branking\b/i,
    /\branking_score\b/i,
    /\bleague_table\b/i,
    /\bbest_school\b/i,
    /\bworst_school\b/i,
    /\btop_school\b/i,
    /\bcompare_school\b/i,
    /رتبه‌بندی/u,
    /رتبه_مدرسه/u,
    /مدرسه_برتر/u
  ];

  function scan(val, path = '') {
    if (val === null || val === undefined) return;
    if (typeof val === 'string') {
      for (const p of forbidden) {
        if (p.test(val)) {
          const err = new Error(`ZERO_RANKING_VIOLATION: واژه ممنوعه رتبه‌بندی در "${path}": "${val}"`);
          err.code = FEDERATION_ERRORS.ZERO_RANKING_VIOLATION;
          throw err;
        }
      }
      return;
    }
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) scan(val[i], `${path}[${i}]`);
      return;
    }
    if (typeof val === 'object') {
      for (const key of Object.keys(val)) {
        if (ALLOWED_COMPLIANCE_KEYS.has(key)) continue;
        for (const p of forbidden) {
          if (p.test(key)) {
            const err = new Error(`ZERO_RANKING_VIOLATION: کلید ممنوعه رتبه‌بندی "${key}" در "${path}"`);
            err.code = FEDERATION_ERRORS.ZERO_RANKING_VIOLATION;
            throw err;
          }
        }
        scan(val[key], path ? `${path}.${key}` : key);
      }
    }
  }

  scan(value);
}

/**
 * گارد صلب الزام حاکمیت تصمیم انسانی در فرآیندهای عملیاتی
 */
function assertHumanApproval(context = {}) {
  if (
    context.automated_decision !== false ||
    context.automated_execution !== false ||
    context.requires_human_approval !== true ||
    !context.approved_by_operator
  ) {
    const err = new Error(
      'PHASE5_HUMAN_APPROVAL_REQUIRED: این اقدام نیازمند تأیید رسمی اپراتور انسانی است و تصمیم‌گیری خودکار اکیداً مسدود می‌باشد'
    );
    err.code = FEDERATION_ERRORS.HUMAN_APPROVAL_REQUIRED;
    throw err;
  }
}

/**
 * دریافت رجیستری کامل مناطق فدراسیون
 */
function getRegionRegistry() {
  return deepFreeze(CANONICAL_REGIONS.map(r => ({ ...r })));
}

/**
 * دریافت اطلاعات یک منطقه بر اساس شناسه رشته‌ای یا عددی
 */
function getRegionById(id) {
  if (id === null || id === undefined) return null;
  const strId = String(id).trim().toLowerCase();
  const numId = Number(id);

  const found = CANONICAL_REGIONS.find(
    r => r.region_id.toLowerCase() === strId || (!Number.isNaN(numId) && r.numeric_id === numId)
  );

  return found ? deepFreeze({ ...found }) : null;
}

/**
 * ارزیابی سلامت جامع کلاسترهای فدراسیون چندمنطقه‌ای
 *
 * @param {Object} metrics - تلمتری ارسالی مناطق
 * @returns {Object} شناسنامه سلامت فدراسیون
 */
function calculateFederationHealth(metrics = {}) {
  const regions = getRegionRegistry();
  const now = new Date().toISOString();

  const statuses = {};
  let totalActive = 0;
  let totalDegraded = 0;
  let totalReadOnly = 0;
  let totalOffline = 0;

  for (const r of regions) {
    const override = metrics[r.region_id] || {};
    const status = override.status || r.status;
    const latencyMs = override.latency_ms != null ? override.latency_ms : (r.rural_support ? 45 : 18);
    const syncLagMs = override.sync_lag_ms != null ? override.sync_lag_ms : 120;

    statuses[r.region_id] = {
      name: r.name,
      status,
      latency_ms: latencyMs,
      sync_lag_ms: syncLagMs,
      primary_dc: r.primary_dc,
      standby_dc: r.standby_dc,
      rural_mode: r.rural_support,
      border_mode: r.border_support,
      last_sync_at: now
    };

    if (status === REGION_STATUS.ACTIVE) totalActive++;
    else if (status === REGION_STATUS.DEGRADED) totalDegraded++;
    else if (status === REGION_STATUS.READ_ONLY) totalReadOnly++;
    else if (status === REGION_STATUS.OFFLINE) totalOffline++;
  }

  const federationOverallStatus =
    totalOffline > 0 ? 'CRITICAL' :
    (totalDegraded > 0 || totalReadOnly > 0 ? 'DEGRADED' : 'HEALTHY');

  const snapshot = {
    federation_status: federationOverallStatus,
    total_regions: regions.length,
    counts: {
      active: totalActive,
      degraded: totalDegraded,
      read_only: totalReadOnly,
      offline: totalOffline
    },
    regions: statuses,
    governance: {
      human_decision_sovereignty: true,
      zero_ranking_guarantee: true,
      data_residency_enforced: true
    },
    timestamp: now
  };

  assertNoZeroRanking(snapshot);
  return deepFreeze(snapshot);
}

/**
 * ارزیابی وضعیت رخداد Failover در منطقه
 *
 * @param {string} regionId
 * @param {Object} healthSignal
 * @returns {Object}
 */
function assessRegionFailover(regionId, healthSignal = {}) {
  const region = getRegionById(regionId);
  if (!region) {
    const err = new Error(`منطقه "${regionId}" یافت نشد`);
    err.code = FEDERATION_ERRORS.REGION_NOT_FOUND;
    throw err;
  }

  const primaryAlive = healthSignal.primary_alive !== false;
  const standbySynced = healthSignal.standby_synced !== false;
  const replicationLagMs = healthSignal.replication_lag_ms || 85;

  let failoverState = FAILOVER_STATE.PRIMARY;
  let recommendedAction = 'NONE';
  let requiresApproval = false;

  if (!primaryAlive) {
    failoverState = FAILOVER_STATE.FAILOVER_PENDING_APPROVAL;
    recommendedAction = 'TRIGGER_STANDBY_FAILOVER';
    requiresApproval = true;
  } else if (replicationLagMs > 5000) {
    failoverState = FAILOVER_STATE.STANDBY_SYNCED;
    recommendedAction = 'SWITCH_READ_ONLY_MODE';
    requiresApproval = true;
  }

  const assessment = {
    region_id: region.region_id,
    name: region.name,
    primary_dc: region.primary_dc,
    standby_dc: region.standby_dc,
    primary_alive: primaryAlive,
    standby_synced: standbySynced,
    replication_lag_ms: replicationLagMs,
    failover_state: failoverState,
    recommended_action: recommendedAction,
    requires_human_approval: requiresApproval,
    automated_execution: false,
    assessed_at: new Date().toISOString()
  };

  assertNoZeroRanking(assessment);
  return deepFreeze(assessment);
}

/**
 * تغییر وضعیت منطقه با الزام تایید انسانی
 */
function updateRegionStatusWithApproval(regionId, targetStatus, approvalContext = {}) {
  assertHumanApproval(approvalContext);

  const region = getRegionById(regionId);
  if (!region) {
    const err = new Error(`منطقه "${regionId}" جهت به‌روزرسانی یافت نشد`);
    err.code = FEDERATION_ERRORS.REGION_NOT_FOUND;
    throw err;
  }

  if (!Object.values(REGION_STATUS).includes(targetStatus)) {
    const err = new Error(`وضعیت ارسالی "${targetStatus}" نامعتبر است`);
    err.code = FEDERATION_ERRORS.INVALID_REGION_STATUS;
    throw err;
  }

  const result = {
    ok: true,
    region_id: region.region_id,
    previous_status: region.status,
    new_status: targetStatus,
    approved_by_operator: approvalContext.approved_by_operator,
    operator_role: approvalContext.operator_role || 'HUMAN_SUPERVISOR',
    reason: approvalContext.reason || 'تغییر وضعیت دستی توسط اپراتور ناظر',
    updated_at: new Date().toISOString()
  };

  assertNoZeroRanking(result);
  return deepFreeze(result);
}

module.exports = {
  REGION_STATUS,
  FAILOVER_STATE,
  FEDERATION_ERRORS,
  CANONICAL_REGIONS,
  deepFreeze,
  assertNoZeroRanking,
  assertHumanApproval,
  getRegionRegistry,
  getRegionById,
  calculateFederationHealth,
  assessRegionFailover,
  updateRegionStatusWithApproval
};
