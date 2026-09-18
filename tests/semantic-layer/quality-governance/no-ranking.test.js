/**
 * آزمون تضمین عدم رتبه‌بندی رقابتی مدارس (Zero-Ranking Guarantee)
 */

'use strict';

const assert = require('assert');
const {
  generateDistrictQualitySummary,
  evaluateQualityPillars
} = require('../../../server/analytics/quality-governance');

function runTest() {
  console.log('▸ تست ۶: تضمین منع مطلق رتبه‌بندی رقابتی و لیگ جدول مدارس (Zero-Ranking Guarantee)');

  const schools = [
    { school_id: 201, school_name: 'مدرسه شهید بهشتی', ...evaluateQualityPillars({ assessments: [{ score: 19, max_score: 20 }] }) },
    { school_id: 202, school_name: 'مدرسه حافظ', ...evaluateQualityPillars({ assessments: [{ score: 10, max_score: 20 }] }) },
    { school_id: 203, school_name: 'مدرسه سعدی', ...evaluateQualityPillars({ assessments: [{ score: 15, max_score: 20 }] }) }
  ];

  const districtSummary = generateDistrictQualitySummary({
    region_id: 5,
    schools_data: schools
  });

  // ۱. فیلدهای صریح منع رتبه‌بندی
  assert.strictEqual(districtSummary.is_ranked, false);
  assert.strictEqual(districtSummary.ranking_score, null);
  assert.strictEqual(districtSummary.league_table, null);
  assert.strictEqual(districtSummary.best_school, null);
  assert.strictEqual(districtSummary.worst_school, null);

  // ۲. بررسی کلیدهای آبجکت خلاصه که هیچ فیلد رقابتی تولید نکرده باشد
  const forbiddenKeys = ['rank', 'rank_position', 'leaderboard', 'top_performers', 'bottom_performers', 'competition_index'];
  const summaryKeys = Object.keys(districtSummary);
  for (const forbidden of forbiddenKeys) {
    assert.ok(!summaryKeys.includes(forbidden), `Forbidden key ${forbidden} must not exist in district summary`);
  }

  // ۳. ترتیب مدارس باید بر مبنای شناسه مدرسه باشد نه نمره یا کیفیت
  const returnedSchools = districtSummary.schools_evaluated;
  for (let i = 0; i < returnedSchools.length - 1; i++) {
    assert.ok(returnedSchools[i].school_id <= returnedSchools[i + 1].school_id, 'Schools must be ordered by school_id, not performance');
  }

  // ۴. عدم وجود فیلد rank در آیتم‌های مدارس
  for (const item of returnedSchools) {
    assert.strictEqual(item.rank, undefined, 'Individual school item must not have rank');
    assert.strictEqual(item.ranking_position, undefined, 'Individual school item must not have ranking_position');
  }

  console.log('  ✅ تضمین قطعی معماری بدون رتبه‌بندی مخرب و جدول لیگ در کلیه خروجی‌ها');
}

module.exports = { runTest };
if (require.main === module) runTest();
