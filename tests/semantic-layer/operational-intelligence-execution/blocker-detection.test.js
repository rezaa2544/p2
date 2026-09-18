/**
 * آزمون ۶: کشف و طبقه‌بندی شدت موانع اجرایی (detectExecutionBlockers)
 */

'use strict';

const assert = require('assert');
const {
  detectExecutionBlockers,
  EXECUTION_STATE,
  BLOCKER_SEVERITY
} = require('../../../server/analytics/operational-intelligence-execution');

function runTests() {
  console.log('▸ تست ۶: کشف و طبقه‌بندی شدت موانع اجرایی (blocker-detection)');

  const tasks = [
    // مانع ۱: وظیفه با وضعیت صریح مسدود
    {
      task_id: 'TASK-BLK-01',
      execution_state: EXECUTION_STATE.BLOCKED,
      blocker_note: 'عدم تخصیص بودجه تجهیز کارگاه'
    },
    // مانع ۲: نقض شدید SLA (بیش از ۴۸ ساعت تاخیر -> CRITICAL)
    {
      task_id: 'TASK-SLA-CRIT',
      execution_state: EXECUTION_STATE.IN_PROGRESS,
      urgency: 'IMMEDIATE_24H',
      created_at: '2026-09-15T00:00:00.000Z' // ۳ روز پیش (بیش از ۴۸ ساعت تاخیر در وظیفه ۲۴ ساعته)
    },
    // مانع ۳: وظیفه بدون متولی در وضعیت ایجاد اولیه
    {
      task_id: 'TASK-UNASSIGNED',
      execution_state: EXECUTION_STATE.TASK_CREATED,
      assigned_to: null,
      created_at: '2026-09-18T10:00:00.000Z'
    },
    // وظیفه عادی و سالم
    {
      task_id: 'TASK-OK',
      execution_state: EXECUTION_STATE.IN_PROGRESS,
      assigned_to: { actor_id: 1, role: 'manager' },
      urgency: 'MONTHLY',
      created_at: '2026-09-18T10:00:00.000Z'
    }
  ];

  const blockers = detectExecutionBlockers(tasks, { timestamp: '2026-09-18T12:00:00.000Z' });

  assert.strictEqual(blockers.length, 3);
  const crit = blockers.find(b => b.severity === BLOCKER_SEVERITY.CRITICAL);
  assert.ok(crit, 'مانع بحرانی باید کشف شود');
  assert.strictEqual(crit.task_id, 'TASK-SLA-CRIT');
  assert.strictEqual(crit.type, 'SLA_BREACH_BLOCKER');

  const manual = blockers.find(b => b.type === 'MANUAL_BLOCKER');
  assert.ok(manual);
  assert.strictEqual(manual.task_id, 'TASK-BLK-01');
  assert.strictEqual(manual.severity, BLOCKER_SEVERITY.HIGH);

  const unassigned = blockers.find(b => b.type === 'UNASSIGNED_TASK_BLOCKER');
  assert.ok(unassigned);
  assert.strictEqual(unassigned.task_id, 'TASK-UNASSIGNED');
  assert.strictEqual(unassigned.severity, BLOCKER_SEVERITY.MEDIUM);

  console.log('  ✅ کشف چندسطحی موانع اجرایی و تعیین دقیق سطوح بحرانیت با موفقیت تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
