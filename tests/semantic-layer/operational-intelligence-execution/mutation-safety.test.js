/**
 * آزمون ۱۱: ایمنی در برابر جهش داده‌ها و فریز عمیق اشیا (deepFreeze Mutation Safety)
 */

'use strict';

const assert = require('assert');
const {
  createExecutionWorkflow,
  assignExecutionOwner,
  transitionExecutionLifecycle,
  calculateExecutionSLA,
  trackExecutionProgress,
  detectExecutionBlockers,
  buildExecutionDashboard
} = require('../../../server/analytics/operational-intelligence-execution');

function runTests() {
  console.log('▸ تست ۱۱: آزمون ایمنی در برابر جهش داده‌ها و فریز عمیق اشیا (mutation-safety)');

  const frozenDecision = Object.freeze({
    decision_id: 'DEC-FROZEN',
    title: Object.freeze('تصمیم منجمد'),
    domain: 'ACADEMIC',
    urgency: 'WEEKLY',
    assigned_role: 'manager'
  });

  const workflow = createExecutionWorkflow({
    schoolId: 101,
    regionId: 1,
    approvedDecision: frozenDecision
  });

  assert.ok(Object.isFrozen(workflow));
  assert.ok(Object.isFrozen(workflow.tasks));
  assert.ok(Object.isFrozen(workflow.tasks[0]));

  assert.throws(() => {
    workflow.tasks[0].title = 'عنوان دستکاری شده';
  }, /TypeError/);

  const assigned = assignExecutionOwner(workflow.tasks[0], {
    actor_id: 'usr-99',
    role: 'counselor'
  });
  assert.ok(Object.isFrozen(assigned));
  assert.ok(Object.isFrozen(assigned.assigned_to));

  const transitioned = transitionExecutionLifecycle(workflow.tasks[0], {
    to_state: 'IN_PROGRESS',
    actor_id: 'usr-99',
    role: 'counselor'
  });
  assert.ok(Object.isFrozen(transitioned));
  assert.ok(Object.isFrozen(transitioned.history));

  const sla = calculateExecutionSLA(workflow.tasks[0]);
  assert.ok(Object.isFrozen(sla));

  const progress = trackExecutionProgress(workflow.tasks);
  assert.ok(Object.isFrozen(progress));

  const blockers = detectExecutionBlockers(workflow.tasks);
  assert.ok(Object.isFrozen(blockers));

  const dashboard = buildExecutionDashboard({
    schoolId: 101,
    regionId: 1,
    workflows: [workflow]
  });
  assert.ok(Object.isFrozen(dashboard));
  assert.ok(Object.isFrozen(dashboard.tasks_by_state));
  assert.ok(Object.isFrozen(dashboard.sla_summary));

  console.log('  ✅ ایمنی کامل در برابر جهش غیرمجاز و انجماد عمیق ساختارها تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
