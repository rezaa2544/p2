/**
 * تست مانیتورینگ بلادرنگ بهره‌وری کش توزیع‌شده و فشار حافظه (P1-SC-03)
 */
'use strict';

const assert = require('assert');
const {
  collectCacheMetrics
} = require('../../../server/monitoring/production-observability');

function runCacheMonitoringTests() {
  console.log('▸ تست ۶: مانیتورینگ بلادرنگ بهره‌وری کش و فشار حافظه (cache-monitoring)');

  // ۱. حالت بهینه کش
  const nominal = collectCacheMetrics({
    hit_ratio: 0.92,
    eviction_rate: 1,
    memory_pressure: 0.35
  });

  assert.strictEqual(nominal.status, 'healthy');
  assert.strictEqual(nominal.hit_ratio, 0.92);
  assert.strictEqual(nominal.miss_ratio, 0.08);
  assert.strictEqual(nominal.efficiency_grade, 'EXCELLENT');

  // ۲. حالت افت کش
  const degraded = collectCacheMetrics({
    hit_ratio: 0.65,
    memory_pressure: 0.78
  });
  assert.strictEqual(degraded.status, 'degraded');
  assert.strictEqual(degraded.efficiency_grade, 'ACCEPTABLE');

  // ۳. حالت بحرانی ناشی از ریزش کش
  const critical = collectCacheMetrics({
    hit_ratio: 0.35,
    memory_pressure: 0.95
  });
  assert.strictEqual(critical.status, 'critical');
  assert.strictEqual(critical.efficiency_grade, 'SUBOPTIMAL');

  console.log('  ✅ صحت مانیتورینگ نسبت برخورد، تخلیه و فشار حافظه کش با موفقیت تایید شد');
}

if (require.main === module) {
  runCacheMonitoringTests();
}

module.exports = { runCacheMonitoringTests };
