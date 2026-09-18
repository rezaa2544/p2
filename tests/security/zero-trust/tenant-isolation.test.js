/**
 * تست ایزولاسیون چندمستأجری و سقط Fail-Closed در Zero Trust (P1-SC-06)
 */
'use strict';

const assert = require('assert');
const {
  verifyIdentity,
  evaluateSecurityPolicy,
  enforceAccessBoundary,
  buildSecurityHealthSnapshot,
  ZERO_TRUST_ERRORS
} = require('../../../server/security/zero-trust-runtime');

function runTenantIsolationTests() {
  console.log('▸ تست ۷: تفکیک چندمستأجری و سقط شکست‌ایمن در Zero Trust (tenant-isolation)');

  const managerSchool1 = { id: 10, role: 'manager', school_id: 1 };
  const managerSchool2 = { id: 20, role: 'manager', school_id: 2 };

  // ۱. مدیر مدرسه ۱ نمی‌تواند منبع مدرسه ۲ را ارزیابی خط‌مشی کند
  const evalDeny = evaluateSecurityPolicy({
    user: managerSchool1,
    tenant: 2,
    resource: 'USER',
    action: 'USER_READ'
  });
  assert.strictEqual(evalDeny.decision, 'DENY');
  assert.strictEqual(evalDeny.error_code, ZERO_TRUST_ERRORS.TENANT_ISOLATION_VIOLATION);

  // ۲. مدیر مدرسه ۱ در enforceAccessBoundary برای مدرسه ۲ متوقف می‌شود
  assert.throws(() => {
    enforceAccessBoundary({ user: managerSchool1, targetSchoolId: 2, requiredRole: 'manager' });
  }, (err) => {
    return err.code === ZERO_TRUST_ERRORS.TENANT_ISOLATION_VIOLATION;
  });

  // ۳. کاربر با شناسه مدرسه نامعتبر سقط با TENANT_ISOLATION_VIOLATION می‌دهد
  assert.throws(() => {
    enforceAccessBoundary({
      user: { id: 15, role: 'teacher', school_id: null },
      targetSchoolId: 1
    });
  }, (err) => {
    return err.code === ZERO_TRUST_ERRORS.TENANT_ISOLATION_VIOLATION;
  });

  // ۴. دریافت شناسنامه سلامت مستأجر دیگر سقط با TENANT_ISOLATION_VIOLATION می‌دهد
  assert.throws(() => {
    buildSecurityHealthSnapshot({ schoolId: 2, user: managerSchool1 });
  }, (err) => {
    return err.code === ZERO_TRUST_ERRORS.TENANT_ISOLATION_VIOLATION;
  });

  // ۵. دسترسی مدیر به مدرسه خود با موفقیت انجام می‌شود
  const ownSnapshot = buildSecurityHealthSnapshot({ schoolId: 1, user: managerSchool1 });
  assert.strictEqual(ownSnapshot.school_id, 1);
  assert.strictEqual(ownSnapshot.security_status, 'HEALTHY');

  console.log('  ✅ تفکیک چندمستأجری و سقط Fail-Closed با کدهای رسمی تایید شد');
}

if (require.main === module) {
  runTenantIsolationTests();
}

module.exports = { runTenantIsolationTests };
