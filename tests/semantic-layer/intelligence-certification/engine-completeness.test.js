/**
 * آزمون ۱: جامعیت و کمال رجیستری ۲۰ موتور هوشمندی (engine-completeness)
 */

'use strict';

const assert = require('assert');
const {
  CANONICAL_PHASE3_CATALOG,
  PHASE3_ENGINE_ID,
  validateEngineCompleteness
} = require('../../../server/analytics/intelligence-release-certification');

function runTests() {
  console.log('▸ تست ۱: جامعیت و کمال رجیستری ۲۰ موتور هوشمندی (engine-completeness)');

  // احراز تعداد کل موتورها
  // D5: کاتالوگ باید ۲۰ موتور را پوشش دهد (۱۲ فاز ۳ + ۸ لایه معنایی که در F-EI-01 یتیم بودند)
  assert.strictEqual(CANONICAL_PHASE3_CATALOG.length, 20, 'باید دقیقاً ۲۰ موتور هوشمندی ثبت شده باشند');

  // احراز تک‌تک ۲۰ شناسه
  const expectedEngineIds = [
    PHASE3_ENGINE_ID.EI_01_SEMANTIC,
    PHASE3_ENGINE_ID.EI_02_STUDENT_TIMELINE,
    PHASE3_ENGINE_ID.EI_03_ASSESSMENT,
    PHASE3_ENGINE_ID.EI_04_ATTENDANCE,
    PHASE3_ENGINE_ID.EI_05_SCHOOL_HEALTH_DASHBOARD,
    PHASE3_ENGINE_ID.EI_06_PARENT_360,
    PHASE3_ENGINE_ID.EI_07_TEACHER_EVIDENCE,
    PHASE3_ENGINE_ID.EI_08_INTERVENTION_CASES,
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
  assert.strictEqual(validation.total_required, 20);
  assert.strictEqual(validation.active_count, 20);
  assert.strictEqual(validation.missing_engines.length, 0);
  // D5: اعتبارسنجی باید اتصال رانتایم واقعی را هم بررسی کرده باشد
  assert.ok(validation.runtime_wiring, 'گزارش باید شامل شاخص‌های اتصال رانتایم باشد');
  assert.strictEqual(validation.runtime_wiring.orphan_count, 0, 'هیچ موتوری نباید یتیم باشد');
  assert.strictEqual(validation.runtime_wiring.dead_active_modules.length, 0, 'هیچ موتور ACTIVE‌ای نباید مرده باشد');

  // سناریوی منفی: کاتالوگ با موتور جاافتاده
  const incompleteCatalog = CANONICAL_PHASE3_CATALOG.filter(e => e.engine_id !== PHASE3_ENGINE_ID.EI_20_PLATFORM_INTEGRATION);
  const incompleteValidation = validateEngineCompleteness(incompleteCatalog);
  assert.strictEqual(incompleteValidation.complete, false);
  assert.strictEqual(incompleteValidation.missing_engines.length, 1);
  assert.strictEqual(incompleteValidation.missing_engines[0], PHASE3_ENGINE_ID.EI_20_PLATFORM_INTEGRATION);

  // D5 — سناریوی منفی چرخشی: کاتالوگ کامل اما بدون مسیر رانتایم → گواهی نباید صادر شود
  const deadValidation = validateEngineCompleteness(CANONICAL_PHASE3_CATALOG, {
    runtimeWiring: { modulesOnDisk: [], wired: new Set(), orphans: [] }
  });
  assert.strictEqual(deadValidation.complete, false, 'موتورهای ACTIVE بدون مسیر رانتایم نباید کامل حساب شوند');
  assert.strictEqual(deadValidation.runtime_wiring.dead_active_modules.length, 20);

  console.log('  ✅ کمال رجیستری و حضور تمامی ۲۰ موتور و اتصال رانتایم آن‌ها با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
