/**
 * آزمون ۴: به‌روزرسانی حافظه سازمانی بدون افشای شناسه فردی (updateOrganizationalLearningMemory)
 */

'use strict';

const assert = require('assert');
const {
  updateOrganizationalLearningMemory
} = require('../../../server/analytics/outcome-evaluation-optimization');

function runTests() {
  console.log('▸ تست ۴: ثبت تجربه در حافظه سازمانی بدون نشت شناسه فردی (memory-update)');

  const initialMemory = {
    school_id: 101,
    interventions_history: [],
    total_recorded_experiences: 0
  };

  const outcomeRecord = {
    record_id: 'IMP-REC-01',
    task_id: 'TASK-01',
    decision_id: 'DEC-01',
    domain: 'ACADEMIC',
    impact_score: 84.5,
    impact_level: 'EFFECTIVE',
    goal_achievement_pct: 90.0,
    sustainability_score: 82.0,
    student_id: 998877, // نباید به حافظه راه یابد
    teacher_name: 'آقای رضایی' // نباید رتبه‌بندی فردی شود
  };

  const updatedMemory = updateOrganizationalLearningMemory(initialMemory, outcomeRecord, {
    timestamp: '2026-09-18T12:00:00.000Z'
  });

  assert.strictEqual(updatedMemory.total_recorded_experiences, 1);
  assert.strictEqual(updatedMemory.interventions_history.length, 1);
  assert.strictEqual(updatedMemory.zero_ranking, true);

  const entry = updatedMemory.interventions_history[0];
  assert.strictEqual(entry.record_id, 'IMP-REC-01');
  assert.strictEqual(entry.impact_score, 84.5);

  const serialized = JSON.stringify(updatedMemory);
  assert.ok(!serialized.includes('998877'), 'شناسه دانش‌آموز نباید در حافظه سازمانی ثبت شود');
  assert.ok(!serialized.includes('آقای رضایی'), 'نام معلم نباید ثبت شود');

  console.log('  ✅ ثبت ایمن تجارب سازمانی و ممانعت از نشت داده‌های هویتی تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
