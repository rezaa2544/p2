/**
 * tests/infrastructure/phase5/pilot-scaling/rural-border-resilience.test.js
 * آزمون تاب‌آوری مدارس روستایی و نوار مرزی در پایلوت استانی (P2-PL-02)
 */

'use strict';

const assert = require('assert');
const {
  getProvincialPilotById,
  getProvincialCapacityOverview
} = require('../../../../server/infrastructure/provincial-pilot-scaling');

console.log('--- آزمون لایه تاب‌آوری مدارس نوار مرزی و روستایی استانی ---');

// ۱. استان مرزی خوزستان: اولویت تاب‌آوری نوار مرزی و تحمل ۷۲ ساعت قطعی
const khuzestan = getProvincialPilotById('khuzestan');
assert.ok(khuzestan);
assert.strictEqual(khuzestan.support_tier, 'BORDER_OFFLINE_PRIORITY');
assert.strictEqual(khuzestan.offline_grace_hours, 72);
assert.strictEqual(khuzestan.low_bandwidth_mode, true);

// ۲. استان سیستان و بلوچستان: مرزی و روستایی
const sistan = getProvincialPilotById('sistan_baluchestan');
assert.ok(sistan);
assert.strictEqual(sistan.support_tier, 'BORDER_OFFLINE_PRIORITY');
assert.strictEqual(sistan.offline_grace_hours, 72);
assert.strictEqual(sistan.low_bandwidth_mode, true);

// ۳. استان لرستان: اولویت روستایی با تاب‌آوری ۴۸ ساعته
const lorestan = getProvincialPilotById('lorestan');
assert.ok(lorestan);
assert.strictEqual(lorestan.support_tier, 'RURAL_LOW_BANDWIDTH');
assert.strictEqual(lorestan.offline_grace_hours, 48);
assert.strictEqual(lorestan.low_bandwidth_mode, true);

// ۴. استان تهران: رده استاندارد شهری با تاب‌آوری ۲۴ ساعته
const tehran = getProvincialPilotById('tehran');
assert.ok(tehran);
assert.strictEqual(tehran.support_tier, 'URBAN_STANDARD');
assert.strictEqual(tehran.offline_grace_hours, 24);
assert.strictEqual(tehran.low_bandwidth_mode, false);

// ۵. بررسی آمارهای تاب‌آوری مرزی و روستایی در تابلوی ظرفیت ملی
const overview = getProvincialCapacityOverview();
assert.ok(overview.rural_border_resilience.rural_provinces_count > 0);
assert.ok(overview.rural_border_resilience.border_provinces_count > 0);
assert.strictEqual(overview.rural_border_resilience.offline_durability_guaranteed, true);

console.log('✅ ۴/۴: رده‌های تاب‌آوری مدارس روستایی و مرزی با موفقیت تایید شد');
