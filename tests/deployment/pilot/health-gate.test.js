/**
 * تست ارزیابی جامع دروازه‌های سلامت استقرار (P1-SC-05)
 */
'use strict';

const assert = require('assert');
const {
  evaluateDeploymentHealthGates,
  HEALTH_GATE_STATUS
} = require('../../../server/deployment/pilot-traffic-management');

function runHealthGateTests() {
  console.log('▸ تست ۴: ارزیابی دروازه‌های پنج‌گانه سلامت استقرار (health-gate)');

  // ۱. تمامی گیت‌ها سبز (PASS)
  const nominal = evaluateDeploymentHealthGates({
    error_rate: 0.0005,
    latency_p99_ms: 120,
    dead_letter_queue_size: 0,
    consumer_lag: 5,
    backup_verified: true,
    rpo_compliant: true,
    database_ha_healthy: true
  });

  assert.strictEqual(nominal.overall_gate, HEALTH_GATE_STATUS.PASS);
  assert.strictEqual(nominal.gates_evaluated_count, 5);
  for (const g of nominal.gates) {
    assert.strictEqual(g.status, HEALTH_GATE_STATUS.PASS);
  }

  // ۲. تاخیر بین ۳۰۰ تا ۱۰۰۰ میلی‌ثانیه منجر به هشدار (WARN) می‌شود
  const warnGate = evaluateDeploymentHealthGates({
    latency_p99_ms: 450
  });
  assert.strictEqual(warnGate.overall_gate, HEALTH_GATE_STATUS.WARN);

  // ۳. نقض نرخ خطا (> 0.01) منجر به انسداد (BLOCK) می‌شود
  const blockError = evaluateDeploymentHealthGates({
    error_rate: 0.02
  });
  assert.strictEqual(blockError.overall_gate, HEALTH_GATE_STATUS.BLOCK);

  // ۴. وجود پیام در DLQ منجر به انسداد (BLOCK) می‌شود
  const blockDlq = evaluateDeploymentHealthGates({
    dead_letter_queue_size: 3
  });
  assert.strictEqual(blockDlq.overall_gate, HEALTH_GATE_STATUS.BLOCK);

  // ۵. خرابی بکاپ یا RPO منجر به انسداد (BLOCK) می‌شود
  const blockDr = evaluateDeploymentHealthGates({
    backup_verified: false
  });
  assert.strictEqual(blockDr.overall_gate, HEALTH_GATE_STATUS.BLOCK);

  console.log('  ✅ صحت ارزیابی دروازه‌های پنج‌گانه سلامت استقرار با موفقیت تایید شد');
}

if (require.main === module) {
  runHealthGateTests();
}

module.exports = { runHealthGateTests };
