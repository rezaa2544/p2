/**
 * آزمون تضمین حذف کامل رتبه‌بندی و League Tables در سطح منطقه
 */

'use strict';

const assert = require('assert');
const {
  summarizeRegionalHealth,
  buildRegionalSnapshot
} = require('../../../server/analytics/regional-intelligence-network');

function runTest() {
  console.log('▸ تست ۵: آزمون تضمین حذف کامل رتبه‌بندی مدارس در سطح منطقه (Zero League Table Guarantee)');

  const mockSchools = [
    { school_id: 1, health_index: { score: 95.0, status: 'HEALTHY' } },
    { school_id: 2, health_index: { score: 70.0, status: 'NEEDS_MONITORING' } },
    { school_id: 3, health_index: { score: 45.0, status: 'NEEDS_IMMEDIATE_ACTION' } }
  ];

  const summary = summarizeRegionalHealth({ schools: mockSchools });
  const snapshot = buildRegionalSnapshot({ regionId: 1, schools: mockSchools });

  // ۱. فیلدهای صریح عدم رتبه‌بندی در خلاصه سلامت
  assert.strictEqual(summary.is_ranked, false);
  assert.strictEqual(summary.ranking_score, null);
  assert.strictEqual(summary.league_table, null);
  assert.strictEqual(summary.best_school, null);
  assert.strictEqual(summary.worst_school, null);

  // ۲. عدم وجود فیلدهای رتبه در شناسنامه
  assert.strictEqual('ranked_schools' in snapshot, false);
  assert.strictEqual('best_school' in snapshot, false);
  assert.strictEqual('worst_school' in snapshot, false);
  assert.strictEqual('league_table' in snapshot, false);

  console.log('  ✅ تضمین قطعی عدم تولید جدول رتبه‌بندی، بدون بهترین/بدترین مدرسه و تمرکز بر پشتیبانی');
}

module.exports = { runTest };
if (require.main === module) runTest();
