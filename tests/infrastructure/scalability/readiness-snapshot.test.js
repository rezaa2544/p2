/**
 * آزمون ۴: ساخت شناسنامه جامع آمادگی عملیاتی تولید (readiness-snapshot)
 */

'use strict';

const assert = require('assert');
const {
  buildProductionReadinessSnapshot,
  SCALABILITY_STATUS
} = require('../../../server/infrastructure/scalability-foundation');

function runTests() {
  console.log('▸ تست ۴: ساخت شناسنامه جامع آمادگی عملیاتی تولید (readiness-snapshot)');

  const mockUser = {
    id: 10,
    role: 'manager',
    school_id: 101,
    region_id: 1
  };

  const snapshot = buildProductionReadinessSnapshot({
    schoolId: 101,
    regionId: 1,
    user: mockUser
  });

  assert.strictEqual(snapshot.phase, 'PHASE_4');
  assert.strictEqual(snapshot.school_id, 101);
  assert.strictEqual(snapshot.production_readiness_status, SCALABILITY_STATUS.PRODUCTION_READY);
  assert.strictEqual(snapshot.horizontal_scaling_architecture.stateless_request_boundary, true);
  assert.strictEqual(snapshot.horizontal_scaling_architecture.cluster_safe, true);
  assert.ok(snapshot.distributed_cache_infrastructure.sample_tenant_key.includes('payesh:t:101:'));
  assert.strictEqual(snapshot.governance_and_compliance.human_decision_sovereignty.enforced, true);
  assert.strictEqual(snapshot.governance_and_compliance.zero_ranking_guarantee.enforced, true);

  // سناریوی نیازمند بهینه‌سازی (NEEDS_OPTIMIZATION)
  const optSnapshot = buildProductionReadinessSnapshot({
    schoolId: 101,
    regionId: 1,
    systemMetrics: { db_pool_active: 46, db_pool_max: 50 },
    user: mockUser
  });
  assert.strictEqual(optSnapshot.production_readiness_status, SCALABILITY_STATUS.NEEDS_OPTIMIZATION);

  // سناریوی مسدودسازی به دلیل افت بحرانی کش
  const blockedSnapshot = buildProductionReadinessSnapshot({
    schoolId: 101,
    regionId: 1,
    cacheMetrics: { hits: 100, misses: 900 },
    user: mockUser
  });
  assert.strictEqual(blockedSnapshot.production_readiness_status, SCALABILITY_STATUS.BLOCKED);

  console.log('  ✅ ساخت کامل شناسنامه آمادگی تولید و تغییر وضعیت‌های کیفی تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
