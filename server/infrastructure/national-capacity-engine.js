/**
 * سامانه مدیریت هوشمند آموزش پایش — فاز ۵: موتور برنامه‌ریزی و ظرفیت ملی (P2-NI-01)
 * Phase 5: National Capacity Planning Engine & Production Quota Management
 *
 * الزامات کلیدی:
 * ۱. مدل ظرفیت جامع کل کشور، استان‌ها، مدارس و خط لوله رویدادها
 * ۲. رصد و تخمین شاخص‌های بنیادین:
 *    - max_rps, concurrent_users, database_connections, event_throughput, storage_growth
 * ۳. ممنوعیت مطلق اجرای خودکار تغییرات ظرفیت (auto_scaling_execution = FORBIDDEN)
 * ۴. خروجی توصیه‌ای (capacity_recommendation فقط پیشنهاد است)
 * ۵. الزام صلب تایید انسانی در هرگونه بازتنظیم ظرفیت
 * ۶. خطای رسمی: PHASE5_NATIONAL_CAPACITY_APPROVAL_REQUIRED
 * ۷. تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی مدارس (ZERO_RANKING_VIOLATION)
 */

'use strict';

const {
  assertNoZeroRanking,
  assertHumanApproval,
  deepFreeze
} = require('./phase5-region-federation');

const {
  CANONICAL_NATIONAL_REGIONS,
  getNationalRegionRegistry
} = require('./national-region-control-plane');

const CAPACITY_ENGINE_ERRORS = Object.freeze({
  APPROVAL_REQUIRED: 'PHASE5_NATIONAL_CAPACITY_APPROVAL_REQUIRED',
  AUTOSCALE_FORBIDDEN: 'PHASE5_AUTOSCALING_EXECUTION_FORBIDDEN',
  CAPACITY_BREACH: 'PHASE5_CAPACITY_LIMIT_BREACH',
  ZERO_RANKING_VIOLATION: 'ZERO_RANKING_VIOLATION'
});

/**
 * مدل کلان ظرفیت ملی پایش مدارس (مبتنی بر docs/CAPACITY_MODEL.md)
 */
const NATIONAL_TARGET_CAPACITY = Object.freeze({
  total_registered_users: 10000000,       // ۱۰ میلیون کاربر ثبت‌شده
  daily_active_users: 6000000,            // ۶ میلیون کاربر فعال روزانه
  peak_concurrent_users: 2500000,         // ۲.۵ میلیون کاربر پیک همزمان
  peak_rps_target: 20000,                 // ۲۰ هزار درخواست در ثانیه
  peak_writes_target: 2500,               // ۲۵۰۰ تراکنش نوشتن در ثانیه
  database_connections_pool_max: 3500,    // سقف اتصالات پایگاه‌داده
  event_pipeline_throughput: 25000,       // توان پردازش رویداد در ثانیه
  storage_annual_growth_tb: 45            // رشد سالانه ذخیره‌سازی
});

/**
 * دریافت مدل و وضعیت تجمیعی ظرفیت ملی
 *
 * @returns {Object}
 */
function getNationalCapacityModel() {
  const regions = getNationalRegionRegistry();

  let allocatedRps = 0;
  let allocatedConcurrent = 0;
  let allocatedDbConnections = 0;
  let allocatedEventThroughput = 0;
  let totalSchoolsSupported = 0;

  const regionBreakdown = {};

  for (const r of regions) {
    allocatedRps += r.capacity_profile.max_rps;
    allocatedConcurrent += r.capacity_profile.max_concurrent_users;
    allocatedDbConnections += r.capacity_profile.database_connections_limit;
    allocatedEventThroughput += r.capacity_profile.event_throughput_limit;
    totalSchoolsSupported += r.capacity_profile.max_schools;

    regionBreakdown[r.region_id] = {
      name: r.name,
      allocated_rps: r.capacity_profile.max_rps,
      allocated_concurrent: r.capacity_profile.max_concurrent_users,
      allocated_db_conns: r.capacity_profile.database_connections_limit,
      allocated_events: r.capacity_profile.event_throughput_limit,
      schools_count: r.capacity_profile.max_schools,
      provinces_covered: r.province_scope.length
    };
  }

  const model = {
    model_id: 'CAP-MODEL-PHASE5-NATIONAL-OFFICIAL',
    national_targets: { ...NATIONAL_TARGET_CAPACITY },
    current_fabric_allocation: {
      total_rps_capacity: allocatedRps,
      total_concurrent_capacity: allocatedConcurrent,
      total_db_connections_pool: allocatedDbConnections,
      total_event_pipeline_capacity: allocatedEventThroughput,
      total_schools_capacity: totalSchoolsSupported
    },
    auto_scaling_policy: {
      auto_scaling_execution: false,
      automated_scaling_allowed: false,
      governance_mode: 'HUMAN_SUPERVISED_CAPACITY_PLANNING'
    },
    region_allocations: regionBreakdown,
    human_governance: {
      automated_decision: false,
      automated_execution: false,
      requires_human_approval: true
    },
    zero_ranking_guarantee: {
      enforced: true,
      no_comparative_rank: true
    },
    timestamp: new Date().toISOString()
  };

  assertNoZeroRanking(model);
  return deepFreeze(model);
}

/**
 * تحلیل و ارزیابی هوشمند مصرف منابع و ارائه پیشنهاد مقیاس (صرفاً پیشنهاد — بدون اجرا)
 * (evaluateCapacityRecommendation)
 *
 * @param {string} regionId
 * @param {Object} currentMetrics - { active_rps, concurrent_users, db_connections, event_lag }
 * @returns {Object}
 */
function evaluateCapacityRecommendation(regionId, currentMetrics = {}) {
  const regions = getNationalRegionRegistry();
  const region = regions.find(r => r.region_id === regionId);

  if (!region) {
    throw new Error(`منطقه "${regionId}" یافت نشد`);
  }

  assertNoZeroRanking(currentMetrics);

  const activeRps = currentMetrics.active_rps || 0;
  const activeUsers = currentMetrics.concurrent_users || 0;
  const maxRps = region.capacity_profile.max_rps;
  const maxUsers = region.capacity_profile.max_concurrent_users;

  const rpsUtilizationPct = Math.round((activeRps / maxRps) * 100);
  const userUtilizationPct = Math.round((activeUsers / maxUsers) * 100);

  let recommendation = 'MAINTAIN_CURRENT_QUOTA';
  let suggestedRpsDelta = 0;
  let reason = 'بار کاری در دامنه بهینه زیرساخت قرار دارد';

  if (rpsUtilizationPct > 80 || userUtilizationPct > 80) {
    recommendation = 'SCALE_UP_RECOMMENDED';
    suggestedRpsDelta = Math.ceil(maxRps * 0.25);
    reason = 'مصرف منابع از آستانه هشدار ۸۰٪ فراتر رفته است — نیازمند بازنگری سرپرست زیرساخت';
  } else if (rpsUtilizationPct < 20 && activeRps > 0) {
    recommendation = 'SCALE_DOWN_RECOMMENDED';
    suggestedRpsDelta = -Math.ceil(maxRps * 0.15);
    reason = 'منابع مازاد برای هدایت به سایر کلاسترها پیشنهاد می‌گردد';
  }

  const advisory = {
    region_id: region.region_id,
    region_name: region.name,
    current_capacity: { ...region.capacity_profile },
    current_metrics: {
      active_rps: activeRps,
      concurrent_users: activeUsers,
      rps_utilization_pct: rpsUtilizationPct,
      user_utilization_pct: userUtilizationPct
    },
    capacity_recommendation: {
      advisory_type: recommendation,
      suggested_rps_adjustment: suggestedRpsDelta,
      reason,
      automated_execution: false,
      execution_blocked: true,
      requires_human_approval: true
    },
    zero_ranking_guarantee: true,
    generated_at: new Date().toISOString()
  };

  assertNoZeroRanking(advisory);
  return deepFreeze(advisory);
}

/**
 * ثبت و اعمال تاییدیه اپراتور انسانی برای تنظیم ظرفیت کلاستر
 * (applyNationalCapacityAdjustment)
 *
 * @param {Object} changePayload
 * @returns {Object}
 */
function applyNationalCapacityAdjustment(changePayload = {}) {
  assertNoZeroRanking(changePayload);

  // گیت صلب نظارت انسانی
  if (
    changePayload.approved !== true ||
    changePayload.automated_decision === true ||
    changePayload.automated_execution === true ||
    changePayload.requires_human_approval === false
  ) {
    const err = new Error(
      'PHASE5_NATIONAL_CAPACITY_APPROVAL_REQUIRED: اعمال تغییرات ظرفیت زیرساخت ملی مستلزم تایید صریح اپراتور انسانی است'
    );
    err.code = CAPACITY_ENGINE_ERRORS.APPROVAL_REQUIRED;
    throw err;
  }

  if (changePayload.auto_scale === true) {
    const err = new Error(
      'PHASE5_AUTOSCALING_EXECUTION_FORBIDDEN: اجرای تغییر خودکار مقیاس در محیط ملی مسدود است'
    );
    err.code = CAPACITY_ENGINE_ERRORS.AUTOSCALE_FORBIDDEN;
    throw err;
  }

  const operator = changePayload.operator || {};
  if (!operator.id || !['superadmin', 'admin'].includes(operator.role)) {
    const err = new Error('تنها مدیران ارشد مجاز به تنظیم ظرفیت زیرساخت ملی هستند');
    err.code = CAPACITY_ENGINE_ERRORS.APPROVAL_REQUIRED;
    throw err;
  }

  const receipt = {
    adjustment_id: `CAP-ADJ-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    region_id: changePayload.region_id,
    adjustment_type: changePayload.adjustment_type || 'RPS_QUOTA_UPDATE',
    delta_rps: changePayload.delta_rps || 0,
    status: 'COMMITTED',
    operator: {
      id: operator.id,
      role: operator.role,
      name: operator.name || 'اپراتور زیرساخت ملی'
    },
    human_approved: true,
    timestamp: new Date().toISOString()
  };

  assertNoZeroRanking(receipt);
  return deepFreeze(receipt);
}

module.exports = {
  CAPACITY_ENGINE_ERRORS,
  NATIONAL_TARGET_CAPACITY,
  getNationalCapacityModel,
  evaluateCapacityRecommendation,
  applyNationalCapacityAdjustment
};
