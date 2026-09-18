/**
 * تست مانیتورینگ بلادرنگ صف رویدادها، تاخیر مصرف و DLQ (P1-SC-03)
 */
'use strict';

const assert = require('assert');
const {
  collectQueueMetrics
} = require('../../../server/monitoring/production-observability');

function runQueueMonitoringTests() {
  console.log('▸ تست ۵: مانیتورینگ بلادرنگ صف رویدادها، تاخیر و DLQ (queue-monitoring)');

  // ۱. حالت نرمال خط لوله رویدادها
  const nominal = collectQueueMetrics({
    event_throughput_per_sec: 250,
    consumer_lag: 5,
    retry_rate: 0.002,
    dead_letter_queue_size: 0
  });

  assert.strictEqual(nominal.status, 'healthy');
  assert.strictEqual(nominal.pipeline_state, 'STREAMING_NOMINAL');
  assert.strictEqual(nominal.consumer_lag, 5);
  assert.strictEqual(nominal.dead_letter_queue_size, 0);

  // ۲. حالت افزایش تاخیر مصرف‌کنندگان
  const degraded = collectQueueMetrics({
    event_throughput_per_sec: 180,
    consumer_lag: 150,
    retry_rate: 0.06,
    dead_letter_queue_size: 2
  });
  assert.strictEqual(degraded.status, 'degraded');
  assert.strictEqual(degraded.pipeline_state, 'PRESSURE_DETECTED');

  // ۳. حالت انباشتگی بحرانی DLQ
  const critical = collectQueueMetrics({
    event_throughput_per_sec: 50,
    consumer_lag: 600,
    dead_letter_queue_size: 15
  });
  assert.strictEqual(critical.status, 'critical');
  assert.strictEqual(critical.pipeline_state, 'BACKPRESSURE_CRITICAL');

  console.log('  ✅ صحت مانیتورینگ صف رویدادها، تاخیر و صف مرده با موفقیت تایید شد');
}

if (require.main === module) {
  runQueueMonitoringTests();
}

module.exports = { runQueueMonitoringTests };
