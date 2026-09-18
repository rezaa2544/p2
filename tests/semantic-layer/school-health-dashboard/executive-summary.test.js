/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/school-health-dashboard/executive-summary.test.js
   -------------------------------------------------------------------
   P0-EI-05: Executive Summary Generation Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { generateExecutiveSummary } = require('../../../server/analytics/school-health-dashboard');

function run() {
  console.log('▸ تست ۵: تولید خلاصه مدیریتی راهبردی (generateExecutiveSummary)');

  const schoolHealth = {
    health_score: 82,
    health_level: 'GOOD',
    dimensions: {
      attendance_health: 90,
      assessment_health: 86,
      learning_health: 75,
      completion_health: 80
    }
  };

  const issues = [
    {
      issue_type: 'COLLECTIVE_LEARNING_DECLINE',
      severity: 'HIGH',
      title: 'افت تحصیلی در درس ریاضی پایه دهم'
    }
  ];

  const actions = [
    {
      action_type: 'CURRICULUM_RECOVERY_MEETING',
      priority: 'HIGH',
      target_role: 'principal',
      title: 'برگزاری جلسه شورای آموزشی'
    }
  ];

  const summary = generateExecutiveSummary({
    schoolHealth,
    issues,
    actions
  });

  assert(summary.strengths.length >= 2, 'باید حداقل دو نقطه قوت استخراج شود');
  assert(summary.risks.length >= 1, 'مخاطرات باید شامل هشدار افت تحصیلی باشد');
  assert.strictEqual(summary.recommended_actions.length, 1);
  assert(typeof summary.generated_at === 'string');

  console.log('  ✅ استخراج نقاط قوت، احصای مخاطرات و ارائه گزارش راهبردی به مدیر');
}

if (require.main === module) run();
module.exports = { run };
