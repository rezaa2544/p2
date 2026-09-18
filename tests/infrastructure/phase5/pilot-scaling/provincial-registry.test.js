/**
 * tests/infrastructure/phase5/pilot-scaling/provincial-registry.test.js
 * آزمون رجیستری ۳۱ استان و چرخه وضعیت پایلوت (P2-PL-02)
 */

'use strict';

const assert = require('assert');
const {
  PROVINCIAL_PILOT_STATUS,
  CANONICAL_PROVINCES,
  getProvincialPilots,
  getProvincialPilotById,
  activateProvincialPilot,
  PILOT_SCALING_ERRORS
} = require('../../../../server/infrastructure/provincial-pilot-scaling');

console.log('--- آزمون رجیستری استان‌های پایلوت و چرخه عمر وضعیت ---');

// ۱. بررسی کاتالوگ جامع استان‌ها (حداقل ۳۱ استان به همراه حوزه سراسری روستایی)
const provinces = getProvincialPilots();
assert.ok(provinces.length >= 31, `تعداد استان‌ها در رجیستری باید حداقل ۳۱ باشد (موجود: ${provinces.length})`);

// ۲. واکشی بر اساس شناسه و نام استان
const tehran = getProvincialPilotById('tehran');
assert.ok(tehran);
assert.strictEqual(tehran.province_name, 'تهران');
assert.strictEqual(tehran.region_id, 'ir-tehran-1');
assert.ok(tehran.cluster_binding.primary_dc);

const isfahan = getProvincialPilotById('اصفهان');
assert.ok(isfahan);
assert.strictEqual(isfahan.province_id, 'isfahan');
assert.strictEqual(isfahan.region_id, 'ir-isfahan-1');

// ۳. فعال‌سازی موفق پایلوت استانی با تاییدیه انسانی
const activatedTehran = activateProvincialPilot('tehran', {
  approved: true,
  automated_decision: false,
  automated_execution: false,
  requires_human_approval: true,
  operator: { id: 1, role: 'superadmin', name: 'مدیر کل زیرساخت' }
});

assert.strictEqual(activatedTehran.pilot_status, PROVINCIAL_PILOT_STATUS.PROVISIONING);
assert.strictEqual(activatedTehran.approval_state.approved, true);
assert.strictEqual(activatedTehran.approval_state.automated_decision, false);

// ۴. رد فعال‌سازی به دلیل رفتار خودکار (automated_decision=true)
assert.throws(() => {
  activateProvincialPilot('isfahan', {
    approved: true,
    automated_decision: true,
    automated_execution: false,
    requires_human_approval: false,
    operator: { id: 1, role: 'superadmin' }
  });
}, (err) => {
  assert.strictEqual(err.code, PILOT_SCALING_ERRORS.ROLLOUT_APPROVAL_REQUIRED);
  return true;
});

// ۵. جستجوی استان نامعتبر
assert.throws(() => {
  activateProvincialPilot('invalid_province_xyz', {
    approved: true,
    automated_decision: false,
    automated_execution: false,
    requires_human_approval: true,
    operator: { id: 1, role: 'superadmin' }
  });
}, (err) => {
  assert.strictEqual(err.code, PILOT_SCALING_ERRORS.PILOT_SCOPE_VIOLATION);
  return true;
});

console.log('✅ ۱/۴: رجیستری ۳۱ استان و ماشین وضعیت پایلوت با موفقیت تایید شد');
