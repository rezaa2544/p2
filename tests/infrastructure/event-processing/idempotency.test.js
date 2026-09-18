/**
 * آزمون ۲: تضمین مصرف بی‌اثر رویدادها و مهار تکرار (idempotency)
 */

'use strict';

const assert = require('assert');
const {
  registerEventHandler,
  publishDomainEvent,
  consumeEvent,
  EVENT_STATUS
} = require('../../../server/infrastructure/event-processing-layer');

async function runTests() {
  console.log('▸ تست ۲: تضمین مصرف بی‌اثر رویدادها و مهار تکرار (idempotency)');

  let executionCounter = 0;
  const eventType = 'test.student.enrolled';

  // ثبت هندلر برای رویداد
  registerEventHandler(eventType, async (payload) => {
    executionCounter++;
    return { ok: true, student_id: payload.student_id };
  });

  const event = publishDomainEvent({
    school_id: 101,
    type: eventType,
    idempotency_key: 'idem:test:unique-12345',
    payload: { student_id: 501 }
  });

  // اجرای اول: باید هندلر صدا زده شود و شمارنده ۱ شود
  const result1 = await consumeEvent(event);
  assert.strictEqual(result1.status, EVENT_STATUS.PROCESSED);
  assert.strictEqual(result1.duplicate_suppressed, false);
  assert.strictEqual(executionCounter, 1);

  // اجرای دوم با همان کلید یکتایی (Idempotency Key): باید بدون اجرای مجدد هندلر سرکوب شود
  const result2 = await consumeEvent(event);
  assert.strictEqual(result2.status, EVENT_STATUS.PROCESSED);
  assert.strictEqual(result2.duplicate_suppressed, true);
  assert.strictEqual(executionCounter, 1, 'شمارنده نباید افزایش یافته باشد (تضمین Idempotent)');

  console.log('  ✅ سرکوب موفقیت‌آمیز رویداد تکراری و تضمین مصرف بی‌اثر اثبات شد');
}

if (require.main === module) {
  runTests().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runTests };
