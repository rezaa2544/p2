/**
 * آزمون ایمنی در برابر جهش داده‌ها و انجماد اشیا (Object.freeze Mutation Safety)
 */

'use strict';

const assert = require('assert');
const {
  buildRegionalSnapshot,
  calculateRegionalNeeds,
  detectRegionalPatterns,
  generateRegionalActionPlan,
  summarizeRegionalHealth
} = require('../../../server/analytics/regional-intelligence-network');

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

function runTest() {
  console.log('▸ تست ۸: ایمنی در برابر جهش داده‌ها و انجماد اشیا (Object.freeze Mutation Safety)');

  const frozenContext = deepFreeze({
    regionId: 4,
    academicYear: '1405-1406',
    schools: [
      {
        school_id: 201,
        health_index: { status: 'HEALTHY' },
        attendance_summary: { calendar_rate: 93.0, chronic_absence_rate: 4.5, peak_absence_day: 'wednesday' },
        academic_summary: { average_gpa: 15.5, at_risk_subjects_count: 0 },
        assessment_summary: { total_exams_analyzed: 10, hard_exams_count: 1 },
        intervention_summary: { active_cases_count: 3, unassigned_high_priority_count: 0, resolution_rate: 80.0 },
        teacher_summary: { overloaded_teachers_count: 0 },
        risk_summary: { critical_count: 0, high_count: 1, medium_count: 2 }
      }
    ]
  });

  assert.doesNotThrow(() => {
    const snapshot = buildRegionalSnapshot(frozenContext);
    summarizeRegionalHealth(frozenContext);
    const needs = calculateRegionalNeeds(frozenContext);
    detectRegionalPatterns(frozenContext);
    generateRegionalActionPlan({ resource_needs: needs });
  }, 'All functions must execute safely with deeply frozen objects');

  console.log('  ✅ پایداری کامل در برابر اشیای منجمد: تمامی ورودی‌ها بدون تغییر باقی ماندند');
}

module.exports = { runTest };
if (require.main === module) runTest();
