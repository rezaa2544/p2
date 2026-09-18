/**
 * tests/infrastructure/phase5/national/traffic-fabric.test.js
 * آزمون فابریک ترافیک ملی و اوزان توزیع قناری (P2-NI-01)
 */

'use strict';

const assert = require('assert');
const {
  ALLOWED_TRAFFIC_WEIGHTS,
  getNationalTrafficFabricTopology,
  updateNationalTrafficWeight,
  TRAFFIC_FABRIC_ERRORS
} = require('../../../../server/infrastructure/national-traffic-fabric');

console.log('--- آزمون فابریک ترافیک ملی و توزیع وزن‌ها ---');

// ۱. دریافت توپولوژی فابریک ترافیک ملی
const topology = getNationalTrafficFabricTopology();
assert.strictEqual(topology.fabric_id, 'TRAFFIC-FABRIC-PHASE5-NATIONAL');
assert.strictEqual(topology.total_regions, 7);
assert.deepStrictEqual(topology.allowed_weights, [0, 5, 10, 25, 50, 100]);
assert.strictEqual(topology.governance.requires_human_approval, true);

// ۲. تنظیم وزن ترافیک با تایید اپراتور انسانی
const updatedWeight = updateNationalTrafficWeight('ir-tehran-1', 50, {
  approved: true,
  automated_decision: false,
  automated_execution: false,
  requires_human_approval: true,
  operator: { id: 1, role: 'superadmin' }
});

assert.strictEqual(updatedWeight.allocated_weight, 50);
assert.strictEqual(updatedWeight.canary_stage, 'STAGE_CANARY_HALF');

// بازگردانی به ۱۰۰
updateNationalTrafficWeight('ir-tehran-1', 100, {
  approved: true,
  automated_decision: false,
  automated_execution: false,
  requires_human_approval: true,
  operator: { id: 1, role: 'superadmin' }
});

// ۳. رد وزن غیرمجاز (مثلاً ۳۳٪) -> PHASE5_INVALID_TRAFFIC_WEIGHT
assert.throws(() => {
  updateNationalTrafficWeight('ir-tehran-1', 33, {
    approved: true,
    operator: { id: 1, role: 'superadmin' }
  });
}, (err) => {
  assert.strictEqual(err.code, TRAFFIC_FABRIC_ERRORS.INVALID_WEIGHT);
  return true;
});

// ۴. رد تغییر وزن بدون تاییدیه صریح انسانی -> PHASE5_NATIONAL_TRAFFIC_APPROVAL_REQUIRED
assert.throws(() => {
  updateNationalTrafficWeight('ir-tehran-1', 25, {
    approved: false,
    operator: { id: 1, role: 'superadmin' }
  });
}, (err) => {
  assert.strictEqual(err.code, TRAFFIC_FABRIC_ERRORS.APPROVAL_REQUIRED);
  return true;
});

console.log('✅ ۳/۷: فابریک ترافیک ملی و اوزان قناری با موفقیت تایید شد');
