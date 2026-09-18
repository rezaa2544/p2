/**
 * آزمون ۹: آزمون ایمنی در برابر جهش داده‌ها و فریز عمیق اشیا (deepFreeze Mutation Safety)
 */

'use strict';

const assert = require('assert');
const {
  simulateEducationalPolicy,
  comparePolicyScenarios,
  evaluatePolicyImpact,
  buildPolicySimulationSnapshot
} = require('../../../server/analytics/policy-simulation-engine');

function runTests() {
  console.log('▸ تست ۹: آزمون ایمنی در برابر جهش داده‌ها و فریز عمیق اشیا (mutation-safety)');

  const frozenParams = Object.freeze({
    scenarioType: 'POLICY_INTERVENTION',
    policyFocus: 'ATTENDANCE_BOOST',
    baselineMetrics: Object.freeze({ current_attendance_rate: 85.0 })
  });

  const sim = simulateEducationalPolicy(frozenParams);
  assert.ok(Object.isFrozen(sim));
  assert.ok(Object.isFrozen(sim.scenario));
  assert.ok(Object.isFrozen(sim.predicted_effects));

  assert.throws(() => {
    sim.feasibility_score = 999;
  }, /TypeError/);

  const snapshot = buildPolicySimulationSnapshot({
    schoolId: 101,
    regionId: 1,
    baselineMetrics: frozenParams.baselineMetrics
  });

  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.scenarios));
  assert.ok(Object.isFrozen(snapshot.comparative_summary));
  assert.ok(Object.isFrozen(snapshot.assumptions));
  assert.ok(Object.isFrozen(snapshot.limitations));

  console.log('  ✅ ایمنی کامل در برابر جهش غیرمجاز و انجماد عمیق ساختارها تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
