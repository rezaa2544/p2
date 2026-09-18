/**
 * تست مسیریابی قطعی مستأجران و کوهورت‌های قناری (P1-SC-05)
 */
'use strict';

const assert = require('assert');
const {
  resolveCanaryRouting
} = require('../../../server/deployment/pilot-traffic-management');

function runCanaryRoutingTests() {
  console.log('▸ تست ۲: مسیریابی قطعی مستأجران و کوهورت‌های قناری (canary-routing)');

  // ۱. مستأجر در فهرست مجاز پایلوت (Allowlist match)
  const allowedTenant = resolveCanaryRouting(101, { allowed_school_ids: [101, 102] });
  assert.strictEqual(allowedTenant.routed_to, 'CANARY');
  assert.strictEqual(allowedTenant.reason, 'TENANT_ALLOWLIST_MATCH');
  assert.strictEqual(allowedTenant.deterministic, true);

  // ۲. مستأجر خارج از فهرست با ترافیک ۰ درصد (باید به Baseline برود)
  const baselineTenant = resolveCanaryRouting(999, { allowed_school_ids: [101], traffic_percentage: 0 });
  assert.strictEqual(baselineTenant.routed_to, 'BASELINE');
  assert.strictEqual(baselineTenant.reason, 'DEFAULT_BASELINE');

  // ۳. مستأجر با ترافیک ۱۰۰ درصد (باید به Canary برود)
  const fullCanary = resolveCanaryRouting(999, { allowed_school_ids: [], traffic_percentage: 100 });
  assert.strictEqual(fullCanary.routed_to, 'CANARY');
  assert.strictEqual(fullCanary.reason, 'PERCENTAGE_HASH_BUCKET');

  // ۴. قطعیت هش: یک شناسه ثابت همواره به یک نتیجه یکسان می‌رسد
  const firstResolve = resolveCanaryRouting(555, { allowed_school_ids: [], traffic_percentage: 50 });
  for (let i = 0; i < 5; i++) {
    const repeatResolve = resolveCanaryRouting(555, { allowed_school_ids: [], traffic_percentage: 50 });
    assert.strictEqual(repeatResolve.routed_to, firstResolve.routed_to);
    assert.strictEqual(repeatResolve.cohort_id, firstResolve.cohort_id);
  }

  // ۵. ورودی خالی
  const emptyTenant = resolveCanaryRouting(null);
  assert.strictEqual(emptyTenant.routed_to, 'BASELINE');

  console.log('  ✅ صحت و قطعیت مسیریابی قناری، فهرست مجاز و توزیع مبتنی بر هش تایید شد');
}

if (require.main === module) {
  runCanaryRoutingTests();
}

module.exports = { runCanaryRoutingTests };
