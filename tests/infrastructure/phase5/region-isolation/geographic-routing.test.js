/**
 * tests/infrastructure/phase5/region-isolation/geographic-routing.test.js
 * آزمون هدایت و مسیریابی آگاه از منطقه (Region-aware Data Routing)
 */

'use strict';

const assert = require('assert');
const {
  validateRegionAccess,
  generateRegionCacheKey
} = require('../../../../server/infrastructure/geographic-isolation');

console.log('--- آزمون مسیریابی آگاه از منطقه و کلیدهای کش ---');

// ۱. دسترسی سوپرادمین به تمام مناطق
const superadmin = { role: 'superadmin', id: 1 };
assert.strictEqual(validateRegionAccess(superadmin, 'ir-tehran-1'), true);
assert.strictEqual(validateRegionAccess(superadmin, 'ir-border-west-1'), true);

// ۲. دسترسی اداره آموزش و پرورش منطقه به منطقه خود
const eduOffice1 = { role: 'edu_office', id: 10, region_id: 'ir-tehran-1' };
assert.strictEqual(validateRegionAccess(eduOffice1, 'ir-tehran-1'), true);

// ۳. کلید کش با تفکیک صلب منطقه و مستأجر
const cacheKey = generateRegionCacheKey('ir-tehran-1', 101, 'bootstrap', 'summary');
assert.strictEqual(cacheKey, 'payesh:r:ir-tehran-1:t:101:bootstrap:summary');

console.log('✅ ۱/۳: مسیریابی آگاه از منطقه و تولید کلید کش ایزوله تایید شد');
