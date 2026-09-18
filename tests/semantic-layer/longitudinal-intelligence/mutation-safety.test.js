/**
 * آزمون ایمنی در برابر جهش داده‌ها و فریز بودن خروجی‌ها (Mutation Safety)
 */

'use strict';

const assert = require('assert');
const {
  calculateEducationalTrends,
  detectChangePoints,
  calculateSustainableImprovement,
  buildLongitudinalSchoolProfile,
  buildRegionalTrendMap
} = require('../../../server/analytics/longitudinal-intelligence-monitoring');

function runTest() {
  console.log('▸ تست ۸: آزمون ایمنی در برابر جهش داده‌ها و انجماد عمیق اشیا (deepFreeze Mutation Safety)');

  const snapshots = [
    { period: '1404-T1', health_index: 70.0 },
    { period: '1404-T2', health_index: 75.0 }
  ];

  // ۱. بررسی انجماد خروجی تحلیل روند
  const trend = calculateEducationalTrends({ snapshots, metric: 'health_index' });
  assert.ok(Object.isFrozen(trend), 'Trend result must be frozen');
  assert.throws(() => { trend.slope = 999; }, /TypeError/);

  // ۲. بررسی انجماد خروجی نقاط چرخش
  const changePoints = detectChangePoints({ snapshots, metric: 'health_index' });
  assert.ok(Object.isFrozen(changePoints), 'Change points array must be frozen');

  // ۳. بررسی انجماد شناسنامه طولی مدرسه
  const profile = buildLongitudinalSchoolProfile({ schoolId: 2, snapshots });
  assert.ok(Object.isFrozen(profile), 'Profile must be frozen');
  assert.ok(Object.isFrozen(profile.trends_by_metric), 'Sub-object trends_by_metric must be frozen');
  assert.throws(() => { profile.overall_trend = 'HACKED'; }, /TypeError/);

  // ۴. بررسی انجماد نقشه منطقه‌ای
  const map = buildRegionalTrendMap({ regionId: 1, schools: [] });
  assert.ok(Object.isFrozen(map), 'Regional trend map must be frozen');
  assert.ok(Object.isFrozen(map.trend_distribution), 'trend_distribution must be frozen');
  assert.throws(() => { map.total_schools_monitored = -1; }, /TypeError/);

  console.log('  ✅ ایمنی کامل در برابر جهش غیرمجاز و انجماد عمیق تمامی ساختارها تأیید گردید');
}

module.exports = { runTest };
if (require.main === module) runTest();
