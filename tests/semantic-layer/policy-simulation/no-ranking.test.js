/**
 * آزمون ۶: تضمین منع مطلق رتبه‌بندی رقابتی مدارس (Zero-Ranking Guarantee)
 */

'use strict';

const assert = require('assert');
const {
  buildPolicySimulationSnapshot
} = require('../../../server/analytics/policy-simulation-engine');

function runTests() {
  console.log('▸ تست ۶: تضمین منع مطلق رتبه‌بندی رقابتی مدارس (no-ranking)');

  const snapshot = buildPolicySimulationSnapshot({
    schoolId: 101,
    regionId: 1
  });

  assert.strictEqual(snapshot.zero_ranking, true);

  const serialized = JSON.stringify(snapshot);
  assert.ok(!serialized.includes('"rank"'), 'نباید هیچ فیلد رتبه فردی تولید شود');
  assert.ok(!serialized.includes('"ranking_score"'), 'نباید فیلد امتیاز رتبه‌بندی تولید شود');
  assert.ok(!serialized.includes('"league_table"'), 'نباید جدول رده‌بندی لیگ ایجاد شود');
  assert.ok(!serialized.includes('"best_school"'), 'نباید برچسب بهترین مدرسه درج شود');
  assert.ok(!serialized.includes('"worst_school"'), 'نباید برچسب بدترین مدرسه درج شود');

  console.log('  ✅ تضمین قطعی عدم تولید جدول رتبه‌بندی و مقایسه رقابتی با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
