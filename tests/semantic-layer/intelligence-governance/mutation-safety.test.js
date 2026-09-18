/**
 * آزمون ۹: آزمون ایمنی در برابر جهش داده‌ها و فریز عمیق اشیا (deepFreeze Mutation Safety)
 */

'use strict';

const assert = require('assert');
const {
  calculateAITransparencyScore,
  auditHumanApprovalCompliance,
  recordGovernanceAuditEvent,
  generateGovernanceAlerts,
  buildGovernanceSnapshot,
  buildDistrictGovernanceOverview
} = require('../../../server/analytics/intelligence-governance-dashboard');

function runTests() {
  console.log('▸ تست ۹: آزمون ایمنی در برابر جهش داده‌ها و فریز عمیق اشیا (deepFreeze Mutation Safety)');

  const frozenInput = Object.freeze({
    explainability: 90,
    evidenceAvailability: 80,
    humanApprovalRate: 90,
    auditCoverage: 90,
    privacyCompliance: 100
  });

  const transparency = calculateAITransparencyScore(frozenInput);
  assert.ok(Object.isFrozen(transparency));
  assert.ok(Object.isFrozen(transparency.components));

  const frozenActions = Object.freeze([
    Object.freeze({
      action_id: 'ACT-FROZEN-01',
      decision: 'APPROVED',
      status: 'COMPLETED',
      automated_decision: false,
      requires_human_confirmation: true
    })
  ]);

  const audit = auditHumanApprovalCompliance(frozenActions);
  assert.ok(Object.isFrozen(audit));
  assert.ok(Object.isFrozen(audit.violations));

  const event = recordGovernanceAuditEvent(Object.freeze({
    actor_id: 'usr-01',
    reason: 'دلیل آزمون'
  }));
  assert.ok(Object.isFrozen(event));

  const alerts = generateGovernanceAlerts(Object.freeze({
    school_id: 101,
    violations_detected: 1
  }));
  assert.ok(Object.isFrozen(alerts));
  assert.ok(Object.isFrozen(alerts[0]));

  const snapshot = buildGovernanceSnapshot({
    schoolId: 101,
    regionId: 1,
    data: Object.freeze({ actions: frozenActions })
  });
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.transparency_score));
  assert.ok(Object.isFrozen(snapshot.human_control_metrics));
  assert.ok(Object.isFrozen(snapshot.intelligence_health));

  assert.throws(() => {
    snapshot.transparency_score.score = 999;
  }, /TypeError/);

  const district = buildDistrictGovernanceOverview({
    regionId: 1,
    schoolSnapshots: Object.freeze([snapshot])
  });
  assert.ok(Object.isFrozen(district));
  assert.ok(Object.isFrozen(district.district_averages));

  console.log('  ✅ ایمنی کامل در برابر جهش غیرمجاز و انجماد عمیق تمامی ساختارها تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
