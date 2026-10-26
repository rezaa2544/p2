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

  /* فاز ۱ — بنبست واقعی، نه دور زدنش. بدون اتصالِ اقتدار پایگاه‌داده و بدون
     حالتِ صریح توسعه، لایه باید fail-closed باشد و هندلر اجرا نشود. این همان
     گاردی است که نباید تضعیف شود؛ پس اول خودِ گارد سنجیده می‌شود. */
  const savedAllow = process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY;
  const savedNodeEnv = process.env.NODE_ENV;
  delete process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY;
  await assert.rejects(
    () => consumeEvent(event),
    (err) => err && err.code === 'AUTHORITY_UNAVAILABLE',
    'without an attached authority and without the explicit dev-memory opt-in the layer must refuse'
  );
  assert.strictEqual(executionCounter, 0, 'refusal must not run the handler');

  /* فاز ۱b — حالتِ توسعه از تولید قابل‌جعل نیست: با NODE_ENV=production کلیدِ
     opt-in هیچ قفلی را باز نمی‌کند. */
  process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';
  process.env.NODE_ENV = 'production';
  await assert.rejects(
    () => consumeEvent(event),
    (err) => err && err.code === 'AUTHORITY_UNAVAILABLE',
    'the dev-memory opt-in must not unlock the guard in production'
  );
  assert.strictEqual(executionCounter, 0, 'production refusal must not run the handler');
  delete process.env.NODE_ENV;

  /* فاز ۲ — معنای اصلی آزمون: مصرف بی‌اثر، حالا روی اقتدار حافظه‌ایِ صریحِ توسعه. */
  const result1 = await consumeEvent(event);
  assert.strictEqual(result1.status, EVENT_STATUS.PROCESSED);
  assert.strictEqual(result1.duplicate_suppressed, false);
  assert.strictEqual(executionCounter, 1);

  // اجرای دوم با همان کلید یکتایی (Idempotency Key): باید بدون اجرای مجدد هندلر سرکوب شود
  const result2 = await consumeEvent(event);
  assert.strictEqual(result2.status, EVENT_STATUS.PROCESSED);
  assert.strictEqual(result2.duplicate_suppressed, true);
  assert.strictEqual(executionCounter, 1, 'شمارنده نباید افزایش یافته باشد (تضمین Idempotent)');

  /* فاز ۳ — پس از پاک شدن حالت توسعه، کلیدِ تازه هم باید دوباره مهارِ گارد بخورد:
     opt-in یک وضعیتِ پنهانِ همیشگی نیست. */
  process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = savedAllow;
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedNodeEnv;
  const other = publishDomainEvent({
    school_id: 101,
    type: eventType,
    idempotency_key: 'idem:test:after-opt-in',
    payload: { student_id: 502 }
  });
  await assert.rejects(
    () => consumeEvent(other),
    (err) => err && err.code === 'AUTHORITY_UNAVAILABLE',
    'the guard must return once the opt-in is removed'
  );
  assert.strictEqual(executionCounter, 1, 'the second handler run must still be suppressed by idempotency, not by the guard');

  console.log('  ✅ سرکوب موفقیت‌آمیز رویداد تکراری و تضمین مصرف بی‌اثر اثبات شد');
}

if (require.main === module) {
  runTests().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runTests };
