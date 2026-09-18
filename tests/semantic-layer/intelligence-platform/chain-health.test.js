/**
 * آزمون ۳: ارزیابی سلامت زنجیره یکپارچه تصمیم تا پیامد (chain-health)
 */

'use strict';

const assert = require('assert');
const {
  checkIntelligenceChainHealth,
  PLATFORM_HEALTH_STATUS
} = require('../../../server/analytics/intelligence-platform-integration');

function runTests() {
  console.log('▸ تست ۳: ارزیابی سلامت زنجیره هوشمندی پلتفرم (chain-health)');

  // ۱. زنجیره کامل و سالم
  const healthyOutputs = {
    schoolIntelligence: { score: 85 },
    decisionCommand: { total_decisions: 5 },
    executionDashboard: { total_tasks: 8 },
    outcomeEvaluation: { evaluations_count: 4 },
    zero_ranking: true,
    automated_decision: false
  };

  const health1 = checkIntelligenceChainHealth({ engineOutputs: healthyOutputs });
  assert.strictEqual(health1.chain_status, PLATFORM_HEALTH_STATUS.HEALTHY);
  assert.strictEqual(health1.integrity_checks.zero_ranking_guaranteed, true);
  assert.strictEqual(health1.integrity_checks.human_approval_enforced, true);
  assert.strictEqual(health1.issues_detected.length, 0);

  // ۲. زنجیره با تخلف تصمیم خودکار (CRITICAL)
  const violatedOutputs = {
    ...healthyOutputs,
    automated_decision: true
  };
  const health2 = checkIntelligenceChainHealth({ engineOutputs: violatedOutputs });
  assert.strictEqual(health2.chain_status, PLATFORM_HEALTH_STATUS.CRITICAL);
  assert.strictEqual(health2.integrity_checks.human_approval_enforced, false);
  assert.ok(health2.issues_detected.length > 0);

  // ۳. زنجیره با تخلف رتبه‌بندی (CRITICAL)
  const rankingOutputs = {
    ...healthyOutputs,
    zero_ranking: false
  };
  const health3 = checkIntelligenceChainHealth({ engineOutputs: rankingOutputs });
  assert.strictEqual(health3.chain_status, PLATFORM_HEALTH_STATUS.CRITICAL);
  assert.strictEqual(health3.integrity_checks.zero_ranking_guaranteed, false);

  console.log('  ✅ اعتبارسنجی همگام سلامت گره‌ها، حاکمیت انسانی و منع رتبه‌بندی تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
