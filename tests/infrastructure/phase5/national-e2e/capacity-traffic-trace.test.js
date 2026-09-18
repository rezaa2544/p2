/**
 * Capacity & Traffic Fabric Architectural Trace Suite
 * Phase 5 Step 6 (P2-NI-04): National Production Simulation & Cross-Phase Hardening
 *
 * Empirically audits whether capacity gates and traffic weights are:
 *  - ACTUALLY WIRED to HTTP ingress middleware
 *  - EXECUTABLE
 *  - ENFORCED
 *  - Or STATIC GATE ONLY / UNWIRED from live request flows
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assertNationalCapacityEnforcement, NATIONAL_LIMITS } = require('../../../../server/infrastructure/national-capacity-enforcement');
const { getNationalTrafficFabricTopology, updateNationalTrafficWeight } = require('../../../../server/infrastructure/national-traffic-fabric');

function runCapacityTrafficTraceTests() {
  let passed = 0;

  // 1. Audit Server Entrypoint (`server/index.js`) for Global Ingress Capacity Interceptor
  const serverIndexSrc = fs.readFileSync(path.join(__dirname, '../../../../server/index.js'), 'utf8');
  
  // Check if assertNationalCapacityEnforcement is called on general API requests (e.g. before /api/v1/students or /api/v1/grades)
  const isEnforcementInGlobalMiddleware = /assertNationalCapacityEnforcement\s*\(/.test(serverIndexSrc);
  
  // Traced outcome: It is defined and exposed at /api/v1/system/national/capacity, but NOT wired as a global request interceptor on business routes
  assert.strictEqual(
    isEnforcementInGlobalMiddleware,
    false,
    'Trace confirms: assertNationalCapacityEnforcement is NOT wired as a global HTTP middleware on /api/v1/* routes'
  );
  passed++;

  // 2. Audit Traffic Fabric Routing Mechanism
  // Check if updateNationalTrafficWeight routes actual HTTP sockets or updates in-memory topology state
  const topologyBefore = getNationalTrafficFabricTopology();
  assert(topologyBefore.topology['ir-tehran-1'], 'Tehran cluster must exist in topology');

  // Perform valid human-approved traffic weight update
  const updatedTopology = updateNationalTrafficWeight('ir-tehran-1', 25, {
    operator: { id: 'admin-1', role: 'admin' },
    approved: true,
    requires_human_approval: true,
    cluster_health: 'HEALTHY'
  });
  
  assert.strictEqual(updatedTopology.allocated_weight, 25, 'Topology state in memory updated');
  // Traced outcome: No reverse-proxy socket routing exists in server/index.js — this is an in-memory governance state (STATIC GATE)
  const hasProxyRouter = /http-proxy|reverseProxy|upstreamCluster/.test(serverIndexSrc);
  assert.strictEqual(hasProxyRouter, false, 'Trace confirms: traffic weights operate as governance metadata (STATIC GATE), not reverse proxy socket routing');
  passed++;

  // 3. Reset traffic weight back to 100 for cluster integrity
  updateNationalTrafficWeight('ir-tehran-1', 100, {
    operator: { id: 'admin-1', role: 'admin' },
    approved: true,
    requires_human_approval: true,
    cluster_health: 'HEALTHY'
  });
  passed++;

  // 4. Trace Human Approval Enforcement on Capacity Reservations
  const { createCapacityReservation } = require('../../../../server/infrastructure/national-capacity-enforcement');
  
  // Unapproved reservation attempt MUST fail-closed
  assert.throws(() => {
    createCapacityReservation({
      region_id: 'ir-isfahan-1',
      tenant_id: 'tenant-school-12',
      requested_capacity: { rps: 1000, concurrent_users: 50000 },
      approved: false, // Bypass attempt!
      reason: 'Automated scaling quota test'
    });
  }, (err) => {
    assert.strictEqual(err.code, 'PHASE5_RESERVATION_APPROVAL_REQUIRED', 'Must reject unapproved capacity reservation');
    return true;
  });
  passed++;

  return {
    suite: 'capacity-traffic-trace',
    findings: [
      {
        id: 'CAPACITY_GATE_UNWIRED_FROM_INGRESS',
        component: 'server/index.js',
        status: 'UNWIRED',
        description: 'assertNationalCapacityEnforcement is called on reservation mutations but not wired as an ingress middleware for business API routes'
      },
      {
        id: 'TRAFFIC_FABRIC_STATIC_GATE',
        component: 'server/infrastructure/national-traffic-fabric.js',
        status: 'STATIC GATE ONLY',
        description: 'Traffic weight state is maintained in-memory as governance metadata; socket-level reverse-proxy dispatch is not implemented in Node.js server'
      }
    ],
    passed
  };
}

if (require.main === module) {
  const res = runCapacityTrafficTraceTests();
  console.log(`✅ capacity-traffic-trace.test.js: ${res.passed}/4 passed`);
}

module.exports = {
  runCapacityTrafficTraceTests
};
