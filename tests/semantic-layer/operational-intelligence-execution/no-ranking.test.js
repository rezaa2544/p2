/**
 * آزمون ۸: تضمین منع مطلق رتبه‌بندی رقابتی مدارس (Zero-Ranking Guarantee)
 */

'use strict';

const assert = require('assert');
const {
  createExecutionWorkflow,
  buildExecutionDashboard
} = require('../../../server/analytics/operational-intelligence-execution');

function runTests() {
  console.log('▸ تست ۸: تضمین منع مطلق رتبه‌بندی رقابتی مدارس (no-ranking)');

  const workflow = createExecutionWorkflow({ schoolId: 101, regionId: 1 });
  const dashboard = buildExecutionDashboard({ schoolId: 101, regionId: 1 });

  assert.strictEqual(workflow.zero_ranking, true);
  assert.strictEqual(dashboard.zero_ranking, true);

  const serialized = JSON.stringify(dashboard);
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
