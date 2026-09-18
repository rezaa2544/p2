/**
 * آزمون ۱: ساخت و ارزیابی سناریوهای سیاستی (simulateEducationalPolicy & buildPolicySimulationSnapshot)
 */

'use strict';

const assert = require('assert');
const {
  simulateEducationalPolicy,
  buildPolicySimulationSnapshot,
  SCENARIO_TYPE,
  POLICY_FOCUS
} = require('../../../server/analytics/policy-simulation-engine');

function runTests() {
  console.log('▸ تست ۱: ساخت و شبیه‌سازی سناریوهای خط‌مشی (scenario-builder)');

  const simBase = simulateEducationalPolicy({
    scenarioType: SCENARIO_TYPE.BASELINE,
    policyFocus: POLICY_FOCUS.ATTENDANCE_BOOST
  });

  assert.strictEqual(simBase.scenario.scenario_type, 'BASELINE');
  assert.strictEqual(simBase.predicted_effects.resource_demand_hours, 0);
  assert.ok(simBase.predicted_effects.delta_attendance <= 0, 'در وضع موجود رشد حضور نداریم');

  const simIntervention = simulateEducationalPolicy({
    scenarioType: SCENARIO_TYPE.POLICY_INTERVENTION,
    policyFocus: POLICY_FOCUS.ATTENDANCE_BOOST,
    intensity: 'MODERATE'
  });

  assert.strictEqual(simIntervention.scenario.scenario_type, 'POLICY_INTERVENTION');
  assert.ok(simIntervention.predicted_effects.delta_attendance > 0, 'مداخله باید اثر مثبت بر حضور داشته باشد');
  assert.ok(simIntervention.feasibility_score >= 0 && simIntervention.feasibility_score <= 100);

  const snapshot = buildPolicySimulationSnapshot({
    schoolId: 101,
    regionId: 12,
    policyFocus: POLICY_FOCUS.ATTENDANCE_BOOST,
    baselineMetrics: {
      current_attendance_rate: 88.0,
      current_gpa: 15.0
    }
  });

  assert.strictEqual(snapshot.school_id, 101);
  assert.strictEqual(snapshot.region_id, 12);
  assert.strictEqual(snapshot.scenarios.length, 3, 'باید هر ۳ سناریوی BASELINE، INTERVENTION و ALTERNATIVE تولید شوند');
  assert.strictEqual(snapshot.automated_policy_execution, false, 'اجرای خودکار سیاست باید اکیداً false باشد');
  assert.strictEqual(snapshot.requires_human_approval, true, 'تأیید انسانی باید صراحتاً true باشد');

  console.log('  ✅ ساخت و ارزیابی سناریوهای پایه، مداخله و جایگزین با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
