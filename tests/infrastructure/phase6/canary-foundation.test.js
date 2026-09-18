/**
 * tests/infrastructure/phase6/canary-foundation.test.js
 * Stage 1: Canary Foundation & Dynamic Routing Test Suite
 */

'use strict';

const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../');
const { Phase6CanaryEngine, CANARY_STATES, CANARY_ERRORS } = require(path.join(ROOT, 'server/infrastructure/phase6-canary-engine'));

async function testCanaryLifecycle() {
  console.log('▸ Phase 6 Test 1: Canary Cluster Registration & Weight Lifecycle');

  const engine = new Phase6CanaryEngine();
  const operator = { id: 'admin-01', role: 'superadmin' };
  const validGovernance = {
    approved: true,
    automated_decision: false,
    automated_execution: false,
    requires_human_approval: true,
    operator
  };

  // ۱. ثبت کلاستر جدید
  const customCluster = engine.registerCluster({
    id: 'ir-coastal-1',
    name: 'کلاستر سواحل مکران',
    provinces: ['99'],
    primaryDc: 'chabahar-dc-01',
    secondaryDc: 'bandar-dc-01',
    capacityTps: 1500,
    weight: 0
  }, validGovernance);

  assert.strictEqual(customCluster.id, 'ir-coastal-1');
  assert.strictEqual(customCluster.weight, 0);
  console.log('  ✅ 1.1 Custom Cluster successfully registered');

  // ۲. تغییر وزن ترافیک به ۵٪ (Canary)
  const updatedWeight = engine.setTrafficWeight('ir-coastal-1', 5, validGovernance);
  assert.strictEqual(updatedWeight.weight, 5);
  console.log('  ✅ 1.2 Traffic weight successfully updated to 5%');

  // ۳. هدایت درخواست به کلاستر ثبت‌شده
  const route = engine.routeRequest('99');
  assert.strictEqual(route.clusterId, 'ir-coastal-1');
  assert.strictEqual(route.targetDc, 'chabahar-dc-01');
  assert.strictEqual(route.failoverMode, false);
  console.log('  ✅ 1.3 Request correctly routed to custom cluster primary DC');

  // ۴. حذف کلاستر
  const unreg = engine.unregisterCluster('ir-coastal-1', validGovernance);
  assert.strictEqual(unreg, true);
  console.log('  ✅ 1.4 Cluster successfully unregistered');
}

async function testAutomaticRollback() {
  console.log('▸ Phase 6 Test 2: Automated Rollback Protection & Circuit Breaker');

  const engine = new Phase6CanaryEngine();
  const validGovernance = {
    approved: true,
    automated_decision: false,
    automated_execution: false,
    requires_human_approval: true,
    operator: { id: 'admin-01', role: 'superadmin' }
  };

  // تنظیم وزن ۲۵٪ برای کلاستر اصفهان
  engine.setTrafficWeight('ir-isfahan-1', 25, validGovernance);
  assert.strictEqual(engine.clusters.get('ir-isfahan-1').weight, 25);

  // شبیه‌سازی ۵ خطای متوالی یا تاخیر شدید
  for (let i = 0; i < 6; i++) {
    engine.recordTelemetry('ir-isfahan-1', { latencyMs: 600, errorOccurred: true });
  }

  const isfahan = engine.clusters.get('ir-isfahan-1');
  assert.strictEqual(isfahan.circuitBreakerOpen, true, 'Circuit breaker must be open');
  assert.strictEqual(isfahan.status, CANARY_STATES.DEGRADED, 'Status must be DEGRADED');
  assert.strictEqual(isfahan.weight, 0, 'Canary weight must be automatically rolled back to 0');
  console.log('  ✅ 2.1 Automated rollback triggered: Weight reverted to 0% and circuit opened');

  // بررسی رفتار Failover: درخواست باید به دیتاسنتر ثانویه منتقل شود
  const route = engine.routeRequest('04'); // استان اصفهان
  assert.strictEqual(route.clusterId, 'ir-isfahan-1');
  assert.strictEqual(route.failoverMode, true, 'Must failover to secondary DC');
  assert.strictEqual(route.targetDc, 'isfahan-dc-02');
  console.log('  ✅ 2.2 Traffic successfully routed to secondary backup DC under circuit break');
}

async function main() {
  console.log('===================================================================');
  console.log('🧪 Running Suite 1: Canary Foundation & Dynamic Routing');
  console.log('===================================================================');

  await testCanaryLifecycle();
  await testAutomaticRollback();

  console.log('───────────────────────────────────────────────────────────────────');
  console.log('✅ Suite 1 (Canary Foundation) PASSED 100%');
  console.log('===================================================================');
}

main().catch(err => {
  console.error('❌ Suite 1 Failed:', err);
  process.exit(1);
});
