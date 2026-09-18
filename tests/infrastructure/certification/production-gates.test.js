/**
 * tests/infrastructure/certification/production-gates.test.js
 * آزمون ارزیابی ابعاد هفت‌گانه دروازه آمادگی تولید (Roadmap §27)
 */

'use strict';

const assert = require('assert');
const {
  evaluateProductionReadinessGates
} = require('../../../server/infrastructure/phase4-release-certification');

console.log('--- آزمون ابعاد هفت‌گانه دروازه آمادگی تولید ---');

// ۱. ارزیابی در شرایط ایده‌آل (کلیه شاخص‌ها نرمال)
const normalResult = evaluateProductionReadinessGates({
  pg_sole_sot: true,
  zero_data_loss_proven: true,
  zero_trust_active: true,
  secret_leaks: 0,
  authz_gaps: 0,
  stateless_api: true,
  cache_tenant_isolated: true,
  dlq_count: 0,
  consumer_lag_ms: 30,
  error_rate_pct: 0.02,
  p99_latency_ms: 120,
  rpo_seconds: 60,
  rto_seconds: 300,
  backup_tamper_detected: false,
  standby_ready: true,
  rollback_ready: true,
  pilot_health_gates_passed: true
});

assert.strictEqual(normalResult.all_passed, true, 'تمامی ۷ دروازه در حالت عادی باید سبز باشند');
assert.strictEqual(normalResult.passed_count, 7, 'تعداد دروازه‌های قبول‌شده باید ۷ باشد');
assert.strictEqual(normalResult.total_gates, 7);

// ۲. شکست گیت داده در صورت نقض منبع حقیقت بودن PostgreSQL
const dataFailure = evaluateProductionReadinessGates({
  pg_sole_sot: false
});
assert.strictEqual(dataFailure.all_passed, false);
const failedDataGate = dataFailure.gates.find(g => g.gate_id === 'PRG_01_DATA_SOVEREIGNTY');
assert.strictEqual(failedDataGate.passed, false, 'گیت داده باید رد شود');

// ۳. شکست گیت امنیت در صورت وجود نشت سکرت
const secFailure = evaluateProductionReadinessGates({
  secret_leaks: 2
});
assert.strictEqual(secFailure.all_passed, false);
const failedSecGate = secFailure.gates.find(g => g.gate_id === 'PRG_02_ZERO_TRUST_SECURITY');
assert.strictEqual(failedSecGate.passed, false, 'گیت امنیت در نشت سکرت باید مردود شود');

// ۴. شکست گیت صف و رویداد در صورت پر شدن پیام‌های مرده (DLQ)
const dlqFailure = evaluateProductionReadinessGates({
  dlq_count: 5
});
assert.strictEqual(dlqFailure.all_passed, false);
const failedEventGate = dlqFailure.gates.find(g => g.gate_id === 'PRG_04_EVENT_PROCESSING');
assert.strictEqual(failedEventGate.passed, false, 'گیت پردازش رویداد با DLQ مثبت باید مردود شود');

// ۵. شکست گیت رصدپذیری در صورت عبور نرخ خطا از سقف SLO
const sloFailure = evaluateProductionReadinessGates({
  error_rate_pct: 0.8
});
assert.strictEqual(sloFailure.all_passed, false);
const failedObsGate = sloFailure.gates.find(g => g.gate_id === 'PRG_05_OBSERVABILITY');
assert.strictEqual(failedObsGate.passed, false, 'گیت رصدپذیری با خطای بیش از ۰٫۱٪ باید مردود شود');

// ۶. شکست گیت بازیابی در صورت نقض RTO
const rtoFailure = evaluateProductionReadinessGates({
  rto_seconds: 1800
});
assert.strictEqual(rtoFailure.all_passed, false);
const failedDrGate = rtoFailure.gates.find(g => g.gate_id === 'PRG_06_RELIABILITY_DR');
assert.strictEqual(failedDrGate.passed, false, 'گیت بازیابی با RTO بالای ۹۰۰ ثانیه باید مردود شود');

console.log('✅ ۲/۹: ارزیابی ابعاد هفت‌گانه دروازه آمادگی تولید با موفقیت تایید شد');
