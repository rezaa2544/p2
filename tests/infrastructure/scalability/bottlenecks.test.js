/**
 * آزمون ۳: کشف و طبقه‌بندی گلوگاه‌های مقیاس‌پذیری (bottlenecks)
 */

'use strict';

const assert = require('assert');
const {
  detectScalabilityBottlenecks,
  BOTTLENECK_SEVERITY
} = require('../../../server/infrastructure/scalability-foundation');

function runTests() {
  console.log('▸ تست ۳: کشف و طبقه‌بندی گلوگاه‌های مقیاس‌پذیری (bottlenecks)');

  // حالت بهینه بدون گلوگاه
  const optimal = detectScalabilityBottlenecks({
    db_pool_active: 10,
    db_pool_max: 50,
    outbox_depth: 30,
    memory_usage_percent: 45
  });
  assert.strictEqual(optimal.total_bottlenecks, 0);
  assert.strictEqual(optimal.highest_severity, BOTTLENECK_SEVERITY.NONE);
  assert.strictEqual(optimal.status, 'OPTIMAL');

  // سناریوی اشباع استخر اتصالات پایگاه داده (DB Pool Saturation)
  const poolSaturated = detectScalabilityBottlenecks({
    db_pool_active: 45,
    db_pool_max: 50,
    outbox_depth: 10,
    memory_usage_percent: 50
  });
  assert.strictEqual(poolSaturated.total_bottlenecks, 1);
  assert.strictEqual(poolSaturated.highest_severity, BOTTLENECK_SEVERITY.HIGH);
  assert.strictEqual(poolSaturated.bottlenecks_detected[0].dimension, 'DATABASE_POOL');
  assert.ok(poolSaturated.bottlenecks_detected[0].remediation.length > 0);

  // سناریوی تجمع چندگانه گلوگاه‌ها
  const multipleBottlenecks = detectScalabilityBottlenecks({
    db_pool_active: 48,
    db_pool_max: 50,
    outbox_depth: 850,
    memory_usage_percent: 88.5
  });
  assert.strictEqual(multipleBottlenecks.total_bottlenecks, 3);
  assert.strictEqual(multipleBottlenecks.highest_severity, BOTTLENECK_SEVERITY.HIGH);

  console.log('  ✅ کشف چندبعدی گلوگاه‌ها، تعیین شدت و پیشنهاد اقدامات اصلاحی تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
