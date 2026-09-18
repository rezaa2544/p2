/**
 * آزمون تجمیع پرونده‌های مداخله در سطح مدرسه (SchoolInterventionSummary)
 */

'use strict';

const assert = require('assert');
const { summarizeSchoolInterventions } = require('../../../server/analytics/intervention-case-management');

function runTest() {
  console.log('▸ تست ۵: تجمیع و تحلیل پرونده‌های مدرسه (summarizeSchoolInterventions)');

  const schoolId = 15;
  const cases = [
    { case_id: 'C1', school_id: 15, status: 'OPEN', priority: 'CRITICAL', assigned_to_id: null },
    { case_id: 'C2', school_id: 15, status: 'UNDER_REVIEW', priority: 'HIGH', assigned_to_id: 201 },
    { case_id: 'C3', school_id: 15, status: 'INTERVENTION_ACTIVE', priority: 'HIGH', assigned_to_id: 201 },
    { case_id: 'C4', school_id: 15, status: 'INTERVENTION_ACTIVE', priority: 'MEDIUM', assigned_to_id: 202 },
    { case_id: 'C5', school_id: 15, status: 'EVALUATING', priority: 'HIGH', assigned_to_id: 201 },
    {
      case_id: 'C6',
      school_id: 15,
      status: 'RESOLVED',
      priority: 'HIGH',
      assigned_to_id: 201,
      outcome_assessment: { efficacy_level: 'HIGHLY_EFFECTIVE' }
    }
  ];

  const summary = summarizeSchoolInterventions(cases, { schoolId });

  assert.strictEqual(summary.school_id, 15);
  assert.strictEqual(summary.total_cases, 6);
  assert.strictEqual(summary.active_cases_count, 5); // 1 + 1 + 2 + 1 = 5
  assert.strictEqual(summary.status_breakdown.OPEN, 1);
  assert.strictEqual(summary.status_breakdown.RESOLVED, 1);
  assert.strictEqual(summary.high_priority_unassigned_count, 1); // C1 is OPEN, CRITICAL, and unassigned
  assert.strictEqual(summary.resolution_rate, 16.67); // 1/6 * 100

  console.log('  ✅ صحت آمار تجمیعی پرونده‌ها، تفکیک وضعیت‌ها و نرخ رسیدگی مدرسه');
}

module.exports = { runTest };
if (require.main === module) runTest();
