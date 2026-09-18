/**
 * آزمون ۸: آزمون قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت در ۱۰ اجرای متوالی
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
  console.log('▸ تست ۸: آزمون قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت (deterministic)');

  const mockItem = {
    decision_id: 'DEC-DET-01',
    title: 'تصمیم آزمایشی',
    workflow_state: 'DETECTED',
    urgency: 'IMMEDIATE_24H',
    evidence_strength: 90,
    affected_scope: 60,
    intervention_readiness: 80,
    human_owner_available: true
  };

  let firstMatrix = null;
  let firstTransition = null;
  let firstBoard = null;
  let firstIntegrity = null;
  let firstSnapshot = null;

  for (let i = 0; i < 10; i++) {
    const matrix = computeDecisionPriorityMatrix([mockItem], { timestamp: '2026-09-18T12:00:00.000Z' });

    const transition = transitionDecisionWorkflow(mockItem, {
      to_state: 'ANALYZED',
      actor_id: 'usr-01',
      role: 'manager'
    }, { timestamp: '2026-09-18T12:00:00.000Z' });

    const board = generateDecisionCommandBoard({
      schoolId: 101,
      regionId: 1,
      decisionItems: [mockItem],
      options: { timestamp: '2026-09-18T12:00:00.000Z' }
    });

    const integrity = validateIntelligenceChainIntegrity({
      recommendations: [mockItem],
      actions: [mockItem]
    }, { timestamp: '2026-09-18T12:00:00.000Z' });

    const snapshot = buildDecisionCommandSnapshot({
      schoolId: 101,
      regionId: 1,
      options: { timestamp: '2026-09-18T12:00:00.000Z' }
    });

    const sMatrix = JSON.stringify(matrix);
    const sTransition = JSON.stringify(transition);
    const sBoard = JSON.stringify(board);
    const sIntegrity = JSON.stringify(integrity);
    const sSnapshot = JSON.stringify(snapshot);

    if (i === 0) {
      firstMatrix = sMatrix;
      firstTransition = sTransition;
      firstBoard = sBoard;
      firstIntegrity = sIntegrity;
      firstSnapshot = sSnapshot;
    } else {
      assert.strictEqual(sMatrix, firstMatrix, `عدم تطابق قطعیت در computeDecisionPriorityMatrix در تکرار ${i}`);
      assert.strictEqual(sTransition, firstTransition, `عدم تطابق قطعیت در transitionDecisionWorkflow در تکرار ${i}`);
      assert.strictEqual(sBoard, firstBoard, `عدم تطابق قطعیت در generateDecisionCommandBoard در تکرار ${i}`);
      assert.strictEqual(sIntegrity, firstIntegrity, `عدم تطابق قطعیت در validateIntelligenceChainIntegrity در تکرار ${i}`);
      assert.strictEqual(sSnapshot, firstSnapshot, `عدم تطابق قطعیت در buildDecisionCommandSnapshot در تکرار ${i}`);
    }
  }

  console.log('  ✅ قطعیت جبری ۱۰۰٪ و برابری باینری تمامی محاسبات در ۱۰ تکرار متوالی اثبات شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
