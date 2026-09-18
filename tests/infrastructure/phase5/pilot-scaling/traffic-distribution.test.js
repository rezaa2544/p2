/**
 * tests/infrastructure/phase5/pilot-scaling/traffic-distribution.test.js
 * آزمون هدایت ترافیک قناری، گام‌های ۵٪ تا ۱۰۰٪ و گیت نظارت انسانی (P2-PL-02)
 */

'use strict';

const assert = require('assert');
const {
  PROVINCIAL_PILOT_STATUS,
  ALLOWED_ROLLOUT_PERCENTAGES,
  updateProvincialTrafficRollout,
  PILOT_SCALING_ERRORS
} = require('../../../../server/infrastructure/provincial-pilot-scaling');

console.log('--- آزمون هدایت ترافیک قناری و توزیع کنترل‌شده بار ---');

// ۱. تنظیم ۵٪ ترافیک قناری با تایید اپراتور انسانی
const canary5 = updateProvincialTrafficRollout('tehran', 5, {
  approved: true,
  automated_decision: false,
  automated_execution: false,
  requires_human_approval: true,
  operator: { id: 1, role: 'superadmin' }
});

assert.strictEqual(canary5.traffic_rollout_pct, 5);
assert.strictEqual(canary5.pilot_status, PROVINCIAL_PILOT_STATUS.CANARY_ACTIVE);
assert.strictEqual(canary5.capacity_profile.current_rps, Math.round(canary5.capacity_profile.max_rps * 0.05));

// ۲. افزایش تدریجی به ۲۵٪ و سپس ۵۰٪
const canary25 = updateProvincialTrafficRollout('tehran', 25, {
  approved: true,
  automated_decision: false,
  automated_execution: false,
  requires_human_approval: true,
  operator: { id: 1, role: 'superadmin' }
});
assert.strictEqual(canary25.traffic_rollout_pct, 25);
assert.strictEqual(canary25.pilot_status, PROVINCIAL_PILOT_STATUS.CANARY_ACTIVE);

// ۳. تکمیل ترافیک به ۱۰۰٪ و تغییر وضعیت به ACTIVE
const full100 = updateProvincialTrafficRollout('tehran', 100, {
  approved: true,
  automated_decision: false,
  automated_execution: false,
  requires_human_approval: true,
  operator: { id: 1, role: 'superadmin' }
});
assert.strictEqual(full100.traffic_rollout_pct, 100);
assert.strictEqual(full100.pilot_status, PROVINCIAL_PILOT_STATUS.ACTIVE);
assert.strictEqual(full100.capacity_profile.current_rps, full100.capacity_profile.max_rps);

// ۴. رد درصد نامعتبر (مثلاً ۱۷٪ که جزو مقادیر مصوب نیست) -> PHASE5_TRAFFIC_POLICY_FAILURE
assert.throws(() => {
  updateProvincialTrafficRollout('tehran', 17, {
    approved: true,
    automated_decision: false,
    automated_execution: false,
    requires_human_approval: true,
    operator: { id: 1, role: 'superadmin' }
  });
}, (err) => {
  assert.strictEqual(err.code, PILOT_SCALING_ERRORS.TRAFFIC_POLICY_FAILURE);
  return true;
});

// ۵. رد تغییر ترافیک بدون تاییدیه صریح انسانی -> PHASE5_ROLLOUT_APPROVAL_REQUIRED
assert.throws(() => {
  updateProvincialTrafficRollout('tehran', 50, {
    approved: false,
    operator: { id: 1, role: 'superadmin' }
  });
}, (err) => {
  assert.strictEqual(err.code, PILOT_SCALING_ERRORS.ROLLOUT_APPROVAL_REQUIRED);
  return true;
});

console.log('✅ ۲/۴: توزیع کنترل‌شده ترافیک قناری و انطباق درصدی با موفقیت تایید شد');
