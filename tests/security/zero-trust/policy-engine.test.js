/**
 * تست موتور ارزیابی خط‌مشی‌های امنیتی (Policy Decision Engine - P1-SC-06)
 */
'use strict';

const assert = require('assert');
const {
  evaluateSecurityPolicy,
  POLICY_DECISIONS,
  ZERO_TRUST_ERRORS
} = require('../../../server/security/zero-trust-runtime');

function runPolicyEngineTests() {
  console.log('▸ تست ۲: موتور ارزیابی خط‌مشی‌های امنیتی (policy-engine)');

  const manager = { id: 10, role: 'manager', school_id: 1 };
  const teacher = { id: 20, role: 'teacher', school_id: 1 };
  const student = { id: 30, role: 'student', school_id: 1 };

  // ۱. درخواست مجاز مدیر در مدرسه خود
  const eval1 = evaluateSecurityPolicy({
    user: manager,
    tenant: 1,
    resource: 'USER',
    action: 'USER_READ'
  });
  assert.strictEqual(eval1.decision, POLICY_DECISIONS.ALLOW);
  assert.strictEqual(eval1.requires_human_approval, true);
  assert.ok(eval1.policy_id.startsWith('POL-USER-USER_READ-'));

  // ۲. نقض مرز مستأجر (مستأجر هدف متفاوت است)
  const eval2 = evaluateSecurityPolicy({
    user: manager,
    tenant: 2,
    resource: 'USER',
    action: 'USER_READ'
  });
  assert.strictEqual(eval2.decision, POLICY_DECISIONS.DENY);
  assert.strictEqual(eval2.error_code, ZERO_TRUST_ERRORS.TENANT_ISOLATION_VIOLATION);

  // ۳. نقض نقش سازمانی (دانش‌آموز به عملیات ثبت نمره)
  const eval3 = evaluateSecurityPolicy({
    user: student,
    tenant: 1,
    resource: 'GRADES',
    action: 'GRADES_WRITE'
  });
  assert.strictEqual(eval3.decision, POLICY_DECISIONS.DENY);
  assert.strictEqual(eval3.error_code, ZERO_TRUST_ERRORS.ROLE_ACCESS_DENIED);

  // ۴. اقدام حساس با ریسک بحرانی (باید REVIEW باشد)
  const eval4 = evaluateSecurityPolicy({
    user: manager,
    tenant: 1,
    resource: 'SECURITY',
    action: 'BULK_USER_EXPORT'
  });
  assert.strictEqual(eval4.decision, POLICY_DECISIONS.REVIEW);
  assert.strictEqual(eval4.requires_human_approval, true);

  // ۵. ورودی ناقص که باید خطا پرتاب کند
  assert.throws(() => {
    evaluateSecurityPolicy({ user: null, resource: 'USER', action: 'READ' });
  }, (err) => {
    return err.code === ZERO_TRUST_ERRORS.POLICY_REQUIRED;
  });

  console.log('  ✅ موتور ارزیابی خط‌مشی‌های امنیتی (ALLOW, DENY, REVIEW) تایید شد');
}

if (require.main === module) {
  runPolicyEngineTests();
}

module.exports = { runPolicyEngineTests };
