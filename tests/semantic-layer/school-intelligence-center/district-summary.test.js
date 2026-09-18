/**
 * آزمون تجمیع منطقه‌ای مدارس (generateDistrictAggregation)
 */

'use strict';

const assert = require('assert');
const { generateDistrictAggregation } = require('../../../server/analytics/school-intelligence-center');

function runTest() {
  console.log('▸ تست ۴: تجمیع اطلاعات منطقه‌ای مدارس (generateDistrictAggregation)');

  const mockSchools = [
    {
      school_id: 1,
      health_index: { status: 'HEALTHY' },
      attendance_summary: { calendar_rate: 94.0, chronic_absence_rate: 4.0 },
      intervention_summary: { active_cases_count: 5 },
      risk_summary: { top_risks: [{ priority: 'HIGH', description: 'افت نمرات در آزمون مستمر' }] }
    },
    {
      school_id: 2,
      health_index: { status: 'NEEDS_MONITORING' },
      attendance_summary: { calendar_rate: 88.0, chronic_absence_rate: 9.0 },
      intervention_summary: { active_cases_count: 12 },
      risk_summary: { top_risks: [{ priority: 'CRITICAL', description: 'غیبت‌های متوالی' }] }
    },
    {
      school_id: 3,
      health_index: { status: 'NEEDS_IMMEDIATE_ACTION' },
      attendance_summary: { calendar_rate: 82.0, chronic_absence_rate: 15.0 },
      intervention_summary: { active_cases_count: 8 },
      risk_summary: { top_risks: [{ priority: 'CRITICAL', description: 'غیبت‌های متوالی' }] }
    }
  ];

  const district = generateDistrictAggregation(mockSchools, { districtId: 101 });

  assert.strictEqual(district.district_id, 101);
  assert.strictEqual(district.total_schools, 3);
  assert.strictEqual(district.health_distribution.HEALTHY, 1);
  assert.strictEqual(district.health_distribution.NEEDS_MONITORING, 1);
  assert.strictEqual(district.health_distribution.NEEDS_IMMEDIATE_ACTION, 1);
  assert.strictEqual(district.overall_average_attendance, 88.0); // (94 + 88 + 82) / 3 = 88.0
  assert.strictEqual(district.district_chronic_absence_rate, 9.33); // (4 + 9 + 15) / 3 = 28 / 3 = 9.33
  assert.strictEqual(district.total_active_interventions, 25); // 5 + 12 + 8
  assert.ok(district.common_critical_issues.includes('غیبت‌های متوالی'));

  console.log('  ✅ صحت تجمیع شاخص‌های سلامت، نرخ‌های حضور و احصای نیازهای منطقه‌ای');
}

module.exports = { runTest };
if (require.main === module) runTest();
