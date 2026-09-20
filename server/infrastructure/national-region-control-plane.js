/**
 * سامانه مدیریت هوشمند آموزش پایش — فاز ۵: کنترل‌پلین کلاسترهای منطقه‌ای ملی (P2-NI-01)
 * Phase 5: National Region Control Plane & Cluster Membership Layer
 *
 * الزامات کلیدی:
 * ۱. مدیریت تمامی کلاسترهای چندمنطقه‌ای و دیتاسنترهای اصلی و ثانویه
 * ۲. ماشین وضعیت رسمی کلاسترها:
 *    PROVISIONING -> READY -> ACTIVE -> DEGRADED -> MAINTENANCE -> RECOVERY
 * ۳. تعریف دقیق مشخصات هر Region:
 *    - region_id, cluster_id, province_scope, capacity_profile, primary_dc, secondary_dc, health_status
 * ۴. اعمال صلب نظارت انسانی در هرگونه تغییر وضعیت یا عضویت کلاستر
 * ۵. تضمین مطلق و بدون مسامحه منع رتبه‌بندی رقابتی مدارس (Zero-Ranking Guarantee)
 * ۶. خطای رسمی: PHASE5_NATIONAL_REGION_ACCESS_DENIED
 */

'use strict';

const {
  assertNoZeroRanking,
  assertHumanApproval,
  deepFreeze
} = require('./phase5-region-federation');
const authority = require('./authority');

/**
 * کدهای خطای رسمی کنترل‌پلین ملی
 */
const NATIONAL_CONTROL_ERRORS = Object.freeze({
  REGION_ACCESS_DENIED: 'PHASE5_NATIONAL_REGION_ACCESS_DENIED',
  INVALID_STATE_TRANSITION: 'PHASE5_INVALID_STATE_TRANSITION',
  REGION_NOT_FOUND: 'PHASE5_NATIONAL_REGION_NOT_FOUND',
  CHANGE_APPROVAL_REQUIRED: 'PHASE5_NATIONAL_CHANGE_APPROVAL_REQUIRED',
  ZERO_RANKING_VIOLATION: 'ZERO_RANKING_VIOLATION'
});

/**
 * ماشین وضعیت کلاسترهای منطقه‌ای ملی (National Region State Machine)
 */
const NATIONAL_REGION_STATE = Object.freeze({
  PROVISIONING: 'PROVISIONING',   // آماده‌سازی اولیه سخت‌افزار، شبکه و دیتابیس
  READY: 'READY',                 // آماده‌به‌کار جهت پذیرش ترافیک
  ACTIVE: 'ACTIVE',               // فعال و در حال سرویس‌دهی پایدار
  DEGRADED: 'DEGRADED',           // کاهش کارایی، افزایش تاخیر یا قطعی جزیی
  MAINTENANCE: 'MAINTENANCE',     // عملیات تعمیرات برنامه‌ریزی‌شده و هدایت موقت ترافیک
  RECOVERY: 'RECOVERY'            // عملیات بازسازی و همگام‌سازی پس از بحران
});

/**
 * رجیستری کاتالوگ رسمی کلاسترهای ملی
 */
const CANONICAL_NATIONAL_REGIONS = Object.freeze([
  {
    region_id: 'ir-tehran-1',
    cluster_id: 'cluster-tehran-prod-01',
    name: 'کلاستر پایتخت و حوزه مرکزی',
    province_scope: ['تهران', 'البرز', 'قم', 'مرکزی', 'سمنان'],
    primary_dc: 'tehran-dc-01',
    secondary_dc: 'tehran-dc-02',
    initial_state: NATIONAL_REGION_STATE.ACTIVE,
    capacity_profile: {
      max_schools: 35000,
      max_concurrent_users: 1500000,
      max_rps: 3500,
      database_connections_limit: 800,
      event_throughput_limit: 5000
    }
  },
  {
    region_id: 'ir-isfahan-1',
    cluster_id: 'cluster-isfahan-prod-01',
    name: 'کلاستر فلات مرکزی ایران',
    province_scope: ['اصفهان', 'یزد', 'چهارمحال و بختیاری', 'لرستان'],
    primary_dc: 'isfahan-dc-01',
    secondary_dc: 'isfahan-dc-02',
    initial_state: NATIONAL_REGION_STATE.ACTIVE,
    capacity_profile: {
      max_schools: 20000,
      max_concurrent_users: 800000,
      max_rps: 2000,
      database_connections_limit: 500,
      event_throughput_limit: 3000
    }
  },
  {
    region_id: 'ir-khorasan-1',
    cluster_id: 'cluster-khorasan-prod-01',
    name: 'کلاستر شمال شرق و شرق کشور',
    province_scope: ['خراسان رضوی', 'خراسان شمالی', 'خراسان جنوبی', 'کرمان', 'سیستان و بلوچستان'],
    primary_dc: 'mashhad-dc-01',
    secondary_dc: 'mashhad-dc-02',
    initial_state: NATIONAL_REGION_STATE.ACTIVE,
    capacity_profile: {
      max_schools: 24000,
      max_concurrent_users: 900000,
      max_rps: 2200,
      database_connections_limit: 550,
      event_throughput_limit: 3500
    }
  },
  {
    region_id: 'ir-fars-1',
    cluster_id: 'cluster-fars-prod-01',
    name: 'کلاستر جنوب و حاشیه خلیج فارس',
    province_scope: ['فارس', 'بوشهر', 'هرمزگان', 'کهگیلویه و بویراحمد'],
    primary_dc: 'shiraz-dc-01',
    secondary_dc: 'shiraz-dc-02',
    initial_state: NATIONAL_REGION_STATE.ACTIVE,
    capacity_profile: {
      max_schools: 18000,
      max_concurrent_users: 750000,
      max_rps: 1800,
      database_connections_limit: 450,
      event_throughput_limit: 2800
    }
  },
  {
    region_id: 'ir-tabriz-1',
    cluster_id: 'cluster-tabriz-prod-01',
    name: 'کلاستر شمال غرب و حوزه خزر',
    province_scope: ['آذربایجان شرقی', 'آذربایجان غربی', 'اردبیل', 'زنجان', 'گیلان', 'مازندران', 'گلستان', 'قزوین'],
    primary_dc: 'tabriz-dc-01',
    secondary_dc: 'tabriz-dc-02',
    initial_state: NATIONAL_REGION_STATE.ACTIVE,
    capacity_profile: {
      max_schools: 22000,
      max_concurrent_users: 750000,
      max_rps: 1800,
      database_connections_limit: 450,
      event_throughput_limit: 2800
    }
  },
  {
    region_id: 'ir-border-west-1',
    cluster_id: 'cluster-border-west-prod-01',
    name: 'کلاستر غرب و نوار مرزی مقاوم',
    province_scope: ['خوزستان', 'کرمانشاه', 'ایلام', 'کردستان', 'همدان'],
    primary_dc: 'ahvaz-dc-01',
    secondary_dc: 'kermanshah-dc-01',
    initial_state: NATIONAL_REGION_STATE.ACTIVE,
    capacity_profile: {
      max_schools: 16000,
      max_concurrent_users: 500000,
      max_rps: 1200,
      database_connections_limit: 400,
      event_throughput_limit: 2000
    }
  },
  {
    region_id: 'ir-rural-central-1',
    cluster_id: 'cluster-rural-national-prod-01',
    name: 'کلاستر سراسری مدارس روستایی و عشایری',
    province_scope: ['سراسری روستایی و عشایری'],
    primary_dc: 'tehran-dc-03',
    secondary_dc: 'isfahan-dc-03',
    initial_state: NATIONAL_REGION_STATE.ACTIVE,
    capacity_profile: {
      max_schools: 15000,
      max_concurrent_users: 300000,
      max_rps: 800,
      database_connections_limit: 300,
      event_throughput_limit: 1500
    }
  }
]);

/**
 * Non-authoritative local cache for region state.
 * CONTRACT: PostgreSQL 'authority_state' table is the sole authoritative SSoT.
 * This Map is strictly a read-through cache. In production and by default,
 * all reads and writes fail closed (AUTHORITY_UNAVAILABLE) if PostgreSQL is unattached.
 */
const _nationalRegionCache = new Map();
const _nationalRegionStore = _nationalRegionCache;

function isExplicitDevMemoryMode() {
  if (process.env.NODE_ENV === 'production' || process.env.PAYESH_ENV === 'production' || process.env.DATABASE_URL) {
    return false;
  }
  return process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY === '1';
}

function initNationalRegionStore() {
  if (_nationalRegionCache.size > 0) return;
  for (const reg of CANONICAL_NATIONAL_REGIONS) {
    _nationalRegionCache.set(reg.region_id, {
      region_id: reg.region_id,
      cluster_id: reg.cluster_id,
      name: reg.name,
      province_scope: [...reg.province_scope],
      primary_dc: reg.primary_dc,
      secondary_dc: reg.secondary_dc,
      health_status: reg.initial_state,
      capacity_profile: { ...reg.capacity_profile },
      current_metrics: {
        active_rps: 0,
        active_sessions: 0,
        database_connections_active: null,
        event_throughput_current: 0,
        replication_lag_ms: null
      },
      last_state_change: new Date().toISOString()
    });
  }
}

initNationalRegionStore();

function assertAuthorityAttachedIfRequired() {
  if (isExplicitDevMemoryMode()) return;
  if (!authority.attached()) {
    const err = new Error('AUTHORITY_UNAVAILABLE: National region control plane requires live PostgreSQL authority');
    err.code = 'AUTHORITY_UNAVAILABLE';
    err.status = 503;
    throw err;
  }
}

async function persistRegion(row) {
  if (!row || !row.region_id) return;
  if (!authority.attached()) {
    if (!isExplicitDevMemoryMode()) {
      const err = new Error('AUTHORITY_UNAVAILABLE: PostgreSQL authority is not attached');
      err.code = 'AUTHORITY_UNAVAILABLE';
      err.status = 503;
      throw err;
    }
    return;
  }
  const version = await authority.putState('region', row.region_id, row, row.last_operator && row.last_operator.id);
  return version;
}

async function refreshRegionsFromSoT() {
  if (!authority.attached()) {
    if (!isExplicitDevMemoryMode()) {
      const err = new Error('AUTHORITY_UNAVAILABLE: PostgreSQL authority is not attached');
      err.code = 'AUTHORITY_UNAVAILABLE';
      err.status = 503;
      throw err;
    }
    return false;
  }
  const rows = await authority.listState('region');
  if (rows && rows.length > 0) {
    for (const r of rows) {
      if (r && r.id && r.payload) {
        _nationalRegionCache.set(r.id, Object.assign({}, r.payload, { version: r.version, source: 'PG_AUTHORITY' }));
      }
    }
  } else {
    // Seed PostgreSQL authority with canonical initial state
    for (const reg of CANONICAL_NATIONAL_REGIONS) {
      const initialPayload = {
        region_id: reg.region_id,
        cluster_id: reg.cluster_id,
        name: reg.name,
        province_scope: [...reg.province_scope],
        primary_dc: reg.primary_dc,
        secondary_dc: reg.secondary_dc,
        health_status: reg.initial_state,
        capacity_profile: { ...reg.capacity_profile },
        current_metrics: {
          active_rps: 0,
          active_sessions: 0,
          database_connections_active: null,
          event_throughput_current: 0,
          replication_lag_ms: null
        },
        last_state_change: new Date().toISOString()
      };
      const v = await authority.putState('region', reg.region_id, initialPayload, 'system-init');
      _nationalRegionCache.set(reg.region_id, Object.assign({}, initialPayload, { version: v, source: 'PG_AUTHORITY' }));
    }
  }
  return true;
}

/**
 * دریافت فهرست تمامی کلاسترهای منطقه ملی
 *
 * @returns {Array<Object>}
 */
function getNationalRegionRegistry() {
  assertAuthorityAttachedIfRequired();
  const result = Array.from(_nationalRegionStore.values());
  assertNoZeroRanking(result);
  return deepFreeze(result);
}

/**
 * واکشی اطلاعات یک منطقه خاص بر اساس شناسه
 *
 * @param {string} regionId
 * @returns {Object|null}
 */
function getNationalRegionById(regionId) {
  assertAuthorityAttachedIfRequired();
  if (!regionId) return null;
  const clean = String(regionId).trim().toLowerCase();
  const found = _nationalRegionStore.get(clean);
  if (!found) return null;
  assertNoZeroRanking(found);
  return deepFreeze(found);
}

/**
 * به‌روزرسانی وضعیت کلاستر منطقه‌ای با تاییدیه اپراتور انسانی
 *
 * @param {string} regionId
 * @param {string} newState
 * @param {Object} changeApproval
 * @returns {Object}
 */
function updateNationalRegionState(regionId, newState, changeApproval = {}) {
  assertAuthorityAttachedIfRequired();
  const region = _nationalRegionStore.get(regionId);
  if (!region) {
    const err = new Error(`کلاستر منطقه "${regionId}" یافت نشد`);
    err.code = NATIONAL_CONTROL_ERRORS.REGION_NOT_FOUND;
    throw err;
  }

  assertNoZeroRanking(changeApproval);

  // گیت صلب نظارت انسانی
  if (
    changeApproval.approved !== true ||
    changeApproval.automated_decision === true ||
    changeApproval.automated_execution === true ||
    changeApproval.requires_human_approval === false
  ) {
    const err = new Error(
      'PHASE5_NATIONAL_CHANGE_APPROVAL_REQUIRED: تغییر وضعیت کلاستر منطقه‌ای مستلزم تایید صریح اپراتور انسانی است'
    );
    err.code = NATIONAL_CONTROL_ERRORS.CHANGE_APPROVAL_REQUIRED;
    throw err;
  }

  const validStates = Object.values(NATIONAL_REGION_STATE);
  if (!validStates.includes(newState)) {
    const err = new Error(`وضعیت درخواستی "${newState}" در ماشین وضعیت معتبر نیست`);
    err.code = NATIONAL_CONTROL_ERRORS.INVALID_STATE_TRANSITION;
    throw err;
  }

  const operator = changeApproval.operator || {};
  if (!operator.id || !['superadmin', 'admin'].includes(operator.role)) {
    const err = new Error('تنها مدیران ارشد مجاز به تغییر وضعیت کلاسترهای کنترل‌پلین ملی هستند');
    err.code = NATIONAL_CONTROL_ERRORS.REGION_ACCESS_DENIED;
    throw err;
  }

  const updated = {
    ...region,
    health_status: newState,
    last_state_change: new Date().toISOString(),
    last_operator: {
      id: operator.id,
      role: operator.role,
      name: operator.name || 'اپراتور کنترل‌پلین'
    }
  };

  // Authoritative write path: PostgreSQL SSoT is written FIRST
  let persistPromise;
  if (authority.attached()) {
    persistPromise = persistRegion(updated).then((v) => {
      const finalObj = deepFreeze({
        ...updated,
        version: v,
        source: 'PG_AUTHORITY'
      });
      _nationalRegionCache.set(regionId, finalObj);
      return finalObj;
    });
  } else if (!isExplicitDevMemoryMode()) {
    const err = new Error('AUTHORITY_UNAVAILABLE: PostgreSQL authority is not attached');
    err.code = 'AUTHORITY_UNAVAILABLE';
    err.status = 503;
    throw err;
  } else {
    const finalObj = deepFreeze(updated);
    _nationalRegionCache.set(regionId, finalObj);
    persistPromise = Promise.resolve(finalObj);
  }

  const p = persistPromise.then((res) => res);
  Object.assign(p, deepFreeze({ ...updated }));
  return p;
}


/**
 * خلاصه سلامت کنترل‌پلین کلاسترهای ملی
 *
 * @returns {Object}
 */
function calculateNationalRegionHealthSummary() {
  assertAuthorityAttachedIfRequired();
  const regions = Array.from(_nationalRegionStore.values());
  const counts = {
    provisioning: 0,
    ready: 0,
    active: 0,
    degraded: 0,
    maintenance: 0,
    recovery: 0
  };

  for (const r of regions) {
    const s = String(r.health_status).toLowerCase();
    if (counts[s] !== undefined) counts[s]++;
  }

  const overall = counts.degraded > 0 ? 'DEGRADED' : (counts.active === regions.length ? 'HEALTHY' : 'OPERATIONAL');

  const summary = {
    control_plane_id: 'CONTROL-PLANE-PHASE5-NATIONAL',
    overall_status: overall,
    total_regions: regions.length,
    counts,
    human_governance: {
      automated_decision: false,
      automated_execution: false,
      requires_human_approval: true
    },
    zero_ranking_guarantee: {
      enforced: true,
      no_school_league_table: true
    },
    regions,
    generated_at: new Date().toISOString()
  };

  assertNoZeroRanking(summary);
  return deepFreeze(summary);
}

module.exports = {
  NATIONAL_CONTROL_ERRORS,
  NATIONAL_REGION_STATE,
  CANONICAL_NATIONAL_REGIONS,
  getNationalRegionRegistry,
  getNationalRegionById,
  updateNationalRegionState,
  calculateNationalRegionHealthSummary,
  refreshRegionsFromSoT
};
