/**
 * tests/infrastructure/phase5/federation/registry-lifecycle.test.js
 * اعتبارسنجی رجیستری کلاسترهای منطقه‌ای و چرخه عمر وضعیت‌ها (P2-PL-01)
 */

'use strict';

const assert = require('assert');
const {
  REGION_STATUS,
  CANONICAL_REGIONS,
  getRegionRegistry,
  getRegionById,
  updateRegionStatusWithApproval
} = require('../../../../server/infrastructure/phase5-region-federation');

console.log('--- آزمون رجیستری کلاسترهای منطقه‌ای و چرخه عمر ---');

// ۱. بررسی کاتالوگ استاندارد ۷ منطقه کاندیدای پایلوت ملی
const registry = getRegionRegistry();
assert.strictEqual(registry.length, 7, 'تعداد کلاسترهای رسمی فاز ۵ باید دقیقاً ۷ باشد');

// ۲. واکشی بر اساس شناسه رشته‌ای و عددی
const tehran = getRegionById('ir-tehran-1');
assert.ok(tehran);
assert.strictEqual(tehran.numeric_id, 1);
assert.strictEqual(tehran.primary_dc, 'tehran-dc-01');

const isfahan = getRegionById(2);
assert.ok(isfahan);
assert.strictEqual(isfahan.region_id, 'ir-isfahan-1');

// ۳. بررسی مناطق با پشتیبانی روستایی و مرزی
const borderWest = getRegionById('ir-border-west-1');
assert.strictEqual(borderWest.border_support, true);
assert.strictEqual(borderWest.rural_support, true);

const ruralCentral = getRegionById('ir-rural-central-1');
assert.strictEqual(ruralCentral.rural_support, true);

// ۴. به‌روزرسانی وضعیت با تایید انسانی
const updated = updateRegionStatusWithApproval('ir-tehran-1', REGION_STATUS.DEGRADED, {
  approved_by_operator: true,
  automated_decision: false,
  automated_execution: false,
  requires_human_approval: true,
  operator_role: 'HUMAN_SUPERVISOR',
  reason: 'تعمیرات دوره‌ای دیتاسنتر اول تهران'
});

assert.strictEqual(updated.ok, true);
assert.strictEqual(updated.new_status, REGION_STATUS.DEGRADED);
assert.strictEqual(updated.approved_by_operator, true);

console.log('✅ ۱/۳: رجیستری کلاسترهای چندمنطقه‌ای و چرخه عمر با موفقیت تایید شد');
