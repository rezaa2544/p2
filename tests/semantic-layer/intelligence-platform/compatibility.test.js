/**
 * آزمون ۲: ممیزی سازگاری نسخ قراردادهای داده موتورها (compatibility)
 */

'use strict';

const assert = require('assert');
const {
  validateEngineCompatibility,
  CANONICAL_ENGINE_CATALOG
} = require('../../../server/analytics/intelligence-platform-integration');

function runTests() {
  console.log('▸ تست ۲: ممیزی سازگاری نسخ قراردادهای داده (compatibility)');

  // ۱. بررسی کاتالوگ استاندارد
  const report = validateEngineCompatibility(CANONICAL_ENGINE_CATALOG);
  assert.strictEqual(report.total_registered_engines, 11);
  assert.strictEqual(report.compatible_engines_count, 11);
  assert.strictEqual(report.all_compatible, true);
  assert.strictEqual(report.incompatible_engines.length, 0);

  // ۲. بررسی وجود موتور ناسازگار
  const mutatedCatalog = [
    ...CANONICAL_ENGINE_CATALOG.slice(0, 10),
    {
      engine_id: 'EI-19-OutcomeEvaluation',
      contract_version: '0.9.0', // نسخه کهنه
      domain: 'OPTIMIZATION'
    }
  ];

  const reportIncompat = validateEngineCompatibility(mutatedCatalog);
  assert.strictEqual(reportIncompat.all_compatible, false);
  assert.strictEqual(reportIncompat.incompatible_engines.length, 1);
  assert.strictEqual(reportIncompat.incompatible_engines[0].engine_id, 'EI-19-OutcomeEvaluation');

  console.log('  ✅ ممیزی دقیق سازگاری نسخ قراردادهای داده و کشف نسخه‌های کهنه تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
