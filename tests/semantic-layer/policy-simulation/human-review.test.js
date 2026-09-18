/**
 * آزمون ۵: پایبندی به اصل نظارت انسانی و منع اجرای خودکار سیاست (Human Review Guard)
 */

'use strict';

const assert = require('assert');
const {
  buildPolicySimulationSnapshot,
  evaluatePolicyImpact,
  simulateEducationalPolicy
} = require('../../../server/analytics/policy-simulation-engine');

function runTests() {
  console.log('▸ تست ۵: منع اجرای خودکار و تضمین نظارت انسانی (human-review)');

  const snapshot = buildPolicySimulationSnapshot({
    schoolId: 101,
    regionId: 1
  });

  assert.strictEqual(snapshot.automated_policy_execution, false, 'اجرای خودکار سیاست اکیداً ممنوع است');
  assert.strictEqual(snapshot.automated_decision, false, 'تصمیم‌گیری خودکار اکیداً ممنوع است');
  assert.strictEqual(snapshot.requires_human_approval, true, 'تصویب انسانی اجباری است');
  assert.strictEqual(snapshot.human_review_status, 'PENDING_HUMAN_REVIEW');

  const sim = simulateEducationalPolicy();
  const impact = evaluatePolicyImpact(sim, {});
  assert.strictEqual(impact.requires_human_approval, true);

  console.log('  ✅ رعایت ۱۰۰٪ اصل Human-in-the-Loop و تحریم تصمیم‌گیری خودکار تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
