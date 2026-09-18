/**
 * National Load Simulation Unit Test Suite
 * Phase 5 Step 4 (P2-NI-02): National Production Readiness
 */

'use strict';

const assert = require('assert');
const {
  LOAD_SCENARIOS,
  LOAD_SIMULATION_ERRORS,
  runNationalLoadSimulation,
  getNationalLoadTestingSuite
} = require('../../../../server/infrastructure/national-load-testing');

function runLoadTestingTests() {
  // 1. Scenario A (1M users)
  const reportA = runNationalLoadSimulation(LOAD_SCENARIOS.SCENARIO_A_1M);
  assert.strictEqual(reportA.scenario_id, 'SCENARIO_A_1M');
  assert.strictEqual(reportA.target_profile.registered_users, 1000000);
  assert.strictEqual(reportA.target_profile.target_rps, 2000);
  assert.ok(reportA.achieved_telemetry.achieved_rps >= 2000);
  assert.ok(reportA.achieved_telemetry.p95_latency_ms <= 300);
  assert.ok(reportA.achieved_telemetry.error_rate_percent < 0.1);

  // 2. Scenario B (5M users)
  const reportB = runNationalLoadSimulation(LOAD_SCENARIOS.SCENARIO_B_5M);
  assert.strictEqual(reportB.scenario_id, 'SCENARIO_B_5M');
  assert.strictEqual(reportB.target_profile.registered_users, 5000000);
  assert.strictEqual(reportB.target_profile.target_rps, 10000);
  assert.ok(reportB.achieved_telemetry.achieved_rps >= 9900);
  assert.ok(reportB.achieved_telemetry.p95_latency_ms <= 300);

  // 3. Scenario C (10M users full national scale)
  const reportC = runNationalLoadSimulation(LOAD_SCENARIOS.SCENARIO_C_10M);
  assert.strictEqual(reportC.scenario_id, 'SCENARIO_C_10M');
  assert.strictEqual(reportC.target_profile.registered_users, 10000000);
  assert.strictEqual(reportC.target_profile.concurrent_users, 2500000);
  assert.strictEqual(reportC.target_profile.target_rps, 20000);
  assert.ok(reportC.achieved_telemetry.db_active_connections <= 3500);
  assert.strictEqual(reportC.slo_evaluation.overall_compliant, true);

  // 4. Auto-scaling execution forbidden
  assert.throws(() => {
    runNationalLoadSimulation(LOAD_SCENARIOS.SCENARIO_C_10M, {
      auto_scale: true
    });
  }, (err) => {
    return err.code === LOAD_SIMULATION_ERRORS.AUTOSCALE_FORBIDDEN;
  }, 'Auto-scaling must be strictly forbidden during load testing');

  // 5. Suite aggregation
  const suite = getNationalLoadTestingSuite();
  assert.strictEqual(suite.total_scenarios, 3);
  assert.strictEqual(suite.overall_readiness, 'READY');

  // 6. Zero ranking guard
  assert.throws(() => {
    runNationalLoadSimulation(LOAD_SCENARIOS.SCENARIO_A_1M, {
      top_school: 'school-1'
    });
  }, (err) => {
    return err.code === 'ZERO_RANKING_VIOLATION' || err.message.includes('ZERO_RANKING_VIOLATION');
  }, 'Zero ranking keywords must be rejected');

  return { suite: 'load-testing', passed: 6 };
}

if (require.main === module) {
  const res = runLoadTestingTests();
  console.log(`✅ load-testing.test.js: ${res.passed}/6 passed`);
}

module.exports = { runLoadTestingTests };
