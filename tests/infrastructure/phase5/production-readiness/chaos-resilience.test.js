/**
 * Chaos & Resilience Master Suite
 * Phase 5 Step 4 (P2-NI-02): National Production Readiness
 */

'use strict';

const assert = require('assert');
const { runAllChaosScenarios } = require('../chaos/index');

function runChaosResilienceTests() {
  const results = runAllChaosScenarios();
  assert.strictEqual(results.length, 5, 'Must run all 5 chaos scenarios');

  results.forEach((res) => {
    assert.strictEqual(res.status, 'PASSED', `Chaos scenario ${res.scenario} must pass without automated failover`);
  });

  return { suite: 'chaos-resilience', passed: results.length };
}

if (require.main === module) {
  const res = runChaosResilienceTests();
  console.log(`✅ chaos-resilience.test.js: ${res.passed}/5 passed`);
}

module.exports = { runChaosResilienceTests };
