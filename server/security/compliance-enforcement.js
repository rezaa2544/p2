/**
 * پایش — سامانه هوشمند مدیریت مدرسه
 * فاز ۴ — گام ۶ (P1-SC-06): لایه انطباق‌پذیری و اجرای مقررات امنیتی (Compliance Enforcement Layer)
 * 
 * بررسی‌های انطباق‌پذیری:
 *  - secret exposure (نشت توکن، کلیدهای خصوصی، گذرواژه‌ها)
 *  - insecure configuration (تنظیمات ناامن کوکی، CORS، پروتکل ارتباطی، دیتابیس)
 *  - missing authorization (عدم پوشش مجوزها در اکشن‌ها یا روت‌ها)
 *  - unsafe runtime state (حالت‌های ناامن زمان اجرا، اشباع حافظه، خطاهای مدیریت‌نشده)
 */
'use strict';

const { assertNoZeroRanking, deepFreeze, createZeroTrustError, ZERO_TRUST_ERRORS } = require('./zero-trust-runtime');

// الگوهای تشخیص احتمالی نشت کلید و رمز
const LEAK_PATTERNS = [
  /ghp_[a-zA-Z0-9]{36}/, // GitHub Personal Access Token
  /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/, // JWT Token
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/, // Private Key PEM
  /password\s*[:=]\s*['"][^'"]{6,}['"]/i // Plaintext password assignment
];

/**
 * ۱. ارزیابی نشت اطلاعات محرمانه (Secret Exposure Check)
 */
function checkSecretExposure(target) {
  const violations = [];

  function scan(val, currentPath = '') {
    if (val == null) return;

    if (typeof val === 'string') {
      for (const pattern of LEAK_PATTERNS) {
        if (pattern.test(val)) {
          violations.push({
            path: currentPath,
            rule: 'SECRET_EXPOSURE_DETECTED',
            message: `احتمال نشت رشته حساس یا محرمانه در مسیر "${currentPath}" کشف گردید.`
          });
          break;
        }
      }
      return;
    }

    if (Array.isArray(val)) {
      val.forEach((item, idx) => scan(item, `${currentPath}[${idx}]`));
      return;
    }

    if (typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) {
        const nextPath = currentPath ? `${currentPath}.${k}` : k;
        if (/^(?:password|secret|jwt_key|private_key)$/i.test(k) && typeof v === 'string' && v.length > 5 && !v.includes('REDACTED')) {
          violations.push({
            path: nextPath,
            rule: 'PLAINTEXT_SECRET_KEY_FOUND',
            message: `کلید حساس "${k}" فاقد ماسک یا محافظت لازم در شیء است.`
          });
        }
        scan(v, nextPath);
      }
    }
  }

  scan(target);

  return Object.freeze({
    compliant: violations.length === 0,
    violations_count: violations.length,
    violations: Object.freeze(violations)
  });
}

/**
 * ۲. ارزیابی امنیت پیکربندی سامانه (Configuration Security Check)
 */
function checkConfigurationSecurity(config = {}) {
  const issues = [];

  // بررسی وضعیت تولید و حافظه
  if (config.NODE_ENV === 'production' || process.env.NODE_ENV === 'production') {
    if (config.ALLOW_MEMORY_FALLBACK === '1' || process.env.ALLOW_MEMORY_FALLBACK === '1') {
      issues.push({
        severity: 'CRITICAL',
        code: 'MEMORY_FALLBACK_IN_PROD',
        message: 'فعال‌سازی فال‌بک حافظه در محیط تولید به موجب بند صلب Fail-Closed اکیداً ممنوع است.'
      });
    }

    if (!config.DATABASE_URL && !process.env.DATABASE_URL) {
      issues.push({
        severity: 'CRITICAL',
        code: 'MISSING_DATABASE_URL_IN_PROD',
        message: 'متغیر پایگاه‌داده اصلی (PostgreSQL) در محیط تولید تنظیم نشده است.'
      });
    }
  }

  // بررسی کوکی‌ها
  if (config.cookie) {
    if (config.cookie.httpOnly === false) {
      issues.push({
        severity: 'HIGH',
        code: 'COOKIE_NOT_HTTPONLY',
        message: 'کوکی نشست باید دارای پرچم HttpOnly باشد.'
      });
    }
    if (config.cookie.sameSite !== 'Strict' && config.cookie.sameSite !== 'Lax') {
      issues.push({
        severity: 'MEDIUM',
        code: 'COOKIE_SAMESITE_INSECURE',
        message: 'تنظیمات SameSite کوکی باید Lax یا Strict باشد.'
      });
    }
  }

  // بررسی CORS
  if (config.cors_origin === '*' && config.NODE_ENV === 'production') {
    issues.push({
      severity: 'HIGH',
      code: 'WILDCARD_CORS_IN_PROD',
      message: 'استفاده از Wildcard CORS در محیط تولید مجاز نیست.'
    });
  }

  return Object.freeze({
    compliant: issues.length === 0,
    issues_count: issues.length,
    issues: Object.freeze(issues)
  });
}

/**
 * ۳. ارزیابی جامعیت مدل مجوزها (Authorization Completeness Check)
 */
function checkAuthorizationCompleteness(permissionsMap = {}) {
  const missingPerms = [];

  if (typeof permissionsMap !== 'object' || Object.keys(permissionsMap).length === 0) {
    return Object.freeze({
      compliant: false,
      issues: Object.freeze(['نقشه دسترسی‌ها و مجوزهای سامانه خالی یا نامعتبر است.'])
    });
  }

  for (const [action, roles] of Object.entries(permissionsMap)) {
    if (!Array.isArray(roles) || roles.length === 0) {
      missingPerms.push(`عملیات "${action}" فاقد تعریف صریح نقش‌های مجاز است.`);
    }
  }

  return Object.freeze({
    compliant: missingPerms.length === 0,
    missing_count: missingPerms.length,
    missing: Object.freeze(missingPerms)
  });
}

/**
 * ۴. ارزیابی وضعیت ایمنی زمان اجرا (Unsafe Runtime State Check)
 */
function checkUnsafeRuntimeState(runtimeMetrics = {}) {
  const anomalies = [];

  // بررسی نرخ خطای اپلیکیشن
  const errorRate = runtimeMetrics.error_rate != null ? Number(runtimeMetrics.error_rate) : 0;
  if (errorRate > 0.05) { // بالاتر از ۵٪
    anomalies.push({
      metric: 'error_rate',
      value: errorRate,
      threshold: '<= 0.05',
      message: 'نرخ خطای زمان اجرای سرور از آستانه اضطراری فراتر رفته است.'
    });
  }

  // بررسی فشار حافظه Heap
  const heapUsagePercent = runtimeMetrics.heap_usage_percent != null ? Number(runtimeMetrics.heap_usage_percent) : 0;
  if (heapUsagePercent > 90) {
    anomalies.push({
      metric: 'heap_usage_percent',
      value: heapUsagePercent,
      threshold: '<= 90%',
      message: 'مصرف حافظه هیپ به محدوده اشباع و احتمال OOM رسیده است.'
    });
  }

  return Object.freeze({
    safe: anomalies.length === 0,
    anomalies_count: anomalies.length,
    anomalies: Object.freeze(anomalies)
  });
}

/**
 * ساخت گزارش جامع انطباق‌پذیری امنیتی
 */
function evaluateCompliance({ config = {}, runtimeState = {}, user = null, schoolId = null } = {}) {
  const secretCheck = checkSecretExposure(config);
  const configCheck = checkConfigurationSecurity(config);
  const runtimeCheck = checkUnsafeRuntimeState(runtimeState);

  const totalViolations = secretCheck.violations_count + configCheck.issues_count + runtimeCheck.anomalies_count;

  let complianceStatus = 'COMPLIANT';
  if (totalViolations > 0) {
    complianceStatus = 'REVIEW_REQUIRED';
  }

  const report = {
    compliance_id: `CMP-${Date.now()}`,
    evaluated_at: new Date().toISOString(),
    school_id: schoolId != null ? Number(schoolId) : null,
    compliance_status: complianceStatus,
    checks: {
      secret_exposure: secretCheck,
      configuration_security: configCheck,
      runtime_state: runtimeCheck
    },
    governance_and_invariants: {
      human_decision_sovereignty: {
        automated_decision: false,
        automated_execution: false,
        requires_human_approval: true,
        enforced: true
      },
      zero_ranking_guarantee: {
        enforced: true,
        evaluation_nature: 'IPSATIVE'
      }
    }
  };

  assertNoZeroRanking(report);

  return deepFreeze(report);
}

module.exports = {
  checkSecretExposure,
  checkConfigurationSecurity,
  checkAuthorizationCompleteness,
  checkUnsafeRuntimeState,
  evaluateCompliance
};
