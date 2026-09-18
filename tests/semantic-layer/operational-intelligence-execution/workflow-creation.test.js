/**
 * آزمون ۱: ایجاد گردش‌کار اجرایی بر مبنای تصمیم مصوب انسانی (createExecutionWorkflow)
 */

'use strict';

const assert = require('assert');
const {
  createExecutionWorkflow,
  EXECUTION_STATE
} = require('../../../server/analytics/operational-intelligence-execution');

function runTests() {
  console.log('▸ تست ۱: ایجاد گردش‌کار اجرایی و وظایف عملیاتی (workflow-creation)');

  const approvedDecision = {
    decision_id: 'DEC-SCH101-01',
    title: 'برگزاری کارگاه روش‌های سنجش تکوینی برای معلمان',
    domain: 'TEACHING',
    urgency: 'WEEKLY',
    assigned_role: 'manager'
  };

  const workflow = createExecutionWorkflow({
    schoolId: 101,
    regionId: 1,
    approvedDecision
  });

  assert.ok(workflow);
  assert.strictEqual(workflow.school_id, 101);
  assert.strictEqual(workflow.decision_id, 'DEC-SCH101-01');
  assert.strictEqual(workflow.state, EXECUTION_STATE.TASK_CREATED);
  assert.strictEqual(workflow.automated_decision, false, 'تصمیم‌گیری خودکار باید قطعا منتفی باشد');
  assert.strictEqual(workflow.automated_execution, false, 'اجرای خودکار بدون مداخله انسانی ممنوع است');
  assert.strictEqual(workflow.requires_human_approval, true, 'تأیید انسانی الزامی است');
  assert.strictEqual(workflow.zero_ranking, true, 'منع رتبه‌بندی باید فعال باشد');

  assert.ok(Array.isArray(workflow.tasks));
  assert.strictEqual(workflow.tasks.length, 1);
  const task = workflow.tasks[0];
  assert.strictEqual(task.decision_id, 'DEC-SCH101-01');
  assert.strictEqual(task.execution_state, EXECUTION_STATE.ASSIGNED);
  assert.ok(task.assigned_to);
  assert.strictEqual(task.assigned_to.role, 'manager');
  assert.ok(task.sla);
  assert.strictEqual(task.sla.status, 'ON_TRACK');

  console.log('  ✅ ایجاد ساختاریافته گردش‌کار و پاسداری از حاکمیت انسانی تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
