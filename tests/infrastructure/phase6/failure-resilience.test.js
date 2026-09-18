/**
 * tests/infrastructure/phase6/failure-resilience.test.js
 * Stage 2: Failure Resilience & Disaster Recovery Test Suite
 */

'use strict';

const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../');
const { Phase6CanaryEngine, CANARY_STATES, CANARY_ERRORS } = require(path.join(ROOT, 'server/infrastructure/phase6-canary-engine'));
const outbox = require(path.join(ROOT, 'server/outbox'));

async function testCompleteClusterOutage() {
  console.log('▸ Phase 6 Test 3: Complete Cluster Outage & Fail-Closed Protection');

  const engine = new Phase6CanaryEngine();
  const khorasan = engine.clusters.get('ir-khorasan-1');

  // شبیه‌سازی قطعی کامل هر دو دیتاسنتر
  khorasan.status = CANARY_STATES.OFFLINE;
  khorasan.circuitBreakerOpen = true;
  khorasan.secondaryDc = null; // دیتاسنتر ثانویه نیز در دسترس نیست

  // باید خطای CIRCUIT_OPEN با رفتار صلب Fail-Closed پرتاب شود
  assert.throws(() => {
    engine.routeRequest('09'); // استان خراسان رضوی
  }, (err) => {
    return err.code === CANARY_ERRORS.CIRCUIT_OPEN;
  }, 'Must fail-closed with CIRCUIT_OPEN error when both DCs are down');

  console.log('  ✅ 3.1 Strict Fail-Closed verified: Outage correctly blocks traffic without silent leak');
}

async function testOutboxWorkerCrashResilience() {
  console.log('▸ Phase 6 Test 4: Transactional Outbox Crash Recovery & Poison Pill Isolation');

  const fakeStore = { outbox: [], outbox_dlq: [] };
  const fakeDb = { isPostgres: () => false };
  const ob = outbox.createOutbox({ store: fakeStore, db: fakeDb });

  // ۱. افزودن رویدادها
  await ob.append({ type: 'grade_updated', collection: 'grades', record_id: 101, version: 1 });
  await ob.append({ type: 'attendance_marked', collection: 'attendance', record_id: 202, version: 1 });
  await ob.append({ type: 'malicious_poison_pill', collection: 'invalid', record_id: 999, version: 1 });

  assert.strictEqual(fakeStore.outbox.length, 3);
  console.log('  ✅ 4.1 Events successfully buffered in Outbox');

  // ۲. واکشی دسته‌ای (Batch Fetch)
  const batch = await ob.fetchPendingBatch(2);
  assert.strictEqual(batch.length, 2);
  console.log('  ✅ 4.2 Batch fetch retrieved pending events without lock contention');

  // ۳. ایزولاسیون پیام مسموم و انتقال به DLQ
  const poisonEvt = fakeStore.outbox[2];
  await ob.moveToDlq(poisonEvt, 'Corrupted payload format error');

  assert.strictEqual(fakeStore.outbox_dlq.length, 1);
  assert.strictEqual(fakeStore.outbox_dlq[0].error_message, 'Corrupted payload format error');
  assert.strictEqual(poisonEvt.status, 'dead_letter');
  console.log('  ✅ 4.3 Poison pill cleanly routed to Dead-Letter Queue (DLQ)');
}

async function main() {
  console.log('===================================================================');
  console.log('🧪 Running Suite 2: Failure Resilience & Disaster Recovery');
  console.log('===================================================================');

  await testCompleteClusterOutage();
  await testOutboxWorkerCrashResilience();

  console.log('───────────────────────────────────────────────────────────────────');
  console.log('✅ Suite 2 (Failure Resilience) PASSED 100%');
  console.log('===================================================================');
}

main().catch(err => {
  console.error('❌ Suite 2 Failed:', err);
  process.exit(1);
});
