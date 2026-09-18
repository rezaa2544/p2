/**
 * تست اعتبارسنجی هویت، نقش و نشست در مدل Zero Trust (P1-SC-06)
 */
'use strict';

const assert = require('assert');
const {
  verifyIdentity,
  ZERO_TRUST_ERRORS
} = require('../../../server/security/zero-trust-runtime');

function runIdentityVerificationTests() {
  console.log('▸ تست ۱: اعتبارسنجی جامع هویت، نقش و توکن Zero Trust (identity-verification)');

  // ۱. کاربر معتبر با نقش و مستأجر مشخص
  const validManager = { id: 101, role: 'manager', school_id: 1 };
  const validSession = { expires_at: Math.floor(Date.now() / 1000) + 3600, revoked: false };
  const validToken = { iat: Math.floor(Date.now() / 1000) - 60 };

  const res1 = verifyIdentity({ user: validManager, session: validSession, token: validToken });
  assert.strictEqual(res1.valid, true);
  assert.strictEqual(res1.identity.user_id, 101);
  assert.strictEqual(res1.identity.role, 'manager');
  assert.strictEqual(res1.identity.school_id, 1);
  assert.strictEqual(res1.requires_human_approval, true);

  // ۲. کاربر فاقد شیء هویتی
  const res2 = verifyIdentity({ user: null });
  assert.strictEqual(res2.valid, false);
  assert.strictEqual(res2.error_code, ZERO_TRUST_ERRORS.CONTEXT_INVALID);

  // ۳. کاربر با شناسه نامعتبر
  const res3 = verifyIdentity({ user: { id: -5, role: 'manager', school_id: 1 } });
  assert.strictEqual(res3.valid, false);
  assert.strictEqual(res3.error_code, ZERO_TRUST_ERRORS.CONTEXT_INVALID);

  // ۴. کاربر با نقش ناشناخته و نامعتبر
  const res4 = verifyIdentity({ user: { id: 10, role: 'hacker', school_id: 1 } });
  assert.strictEqual(res4.valid, false);
  assert.strictEqual(res4.error_code, ZERO_TRUST_ERRORS.ROLE_ACCESS_DENIED);

  // ۵. کاربر مدرسه‌ای بدون شناسه مدرسه (نقض ایزولاسیون مستأجر)
  const res5 = verifyIdentity({ user: { id: 20, role: 'teacher', school_id: null } });
  assert.strictEqual(res5.valid, false);
  assert.strictEqual(res5.error_code, ZERO_TRUST_ERRORS.TENANT_ISOLATION_VIOLATION);

  // ۶. سوپرادمین بدون مدرسه مجاز است
  const res6 = verifyIdentity({ user: { id: 1, role: 'superadmin', school_id: null } });
  assert.strictEqual(res6.valid, true);
  assert.strictEqual(res6.identity.role, 'superadmin');

  // ۷. نشست منقضی شده
  const expiredSession = { expires_at: Math.floor(Date.now() / 1000) - 100, revoked: false };
  const res7 = verifyIdentity({ user: validManager, session: expiredSession });
  assert.strictEqual(res7.valid, false);
  assert.strictEqual(res7.reason, 'SESSION_EXPIRED');

  // ۸. نشست ابطال شده
  const revokedSession = { expires_at: Math.floor(Date.now() / 1000) + 3600, revoked: true };
  const res8 = verifyIdentity({ user: validManager, session: revokedSession });
  assert.strictEqual(res8.valid, false);
  assert.strictEqual(res8.reason, 'SESSION_REVOKED');

  // ۹. توکن بیش از حد کهنه (Stale Token)
  const staleToken = { iat: Math.floor(Date.now() / 1000) - 100000 };
  const res9 = verifyIdentity({ user: validManager, token: staleToken });
  assert.strictEqual(res9.valid, false);
  assert.strictEqual(res9.reason, 'TOKEN_STALE');

  console.log('  ✅ اعتبارسنجی هویت، نقش، مستأجر و نشست‌ها با موفقیت تایید شد');
}

if (require.main === module) {
  runIdentityVerificationTests();
}

module.exports = { runIdentityVerificationTests };
