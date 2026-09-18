/**
 * آزمون ۱: جامعیت و کمال رجیستری ۱۲ موتور هوشمندی فاز ۳ (engine-completeness)
 */

'use strict';

const assert = require('assert');
const {
  CANONICAL_PHASE3_CATALOG,
  PHASE3_ENGINE_ID,
  validateEngineCompleteness
} = require('../../../server/analytics/intelligence-release-certification');

function runTests() {
  console.log('▸ تست ۱: جامعیت و کمال رجیستری ۱۲ موتور هوشمندی فاز ۳ (engine-completeness)');

  // احراز تعداد کل موتورها
  assert.strictEqual(CANONICAL_PHASE3_CATALOG.length, 12, 'باید دقیقاً ۱۲ موتور هوشمندی آموزشی فاز ۳ ثبت شده باشند');

  // احراز تک‌تک ۱۲ شناسه
  const expectedEngineIds = [
    PHASE3_ENGINE_ID.EI_09_SCHOOL_INTELLIGENCE,
    PHASE3_ENGINE_ID.EI_10_REGIONAL_NETWORK,
    PHASE3_ENGINE_ID.EI_11_QUALITY_GOVERNANCE,
    PHASE3_ENGINE_ID.EI_12_LONGITUDINAL_MONITORING,
    PHASE3_ENGINE_ID.EI_13_ACTION_RECOMMENDATION,
    PHASE3_ENGINE_ID.EI_14_FEEDBACK_MEMORY,
    PHASE3_ENGINE_ID.EI_15_INTELLIGENCE_GOVERNANCE,
    PHASE3_ENGINE_ID.EI_16_POLICY_SIMULATION,
    PHASE3_ENGINE_ID.EI_17_DECISION_COMMAND,
    PHASE3_ENGINE_ID.EI_18_OPERATIONAL_EXECUTION,
    PHASE3_ENGINE_ID.EI_19_OUTCOME_EVALUATION,
    PHASE3_ENGINE_ID.EI_20_PLATFORM_INTEGRATION
  ];

  for (const id of expectedEngineIds) {
    const engine = CANONICAL_PHASE3_CATALOG.find(e => e.engine_id === id);
    assert.ok(engine, `موتور ${id} باید در کاتالوگ رسمی موجود باشد`);
    assert.strictEqual(engine.contract_version, '1.0.0', `نسخه قرارداد ${id} باید 1.0.0 باشد`);
    assert.strictEqual(engine.status, 'ACTIVE', `وضعیت ${id} باید ACTIVE باشد`);
  }

  // اجرای تابع اعتبارسنجی
  const validation = validateEngineCompleteness();
  assert.strictEqual(validation.complete, true, 'اعتبارسنجی باید complete = true بازگرداند');
  assert.strictEqual(validation.total_required, 12);
  assert.strictEqual(validation.active_count, 12);
  assert.strictEqual(validation.missing_engines.length, 0);

  // سناریوی منفی: کاتالوگ با موتور جاافتاده
  const incompleteCatalog = CANONICAL_PHASE3_CATALOG.filter(e => e.engine_id !== PHASE3_ENGINE_ID.EI_20_PLATFORM_INTEGRATION);
  const incompleteValidation = validateEngineCompleteness(incompleteCatalog);
  assert.strictEqual(incompleteValidation.complete, false);
  assert.strictEqual(incompleteValidation.missing_engines.length, 1);
  assert.strictEqual(incompleteValidation.missing_engines[0], PHASE3_ENGINE_ID.EI_20_PLATFORM_INTEGRATION);

  console.log('  ✅ کمال رجیستری و حضور تمامی ۱۲ موتور فاز ۳ با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
