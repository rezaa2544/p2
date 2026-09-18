/**
 * تست قطعیت محاسبات و انجماد عمیق داده‌ها در استقرار پایلوت (P1-SC-05)
 */
'use strict';

const assert = require('assert');
const {
  buildPilotDeploymentHealthSnapshot,
  allocateTraffic,
  resolveCanaryRouting,
  evaluateRollbackReadiness,
  evaluateDeploymentHealthGates
} = require('../../../server/deployment/pilot-traffic-management');

function runDeterministicTests() {
  console.log('▸ تست ۸: قطعیت جبری ۱۰۰٪ و ایمنی در برابر جهش داده‌ها در پایلوت (deterministic)');

  const user = { id: 10, role: 'manager', school_id: 101, region_id: 1 };
  const mockOptions = {
    traffic: { pilot_stage: 'LIMITED_SCHOOL', traffic_percentage: 15 },
    rollback: { baseline_artifact_available: true, schema_rollback_safe: true },
    telemetry: { error_rate: 0.0002, latency_p99_ms: 110, dead_letter_queue_size: 0 }
  };

  // ۱. انجماد عمیق و ممانعت از تغییر شیء
  const snapshot = buildPilotDeploymentHealthSnapshot({ schoolId: 101, regionId: 1, user }, mockOptions);
  assert(Object.isFrozen(snapshot));
  assert(Object.isFrozen(snapshot.traffic));
  assert(Object.isFrozen(snapshot.rollback));
  assert(Object.isFrozen(snapshot.health_gates));
  assert(Object.isFrozen(snapshot.governance_and_invariants));

  assert.throws(() => {
    snapshot.deployment = 'MUTATED';
  }, /TypeError/);

  assert.throws(() => {
    snapshot.traffic.allocated = 100;
  }, /TypeError/);

  // ۲. بررسی قطعیت محاسبات در ۱۰ تکرار متوالی
  for (let i = 0; i < 10; i++) {
    const t = allocateTraffic(mockOptions.traffic);
    const r = resolveCanaryRouting(101, { allowed_school_ids: [101] });
    const rb = evaluateRollbackReadiness(mockOptions.rollback);
    const hg = evaluateDeploymentHealthGates(mockOptions.telemetry);

    assert.strictEqual(t.traffic_percentage, 15);
    assert.strictEqual(r.routed_to, 'CANARY');
    assert.strictEqual(rb.available, true);
    assert.strictEqual(hg.overall_gate, 'PASS');
  }

  console.log('  ✅ انجماد عمیق و قطعیت جبری ۱۰۰٪ در ۱۰ اجرای متوالی تایید شد');
}

if (require.main === module) {
  runDeterministicTests();
}

module.exports = { runDeterministicTests };
