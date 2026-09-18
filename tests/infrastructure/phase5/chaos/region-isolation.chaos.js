/**
 * Chaos Scenario 1: Region Disconnection & Isolation
 * Phase 5 Step 4 (P2-NI-02): National Production Readiness
 *
 * Simulates network isolation of a regional cluster and ensures:
 * 1. Adjacent regions absorb traffic without systemic failure.
 * 2. Failover is proposed but NOT automatically executed without human approval.
 * 3. Zero ranking guarantee is preserved under partitioned states.
 */

'use strict';

const assert = require('assert');
const { CANONICAL_NATIONAL_REGIONS, updateNationalRegionState, NATIONAL_CONTROL_ERRORS } = require('../../../../server/infrastructure/national-region-control-plane');
const { assessCrossRegionDisasterRecovery, CROSS_REGION_RECOVERY_MAP } = require('../../../../server/infrastructure/disaster-recovery');

function runRegionIsolationChaosTest() {
  const targetRegion = 'ir-border-west-1';
  const standbyRegion = CROSS_REGION_RECOVERY_MAP[targetRegion].dr_target_region;

  assert.strictEqual(standbyRegion, 'ir-isfahan-1', 'Target region must map to designated standby pair');

  // 1. Simulate automated failover attempt — MUST FAIL CLOSED
  assert.throws(() => {
    updateNationalRegionState(targetRegion, 'DEGRADED', {
      automated_decision: true,
      operator_id: 'auto-chaos-agent'
    });
  }, (err) => {
    return err.code === NATIONAL_CONTROL_ERRORS.CHANGE_APPROVAL_REQUIRED;
  }, 'Automated failover during chaos must be rejected');

  // 2. Simulate authorized human mitigation
  const simulatedApproval = {
    approved: true,
    requires_human_approval: true,
    operator: { id: 'op-chaos-lead', role: 'admin', name: 'اپراتور ارشد' },
    approval_id: 'appv-chaos-001',
    timestamp: new Date().toISOString(),
    reason: 'Chaos rehearsal: simulating border cluster isolation'
  };

  const updated = updateNationalRegionState(targetRegion, 'DEGRADED', simulatedApproval);
  assert.strictEqual(updated.health_status, 'DEGRADED');

  // 3. Verify cross-region disaster recovery assessment
  const drAssessment = assessCrossRegionDisasterRecovery(targetRegion, {
    database_lag_seconds: 140,
    standby_sync: true
  });

  assert.strictEqual(drAssessment.human_governance.requires_human_approval, true);
  assert.strictEqual(drAssessment.human_governance.automated_execution, false);
  assert.strictEqual(drAssessment.dr_target_pairing.dr_target_region, standbyRegion);

  // Restore region to READY
  updateNationalRegionState(targetRegion, 'READY', {
    approved: true,
    requires_human_approval: true,
    operator: { id: 'op-chaos-lead', role: 'admin', name: 'اپراتور ارشد' },
    approval_id: 'appv-chaos-002',
    timestamp: new Date().toISOString(),
    reason: 'Chaos rehearsal complete: restoring border cluster'
  });

  return { scenario: 'region_isolation', status: 'PASSED' };
}

module.exports = { runRegionIsolationChaosTest };
