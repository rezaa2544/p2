/**
 * پایش — سامانه هوشمند مدیریت مدرسه
 * فاز ۴ — گام ۶ (P1-SC-06): لایه امنیت سخت‌گیرانه زمان اجرا و زیرساخت Zero Trust
 * 
 * معماری:
 * ZERO TRUST -> RUNTIME PROTECTION -> ACCESS GOVERNANCE -> COMPLIANCE ENFORCEMENT -> AUDITABILITY
 * 
 * اصول تخطی‌ناپذیر:
 *  ۱. حاکمیت تصمیم انسانی: automated_decision=false, automated_execution=false, requires_human_approval=true
 *  ۲. تحریم مطلق رتبه‌بندی رقابتی: مسدودسازی rank, ranking_score, league_table, best_school, worst_school, compare_school, top_school با خطای ZERO_RANKING_VIOLATION
 *  ۳. تفکیک چندمستأجری شکست‌ایمن (Fail-Closed): خطاهای ZERO_TRUST_TENANT_ISOLATION_VIOLATION و ZERO_TRUST_ROLE_ACCESS_DENIED
 */
'use strict';

const crypto = require('crypto');

// کدهای خطای رسمی Zero Trust
const ZERO_TRUST_ERRORS = Object.freeze({
  TENANT_ISOLATION_VIOLATION: 'ZERO_TRUST_TENANT_ISOLATION_VIOLATION',
  ROLE_ACCESS_DENIED: 'ZERO_TRUST_ROLE_ACCESS_DENIED',
  CONTEXT_INVALID: 'ZERO_TRUST_CONTEXT_INVALID',
  POLICY_REQUIRED: 'ZERO_TRUST_POLICY_REQUIRED',
  ZERO_RANKING_VIOLATION: 'ZERO_RANKING_VIOLATION'
});

// تصمیمات مجاز موتور سیاست‌گذاری امنیتی
const POLICY_DECISIONS = Object.freeze({
  ALLOW: 'ALLOW',
  DENY: 'DENY',
  REVIEW: 'REVIEW'
});

// کلیدواژه‌های تحریم‌شده رتبه‌بندی رقابتی مدارس
const PROHIBITED_RANKING_TERMS = Object.freeze([
  'rank',
  'ranking_score',
  'league_table',
  'best_school',
  'worst_school',
  'compare_school',
  'top_school'
]);

// نقش‌های معتبر سامانه پایش
const VALID_ROLES = Object.freeze([
  'superadmin',
  'manager',
  'teacher',
  'counselor',
  'edu_office',
  'parent',
  'student',
  'driver'
]);

/**
 * ایجاد خطای استاندارد Zero Trust با کد مشخص
 */
function createZeroTrustError(code, message, details = {}) {
  const err = new Error(message || code);
  err.name = 'ZeroTrustSecurityError';
  err.code = code;
  err.details = details;
  err.statusCode = code === ZERO_TRUST_ERRORS.ROLE_ACCESS_DENIED || code === ZERO_TRUST_ERRORS.TENANT_ISOLATION_VIOLATION ? 403 : 400;
  return err;
}

/**
 * بازرسی و تضمین عدم وجود کلیدواژه‌های ممنوعه رتبه‌بندی رقابتی
 */
function assertNoZeroRanking(payload, path = '') {
  if (!payload || typeof payload !== 'object') return true;

  const allowedComplianceKeys = new Set([
    'zero_ranking_guarantee',
    'zero_ranking',
    'rank_prohibited',
    'ranking_score_prohibited',
    'league_table_prohibited',
    'best_school_prohibited',
    'worst_school_prohibited',
    'compare_school_prohibited',
    'top_school_prohibited'
  ]);

  if (Array.isArray(payload)) {
    for (let i = 0; i < payload.length; i++) {
      assertNoZeroRanking(payload[i], `${path}[${i}]`);
    }
    return true;
  }

  for (const [key, value] of Object.entries(payload)) {
    const currentPath = path ? `${path}.${key}` : key;
    const lowerKey = key.toLowerCase();

    if (!allowedComplianceKeys.has(lowerKey)) {
      for (const term of PROHIBITED_RANKING_TERMS) {
        if (lowerKey === term || lowerKey.includes(term)) {
          throw createZeroTrustError(
            ZERO_TRUST_ERRORS.ZERO_RANKING_VIOLATION,
            `استفاده از کلیدواژه تحریم‌شده رتبه‌بندی رقابتی "${term}" در مسیر ${currentPath} اکیداً ممنوع است. ارزیابی‌ها در پایش صرفاً پیشرفتی، طولی و فردمحور (Ipsative) می‌باشند.`,
            { term, path: currentPath }
          );
        }
      }
    }

    if (typeof value === 'string') {
      const lowerVal = value.toLowerCase();
      for (const term of PROHIBITED_RANKING_TERMS) {
        if (lowerVal.includes(term)) {
          throw createZeroTrustError(
            ZERO_TRUST_ERRORS.ZERO_RANKING_VIOLATION,
            `استفاده از مقدار حاوی کلیدواژه تحریم‌شده رتبه‌بندی رقابتی "${term}" در مسیر ${currentPath} اکیداً ممنوع است.`,
            { term, path: currentPath, value }
          );
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      assertNoZeroRanking(value, currentPath);
    }
  }

  return true;
}

/**
 * ۱. اعتبارسنجی جامع هویت در مدل Zero Trust (Identity Verification)
 * بررسی هویت کاربر، هویت مستأجر (مدرسه)، نقش سازمانی، وضعیت نشست و تازگی توکن
 */
function verifyIdentity({ user, session, token, context = {} }) {
  if (!user || typeof user !== 'object') {
    return {
      valid: false,
      reason: 'MISSING_USER_OBJECT',
      error_code: ZERO_TRUST_ERRORS.CONTEXT_INVALID,
      requires_human_approval: true
    };
  }

  const userId = Number(user.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return {
      valid: false,
      reason: 'INVALID_USER_ID',
      error_code: ZERO_TRUST_ERRORS.CONTEXT_INVALID,
      requires_human_approval: true
    };
  }

  // بررسی نقش
  if (!user.role || !VALID_ROLES.includes(user.role)) {
    return {
      valid: false,
      reason: 'INVALID_USER_ROLE',
      error_code: ZERO_TRUST_ERRORS.ROLE_ACCESS_DENIED,
      requires_human_approval: true
    };
  }

  // بررسی مرز مستأجر (مدرسه) برای تمامی نقش‌های مدرسه‌ای
  const schoolId = user.school_id != null ? Number(user.school_id) : null;
  if (user.role !== 'superadmin' && (schoolId == null || !Number.isInteger(schoolId) || schoolId <= 0)) {
    return {
      valid: false,
      reason: 'INVALID_TENANT_IDENTITY',
      error_code: ZERO_TRUST_ERRORS.TENANT_ISOLATION_VIOLATION,
      requires_human_approval: true
    };
  }

  // بررسی وضعیت نشست (Session Validity) در صورت وجود
  if (session) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (session.expires_at && session.expires_at < nowSec) {
      return {
        valid: false,
        reason: 'SESSION_EXPIRED',
        error_code: ZERO_TRUST_ERRORS.CONTEXT_INVALID,
        requires_human_approval: true
      };
    }

    if (session.revoked === true) {
      return {
        valid: false,
        reason: 'SESSION_REVOKED',
        error_code: ZERO_TRUST_ERRORS.CONTEXT_INVALID,
        requires_human_approval: true
      };
    }
  }

  // بررسی تازگی توکن (Token Freshness)
  if (token && typeof token === 'object') {
    const nowSec = Math.floor(Date.now() / 1000);
    const maxAgeSec = 86400; // ۲۴ ساعت
    if (token.iat && (nowSec - token.iat) > maxAgeSec) {
      return {
        valid: false,
        reason: 'TOKEN_STALE',
        error_code: ZERO_TRUST_ERRORS.CONTEXT_INVALID,
        requires_human_approval: true
      };
    }
  }

  return {
    valid: true,
    identity: {
      user_id: userId,
      role: user.role,
      school_id: schoolId,
      verified_at: new Date().toISOString()
    },
    requires_human_approval: true
  };
}

/**
 * ۲. موتور ارزیابی سیاست‌های دسترسی امنیتی (Policy Decision Engine)
 * تصمیم‌گیری بر اساس اصل حداقل دسترسی و تفکیک وظایف
 */
function evaluateSecurityPolicy({ user, tenant, resource, action, context = {} }) {
  if (!user || !resource || !action) {
    throw createZeroTrustError(
      ZERO_TRUST_ERRORS.POLICY_REQUIRED,
      'ارزیابی خط‌مشی امنیتی مستلزم ارائه مشخصات کاربر، منبع و اقدام درخواستی است.',
      { user: !!user, resource: !!resource, action: !!action }
    );
  }

  const policyId = `POL-${resource.toUpperCase()}-${action.toUpperCase()}-${crypto.randomBytes(3).toString('hex')}`;

  // ۱. کنترل شکست‌ایمن مرز مستأجر (Tenant Boundary)
  const targetSchoolId = tenant != null ? Number(tenant) : null;
  const userSchoolId = user.school_id != null ? Number(user.school_id) : null;

  if (user.role !== 'superadmin' && targetSchoolId != null && userSchoolId !== targetSchoolId) {
    return Object.freeze({
      decision: POLICY_DECISIONS.DENY,
      reason: `دسترسی مستأجر ${userSchoolId} به منابع مستأجر هدف ${targetSchoolId} مسدود گردید.`,
      policy_id: policyId,
      error_code: ZERO_TRUST_ERRORS.TENANT_ISOLATION_VIOLATION,
      requires_human_approval: true
    });
  }

  // ۲. کنترل عملیات با ریسک بحرانی و حساس (نیاز به بررسی انسانی - REVIEW)
  const highRiskActions = [
    'BULK_USER_EXPORT',
    'SECURITY_POLICY_OVERRIDE',
    'PRIVILEGE_ESCALATION',
    'DATABASE_FAILOVER_TRIGGER',
    'ENCRYPTION_KEY_ROTATION'
  ];

  if (highRiskActions.includes(action.toUpperCase())) {
    return Object.freeze({
      decision: POLICY_DECISIONS.REVIEW,
      reason: `اقدام امنیتی حساس ${action} جهت اجرا نیازمند بررسی و تأیید صریح مدیر ارشد انسانی است.`,
      policy_id: policyId,
      requires_human_approval: true
    });
  }

  // ۳. کنترل دسترسی بر اساس نقش
  const rolePermissions = {
    superadmin: ['*'],
    manager: ['SYSTEM_HEALTH_READ', 'USER_READ', 'USER_WRITE', 'STUDENT_READ', 'STUDENT_WRITE', 'ATTENDANCE_READ', 'ATTENDANCE_WRITE', 'GRADES_READ', 'GRADES_WRITE', 'ANALYTICS_READ'],
    teacher: ['STUDENT_READ', 'ATTENDANCE_READ', 'ATTENDANCE_WRITE', 'GRADES_READ', 'GRADES_WRITE', 'ANALYTICS_READ'],
    counselor: ['STUDENT_READ', 'ATTENDANCE_READ', 'GRADES_READ', 'ANALYTICS_READ'],
    edu_office: ['SYSTEM_HEALTH_READ', 'ANALYTICS_READ'],
    parent: ['STUDENT_READ', 'ATTENDANCE_READ', 'GRADES_READ'],
    student: ['STUDENT_READ', 'ATTENDANCE_READ', 'GRADES_READ'],
    driver: ['STUDENT_READ', 'ATTENDANCE_READ']
  };

  const allowedActions = rolePermissions[user.role] || [];
  const actionNormalized = action.toUpperCase();

  const isPermitted = allowedActions.includes('*') || allowedActions.includes(actionNormalized);

  if (!isPermitted) {
    return Object.freeze({
      decision: POLICY_DECISIONS.DENY,
      reason: `نقش "${user.role}" مجوز اجرای عملیات "${action}" بر روی منبع "${resource}" را دارا نیست.`,
      policy_id: policyId,
      error_code: ZERO_TRUST_ERRORS.ROLE_ACCESS_DENIED,
      requires_human_approval: true
    });
  }

  return Object.freeze({
    decision: POLICY_DECISIONS.ALLOW,
    reason: `دسترسی مجاز مطابق خط‌مشی احراز هویت‌شده سازمانی.`,
    policy_id: policyId,
    requires_human_approval: true
  });
}

/**
 * ۳. محافظت زمان اجرای نشست‌ها و توکن‌ها (Session Protection)
 * کشف نشست‌های منقضی، استفاده مجدد مشکوک، بازپخش توکن و همزمانی غیرعادی
 */
function checkSessionProtection({ session, clientInfo = {}, sessionHistory = [] }) {
  if (!session || typeof session !== 'object') {
    return Object.freeze({
      protected: false,
      status: 'INVALID_SESSION',
      risk_level: 'HIGH',
      remediation_required: false,
      requires_human_approval: true
    });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const issues = [];

  // بررسی انقضا
  if (session.expires_at && session.expires_at < nowSec) {
    issues.push('SESSION_EXPIRED');
  }

  // بررسی ابطال
  if (session.revoked === true) {
    issues.push('SESSION_ALREADY_REVOKED');
  }

  // بررسی تغییر نامتعارف اثرانگشت کلاینت (Suspicious Reuse / Hijacking detection)
  if (session.client_ip && clientInfo.ip && session.client_ip !== clientInfo.ip) {
    issues.push('SUSPICIOUS_IP_SHIFT');
  }

  if (session.user_agent && clientInfo.user_agent && session.user_agent !== clientInfo.user_agent) {
    issues.push('SUSPICIOUS_USER_AGENT_SHIFT');
  }

  // بررسی بازپخش توکن (Token Replay Detection) با تطابق شناسه نشست یا nonce
  if (clientInfo.nonce && Array.isArray(sessionHistory)) {
    const isReplay = sessionHistory.some(h => h.nonce === clientInfo.nonce && h.used === true);
    if (isReplay) {
      issues.push('TOKEN_REPLAY_DETECTED');
    }
  }

  // بررسی همزمانی نشست‌ها (Concurrent Session Monitoring)
  const activeSessionsCount = session.active_sessions_count || 1;
  const maxAllowedConcurrent = 5;
  if (activeSessionsCount > maxAllowedConcurrent) {
    issues.push('EXCESSIVE_CONCURRENT_SESSIONS');
  }

  const hasIssues = issues.length > 0;
  const riskLevel = issues.includes('TOKEN_REPLAY_DETECTED') || issues.includes('SESSION_ALREADY_REVOKED') ? 'CRITICAL'
                  : issues.includes('SUSPICIOUS_IP_SHIFT') || issues.includes('SESSION_EXPIRED') ? 'MEDIUM'
                  : issues.length > 0 ? 'LOW' : 'NONE';

  return Object.freeze({
    protected: !hasIssues,
    status: hasIssues ? 'ANOMALY_DETECTED' : 'HEALTHY',
    risk_level: riskLevel,
    issues: Object.freeze(issues),
    // حاکمیت انسانی: هیچ مسدودسازی یا ابطال خودکاری انجام نمی‌شود؛ صرفاً ثبت و گزارش به انسان
    automated_remediation: false,
    requires_human_approval: true
  });
}

/**
 * ۴. اعمال مرزهای دسترسی و ایزولاسیون چندمستأجری (Access Boundary Enforcement - Fail Closed)
 */
function enforceAccessBoundary({ user, targetSchoolId, requiredRole, context = {} }) {
  if (!user || typeof user !== 'object') {
    throw createZeroTrustError(
      ZERO_TRUST_ERRORS.CONTEXT_INVALID,
      'اطلاعات کاربر جهت بررسی مرز دسترسی نامعتبر است.',
      { user: null }
    );
  }

  // ۱. اعتبارسنجی نقش
  if (requiredRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (user.role !== 'superadmin' && !roles.includes(user.role)) {
      throw createZeroTrustError(
        ZERO_TRUST_ERRORS.ROLE_ACCESS_DENIED,
        `نقش "${user.role}" دسترسی مجاز به این بخش را دارا نیست. نقش‌های الزامی: ${roles.join(', ')}`,
        { user_role: user.role, required_roles: roles }
      );
    }
  }

  // ۲. اعتبارسنجی شکست‌ایمن مستأجر (Tenant Fail-Closed)
  if (targetSchoolId != null) {
    const targetId = Number(targetSchoolId);
    const userSchoolId = user.school_id != null ? Number(user.school_id) : null;

    if (user.role !== 'superadmin') {
      if (userSchoolId == null || !Number.isInteger(userSchoolId) || userSchoolId <= 0) {
        throw createZeroTrustError(
          ZERO_TRUST_ERRORS.TENANT_ISOLATION_VIOLATION,
          'مستأجر کاربری کاربر فاقد شناسه مدرسه معتبر است و دسترسی سقط گردید.',
          { user_school_id: user.school_id, target_school_id: targetSchoolId }
        );
      }

      if (userSchoolId !== targetId) {
        throw createZeroTrustError(
          ZERO_TRUST_ERRORS.TENANT_ISOLATION_VIOLATION,
          `نقض تفکیک چندمستأجری: دسترسی کاربر مدرسه ${userSchoolId} به مدرسه هدف ${targetId} اکیداً مسدود است (Anti-IDOR).`,
          { user_school_id: userSchoolId, target_school_id: targetId }
        );
      }
    }
  }

  return true;
}

/**
 * ساخت شناسنامه سلامت امنیت زیرساخت Zero Trust برای وب‌سرویس REST API
 */
function buildSecurityHealthSnapshot({ schoolId = null, regionId = null, user = null, options = {} } = {}) {
  // ۱. بازرسی امنیتی شناسه مستأجر
  if (user && schoolId != null) {
    enforceAccessBoundary({ user, targetSchoolId: schoolId, requiredRole: ['superadmin', 'manager', 'edu_office'] });
  }

  const nowIso = new Date().toISOString();
  const snapshotId = `SEC-ZT-${schoolId || regionId || 'SYS'}-${crypto.randomBytes(3).toString('hex')}`;

  const securityStatus = options.security_status || 'HEALTHY';

  const snapshot = {
    snapshot_id: snapshotId,
    timestamp: nowIso,
    school_id: schoolId != null ? Number(schoolId) : null,
    region_id: regionId != null ? Number(regionId) : null,
    security_status: securityStatus,
    zero_trust: {
      enabled: true,
      policy_engine: 'ACTIVE',
      runtime_protection: 'ENABLED',
      identity_verification: 'ACTIVE',
      session_protection: 'ACTIVE',
      access_boundary: 'FAIL_CLOSED'
    },
    governance: {
      human_decision_sovereignty: true,
      zero_ranking_guarantee: true,
      tenant_isolation: true
    },
    requires_human_approval: true,
    governance_and_invariants: {
      human_decision_sovereignty: {
        automated_decision: false,
        automated_execution: false,
        requires_human_approval: true,
        workflow: 'DETECT -> REPORT -> HUMAN APPROVAL -> EXECUTE',
        enforced: true
      },
      zero_ranking_guarantee: {
        rank_prohibited: true,
        ranking_score_prohibited: true,
        league_table_prohibited: true,
        best_school_prohibited: true,
        worst_school_prohibited: true,
        compare_school_prohibited: true,
        top_school_prohibited: true,
        evaluation_nature: 'IPSATIVE',
        enforced: true
      },
      tenant_isolation: {
        fail_closed_error_codes: [
          ZERO_TRUST_ERRORS.TENANT_ISOLATION_VIOLATION,
          ZERO_TRUST_ERRORS.ROLE_ACCESS_DENIED,
          ZERO_TRUST_ERRORS.CONTEXT_INVALID,
          ZERO_TRUST_ERRORS.POLICY_REQUIRED
        ],
        enforced: true
      }
    }
  };

  // بررسی قطعی عدم وجود رتبه‌بندی رقابتی در شناسنامه
  assertNoZeroRanking(snapshot);

  return deepFreeze(snapshot);
}

/**
 * انجماد عمیق اشیا جهت تضمین ۱۰۰٪ ایمنی در برابر جهش داده‌ها (Deep Freeze)
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

module.exports = {
  ZERO_TRUST_ERRORS,
  POLICY_DECISIONS,
  PROHIBITED_RANKING_TERMS,
  VALID_ROLES,
  createZeroTrustError,
  assertNoZeroRanking,
  verifyIdentity,
  evaluateSecurityPolicy,
  checkSessionProtection,
  enforceAccessBoundary,
  buildSecurityHealthSnapshot,
  deepFreeze
};
