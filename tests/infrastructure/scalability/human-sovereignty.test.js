/**
 * آزمون ۵: پاسداری صلب از حاکمیت تصمیم انسانی در لایه زیرساخت (human-sovereignty)
 */

'use strict';

const assert = require('assert');
const {
  buildProductionReadinessSnapshot
} = require('../../../server/infrastructure/scalability-foundation');

function runTests() {
  console.log('▸ تست ۵: پاسداری صلب از حاکمیت تصمیم انسانی در لایه زیرساخت (human-sovereignty)');

  const snapshot = buildProductionReadinessSnapshot({ schoolId: 101, regionId: 1 });

  const sovereignty = snapshot.governance_and_compliance.human_decision_sovereignty;
  assert.strictEqual(sovereignty.automated_decision, false, 'اتوماسیون تصمیم‌گیری باید اکیداً false باشد');
  assert.strictEqual(sovereignty.automated_execution, false, 'اتوماسیون اجرای عملیاتی باید اکیداً false باشد');
  assert.strictEqual(sovereignty.requires_human_approval, true, 'الزام تایید انسانی باید اکیداً true باشد');
  assert.strictEqual(sovereignty.enforced, true);

  // بررسی عدم وجود فیلدهای مخرب در سرتاسر شیء گزارش
  const json = JSON.stringify(snapshot);
  assert.strictEqual(json.includes('"automated_decision":true'), false);
  assert.strictEqual(json.includes('"automated_execution":true'), false);
  assert.strictEqual(json.includes('"requires_human_approval":false'), false);

  console.log('  ✅ رعایت ۱۰۰٪ حاکمیت تصمیم انسانی در تمام خروجی‌های زیرساخت تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
