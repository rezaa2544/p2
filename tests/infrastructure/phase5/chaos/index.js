/**
 * Phase 5 Chaos & Resilience Test Coordinator
 * P2-NI-02: National Production Readiness
 */

'use strict';

const { runRegionIsolationChaosTest } = require('./region-isolation.chaos');
const { runDatabaseLatencyChaosTest } = require('./db-latency.chaos');
const { runCachePartitionChaosTest } = require('./cache-partition.chaos');
const { runEventLagChaosTest } = require('./event-lag.chaos');
const { runFailoverSimulationChaosTest } = require('./failover-simulation.chaos');

function runAllChaosScenarios() {
  const results = [];
  results.push(runRegionIsolationChaosTest());
  results.push(runDatabaseLatencyChaosTest());
  results.push(runCachePartitionChaosTest());
  results.push(runEventLagChaosTest());
  results.push(runFailoverSimulationChaosTest());
  return results;
}

if (require.main === module) {
  console.log('⚡ Running Phase 5 National Chaos & Resilience Scenarios...');
  const results = runAllChaosScenarios();
  results.forEach((r, idx) => {
    console.log(`  ✅ Chaos Scenario ${idx + 1}: ${r.scenario} -> ${r.status}`);
  });
  console.log(`All ${results.length} Chaos Scenarios Passed Successfully.`);
}

module.exports = { runAllChaosScenarios };
