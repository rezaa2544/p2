/**
 * tests/infrastructure/phase5/pilot-scaling/capacity-scaling.test.js
 * آزمون موتور مقیاس‌پذیری ظرفیت و مهار سرریز سهمیه‌ها (P2-PL-02)
 */

'use strict';

const assert = require('assert');
const {
  getProvincialCapacityOverview,
  assertCapacityQuota,
  PILOT_SCALING_ERRORS
} = require('../../../../server/infrastructure/provincial-pilot-scaling');

console.log('--- آزمون موتور مقیاس‌پذیری ظرفیت و کنترل بار ---');

// ۱. استخراج تابلوی جامع ظرفیت ملی
const overview = getProvincialCapacityOverview();
assert.strictEqual(overview.overview_id, 'CAP-PHASE5-PROVINCIAL-PILOT');
assert.ok(overview.total_provinces >= 31);
assert.ok(overview.aggregated_capacity.total_rps_capacity > 0);
assert.ok(overview.aggregated_capacity.total_concurrent_capacity > 0);
assert.strictEqual(overview.human_governance.requires_human_approval, true);
assert.strictEqual(overview.zero_ranking_guarantee.enforced, true);

// ۲. ارزیابی فیلتر منطقه‌ای
const tehranRegionOverview = getProvincialCapacityOverview('ir-tehran-1');
assert.ok(tehranRegionOverview.total_provinces >= 3);
for (const p of tehranRegionOverview.provinces) {
  assert.strictEqual(p.region_id, 'ir-tehran-1');
}

// ۳. بررسی ظرفیت مجاز استان
assert.strictEqual(assertCapacityQuota('tehran', 100, 10000), true);

// ۴. نقض سقف ظرفیت استانی -> PHASE5_CAPACITY_LIMIT_BREACH
assert.throws(() => {
  // استان سمنان ظرفیت ۲۰۰ RPS دارد، درخواست ۱۰۰۰ RPS باید مسدود شود
  assertCapacityQuota('semnan', 1500, 500000);
}, (err) => {
  assert.strictEqual(err.code, PILOT_SCALING_ERRORS.CAPACITY_LIMIT_BREACH);
  return true;
});

console.log('✅ ۳/۴: موتور مقیاس‌پذیری ظرفیت و مهار سرریز بار با موفقیت تایید شد');
