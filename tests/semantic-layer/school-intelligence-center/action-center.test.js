/**
 * آزمون مرکز اقدامات روزانه مدیر (Principal Action Center)
 */

'use strict';

const assert = require('assert');
const { generatePrincipalActionCenter } = require('../../../server/analytics/school-intelligence-center');

function runTest() {
  console.log('▸ تست ۳: مرکز اقدامات روزانه و اولویت‌دار مدیر (generatePrincipalActionCenter)');

  const snapshot = {
    attendance_summary: {
      chronic_absence_rate: 12.5,
      peak_absence_day: 'چهارشنبه'
    },
    academic_summary: {
      at_risk_subjects_count: 2
    },
    assessment_summary: {
      hard_exams_count: 1
    },
    intervention_summary: {
      unassigned_high_priority_count: 3
    },
    parent_summary: {
      unjustified_absences_pending: 8
    },
    teacher_summary: {
      overloaded_teachers_count: 1
    }
  };

  const actions = generatePrincipalActionCenter(snapshot);

  assert.ok(Array.isArray(actions));
  assert.ok(actions.length >= 4, 'Should generate actions across all risk areas');

  // بررسی رتبه اول که باید بحرانی (CRITICAL) با مهلت ۲۴ ساعت باشد
  assert.strictEqual(actions[0].priority, 'CRITICAL');
  assert.strictEqual(actions[0].deadline, '24h');

  // بررسی وجود اقدام پرونده‌های مداخله
  const interventionAction = actions.find(a => a.source === 'INTERVENTION');
  assert.ok(interventionAction);
  assert.strictEqual(interventionAction.priority, 'CRITICAL');
  assert.strictEqual(interventionAction.deadline, '24h');

  // بررسی وجود اقدام غیبت مزمن
  const attendanceAction = actions.find(a => a.source === 'ATTENDANCE');
  assert.ok(attendanceAction);
  assert.strictEqual(attendanceAction.priority, 'CRITICAL');

  // بررسی وجود اقدامات با اولویت HIGH و MEDIUM
  assert.ok(actions.some(a => a.priority === 'HIGH' && a.deadline === '48h'));
  assert.ok(actions.some(a => a.priority === 'MEDIUM'));

  console.log('  ✅ تولید دقیق اقدامات روزانه مدیر، اولویت‌بندی CRITICAL/HIGH/MEDIUM و تعیین مهلت');
}

module.exports = { runTest };
if (require.main === module) runTest();
