/**
 * تست قطعیت جبری و انجماد عمیق داده‌ها در Zero Trust (P1-SC-06)
 */
'use strict';

const assert = require('assert');
const {
  verifyIdentity,
  evaluateSecurityPolicy,
  checkSessionProtection,
  buildSecurityHealthSnapshot
} = require('../../../server/security/zero-trust-runtime');
const { evaluateCompliance } = require('../../../server/security/compliance-enforcement');

function runDeterministicTests() {
  console.log('▸ تست ۱۰: قطعیت جبری ۱۰۰٪ و ایمنی در برابر جهش داده‌ها در Zero Trust (deterministic)');

  const user = { id: 10, role: 'manager', school_id: 101 };
  const session = { id: 's1', expires_at: Math.floor(Date.now() / 1000) + 3600, revoked: false };

  // ۱. انجماد عمیق شناسنامه سلامت امنیت
  const snapshot = buildSecurityHealthSnapshot({ schoolId: 101, user: { id: 1, role: 'superadmin' } });
  assert(Object.isFrozen(snapshot));
  assert(Object.isFrozen(snapshot.zero_trust));
  assert(Object.isFrozen(snapshot.governance));
  assert(Object.isFrozen(snapshot.governance_and_invariants));

  assert.throws(() => {
    snapshot.security_status = 'MUTATED';
  }, /TypeError/);

  assert.throws(() => {
    snapshot.zero_trust.enabled = false;
  }, /TypeError/);

  // ۲. انجماد گزارش انطباق‌پذیری
  const compReport = evaluateCompliance({ schoolId: 101 });
  assert(Object.isFrozen(compReport));
  assert.throws(() => {
    compReport.compliance_status = 'MUTATED';
  }, /TypeError/);

  // ۳. بررسی قطعیت محاسبات در ۱۰ تکرار متوالی
  for (let i = 0; i < 10; i++) {
    const v = verifyIdentity({ user, session });
    const p = evaluateSecurityPolicy({ user, tenant: 101, resource: 'USER', action: 'USER_READ' });
    const s = checkSessionProtection({ session, clientInfo: { ip: '127.0.0.1' } });

    assert.strictEqual(v.valid, true);
    assert.strictEqual(p.decision, 'ALLOW');
    assert.strictEqual(s.protected, true);
  }

  console.log('  ✅ انجماد عمیق و قطعیت جبری ۱۰۰٪ در ۱۰ اجرای متوالی تایید شد');
}

if (require.main === module) {
  runDeterministicTests();
}

module.exports = { runDeterministicTests };
