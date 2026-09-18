/**
 * آزمون ۴: مدیریت صف پیام‌های مرده و کشف گلوگاه‌ها (dead-letter-handling)
 */

'use strict';

const assert = require('assert');
const {
  detectQueueBottlenecks,
  buildEventProcessingHealthSnapshot,
  QUEUE_HEALTH
} = require('../../../server/infrastructure/event-processing-layer');

function runTests() {
  console.log('▸ تست ۴: مدیریت صف پیام‌های مرده و کشف گلوگاه‌ها (dead-letter-handling)');

  // حالت بهینه
  const clean = detectQueueBottlenecks({
    pending_count: 15,
    dlq_count: 0,
    avg_processing_time_ms: 35.0
  });
  assert.strictEqual(clean.queue_health, QUEUE_HEALTH.HEALTHY);
  assert.strictEqual(clean.bottlenecks_detected.length, 0);

  // سناریوی انباشتگی در صف (Backpressure)
  const backpressure = detectQueueBottlenecks({
    pending_count: 650,
    dlq_count: 0,
    avg_processing_time_ms: 40.0
  });
  assert.strictEqual(backpressure.queue_health, QUEUE_HEALTH.DEGRADED);
  assert.ok(backpressure.bottlenecks_detected.some(b => b.id === 'QUEUE-BN-01-BACKPRESSURE'));

  // سناریوی تجمع در صف پیام‌های مرده (DLQ Accumulation)
  const dlqAlert = detectQueueBottlenecks({
    pending_count: 50,
    dlq_count: 15,
    avg_processing_time_ms: 40.0
  });
  assert.strictEqual(dlqAlert.queue_health, QUEUE_HEALTH.CRITICAL);
  assert.ok(dlqAlert.bottlenecks_detected.some(b => b.id === 'QUEUE-BN-02-DLQ-ACCUMULATION'));

  // بررسی خروجی شناسنامه سلامت
  const snapshot = buildEventProcessingHealthSnapshot({
    schoolId: 101,
    metrics: { pending_count: 10, dlq_count: 0 }
  });
  assert.strictEqual(snapshot.phase, 'PHASE_4');
  assert.strictEqual(snapshot.pipeline_status, 'OPERATIONAL');
  assert.ok(snapshot.dead_letter_queue_summary);

  console.log('  ✅ پایش گلوگاه‌های صف، مدیریت DLQ و تولید شناسنامه سلامت تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
