/**
 * آزمون ساخت شناسنامه هوشمندی منطقه‌ای (buildRegionalSnapshot)
 */

'use strict';

const assert = require('assert');
const { buildRegionalSnapshot } = require('../../../server/analytics/regional-intelligence-network');

function runTest() {
  console.log('▸ تست ۱: ساخت شناسنامه شبکه بینش منطقه‌ای (buildRegionalSnapshot)');

  const mockSchools = [
    {
      school_id: 10,
      region_id: 1,
      health_index: { status: 'HEALTHY' },
      attendance_summary: { calendar_rate: 94.0, chronic_absence_rate: 5.0, peak_absence_day: 'wednesday' },
      academic_summary: { average_gpa: 16.5, at_risk_subjects_count: 0 },
      assessment_summary: { total_exams_analyzed: 10, hard_exams_count: 0 },
      intervention_summary: { active_cases_count: 4, unassigned_high_priority_count: 0, resolution_rate: 80.0 },
      teacher_summary: { overloaded_teachers_count: 0 },
      risk_summary: { critical_count: 0, high_count: 1, medium_count: 2 }
    },
    {
      school_id: 20,
      region_id: 1,
      health_index: { status: 'NEEDS_IMMEDIATE_ACTION' },
      attendance_summary: { calendar_rate: 82.0, chronic_absence_rate: 16.0, peak_absence_day: 'wednesday' },
      academic_summary: { average_gpa: 12.0, at_risk_subjects_count: 2 },
      assessment_summary: { total_exams_analyzed: 8, hard_exams_count: 2 },
      intervention_summary: { active_cases_count: 12, unassigned_high_priority_count: 2, resolution_rate: 40.0 },
      teacher_summary: { overloaded_teachers_count: 1 },
      risk_summary: { critical_count: 1, high_count: 2, medium_count: 1 }
    }
  ];

  const snapshot = buildRegionalSnapshot({
    regionId: 1,
    academicYear: '1405-1406',
    schools: mockSchools
  });

  assert.strictEqual(snapshot.region_id, 1);
  assert.strictEqual(snapshot.academic_year, '1405-1406');
  assert.strictEqual(snapshot.school_count, 2);
  assert.strictEqual(snapshot.educational_health_summary.total_schools, 2);
  assert.strictEqual(snapshot.educational_health_summary.healthy_schools_count, 1);
  assert.strictEqual(snapshot.educational_health_summary.needs_immediate_action_count, 1);
  assert.strictEqual(snapshot.educational_health_summary.average_attendance_rate, 88.0); // (94 + 82) / 2
  assert.strictEqual(snapshot.educational_health_summary.average_gpa, 14.25); // (16.5 + 12.0) / 2
  assert.strictEqual(snapshot.risk_distribution.critical_schools_count, 1);
  assert.strictEqual(snapshot.intervention_summary.total_active_cases, 16);
  assert.strictEqual(snapshot.intervention_summary.unassigned_high_priority_cases, 2);
  assert.strictEqual(snapshot.attendance_patterns.peak_absence_day, 'wednesday');
  assert.ok(snapshot.resource_needs.length > 0);
  assert.ok(snapshot.action_recommendations.length > 0);

  console.log('  ✅ صحت ساخت شناسنامه منطقه‌ای و تجمیع داده‌های چندمدرسه‌ای');
}

module.exports = { runTest };
if (require.main === module) runTest();
