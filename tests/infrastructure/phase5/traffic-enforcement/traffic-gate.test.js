/**
 * Traffic Gate Enforcement Test Suite
 * Phase 5 Step 5 (P2-NI-03): National Production Fabric Validation
 */

'use strict';

const assert = require('assert');
const {
  updateNationalTrafficWeight,
  getNationalTrafficFabricTopology,
  ALLOWED_TRAFFIC_WEIGHTS,
  TRAFFIC_FABRIC_ERRORS
} = require('../../../../server/infrastructure/national-traffic-fabric');
const { updateNationalRegionState } = require('../../../../server/infrastructure/national-region-control-plane');

function runTrafficGateTests() {
  const approval = {
    approved: true,
    requires_human_approval: true,
    operator: { id: 'admin-lead', role: 'admin' }
  };

  // 1. Valid weight updates from allowed set [0, 5, 10, 25, 50, 100]
  for (const w of ALLOWED_TRAFFIC_WEIGHTS) {
    const updated = updateNationalTrafficWeight('ir-tehran-1', w, approval);
    assert.strictEqual(updated.allocated_weight, w);
  }

  // 2. Disallowed weight (e.g. 15, 33, 75) must be rejected
  assert.throws(() => {
    updateNationalTrafficWeight('ir-tehran-1', 15, approval);
  }, (err) => {
    return err.code === TRAFFIC_FABRIC_ERRORS.INVALID_WEIGHT;
  }, 'Disallowed traffic weight must be rejected');

  // 3. Automated weight change rejected
  assert.throws(() => {
    updateNationalTrafficWeight('ir-tehran-1', 50, {
      approved: true,
      automated_execution: true,
      operator: { id: 'admin-lead', role: 'admin' }
    });
  }, (err) => {
    return err.code === TRAFFIC_FABRIC_ERRORS.APPROVAL_REQUIRED;
  }, 'Automated traffic weight update must be rejected');

  // 4. Maintenance / Degraded state blocks traffic routing
  updateNationalRegionState('ir-border-west-1', 'MAINTENANCE', {
    approved: true,
    requires_human_approval: true,
    operator: { id: 'super-1', role: 'superadmin' }
  });

  assert.throws(() => {
    updateNationalTrafficWeight('ir-border-west-1', 50, approval);
  }, (err) => {
    return err.code === TRAFFIC_FABRIC_ERRORS.HARDENED_GATE_BREACH;
  }, 'Routing traffic to region in MAINTENANCE must fail closed');

  // Restore region
  updateNationalRegionState('ir-border-west-1', 'READY', {
    approved: true,
    requires_human_approval: true,
    operator: { id: 'super-1', role: 'superadmin' }
  });

  // Restore tehran to 100
  updateNationalTrafficWeight('ir-tehran-1', 100, approval);

  return { suite: 'traffic-gate', passed: 4 };
}

if (require.main === module) {
  const res = runTrafficGateTests();
  console.log(`✅ traffic-gate.test.js: ${res.passed}/4 passed`);
}

module.exports = { runTrafficGateTests };
