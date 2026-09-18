/**
 * tests/infrastructure/phase5/resource-governance/rural-border-support.test.js
 * آزمون لایه تاب‌آوری و سهمیه‌بندی مدارس روستایی و مرزی (Rural/Border Layer)
 */

'use strict';

const assert = require('assert');
const {
  allocateSchoolTenant
} = require('../../../../server/infrastructure/resource-governance');

console.log('--- آزمون لایه پشتیبانی مدارس روستایی و مناطق مرزی ---');

// ۱. مدرسه روستایی چندپایه: حالت فشرده و تاب‌آوری آفلاین ۴۸ ساعته
const ruralSchool = {
  id: 501,
  name: 'دبستان روستایی هورامان',
  province: 'کردستان',
  has_multigrade: true,
  is_rural: true,
  is_border: false,
  student_count: 35
};

const ruralAlloc = allocateSchoolTenant(ruralSchool, 'ir-border-west-1');
assert.strictEqual(ruralAlloc.support_tier, 'RURAL_LOW_BANDWIDTH');
assert.strictEqual(ruralAlloc.low_bandwidth_mode, true);
assert.strictEqual(ruralAlloc.offline_grace_hours, 48);
assert.strictEqual(ruralAlloc.sync_chunk_size_kb, 32);

// ۲. مدرسه نوار مرزی: اولویت آفلاین و تاب‌آوری ۷۲ ساعته
const borderSchool = {
  id: 701,
  name: 'مدرسه عشایری مرزی اروند',
  province: 'خوزستان',
  is_border: true,
  student_count: 50
};

const borderAlloc = allocateSchoolTenant(borderSchool, 'ir-border-west-1');
assert.strictEqual(borderAlloc.support_tier, 'BORDER_OFFLINE_PRIORITY');
assert.strictEqual(borderAlloc.low_bandwidth_mode, true);
assert.strictEqual(borderAlloc.offline_grace_hours, 72);
assert.strictEqual(borderAlloc.sync_chunk_size_kb, 32);

console.log('✅ ۲/۴: سیاست‌های تاب‌آوری مدارس روستایی و مرزی با موفقیت تایید شد');
