/**
 * تست آمادگی سرور جانشین و دسترسی‌پذیری بالا (P1-SC-04)
 */
'use strict';

const assert = require('assert');
const {
  evaluateHighAvailability,
  FAILOVER_STATE
} = require('../../../server/infrastructure/disaster-recovery');

function runFailoverReadinessTests() {
  console.log('▸ تست ۴: ارزیابی آمادگی سرور جانشین و پایداری HA (failover-readiness)');

  // ۱. حالت همگام و آماده ارتقا (STANDBY_READY)
  const nominal = evaluateHighAvailability({
    database_replication_lag_ms: 10,
    redis_replication_lag_ms: 5,
    standby_nodes_healthy: true
  });

  assert.strictEqual(nominal.database, 'healthy');
  assert.strictEqual(nominal.cache, 'healthy');
  assert.strictEqual(nominal.queue, 'healthy');
  assert.strictEqual(nominal.metrics.failover_readiness, FAILOVER_STATE.STANDBY_READY);

  // ۲. حالت تاخیر در همگام‌سازی (REPLICATING)
  const degraded = evaluateHighAvailability({
    database_replication_lag_ms: 800,
    redis_replication_lag_ms: 10,
    standby_nodes_healthy: true
  });
  assert.strictEqual(degraded.database, 'degraded');
  assert.strictEqual(degraded.metrics.failover_readiness, FAILOVER_STATE.REPLICATING);

  // ۳. حالت ناهماهنگی بحرانی (DESYNCHRONIZED)
  const critical = evaluateHighAvailability({
    database_replication_lag_ms: 6000,
    standby_nodes_healthy: false
  });
  assert.strictEqual(critical.database, 'critical');
  assert.strictEqual(critical.metrics.failover_readiness, FAILOVER_STATE.DESYNCHRONIZED);

  console.log('  ✅ صحت ارزیابی آمادگی سرور جانشین و پایداری کلاستر با موفقیت تایید شد');
}

if (require.main === module) {
  runFailoverReadinessTests();
}

module.exports = { runFailoverReadinessTests };
