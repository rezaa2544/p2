/**
 * سامانه مدیریت هوشمند آموزش پایش — فاز ۶: استحکام و ممیزی محیط عملیاتی
 * Phase 6: Production Hardening, Secret Sanitization & Security Guardrails
 *
 * الزامات کلیدی:
 * ۱. اعتبارسنجی تنظیمات پروداکشن (Config Validation & Fail-Fast)
 * ۲. پالایش و ضدعفونی لاگ‌ها و تله‌متری (Zero Secret Leakage)
 * ۳. اعمال محدودیت‌های سخت‌افزاری منابع و حافظه (Resource Governance)
 * ۴. گارد امنیتی مرزهای تننت و استان (Zero Cross-Tenant Leakage)
 */

'use strict';

const HARDENING_ERRORS = Object.freeze({
  CONFIG_INVALID: 'PHASE6_PRODUCTION_CONFIG_INVALID',
  SECRET_WEAK: 'PHASE6_SECRET_STRENGTH_FAILED',
  TENANT_BREACH: 'PHASE6_TENANT_ISOLATION_BREACH',
  MEMORY_LIMIT_BREACH: 'PHASE6_MEMORY_LIMIT_EXCEEDED'
});

/**
 * ۱. ارزیابی جامع تنظیمات محیط عملیاتی
 */
function validateProductionEnvironment(env = process.env) {
  const isProd = env.NODE_ENV === 'production' || env.PAYESH_ENV === 'production';
  const checks = {
    databaseConfigured: !!env.DATABASE_URL,
    redisConfigured: !!env.REDIS_URL,
    strongJwtSecret: !!(env.PAYESH_JWT_SECRET && env.PAYESH_JWT_SECRET.length >= 32),
    proxyTlsConfigured: env.PAYESH_BEHIND_PROXY === '1' || !!env.PAYESH_TLS_CERT,
    memoryFallbackDisabled: env.ALLOW_MEMORY_FALLBACK !== '1'
  };

  const issues = [];
  if (isProd) {
    if (!checks.databaseConfigured) issues.push('DATABASE_URL در محیط پروداکشن الزامی است (اتکا به فایل رم ممنوع)');
    if (!checks.redisConfigured) issues.push('REDIS_URL در محیط پروداکشن الزامی است');
    if (!checks.strongJwtSecret) issues.push('PAYESH_JWT_SECRET باید حداقل ۳۲ کاراکتر پیچیده باشد');
  }

  return {
    is_production: isProd,
    checks,
    valid: issues.length === 0,
    issues
  };
}

/**
 * ۲. پالایش داده‌ها، شماره‌های تماس و توکن‌ها از لاگ‌ها و تله‌متری
 */
function sanitizePayload(data) {
  if (!data || typeof data !== 'object') return data;

  const clone = Array.isArray(data) ? [...data] : { ...data };
  for (const k of Object.keys(clone)) {
    const val = clone[k];
    if (typeof val === 'string') {
      // ماسک کردن کدملی (فقط ۳ رقم اول)
      if (/^\d{10}$/.test(val) && (k.includes('national') || k.includes('nid'))) {
        clone[k] = val.slice(0, 3) + '*******';
      }
      // ماسک کردن شماره موبایل
      else if (/^09\d{9}$/.test(val) || k.includes('phone') || k.includes('mobile')) {
        clone[k] = val.slice(0, 4) + '****' + val.slice(-3);
      }
      // پالایش کامل رمزها و توکن‌ها
      else if (['password', 'token', 'secret', 'code', 'auth', 'hash'].some(s => k.toLowerCase().includes(s))) {
        clone[k] = '[REDACTED_SECRET]';
      }
    } else if (typeof val === 'object' && val !== null) {
      clone[k] = sanitizePayload(val);
    }
  }
  return clone;
}

/**
 * ۳. گارد ایزولاسیون تننت و استان (Zero-Trust Tenant Guard)
 */
function assertTenantBoundary(actor, targetSchoolId, targetProvinceCode) {
  if (!actor || !actor.id) {
    const err = new Error('UNAUTHORIZED: شناسه عامل نامعتبر است');
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  // نقش‌های عالی‌رتبه ملی
  if (actor.role === 'superadmin') return true;

  // بررسی تننت مدرسه
  if (targetSchoolId != null && actor.school_id != null) {
    if (Number(actor.school_id) !== Number(targetSchoolId)) {
      const err = new Error('تخطی از حریم تننت: کاربر مجاز به دسترسی به مدرسه دیگر نیست');
      err.code = HARDENING_ERRORS.TENANT_BREACH;
      throw err;
    }
  }

  // بررسی حریم استان
  if (targetProvinceCode != null && actor.province_code != null) {
    if (String(actor.province_code) !== String(targetProvinceCode)) {
      const err = new Error('تخطی از حریم استانی: دسترسی به اطلاعات استان دیگر مجاز نیست');
      err.code = HARDENING_ERRORS.TENANT_BREACH;
      throw err;
    }
  }

  return true;
}

/**
 * ۴. بررسی وضعیت مصرف حافظه Heap و آستانه سرریز
 */
function checkMemoryHealth(maxHeapMb = 1024) {
  const usage = process.memoryUsage();
  const heapUsedMb = Math.round(usage.heapUsed / 1024 / 1024);
  const isHealthy = heapUsedMb < maxHeapMb;

  return {
    heap_used_mb: heapUsedMb,
    heap_max_allowed_mb: maxHeapMb,
    is_healthy: isHealthy,
    action: isHealthy ? 'NORMAL' : 'TRIGGER_GC_OR_RESTART'
  };
}

module.exports = {
  HARDENING_ERRORS,
  validateProductionEnvironment,
  sanitizePayload,
  assertTenantBoundary,
  checkMemoryHealth
};
