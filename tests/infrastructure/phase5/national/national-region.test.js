/**
 * tests/infrastructure/phase5/national/national-region.test.js
 * آزمون کنترل‌پلین کلاسترهای منطقه‌ای ملی و ماشین وضعیت (P2-NI-01)
 */

'use strict';

const assert = require('assert');
const {
  NATIONAL_REGION_STATE,
  CANONICAL_NATIONAL_REGIONS,
  getNationalRegionRegistry,
  getNationalRegionById,
  updateNationalRegionState,
  calculateNationalRegionHealthSummary,
  NATIONAL_CONTROL_ERRORS
} = require('../../../../server/infrastructure/national-region-control-plane');

console.log('--- آزمون کنترل‌پلین کلاسترهای منطقه‌ای ملی ---');

// ۱. بررسی کاتالوگ ۷ کلاستر ملی
const regions = getNationalRegionRegistry();
assert.strictEqual(regions.length, 7, 'تعداد کلاسترهای ملی باید دقیقاً ۷ باشد');

// ۲. واکشی کلاستر خاص
const tehran = getNationalRegionById('ir-tehran-1');
assert.ok(tehran);
assert.strictEqual(tehran.cluster_id, 'cluster-tehran-prod-01');
assert.strictEqual(tehran.primary_dc, 'tehran-dc-01');
assert.strictEqual(tehran.secondary_dc, 'tehran-dc-02');
assert.ok(tehran.capacity_profile.max_rps >= 3500);

// ۳. به‌روزرسانی وضعیت با تاییدیه معتبر اپراتور انسانی
const updated = updateNationalRegionState('ir-tehran-1', NATIONAL_REGION_STATE.MAINTENANCE, {
  approved: true,
  automated_decision: false,
  automated_execution: false,
  requires_human_approval: true,
  operator: { id: 1, role: 'superadmin', name: 'مدیر کل زیرساخت ملی' }
});

assert.strictEqual(updated.health_status, NATIONAL_REGION_STATE.MAINTENANCE);

// بازگردانی به ACTIVE
updateNationalRegionState('ir-tehran-1', NATIONAL_REGION_STATE.ACTIVE, {
  approved: true,
  automated_decision: false,
  automated_execution: false,
  requires_human_approval: true,
  operator: { id: 1, role: 'superadmin' }
});

// ۴. رد تغییر وضعیت خودکار
assert.throws(() => {
  updateNationalRegionState('ir-isfahan-1', NATIONAL_REGION_STATE.DEGRADED, {
    approved: true,
    automated_decision: true,
    automated_execution: false,
    requires_human_approval: false,
    operator: { id: 1, role: 'superadmin' }
  });
}, (err) => {
  assert.strictEqual(err.code, NATIONAL_CONTROL_ERRORS.CHANGE_APPROVAL_REQUIRED);
  return true;
});

// ۵. محاسبه خلاصه سلامت کنترل‌پلین
const summary = calculateNationalRegionHealthSummary();
assert.strictEqual(summary.control_plane_id, 'CONTROL-PLANE-PHASE5-NATIONAL');
assert.strictEqual(summary.total_regions, 7);
assert.strictEqual(summary.human_governance.requires_human_approval, true);

console.log('✅ ۱/۷: کنترل‌پلین کلاسترهای ملی و ماشین وضعیت با موفقیت تایید شد');
