/**
 * آزمون ۸: آزمون قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت در ۱۰ اجرای متوالی
 */

'use strict';

const assert = require('assert');
const {
  calculateAITransparencyScore,
  auditHumanApprovalCompliance,
  recordGovernanceAuditEvent,
  analyzeInsightLifecycle,
  generateGovernanceAlerts,
  buildGovernanceSnapshot,
  buildDistrictGovernanceOverview
} = require('../../../server/analytics/intelligence-governance-dashboard');

function runTests() {
  console.log('▸ تست ۸: آزمون قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت (Deterministic 10-Execution)');

  const mockActions = [
    { action_id: 'ACT-01', decision: 'APPROVED', status: 'COMPLETED', automated_decision: false, requires_human_confirmation: true }
  ];

  let firstTransparency = null;
  let firstAudit = null;
  let firstEvent = null;
  let firstLifecycle = null;
  let firstAlerts = null;
  let firstSnapshot = null;
  let firstDistrict = null;

  for (let i = 0; i < 10; i++) {
    const transparency = calculateAITransparencyScore({
      explainability: 90,
      evidenceAvailability: 85,
      humanApprovalRate: 95,
      auditCoverage: 90,
      privacyCompliance: 100
    }, { timestamp: '2026-09-18T12:00:00.000Z' });

    const audit = auditHumanApprovalCompliance(mockActions, { timestamp: '2026-09-18T12:00:00.000Z' });

    const event = recordGovernanceAuditEvent({
      actor_id: 'usr-01',
      action_type: 'ACTION_APPROVAL',
      entity_id: 'REC-01',
      reason: 'تأیید اقدام'
    }, { timestamp: '2026-09-18T12:00:00.000Z' });

    const lifecycle = analyzeInsightLifecycle([
      { insight_id: 'INS-01', evidence: ['E1'], action_recommended: true }
    ], { timestamp: '2026-09-18T12:00:00.000Z' });

    const alerts = generateGovernanceAlerts({
      school_id: 101,
      violations_detected: 0,
      approval_rate_pct: 85.0
    }, { timestamp: '2026-09-18T12:00:00.000Z' });

    const snapshot = buildGovernanceSnapshot({
      schoolId: 101,
      regionId: 1,
      data: { actions: mockActions },
      options: { timestamp: '2026-09-18T12:00:00.000Z' }
    });

    const district = buildDistrictGovernanceOverview({
      regionId: 1,
      schoolSnapshots: [snapshot],
      options: { timestamp: '2026-09-18T12:00:00.000Z' }
    });

    const sTransparency = JSON.stringify(transparency);
    const sAudit = JSON.stringify(audit);
    const sEvent = JSON.stringify(event);
    const sLifecycle = JSON.stringify(lifecycle);
    const sAlerts = JSON.stringify(alerts);
    const sSnapshot = JSON.stringify(snapshot);
    const sDistrict = JSON.stringify(district);

    if (i === 0) {
      firstTransparency = sTransparency;
      firstAudit = sAudit;
      firstEvent = sEvent;
      firstLifecycle = sLifecycle;
      firstAlerts = sAlerts;
      firstSnapshot = sSnapshot;
      firstDistrict = sDistrict;
    } else {
      assert.strictEqual(sTransparency, firstTransparency, `عدم تطابق قطعیت در calculateAITransparencyScore در تکرار ${i}`);
      assert.strictEqual(sAudit, firstAudit, `عدم تطابق قطعیت در auditHumanApprovalCompliance در تکرار ${i}`);
      assert.strictEqual(sEvent, firstEvent, `عدم تطابق قطعیت در recordGovernanceAuditEvent در تکرار ${i}`);
      assert.strictEqual(sLifecycle, firstLifecycle, `عدم تطابق قطعیت در analyzeInsightLifecycle در تکرار ${i}`);
      assert.strictEqual(sAlerts, firstAlerts, `عدم تطابق قطعیت در generateGovernanceAlerts در تکرار ${i}`);
      assert.strictEqual(sSnapshot, firstSnapshot, `عدم تطابق قطعیت در buildGovernanceSnapshot در تکرار ${i}`);
      assert.strictEqual(sDistrict, firstDistrict, `عدم تطابق قطعیت در buildDistrictGovernanceOverview در تکرار ${i}`);
    }
  }

  console.log('  ✅ قطعیت جبری ۱۰۰٪ و برابری باینری تمامی توابع در ۱۰ تکرار متوالی اثبات شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
