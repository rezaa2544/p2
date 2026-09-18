/**
 * آزمون تولید بینش‌های عملیاتی و توصیه‌های نظارتی انسان‌محور (generateLongitudinalInsights)
 */

'use strict';

const assert = require('assert');
const {
  generateLongitudinalInsights,
  TREND_DIRECTIONS,
  CHANGE_POINT_TYPES
} = require('../../../server/analytics/longitudinal-intelligence-monitoring');

function runTest() {
  console.log('▸ تست ۴: تولید بینش‌های عملیاتی و رعایت اصل نظارت انسانی (generateLongitudinalInsights)');

  const mockTrends = {
    metric: 'health_index',
    direction: TREND_DIRECTIONS.IMPROVING,
    slope: 1.85
  };

  const mockChangePoints = [
    {
      period: '1405-T1',
      change_type: CHANGE_POINT_TYPES.SUDDEN_DROP,
      description: 'افت ناگهانی شاخص سلامت به میزان ۱۰ واحد'
    },
    {
      period: '1405-T2',
      change_type: CHANGE_POINT_TYPES.POST_INTERVENTION_INFLECTION,
      description: 'نقطه عطف مثبت پس از اجرای مداخله آموزشی'
    }
  ];

  const result = generateLongitudinalInsights({
    trends: mockTrends,
    changePoints: mockChangePoints
  });

  assert.strictEqual(typeof result, 'object');
  assert.ok(Array.isArray(result.insights), 'Insights must be an array');
  assert.ok(Array.isArray(result.recommendations), 'Recommendations must be an array');
  assert.ok(result.insights.length >= 2, 'Should have multiple insights');

  // بررسی الزامات Human-in-the-Loop
  assert.strictEqual(result.human_in_the_loop_required, true, 'Human review must be mandatory');
  assert.strictEqual(result.automated_decision_made, false, 'No automated decisions permitted');

  console.log('  ✅ تولید بینش‌های ساختاریافته، توصیه‌های راهبردی و تضمین نظارت انسانی');
}

module.exports = { runTest };
if (require.main === module) runTest();
