/**
 * tests/infrastructure/phase5/region-isolation/cross-region-leakage.test.js
 * آزمون مهار نشت داده‌های بین‌منطقه‌ای و خطاهای اجباری (P2-PL-01)
 */

'use strict';

const assert = require('assert');
const {
  FEDERATION_ERRORS
} = require('../../../../server/infrastructure/phase5-region-federation');

const {
  validateRegionAccess,
  enforceGeographicBoundary
} = require('../../../../server/infrastructure/geographic-isolation');

console.log('--- آزمون مهار نشت داده‌های بین‌منطقه‌ای ---');

// ۱. تلاش کاربر منطقه ۱ برای دسترسی به کلاستر منطقه ۲ -> PHASE5_REGION_ISOLATION_VIOLATION
const eduOffice1 = { role: 'edu_office', id: 10, region_id: 'ir-tehran-1' };
assert.throws(() => {
  validateRegionAccess(eduOffice1, 'ir-isfahan-1');
}, (err) => {
  assert.strictEqual(err.code, FEDERATION_ERRORS.REGION_ISOLATION_VIOLATION);
  return true;
});

// ۲. نقض مرز مستأجر مدرسه (IDOR بین مدارس) -> PHASE5_TENANT_BOUNDARY_BREACH
const schoolManager = { role: 'manager', id: 25, school_id: 101 };
assert.throws(() => {
  enforceGeographicBoundary({
    user: schoolManager,
    school_id: 202
  });
}, (err) => {
  assert.strictEqual(err.code, FEDERATION_ERRORS.TENANT_BOUNDARY_BREACH);
  return true;
});

console.log('✅ ۲/۳: مهار نشت بین‌منطقه‌ای و کدهای خطای رسمی با موفقیت تایید شد');
