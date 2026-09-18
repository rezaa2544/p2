/**
 * تست حاکمیت تصمیم انسانی در تمام لایه‌های امنیت Zero Trust (P1-SC-06)
 */
'use strict';

const assert = require('assert');
const {
  verifyIdentity,
  evaluateSecurityPolicy,
  checkSessionProtection,
  buildSecurityHealthSnapshot
} = require('../../../server/security/zero-trust-runtime');
const { recordSecurityEvent } = require('../../../server/security/security-audit-engine');
const { evaluateCompliance } = require('../../../server/security/compliance-enforcement');

function runHumanSovereigntyTests() {
  console.log('▸ تست ۸: پاسداری صلب از حاکمیت تصمیم انسانی در تمام لایه‌های Zero Trust (human-sovereignty)');

  // ۱. اعتبارسنجی هویت
  const idRes = verifyIdentity({ user: { id: 10, role: 'manager', school_id: 1 } });
  assert.strictEqual(idRes.requires_human_approval, true);

  // ۲. ارزیابی سیاست‌ها
  const polRes = evaluateSecurityPolicy({
    user: { id: 10, role: 'manager', school_id: 1 },
    resource: 'SECURITY',
    action: 'BULK_USER_EXPORT'
  });
  assert.strictEqual(polRes.decision, 'REVIEW');
  assert.strictEqual(polRes.requires_human_approval, true);

  // ۳. محافظت نشست‌ها (عدم مداخله و مسدودسازی خودکار)
  const sessRes = checkSessionProtection({
    session: { id: 's1', expires_at: 100 },
    clientInfo: { ip: '1.2.3.4' }
  });
  assert.strictEqual(sessRes.automated_remediation, false);
  assert.strictEqual(sessRes.requires_human_approval, true);

  // ۴. لاگ‌های ممیزی
  const auditRes = recordSecurityEvent({ event_type: 'AUTH_WARNING', action: 'TEST' });
  assert.strictEqual(auditRes.governance.human_decision_sovereignty, true);
  assert.strictEqual(auditRes.governance.requires_human_approval, true);

  // ۵. انطباق‌پذیری
  const compRes = evaluateCompliance();
  assert.strictEqual(compRes.governance_and_invariants.human_decision_sovereignty.automated_decision, false);
  assert.strictEqual(compRes.governance_and_invariants.human_decision_sovereignty.automated_execution, false);
  assert.strictEqual(compRes.governance_and_invariants.human_decision_sovereignty.requires_human_approval, true);

  // ۶. شناسنامه جامع سلامت امنیت
  const snap = buildSecurityHealthSnapshot({ schoolId: 1, user: { id: 1, role: 'superadmin' } });
  assert.strictEqual(snap.governance.human_decision_sovereignty, true);
  assert.strictEqual(snap.requires_human_approval, true);
  assert.strictEqual(snap.governance_and_invariants.human_decision_sovereignty.automated_decision, false);
  assert.strictEqual(snap.governance_and_invariants.human_decision_sovereignty.automated_execution, false);
  assert.strictEqual(snap.governance_and_invariants.human_decision_sovereignty.requires_human_approval, true);

  console.log('  ✅ رعایت ۱۰۰٪ حاکمیت تصمیم انسانی در تمام اجزای Zero Trust تایید شد');
}

if (require.main === module) {
  runHumanSovereigntyTests();
}

module.exports = { runHumanSovereigntyTests };
