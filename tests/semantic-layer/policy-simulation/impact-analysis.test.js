/**
 * آزمون ۳: ارزیابی اثرگذاری و پیامدهای برآوردی (evaluatePolicyImpact)
 */

'use strict';

const assert = require('assert');
const {
  simulateEducationalPolicy,
  evaluatePolicyImpact,
  SCENARIO_TYPE,
  POLICY_FOCUS
} = require('../../../server/analytics/policy-simulation-engine');

function runTests() {
  console.log('▸ تست ۳: ارزیابی اثرگذاری و برآورد پسامداخله (impact-analysis)');

  const scenario = simulateEducationalPolicy({
    scenarioType: SCENARIO_TYPE.POLICY_INTERVENTION,
    policyFocus: POLICY_FOCUS.ATTENDANCE_BOOST,
    intensity: 'MODERATE'
  });

  const baseline = {
    current_attendance_rate: 85.0,
    current_gpa: 14.5
  };

  const impact = evaluatePolicyImpact(scenario, baseline);

  assert.strictEqual(impact.baseline.attendance_rate, 85.0);
  assert.strictEqual(impact.baseline.gpa, 14.5);
  assert.ok(impact.projected.attendance_rate > 85.0);
  assert.ok(impact.projected.gpa >= 14.5);
  assert.strictEqual(impact.requires_human_approval, true);

  console.log('  ✅ برآورد دقیق مقادیر آتی شاخص‌های حضور و معدل تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
