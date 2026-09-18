/**
 * Simulation vs Measured Separation Test Suite
 * Phase 5 Step 5 (P2-NI-03): National Production Fabric Validation
 */

'use strict';

const assert = require('assert');
const {
  runNationalLoadSimulation,
  executeLiveLoadHarness,
  getNationalLoadTestingSuite,
  LOAD_SCENARIOS,
  LOAD_EXECUTION_MODES
} = require('../../../../server/infrastructure/national-load-testing');

function runSimulationVsMeasuredTests() {
  // 1. Simulation produces synthetic model tag
  const sim = runNationalLoadSimulation(LOAD_SCENARIOS.SCENARIO_C_10M);
  assert.strictEqual(sim.execution_mode, LOAD_EXECUTION_MODES.SIMULATION);
  assert.strictEqual(sim.measurement_status, 'SYNTHETIC_MODEL');
  assert.strictEqual(sim.is_measured, false);
  assert.strictEqual(sim.achieved_telemetry.achieved_rps, 19950);

  // 2. Measured harness produces empirical measurement tag
  const measured = executeLiveLoadHarness(LOAD_SCENARIOS.SCENARIO_C_10M, { sample_count: 200 });
  assert.strictEqual(measured.execution_mode, LOAD_EXECUTION_MODES.MEASURED);
  assert.strictEqual(measured.measurement_status, 'EMPIRICAL_MEASUREMENT');
  assert.strictEqual(measured.is_measured, true);
  assert.ok(measured.benchmark_parameters.samples_executed === 200);

  // 3. Suite execution in MEASURED mode
  const measuredSuite = getNationalLoadTestingSuite({ mode: LOAD_EXECUTION_MODES.MEASURED, sample_count: 100 });
  assert.strictEqual(measuredSuite.execution_mode, LOAD_EXECUTION_MODES.MEASURED);
  assert.strictEqual(measuredSuite.measurement_status, 'EMPIRICAL_MEASUREMENT');
  assert.strictEqual(measuredSuite.total_scenarios, 3);
  assert.ok(measuredSuite.scenarios.every(s => s.is_measured === true));

  // 4. Suite execution in SIMULATION mode
  const simSuite = getNationalLoadTestingSuite({ mode: LOAD_EXECUTION_MODES.SIMULATION });
  assert.strictEqual(simSuite.execution_mode, LOAD_EXECUTION_MODES.SIMULATION);
  assert.strictEqual(simSuite.measurement_status, 'SYNTHETIC_MODEL');
  assert.ok(simSuite.scenarios.every(s => s.is_measured === false));

  return { suite: 'simulation-vs-measured', passed: 4 };
}

if (require.main === module) {
  const res = runSimulationVsMeasuredTests();
  console.log(`✅ simulation-vs-measured.test.js: ${res.passed}/4 passed`);
}

module.exports = { runSimulationVsMeasuredTests };
