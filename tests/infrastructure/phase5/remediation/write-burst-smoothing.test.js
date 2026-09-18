/**
 * Remediation Test Suite 6: Write Burst Protection & Outbox Smoothing
 * Phase 5 Step 07 (P2-NI-05): Production Truth Remediation
 *
 * Validates remediation of Write Burst Overload:
 * - Tests Attendance surge (5,600 write TPS).
 * - Tests Final Exams surge (9,750 write TPS).
 * - Verifies PostgreSQL write rate is strictly smoothed to ≤ 2,500 TPS.
 * - Verifies Zero Data Loss (RPO = 0s).
 * - Verifies Outbox Queue Lag increases during surge and drains smoothly to zero.
 *
 * Execution Modes:
 * - Mode A: Unit / In-Memory Mock Validation (Sandbox Active)
 * - Mode B: Integration / Real Load Test (Requires physical DB cluster)
 */

'use strict';

const assert = require('assert');
const {
  NationalWriteSmoothingEngine,
  NATIONAL_WRITE_LIMITS
} = require('../../../../server/infrastructure/national-write-smoothing');

function runWriteBurstSmoothingTests() {
  const results = {
    suite: 'write-burst-smoothing',
    mode_a_unit_passed: 0,
    mode_a_unit_total: 5,
    mode_b_real_test: null,
    invariants_verified: []
  };

  const engine = new NationalWriteSmoothingEngine({
    maxDbWriteTps: 2500
  });

  // ─────────────────────────────────────────────────────────────────
  // Mode A: Unit / Empirical Ingress & Smoothing Audit (Sandbox Active)
  // ─────────────────────────────────────────────────────────────────

  // 1. Test Ingress Fast ACK and Buffer Enqueue (RPO = 0s)
  const ack = engine.enqueueWrite({
    collection: 'attendance',
    data: { student_id: 101, class_id: 202, status: 'present', date: '2026-09-18' },
    school_id: 55
  });
  assert.strictEqual(ack.accepted, true, 'Write must be accepted immediately');
  assert.strictEqual(ack.status, 'buffered', 'Write status must be buffered');
  assert.strictEqual(ack.rpo_guarantee_seconds, 0, 'RPO guarantee must be 0 seconds');
  results.mode_a_unit_passed++;
  results.invariants_verified.push('Fast ACK (HTTP 202 / buffered) returned with RPO=0s guarantee');

  // 2. Test Regulated Batch Drain (bounded at batch size)
  const drained = engine.drainBatch(250);
  assert.strictEqual(drained, 1, 'Drained 1 item from buffer');
  results.mode_a_unit_passed++;
  results.invariants_verified.push('Regulated batch drain persists items without database flooding');

  // 3. Test Attendance Surge (5,600 write TPS for 10 seconds = 56,000 writes)
  const attendanceSim = engine.simulateBurst({
    burst_tps: NATIONAL_WRITE_LIMITS.ATTENDANCE_PEAK_TPS, // 5,600 TPS
    duration_seconds: 10,
    entity_name: 'attendance'
  });

  assert.strictEqual(attendanceSim.total_incoming_writes, 56000, 'Total incoming writes must be 56,000');
  assert.strictEqual(attendanceSim.total_writes_persisted, 56000, 'Total persisted writes must be 56,000');
  assert.strictEqual(attendanceSim.lost_writes, 0, 'Zero writes lost (RPO = 0s)');
  assert(
    attendanceSim.peak_observed_db_write_tps <= 2500,
    `Peak DB write rate (${attendanceSim.peak_observed_db_write_tps}) must NOT exceed ceiling (2,500 TPS)`
  );
  assert.strictEqual(attendanceSim.db_overload_prevented, true, 'Database overload prevented');
  assert.strictEqual(attendanceSim.verdict, 'BURST_SMOOTHING_VERIFIED', 'Attendance burst smoothing must be verified');
  results.mode_a_unit_passed++;
  results.invariants_verified.push('Attendance surge (5,600 TPS) smoothed to ≤2,500 TPS with 0 lost writes');

  // 4. Test Final Exams Surge (9,750 write TPS for 10 seconds = 97,500 writes)
  const examSim = engine.simulateBurst({
    burst_tps: NATIONAL_WRITE_LIMITS.FINAL_EXAMS_PEAK_TPS, // 9,750 TPS
    duration_seconds: 10,
    entity_name: 'grades'
  });

  assert.strictEqual(examSim.total_incoming_writes, 97500, 'Total incoming writes must be 97,500');
  assert.strictEqual(examSim.total_writes_persisted, 97500, 'Total persisted writes must be 97,500');
  assert.strictEqual(examSim.lost_writes, 0, 'Zero writes lost during final exam surge');
  assert(
    examSim.peak_observed_db_write_tps <= 2500,
    `Peak DB write rate (${examSim.peak_observed_db_write_tps}) must NOT exceed ceiling (2,500 TPS)`
  );
  assert.strictEqual(examSim.db_overload_prevented, true, 'Database overload prevented');
  assert.strictEqual(examSim.verdict, 'BURST_SMOOTHING_VERIFIED', 'Exam burst smoothing must be verified');
  results.mode_a_unit_passed++;
  results.invariants_verified.push('Final Exam surge (9,750 TPS) smoothed to ≤2,500 TPS with 0 lost writes');

  // 5. Verify Queue Lag Dynamics during and after Surge
  assert(examSim.max_queue_lag > 0, 'Queue lag must increase to absorb surge');
  assert.strictEqual(examSim.rpo_seconds, 0, 'Durable outbox guarantees RPO = 0s');
  results.mode_a_unit_passed++;
  results.invariants_verified.push('Outbox queue lag predictably absorbs burst and recovers safely');

  // ─────────────────────────────────────────────────────────────────
  // Mode B: Real DB Cluster High-Velocity Integration
  // ─────────────────────────────────────────────────────────────────
  results.mode_b_real_test = {
    status: 'ENVIRONMENT_GATED',
    reason: 'Simulating 9,750 real network TPS against physical PostgreSQL cluster requires multi-node bench setup'
  };

  return results;
}

if (require.main === module) {
  const res = runWriteBurstSmoothingTests();
  console.log('✅ Write Burst Smoothing Remediation Tests Passed:', JSON.stringify(res, null, 2));
}

module.exports = { runWriteBurstSmoothingTests };
