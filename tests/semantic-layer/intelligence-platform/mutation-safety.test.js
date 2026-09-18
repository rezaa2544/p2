/**
 * آزمون ۷: ایمنی در برابر جهش داده‌ها و فریز عمیق اشیا (mutation-safety)
 */

'use strict';

const assert = require('assert');
const {
  registerIntelligenceEngine,
  validateEngineCompatibility,
  checkIntelligenceChainHealth,
  buildUnifiedIntelligenceSnapshot,
  generatePlatformHealthReport
} = require('../../../server/analytics/intelligence-platform-integration');

function runTests() {
  console.log('▸ تست ۷: آزمون ایمنی در برابر جهش داده‌ها و فریز عمیق اشیا (mutation-safety)');

  const frozenEngineDef = Object.freeze({
    engine_id: 'CUSTOM-FRZ-01',
    name: 'موتور منجمد',
    contract_version: '1.0.0',
    dependencies: Object.freeze(['DEP-01'])
  });

  const registered = registerIntelligenceEngine(frozenEngineDef);
  assert.ok(Object.isFrozen(registered));
  assert.ok(Object.isFrozen(registered.dependencies));

  assert.throws(() => {
    registered.contract_version = '2.0.0';
  }, /TypeError/);

  const compat = validateEngineCompatibility();
  assert.ok(Object.isFrozen(compat));
  assert.ok(Object.isFrozen(compat.contract_version_matrix));

  const chain = checkIntelligenceChainHealth();
  assert.ok(Object.isFrozen(chain));
  assert.ok(Object.isFrozen(chain.nodes));

  const snapshot = buildUnifiedIntelligenceSnapshot({ schoolId: 101, regionId: 1 });
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.engine_catalog));
  assert.ok(Object.isFrozen(snapshot.summary_metrics));

  const healthReport = generatePlatformHealthReport({ schoolId: 101, regionId: 1 });
  assert.ok(Object.isFrozen(healthReport));

  console.log('  ✅ ایمنی کامل در برابر جهش غیرمجاز و انجماد عمیق ساختارها تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
