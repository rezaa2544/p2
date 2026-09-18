/**
 * تست تخصیص ترافیک و استراتژی انتشار تدریجی قناری (P1-SC-05)
 */
'use strict';

const assert = require('assert');
const {
  allocateTraffic,
  PILOT_STAGE,
  CANARY_ROUTING_STRATEGY
} = require('../../../server/deployment/pilot-traffic-management');

function runTrafficAllocationTests() {
  console.log('▸ تست ۱: تخصیص ترافیک و مراحل انتشار تدریجی (traffic-allocation)');

  // ۱. تخصیص پیش‌فرض مرحله پایلوت محدود (۱۰ درصد)
  const defaultLimited = allocateTraffic();
  assert.strictEqual(defaultLimited.pilot_phase, PILOT_STAGE.LIMITED_SCHOOL);
  assert.strictEqual(defaultLimited.traffic_percentage, 10);
  assert.strictEqual(defaultLimited.allocated, 10);
  assert.strictEqual(defaultLimited.routing_strategy, CANARY_ROUTING_STRATEGY.TENANT_ALLOWLIST);
  assert.strictEqual(defaultLimited.rollback_ready, true);

  // ۲. درصد ترافیک مراحل مختلف
  const dev = allocateTraffic({ pilot_stage: PILOT_STAGE.DEVELOPMENT });
  assert.strictEqual(dev.traffic_percentage, 0);

  const internal = allocateTraffic({ pilot_stage: PILOT_STAGE.INTERNAL_PILOT });
  assert.strictEqual(internal.traffic_percentage, 5);

  const regional = allocateTraffic({ pilot_stage: PILOT_STAGE.REGIONAL_PILOT });
  assert.strictEqual(regional.traffic_percentage, 25);

  const national = allocateTraffic({ pilot_stage: PILOT_STAGE.NATIONAL_READINESS });
  assert.strictEqual(national.traffic_percentage, 100);

  // ۳. مرزبندی مقادیر سفارشی (Clamp 0-100)
  const cappedLow = allocateTraffic({ traffic_percentage: -10 });
  assert.strictEqual(cappedLow.traffic_percentage, 0);

  const cappedHigh = allocateTraffic({ traffic_percentage: 150 });
  assert.strictEqual(cappedHigh.traffic_percentage, 100);

  console.log('  ✅ صحت تخصیص درصدی ترافیک، استراتژی قناری و مرزبندی مراحل تایید شد');
}

if (require.main === module) {
  runTrafficAllocationTests();
}

module.exports = { runTrafficAllocationTests };
