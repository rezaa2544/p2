/**
 * آزمون ۶: پاسداری از حاکمیت تصمیم انسانی در خط لوله پردازش رویدادها (human-sovereignty)
 */

'use strict';

const assert = require('assert');
const {
  publishDomainEvent,
  buildEventProcessingHealthSnapshot
} = require('../../../server/infrastructure/event-processing-layer');

function runTests() {
  console.log('▸ تست ۶: پاسداری از حاکمیت تصمیم انسانی در خط لوله پردازش رویدادها (human-sovereignty)');

  // بررسی در رویداد منتشرشده
  const event = publishDomainEvent({
    school_id: 101,
    type: 'intervention.action_triggered',
    payload: { case_id: 'CASE-01' }
  });

  assert.strictEqual(event.governance.automated_decision, false, 'اتوماسیون تصمیم‌گیری باید اکیداً false باشد');
  assert.strictEqual(event.governance.automated_execution, false, 'اتوماسیون اجرای عملیاتی باید اکیداً false باشد');
  assert.strictEqual(event.governance.requires_human_approval, true, 'الزام تایید انسانی باید اکیداً true باشد');

  // بررسی در شناسنامه سلامت صف
  const snapshot = buildEventProcessingHealthSnapshot({ schoolId: 101 });
  const gov = snapshot.governance_and_invariants.human_decision_sovereignty;
  assert.strictEqual(gov.automated_decision, false);
  assert.strictEqual(gov.automated_execution, false);
  assert.strictEqual(gov.requires_human_approval, true);
  assert.strictEqual(gov.enforced, true);

  console.log('  ✅ رعایت ۱۰۰٪ حاکمیت تصمیم انسانی در رویدادها و خط لوله پردازش تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
