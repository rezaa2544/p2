/**
 * tests/infrastructure/phase5/region-isolation/data-residency.test.js
 * آزمون سیاست اقامت جغرافیایی داده‌ها و تفکیک استانی (Data Residency)
 */

'use strict';

const assert = require('assert');
const {
  FEDERATION_ERRORS
} = require('../../../../server/infrastructure/phase5-region-federation');

const {
  validateDataResidency,
  enforceGeographicBoundary
} = require('../../../../server/infrastructure/geographic-isolation');

console.log('--- آزمون سیاست اقامت جغرافیایی داده‌ها ---');

// ۱. اقامت مجاز استان تهران در کلاستر تهران
assert.strictEqual(validateDataResidency('تهران', 'ir-tehran-1'), true);

// ۲. اقامت مجاز استان خوزستان در کلاستر مرزی غرب
assert.strictEqual(validateDataResidency('خوزستان', 'ir-border-west-1'), true);

// ۳. نقض اقامت داده: تلاش برای ذخیره داده‌های آذربایجان شرقی در کلاستر اصفهان
assert.throws(() => {
  validateDataResidency('آذربایجان شرقی', 'ir-isfahan-1');
}, (err) => {
  assert.strictEqual(err.code, FEDERATION_ERRORS.DATA_RESIDENCY_POLICY_FAILURE);
  return true;
});

// ۴. بررسی متمرکز با enforceGeographicBoundary
const adminUser = { role: 'admin', id: 5 };
assert.throws(() => {
  enforceGeographicBoundary({
    user: adminUser,
    province: 'فارس',
    region_id: 'ir-tehran-1'
  });
}, (err) => {
  assert.strictEqual(err.code, FEDERATION_ERRORS.DATA_RESIDENCY_POLICY_FAILURE);
  return true;
});

console.log('✅ ۳/۳: سیاست اقامت جغرافیایی داده‌ها با موفقیت تایید شد');
