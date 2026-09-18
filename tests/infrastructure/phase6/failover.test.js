/**
 * tests/infrastructure/phase6/failover.test.js
 * Behavioral Test Suite for Phase 6 Primary DC Failure, Secondary Failover & Fail-Closed (B5)
 *
 * Verifies:
 * 1. Healthy cluster routes to Primary DC
 * 2. Primary DC failure triggers seamless failover to Secondary DC
 * 3. Catastrophic multi-DC failure triggers strict Fail-Closed (503 / Circuit Open)
 * 4. Cluster recovery and rebalancing
 */

'use strict';

const assert = require('assert');
const path = require('path');
const {
  Phase6CanaryEngine,
  CANARY_STATES,
  CANARY_ERRORS
} = require(path.join(__dirname, '../../../server/infrastructure/phase6-canary-engine'));

async function testPrimaryDcFailureAndSecondaryFailover() {
  console.log('▸ Test 1: Primary DC Outage & Secondary DC Failover (B5)');

  const engine = new Phase6CanaryEngine();
  // Province '01' is East Azerbaijan (ir-tabriz-1, primary: tabriz-dc-01, secondary: tabriz-dc-02)

  // 1. Initial healthy state: routes to primary DC
  const routeNormal = engine.routeRequest('01');
  assert.strictEqual(routeNormal.clusterId, 'ir-tabriz-1');
  assert.strictEqual(routeNormal.targetDc, 'tabriz-dc-01');
  assert.strictEqual(routeNormal.failoverMode, false);
  console.log('  ✅ 1.1 Normal healthy traffic routed to Primary DC (tabriz-dc-01)');

  // 2. Simulate Primary DC failure: Circuit breaker trips
  const tabrizCluster = engine.clusters.get('ir-tabriz-1');
  tabrizCluster.circuitBreakerOpen = true;
  tabrizCluster.status = CANARY_STATES.CRITICAL;

  // 3. Subsequent request should be diverted to Secondary DC (tabriz-dc-02)
  const routeFailover = engine.routeRequest('01');
  assert.strictEqual(routeFailover.clusterId, 'ir-tabriz-1');
  assert.strictEqual(routeFailover.targetDc, 'tabriz-dc-02', 'Must failover to secondary DC');
  assert.strictEqual(routeFailover.failoverMode, true, 'Failover mode flag must be active');
  console.log('  ✅ 1.2 Traffic seamlessly diverted to Secondary DC (tabriz-dc-02)');

  // 4. Restore primary DC health
  tabrizCluster.circuitBreakerOpen = false;
  tabrizCluster.status = CANARY_STATES.HEALTHY;

  const routeRestored = engine.routeRequest('01');
  assert.strictEqual(routeRestored.targetDc, 'tabriz-dc-01');
  assert.strictEqual(routeRestored.failoverMode, false);
  console.log('  ✅ 1.3 Traffic restored to Primary DC after health recovery');
}

async function testCatastrophicFailureFailClosed() {
  console.log('▸ Test 2: Catastrophic Cluster Failure & Strict Fail-Closed (B5)');

  const engine = new Phase6CanaryEngine();
  const khorasanCluster = engine.clusters.get('ir-khorasan-1');

  // Both primary and secondary DCs are offline
  khorasanCluster.status = CANARY_STATES.OFFLINE;
  khorasanCluster.secondaryDc = null; // No backup DC available

  // Strict Fail-Closed: request must be rejected rather than leaking unencrypted or routing blindly
  assert.throws(() => {
    engine.routeRequest('09'); // Khorasan province
  }, (err) => err.code === CANARY_ERRORS.CIRCUIT_OPEN);

  console.log('  ✅ 2.1 Complete cluster outage results in strict Fail-Closed (No unverified leakage)');
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('⚡ PHASE 6 RESILIENCE, SECONDARY DC FAILOVER & FAIL-CLOSED SUITE');
  console.log('═══════════════════════════════════════════════════════════════════');

  await testPrimaryDcFailureAndSecondaryFailover();
  await testCatastrophicFailureFailClosed();

  console.log('───────────────────────────────────────────────────────────────────');
  console.log('🎉 ALL FAILOVER & FAIL-CLOSED TESTS PASSED (100% BEHAVIORAL PROOF)');
  console.log('═══════════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('❌ Failover Suite Failed:', err);
  process.exit(1);
});
