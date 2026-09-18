/**
 * آزمون ۶: گیت‌های کیفیت و مستندات پروژه (documentation-gates)
 */

'use strict';

const assert = require('assert');
const {
  validateQualityGateStatus
} = require('../../../server/analytics/intelligence-release-certification');

function runTests() {
  console.log('▸ تست ۶: گیت‌های کیفیت و مستندات پروژه (documentation-gates)');

  const qualityStatus = validateQualityGateStatus();

  assert.strictEqual(qualityStatus.all_passed, true, 'تمامی ۸ دروازه کیفی باید تایید شده باشند');
  assert.strictEqual(qualityStatus.total_gates, 8, 'تعداد کل گیت‌های کیفی باید ۸ باشد');
  assert.strictEqual(qualityStatus.passed_gates, 8);
  assert.strictEqual(qualityStatus.failed_gates, 0);

  const gates = qualityStatus.gate_details;
  assert.ok(gates.semantic_tests, 'سوئیت لایه معنایی باید در گیت‌ها باشد');
  assert.strictEqual(gates.semantic_tests.status, 'PASSED');

  assert.ok(gates.api_tests, 'سوئیت وب‌سرویس باید در گیت‌ها باشد');
  assert.strictEqual(gates.api_tests.status, 'PASSED');

  assert.ok(gates.master_regression, 'سوئیت رگرسیون باید در گیت‌ها باشد');
  assert.strictEqual(gates.master_regression.status, 'PASSED');

  assert.ok(gates.build_parity, 'گیت build باید در گیت‌ها باشد');
  assert.strictEqual(gates.build_parity.status, 'PASSED');

  assert.ok(gates.authorization_parity, 'گیت مجوزها باید در گیت‌ها باشد');
  assert.strictEqual(gates.authorization_parity.status, 'PASSED');

  assert.ok(gates.secret_scan, 'گیت اسکن رازها باید در گیت‌ها باشد');
  assert.strictEqual(gates.secret_scan.status, 'PASSED');

  assert.ok(gates.docs_stats_sync, 'گیت همگامی آمار مستندات باید در گیت‌ها باشد');
  assert.strictEqual(gates.docs_stats_sync.status, 'PASSED');

  assert.ok(gates.docs_consistency, 'گیت انسجام مستندات باید در گیت‌ها باشد');
  assert.strictEqual(gates.docs_consistency.status, 'PASSED');

  console.log('  ✅ اعتبارسنجی تمامی ۸ دروازه کیفی و استانداردهای مستندسازی با موفقیت تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
