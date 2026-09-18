/**
 * آزمون ۷: تضمین منع مطلق رتبه‌بندی رقابتی مدارس (Zero-Ranking Guarantee)
 */

'use strict';

const assert = require('assert');
const {
  buildGovernanceSnapshot,
  buildDistrictGovernanceOverview
} = require('../../../server/analytics/intelligence-governance-dashboard');

function runTests() {
  console.log('▸ تست ۷: تضمین منع مطلق رتبه‌بندی رقابتی و لیگ جدول مدارس (Zero-Ranking Guarantee)');

  const schoolA = buildGovernanceSnapshot({ schoolId: 101, regionId: 1 });
  const schoolB = buildGovernanceSnapshot({ schoolId: 202, regionId: 1 });

  assert.strictEqual(schoolA.zero_ranking, true);
  assert.strictEqual(schoolB.zero_ranking, true);

  const districtOverview = buildDistrictGovernanceOverview({
    regionId: 1,
    schoolSnapshots: [schoolA, schoolB]
  });

  assert.strictEqual(districtOverview.zero_ranking, true);

  const serialized = JSON.stringify(districtOverview);
  assert.ok(!serialized.includes('"rank"'), 'هیچ فیلد رتبه‌ای نباید وجود داشته باشد');
  assert.ok(!serialized.includes('"league_table"'), 'نباید جدول رده‌بندی لیگ ایجاد شود');
  assert.ok(!serialized.includes('"best_school"'), 'نباید برچسب بهترین مدرسه درج شود');
  assert.ok(!serialized.includes('"worst_school"'), 'نباید برچسب بدترین مدرسه درج شود');

  console.log('  ✅ تضمین قطعی معماری بدون رتبه‌بندی و مقایسه رقابتی با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
