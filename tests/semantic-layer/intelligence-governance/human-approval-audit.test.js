/**
 * آزمون ۳: ممیزی انطباق نظارت انسانی و کشف تخلفات (auditHumanApprovalCompliance)
 */

'use strict';

const assert = require('assert');
const {
  auditHumanApprovalCompliance
} = require('../../../server/analytics/intelligence-governance-dashboard');

function runTests() {
  console.log('▸ تست ۳: ممیزی انطباق نظارت انسانی و کشف تخلفات (auditHumanApprovalCompliance)');

  const compliantActions = [
    {
      action_id: 'ACT-01',
      decision: 'APPROVED',
      status: 'COMPLETED',
      automated_decision: false,
      requires_human_confirmation: true,
      approval_time_hours: 4.0
    },
    {
      action_id: 'ACT-02',
      decision: 'MODIFIED',
      is_overridden: true,
      status: 'APPROVED',
      automated_decision: false,
      requires_human_confirmation: true,
      approval_time_hours: 8.0
    },
    {
      action_id: 'ACT-03',
      decision: 'REJECTED',
      status: 'CANCELLED',
      rejected_reason: 'MISDIAGNOSIS',
      automated_decision: false,
      requires_human_confirmation: true
    }
  ];

  const auditCompliant = auditHumanApprovalCompliance(compliantActions);
  assert.strictEqual(auditCompliant.total_actions, 3);
  assert.strictEqual(auditCompliant.approved_count, 2);
  assert.strictEqual(auditCompliant.override_count, 1);
  assert.strictEqual(auditCompliant.rejected_count, 1);
  assert.strictEqual(auditCompliant.approval_rate_pct, 66.7);
  assert.strictEqual(auditCompliant.override_rate_pct, 33.3);
  assert.strictEqual(auditCompliant.violations_detected, 0);
  assert.strictEqual(auditCompliant.compliance_status, 'COMPLIANT');

  // آزمون کشف تخلف بحرانی تصمیم‌گیری خودکار ماشینی
  const nonCompliantActions = [
    {
      action_id: 'ACT-ROGUE-01',
      automated_decision: true, // تخلف بحرانی
      requires_human_confirmation: false // تخلف بحرانی
    }
  ];

  const auditViolations = auditHumanApprovalCompliance(nonCompliantActions);
  assert.strictEqual(auditViolations.violations_detected, 1, 'باید دقیقاً یک تخلف ثبت شود');
  assert.strictEqual(auditViolations.compliance_status, 'NON_COMPLIANT');
  assert.strictEqual(auditViolations.violations[0].code, 'GOVERNANCE_POLICY_VIOLATION');
  assert.strictEqual(auditViolations.violations[0].severity, 'CRITICAL');

  console.log('  ✅ ممیزی نرخ تأیید انسانی، تعدیل و کشف تخلفات تصمیم خودکار با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
