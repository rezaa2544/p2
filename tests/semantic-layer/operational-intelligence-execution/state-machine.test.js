/**
 * آزمون ۲: اعتبارسنجی ماشین وضعیت چرخه حیات و مهار پرش فازی (state-machine)
 */

'use strict';

const assert = require('assert');
const {
  transitionExecutionLifecycle,
  EXECUTION_STATE
} = require('../../../server/analytics/operational-intelligence-execution');

function runTests() {
  console.log('▸ تست ۲: ماشین وضعیت چرخه حیات اجرا (state-machine)');

  let task = {
    task_id: 'TASK-001',
    execution_state: EXECUTION_STATE.TASK_CREATED,
    history: []
  };

  // ۱. ترنزیشن مجاز: TASK_CREATED -> ASSIGNED
  task = transitionExecutionLifecycle(task, {
    to_state: EXECUTION_STATE.ASSIGNED,
    actor_id: 'usr-admin-1',
    role: 'manager',
    note: 'تخصیص به مشاور مدرسه'
  });
  assert.strictEqual(task.execution_state, EXECUTION_STATE.ASSIGNED);
  assert.strictEqual(task.history.length, 1);

  // ۲. ترنزیشن مجاز: ASSIGNED -> IN_PROGRESS
  task = transitionExecutionLifecycle(task, {
    to_state: EXECUTION_STATE.IN_PROGRESS,
    actor_id: 'usr-counselor-1',
    role: 'counselor',
    progress_pct: 25
  });
  assert.strictEqual(task.execution_state, EXECUTION_STATE.IN_PROGRESS);
  assert.strictEqual(task.progress_pct, 25);

  // ۳. ترنزیشن مجاز: IN_PROGRESS -> BLOCKED
  task = transitionExecutionLifecycle(task, {
    to_state: EXECUTION_STATE.BLOCKED,
    actor_id: 'usr-counselor-1',
    role: 'counselor',
    note: 'عدم حضور اولیا در جلسه مشاوره'
  });
  assert.strictEqual(task.execution_state, EXECUTION_STATE.BLOCKED);

  // ۴. ترنزیشن مجاز: BLOCKED -> IN_PROGRESS
  task = transitionExecutionLifecycle(task, {
    to_state: EXECUTION_STATE.IN_PROGRESS,
    actor_id: 'usr-counselor-1',
    role: 'counselor',
    note: 'هماهنگی مجدد و برگزاری جلسه'
  });
  assert.strictEqual(task.execution_state, EXECUTION_STATE.IN_PROGRESS);

  // ۵. ترنزیشن مجاز: IN_PROGRESS -> COMPLETED
  task = transitionExecutionLifecycle(task, {
    to_state: EXECUTION_STATE.COMPLETED,
    actor_id: 'usr-counselor-1',
    role: 'counselor'
  });
  assert.strictEqual(task.execution_state, EXECUTION_STATE.COMPLETED);
  assert.strictEqual(task.progress_pct, 100);

  // ۶. ترنزیشن مجاز: COMPLETED -> OUTCOME_PENDING
  task = transitionExecutionLifecycle(task, {
    to_state: EXECUTION_STATE.OUTCOME_PENDING,
    actor_id: 'usr-admin-1',
    role: 'manager'
  });
  assert.strictEqual(task.execution_state, EXECUTION_STATE.OUTCOME_PENDING);

  // ۷. ترنزیشن مجاز: OUTCOME_PENDING -> REVIEWED
  task = transitionExecutionLifecycle(task, {
    to_state: EXECUTION_STATE.REVIEWED,
    actor_id: 'usr-admin-1',
    role: 'manager'
  });
  assert.strictEqual(task.execution_state, EXECUTION_STATE.REVIEWED);

  // ۸. مهار پرش فازی غیرمجاز (مثلا از REVIEWED به IN_PROGRESS یا مستقیما از TASK_CREATED به COMPLETED)
  assert.throws(() => {
    transitionExecutionLifecycle(task, {
      to_state: EXECUTION_STATE.IN_PROGRESS,
      actor_id: 'usr-admin-1',
      role: 'manager'
    });
  }, /INVALID_EXECUTION_TRANSITION/, 'ترنزیشن غیرمجاز پس از REVIEWED باید بلافاصله سقط شود');

  const invalidTask = { execution_state: EXECUTION_STATE.TASK_CREATED };
  assert.throws(() => {
    transitionExecutionLifecycle(invalidTask, {
      to_state: EXECUTION_STATE.COMPLETED,
      actor_id: 'usr-admin-1',
      role: 'manager'
    });
  }, /INVALID_EXECUTION_TRANSITION/, 'پرش از TASK_CREATED مستقیم به COMPLETED باید مسدود شود');

  console.log('  ✅ صحت عملکرد ماشین وضعیت صلب و مسدودسازی پرش‌های فازی غیرمجاز تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
