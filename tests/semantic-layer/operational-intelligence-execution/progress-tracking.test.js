/**
 * آزمون ۵: سنجش کمّی درصد پیشرفت وظایف عملیاتی (trackExecutionProgress)
 */

'use strict';

const assert = require('assert');
const {
  trackExecutionProgress,
  EXECUTION_STATE
} = require('../../../server/analytics/operational-intelligence-execution');

function runTests() {
  console.log('▸ تست ۵: سنجش کمّی درصد پیشرفت وظایف عملیاتی (progress-tracking)');

  // ۱. حالت بدون وظیفه
  const emptyRes = trackExecutionProgress([]);
  assert.strictEqual(emptyRes.total_tasks, 0);
  assert.strictEqual(emptyRes.overall_progress_pct, 0.0);

  // ۲. ترکیب وظایف در حالات مختلف
  const tasks = [
    { execution_state: EXECUTION_STATE.COMPLETED, progress_pct: 100 },
    { execution_state: EXECUTION_STATE.OUTCOME_PENDING, progress_pct: 100 },
    { execution_state: EXECUTION_STATE.IN_PROGRESS, progress_pct: 50 },
    { execution_state: EXECUTION_STATE.BLOCKED, progress_pct: 20 },
    { execution_state: EXECUTION_STATE.TASK_CREATED, progress_pct: 0 }
  ];

  // میانگین پیشرفت: (100 + 100 + 50 + 20 + 0) / 5 = 270 / 5 = 54.0%
  const progress = trackExecutionProgress(tasks);
  assert.strictEqual(progress.total_tasks, 5);
  assert.strictEqual(progress.completed_tasks, 2);
  assert.strictEqual(progress.in_progress_tasks, 1);
  assert.strictEqual(progress.blocked_tasks, 1);
  assert.strictEqual(progress.overall_progress_pct, 54.0);

  console.log('  ✅ محاسبه دقیق میانگین وزنی پیشرفت عملیاتی و تفکیک دسته‌بندی‌ها تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
