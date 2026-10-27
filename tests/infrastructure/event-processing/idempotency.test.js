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

  // فاز ۱: بدون اقتدار پایگاه‌داده و بدون opt-in صریح توسعه باید fail-closed رد شود
  const savedAllow = process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY;
  const savedNodeEnv = process.env.NODE_ENV;
  delete process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY;
  await assert.rejects(
    () => consumeEvent(event),
    (err) => err && err.code === 'AUTHORITY_UNAVAILABLE'
  );
  assert.strictEqual(executionCounter, 0);

  // فاز ۱ب: در NODE_ENV=production پرچم توسعه نباید گارد را دور بزند
  process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';
  process.env.NODE_ENV = 'production';
  await assert.rejects(
    () => consumeEvent(event),
    (err) => err && err.code === 'AUTHORITY_UNAVAILABLE'
  );
  assert.strictEqual(executionCounter, 0);
  delete process.env.NODE_ENV;

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

  if (savedAllow === undefined) delete process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY;
  else process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = savedAllow;
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedNodeEnv;

  console.log('  ✅ سرکوب موفقیت‌آمیز رویداد تکراری و تضمین مصرف بی‌اثر اثبات شد');
}

if (require.main === module) {
  runTests().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runTests };
