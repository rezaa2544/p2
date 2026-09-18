/**
 * tests/infrastructure/phase5/federation/health-sync.test.js
 * آزمون مانیتورینگ سلامت، سنکرونیزاسیون و تاخیر بین‌منطقه‌ای (P2-PL-01)
 */

'use strict';

const assert = require('assert');
const {
  REGION_STATUS,
  calculateFederationHealth
} = require('../../../../server/infrastructure/phase5-region-federation');

console.log('--- آزمون مانیتورینگ سلامت و سنکرونیزاسیون فدراسیون ---');

// ۱. ارزیابی سلامت در حالت نرمال
const normalHealth = calculateFederationHealth();
assert.strictEqual(normalHealth.federation_status, 'HEALTHY');
assert.strictEqual(normalHealth.total_regions, 7);
assert.strictEqual(normalHealth.counts.active, 7);
assert.strictEqual(normalHealth.counts.degraded, 0);
assert.strictEqual(normalHealth.counts.offline, 0);

// ۲. ارزیابی سلامت با وجود یک کلاستر دارای افت عملکرد (Degraded)
const degradedHealth = calculateFederationHealth({
  'ir-border-west-1': {
    status: REGION_STATUS.DEGRADED,
    latency_ms: 120,
    sync_lag_ms: 2500
  }
});
assert.strictEqual(degradedHealth.federation_status, 'DEGRADED');
assert.strictEqual(degradedHealth.counts.degraded, 1);
assert.strictEqual(degradedHealth.regions['ir-border-west-1'].status, REGION_STATUS.DEGRADED);

// ۳. ارزیابی وضعیت بحرانی با خروج کامل یک کلاستر از مدار (Offline)
const criticalHealth = calculateFederationHealth({
  'ir-tabriz-1': {
    status: REGION_STATUS.OFFLINE,
    latency_ms: 9999,
    sync_lag_ms: 99999
  }
});
assert.strictEqual(criticalHealth.federation_status, 'CRITICAL');
assert.strictEqual(criticalHealth.counts.offline, 1);

console.log('✅ ۲/۳: مانیتورینگ سلامت و سنکرونیزاسیون بین‌منطقه‌ای با موفقیت تایید شد');
