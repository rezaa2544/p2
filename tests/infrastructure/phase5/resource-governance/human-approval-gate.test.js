/**
 * tests/infrastructure/phase5/resource-governance/human-approval-gate.test.js
 * آزمون گیت تایید انسانی و مهار رفتارهای خودکار (Human Governance Gate)
 */

'use strict';

const assert = require('assert');
const {
  FEDERATION_ERRORS
} = require('../../../../server/infrastructure/phase5-region-federation');

const {
  executePilotApprovalAction
} = require('../../../../server/infrastructure/resource-governance');

console.log('--- آزمون گیت تاییدیه انسانی در پایلوت ملی ---');

// ۱. تاییدیه موفق توسط سرپرست انسانی
const approved = executePilotApprovalAction({
  action_type: 'QUOTA_INCREASE_REQUEST',
  target_region: 'ir-tehran-1',
  target_school: 101,
  approved: true,
  automated_decision: false,
  automated_execution: false,
  requires_human_approval: true,
  operator: { id: 1, role: 'superadmin', name: 'مدیر کل زیرساخت' }
});

assert.strictEqual(approved.status, 'APPROVED');
assert.strictEqual(approved.human_verified, true);
assert.strictEqual(approved.execution_mode, 'SUPERVISED_HUMAN_DISPATCH');

// ۲. رد درخواست به دلیل تلاش برای خودکارسازی (automated_decision=true)
assert.throws(() => {
  executePilotApprovalAction({
    action_type: 'FAILOVER_SWITCH',
    target_region: 'ir-isfahan-1',
    approved: true,
    automated_decision: true,
    automated_execution: false,
    requires_human_approval: false,
    operator: { id: 1, role: 'superadmin' }
  });
}, (err) => {
  assert.strictEqual(err.code, FEDERATION_ERRORS.HUMAN_APPROVAL_REQUIRED);
  return true;
});

// ۳. رد درخواست به دلیل عدم تایید صریح (approved !== true)
assert.throws(() => {
  executePilotApprovalAction({
    action_type: 'QUOTA_INCREASE',
    approved: false,
    operator: { id: 1, role: 'superadmin' }
  });
}, (err) => {
  assert.strictEqual(err.code, FEDERATION_ERRORS.HUMAN_APPROVAL_REQUIRED);
  return true;
});

console.log('✅ ۳/۴: گیت صلب تایید انسانی و مهار تصمیمات خودکار تایید شد');
