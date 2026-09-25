/**
 * آزمون ۶: دروازه‌های کیفیت مستندات و همگامی دیسک (documentation-gates)
 */

'use strict';

const assert = require('assert');
const { validateQualityGateStatus } = require('../../../server/analytics/intelligence-release-certification');

function runTests() {
  console.log('▸ تست ۶: دروازه‌های کیفیت مستندات و همگامی دیسک (documentation-gates)');

  /* A-31 / I-09: بدونِ شاهدِ اجرا، هیچ گیتی «اجرا شده» تلقی نمی‌شود. */
  const noEvidence = validateQualityGateStatus();
  assert.strictEqual(noEvidence.total_gates, 8, 'باید دقیقاً ۸ دروازه کیفیت تعریف شده باشد');
  assert.strictEqual(noEvidence.all_passed, false, 'بدون شاهد اجرا، همه پاس ادعا نمی‌شود');
  assert.strictEqual(noEvidence.passed_gates, 0, 'بدون شاهد، گیتی پاس نیست');
  assert.strictEqual(noEvidence.not_run_gates, 8, 'بدون شاهد، همه گیت‌ها اجرا‌نشده‌اند');

  const ALL_PASSED_EVIDENCE = {};
  for (const key of ['semantic_tests', 'api_tests', 'master_regression', 'build_parity',
    'authorization_parity', 'secret_scan', 'docs_stats_sync', 'docs_consistency']) {
    ALL_PASSED_EVIDENCE[key] = { status: 'PASSED', ran_at: '2026-09-18T12:00:00.000Z' };
  }
  const qualityStatus = validateQualityGateStatus({ gateResults: ALL_PASSED_EVIDENCE });

  assert.strictEqual(qualityStatus.total_gates, 8, 'باید دقیقاً ۸ دروازه کیفیت تعریف شده باشد');
  assert.strictEqual(qualityStatus.all_passed, true, 'با شاهد اجرا، تمامی ۸ دروازه کیفی تایید می‌شوند');
  assert.strictEqual(qualityStatus.passed_gates, 8, 'با شاهد کامل، ۸ از ۸ گیت پاس است');
  assert.strictEqual(qualityStatus.evidence_source, 'PROVIDED', 'منبع شاهد باید مشخص باشد');

  const gate = qualityStatus.gate_details;
  assert.strictEqual(Object.keys(gate).length, 8, 'باید هر ۸ گیت در جزئیات وجود داشته باشند');
  for (const g of Object.values(gate)) {
    assert.ok(g.id, 'شناسه گیت باید داشته باشد');
    assert.ok(g.name, 'نام گیت باید داشته باشد');
    assert.ok(g.target, 'هدف اجرای گیت باید داشته باشد');
    assert.strictEqual(g.status, 'PASSED', 'با شاهد کامل همه گیت‌ها پاس هستند');
  }

  /* شاهد ناقص ⇒ گیت‌های فاقد شاهد اجرا‌نشده باقی می‌مانند */
  const partial = validateQualityGateStatus({ gateResults: { semantic_tests: { status: 'PASSED' } } });
  assert.strictEqual(partial.passed_gates, 1, 'فقط گیت دارای شاهد پاس می‌شود');
  assert.strictEqual(partial.all_passed, false, 'با شاهد ناقص، همه پاس نیست');
  assert.strictEqual(partial.not_run_gates, 7, 'هفت گیت فاقد شاهد اجرا‌نشده‌اند');

  console.log('  ✅ دروازه‌های کیفیت مستندات (۸/۸) با شاهد اجرا معتبر و بدون شاهد اجرا‌نشده ارزیابی شدند');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
