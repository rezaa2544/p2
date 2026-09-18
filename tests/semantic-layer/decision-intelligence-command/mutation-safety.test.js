/**
 * آزمون ۹: آزمون ایمنی در برابر جهش داده‌ها و فریز عمیق اشیا (deepFreeze Mutation Safety)
 */

'use strict';

const assert = require('assert');
const {
  computeDecisionPriorityMatrix,
  transitionDecisionWorkflow,
  generateDecisionCommandBoard,
  validateIntelligenceChainIntegrity,
  buildDecisionCommandSnapshot
} = require('../../../server/analytics/decision-intelligence-command');

function runTests() {
  console.log('▸ تست ۹: آزمون ایمنی در برابر جهش داده‌ها و فریز عمیق اشیا (mutation-safety)');

  const frozenItem = Object.freeze({
    decision_id: 'DEC-FROZEN',
    title: 'تصمیم منجمد',
    workflow_state: 'DETECTED',
    urgency: 'IMMEDIATE_24H',
    evidence_strength: 90,
    evidence_summary: Object.freeze(['شواهد آزمایشی']),
    history: Object.freeze([])
  });

  const matrix = computeDecisionPriorityMatrix([frozenItem]);
  assert.ok(Object.isFrozen(matrix));
  assert.ok(Object.isFrozen(matrix[0]));

  assert.throws(() => {
    matrix[0].priority_score = 999;
  }, /TypeError/);

  const updated = transitionDecisionWorkflow(frozenItem, {
    to_state: 'ANALYZED',
    actor_id: 'usr-01',
    role: 'manager'
  });
  assert.ok(Object.isFrozen(updated));
  assert.ok(Object.isFrozen(updated.history));

  const board = generateDecisionCommandBoard({
    schoolId: 101,
    regionId: 1,
    decisionItems: Object.freeze([frozenItem])
  });
  assert.ok(Object.isFrozen(board));
  assert.ok(Object.isFrozen(board.critical_decisions_pending_review));

  const integrity = validateIntelligenceChainIntegrity(Object.freeze({
    recommendations: Object.freeze([frozenItem])
  }));
  assert.ok(Object.isFrozen(integrity));

  const snapshot = buildDecisionCommandSnapshot({
    schoolId: 101,
    regionId: 1,
    engineOutputs: Object.freeze({ decisions: Object.freeze([frozenItem]) })
  });
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.command_board));
  assert.ok(Object.isFrozen(snapshot.chain_integrity));
  assert.ok(Object.isFrozen(snapshot.priority_matrix_summary));

  console.log('  ✅ ایمنی کامل در برابر جهش غیرمجاز و انجماد عمیق ساختارها تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
