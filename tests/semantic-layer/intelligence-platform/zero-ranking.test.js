/**
 * آزمون ۶: تضمین منع مطلق رتبه‌بندی رقابتی مدارس (zero-ranking)
 */

'use strict';

const assert = require('assert');
const {
  buildUnifiedIntelligenceSnapshot,
  generatePlatformHealthReport
} = require('../../../server/analytics/intelligence-platform-integration');

function runTests() {
  console.log('▸ تست ۶: تضمین منع مطلق رتبه‌بندی رقابتی در کل پلتفرم (zero-ranking)');

  const snapshot = buildUnifiedIntelligenceSnapshot({ schoolId: 101, regionId: 1 });
  const report = generatePlatformHealthReport({ schoolId: 101, regionId: 1 });

  assert.strictEqual(snapshot.zero_ranking, true);
  assert.strictEqual(report.zero_ranking_verified, true);

  const serialized = JSON.stringify(snapshot);
  assert.ok(!serialized.includes('"rank"'), 'هیچ فیلد رتبه فردی نباید وجود داشته باشد');
  assert.ok(!serialized.includes('"ranking_score"'), 'هیچ امتیاز رتبه‌بندی مدرسه‌ای نباید باشد');
  assert.ok(!serialized.includes('"league_table"'), 'نباید جدول رده‌بندی لیگ ایجاد شود');
  assert.ok(!serialized.includes('"best_school"'), 'نباید برچسب بهترین مدرسه درج شود');
  assert.ok(!serialized.includes('"worst_school"'), 'نباید برچسب بدترین مدرسه درج شود');

  console.log('  ✅ تضمین قطعی عدم تولید جدول رتبه‌بندی و مقایسه رقابتی با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
