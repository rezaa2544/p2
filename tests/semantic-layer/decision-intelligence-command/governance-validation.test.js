/**
 * آزمون ۵: تابلوی ارکستراسیون فرماندهی و هشدارهای حاکمیتی (generateDecisionCommandBoard)
 */

'use strict';

const assert = require('assert');
const {
  generateDecisionCommandBoard,
  DECISION_WORKFLOW_STATE,
  DECISION_URGENCY
} = require('../../../server/analytics/decision-intelligence-command');

function runTests() {
  console.log('▸ تست ۵: تابلوی ارکستراسیون فرماندهی و تفکیک اقدامات (governance-validation)');

  const items = [
    {
      decision_id: 'DEC-01',
      title: 'تصمیم فوری ۲۴ ساعته',
      workflow_state: DECISION_WORKFLOW_STATE.HUMAN_REVIEW_REQUIRED,
      urgency: DECISION_URGENCY.IMMEDIATE_24H,
      human_owner_available: true
    },
    {
      decision_id: 'DEC-02',
      title: 'اقدام مسدود شده بدون متولی',
      workflow_state: DECISION_WORKFLOW_STATE.BLOCKED,
      urgency: DECISION_URGENCY.WEEKLY,
      human_owner_available: false
    },
    {
      decision_id: 'DEC-03',
      title: 'اقدام مصوب آماده اجرا',
      workflow_state: DECISION_WORKFLOW_STATE.APPROVED_BY_HUMAN,
      urgency: DECISION_URGENCY.WEEKLY,
      human_owner_available: true
    }
  ];

  const board = generateDecisionCommandBoard({
    schoolId: 101,
    regionId: 1,
    decisionItems: items,
    governanceWarnings: ['هشدار افت شواهد در آزمون نهم'],
    simulationRefs: [{ sim_id: 'SIM-001' }]
  });

  assert.strictEqual(board.total_decisions_tracked, 3);
  assert.strictEqual(board.critical_decisions_pending_review.length, 1);
  assert.strictEqual(board.blocked_decisions.length, 1);
  assert.strictEqual(board.governance_warnings.length, 1);
  assert.strictEqual(board.policy_simulation_references.length, 1);
  assert.strictEqual(board.zero_ranking, true);

  console.log('  ✅ تفکیک دقیق اقدامات فوری، مسدود، تاییدیه‌ها و هشدارهای حاکمیتی تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
