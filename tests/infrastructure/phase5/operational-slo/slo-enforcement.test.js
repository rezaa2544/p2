/**
 * Operational SLO Enforcement Test Suite
 * Phase 5 Step 5 (P2-NI-03): National Production Fabric Validation
 */

'use strict';

const assert = require('assert');
const {
  enforceOperationalSloGate,
  SLO_ENFORCEMENT_STATUS,
  SLO_ERRORS,
  NATIONAL_SLO_TARGETS
} = require('../../../../server/monitoring/national-observability-plane');

function runSloEnforcementTests() {
  // 1. Missing real telemetry returns NOT_VERIFIED (never marked as pass!)
  const unverified = enforceOperationalSloGate({});
  assert.strictEqual(unverified.status, SLO_ENFORCEMENT_STATUS.NOT_VERIFIED);
  assert.strictEqual(unverified.compliant, false);

  // 2. Telemetry strictly compliant marked as VERIFIED
  const verified = enforceOperationalSloGate({
    is_live: true,
    p95_latency_ms: 180,
    p99_latency_ms: 650,
    error_rate_pct: 0.02,
    event_queue_lag_ms: 150,
    db_replication_lag_ms: 80
  });
  assert.strictEqual(verified.status, SLO_ENFORCEMENT_STATUS.VERIFIED);
  assert.strictEqual(verified.compliant, true);
  assert.strictEqual(verified.breaches.length, 0);

  // 3. Telemetry breaching p95 marked as BREACHED
  const breachedP95 = enforceOperationalSloGate({
    is_live: true,
    p95_latency_ms: 380, // > 300
    p99_latency_ms: 700,
    error_rate_pct: 0.01
  });
  assert.strictEqual(breachedP95.status, SLO_ENFORCEMENT_STATUS.BREACHED);
  assert.strictEqual(breachedP95.compliant, false);
  assert.ok(breachedP95.breaches.some(b => b.includes('p95')));

  // 4. Fail-closed option throws exception on breach
  assert.throws(() => {
    enforceOperationalSloGate({
      is_live: true,
      p95_latency_ms: 350,
      p99_latency_ms: 700,
      error_rate_pct: 0.01
    }, { failClosed: true });
  }, (err) => {
    return err.code === SLO_ERRORS.SLO_BREACH;
  }, 'Fail-closed SLO enforcement must throw SLO_BREACH');

  // 5. Zero ranking guard
  assert.throws(() => {
    enforceOperationalSloGate({
      ranking_score: 99
    });
  }, (err) => {
    return err.code === 'ZERO_RANKING_VIOLATION' || err.message.includes('ZERO_RANKING_VIOLATION');
  }, 'Zero ranking keywords must be rejected');

  return { suite: 'slo-enforcement', passed: 5 };
}

if (require.main === module) {
  const res = runSloEnforcementTests();
  console.log(`✅ slo-enforcement.test.js: ${res.passed}/5 passed`);
}

module.exports = { runSloEnforcementTests };
