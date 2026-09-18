/**
 * آزمون ۲: مقایسه چندسناریویی خط‌مشی‌ها (comparePolicyScenarios)
 */

'use strict';

const assert = require('assert');
const {
  simulateEducationalPolicy,
  comparePolicyScenarios,
  SCENARIO_TYPE,
  POLICY_FOCUS
} = require('../../../server/analytics/policy-simulation-engine');

function runTests() {
  console.log('▸ تست ۲: مقایسه تحلیلی سناریوهای سیاستی (policy-comparison)');

  const base = simulateEducationalPolicy({
    scenarioType: SCENARIO_TYPE.BASELINE,
    policyFocus: POLICY_FOCUS.ACADEMIC_REMEDIAL
  });

  const intervention = simulateEducationalPolicy({
    scenarioType: SCENARIO_TYPE.POLICY_INTERVENTION,
    policyFocus: POLICY_FOCUS.ACADEMIC_REMEDIAL,
    intensity: 'INTENSIVE'
  });

  const alternative = simulateEducationalPolicy({
    scenarioType: SCENARIO_TYPE.ALTERNATIVE_POLICY,
    policyFocus: POLICY_FOCUS.ACADEMIC_REMEDIAL,
    intensity: 'LIGHT'
  });

  const comparison = comparePolicyScenarios({ baseline: base, intervention, alternative });

  assert.strictEqual(comparison.scenarios.length, 3);
  assert.ok(comparison.tradeoffs_summary.length > 0);
  assert.ok(comparison.recommended_scenario_for_review.length > 0);
  assert.ok(comparison.decision_guidance.includes('مدیر'));

  console.log('  ✅ مقایسه تریدآف‌های سناریوها و راهنمای تصمیم با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
