/**
 * تست اعمال مرزهای دسترسی شکست‌ایمن (Boundary Enforcement - P1-SC-06)
 */
'use strict';

const assert = require('assert');
const {
  enforceAccessBoundary,
  ZERO_TRUST_ERRORS
} = require('../../../server/security/zero-trust-runtime');

function runBoundaryEnforcementTests() {
  console.log('▸ تست ۴: اعمال مرزهای دسترسی شکست‌ایمن (boundary-enforcement)');

  const manager = { id: 10, role: 'manager', school_id: 1 };
  const superadmin = { id: 1, role: 'superadmin' };

  // ۱. دسترسی مجاز مدیر به مدرسه خود
  assert.strictEqual(
    enforceAccessBoundary({ user: manager, targetSchoolId: 1, requiredRole: 'manager' }),
    true
  );

  // ۲. سقط شکست‌ایمن در صورت مغایرت مستأجر (مدرسه دیگر)
  assert.throws(() => {
    enforceAccessBoundary({ user: manager, targetSchoolId: 2, requiredRole: 'manager' });
  }, (err) => {
    return err.code === ZERO_TRUST_ERRORS.TENANT_ISOLATION_VIOLATION;
  });

  // ۳. سقط شکست‌ایمن در صورت عدم انطباق نقش
  assert.throws(() => {
    enforceAccessBoundary({ user: manager, targetSchoolId: 1, requiredRole: 'superadmin' });
  }, (err) => {
    return err.code === ZERO_TRUST_ERRORS.ROLE_ACCESS_DENIED;
  });

  // ۴. دسترسی سوپرادمین به هر مدرسه‌ای مجاز است
  assert.strictEqual(
    enforceAccessBoundary({ user: superadmin, targetSchoolId: 99, requiredRole: 'superadmin' }),
    true
  );

  // ۵. ورودی فاقد شیء کاربر سقط با خطای زمینه نامعتبر می‌دهد
  assert.throws(() => {
    enforceAccessBoundary({ user: null });
  }, (err) => {
    return err.code === ZERO_TRUST_ERRORS.CONTEXT_INVALID;
  });

  console.log('  ✅ اعمال مرزهای دسترسی و کدهای خطای رسمی Zero Trust تایید شد');
}

if (require.main === module) {
  runBoundaryEnforcementTests();
}

module.exports = { runBoundaryEnforcementTests };
