/**
 * آزمون ۳: ماشین چرخه تصمیم انسانی (transitionDecisionWorkflow)
 */

'use strict';

const assert = require('assert');
const {
  transitionDecisionWorkflow,
  DECISION_WORKFLOW_STATE
} = require('../../../server/analytics/decision-intelligence-command');

function runTests() {
  console.log('▸ تست ۳: ماشین چرخه تصمیم انسانی (human-workflow)');

  let item = {
    decision_id: 'DEC-WF-01',
    workflow_state: DECISION_WORKFLOW_STATE.DETECTED,
    history: []
  };

  // گذار ۱: DETECTED -> ANALYZED
  item = transitionDecisionWorkflow(item, { to_state: DECISION_WORKFLOW_STATE.ANALYZED, actor_id: 'usr-01', role: 'manager' });
  assert.strictEqual(item.workflow_state, 'ANALYZED');

  // گذار ۲: ANALYZED -> RECOMMENDED
  item = transitionDecisionWorkflow(item, { to_state: DECISION_WORKFLOW_STATE.RECOMMENDED, actor_id: 'usr-01', role: 'manager' });
  assert.strictEqual(item.workflow_state, 'RECOMMENDED');

  // گذار ۳: RECOMMENDED -> HUMAN_REVIEW_REQUIRED
  item = transitionDecisionWorkflow(item, { to_state: DECISION_WORKFLOW_STATE.HUMAN_REVIEW_REQUIRED, actor_id: 'usr-01', role: 'manager' });
  assert.strictEqual(item.workflow_state, 'HUMAN_REVIEW_REQUIRED');

  // گذار ۴: تصویب انسانی (HUMAN_REVIEW_REQUIRED -> APPROVED_BY_HUMAN)
  item = transitionDecisionWorkflow(item, {
    to_state: DECISION_WORKFLOW_STATE.APPROVED_BY_HUMAN,
    actor_id: 'usr-principal-01',
    role: 'manager',
    notes: 'طرح پس از بررسی شواهد به تصویب رسید.'
  });
  assert.strictEqual(item.workflow_state, 'APPROVED_BY_HUMAN');
  assert.strictEqual(item.assigned_actor_id, 'usr-principal-01');
  assert.strictEqual(item.history.length, 4);

  // آزمون ترنزیشن غیرمجاز (مثلاً پرش از APPROVED به DETECTED)
  assert.throws(() => {
    transitionDecisionWorkflow(item, { to_state: DECISION_WORKFLOW_STATE.DETECTED });
  }, /ILLEGAL_WORKFLOW_TRANSITION/, 'ترنزیشن فازی غیرمجاز باید مسدود شود');

  // آزمون تلاش برای تصویب بدون شناسه کنشگر
  const pendingItem = { decision_id: 'DEC-02', workflow_state: DECISION_WORKFLOW_STATE.HUMAN_REVIEW_REQUIRED };
  assert.throws(() => {
    transitionDecisionWorkflow(pendingItem, { to_state: DECISION_WORKFLOW_STATE.APPROVED_BY_HUMAN, role: 'manager' });
  }, /HUMAN_APPROVAL_ACTOR_REQUIRED/, 'تصویب بدون کنشگر انسانی باید خطا دهد');

  console.log('  ✅ صحت ماشین وضعیت چرخه تصمیم و الزامات تأیید انسانی با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
