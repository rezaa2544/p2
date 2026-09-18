/**
 * آزمون ۱: رجیستری مرکزی و ثبت تمامی ۱۱ موتور هوشمندی پلتفرم (engine-registry)
 */

'use strict';

const assert = require('assert');
const {
  CANONICAL_ENGINE_CATALOG,
  registerIntelligenceEngine,
  INTELLIGENCE_ENGINE_ID,
  ENGINE_STATUS
} = require('../../../server/analytics/intelligence-platform-integration');

function runTests() {
  console.log('▸ تست ۱: رجیستری مرکزی و ثبت ۱۱ موتور هوشمندی (engine-registry)');

  assert.strictEqual(CANONICAL_ENGINE_CATALOG.length, 11, 'باید دقیقا ۱۱ موتور هوشمندی فاز ۳ تعریف شده باشند');

  // بررسی حضور هر ۱۱ موتور
  const requiredEngineIds = [
    INTELLIGENCE_ENGINE_ID.EI_09_SCHOOL_INTELLIGENCE,
    INTELLIGENCE_ENGINE_ID.EI_10_REGIONAL_NETWORK,
    INTELLIGENCE_ENGINE_ID.EI_11_QUALITY_GOVERNANCE,
    INTELLIGENCE_ENGINE_ID.EI_12_LONGITUDINAL_MONITORING,
    INTELLIGENCE_ENGINE_ID.EI_13_ACTION_RECOMMENDATION,
    INTELLIGENCE_ENGINE_ID.EI_14_FEEDBACK_MEMORY,
    INTELLIGENCE_ENGINE_ID.EI_15_INTELLIGENCE_GOVERNANCE,
    INTELLIGENCE_ENGINE_ID.EI_16_POLICY_SIMULATION,
    INTELLIGENCE_ENGINE_ID.EI_17_DECISION_COMMAND,
    INTELLIGENCE_ENGINE_ID.EI_18_OPERATIONAL_EXECUTION,
    INTELLIGENCE_ENGINE_ID.EI_19_OUTCOME_EVALUATION
  ];

  for (const id of requiredEngineIds) {
    const found = CANONICAL_ENGINE_CATALOG.find(e => e.engine_id === id);
    assert.ok(found, `موتور ${id} باید در کاتالوگ پلتفرم ثبت باشد`);
    assert.strictEqual(found.contract_version, '1.0.0');
    assert.strictEqual(found.status, ENGINE_STATUS.ACTIVE);
  }

  // ثبت موتور سفارشی
  const customEngine = registerIntelligenceEngine({
    engine_id: 'CUSTOM-PILOT-01',
    name: 'موتور پایلوت محلی',
    contract_version: '1.0.0',
    domain: 'ANALYTICS'
  });
  assert.strictEqual(customEngine.engine_id, 'CUSTOM-PILOT-01');
  assert.strictEqual(customEngine.contract_version, '1.0.0');

  console.log('  ✅ ثبت کامل و متمرکز تمامی ۱۱ موتور هوشمندی فاز ۳ با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
