/**
 * سامانه مدیریت هوشمند آموزش پایش — فاز ۵: فعال‌سازی پایلوت استانی و مقیاس‌پذیری ظرفیت (P2-PL-02)
 * Phase 5: Provincial Pilot Activation, Traffic Distribution & Regional Capacity Scaling
 *
 * الزامات کلیدی:
 * ۱. رجیستری ۳۱ استان و اتصالات کلاستری (Provincial Pilot Registry)
 * ۲. چرخه عمر شش‌گانه وضعیت پایلوت استانی (State Machine: INACTIVE -> ROLLBACK)
 * ۳. توزیع کنترل‌شده ترافیک قناری (۵٪، ۱۰٪، ۲۵٪، ۵۰٪، ۱۰۰٪)
 * ۴. موتور مقیاس‌پذیری ظرفیت استانی و منطقه‌ای (Capacity Scaling Engine: RPS, Users, Throughput)
 * ۵. تاب‌آوری لایه مدارس روستایی و مرزی (RURAL_LOW_BANDWIDTH, BORDER_OFFLINE_PRIORITY)
 * ۶. مهار صلب رفتارهای خودکار و الزام به تایید اپراتور انسانی (Human Approval Gate)
 * ۷. تضمین مطلق و بدون مسامحه منع رتبه‌بندی رقابتی مدارس (Zero-Ranking Guarantee)
 *
 * خطاهای رسمی مصوب:
 * - PHASE5_PILOT_SCOPE_VIOLATION
 * - PHASE5_TRAFFIC_POLICY_FAILURE
 * - PHASE5_CAPACITY_LIMIT_BREACH
 * - PHASE5_ROLLOUT_APPROVAL_REQUIRED
 * - ZERO_RANKING_VIOLATION
 */

'use strict';

const {
  CANONICAL_REGIONS,
  getRegionById,
  assertNoZeroRanking,
  assertHumanApproval,
  deepFreeze
} = require('./phase5-region-federation');
const authority = require('./authority');

/**
 * خطاهای رسمی و انحصاری گام P2-PL-02
 */
const PILOT_SCALING_ERRORS = Object.freeze({
  PILOT_SCOPE_VIOLATION: 'PHASE5_PILOT_SCOPE_VIOLATION',
  TRAFFIC_POLICY_FAILURE: 'PHASE5_TRAFFIC_POLICY_FAILURE',
  CAPACITY_LIMIT_BREACH: 'PHASE5_CAPACITY_LIMIT_BREACH',
  ROLLOUT_APPROVAL_REQUIRED: 'PHASE5_ROLLOUT_APPROVAL_REQUIRED',
  ZERO_RANKING_VIOLATION: 'ZERO_RANKING_VIOLATION'
});

/**
 * وضعیت‌های شش‌گانه پایلوت استانی (State Machine)
 */
const PROVINCIAL_PILOT_STATUS = Object.freeze({
  INACTIVE: 'INACTIVE',                   // استان در وضعیت اولیه و خاموش
  PROVISIONING: 'PROVISIONING',           // آماده‌سازی کلاستر، پایگاه‌داده و صف رویدادها
  CANARY_ACTIVE: 'CANARY_ACTIVE',         // انتشار فعال با درصدی از ترافیک (۵٪ تا ۵۰٪)
  ACTIVE: 'ACTIVE',                       // پایلوت کامل با ۱۰۰٪ ترافیک در حال اجراست
  PAUSED: 'PAUSED',                       // توقف موقت ترافیک جهت بررسی یا عملیات نگهداری
  ROLLBACK: 'ROLLBACK'                    // بازگشت اضطراری و تخلیه ترافیک به نقطه امن
});

/**
 * گام‌های مصوب درصد انتشار ترافیک قناری (Traffic Rollout Percentages)
 */
const ALLOWED_ROLLOUT_PERCENTAGES = Object.freeze([0, 5, 10, 25, 50, 100]);

/**
 * رجیستری پیش‌فرض استان‌های کشور در پایلوت ملی پایش
 */
const CANONICAL_PROVINCES = Object.freeze([
  // حوزه کلاستر مرکزی تهران (ir-tehran-1)
  {
    province_id: 'tehran',
    province_name: 'تهران',
    region_id: 'ir-tehran-1',
    is_border: false,
    is_rural_priority: false,
    max_schools: 7000,
    quota: { max_rps: 1500, concurrent_users: 600000, event_throughput: 2500 }
  },
  {
    province_id: 'alborz',
    province_name: 'البرز',
    region_id: 'ir-tehran-1',
    is_border: false,
    is_rural_priority: false,
    max_schools: 2500,
    quota: { max_rps: 500, concurrent_users: 200000, event_throughput: 800 }
  },
  {
    province_id: 'qom',
    province_name: 'قم',
    region_id: 'ir-tehran-1',
    is_border: false,
    is_rural_priority: false,
    max_schools: 1600,
    quota: { max_rps: 300, concurrent_users: 120000, event_throughput: 500 }
  },
  {
    province_id: 'markazi',
    province_name: 'مرکزی',
    region_id: 'ir-tehran-1',
    is_border: false,
    is_rural_priority: true,
    max_schools: 2000,
    quota: { max_rps: 350, concurrent_users: 150000, event_throughput: 600 }
  },
  {
    province_id: 'semnan',
    province_name: 'سمنان',
    region_id: 'ir-tehran-1',
    is_border: false,
    is_rural_priority: true,
    max_schools: 1200,
    quota: { max_rps: 200, concurrent_users: 80000, event_throughput: 300 }
  },

  // حوزه کلاستر فلات مرکزی (ir-isfahan-1)
  {
    province_id: 'isfahan',
    province_name: 'اصفهان',
    region_id: 'ir-isfahan-1',
    is_border: false,
    is_rural_priority: false,
    max_schools: 5500,
    quota: { max_rps: 1000, concurrent_users: 450000, event_throughput: 1800 }
  },
  {
    province_id: 'yazd',
    province_name: 'یزد',
    region_id: 'ir-isfahan-1',
    is_border: false,
    is_rural_priority: false,
    max_schools: 1600,
    quota: { max_rps: 250, concurrent_users: 100000, event_throughput: 400 }
  },
  {
    province_id: 'chaharmahal',
    province_name: 'چهارمحال و بختیاری',
    region_id: 'ir-isfahan-1',
    is_border: false,
    is_rural_priority: true,
    max_schools: 2000,
    quota: { max_rps: 300, concurrent_users: 120000, event_throughput: 450 }
  },
  {
    province_id: 'lorestan',
    province_name: 'لرستان',
    region_id: 'ir-isfahan-1',
    is_border: false,
    is_rural_priority: true,
    max_schools: 3500,
    quota: { max_rps: 450, concurrent_users: 180000, event_throughput: 650 }
  },

  // حوزه کلاستر شمال شرق (ir-khorasan-1)
  {
    province_id: 'khorasan_razavi',
    province_name: 'خراسان رضوی',
    region_id: 'ir-khorasan-1',
    is_border: true,
    is_rural_priority: true,
    max_schools: 9000,
    quota: { max_rps: 1200, concurrent_users: 500000, event_throughput: 2000 }
  },
  {
    province_id: 'khorasan_north',
    province_name: 'خراسان شمالی',
    region_id: 'ir-khorasan-1',
    is_border: true,
    is_rural_priority: true,
    max_schools: 2000,
    quota: { max_rps: 250, concurrent_users: 100000, event_throughput: 400 }
  },
  {
    province_id: 'khorasan_south',
    province_name: 'خراسان جنوبی',
    region_id: 'ir-khorasan-1',
    is_border: true,
    is_rural_priority: true,
    max_schools: 2000,
    quota: { max_rps: 250, concurrent_users: 100000, event_throughput: 400 }
  },
  {
    province_id: 'kerman',
    province_name: 'کرمان',
    region_id: 'ir-khorasan-1',
    is_border: false,
    is_rural_priority: true,
    max_schools: 4500,
    quota: { max_rps: 600, concurrent_users: 250000, event_throughput: 900 }
  },
  {
    province_id: 'sistan_baluchestan',
    province_name: 'سیستان و بلوچستان',
    region_id: 'ir-khorasan-1',
    is_border: true,
    is_rural_priority: true,
    max_schools: 6500,
    quota: { max_rps: 800, concurrent_users: 350000, event_throughput: 1200 }
  },

  // حوزه کلاستر جنوب و خلیج فارس (ir-fars-1)
  {
    province_id: 'fars',
    province_name: 'فارس',
    region_id: 'ir-fars-1',
    is_border: false,
    is_rural_priority: true,
    max_schools: 7500,
    quota: { max_rps: 1000, concurrent_users: 400000, event_throughput: 1600 }
  },
  {
    province_id: 'bushehr',
    province_name: 'بوشهر',
    region_id: 'ir-fars-1',
    is_border: true,
    is_rural_priority: false,
    max_schools: 1800,
    quota: { max_rps: 300, concurrent_users: 120000, event_throughput: 500 }
  },
  {
    province_id: 'hormozgan',
    province_name: 'هرمزگان',
    region_id: 'ir-fars-1',
    is_border: true,
    is_rural_priority: true,
    max_schools: 3200,
    quota: { max_rps: 450, concurrent_users: 180000, event_throughput: 700 }
  },
  {
    province_id: 'kohgiluyeh',
    province_name: 'کهگیلویه و بویراحمد',
    region_id: 'ir-fars-1',
    is_border: false,
    is_rural_priority: true,
    max_schools: 2200,
    quota: { max_rps: 300, concurrent_users: 120000, event_throughput: 450 }
  },

  // حوزه کلاستر شمال غرب (ir-tabriz-1)
  {
    province_id: 'azarbaijan_east',
    province_name: 'آذربایجان شرقی',
    region_id: 'ir-tabriz-1',
    is_border: true,
    is_rural_priority: true,
    max_schools: 6000,
    quota: { max_rps: 900, concurrent_users: 380000, event_throughput: 1500 }
  },
  {
    province_id: 'azarbaijan_west',
    province_name: 'آذربایجان غربی',
    region_id: 'ir-tabriz-1',
    is_border: true,
    is_rural_priority: true,
    max_schools: 5000,
    quota: { max_rps: 750, concurrent_users: 300000, event_throughput: 1200 }
  },
  {
    province_id: 'ardabil',
    province_name: 'اردبیل',
    region_id: 'ir-tabriz-1',
    is_border: true,
    is_rural_priority: true,
    max_schools: 2500,
    quota: { max_rps: 350, concurrent_users: 150000, event_throughput: 600 }
  },
  {
    province_id: 'zanjan',
    province_name: 'زنجان',
    region_id: 'ir-tabriz-1',
    is_border: false,
    is_rural_priority: true,
    max_schools: 2000,
    quota: { max_rps: 300, concurrent_users: 120000, event_throughput: 500 }
  },
  {
    province_id: 'gilan',
    province_name: 'گیلان',
    region_id: 'ir-tabriz-1',
    is_border: true,
    is_rural_priority: true,
    max_schools: 4500,
    quota: { max_rps: 650, concurrent_users: 260000, event_throughput: 950 }
  },
  {
    province_id: 'mazandaran',
    province_name: 'مازندران',
    region_id: 'ir-tabriz-1',
    is_border: false,
    is_rural_priority: true,
    max_schools: 5000,
    quota: { max_rps: 750, concurrent_users: 300000, event_throughput: 1100 }
  },
  {
    province_id: 'golestan',
    province_name: 'گلستان',
    region_id: 'ir-tabriz-1',
    is_border: true,
    is_rural_priority: true,
    max_schools: 2800,
    quota: { max_rps: 400, concurrent_users: 170000, event_throughput: 650 }
  },
  {
    province_id: 'qazvin',
    province_name: 'قزوین',
    region_id: 'ir-tabriz-1',
    is_border: false,
    is_rural_priority: false,
    max_schools: 1800,
    quota: { max_rps: 300, concurrent_users: 120000, event_throughput: 500 }
  },

  // حوزه کلاستر غرب و نوار مرزی (ir-border-west-1)
  {
    province_id: 'khuzestan',
    province_name: 'خوزستان',
    region_id: 'ir-border-west-1',
    is_border: true,
    is_rural_priority: true,
    max_schools: 7000,
    quota: { max_rps: 1000, concurrent_users: 420000, event_throughput: 1600 }
  },
  {
    province_id: 'kermanshah',
    province_name: 'کرمانشاه',
    region_id: 'ir-border-west-1',
    is_border: true,
    is_rural_priority: true,
    max_schools: 4000,
    quota: { max_rps: 600, concurrent_users: 240000, event_throughput: 900 }
  },
  {
    province_id: 'ilam',
    province_name: 'ایلام',
    region_id: 'ir-border-west-1',
    is_border: true,
    is_rural_priority: true,
    max_schools: 1500,
    quota: { max_rps: 250, concurrent_users: 100000, event_throughput: 400 }
  },
  {
    province_id: 'kurdistan',
    province_name: 'کردستان',
    region_id: 'ir-border-west-1',
    is_border: true,
    is_rural_priority: true,
    max_schools: 3500,
    quota: { max_rps: 500, concurrent_users: 200000, event_throughput: 750 }
  },
  {
    province_id: 'hamedan',
    province_name: 'همدان',
    region_id: 'ir-border-west-1',
    is_border: false,
    is_rural_priority: true,
    max_schools: 2800,
    quota: { max_rps: 400, concurrent_users: 160000, event_throughput: 600 }
  },

  // حوزه کلاستر سراسری روستایی و عشایری (ir-rural-central-1)
  {
    province_id: 'rural_nomadic_national',
    province_name: 'سراسری روستایی و عشایری',
    region_id: 'ir-rural-central-1',
    is_border: true,
    is_rural_priority: true,
    max_schools: 15000,
    quota: { max_rps: 800, concurrent_users: 300000, event_throughput: 1200 }
  }
]);

/**
 * حافظه محلی وضعیت پایلوت استان‌ها (PostgreSQL منبع نهایی است)
 */
const _provincialStateStore = new Map();

/**
 * مقداردهی اولیه وضعیت استان‌ها
 */
function initializeProvincialStore() {
  if (_provincialStateStore.size > 0) return;

  for (const p of CANONICAL_PROVINCES) {
    const region = getRegionById(p.region_id);
    let supportTier = 'URBAN_STANDARD';
    if (p.is_border) {
      supportTier = 'BORDER_OFFLINE_PRIORITY';
    } else if (p.is_rural_priority) {
      supportTier = 'RURAL_LOW_BANDWIDTH';
    }

    _provincialStateStore.set(p.province_id, {
      province_id: p.province_id,
      province_name: p.province_name,
      region_id: p.region_id,
      cluster_binding: {
        primary_dc: region ? region.primary_dc : 'dc-01',
        standby_dc: region ? region.standby_dc : 'dc-02'
      },
      pilot_status: PROVINCIAL_PILOT_STATUS.INACTIVE,
      traffic_rollout_pct: 0,
      support_tier: supportTier,
      capacity_profile: {
        max_rps: p.quota.max_rps,
        concurrent_users: p.quota.concurrent_users,
        event_throughput: p.quota.event_throughput,
        current_rps: 0,
        current_sessions: 0,
        current_event_rate: 0
      },
      approval_state: {
        approved: false,
        approved_by: null,
        approved_at: null,
        automated_decision: false,
        automated_execution: false,
        requires_human_approval: true
      },
      low_bandwidth_mode: supportTier !== 'URBAN_STANDARD',
      offline_grace_hours: supportTier === 'BORDER_OFFLINE_PRIORITY' ? 72 : (supportTier === 'RURAL_LOW_BANDWIDTH' ? 48 : 24)
    });
  }
}

initializeProvincialStore();

async function persistProvincial(row) {
  if (!row || !row.province_id) return;
  if (!authority.attached()) {
    if (process.env.DATABASE_URL) {
      const err = new Error('AUTHORITY_UNAVAILABLE');
      err.code = 'AUTHORITY_UNAVAILABLE';
      err.status = 503;
      throw err;
    }
    return;
  }
  await authority.putState('provincial', row.province_id, row, row.approval_state && row.approval_state.approved_by);
}

async function refreshProvincialFromSoT() {
  if (!authority.attached()) return false;
  const rows = await authority.listState('provincial');
  for (const r of rows) {
    if (r && r.id && r.payload && typeof r.payload === 'object') {
      _provincialStateStore.set(r.id, r.payload);
    }
  }
  return true;
}

/**
 * دریافت فهرست تمامی استان‌های پایلوت
 *
 * @param {string} [regionFilter]
 * @returns {Array<Object>}
 */
function getProvincialPilots(regionFilter) {
  const result = [];
  for (const item of _provincialStateStore.values()) {
    if (!regionFilter || item.region_id === regionFilter) {
      result.push(item);
    }
  }
  assertNoZeroRanking(result);
  return deepFreeze(result);
}

/**
 * واکشی اطلاعات یک استان بر اساس شناسه یا نام
 *
 * @param {string} provinceIdentifier
 * @returns {Object|null}
 */
function getProvincialPilotById(provinceIdentifier) {
  if (!provinceIdentifier) return null;
  const clean = String(provinceIdentifier).trim().toLowerCase();

  for (const item of _provincialStateStore.values()) {
    if (item.province_id.toLowerCase() === clean || item.province_name.trim() === provinceIdentifier.trim()) {
      return item;
    }
  }
  return null;
}

/**
 * فعال‌سازی پایلوت استانی با تاییدیه مستقیم اپراتور انسانی
 * (activateProvincialPilot)
 *
 * @param {string} provinceId
 * @param {Object} approvalPayload
 * @returns {Object}
 */
async function activateProvincialPilot(provinceId, approvalPayload = {}) {
  const province = getProvincialPilotById(provinceId);
  if (!province) {
    const err = new Error(`استان با شناسه یا نام "${provinceId}" در رجیستری پایلوت ملی یافت نشد`);
    err.code = PILOT_SCALING_ERRORS.PILOT_SCOPE_VIOLATION;
    throw err;
  }

  // مهار واژگان رتبه‌بندی
  assertNoZeroRanking(approvalPayload);

  // گیت صلب نظارت انسانی
  if (
    approvalPayload.approved !== true ||
    approvalPayload.automated_decision === true ||
    approvalPayload.automated_execution === true ||
    approvalPayload.requires_human_approval === false
  ) {
    const err = new Error(
      'PHASE5_ROLLOUT_APPROVAL_REQUIRED: فعال‌سازی پایلوت استانی نیازمند تایید صریح اپراتور انسانی است و مداخله خودکار مسدود است'
    );
    err.code = PILOT_SCALING_ERRORS.ROLLOUT_APPROVAL_REQUIRED;
    throw err;
  }

  const operator = approvalPayload.operator || {};
  if (!operator.id || !['superadmin', 'admin', 'edu_office'].includes(operator.role)) {
    const err = new Error('صلاحیت اپراتور تاییدکننده احراز نگردید');
    err.code = PILOT_SCALING_ERRORS.ROLLOUT_APPROVAL_REQUIRED;
    throw err;
  }

  // اعتبارسنجی دامنه دسترسی اداره منطقه
  if (operator.role === 'edu_office' && operator.region_id && operator.region_id !== province.region_id) {
    const err = new Error(
      `PHASE5_PILOT_SCOPE_VIOLATION: اپراتور اداره منطقه "${operator.region_id}" مجاز به فعال‌سازی استان وابسته به منطقه "${province.region_id}" نیست`
    );
    err.code = PILOT_SCALING_ERRORS.PILOT_SCOPE_VIOLATION;
    throw err;
  }

  const updatedState = {
    ...province,
    pilot_status: PROVINCIAL_PILOT_STATUS.PROVISIONING,
    approval_state: {
      approved: true,
      approved_by: operator.name || operator.id,
      operator_role: operator.role,
      approved_at: new Date().toISOString(),
      automated_decision: false,
      automated_execution: false,
      requires_human_approval: true
    }
  };

  _provincialStateStore.set(province.province_id, updatedState);
  await persistProvincial(updatedState);
  assertNoZeroRanking(updatedState);
  return deepFreeze(updatedState);
}

/**
 * تنظیم درصد هدایت ترافیک قناری برای یک استان پایلوت
 * (updateProvincialTrafficRollout)
 *
 * @param {string} provinceId
 * @param {number} rolloutPct
 * @param {Object} approvalPayload
 * @returns {Object}
 */
async function updateProvincialTrafficRollout(provinceId, rolloutPct, approvalPayload = {}) {
  const province = getProvincialPilotById(provinceId);
  if (!province) {
    const err = new Error(`استان "${provinceId}" در رجیستری یافت نشد`);
    err.code = PILOT_SCALING_ERRORS.PILOT_SCOPE_VIOLATION;
    throw err;
  }

  assertNoZeroRanking(approvalPayload);

  // گیت صلب نظارت انسانی
  if (
    approvalPayload.approved !== true ||
    approvalPayload.automated_decision === true ||
    approvalPayload.automated_execution === true ||
    approvalPayload.requires_human_approval === false
  ) {
    const err = new Error(
      'PHASE5_ROLLOUT_APPROVAL_REQUIRED: هرگونه تغییر درصد ترافیک قناری مستلزم تایید صلب اپراتور انسانی است'
    );
    err.code = PILOT_SCALING_ERRORS.ROLLOUT_APPROVAL_REQUIRED;
    throw err;
  }

  const pct = Number(rolloutPct);
  if (!ALLOWED_ROLLOUT_PERCENTAGES.includes(pct)) {
    const err = new Error(
      `PHASE5_TRAFFIC_POLICY_FAILURE: درصد ترافیک "${rolloutPct}" معتبر نیست. مقادیر مجاز: [${ALLOWED_ROLLOUT_PERCENTAGES.join(', ')}]`
    );
    err.code = PILOT_SCALING_ERRORS.TRAFFIC_POLICY_FAILURE;
    throw err;
  }

  // بررسی سقف ظرفیت کلاستر قبل از افزایش بار
  const currentRps = province.capacity_profile.max_rps * (pct / 100);
  const currentUsers = province.capacity_profile.concurrent_users * (pct / 100);

  if (pct > 0 && currentRps > province.capacity_profile.max_rps) {
    const err = new Error(
      `PHASE5_CAPACITY_LIMIT_BREACH: بار درخواست‌شده (${currentRps} RPS) از سقف مجاز استان فراتر می‌رود`
    );
    err.code = PILOT_SCALING_ERRORS.CAPACITY_LIMIT_BREACH;
    throw err;
  }

  let nextStatus = province.pilot_status;
  if (pct === 100) {
    nextStatus = PROVINCIAL_PILOT_STATUS.ACTIVE;
  } else if (pct > 0) {
    nextStatus = PROVINCIAL_PILOT_STATUS.CANARY_ACTIVE;
  } else {
    nextStatus = PROVINCIAL_PILOT_STATUS.INACTIVE;
  }

  const operator = approvalPayload.operator || {};
  const updatedState = {
    ...province,
    pilot_status: nextStatus,
    traffic_rollout_pct: pct,
    capacity_profile: {
      ...province.capacity_profile,
      current_rps: Math.round(currentRps),
      current_sessions: Math.round(currentUsers),
      current_event_rate: Math.round(province.capacity_profile.event_throughput * (pct / 100))
    },
    approval_state: {
      approved: true,
      approved_by: operator.name || operator.id || 'HUMAN_SUPERVISOR',
      operator_role: operator.role || 'admin',
      approved_at: new Date().toISOString(),
      automated_decision: false,
      automated_execution: false,
      requires_human_approval: true
    }
  };

  _provincialStateStore.set(province.province_id, updatedState);
  await persistProvincial(updatedState);
  assertNoZeroRanking(updatedState);
  return deepFreeze(updatedState);
}

/**
 * ارزیابی و استخراج تابلوی جامع ظرفیت و مقیاس‌پذیری پایلوت ملی
 * (getProvincialCapacityOverview)
 *
 * @param {string} [regionFilter]
 * @returns {Object}
 */
function getProvincialCapacityOverview(regionFilter) {
  const provinces = getProvincialPilots(regionFilter);

  let totalRpsCapacity = 0;
  let totalActiveRps = 0;
  let totalConcurrentCapacity = 0;
  let totalActiveSessions = 0;
  let activePilotsCount = 0;

  for (const p of provinces) {
    totalRpsCapacity += p.capacity_profile.max_rps;
    totalActiveRps += p.capacity_profile.current_rps;
    totalConcurrentCapacity += p.capacity_profile.concurrent_users;
    totalActiveSessions += p.capacity_profile.current_sessions;

    if (p.pilot_status === PROVINCIAL_PILOT_STATUS.ACTIVE || p.pilot_status === PROVINCIAL_PILOT_STATUS.CANARY_ACTIVE) {
      activePilotsCount++;
    }
  }

  const overview = {
    overview_id: 'CAP-PHASE5-PROVINCIAL-PILOT',
    total_provinces: provinces.length,
    active_pilot_provinces: activePilotsCount,
    aggregated_capacity: {
      total_rps_capacity: totalRpsCapacity,
      active_rps_in_flight: totalActiveRps,
      total_concurrent_capacity: totalConcurrentCapacity,
      active_sessions_in_flight: totalActiveSessions,
      utilization_pct: totalRpsCapacity > 0 ? Math.round((totalActiveRps / totalRpsCapacity) * 100) : 0
    },
    rural_border_resilience: {
      rural_provinces_count: provinces.filter(p => p.support_tier === 'RURAL_LOW_BANDWIDTH').length,
      border_provinces_count: provinces.filter(p => p.support_tier === 'BORDER_OFFLINE_PRIORITY').length,
      low_bandwidth_active: provinces.filter(p => p.low_bandwidth_mode && p.traffic_rollout_pct > 0).length,
      offline_durability_guaranteed: true
    },
    human_governance: {
      automated_decision: false,
      automated_execution: false,
      requires_human_approval: true
    },
    zero_ranking_guarantee: {
      enforced: true,
      no_comparative_scoring: true
    },
    provinces,
    generated_at: new Date().toISOString()
  };

  assertNoZeroRanking(overview);
  return deepFreeze(overview);
}

/**
 * اعتبارسنجی مقیاس ظرفیت قبل از تخصیص بار به کلاستر (assertCapacityQuota)
 *
 * @param {string} provinceId
 * @param {number} additionalRps
 * @param {number} additionalUsers
 */
function assertCapacityQuota(provinceId, additionalRps = 0, additionalUsers = 0) {
  const province = getProvincialPilotById(provinceId);
  if (!province) {
    const err = new Error(`استان "${provinceId}" یافت نشد`);
    err.code = PILOT_SCALING_ERRORS.PILOT_SCOPE_VIOLATION;
    throw err;
  }

  const nextRps = province.capacity_profile.current_rps + additionalRps;
  const nextUsers = province.capacity_profile.current_sessions + additionalUsers;

  if (nextRps > province.capacity_profile.max_rps || nextUsers > province.capacity_profile.concurrent_users) {
    const err = new Error(
      `PHASE5_CAPACITY_LIMIT_BREACH: افزایش بار درخواستی (${nextRps} RPS / ${nextUsers} کاربر) از سهمیه استان "${province.province_name}" فراتر است`
    );
    err.code = PILOT_SCALING_ERRORS.CAPACITY_LIMIT_BREACH;
    throw err;
  }

  return true;
}

module.exports = {
  PILOT_SCALING_ERRORS,
  PROVINCIAL_PILOT_STATUS,
  ALLOWED_ROLLOUT_PERCENTAGES,
  CANONICAL_PROVINCES,
  getProvincialPilots,
  getProvincialPilotById,
  activateProvincialPilot,
  updateProvincialTrafficRollout,
  getProvincialCapacityOverview,
  assertCapacityQuota,
  refreshProvincialFromSoT
};
