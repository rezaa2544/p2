/**
 * سامانه مدیریت هوشمند آموزش پایش — فاز ۵: حاکمیت منابع و پایلوت ملی (P2-PL-01)
 * Phase 5: National Pilot Resource Governance & Tenant Allocation
 *
 * الزامات کلیدی:
 * ۱. مدیریت سهمیه‌بندی منابع (Resource Quota Management: RPS, Concurrency, Storage)
 * ۲. تخصیص مستأجران مدارس و برنامه‌ریزی ظرفیت استان‌ها
 * ۳. لایه پشتیبانی اختصاصی مدارس روستایی، عشایری و مرزی (Rural/Border Support Layer)
 * ۴. اعمال صلب حاکمیت تصمیم انسانی در هرگونه افزایش سهمیه یا تغییر خط‌مشی
 * ۵. تضمین قطعی و بدون مسامحه منع رتبه‌بندی رقابتی مدارس
 */

'use strict';

const {
  FEDERATION_ERRORS,
  assertNoZeroRanking,
  assertHumanApproval,
  deepFreeze,
  getRegionRegistry,
  getRegionById
} = require('./phase5-region-federation');

/**
 * رده‌های پشتیبانی مدارس در پایلوت ملی
 */
const PILOT_SUPPORT_TIER = Object.freeze({
  URBAN_STANDARD: 'URBAN_STANDARD',               // مدارس شهری با پهنای باند نرمال
  RURAL_LOW_BANDWIDTH: 'RURAL_LOW_BANDWIDTH',     // مدارس روستایی با حجم تبادل فشرده و کش محلی
  BORDER_OFFLINE_PRIORITY: 'BORDER_OFFLINE_PRIORITY' // مدارس مرزی با اولویت صف آفلاین و تحمل قطعی
});

/**
 * سهمیه‌های استاندارد کلاسترها در پایلوت ملی
 */
const DEFAULT_REGION_QUOTAS = Object.freeze({
  max_rps: 3500,
  max_concurrent_users: 500000,
  max_storage_gb: 15000,
  burst_allowance_pct: 20
});

/**
 * ارزیابی وضعیت و تخصیص سهمیه مدرسه در پایلوت (allocateSchoolTenant)
 *
 * @param {Object} school - { id, name, province, is_rural, is_border, student_count }
 * @param {string} regionId
 * @returns {Object}
 */
function allocateSchoolTenant(school = {}, regionId = 'ir-tehran-1') {
  if (!school.id) {
    throw new Error('شناسه مدرسه جهت تخصیص سهمیه الزامی است');
  }

  const region = getRegionById(regionId);
  if (!region) {
    const err = new Error(`منطقه "${regionId}" یافت نشد`);
    err.code = FEDERATION_ERRORS.REGION_NOT_FOUND;
    throw err;
  }

  let tier = PILOT_SUPPORT_TIER.URBAN_STANDARD;
  let offlineGraceHours = 24;
  let syncChunkSizeKb = 64;
  let lowBandwidthMode = false;

  if (school.is_border) {
    tier = PILOT_SUPPORT_TIER.BORDER_OFFLINE_PRIORITY;
    offlineGraceHours = 72; // تحمل ۳ روز قطعی اینترنت مرزی
    syncChunkSizeKb = 32;
    lowBandwidthMode = true;
  } else if (school.is_rural || school.has_multigrade) {
    tier = PILOT_SUPPORT_TIER.RURAL_LOW_BANDWIDTH;
    offlineGraceHours = 48;
    syncChunkSizeKb = 32;
    lowBandwidthMode = true;
  }

  const allocation = {
    school_id: Number(school.id),
    school_name: school.name || 'مدرسه پایلوت',
    assigned_region: region.region_id,
    support_tier: tier,
    low_bandwidth_mode: lowBandwidthMode,
    offline_grace_hours: offlineGraceHours,
    sync_chunk_size_kb: syncChunkSizeKb,
    resource_quota: {
      max_concurrent_sessions: Math.max(10, Math.ceil((school.student_count || 100) * 0.4)),
      daily_sync_quota_mb: lowBandwidthMode ? 250 : 1000
    },
    allocated_at: new Date().toISOString()
  };

  assertNoZeroRanking(allocation);
  return deepFreeze(allocation);
}

/**
 * ارزیابی و استخراج تابلوی حاکمیت منابع و ظرفیت پایلوت ملی
 *
 * @param {Object} currentLoad - وضعیت بار جاری مناطق
 * @returns {Object}
 */
function buildResourceGovernanceSnapshot(currentLoad = {}) {
  const regions = getRegionRegistry();
  const now = new Date().toISOString();

  const regionAllocations = {};
  let totalAllocatedRps = 0;
  let totalAllocatedCapacity = 0;

  for (const r of regions) {
    const load = currentLoad[r.region_id] || {};
    const currentRps = load.rps != null ? load.rps : 240;
    const currentSessions = load.sessions != null ? load.sessions : 18000;

    regionAllocations[r.region_id] = {
      name: r.name,
      geography: r.geography,
      status: r.status,
      quota_schools: r.quota_schools,
      quota_concurrent: r.quota_concurrent_users,
      current_rps: currentRps,
      current_sessions: currentSessions,
      utilization_pct: Math.round((currentSessions / r.quota_concurrent_users) * 100),
      rural_support: r.rural_support,
      border_support: r.border_support
    };

    totalAllocatedRps += currentRps;
    totalAllocatedCapacity += r.quota_concurrent_users;
  }

  const snapshot = {
    governance_id: 'GOV-PHASE5-PILOT-NATIONAL',
    national_overview: {
      total_regions: regions.length,
      total_capacity_concurrent_users: totalAllocatedCapacity,
      current_total_rps: totalAllocatedRps,
      rural_border_clusters_active: regions.filter(r => r.rural_support || r.border_support).length
    },
    regions: regionAllocations,
    human_governance: {
      automated_decision: false,
      automated_execution: false,
      requires_human_approval: true,
      approval_policy: 'HUMAN_SUPERVISOR_SIGN_OFF'
    },
    zero_ranking_guarantee: {
      enforced: true,
      prohibit_ranking: true,
      evaluation_method: 'IPSATIVE_RESOURCE_ALLOCATION'
    },
    generated_at: now
  };

  assertNoZeroRanking(snapshot);
  return deepFreeze(snapshot);
}

/**
 * ثبت و اجرای تاییدیه اپراتور انسانی برای اقدامات پایلوت ملی
 * (executePilotApprovalAction)
 *
 * @param {Object} payload - { action_type, target_region, target_school, operator, approved }
 * @returns {Object}
 */
function executePilotApprovalAction(payload = {}) {
  if (payload.approved !== true) {
    const err = new Error(
      'PHASE5_HUMAN_APPROVAL_REQUIRED: اقدام درخواست‌شده توسط اپراتور انسانی رد صلاحیت شد یا هنوز تایید نشده است'
    );
    err.code = FEDERATION_ERRORS.HUMAN_APPROVAL_REQUIRED;
    throw err;
  }

  if (
    payload.automated_decision === true ||
    payload.automated_execution === true ||
    payload.requires_human_approval === false
  ) {
    const err = new Error(
      'PHASE5_HUMAN_APPROVAL_REQUIRED: مداخله خودکار اکیداً مسدود است؛ تاییدیه باید مستقیماً با عاملیت انسانی صادر شود'
    );
    err.code = FEDERATION_ERRORS.HUMAN_APPROVAL_REQUIRED;
    throw err;
  }

  if (!payload.operator || !payload.operator.id || !payload.operator.role) {
    const err = new Error('اطلاعات اپراتور تاییدکننده ناقص است');
    err.code = FEDERATION_ERRORS.HUMAN_APPROVAL_REQUIRED;
    throw err;
  }

  const allowedRoles = ['superadmin', 'admin', 'edu_office'];
  if (!allowedRoles.includes(payload.operator.role)) {
    const err = new Error(`نقش اپراتور "${payload.operator.role}" مجاز به صدور تاییدیه پایلوت ملی نیست`);
    err.code = FEDERATION_ERRORS.REGION_ISOLATION_VIOLATION;
    throw err;
  }

  const approvalReceipt = {
    approval_id: `APPV-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    action_type: payload.action_type || 'CAPACITY_QUOTA_ADJUSTMENT',
    target_region: payload.target_region || 'ir-tehran-1',
    target_school: payload.target_school || null,
    status: 'APPROVED',
    operator: {
      id: payload.operator.id,
      role: payload.operator.role,
      name: payload.operator.name || 'اپراتور ارشد ستاد'
    },
    human_verified: true,
    execution_mode: 'SUPERVISED_HUMAN_DISPATCH',
    timestamp: new Date().toISOString()
  };

  assertNoZeroRanking(approvalReceipt);
  return deepFreeze(approvalReceipt);
}

module.exports = {
  PILOT_SUPPORT_TIER,
  DEFAULT_REGION_QUOTAS,
  allocateSchoolTenant,
  buildResourceGovernanceSnapshot,
  executePilotApprovalAction
};
