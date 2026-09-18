/**
 * آزمون ۴: اعتبارسنجی پیوستگی زنجیره هوشمندی (validateIntelligenceChainIntegrity)
 */

'use strict';

const assert = require('assert');
const {
  validateIntelligenceChainIntegrity,
  INTELLIGENCE_INTEGRITY_STATUS
} = require('../../../server/analytics/decision-intelligence-command');

function runTests() {
  console.log('▸ تست ۴: اعتبارسنجی پیوستگی زنجیره هوشمندی (chain-integrity)');

  // حالت ۱: زنجیره معتبر و کامل
  const validData = {
    recommendations: [
      { recommendation_id: 'REC-01', evidence_strength: 90, evidence_summary: ['افت نمرات'] }
    ],
    actions: [
      { action_id: 'ACT-01', automated_decision: false, requires_human_approval: true }
    ],
    auditTrail: [{ event_id: 'AUD-01' }]
  };

  const resValid = validateIntelligenceChainIntegrity(validData);
  assert.strictEqual(resValid.integrity_status, INTELLIGENCE_INTEGRITY_STATUS.VALID);
  assert.strictEqual(resValid.checks_passed, 4);
  assert.strictEqual(resValid.issues.length, 0);

  // حالت ۲: زنجیره معیوب با تصمیم خودکار (نقض سیاست)
  const invalidData = {
    recommendations: [
      { recommendation_id: 'REC-01' } // فاقد شواهد
    ],
    actions: [
      { action_id: 'ACT-ROGUE', automated_decision: true } // تصمیم خودکار
    ],
    auditTrail: []
  };

  const resInvalid = validateIntelligenceChainIntegrity(invalidData);
  assert.strictEqual(resInvalid.integrity_status, INTELLIGENCE_INTEGRITY_STATUS.VIOLATION);
  assert.ok(resInvalid.issues.length >= 2);

  console.log('  ✅ اعتبارسنجی دقیق پیوستگی شواهد و مهار نشت تصمیم خودکار تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
