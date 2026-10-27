/**
 * تست ساخت شناسنامه جامع سلامت رصدپذیری (P1-SC-03)
 */
'use strict';

const assert = require('assert');
const {
  buildObservabilityHealthSnapshot
} = require('../../../server/monitoring/production-observability');

function runHealthCheckTests() {
  console.log('▸ تست ۳: ساخت شناسنامه جامع سلامت رصدپذیری (health-check)');

  const user = { id: 10, role: 'manager', school_id: 101, region_id: 1 };
  const snapshot = buildObservabilityHealthSnapshot({ schoolId: 101, regionId: 1, user });

  // ۱. ساختار و فیلدهای هویتی (N-11: بدون نمونه اندازه‌گیری‌شده وضعیت باید unknown باشد، نه healthy ساختگی)
  assert(snapshot.snapshot_id.startsWith('OBS-HLTH-101-'));
  assert.strictEqual(snapshot.phase, 'PHASE_4');
  assert.strictEqual(snapshot.scope, 'PRODUCTION_OBSERVABILITY_LAYER');
  assert.strictEqual(snapshot.status, 'unknown');
  assert(typeof snapshot.timestamp === 'string');
  assert.strictEqual(snapshot.school_id, 101);
  assert.strictEqual(snapshot.region_id, 1);

  // ۲. وضعیت سرویس‌های اصلی در حالت بدون ورودی اندازه‌گیری‌شده
  assert.strictEqual(snapshot.services.database, 'unknown');
  assert.strictEqual(snapshot.services.redis, 'unknown');
  assert.strictEqual(snapshot.services.event_queue, 'unknown');
  assert.strictEqual(snapshot.services.api_gateway, 'unknown');

  // ۲ب. وضعیت healthy زمانی برقرار می‌شود که هر چهار لایه نمونه سالم واقعی داشته باشند
  const measuredHealthy = buildObservabilityHealthSnapshot(
    { schoolId: 101, regionId: 1, user },
    {
      applicationMetrics: { latency_p95_ms: 45, latency_p99_ms: 90, total_requests: 500, error_count: 0 },
      databaseMetrics: { active_connections: 12, max_connections: 100, query_latency_p95_ms: 8 },
      queueMetrics: { dead_letter_queue_size: 0, consumer_lag: 2 },
      cacheMetrics: { hit_ratio: 0.92, memory_pressure: 0.30 }
    }
  );
  assert.strictEqual(measuredHealthy.status, 'healthy');
  assert.strictEqual(measuredHealthy.services.database, 'healthy');
  assert.strictEqual(measuredHealthy.services.redis, 'healthy');
  assert.strictEqual(measuredHealthy.services.event_queue, 'healthy');
  assert.strictEqual(measuredHealthy.services.api_gateway, 'healthy');

  // ۳. ظرفیت و متریک‌ها
  assert(snapshot.capacity.cpu);
  assert(snapshot.capacity.memory);
  assert(snapshot.capacity.connections);
  assert(snapshot.metrics.application);
  assert(snapshot.metrics.database);
  assert(snapshot.metrics.queue);
  assert(snapshot.metrics.cache);

  // ۴. وضعیت در حالت تخریب یکی از سرویس‌ها
  const degradedSnapshot = buildObservabilityHealthSnapshot(
    { schoolId: 101, regionId: 1, user },
    {
      queueMetrics: { dead_letter_queue_size: 2, consumer_lag: 120 }
    }
  );
  assert.strictEqual(degradedSnapshot.status, 'degraded');
  assert.strictEqual(degradedSnapshot.services.event_queue, 'degraded');
  assert(degradedSnapshot.anomalies.length > 0);
  assert(degradedSnapshot.operational_alerts.length > 0);

  console.log('  ✅ ساخت و ارزیابی شناسنامه جامع سلامت رصدپذیری با موفقیت تایید شد');
}

if (require.main === module) {
  runHealthCheckTests();
}

module.exports = { runHealthCheckTests };
