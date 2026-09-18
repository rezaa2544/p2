/**
 * آزمون ۷: ساخت تابلوی داشبورد اجرای عملیاتی مدرسه (buildExecutionDashboard)
 */

'use strict';

const assert = require('assert');
const {
  buildExecutionDashboard,
  EXECUTION_STATE
} = require('../../../server/analytics/operational-intelligence-execution');

function runTests() {
  console.log('▸ تست ۷: ساخت تابلوی داشبورد اجرای عملیاتی مدرسه (dashboard-builder)');

  const mockTasks = [
    {
      task_id: 'T1',
      execution_state: EXECUTION_STATE.IN_PROGRESS,
      urgency: 'WEEKLY',
      created_at: '2026-09-18T00:00:00.000Z'
    },
    {
      task_id: 'T2',
      execution_state: EXECUTION_STATE.BLOCKED,
      urgency: 'IMMEDIATE_24H',
      created_at: '2026-09-17T16:00:00.000Z' // ۲۰ ساعت گذشته از ۲۴ ساعت -> AT_RISK
    },
    {
      task_id: 'T3',
      execution_state: EXECUTION_STATE.OUTCOME_PENDING,
      urgency: 'WEEKLY',
      created_at: '2026-09-18T00:00:00.000Z'
    }
  ];

  const dashboard = buildExecutionDashboard({
    schoolId: 101,
    regionId: 1,
    academicYear: '1405-1406',
    tasks: mockTasks,
    options: { timestamp: '2026-09-18T12:00:00.000Z' }
  });

  assert.ok(dashboard);
  assert.strictEqual(dashboard.school_id, 101);
  assert.strictEqual(dashboard.total_tasks, 3);
  assert.strictEqual(dashboard.tasks_by_state.IN_PROGRESS, 1);
  assert.strictEqual(dashboard.tasks_by_state.BLOCKED, 1);
  assert.strictEqual(dashboard.tasks_by_state.OUTCOME_PENDING, 1);

  assert.strictEqual(dashboard.in_progress_tasks.length, 1);
  assert.strictEqual(dashboard.blocked_tasks.length, 1);
  assert.strictEqual(dashboard.outcome_pending_tasks.length, 1);

  assert.ok(dashboard.sla_summary);
  assert.strictEqual(dashboard.sla_summary.on_track_count, 2);
  assert.strictEqual(dashboard.sla_summary.at_risk_count, 1); // ۲۴ ساعته بعد از ۱۲ ساعت (۵۰٪)
  assert.strictEqual(dashboard.automated_decision, false);
  assert.strictEqual(dashboard.automated_execution, false);
  assert.strictEqual(dashboard.requires_human_approval, true);
  assert.strictEqual(dashboard.zero_ranking, true);

  console.log('  ✅ ساخت کامل داشبورد اجرای عملیاتی و تجمیع شاخص‌های اجرایی تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
