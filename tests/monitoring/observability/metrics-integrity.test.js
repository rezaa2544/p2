/**
 * تست تمامیت محاسبات شاخص‌های عملکردی اپلیکیشن و ظرفیت (P1-SC-03)
 */
'use strict';

const assert = require('assert');
const {
  collectApplicationMetrics,
  collectCapacityMetrics
} = require('../../../server/monitoring/production-observability');

function runMetricsIntegrityTests() {
  console.log('▸ تست ۲: تمامیت محاسبات شاخص‌های عملکردی و ظرفیت (metrics-integrity)');

  // ۱. ارزیابی شاخص‌های پیش‌فرض اپلیکیشن
  const defaultApp = collectApplicationMetrics();
  assert.strictEqual(defaultApp.status, 'healthy');
  assert.strictEqual(defaultApp.request_rate_per_sec, 250);
  assert.strictEqual(defaultApp.error_rate, 0.0001);
  assert.strictEqual(defaultApp.latency_ms.p50, 18);
  assert.strictEqual(defaultApp.latency_ms.p95, 65);
  assert.strictEqual(defaultApp.latency_ms.p99, 140);
  assert.strictEqual(defaultApp.slo_compliance.p99_under_1s, true);
  assert.strictEqual(defaultApp.slo_compliance.error_rate_under_point_one_pct, true);

  // ۲. ارزیابی تاخیر بالا و تغییر وضعیت به بحرانی
  const degradedApp = collectApplicationMetrics({
    latency_p99_ms: 450,
    error_count: 15,
    total_requests: 1000
  });
  assert.strictEqual(degradedApp.status, 'degraded');
  assert.strictEqual(degradedApp.latency_ms.p99, 450);
  assert.strictEqual(degradedApp.error_rate, 0.015);

  const criticalApp = collectApplicationMetrics({
    latency_p99_ms: 1200,
    error_count: 600,
    total_requests: 10000
  });
  assert.strictEqual(criticalApp.status, 'critical');
  assert.strictEqual(criticalApp.slo_compliance.p99_under_1s, false);

  // ۳. ارزیابی شاخص‌های ظرفیت منابع
  const capacity = collectCapacityMetrics({
    cpu_utilization_pct: 45.0,
    active_connections: 500,
    max_connections: 2000
  });

  assert(Number.isFinite(capacity.cpu.utilization_pct));
  assert(Number.isFinite(capacity.cpu.cores_available));
  assert(Number.isFinite(capacity.memory.rss_bytes));
  assert(Number.isFinite(capacity.memory.heap_total_bytes));
  assert(Number.isFinite(capacity.memory.heap_used_bytes));
  assert.strictEqual(capacity.connections.saturation_pct, 25.0);
  assert.strictEqual(capacity.connections.status, 'ACCEPTABLE');

  console.log('  ✅ صحت محاسبات شاخص‌های عملکردی و ظرفیت منابع با موفقیت تایید شد');
}

if (require.main === module) {
  runMetricsIntegrityTests();
}

module.exports = { runMetricsIntegrityTests };
