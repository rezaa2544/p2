/**
 * آزمون ۳: صحت سیاست بازتلاش و بک‌آف نمایی (retry-correctness)
 */

'use strict';

const assert = require('assert');
const {
  retryFailedEvent,
  EVENT_STATUS,
  DEFAULT_RETRY_POLICY
} = require('../../../server/infrastructure/event-processing-layer');

function runTests() {
  console.log('▸ تست ۳: صحت سیاست بازتلاش و بک‌آف نمایی (retry-correctness)');

  const baseEvent = {
    event_id: 'EVT-FAIL-01',
    type: 'sync.delta.push',
    school_id: 101,
    retry_count: 0,
    max_retries: 3
  };

  // بازتلاش اول (تلاش ۱)
  const retry1 = retryFailedEvent(baseEvent, { error: 'Network timeout' });
  assert.strictEqual(retry1.status, EVENT_STATUS.FAILED_RETRYABLE);
  assert.strictEqual(retry1.retry_count, 1);
  assert.strictEqual(retry1.last_error, 'Network timeout');
  assert.ok(retry1.backoff_ms >= 1000);

  // بازتلاش دوم (تلاش ۲)
  const retry2 = retryFailedEvent(retry1, { error: 'Connection refused' });
  assert.strictEqual(retry2.status, EVENT_STATUS.FAILED_RETRYABLE);
  assert.strictEqual(retry2.retry_count, 2);
  assert.ok(retry2.backoff_ms >= 2000, 'بک‌آف باید به‌صورت نمایی افزایش یابد');

  // بازتلاش سوم (تلاش ۳ - رسیدن به سقف)
  const retry3 = retryFailedEvent(retry2, { error: 'DB lock timeout' });
  assert.strictEqual(retry3.status, EVENT_STATUS.FAILED_RETRYABLE);
  assert.strictEqual(retry3.retry_count, 3);

  // تلاش چهارم (بیشتر از سقف ۳): باید به صف پیام‌های مرده منتقل شود
  const dlqEvent = retryFailedEvent(retry3, { error: 'Persistent failure' });
  assert.strictEqual(dlqEvent.status, EVENT_STATUS.DEAD_LETTER);
  assert.strictEqual(dlqEvent.terminal, true);
  assert.ok(dlqEvent.dead_letter_reason.includes('تجاوز از سقف'));

  console.log('  ✅ صحت بازتلاش با بک‌آف نمایی و انتقال قطعی به DLQ تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
