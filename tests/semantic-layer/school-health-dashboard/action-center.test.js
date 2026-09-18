/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/school-health-dashboard/action-center.test.js
   -------------------------------------------------------------------
   P0-EI-05: Daily Action Center Generation & Prioritization Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { generateDailyActionCenter } = require('../../../server/analytics/school-health-dashboard');

function run() {
  console.log('▸ تست ۳: مرکز تصمیم‌گیری و اقدامات روزانه مدیران (generateDailyActionCenter)');

  const mockIssues = [
    {
      issue_type: 'COLLECTIVE_LEARNING_DECLINE',
      severity: 'HIGH',
      title: 'افت جمعی روند پیشرفت یادگیری',
      evidence: ['۵ دانش‌آموز دارای شیب نزولی نمرات هستند'],
      affected_count: 5
    },
    {
      issue_type: 'CHRONIC_ABSENCE_SURGE',
      severity: 'CRITICAL',
      title: 'طغیان غیبت مزمن',
      evidence: ['۱۰ دانش‌آموز غایب مزمن شناسایی شدند'],
      affected_count: 10
    },
    {
      issue_type: 'ASSESSMENT_QUALITY_DEGRADATION',
      severity: 'HIGH',
      title: 'کیفیت پایین آزمون‌ها',
      evidence: ['۲ آزمون فاقد پایایی استاندارد هستند'],
      affected_count: 2
    }
  ];

  const actions = generateDailyActionCenter({ issues: mockIssues });

  assert.strictEqual(actions.length, 3, 'باید دقیقاً ۳ اقدام متناظر با ۳ مسأله تولید شود');

  // بررسی اولویت‌بندی قطعی: اولین اقدام باید CRITICAL باشد
  assert.strictEqual(actions[0].priority, 'CRITICAL');
  assert.strictEqual(actions[0].action_type, 'CHRONIC_ABSENCE_INTERVENTION');
  assert.strictEqual(actions[0].target_role, 'vice_principal');
  assert.strictEqual(actions[0].deadline, 'IMMEDIATE');

  // بررسی انتساب به مدیر برای افت یادگیری
  const principalAction = actions.find(a => a.target_role === 'principal');
  assert(principalAction != null);
  assert.strictEqual(principalAction.action_type, 'CURRICULUM_RECOVERY_MEETING');
  assert.strictEqual(principalAction.deadline, 'WITHIN_48_HOURS');

  // بررسی انتساب به معلم برای آزمون‌ها
  const teacherAction = actions.find(a => a.target_role === 'teacher');
  assert(teacherAction != null);
  assert.strictEqual(teacherAction.action_type, 'TEACHER_ASSESSMENT_WORKSHOP');

  console.log('  ✅ تفکیک وظایف بر مبنای نقش، تعیین مهلت‌های زمانی و اولویت‌بندی قطعی اقدامات');
}

if (require.main === module) run();
module.exports = { run };
