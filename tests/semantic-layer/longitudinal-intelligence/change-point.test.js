/**
 * آزمون کشف نقاط چرخش و تغییرات معنادار (detectChangePoints)
 */

'use strict';

const assert = require('assert');
const {
  detectChangePoints,
  CHANGE_POINT_TYPES
} = require('../../../server/analytics/longitudinal-intelligence-monitoring');

function runTest() {
  console.log('▸ تست ۲: کشف نقاط چرخش معنادار و گسست‌های آموزشی (detectChangePoints)');

  // سناریو شامل افت ناگهانی، مداخله و بهبود مداوم
  const snapshots = [
    { period: '1404-T1', health_index: 80.0 },
    { period: '1404-T2', health_index: 81.0 },
    { period: '1405-T1', health_index: 68.0 }, // افت ناگهانی ۱۳ واحدی (SUDDEN_DROP)
    { period: '1405-T2', health_index: 73.0, has_intervention: true }, // نقطه عطف مداخله
    { period: '1406-T1', health_index: 78.0 }, // بهبود متوالی
    { period: '1406-T2', health_index: 83.0 }  // بهبود ۳ دوره متوالی (SUSTAINED_IMPROVEMENT)
  ];

  const changePoints = detectChangePoints({
    snapshots,
    metric: 'health_index'
  });

  assert.ok(Array.isArray(changePoints));
  assert.ok(changePoints.length >= 2, 'Should detect multiple change points');

  // ۱. بررسی کشف افت ناگهانی
  const suddenDrop = changePoints.find(cp => cp.change_type === CHANGE_POINT_TYPES.SUDDEN_DROP);
  assert.ok(suddenDrop, 'Must detect SUDDEN_DROP');
  assert.strictEqual(suddenDrop.period, '1405-T1');
  assert.strictEqual(suddenDrop.delta, -13.0);

  // ۲. بررسی کشف نقطه عطف مداخله
  const inflection = changePoints.find(cp => cp.change_type === CHANGE_POINT_TYPES.POST_INTERVENTION_INFLECTION);
  assert.ok(inflection, 'Must detect POST_INTERVENTION_INFLECTION');
  assert.strictEqual(inflection.period, '1405-T2');

  // ۳. بررسی کشف بهبود مداوم سه‌دوره‌ای
  const sustained = changePoints.find(cp => cp.change_type === CHANGE_POINT_TYPES.SUSTAINED_IMPROVEMENT);
  assert.ok(sustained, 'Must detect SUSTAINED_IMPROVEMENT');

  console.log('  ✅ کشف دقیق افت‌های حاد، جهش‌های آموزشی و نقاط عطف پس از مداخله');
}

module.exports = { runTest };
if (require.main === module) runTest();
