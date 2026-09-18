/**
 * تست مانیتورینگ بلادرنگ پایگاه داده و استخر اتصالات (P1-SC-03)
 */
'use strict';

const assert = require('assert');
const {
  collectDatabaseMetrics
} = require('../../../server/monitoring/production-observability');

function runDatabaseMonitoringTests() {
  console.log('▸ تست ۴: مانیتورینگ بلادرنگ پایگاه داده و استخر اتصالات (database-monitoring)');

  // ۱. حالت نرمال و بهینه
  const nominal = collectDatabaseMetrics({
    active_connections: 25,
    max_connections: 100,
    slow_query_count: 0,
    transaction_latency_ms: 10,
    deadlock_count: 0
  });

  assert.strictEqual(nominal.status, 'healthy');
  assert.strictEqual(nominal.connection_pool.utilization_ratio, 0.25);
  assert.strictEqual(nominal.connection_pool.state, 'STABLE');
  assert.strictEqual(nominal.slow_queries.slow_query_count, 0);
  assert.strictEqual(nominal.deadlocks.deadlock_count, 0);

  // ۲. حالت اشباع اتصالات و تخریب کارایی
  const degraded = collectDatabaseMetrics({
    active_connections: 75,
    max_connections: 100,
    slow_query_count: 8,
    transaction_latency_ms: 120
  });
  assert.strictEqual(degraded.status, 'degraded');
  assert.strictEqual(degraded.connection_pool.utilization_ratio, 0.75);

  // ۳. حالت بحرانی ناشی از ددلاک یا اشباع کامل
  const critical = collectDatabaseMetrics({
    active_connections: 95,
    max_connections: 100,
    deadlock_count: 2
  });
  assert.strictEqual(critical.status, 'critical');
  assert.strictEqual(critical.connection_pool.state, 'SATURATED');
  assert.strictEqual(critical.deadlocks.deadlock_count, 2);

  console.log('  ✅ صحت مانیتورینگ پایگاه داده، اتصالات و ددلاک‌ها با موفقیت تایید شد');
}

if (require.main === module) {
  runDatabaseMonitoringTests();
}

module.exports = { runDatabaseMonitoringTests };
