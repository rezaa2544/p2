/**
 * آزمون ۲: ماتریس اولویت‌بندی عینی تصمیم (computeDecisionPriorityMatrix)
 */

'use strict';

const assert = require('assert');
const {
  computeDecisionPriorityMatrix,
  DECISION_URGENCY
} = require('../../../server/analytics/decision-intelligence-command');

function runTests() {
  console.log('▸ تست ۲: ماتریس اولویت‌بندی تصمیم (priority-matrix)');

  // فرمول: 0.30 U + 0.25 E + 0.20 S + 0.15 R + 0.10 O
  // قلم ۱: فوریت ۲۴ ساعته (U=100)، شواهد کامل (E=100)، دامنه وسیع (S=80)، آمادگی کامل (R=100)، متولی دارد (O=100)
  // 0.30 * 100 + 0.25 * 100 + 0.20 * 80 + 0.15 * 100 + 0.10 * 100 = 30 + 25 + 16 + 15 + 10 = 96.0
  const item1 = {
    decision_id: 'DEC-CRIT',
    title: 'اقدام فوری',
    urgency: DECISION_URGENCY.IMMEDIATE_24H,
    evidence_strength: 100,
    affected_scope: 80,
    intervention_readiness: 100,
    human_owner_available: true
  };

  // قلم ۲: فوریت هفتگی (U=50)، شواهد متوسط (E=60)، دامنه محدود (S=40)، آمادگی متوسط (R=60)، متولی ندارد (O=0)
  // 0.30 * 50 + 0.25 * 60 + 0.20 * 40 + 0.15 * 60 + 0.10 * 0 = 15 + 15 + 8 + 9 + 0 = 47.0
  const item2 = {
    decision_id: 'DEC-LOW',
    title: 'اقدام عادی',
    urgency: DECISION_URGENCY.WEEKLY,
    evidence_strength: 60,
    affected_scope: 40,
    intervention_readiness: 60,
    human_owner_available: false
  };

  const prioritized = computeDecisionPriorityMatrix([item2, item1]);

  assert.strictEqual(prioritized.length, 2);
  assert.strictEqual(prioritized[0].decision_id, 'DEC-CRIT', 'تصمیم با اولویت بالاتر باید اول باشد');
  assert.strictEqual(prioritized[0].priority_score, 96.0);
  assert.strictEqual(prioritized[1].decision_id, 'DEC-LOW');
  assert.strictEqual(prioritized[1].priority_score, 47.0);

  console.log('  ✅ محاسبه فرمول پنج‌عامله ماتریس اولویت و مرتب‌سازی قطعی تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
