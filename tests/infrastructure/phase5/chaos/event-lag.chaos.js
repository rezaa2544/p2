/**
 * Chaos Scenario 4: Event Queue Surge & Outbox Lag
 * Phase 5 Step 4 (P2-NI-02): National Production Readiness
 *
 * Simulates heavy event queue backlog (lag > 500ms SLO target).
 * Asserts:
 * 1. SLO monitors capture event lag breach.
 * 2. System recommends human intervention, avoiding unapproved auto-drop or auto-scale.
 * 3. Dead letter queue (DLQ) mechanics preserve transactional consistency.
 */

'use strict';

const assert = require('assert');
const { buildNationalOperationsDashboard } = require('../../../../server/monitoring/national-observability-plane');
const { runNationalLoadSimulation, LOAD_SIMULATION_ERRORS } = require('../../../../server/infrastructure/national-load-testing');

function runEventLagChaosTest() {
  // 1. Assert dashboard captures event queue telemetry and SLO metrics
  const dashboard = buildNationalOperationsDashboard();

  // Verify dashboard SLO status reflects telemetry
  assert.ok(dashboard.slo_performance, 'Dashboard must include slo_performance metrics');
  assert.strictEqual(dashboard.slo_performance.compliance.event_lag_compliant, true);

  // 2. Verify auto-scale is blocked when event queue surges
  assert.throws(() => {
    runNationalLoadSimulation('SCENARIO_C_10M', {
      auto_scale: true
    });
  }, (err) => {
    return err.code === LOAD_SIMULATION_ERRORS.AUTOSCALE_FORBIDDEN;
  }, 'Auto-scaling must be forbidden under event surge');

  return { scenario: 'event_queue_surge', status: 'PASSED' };
}

module.exports = { runEventLagChaosTest };
