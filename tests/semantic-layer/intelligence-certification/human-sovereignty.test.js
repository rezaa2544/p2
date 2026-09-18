/**
 * آزمون ۳: حاکمیت قطعی تصمیم انسانی در تمام پلتفرم (human-sovereignty)
 */

'use strict';

const assert = require('assert');
const {
  validateHumanSovereigntyAcrossPlatform
} = require('../../../server/analytics/intelligence-release-certification');

function runTests() {
  console.log('▸ تست ۳: حاکمیت قطعی تصمیم انسانی در تمام پلتفرم (human-sovereignty)');

  // حالت معتبر و مجاز
  const validOutputs = {
    automated_decision: false,
    automated_execution: false,
    requires_human_approval: true,
    recommendations: [
      {
        id: 'REC-01',
        title: 'برنامه جبرانی',
        automated_decision: false,
        requires_human_approval: true
      }
    ]
  };

  const validRes = validateHumanSovereigntyAcrossPlatform(validOutputs);
  assert.strictEqual(validRes.compliant, true, 'باید خروجی استاندارد را مطابق با حاکمیت انسانی تایید کند');
  assert.strictEqual(validRes.checks.automated_decision_prohibited, true);
  assert.strictEqual(validRes.checks.automated_execution_prohibited, true);
  assert.strictEqual(validRes.checks.requires_human_approval_enforced, true);
  assert.strictEqual(validRes.violations.length, 0);

  // نقض ۱: تصمیم خودکار
  const violation1 = {
    automated_decision: true,
    automated_execution: false,
    requires_human_approval: true
  };
  const res1 = validateHumanSovereigntyAcrossPlatform(violation1);
  assert.strictEqual(res1.compliant, false);
  assert.ok(res1.violations.some(v => v.includes('automated_decision')));

  // نقض ۲: اجرای خودکار بدون انسان
  const violation2 = {
    automated_decision: false,
    automated_execution: true,
    requires_human_approval: true
  };
  const res2 = validateHumanSovereigntyAcrossPlatform(violation2);
  assert.strictEqual(res2.compliant, false);
  assert.ok(res2.violations.some(v => v.includes('automated_execution')));

  // نقض ۳: لغو الزام تایید انسانی
  const violation3 = {
    automated_decision: false,
    automated_execution: false,
    requires_human_approval: false
  };
  const res3 = validateHumanSovereigntyAcrossPlatform(violation3);
  assert.strictEqual(res3.compliant, false);
  assert.ok(res3.violations.some(v => v.includes('requires_human_approval')));

  // نقض تودرتو در لایه‌های پایین
  const nestedViolation = {
    automated_decision: false,
    automated_execution: false,
    requires_human_approval: true,
    deep_layer: {
      sub_module: {
        automated_decision: true
      }
    }
  };
  const resNested = validateHumanSovereigntyAcrossPlatform(nestedViolation);
  assert.strictEqual(resNested.compliant, false);
  assert.ok(resNested.violations.length > 0);

  console.log('  ✅ اعتبارسنجی و کشف نقض حاکمیت تصمیم انسانی با موفقیت تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
