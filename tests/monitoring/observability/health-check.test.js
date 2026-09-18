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

  // ۱. ساختار و فیلدهای هویتی
  assert(snapshot.snapshot_id.startsWith('OBS-HLTH-101-'));
  assert.strictEqual(snapshot.phase, 'PHASE_4');
  assert.strictEqual(snapshot.scope, 'PRODUCTION_OBSERVABILITY_LAYER');
  assert.strictEqual(snapshot.status, 'healthy');
  assert(typeof snapshot.timestamp === 'string');
  assert.strictEqual(snapshot.school_id, 101);
  assert.strictEqual(snapshot.region_id, 1);

  // ۲. وضعیت سرویس‌های اصلی
  assert.strictEqual(snapshot.services.database, 'healthy');
  assert.strictEqual(snapshot.services.redis, 'healthy');
  assert.strictEqual(snapshot.services.event_queue, 'healthy');
  assert.strictEqual(snapshot.services.api_gateway, 'healthy');

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
