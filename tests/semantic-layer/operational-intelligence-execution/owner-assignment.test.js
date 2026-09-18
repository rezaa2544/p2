/**
 * آزمون ۳: تخصیص صریح متولی انسانی به وظایف عملیاتی (assignExecutionOwner)
 */

'use strict';

const assert = require('assert');
const {
  assignExecutionOwner,
  EXECUTION_STATE
} = require('../../../server/analytics/operational-intelligence-execution');

function runTests() {
  console.log('▸ تست ۳: تخصیص متولی انسانی به وظیفه عملیاتی (owner-assignment)');

  const initialTask = {
    task_id: 'TASK-01',
    execution_state: EXECUTION_STATE.TASK_CREATED,
    assigned_to: null,
    history: []
  };

  const assignedTask = assignExecutionOwner(initialTask, {
    actor_id: 105,
    role: 'counselor',
    assigned_at: '2026-09-18T12:00:00.000Z'
  });

  assert.strictEqual(assignedTask.execution_state, EXECUTION_STATE.ASSIGNED);
  assert.ok(assignedTask.assigned_to);
  assert.strictEqual(assignedTask.assigned_to.actor_id, 105);
  assert.strictEqual(assignedTask.assigned_to.role, 'counselor');
  assert.strictEqual(assignedTask.history.length, 1);
  assert.strictEqual(assignedTask.history[0].from_state, EXECUTION_STATE.TASK_CREATED);
  assert.strictEqual(assignedTask.history[0].to_state, EXECUTION_STATE.ASSIGNED);

  // تخصیص مجدد در وضعیت در حال اجرا
  const inProgressTask = {
    ...assignedTask,
    execution_state: EXECUTION_STATE.IN_PROGRESS
  };
  const reassigned = assignExecutionOwner(inProgressTask, {
    actor_id: 109,
    role: 'deputy'
  });
  assert.strictEqual(reassigned.execution_state, EXECUTION_STATE.IN_PROGRESS, 'وضعیت باید IN_PROGRESS باقی بماند');
  assert.strictEqual(reassigned.assigned_to.actor_id, 109);
  assert.strictEqual(reassigned.assigned_to.role, 'deputy');

  console.log('  ✅ صحت انتساب متولی انسانی، انتقال به ASSIGNED و حفظ تاریخچه تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
