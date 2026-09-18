/**
 * Real Load Harness Execution Test Suite
 * Phase 5 Step 5 (P2-NI-03): National Production Fabric Validation
 */

'use strict';

const assert = require('assert');
const {
  executeLiveLoadHarness,
  LOAD_SCENARIOS,
  LOAD_EXECUTION_MODES,
  LOAD_SIMULATION_ERRORS
} = require('../../../../server/infrastructure/national-load-testing');

function runLoadHarnessTests() {
  // 1. Execute live harness
  const liveResult = executeLiveLoadHarness(LOAD_SCENARIOS.SCENARIO_A_1M, {
    sample_count: 300,
    concurrency: 5
  });

  assert.strictEqual(liveResult.execution_mode, LOAD_EXECUTION_MODES.MEASURED);
  assert.strictEqual(liveResult.measurement_status, 'EMPIRICAL_MEASUREMENT');
  assert.strictEqual(liveResult.is_measured, true);
  assert.ok(liveResult.benchmark_parameters.duration_ms > 0);
  assert.strictEqual(liveResult.benchmark_parameters.samples_executed, 300);

  // 2. Metrics measured
  const tel = liveResult.measured_telemetry;
  assert.ok(tel.achieved_rps > 0);
  assert.ok(tel.p50_latency_ms >= 0);
  assert.ok(tel.p95_latency_ms >= 0);
  assert.ok(tel.p99_latency_ms >= 0);
  assert.ok(tel.error_rate_percent >= 0);

  // 3. Resource consumption recorded
  const res = liveResult.resource_consumption;
  assert.ok(res.memory_rss_mb > 0);
  assert.ok(res.heap_used_mb > 0);

  // 4. Auto-scaling forbidden
  assert.throws(() => {
    executeLiveLoadHarness(LOAD_SCENARIOS.SCENARIO_A_1M, {
      auto_scale: true
    });
  }, (err) => {
    return err.code === LOAD_SIMULATION_ERRORS.AUTOSCALE_FORBIDDEN;
  }, 'Auto-scaling execution must be forbidden');

  return { suite: 'load-harness', passed: 4 };
}

if (require.main === module) {
  const res = runLoadHarnessTests();
  console.log(`✅ load-harness.test.js: ${res.passed}/4 passed`);
}

module.exports = { runLoadHarnessTests };
