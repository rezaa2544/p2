/**
 * سامانه مدیریت هوشمند آموزش پایش — فاز ۵: ایزولاسیون داده‌ها و مسیریابی ژئوگرافیک (P2-PL-01)
 * Phase 5: Geographic Data Isolation & Cross-Region Protection
 *
 * الزامات کلیدی:
 * ۱. ایزولاسیون صلب مستأجران و جلوگیری از نشت داده‌های بین‌منطقه‌ای (Cross-Region Leakage)
 * ۲. هدایت آگاه از منطقه (Region-aware Data Routing)
 * ۳. وابستگی صلب به PostgreSQL به عنوان منبع انحصاری حقیقت (SoT)
 * ۴. استفاده از Redis منحصراً به عنوان کش با فضای‌نام دوسطحی منطقه و مستأجر
 * ۵. پرتاب خطاهای رسمی اجباری:
 *    - PHASE5_REGION_ISOLATION_VIOLATION
 *    - PHASE5_TENANT_BOUNDARY_BREACH
 *    - PHASE5_DATA_RESIDENCY_POLICY_FAILURE
 *    - ZERO_RANKING_VIOLATION
 */

'use strict';

const {
  FEDERATION_ERRORS,
  assertNoZeroRanking,
  deepFreeze,
  getRegionById
} = require('./phase5-region-federation');

/**
 * نگاشت رسمی استان‌ها به شناسه‌های منطقه (Province to Region Mapping)
 */
const PROVINCE_REGION_MAP = Object.freeze({
  'تهران': 'ir-tehran-1',
  'البرز': 'ir-tehran-1',
  'سمنان': 'ir-tehran-1',
  'اصفهان': 'ir-isfahan-1',
  'یزد': 'ir-isfahan-1',
  'چهارمحال و بختیاری': 'ir-isfahan-1',
  'خراسان رضوی': 'ir-khorasan-1',
  'خراسان شمالی': 'ir-khorasan-1',
  'خراسان جنوبی': 'ir-khorasan-1',
  'فارس': 'ir-fars-1',
  'بوشهر': 'ir-fars-1',
  'کهگیلویه و بویراحمد': 'ir-fars-1',
  'هرمزگان': 'ir-fars-1',
  'آذربایجان شرقی': 'ir-tabriz-1',
  'آذربایجان غربی': 'ir-tabriz-1',
  'اردبیل': 'ir-tabriz-1',
  'زنجان': 'ir-tabriz-1',
  'خوزستان': 'ir-border-west-1',
  'کرمانشاه': 'ir-border-west-1',
  'ایلام': 'ir-border-west-1',
  'کردستان': 'ir-border-west-1',
  'سراسری_روستایی_عشایری': 'ir-rural-central-1'
});

/**
 * ارزیابی صلاحیت دسترسی کاربر به منطقه (validateRegionAccess)
 *
 * @param {Object} user
 * @param {string|number} targetRegionId
 * @returns {boolean}
 */
function validateRegionAccess(user, targetRegionId) {
  if (!user) {
    const err = new Error('کاربر احراز هویت نشده است');
    err.code = FEDERATION_ERRORS.REGION_ISOLATION_VIOLATION;
    throw err;
  }

  const role = user.role;
  if (role === 'superadmin' || role === 'admin') {
    return true; // دسترسی ملی بدون محدودیت منطقه‌ای
  }

  const target = getRegionById(targetRegionId);
  if (!target) {
    const err = new Error(`منطقه مقصد "${targetRegionId}" معتبر نیست`);
    err.code = FEDERATION_ERRORS.REGION_NOT_FOUND;
    throw err;
  }

  // اگر نقش اداره منطقه باشد:
  if (role === 'edu_office') {
    const userRegion = getRegionById(user.region_id || user.district_id);
    if (!userRegion || userRegion.region_id !== target.region_id) {
      const err = new Error(
        `PHASE5_REGION_ISOLATION_VIOLATION: دسترسی به منطقه "${target.name}" برای کاربر وابسته به منطقه دیگر مسدود است`
      );
      err.code = FEDERATION_ERRORS.REGION_ISOLATION_VIOLATION;
      throw err;
    }
    return true;
  }

  // نقش‌های مدرسه (manager, teacher, student, parent):
  const userSchoolRegion = user.school_region_id ? getRegionById(user.school_region_id) : null;
  if (userSchoolRegion && userSchoolRegion.region_id !== target.region_id) {
    const err = new Error(
      `PHASE5_REGION_ISOLATION_VIOLATION: دسترسی کاربر مدرسه خارج از حوزه اقامت جغرافیایی داده مسدود است`
    );
    err.code = FEDERATION_ERRORS.REGION_ISOLATION_VIOLATION;
    throw err;
  }

  return true;
}

/**
 * اعتبارسنجی انطباق مدرسه با سیاست اقامت جغرافیایی داده‌ها (validateDataResidency)
 *
 * @param {string|number} schoolProvince
 * @param {string|number} targetRegionId
 * @returns {boolean}
 */
function validateDataResidency(schoolProvince, targetRegionId) {
  if (!schoolProvince || !targetRegionId) {
    const err = new Error('ارائه استان مدرسه و منطقه جهت ارزیابی اقامت داده الزامی است');
    err.code = FEDERATION_ERRORS.DATA_RESIDENCY_POLICY_FAILURE;
    throw err;
  }

  const target = getRegionById(targetRegionId);
  if (!target) {
    const err = new Error(`منطقه "${targetRegionId}" یافت نشد`);
    err.code = FEDERATION_ERRORS.REGION_NOT_FOUND;
    throw err;
  }

  const expectedRegionId = PROVINCE_REGION_MAP[schoolProvince];
  if (!expectedRegionId || (expectedRegionId !== target.region_id && target.region_id !== 'ir-rural-central-1')) {
    const err = new Error(
      `PHASE5_DATA_RESIDENCY_POLICY_FAILURE: داده‌های استان "${schoolProvince}" مجاز به ذخیره‌سازی یا هدایت به کلاستر "${target.name}" نیستند`
    );
    err.code = FEDERATION_ERRORS.DATA_RESIDENCY_POLICY_FAILURE;
    throw err;
  }

  return true;
}

/**
 * اعمال جامع مرزهای جغرافیایی و مستأجری (enforceGeographicBoundary)
 *
 * @param {Object} context - { user, school_id, region_id, province }
 * @returns {boolean}
 */
function enforceGeographicBoundary(context = {}) {
  const { user, school_id, region_id, province } = context;

  if (!user) {
    const err = new Error('عدم احراز هویت در ارزیابی مرز جغرافیایی');
    err.code = FEDERATION_ERRORS.TENANT_BOUNDARY_BREACH;
    throw err;
  }

  // ۱. ارزیابی مرز منطقه
  if (region_id) {
    validateRegionAccess(user, region_id);
  }

  // ۲. ارزیابی مرز مدرسه و ضد نفوذ IDOR
  if (school_id && user.role !== 'superadmin' && user.role !== 'admin' && user.role !== 'edu_office') {
    const userSchool = Number(user.school_id);
    const targetSchool = Number(school_id);
    if (userSchool && targetSchool && userSchool !== targetSchool) {
      const err = new Error(
        `PHASE5_TENANT_BOUNDARY_BREACH: تلاش غیرمجاز برای عبور از مرز مستأجر مدرسه ${targetSchool} توسط کاربر مدرسه ${userSchool}`
      );
      err.code = FEDERATION_ERRORS.TENANT_BOUNDARY_BREACH;
      throw err;
    }
  }

  // ۳. ارزیابی اقامت داده‌ها
  if (province && region_id) {
    validateDataResidency(province, region_id);
  }

  return true;
}

/**
 * تولید کلید کش ایزوله با پیشوند منطقه و مستأجر در Redis
 * الگو: payesh:r:<region_id>:t:<tenant_id>:<namespace>:<key>
 *
 * @param {string} regionId
 * @param {string|number} tenantId
 * @param {string} namespace
 * @param {string} key
 * @returns {string}
 */
function generateRegionCacheKey(regionId, tenantId, namespace, key) {
  if (!regionId || !tenantId || !namespace || !key) {
    throw new Error('تمامی فیلدهای regionId, tenantId, namespace, key برای تولید کلید کش الزامی هستند');
  }

  const cleanRegion = String(regionId).trim().toLowerCase();
  const cleanTenant = String(tenantId).trim().toLowerCase();
  const cleanNamespace = String(namespace).trim().toLowerCase();
  const cleanKey = String(key).trim().toLowerCase();

  return `payesh:r:${cleanRegion}:t:${cleanTenant}:${cleanNamespace}:${cleanKey}`;
}

module.exports = {
  PROVINCE_REGION_MAP,
  validateRegionAccess,
  validateDataResidency,
  enforceGeographicBoundary,
  generateRegionCacheKey
};
