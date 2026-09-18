/**
 * آزمون ۲: محاسبه کارایی و بهره‌وری کش توزیع‌شده (cache-efficiency)
 */

'use strict';

const assert = require('assert');
const {
  calculateCacheEfficiency,
  CACHE_HEALTH
} = require('../../../server/infrastructure/scalability-foundation');

function runTests() {
  console.log('▸ تست ۲: محاسبه کارایی و بهره‌وری کش توزیع‌شده (cache-efficiency)');

  // حالت پیش‌فرض و مطلوب
  const optimal = calculateCacheEfficiency();
  assert.strictEqual(optimal.health_status, CACHE_HEALTH.OPTIMAL);
  assert.ok(optimal.hit_ratio_percent >= 80, 'نسبت برخورد کش مطلوب باید بالای ۸۰٪ باشد');
  assert.ok(optimal.efficiency_score >= 75);
  assert.strictEqual(optimal.stampede_protection, 'SINGLE_FLIGHT_MUTEX');
  assert.ok(optimal.latencies.latency_saved_ms_per_request > 0);

  // حالت ورودی با نسبت پایین (تخریب کارایی)
  const degraded = calculateCacheEfficiency({
    hits: 500,
    misses: 500,
    l1_hits: 200,
    l2_hits: 300
  });
  assert.strictEqual(degraded.health_status, CACHE_HEALTH.DEGRADED);
  assert.strictEqual(degraded.hit_ratio_percent, 50.0);

  // حالت بحرانی
  const critical = calculateCacheEfficiency({
    hits: 200,
    misses: 800,
    l1_hits: 100,
    l2_hits: 100
  });
  assert.strictEqual(critical.health_status, CACHE_HEALTH.CRITICAL);
  assert.strictEqual(critical.hit_ratio_percent, 20.0);

  // حالت مرزی: صفر درخواست
  const zeroReqs = calculateCacheEfficiency({ hits: 0, misses: 0 });
  assert.strictEqual(zeroReqs.total_requests, 0);
  assert.strictEqual(zeroReqs.hit_ratio_percent, 0);

  console.log('  ✅ صحت محاسبات نرخ برخورد، تاخیر صرفه‌جویی‌شده و سطوح سلامت کش تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
