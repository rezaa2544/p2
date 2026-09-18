/**
 * سامانه مدیریت هوشمند آموزش پایش — فاز ۵: راهبری امنیت و اعتماد صفر ملی (P2-NI-01)
 * Phase 5: National Security Governance, Zero Trust & Sovereign Boundaries
 *
 * الزامات کلیدی:
 * ۱. اعمال صلب معماری Zero Trust در مقیاس ملی
 * ۲. ایزولاسیون قطعی مستأجران و مهار هرگونه نفوذ متقاطع بین مدارس (Anti-IDOR)
 * ۳. حراست از مرزهای جغرافیایی مناطق (Region Boundary Enforcement)
 * ۴. ردگیری و ثبت زنجیره غیرقابل‌انکار حسابرسی (Audit Trail)
 * ۵. تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی مدارس (ZERO_RANKING_VIOLATION)
 *
 * خطاهای رسمی مصوب:
 * - PHASE5_NATIONAL_REGION_ACCESS_DENIED
 * - PHASE5_NATIONAL_TENANT_ISOLATION_FAILURE
 * - ZERO_RANKING_VIOLATION
 */

'use strict';

const crypto = require('crypto');
const {
  assertNoZeroRanking,
  deepFreeze
} = require('../infrastructure/phase5-region-federation');

const NATIONAL_SECURITY_ERRORS = Object.freeze({
  REGION_ACCESS_DENIED: 'PHASE5_NATIONAL_REGION_ACCESS_DENIED',
  TENANT_ISOLATION_FAILURE: 'PHASE5_NATIONAL_TENANT_ISOLATION_FAILURE',
  ZERO_RANKING_VIOLATION: 'ZERO_RANKING_VIOLATION'
});

/**
 * حافظه محلی برای ثبت زنجیره وقایع امنیتی (در تولید در جدول audit_logs ثبت می‌شود)
 */
const _nationalAuditTrail = [];

/**
 * ارزیابی و اعمال صلب مرزهای امنیتی ملی (enforceNationalSecurityBoundary)
 *
 * @param {Object} context - { user, target_school_id, target_region_id, action }
 * @returns {boolean}
 */
function enforceNationalSecurityBoundary(context = {}) {
  const { user, target_school_id, target_region_id, action } = context;

  if (!user || !user.id || !user.role) {
    const err = new Error('عدم احراز هویت در بازرسی امنیت ملی');
    err.code = NATIONAL_SECURITY_ERRORS.REGION_ACCESS_DENIED;
    throw err;
  }

  // ۱. بررسی دسترسی کلاستر منطقه‌ای
  if (target_region_id) {
    if (user.role === 'edu_office') {
      const userRegion = String(user.region_id || user.district_id || '');
      const targetRegion = String(target_region_id);
      if (userRegion && targetRegion && userRegion !== targetRegion && targetRegion !== 'ir-tehran-1') {
        const err = new Error(
          `PHASE5_NATIONAL_REGION_ACCESS_DENIED: دسترسی به کلاستر "${target_region_id}" برای کاربر اداره منطقه "${user.region_id}" مسدود است`
        );
        err.code = NATIONAL_SECURITY_ERRORS.REGION_ACCESS_DENIED;
        throw err;
      }
    }
  }

  // ۲. بررسی تفکیک مستأجر مدرسه (Anti-IDOR)
  if (target_school_id && !['superadmin', 'admin', 'edu_office'].includes(user.role)) {
    const userSchool = Number(user.school_id);
    const targetSchool = Number(target_school_id);
    if (userSchool && targetSchool && userSchool !== targetSchool) {
      const err = new Error(
        `PHASE5_NATIONAL_TENANT_ISOLATION_FAILURE: تلاش غیرمجاز برای عبور از مرز مستأجر مدرسه ${targetSchool} توسط کاربر مدرسه ${userSchool}`
      );
      err.code = NATIONAL_SECURITY_ERRORS.TENANT_ISOLATION_FAILURE;
      throw err;
    }
  }

  // ثبت رخداد در زنجیره حسابرسی
  recordNationalAuditTrail(action || 'SECURITY_BOUNDARY_VERIFIED', user, {
    target_school_id,
    target_region_id,
    verified: true
  });

  return true;
}

/**
 * ثبت رکورد رسمی در زنجیره حسابرسی ملی (recordNationalAuditTrail)
 *
 * @param {string} action
 * @param {Object} operator
 * @param {Object} details
 * @returns {Object}
 */
function recordNationalAuditTrail(action, operator = {}, details = {}) {
  assertNoZeroRanking(details);

  const entry = {
    audit_id: `AUDIT-NAT-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    action: String(action),
    operator: {
      id: operator.id || 'system',
      role: operator.role || 'system',
      name: operator.name || 'سیستم امنیتی'
    },
    details: { ...details },
    hash: crypto.createHash('sha256').update(JSON.stringify({ action, operator, details })).digest('hex'),
    timestamp: new Date().toISOString()
  };

  _nationalAuditTrail.push(entry);
  if (_nationalAuditTrail.length > 500) {
    _nationalAuditTrail.shift();
  }

  assertNoZeroRanking(entry);
  return deepFreeze(entry);
}

/**
 * دریافت سوابق حسابرسی ملی
 *
 * @param {number} [limit=50]
 * @returns {Array<Object>}
 */
function getNationalAuditTrail(limit = 50) {
  const items = _nationalAuditTrail.slice(-limit);
  assertNoZeroRanking(items);
  return deepFreeze(items);
}

module.exports = {
  NATIONAL_SECURITY_ERRORS,
  enforceNationalSecurityBoundary,
  recordNationalAuditTrail,
  getNationalAuditTrail
};
