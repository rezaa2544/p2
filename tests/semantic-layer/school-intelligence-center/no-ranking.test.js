/**
 * آزمون اصل ممنوعیت رتبه‌بندی خطی مدارس (No League Tables Guarantee)
 */

'use strict';

const assert = require('assert');
const { generateDistrictAggregation } = require('../../../server/analytics/school-intelligence-center');

function runTest() {
  console.log('▸ تست ۵: آزمون تضمین عدم تولید جدول رتبه‌بندی مدارس (No League Table Guarantee)');

  const mockSchools = [
    { school_id: 1, health_index: { score: 95.0, status: 'HEALTHY' } },
    { school_id: 2, health_index: { score: 72.0, status: 'NEEDS_MONITORING' } },
    { school_id: 3, health_index: { score: 45.0, status: 'NEEDS_IMMEDIATE_ACTION' } }
  ];

  const district = generateDistrictAggregation(mockSchools, { districtId: 5 });

  // ۱. فیلدهای صریح عدم رتبه‌بندی
  assert.strictEqual(district.is_ranked, false, 'District summary must explicitly guarantee no ranking');
  assert.strictEqual(district.ranking_score, null, 'Ranking score must be null');
  assert.strictEqual(district.league_table, null, 'League table property must be null');

  // ۲. عدم وجود هرگونه آرایه مرتب‌شده بر اساس نمره
  assert.strictEqual('ranked_schools' in district, false);
  assert.strictEqual('league_table_list' in district, false);
  assert.strictEqual('top_schools' in district, false);
  assert.strictEqual('bottom_schools' in district, false);

  console.log('  ✅ تضمین قطعی عدم تولید جدول رتبه‌بندی مدارس و مهار ایجاد فضای رقابتی مخرب');
}

module.exports = { runTest };
if (require.main === module) runTest();
