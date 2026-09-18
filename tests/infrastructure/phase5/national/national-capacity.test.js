/**
 * tests/infrastructure/phase5/national/national-capacity.test.js
 * آزمون موتور برنامه‌ریزی و مدل ظرفیت ملی پایش (P2-NI-01)
 */

'use strict';

const assert = require('assert');
const {
  NATIONAL_TARGET_CAPACITY,
  getNationalCapacityModel,
  evaluateCapacityRecommendation,
  applyNationalCapacityAdjustment,
  CAPACITY_ENGINE_ERRORS
} = require('../../../../server/infrastructure/national-capacity-engine');

console.log('--- آزمون موتور برنامه‌ریزی و ظرفیت ملی ---');

// ۱. بررسی مدل کلان ظرفیت ملی
const model = getNationalCapacityModel();
assert.strictEqual(model.model_id, 'CAP-MODEL-PHASE5-NATIONAL-OFFICIAL');
assert.strictEqual(model.national_targets.total_registered_users, 10000000);
assert.strictEqual(model.national_targets.peak_rps_target, 20000);
assert.strictEqual(model.auto_scaling_policy.auto_scaling_execution, false);
assert.strictEqual(model.human_governance.requires_human_approval, true);

// ۲. ارزیابی الگوریتم پیشنهاد ظرفیت (صرفاً پیشنهاد — عدم اجرا)
const advisory = evaluateCapacityRecommendation('ir-tehran-1', {
  active_rps: 3100, // بالای ۸۰٪ ظرفیت ۳۵۰۰
  concurrent_users: 1300000
});

assert.strictEqual(advisory.capacity_recommendation.advisory_type, 'SCALE_UP_RECOMMENDED');
assert.strictEqual(advisory.capacity_recommendation.execution_blocked, true);
assert.strictEqual(advisory.capacity_recommendation.automated_execution, false);
assert.strictEqual(advisory.capacity_recommendation.requires_human_approval, true);

// ۳. رد اجرای خودکار تغییر ظرفیت (auto_scale: true)
assert.throws(() => {
  applyNationalCapacityAdjustment({
    region_id: 'ir-tehran-1',
    auto_scale: true,
    approved: true,
    operator: { id: 1, role: 'superadmin' }
  });
}, (err) => {
  assert.strictEqual(err.code, CAPACITY_ENGINE_ERRORS.AUTOSCALE_FORBIDDEN);
  return true;
});

// ۴. ثبت موفق تعدیل ظرفیت با تاییدیه مستقیم اپراتور انسانی
const receipt = applyNationalCapacityAdjustment({
  region_id: 'ir-tehran-1',
  delta_rps: 500,
  approved: true,
  auto_scale: false,
  automated_decision: false,
  automated_execution: false,
  requires_human_approval: true,
  operator: { id: 1, role: 'superadmin', name: 'مدیر کل زیرساخت' }
});

assert.strictEqual(receipt.status, 'COMMITTED');
assert.strictEqual(receipt.human_approved, true);

console.log('✅ ۲/۷: موتور برنامه‌ریزی ظرفیت ملی و مهار تصمیمات خودکار تایید شد');
