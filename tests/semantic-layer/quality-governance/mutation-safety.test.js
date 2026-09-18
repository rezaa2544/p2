/**
 * آزمون ایمنی در برابر جهش داده‌ها (Mutation Safety & Immutability)
 */

'use strict';

const assert = require('assert');
const {
  evaluateQualityPillars,
  initiateImprovementCycle,
  generateDistrictQualitySummary
} = require('../../../server/analytics/quality-governance');

function runTest() {
  console.log('▸ تست ۸: آزمون ایمنی در برابر جهش داده‌ها و فریز بودن ساختار خروجی‌ها (Mutation Safety)');

  const pillars = evaluateQualityPillars({
    assessments: [{ score: 16, max_score: 20 }]
  });

  // ۱. خروجی باید منجمد باشد
  assert.ok(Object.isFrozen(pillars), 'Pillars evaluation result must be frozen');
  assert.throws(() => {
    pillars.overall_quality_index = 999;
  }, /TypeError/, 'Mutating overall_quality_index must throw in strict mode');

  assert.throws(() => {
    pillars.new_property = 'tampering';
  }, /TypeError/, 'Adding properties must throw in strict mode');

  // ۲. ستون‌ها در سطح فرزند نیز باید منجمد باشند
  assert.ok(Object.isFrozen(pillars.pillars), 'Pillars sub-object must be frozen');

  // ۳. چرخه PDCA نیز باید منجمد باشد
  const cycle = initiateImprovementCycle({
    school_id: 1,
    pillar_key: 'ATTENDANCE_STABILITY',
    problem_statement: 'مسئله تست جهش',
    target_metric: 'metric_b',
    baseline_value: 60,
    target_value: 80
  });

  assert.ok(Object.isFrozen(cycle), 'Improvement cycle must be frozen');
  assert.throws(() => {
    cycle.current_phase = 'HACKED';
  }, /TypeError/, 'Mutating cycle phase directly must fail');

  // ۴. خلاصه منطقه نیز منجمد است
  const summary = generateDistrictQualitySummary({
    region_id: 1,
    schools_data: []
  });
  assert.ok(Object.isFrozen(summary), 'District summary must be frozen');

  console.log('  ✅ ایمنی کامل در برابر جهش غیرمجاز و تخریب داده‌ها تأیید شد');
}

module.exports = { runTest };
if (require.main === module) runTest();
