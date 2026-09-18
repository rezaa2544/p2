/**
 * National Operations Center Unit Test Suite
 * Phase 5 Step 4 (P2-NI-02): National Production Readiness
 */

'use strict';

const assert = require('assert');
const {
  NOC_STATES,
  INCIDENT_SEVERITY,
  INCIDENT_STATUS,
  NOC_ERRORS,
  transitionNocState,
  recordNocIncident,
  getNocIncidents,
  resolveNocIncident,
  getNationalOperationsCenterSnapshot,
  resetNocStateForTests
} = require('../../../../server/operations/national-operations-center');

function runOperationsCenterTests() {
  resetNocStateForTests();

  // 1. Initial snapshot check
  const initialSnapshot = getNationalOperationsCenterSnapshot();
  assert.strictEqual(initialSnapshot.noc_state, NOC_STATES.NORMAL);
  assert.strictEqual(initialSnapshot.sovereign_governance.single_source_of_truth, 'PostgreSQL');
  assert.strictEqual(initialSnapshot.sovereign_governance.zero_ranking_guarantee, true);
  assert.strictEqual(initialSnapshot.regions_overview.total_regions, 7);

  // 2. Automated state transition rejected
  assert.throws(() => {
    transitionNocState(NOC_STATES.WARNING, {
      automated_decision: true,
      operator_id: 'auto-bot'
    });
  }, (err) => {
    return err.code === NOC_ERRORS.AUTOMATED_FORBIDDEN;
  }, 'Automated state change must fail closed');

  // 3. Missing approval fields rejected
  assert.throws(() => {
    transitionNocState(NOC_STATES.WARNING, {
      operator_id: 'op-01' // missing approval_id, timestamp, reason
    });
  }, (err) => {
    return err.code === NOC_ERRORS.APPROVAL_REQUIRED;
  }, 'Missing approval attributes must be rejected');

  // 4. Authorized human transition
  const transitionReceipt = transitionNocState(NOC_STATES.WARNING, {
    operator_id: 'op-101',
    approval_id: 'appv-noc-1',
    timestamp: new Date().toISOString(),
    reason: 'Simulated network jitter on Tabriz cluster'
  });
  assert.strictEqual(transitionReceipt.from_state, NOC_STATES.NORMAL);
  assert.strictEqual(transitionReceipt.to_state, NOC_STATES.WARNING);

  const snapshotAfterTransition = getNationalOperationsCenterSnapshot();
  assert.strictEqual(snapshotAfterTransition.noc_state, NOC_STATES.WARNING);
  assert.strictEqual(snapshotAfterTransition.transition_audit_log.length, 1);

  // 5. Incident lifecycle
  const incidentReceipt = recordNocIncident({
    incident_id: 'INC-2026-001',
    title: 'High latency detected in Border-West region',
    severity: INCIDENT_SEVERITY.P2_HIGH,
    region_id: 'ir-border-west-1'
  }, {
    operator_id: 'op-101',
    approval_id: 'appv-inc-1',
    timestamp: new Date().toISOString(),
    reason: 'Alert trigger response'
  });
  assert.strictEqual(incidentReceipt.incident_id, 'INC-2026-001');
  assert.strictEqual(incidentReceipt.status, INCIDENT_STATUS.OPEN);

  const activeIncidents = getNocIncidents();
  assert.strictEqual(activeIncidents.length, 1);

  // 6. Resolve incident
  const resolvedReceipt = resolveNocIncident('INC-2026-001', {
    summary: 'Rerouted transit links via Isfahan peering'
  }, {
    operator_id: 'op-101',
    approval_id: 'appv-res-1',
    timestamp: new Date().toISOString(),
    reason: 'Mitigation applied'
  });
  assert.strictEqual(resolvedReceipt.status, INCIDENT_STATUS.RESOLVED);

  // 7. Zero ranking guard
  assert.throws(() => {
    getNationalOperationsCenterSnapshot({
      ranking_score: 99
    });
  }, (err) => {
    return err.code === 'ZERO_RANKING_VIOLATION';
  }, 'Zero ranking violation must be enforced');

  resetNocStateForTests();
  return { suite: 'operations-center', passed: 7 };
}

if (require.main === module) {
  const res = runOperationsCenterTests();
  console.log(`✅ operations-center.test.js: ${res.passed}/7 passed`);
}

module.exports = { runOperationsCenterTests };
