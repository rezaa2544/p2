/**
 * آزمون ۸: آزمون قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت در ۱۰ اجرای متوالی
 */

'use strict';

const assert = require('assert');
const {
  simulateEducationalPolicy,
  comparePolicyScenarios,
  evaluatePolicyImpact,
  generatePolicyInsights,
  buildPolicySimulationSnapshot
} = require('../../../server/analytics/policy-simulation-engine');

function runTests() {
  console.log('▸ تست ۸: آزمون قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت (deterministic)');

  let firstSim = null;
  let firstComp = null;
  let firstImpact = null;
  let firstInsights = null;
  let firstSnapshot = null;

  for (let i = 0; i < 10; i++) {
    const sim = simulateEducationalPolicy({
      scenarioType: 'POLICY_INTERVENTION',
      policyFocus: 'ATTENDANCE_BOOST',
      baselineMetrics: { current_attendance_rate: 85.0 }
    }, { timestamp: '2026-09-18T12:00:00.000Z' });

    const comp = comparePolicyScenarios({
      baseline: sim,
      intervention: sim,
      alternative: sim
    }, { timestamp: '2026-09-18T12:00:00.000Z' });

    const impact = evaluatePolicyImpact(sim, { current_attendance_rate: 85.0 }, { timestamp: '2026-09-18T12:00:00.000Z' });

    const insights = generatePolicyInsights([sim], {}, { timestamp: '2026-09-18T12:00:00.000Z' });

    const snapshot = buildPolicySimulationSnapshot({
      schoolId: 101,
      regionId: 1,
      options: { timestamp: '2026-09-18T12:00:00.000Z' }
    });

    const sSim = JSON.stringify(sim);
    const sComp = JSON.stringify(comp);
    const sImpact = JSON.stringify(impact);
    const sInsights = JSON.stringify(insights);
    const sSnapshot = JSON.stringify(snapshot);

    if (i === 0) {
      firstSim = sSim;
      firstComp = sComp;
      firstImpact = sImpact;
      firstInsights = sInsights;
      firstSnapshot = sSnapshot;
    } else {
      assert.strictEqual(sSim, firstSim, `عدم تطابق قطعیت در simulateEducationalPolicy در تکرار ${i}`);
      assert.strictEqual(sComp, firstComp, `عدم تطابق قطعیت در comparePolicyScenarios در تکرار ${i}`);
      assert.strictEqual(sImpact, firstImpact, `عدم تطابق قطعیت در evaluatePolicyImpact در تکرار ${i}`);
      assert.strictEqual(sInsights, firstInsights, `عدم تطابق قطعیت در generatePolicyInsights در تکرار ${i}`);
      assert.strictEqual(sSnapshot, firstSnapshot, `عدم تطابق قطعیت در buildPolicySimulationSnapshot در تکرار ${i}`);
    }
  }

  console.log('  ✅ قطعیت جبری ۱۰۰٪ و برابری باینری تمامی محاسبات در ۱۰ تکرار متوالی اثبات شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
