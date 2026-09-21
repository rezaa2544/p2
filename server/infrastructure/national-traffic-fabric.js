/**
 * سامانه مدیریت هوشمند آموزش پایش — فاز ۵: فابریک ترافیک ملی (P2-NI-01)
 * Phase 5: National Traffic Fabric & Multi-Region Interconnection Layer
 *
 * الزامات کلیدی:
 * ۱. آماده‌سازی هدایت و مسیریابی سراسری ترافیک ملی (National Routing Fabric)
 * ۲. اتصال هماهنگ کلاسترها و توازن بار بین‌منطقه‌ای
 * ۳. سیاست قناری و مدیریت وزن ترافیک (Traffic Weight: 0%, 5%, 10%, 25%, 50%, 100%)
 * ۴. منع مطلق اجرای خودکار تغییرات ترافیک بدون تاییدیه اپراتور انسانی
 * ۵. تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی مدارس (ZERO_RANKING_VIOLATION)
 */

'use strict';

const {
  assertNoZeroRanking,
  assertHumanApproval,
  deepFreeze
} = require('./phase5-region-federation');

const {
  CANONICAL_NATIONAL_REGIONS,
  getNationalRegionRegistry,
  getNationalRegionById
} = require('./national-region-control-plane');

const {
  checkRegionCapacityHeadroom,
  assertNationalCapacityEnforcement
} = require('./national-capacity-enforcement');

const { CROSS_REGION_RECOVERY_MAP } = require('./disaster-recovery');
const opsKv = require('./ops-kv');

const TRAFFIC_FABRIC_ERRORS = Object.freeze({
  APPROVAL_REQUIRED: 'PHASE5_NATIONAL_TRAFFIC_APPROVAL_REQUIRED',
  INVALID_WEIGHT: 'PHASE5_INVALID_TRAFFIC_WEIGHT',
  REGION_NOT_FOUND: 'PHASE5_NATIONAL_REGION_NOT_FOUND',
  ROUTING_BREACH: 'PHASE5_ROUTING_POLICY_BREACH',
  HARDENED_GATE_BREACH: 'PHASE5_TRAFFIC_HARDENED_GATE_BREACH',
  ZERO_RANKING_VIOLATION: 'ZERO_RANKING_VIOLATION'
});

const ALLOWED_TRAFFIC_WEIGHTS = Object.freeze([0, 5, 10, 25, 50, 100]);

/**
 * Non-authoritative local cache for traffic weights.
 * CONTRACT: PostgreSQL table 'phase6_ops_kv' is the sole authoritative SSoT.
 * This Map is strictly a read-through cache. In production and by default,
 * all reads and writes fail closed (OPS_KV_UNAVAILABLE) if PostgreSQL ops-kv is unattached.
 */
const _nationalTrafficWeights = new Map();

function isExplicitDevMemoryMode() {
  if (process.env.NODE_ENV === 'production' || process.env.PAYESH_ENV === 'production' || process.env.DATABASE_URL) {
    return false;
  }
  return process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY === '1';
}

function initTrafficWeights() {
  if (_nationalTrafficWeights.size > 0) return;
  for (const reg of CANONICAL_NATIONAL_REGIONS) {
    _nationalTrafficWeights.set(reg.region_id, {
      region_id: reg.region_id,
      name: reg.name,
      allocated_weight: 100, // پیش‌فرض ۱۰۰٪ برای مناطق فعال در تولید
      routing_state: 'ROUTING_ACTIVE',
      interconnect_latency_ms: null, // مقدار رصدشده زنده (بدون جعل و مقدار هاردکد)
      canary_stage: 'STAGE_FULL_PRODUCTION',
      last_weight_change: new Date().toISOString()
    });
  }
}

initTrafficWeights();

const OPS_KEY = 'national_traffic_weights';

function assertOpsKvAttachedIfRequired() {
  if (isExplicitDevMemoryMode()) return;
  if (!opsKv.attached()) {
    const err = new Error('OPS_KV_UNAVAILABLE: National traffic fabric requires attached PostgreSQL ops-kv');
    err.code = 'OPS_KV_UNAVAILABLE';
    err.status = 503;
    throw err;
  }
}

function dumpWeights() {
  const dump = {};
  for (const [id, row] of _nationalTrafficWeights.entries()) dump[id] = row;
  return dump;
}

async function refreshTrafficFromSoT() {
  if (!opsKv.attached()) {
    if (!isExplicitDevMemoryMode()) {
      const err = new Error('OPS_KV_UNAVAILABLE: PostgreSQL SoT is not attached');
      err.code = 'OPS_KV_UNAVAILABLE';
      err.status = 503;
      throw err;
    }
    return false;
  }
  const saved = await opsKv.get(OPS_KEY);
  if (!saved || typeof saved !== 'object') return false;
  for (const [id, row] of Object.entries(saved)) {
    if (row && typeof row === 'object') _nationalTrafficWeights.set(id, row);
  }
  return true;
}

async function persistTrafficToSoT(candidateDump) {
  if (!opsKv.attached()) {
    if (!isExplicitDevMemoryMode()) {
      const err = new Error('OPS_KV_UNAVAILABLE: PostgreSQL SoT is not attached');
      err.code = 'OPS_KV_UNAVAILABLE';
      err.status = 503;
      throw err;
    }
    return;
  }
  await opsKv.set(OPS_KEY, candidateDump || dumpWeights());
}

/**
 * دریافت توپولوژی و نقشه توزیع ترافیک ملی
 *
 * @returns {Object}
 */
function getNationalTrafficFabricTopology() {
  assertOpsKvAttachedIfRequired();
  const regions = getNationalRegionRegistry();
  const topology = {};

  let totalActiveRoutes = 0;
  for (const reg of regions) {
    const route = _nationalTrafficWeights.get(reg.region_id) || {
      region_id: reg.region_id,
      allocated_weight: 0,
      routing_state: 'INACTIVE',
      canary_stage: 'STAGE_ZERO'
    };

    topology[reg.region_id] = {
      ...route,
      primary_dc: reg.primary_dc,
      secondary_dc: reg.secondary_dc,
      status: reg.health_status,
      provinces: [...reg.province_scope]
    };

    if (route.allocated_weight > 0) {
      totalActiveRoutes++;
    }
  }

  const fabricState = {
    fabric_id: 'TRAFFIC-FABRIC-PHASE5-NATIONAL',
    fabric_status: 'ROUTING_READY',
    total_regions: regions.length,
    active_routed_regions: totalActiveRoutes,
    allowed_weights: [...ALLOWED_TRAFFIC_WEIGHTS],
    topology,
    governance: {
      automated_decision: false,
      automated_execution: false,
      requires_human_approval: true
    },
    zero_ranking_guarantee: true,
    generated_at: new Date().toISOString()
  };

  assertNoZeroRanking(fabricState);
  return deepFreeze(fabricState);
}

/**
 * تنظیم وزن ترافیک یک کلاستر منطقه‌ای با تایید انسانی
 *
 * @param {string} regionId
 * @param {number} targetWeight
 * @param {Object} approvalContext
 * @returns {Object}
 */
function updateNationalTrafficWeight(regionId, targetWeight, approvalContext = {}) {
  assertOpsKvAttachedIfRequired();
  const current = _nationalTrafficWeights.get(regionId);
  if (!current) {
    const err = new Error(`کلاستر "${regionId}" در فابریک ترافیک ملی یافت نشد`);
    err.code = TRAFFIC_FABRIC_ERRORS.REGION_NOT_FOUND;
    throw err;
  }

  assertNoZeroRanking(approvalContext);

  // گیت صلب نظارت انسانی
  if (
    approvalContext.approved !== true ||
    approvalContext.automated_decision === true ||
    approvalContext.automated_execution === true ||
    approvalContext.requires_human_approval === false
  ) {
    const err = new Error(
      'PHASE5_NATIONAL_TRAFFIC_APPROVAL_REQUIRED: تغییر وزن ترافیک ملی نیازمند تایید صریح اپراتور انسانی است'
    );
    err.code = TRAFFIC_FABRIC_ERRORS.APPROVAL_REQUIRED;
    throw err;
  }

  const weight = Number(targetWeight);
  if (!ALLOWED_TRAFFIC_WEIGHTS.includes(weight)) {
    const err = new Error(
      `PHASE5_INVALID_TRAFFIC_WEIGHT: وزن ترافیک "${targetWeight}" مجاز نیست. مقادیر مجاز: [${ALLOWED_TRAFFIC_WEIGHTS.join(', ')}]`
    );
    err.code = TRAFFIC_FABRIC_ERRORS.INVALID_WEIGHT;
    throw err;
  }

  const operator = approvalContext.operator || {};
  if (!operator.id || !['superadmin', 'admin'].includes(operator.role)) {
    const err = new Error('تنها مدیران ارشد مجاز به تنظیم اوزان ترافیک ملی هستند');
    err.code = TRAFFIC_FABRIC_ERRORS.APPROVAL_REQUIRED;
    throw err;
  }

  // Hardened Gate Pre-conditions (P2-NI-03)
  // 1. Cluster Health & Maintenance State
  const regionRecord = getNationalRegionById(regionId);
  if (weight > 0 && regionRecord) {
    const currentHealth = regionRecord.health_status || regionRecord.initial_state;
    if (currentHealth === 'MAINTENANCE' || currentHealth === 'DEGRADED') {
      const err = new Error(
        `PHASE5_TRAFFIC_HARDENED_GATE_BREACH: Cannot route traffic to region "${regionId}" in state ${currentHealth}`
      );
      err.code = TRAFFIC_FABRIC_ERRORS.HARDENED_GATE_BREACH;
      throw err;
    }
  }

  // 2. Capacity Headroom & DB capacity validation
  if (weight > 0 && regionRecord && regionRecord.capacity_profile) {
    const projectedRps = Math.round((regionRecord.capacity_profile.max_rps * weight) / 100);
    const projectedDb = Math.round((regionRecord.capacity_profile.database_connections_limit * weight) / 100);
    assertNationalCapacityEnforcement({
      rps: projectedRps,
      db_connections: projectedDb,
      region_id: regionId
    });
  }

  // 3. DR Pair Binding Check
  if (!CROSS_REGION_RECOVERY_MAP[regionId]) {
    const err = new Error(
      `PHASE5_TRAFFIC_HARDENED_GATE_BREACH: Region "${regionId}" is missing validated cross-region DR pairing`
    );
    err.code = TRAFFIC_FABRIC_ERRORS.HARDENED_GATE_BREACH;
    throw err;
  }

  let stage = 'STAGE_ZERO';
  if (weight === 100) stage = 'STAGE_FULL_PRODUCTION';
  else if (weight >= 50) stage = 'STAGE_CANARY_HALF';
  else if (weight >= 25) stage = 'STAGE_CANARY_QUARTER';
  else if (weight > 0) stage = 'STAGE_CANARY_MINIMAL';

  const updated = {
    ...current,
    allocated_weight: weight,
    canary_stage: stage,
    routing_state: weight > 0 ? 'ROUTING_ACTIVE' : 'ROUTING_DRAINED',
    last_weight_change: new Date().toISOString(),
    operator: {
      id: operator.id,
      role: operator.role
    }
  };

  const candidateDump = dumpWeights();
  candidateDump[regionId] = updated;

  let persistPromise;
  if (opsKv.attached()) {
    persistPromise = persistTrafficToSoT(candidateDump).then(() => {
      _nationalTrafficWeights.set(regionId, updated);
      return deepFreeze(updated);
    });
  } else if (!isExplicitDevMemoryMode()) {
    const err = new Error('OPS_KV_UNAVAILABLE: PostgreSQL SoT is not attached');
    err.code = 'OPS_KV_UNAVAILABLE';
    err.status = 503;
    throw err;
  } else {
    _nationalTrafficWeights.set(regionId, updated);
    persistPromise = Promise.resolve(deepFreeze(updated));
  }

  const p = persistPromise.then(() => deepFreeze(updated));
  Object.assign(p, deepFreeze(updated));
  return p;
}

module.exports = {
  TRAFFIC_FABRIC_ERRORS,
  ALLOWED_TRAFFIC_WEIGHTS,
  getNationalTrafficFabricTopology,
  updateNationalTrafficWeight,
  refreshTrafficFromSoT
};
