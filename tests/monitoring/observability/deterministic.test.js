/**
 * تست قطعیت محاسبات و انجماد عمیق داده‌ها (P1-SC-03)
 */
'use strict';

const assert = require('assert');
const {
  buildObservabilityHealthSnapshot,
  collectApplicationMetrics,
  collectDatabaseMetrics,
  collectQueueMetrics,
  collectCacheMetrics
} = require('../../../server/monitoring/production-observability');

function runDeterministicTests() {
  console.log('▸ تست ۹: قطعیت جبری ۱۰۰٪ و ایمنی در برابر جهش داده‌ها (deterministic)');

  const user = { id: 10, role: 'manager', school_id: 101, region_id: 1 };
  const mockOptions = {
    applicationMetrics: { latency_p99_ms: 120, error_count: 2, total_requests: 5000 },
    databaseMetrics: { active_connections: 30, max_connections: 100 },
    queueMetrics: { event_throughput_per_sec: 200, consumer_lag: 10 },
    cacheMetrics: { hit_ratio: 0.85, eviction_rate: 1 }
  };

  // ۱. انجماد عمیق و ممانعت از تغییر شیء
  const snapshot = buildObservabilityHealthSnapshot({ schoolId: 101, regionId: 1, user }, mockOptions);
  assert(Object.isFrozen(snapshot));
  assert(Object.isFrozen(snapshot.services));
  assert(Object.isFrozen(snapshot.capacity));
  assert(Object.isFrozen(snapshot.metrics));
  assert(Object.isFrozen(snapshot.governance_and_invariants));

  assert.throws(() => {
    snapshot.status = 'hacked';
  }, /TypeError/);

  assert.throws(() => {
    snapshot.services.database = 'down';
  }, /TypeError/);

  // ۲. بررسی قطعیت محاسبات در ۱۰ تکرار متوالی
  for (let i = 0; i < 10; i++) {
    const app = collectApplicationMetrics(mockOptions.applicationMetrics);
    const db = collectDatabaseMetrics(mockOptions.databaseMetrics);
    const q = collectQueueMetrics(mockOptions.queueMetrics);
    const c = collectCacheMetrics(mockOptions.cacheMetrics);

    assert.strictEqual(app.status, 'healthy');
    assert.strictEqual(app.latency_ms.p99, 120);
    assert.strictEqual(db.status, 'healthy');
    assert.strictEqual(db.connection_pool.utilization_ratio, 0.3);
    assert.strictEqual(q.status, 'healthy');
    assert.strictEqual(q.consumer_lag, 10);
    assert.strictEqual(c.status, 'healthy');
    assert.strictEqual(c.hit_ratio, 0.85);
  }

  console.log('  ✅ انجماد عمیق و قطعیت جبری ۱۰۰٪ در ۱۰ اجرای متوالی تایید شد');
}

if (require.main === module) {
  runDeterministicTests();
}

module.exports = { runDeterministicTests };
