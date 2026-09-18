/**
 * آزمون ارزیابی پیامد چرخه بهبود مستمر (evaluateImprovementCycleOutcome)
 */

'use strict';

const assert = require('assert');
const {
  evaluateImprovementCycleOutcome,
  initiateImprovementCycle,
  transitionImprovementCycle,
  PDCA_PHASES,
  CYCLE_EFFICACY,
  ACT_DECISIONS
} = require('../../../server/analytics/quality-governance');

function runTest() {
  console.log('▸ تست ۴: ارزیابی پیامد و اثربخشی چرخه بهبود (evaluateImprovementCycleOutcome)');

  const baseCycle = initiateImprovementCycle({
    school_id: 12,
    pillar_key: 'ATTENDANCE_STABILITY',
    problem_statement: 'تاخیرهای متوالی صبحگاهی در روزهای برفی و بارانی',
    target_metric: 'punctuality_rate',
    baseline_value: 70.0,
    target_value: 90.0, // شکاف هدف = ۲۰ واحد
    action_plan: 'هماهنگی سرویس‌های پشتیبان و انعطاف ۱۵ دقیقه‌ای در تردد صبحگاهی'
  });

  const checkCycle = transitionImprovementCycle(
    transitionImprovementCycle(baseCycle, { to_phase: PDCA_PHASES.DO }),
    { to_phase: PDCA_PHASES.CHECK }
  );

  // سناریو الف: موفقیت بالا (Post = 88.0 -> دستیابی ۹۰٪ به هدف)
  const highOutcome = evaluateImprovementCycleOutcome(checkCycle, { post_value: 88.0 });
  assert.strictEqual(highOutcome.post_value, 88.0);
  assert.strictEqual(highOutcome.delta_value, 18.0);
  assert.strictEqual(highOutcome.target_achievement_percentage, 90.0);
  assert.strictEqual(highOutcome.efficacy, CYCLE_EFFICACY.HIGHLY_EFFECTIVE);
  assert.strictEqual(highOutcome.recommended_act_decision, ACT_DECISIONS.STANDARDIZE_PROCESS);

  // سناریو ب: موفقیت نسبی (Post = 78.0 -> دستیابی ۴۰٪ به هدف)
  const partialOutcome = evaluateImprovementCycleOutcome(checkCycle, { post_value: 78.0 });
  assert.strictEqual(partialOutcome.post_value, 78.0);
  assert.strictEqual(partialOutcome.delta_value, 8.0);
  assert.strictEqual(partialOutcome.target_achievement_percentage, 40.0);
  assert.strictEqual(partialOutcome.efficacy, CYCLE_EFFICACY.PARTIALLY_EFFECTIVE);
  assert.strictEqual(partialOutcome.recommended_act_decision, ACT_DECISIONS.ADJUST_AND_RETRY);

  // سناریو ج: بی‌اثر یا پسرفت (Post = 68.0 -> دلتا منفی)
  const ineffectiveOutcome = evaluateImprovementCycleOutcome(checkCycle, { post_value: 68.0 });
  assert.strictEqual(ineffectiveOutcome.delta_value, -2.0);
  assert.strictEqual(ineffectiveOutcome.target_achievement_percentage, 0.0);
  assert.strictEqual(ineffectiveOutcome.efficacy, CYCLE_EFFICACY.INEFFECTIVE);
  assert.strictEqual(ineffectiveOutcome.recommended_act_decision, ACT_DECISIONS.ESCALATE_TO_DISTRICT);

  console.log('  ✅ صحت ارزیابی دلتا، درصد تحقق هدف و تصمیمات استانداردسازی فاز Act');
}

module.exports = { runTest };
if (require.main === module) runTest();
