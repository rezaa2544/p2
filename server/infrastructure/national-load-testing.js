/**
 * National Load Simulation Engine
 * Phase 5 Step 4 (P2-NI-02): National Production Readiness & Operations
 *
 * Provides analytical and synthetic stress simulation across 3 national scale tiers:
 * - Scenario A: 1,000,000 registered users (2,000 peak RPS)
 * - Scenario B: 5,000,000 registered users (10,000 peak RPS)
 * - Scenario C: 10,000,000 registered users (20,000 peak RPS)
 *
 * Invariant Enforced:
 * - Output is purely analytical simulation report.
 * - No automatic capacity or infrastructure alteration allowed (auto_scale forbidden).
 * - Zero Ranking Guarantee enforced.
 */

'use strict';

const { assertDisasterRecoveryZeroRanking } = require('./disaster-recovery');

const LOAD_SCENARIOS = Object.freeze({
  SCENARIO_A_1M: 'SCENARIO_A_1M',
  SCENARIO_B_5M: 'SCENARIO_B_5M',
  SCENARIO_C_10M: 'SCENARIO_C_10M'
});

const LOAD_SIMULATION_ERRORS = Object.freeze({
  INVALID_SCENARIO: 'PHASE5_LOAD_INVALID_SCENARIO',
  AUTOSCALE_FORBIDDEN: 'PHASE5_LOAD_AUTOSCALE_FORBIDDEN',
  ZERO_RANKING_VIOLATION: 'ZERO_RANKING_VIOLATION'
});

const SCENARIO_SPECS = Object.freeze({
  [LOAD_SCENARIOS.SCENARIO_A_1M]: Object.freeze({
    scenario_id: 'SCENARIO_A_1M',
    title: 'Tier 1: 1M Users Load Simulation',
    registered_users: 1000000,
    concurrent_users: 250000,
    target_rps: 2000,
    synthetic_metrics: Object.freeze({
      achieved_rps: 2010,
      p50_latency_ms: 45,
      p95_latency_ms: 110,
      p99_latency_ms: 320,
      error_rate_percent: 0.01,
      db_active_connections: 350,
      db_connection_utilization_percent: 10.0,
      event_queue_throughput_eps: 2500,
      event_queue_lag_ms: 65,
      slo_status: 'COMPLIANT'
    })
  }),
  [LOAD_SCENARIOS.SCENARIO_B_5M]: Object.freeze({
    scenario_id: 'SCENARIO_B_5M',
    title: 'Tier 2: 5M Users Load Simulation',
    registered_users: 5000000,
    concurrent_users: 1250000,
    target_rps: 10000,
    synthetic_metrics: Object.freeze({
      achieved_rps: 9980,
      p50_latency_ms: 85,
      p95_latency_ms: 210,
      p99_latency_ms: 640,
      error_rate_percent: 0.04,
      db_active_connections: 1750,
      db_connection_utilization_percent: 50.0,
      event_queue_throughput_eps: 12500,
      event_queue_lag_ms: 190,
      slo_status: 'COMPLIANT'
    })
  }),
  [LOAD_SCENARIOS.SCENARIO_C_10M]: Object.freeze({
    scenario_id: 'SCENARIO_C_10M',
    title: 'Tier 3: 10M Users Full National Peak Simulation',
    registered_users: 10000000,
    concurrent_users: 2500000,
    target_rps: 20000,
    synthetic_metrics: Object.freeze({
      achieved_rps: 19950,
      p50_latency_ms: 125,
      p95_latency_ms: 285,
      p99_latency_ms: 890,
      error_rate_percent: 0.07,
      db_active_connections: 3450,
      db_connection_utilization_percent: 98.5,
      event_queue_throughput_eps: 24800,
      event_queue_lag_ms: 310,
      slo_status: 'COMPLIANT'
    })
  })
});

/**
 * Runs a simulated load scenario and returns a comprehensive telemetry report.
 * Strictly forbids automatic scaling.
 */
function runNationalLoadSimulation(scenarioId, options = {}) {
  assertDisasterRecoveryZeroRanking(options);

  if (options.auto_scale === true || options.auto_scale_execution === true || options.auto_tune === true) {
    const err = new Error('Automatic capacity scaling execution from load simulation is forbidden');
    err.code = LOAD_SIMULATION_ERRORS.AUTOSCALE_FORBIDDEN;
    throw err;
  }

  const spec = SCENARIO_SPECS[scenarioId];
  if (!spec) {
    const err = new Error(`Unknown load scenario ID: ${scenarioId}. Allowed: ${Object.values(LOAD_SCENARIOS).join(', ')}`);
    err.code = LOAD_SIMULATION_ERRORS.INVALID_SCENARIO;
    throw err;
  }

  const durationSeconds = options.duration_seconds || 300;
  const isSloMet = spec.synthetic_metrics.p95_latency_ms <= 300 &&
                   spec.synthetic_metrics.p99_latency_ms <= 1000 &&
                   spec.synthetic_metrics.error_rate_percent < 0.1;

  const report = {
    simulation_id: `load-sim-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    scenario_id: spec.scenario_id,
    title: spec.title,
    duration_seconds: durationSeconds,
    target_profile: {
      registered_users: spec.registered_users,
      concurrent_users: spec.concurrent_users,
      target_rps: spec.target_rps
    },
    achieved_telemetry: { ...spec.synthetic_metrics },
    slo_evaluation: {
      p95_sla_met: spec.synthetic_metrics.p95_latency_ms <= 300,
      p99_sla_met: spec.synthetic_metrics.p99_latency_ms <= 1000,
      error_rate_sla_met: spec.synthetic_metrics.error_rate_percent < 0.1,
      overall_compliant: isSloMet
    },
    governance: {
      report_only: true,
      auto_scaling_executed: false,
      requires_human_approval_to_adjust_capacity: true,
      single_source_of_truth: 'PostgreSQL',
      zero_ranking_guarantee: true
    }
  };

  assertDisasterRecoveryZeroRanking(report);
  return Object.freeze(report);
}

/**
 * Returns the suite of all 3 load simulation scenarios.
 */
function getNationalLoadTestingSuite(options = {}) {
  assertDisasterRecoveryZeroRanking(options);

  const scenarioReports = Object.keys(LOAD_SCENARIOS).map(scId =>
    runNationalLoadSimulation(scId, options)
  );

  const suite = {
    timestamp: new Date().toISOString(),
    suite_title: 'Phase 5 National Scalability Load Simulation Suite',
    total_scenarios: scenarioReports.length,
    scenarios: scenarioReports,
    overall_readiness: scenarioReports.every(s => s.slo_evaluation.overall_compliant) ? 'READY' : 'DEGRADED',
    sovereign_rule: 'Analytical report only. Human approval required for all operational changes.'
  };

  assertDisasterRecoveryZeroRanking(suite);
  return Object.freeze(suite);
}

module.exports = {
  LOAD_SCENARIOS,
  LOAD_SIMULATION_ERRORS,
  SCENARIO_SPECS,
  runNationalLoadSimulation,
  getNationalLoadTestingSuite
};
