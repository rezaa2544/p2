/**
 * آزمون نقشه روندهای منطقه‌ای جهت تخصیص منابع بدون رتبه‌بندی (buildRegionalTrendMap)
 */

'use strict';

const assert = require('assert');
const {
  buildRegionalTrendMap,
  TREND_DIRECTIONS
} = require('../../../server/analytics/longitudinal-intelligence-monitoring');

function runTest() {
  console.log('▸ تست ۶: نقشه روندهای منطقه‌ای با تضمین مطلق منع رتبه‌بندی مدارس (buildRegionalTrendMap)');

  const mockSchools = [
    { school_id: 205, school_name: 'دبستان حافظ', overall_trend: TREND_DIRECTIONS.IMPROVING },
    { school_id: 102, school_name: 'دبیرستان رازی', overall_trend: TREND_DIRECTIONS.DECLINING },
    { school_id: 150, school_name: 'هنرستان کمال‌الملک', overall_trend: TREND_DIRECTIONS.STABLE }
  ];

  const trendMap = buildRegionalTrendMap({
    regionId: 4,
    schools: mockSchools,
    periodRange: '1404-1406'
  });

  assert.strictEqual(trendMap.region_id, 4);
  assert.strictEqual(trendMap.total_schools_monitored, 3);
  assert.strictEqual(trendMap.trend_distribution[TREND_DIRECTIONS.IMPROVING], 1);
  assert.strictEqual(trendMap.trend_distribution[TREND_DIRECTIONS.STABLE], 1);
  assert.strictEqual(trendMap.trend_distribution[TREND_DIRECTIONS.DECLINING], 1);
  assert.strictEqual(trendMap.priority_support_needed_count, 1);

  // ۱. بررسی قطعی عدم رتبه‌بندی
  assert.strictEqual(trendMap.zero_ranking_policy_enforced, true);
  assert.strictEqual(trendMap.is_ranked, false);
  assert.strictEqual(trendMap.ranking_score, null);
  assert.strictEqual(trendMap.league_table, null);
  assert.strictEqual(trendMap.best_school, null);
  assert.strictEqual(trendMap.worst_school, null);

  // ۲. ترتیب مدارس باید صرفاً بر مبنای شناسه عددی مدرسه باشد
  const list = trendMap.schools_trend_summary;
  assert.strictEqual(list[0].school_id, 102);
  assert.strictEqual(list[1].school_id, 150);
  assert.strictEqual(list[2].school_id, 205);

  // ۳. عدم وجود فیلدهای رقابتی در آیتم‌ها
  for (const item of list) {
    assert.strictEqual(item.rank, undefined);
    assert.strictEqual(item.rank_position, undefined);
  }

  console.log('  ✅ تضمین قطعی نقشه منطقه‌ای حمایتی بدون لیگ، رتبه‌بندی و مقایسه رقابتی');
}

module.exports = { runTest };
if (require.main === module) runTest();
