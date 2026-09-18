/**
 * آزمون ۵: تولید بینش‌های بهینه‌سازی مستمر برای موتورهای قبلی (generateOptimizationInsights)
 */

'use strict';

const assert = require('assert');
const {
  generateOptimizationInsights,
  OPTIMIZATION_TARGET_ENGINE
} = require('../../../server/analytics/outcome-evaluation-optimization');

function runTests() {
  console.log('▸ تست ۵: تولید بینش‌های بهینه‌سازی مستمر برای موتورها (optimization-insight)');

  const insights = generateOptimizationInsights({
    schoolId: 101,
    options: { timestamp: '2026-09-18T12:00:00.000Z' }
  });

  assert.ok(Array.isArray(insights));
  assert.ok(insights.length >= 3);

  // بررسی هدف‌گذاری موتورها
  const simInsight = insights.find(i => i.target_engine === OPTIMIZATION_TARGET_ENGINE.POLICY_SIMULATION);
  assert.ok(simInsight);
  assert.strictEqual(simInsight.requires_human_approval, true);
  assert.strictEqual(simInsight.automated_execution, false);

  const recInsight = insights.find(i => i.target_engine === OPTIMIZATION_TARGET_ENGINE.RECOMMENDATION_ENGINE);
  assert.ok(recInsight);

  const cmdInsight = insights.find(i => i.target_engine === OPTIMIZATION_TARGET_ENGINE.DECISION_COMMAND);
  assert.ok(cmdInsight);

  console.log('  ✅ تولید مشاوره‌ای بینش‌های بهینه‌سازی بدون اجرای خودکار با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
